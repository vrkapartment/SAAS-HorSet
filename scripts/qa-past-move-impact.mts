/**
 * ตรวจย้อนหลัง: เหตุการณ์ "ย้าย" ที่เกิดไปแล้ว ทิ้งร่องรอยเก็บเงินขาด/ซ้ำไว้หรือไม่
 *
 * ใช้: npm run qa:move-impact
 *
 * ⚠️ อ่านฐานข้อมูลอย่างเดียว ไม่เขียนอะไร และไม่พิมพ์ข้อมูลส่วนบุคคล (ชื่อ/เบอร์ผู้เช่า)
 *
 * ทำไมต้องมี: การแก้โค้ดกันไม่ให้เกิดใหม่ ไม่ได้แก้ใบที่ออกไปแล้ว สคริปต์นี้ตอบคำถาม
 * "มีเงินค้างเก็บอยู่จริงไหม" ซึ่งเป็นคำถามคนละข้อกับ "โค้ดถูกแล้วไหม"
 *
 * ตรวจ 3 อย่างที่มาจากบั๊กที่ปิดไปใน database_patch_move_segments.sql:
 *   1. ห้องที่ถูกย้ายออก — รอบถัดไปมีเลขตั้งต้นถูกไหม
 *      (เส้นทางย้ายห้องเดิมไม่เคยส่งเลขปิดไปรอบถัดไป ผู้เช่ารายใหม่จึงเริ่มนับจาก 0)
 *   2. ห้องที่มีสัญญายกเลิก แล้วมีบิลของห้องเดียวกันในรอบเดียวกัน
 *      (ผู้เช่าใหม่อาจถูกคิดหน่วยที่คนเดิมจ่ายผ่านเงินประกันไปแล้วซ้ำ)
 *   3. เลขมิเตอร์ไม่ต่อเนื่องระหว่างรอบ โดยไม่มีเหตุการณ์ย้ายรองรับ
 */
import { qaClient, must, meterUnits } from "./qa-db"

const { db, label } = qaClient()
console.log(`ตรวจฐานข้อมูล: ${label}  (อ่านอย่างเดียว)\n`)

const wsRows = must("รายการหอ", await db.from("workspaces").select("id, name, electric_rate, water_rate"))
const wsById = new Map(wsRows.map(w => [w.id as string, w]))

const rooms = must("รายการห้อง", await db.from("rooms").select("id, room_number, workspace_id"))

const meters = must("มิเตอร์ทั้งหมด", await db.from("meter_records")
  .select("room_id, room_number, billing_cycle, elec_prev, elec_curr, water_prev, water_curr, workspace_id"))
const meterKey = new Map(meters.map(m => [`${m.room_id}|${m.billing_cycle}`, m]))

function nextCycle(cycle: string): string {
  const [y, m] = cycle.split("-").map(Number)
  return m >= 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// 1. ห้องที่ถูกย้ายออก — รอบถัดไปมีเลขตั้งต้นถูกไหม
// ---------------------------------------------------------------------------
const transfers = must("ประวัติย้ายห้อง", await db.from("tenant_room_transfers")
  .select("id, workspace_id, from_room_id, from_room_number, to_room_id, billing_cycle, transfer_date, closing_elec_curr, closing_water_curr")
  .order("transfer_date"))

console.log(`=== 1. ห้องที่ถูกย้ายออก (${transfers.length} รายการ) ===`)
let nextCycleProblems = 0
if (transfers.length === 0) {
  console.log("   ยังไม่มีการย้ายห้องในระบบ — ไม่มีอะไรค้าง")
} else {
  for (const t of transfers) {
    const ws = wsById.get(t.workspace_id as string)
    const nc = nextCycle(String(t.billing_cycle))
    const nextRow = meterKey.get(`${t.from_room_id}|${nc}`)
    const closing = Number(t.closing_elec_curr ?? 0)

    if (!nextRow) {
      // ไม่มีแถวรอบถัดไป = ยังไม่ถึงรอบนั้น หรือห้องยังว่าง ไม่ใช่ปัญหาในตัวเอง
      console.log(`   · ${ws?.name} ห้อง ${t.from_room_number} ย้าย ${t.transfer_date}: ยังไม่มีแถวมิเตอร์รอบ ${nc}`)
      continue
    }
    const nextPrev = Number(nextRow.elec_prev ?? 0)
    if (Math.abs(nextPrev - closing) > 0.01) {
      nextCycleProblems++
      const gotUnits = meterUnits(Number(nextRow.elec_curr ?? nextPrev), nextPrev)
      const shouldUnits = meterUnits(Number(nextRow.elec_curr ?? closing), closing)
      const diff = (shouldUnits - gotUnits) * Number(ws?.electric_rate ?? 0)
      console.log(`   ⚠️ ${ws?.name} ห้อง ${t.from_room_number} รอบ ${nc}: prev ${nextPrev} ควรเป็น ${closing} (เลขปิดตอนย้าย)`)
      console.log(`      หน่วยที่คิด ${gotUnits} ควรเป็น ${shouldUnits} → ส่วนต่างเงินประมาณ ${diff.toLocaleString()} บาท`)
    }
  }
  if (nextCycleProblems === 0) console.log("   ไม่พบห้องที่เลขตั้งต้นรอบถัดไปเพี้ยน")
}
console.log("")

// ---------------------------------------------------------------------------
// 2. ย้ายออก (คืนเงินประกัน) แล้วมีบิลของห้องเดิมในรอบเดียวกัน
// ---------------------------------------------------------------------------
// ⚠️ cancelled_contracts เก็บแต่ room_number ไม่มี room_id (ต่างจาก bills/meter_records ที่แก้ไปแล้ว)
// จึงจับคู่ห้องได้แค่ด้วยเลขห้อง — หอที่มีเลขห้องซ้ำข้ามอาคารจะแยกไม่ออกว่าย้ายออกจากตึกไหน
// สคริปต์นี้เตือนไว้เมื่อเจอเลขห้องซ้ำ ไม่เดาแทน
const cancelled = must("สัญญายกเลิก", await db.from("cancelled_contracts")
  .select("id, workspace_id, room_number, tenant_name, cancellation_date, deducted_utilities_408, deducted_rent_405"))

const bills = must("บิลทั้งหมด", await db.from("bills")
  .select("invoice_id, room_id, room_number, workspace_id, billing_cycle, bill_kind, tenant_name, amount, electric_units, water_units, elec_prev, elec_curr, status"))

console.log(`=== 2. ย้ายออกแล้วมีบิลของห้องเดิมในรอบเดียวกัน (${cancelled.length} สัญญายกเลิก) ===`)
let doubleCharged = 0, chargedPrevTenantUnits = 0, ambiguous = 0
for (const c of cancelled) {
  const cycle = String(c.cancellation_date ?? "").slice(0, 7)
  if (!cycle) continue
  const sameRoomBills = bills.filter(b =>
    b.workspace_id === c.workspace_id &&
    b.room_number === c.room_number &&
    b.billing_cycle === cycle &&
    b.bill_kind === "regular")
  if (sameRoomBills.length === 0) continue

  const ws = wsById.get(c.workspace_id as string)
  const utilDeduct = Number(c.deducted_utilities_408 ?? 0)
  const rentDeduct = Number(c.deducted_rent_405 ?? 0)

  // มีห้องเลขนี้กี่ห้องในหอนี้ — ถ้าเกินหนึ่ง แปลว่าจับคู่ด้วยเลขห้องไม่ได้แน่นอน
  const sameNumberRooms = rooms.filter(r => r.workspace_id === c.workspace_id && r.room_number === c.room_number)
  if (sameNumberRooms.length > 1) {
    ambiguous++
    console.log(`   ? ${ws?.name} ห้อง ${c.room_number} รอบ ${cycle}: หอนี้มีห้องเลข ${c.room_number} อยู่ ${sameNumberRooms.length} ห้อง`)
    console.log(`      cancelled_contracts ไม่มี room_id จึงบอกไม่ได้ว่าย้ายออกจากห้องไหน — ต้องดูด้วยตา`)
    continue
  }

  for (const b of sameRoomBills) {
    // ตัวชี้ขาด: คนที่ถูกออกบิล เป็นคนเดียวกับคนที่ย้ายออกหรือไม่ (ไม่พิมพ์ชื่อออกมา)
    const samePerson = c.tenant_name === b.tenant_name
    const orphan = !b.room_id

    // บิลที่ room_id เป็น null คือบิลของห้องที่ถูกลบไปแล้ว จับคู่ได้ด้วยเลขห้องเท่านั้น
    // จึงอาจไม่ใช่ห้องเดียวกันกับสัญญายกเลิกใบนี้เลย — ห้ามสรุปว่าเป็นการเก็บซ้ำ
    if (orphan) {
      ambiguous++
      console.log(`   ? ${ws?.name} ห้อง ${c.room_number} รอบ ${cycle}: มีบิล ${b.invoice_id} ที่ room_id เป็น null`)
      console.log(`      = บิลของห้องที่ถูกลบไปแล้ว จับคู่ได้แค่ด้วยเลขห้อง อาจไม่ใช่ห้องเดียวกัน — ไม่สรุปให้`)
      continue
    }

    if (samePerson) {
      doubleCharged++
      console.log(`   ⚠️ ${ws?.name} ห้อง ${c.room_number} รอบ ${cycle} — เก็บซ้ำกับคนเดียวกัน`)
      console.log(`      ย้ายออก ${c.cancellation_date}: หักจากเงินประกัน ค่าน้ำ-ไฟ ${utilDeduct.toLocaleString()} · ค่าเช่า ${rentDeduct.toLocaleString()} บาท`)
      console.log(`      และมีบิล ${b.invoice_id} ${Number(b.amount).toLocaleString()} บาท [${b.status}] (ไฟ ${b.electric_units} / น้ำ ${b.water_units} หน่วย)`)
      console.log(`      → คนเดียวกันถูกเรียกเก็บสองทางในรอบเดียว ถ้าบิลยังไม่จ่ายควรลบหรือปรับยอด`)
    } else {
      chargedPrevTenantUnits++
      console.log(`   ⚠️ ${ws?.name} ห้อง ${c.room_number} รอบ ${cycle} — ผู้เช่าคนใหม่ถูกออกบิลในรอบที่คนเก่าย้ายออก`)
      console.log(`      ย้ายออก ${c.cancellation_date}: หักค่าน้ำ-ไฟจากเงินประกัน ${utilDeduct.toLocaleString()} บาท`)
      console.log(`      บิลของคนใหม่ ${b.invoice_id}: ไฟ ${b.elec_prev}→${b.elec_curr} = ${b.electric_units} หน่วย [${b.status}]${orphan ? " · room_id เป็น null (บิลกำพร้าของห้องที่ถูกลบ)" : ""}`)
      console.log(`      → ตรวจว่าเลขตั้งต้นของคนใหม่เริ่มที่เลขปิดห้องของคนเก่าจริง (นี่คือบั๊กที่ patch นี้ปิด)`)
    }
  }
}
const overlap = doubleCharged + chargedPrevTenantUnits + ambiguous
if (overlap === 0) console.log("   ไม่พบรอบที่ย้ายออกแล้วมีบิลของห้องเดิมทับกัน")
else console.log(`   สรุป: เก็บซ้ำคนเดียวกัน ${doubleCharged} · คนใหม่ในรอบที่คนเก่าย้ายออก ${chargedPrevTenantUnits} · แยกห้องไม่ได้ ${ambiguous}`)
console.log("")

// ---------------------------------------------------------------------------
// 3. เลขมิเตอร์ไม่ต่อเนื่องระหว่างรอบ
// ---------------------------------------------------------------------------
const byRoom = new Map<string, typeof meters>()
for (const m of meters) {
  if (!m.room_id) continue
  const list = byRoom.get(m.room_id as string) ?? []
  list.push(m)
  byRoom.set(m.room_id as string, list)
}

// เหตุการณ์ย้ายที่อธิบายความไม่ต่อเนื่องได้อย่างถูกต้อง (ห้อง|รอบ)
const movedRoomCycles = new Set<string>()
for (const t of transfers) {
  movedRoomCycles.add(`${t.from_room_id}|${t.billing_cycle}`)
  movedRoomCycles.add(`${t.to_room_id}|${t.billing_cycle}`)
}
for (const c of cancelled) {
  const cycle = String(c.cancellation_date ?? "").slice(0, 7)
  const room = rooms.find(r => r.workspace_id === c.workspace_id && r.room_number === c.room_number)
  if (room && cycle) movedRoomCycles.add(`${room.id}|${cycle}`)
}

console.log("=== 3. เลขมิเตอร์ไม่ต่อเนื่องระหว่างรอบ ===")
let gaps = 0, explained = 0, compared = 0
let gapMoney = 0
for (const list of byRoom.values()) {
  list.sort((a, b) => String(a.billing_cycle).localeCompare(String(b.billing_cycle)))
  for (let i = 1; i < list.length; i++) {
    const prevRow = list[i - 1], row = list[i]
    if (prevRow.elec_curr === null || prevRow.elec_curr === undefined) continue
    compared++
    const gap = Number(row.elec_prev ?? 0) - Number(prevRow.elec_curr)
    if (Math.abs(gap) <= 0.01) continue
    if (movedRoomCycles.has(`${row.room_id}|${row.billing_cycle}`)) { explained++; continue }
    gaps++
    const ws = wsById.get(row.workspace_id as string)
    const money = Math.abs(gap) * Number(ws?.electric_rate ?? 0)
    gapMoney += money
    console.log(`   ⚠️ ${ws?.name} ห้อง ${row.room_number} รอบ ${row.billing_cycle}: prev ${row.elec_prev} ≠ curr รอบ ${prevRow.billing_cycle} (${prevRow.elec_curr})`)
    console.log(`      ต่าง ${gap} หน่วย ≈ ${money.toLocaleString()} บาท (ไม่มีเหตุการณ์ย้ายรองรับ)`)
  }
}
console.log(`   เทียบ ${compared} คู่รอบ · อธิบายได้ด้วยเหตุการณ์ย้าย ${explained} คู่ · ไม่มีคำอธิบาย ${gaps} คู่`)
if (gaps > 0) console.log(`   มูลค่ารวมของช่องว่างที่อธิบายไม่ได้ ≈ ${gapMoney.toLocaleString()} บาท`)
console.log("")

const clean = nextCycleProblems === 0 && overlap === 0 && gaps === 0
console.log(clean
  ? "สรุป: ไม่พบเงินค้างเก็บจากบั๊กเหล่านี้ในข้อมูลปัจจุบัน"
  : "สรุป: มีรายการที่ต้องดูด้วยตาตามด้านบน")
