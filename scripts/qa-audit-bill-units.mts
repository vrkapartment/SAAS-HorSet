/**
 * QA harness: ตรวจย้อนหลังว่าบิลใบไหน "หน่วยน้ำ-ไฟไม่ตรงกับมิเตอร์ที่จดไว้"
 *
 * ใช้: npm run qa:audit-units
 *
 * ⚠️ อ่านฐานข้อมูลอย่างเดียว ไม่เขียนอะไร และไม่พิมพ์ข้อมูลส่วนบุคคล
 *
 * ต่างจากข้อตรวจใน qa:db: ข้อนั้นเทียบหน่วยในบิลกับเลขมิเตอร์ที่เก็บ "ในบิลเดียวกัน" จึงใช้ได้
 * เฉพาะบิลที่มี snapshot สคริปต์นี้เทียบกับตาราง meter_records แทน จึงตรวจบิลเก่าย้อนหลังได้
 *
 * ที่มา: บั๊ก handleSaveRow ที่คิดหน่วยเฉพาะฝั่งที่กดปุ่ม ทำให้อีกฝั่งถูกเขียนเป็น 0 หน่วย
 * แล้วระบบตกไปคิดขั้นต่ำ → เก็บเงินผู้เช่าขาด (ห้อง 112 รอบ 2026-09 ขาด 602 บาท)
 *
 * ⚠️ ข้อจำกัดที่ต้องรู้: เลขมิเตอร์ใน meter_records แก้ได้ตลอดเวลา สคริปต์นี้จับได้ทั้ง
 * "บิลคิดผิด" และ "มิเตอร์ถูกแก้ย้อนหลังโดยเจตนา" — แยกจากกันด้วยข้อมูลในระบบไม่ได้
 * ใบที่ตรวจด้วยตาแล้วว่าถูกต้อง ให้ใส่ใน qa-known-unit-mismatches.ts เพื่อไม่ให้เป็น noise
 */
import { calculateBillTotal } from "../src/features/billing/bill-calculator"
import { findAcknowledged } from "./qa-known-unit-mismatches"
import { qaClient, must, meterUnits as units } from "./qa-db"

const { db, label: dbLabel } = qaClient()
console.log(`ตรวจฐานข้อมูล: ${dbLabel}  (อ่านอย่างเดียว)`)

// must() บังคับเช็ค error ทุก query — เคยพลาดเพราะไม่เช็คแล้วรายงานว่าข้อมูลหาย (ดู qa-db.ts)
const bills = must("บิลทั้งหมดที่มี room_id", await db.from("bills")
  .select("invoice_id, room_number, room_id, workspace_id, billing_cycle, bill_kind, electric_units, water_units, status")
  .not("room_id", "is", null).order("billing_cycle"))

const meters = must("มิเตอร์ทั้งหมด", await db.from("meter_records")
  .select("room_id, billing_cycle, elec_prev, elec_curr, water_prev, water_curr"))
const meterKey = new Map(meters.map(m => [`${m.room_id}|${m.billing_cycle}`, m]))

const wsRows = must("รายการหอ", await db.from("workspaces")
  .select("id, name, electric_rate, water_rate, electric_min_checked, electric_min_unit, water_min_checked, water_min_unit"))
const wsById = new Map(wsRows.map(w => [w.id, w]))

const rooms = must("รายการห้อง", await db.from("rooms").select("id, waive_electric_min, waive_water_min"))
const roomById = new Map(rooms.map(r => [r.id, r]))

type Row = { line: string; diff: number }
const problems = new Map<string, Row[]>()   // ชื่อหอ → รายการที่ต้องดู
const acknowledged: string[] = []
let checked = 0

for (const b of bills ?? []) {
  const m = meterKey.get(`${b.room_id}|${b.billing_cycle}`)
  if (!m || m.elec_curr === null || m.water_curr === null) continue
  checked++

  const expE = units(Number(m.elec_curr), Number(m.elec_prev ?? 0))
  const expW = units(Number(m.water_curr), Number(m.water_prev ?? 0))
  const gotE = Number(b.electric_units)
  const gotW = Number(b.water_units)
  if (gotE === expE && gotW === expW) continue

  const ws = wsById.get(b.workspace_id)
  const wsName = ws?.name ?? "(ไม่พบชื่อหอ)"

  const known = findAcknowledged(b.invoice_id, gotE, gotW, expE, expW)
  if (known) {
    acknowledged.push(`${wsName} · ${b.invoice_id} · ${known.reason}`)
    continue
  }

  // ประเมินส่วนต่างเงินจากอัตราของหอนั้น (ตัดค่าเช่า/ค่าส่วนกลางออกเพราะไม่เกี่ยวกับหน่วย)
  const rm = roomById.get(b.room_id as string)
  const common = {
    baseRent: 0, commonFee: 0, otherServiceAmount: 0, extraExpensesSum: 0,
    electricRate: Number(ws?.electric_rate ?? 0), waterRate: Number(ws?.water_rate ?? 0),
    electricMinChecked: !!ws?.electric_min_checked, electricMinUnit: Number(ws?.electric_min_unit ?? 0),
    waterMinChecked: !!ws?.water_min_checked, waterMinUnit: Number(ws?.water_min_unit ?? 0),
    waiveElectricMin: !!rm?.waive_electric_min, waiveWaterMin: !!rm?.waive_water_min
  }
  const diff = calculateBillTotal({ ...common, electricUnitsUsed: expE, waterUnitsUsed: expW }).total
    - calculateBillTotal({ ...common, electricUnitsUsed: gotE, waterUnitsUsed: gotW }).total

  const which: string[] = []
  if (gotE !== expE) which.push(`ไฟ: บิล ${gotE} ≠ มิเตอร์ ${m.elec_prev}→${m.elec_curr} = ${expE}`)
  if (gotW !== expW) which.push(`น้ำ: บิล ${gotW} ≠ มิเตอร์ ${m.water_prev}→${m.water_curr} = ${expW}`)
  const money = diff > 0 ? `เก็บขาด ${diff.toLocaleString()}` : diff < 0 ? `เก็บเกิน ${Math.abs(diff).toLocaleString()}` : "ยอดเท่ากัน"

  const list = problems.get(wsName) ?? []
  list.push({
    line: `${b.invoice_id}  ห้อง ${b.room_number}  รอบ ${b.billing_cycle}  [${b.bill_kind}·${b.status}]\n     ${which.join("\n     ")}\n     → ${money} บาท`,
    diff
  })
  problems.set(wsName, list)
}

console.log(`ตรวจบิลที่มีมิเตอร์ให้เทียบ ${checked} ใบ (จากทั้งหมด ${bills?.length ?? 0} ใบ)`)

if (acknowledged.length) {
  console.log(`\nรับทราบแล้ว ${acknowledged.length} ใบ (ตรวจแล้วว่ายอดถูกต้อง — ดู qa-known-unit-mismatches.ts):`)
  for (const a of acknowledged) console.log(`  · ${a}`)
}

if (problems.size === 0) {
  console.log(`\nไม่พบใบที่ต้องแก้`)
  process.exit(0)
}

let under = 0, over = 0
for (const [wsName, rows] of [...problems.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const u = rows.filter(r => r.diff > 0).reduce((a, r) => a + r.diff, 0)
  const o = rows.filter(r => r.diff < 0).reduce((a, r) => a + Math.abs(r.diff), 0)
  under += u; over += o
  console.log(`\n=== ${wsName} — ${rows.length} ใบ · เก็บขาด ${u.toLocaleString()} · เก็บเกิน ${o.toLocaleString()} บาท ===`)
  for (const r of rows) console.log(`  ${r.line}`)
}

console.log(`\nรวมที่ต้องแก้ ${[...problems.values()].reduce((a, r) => a + r.length, 0)} ใบ · เก็บขาด ${under.toLocaleString()} · เก็บเกิน ${over.toLocaleString()} บาท`)
console.log(`\nวิธีแก้: กดออกบิลใหม่ให้ห้อง/รอบเหล่านั้น (ใช้ปุ่ม "บันทึกทั้งหมด" ปลอดภัยสุด) แล้วรันสคริปต์นี้อีกครั้ง`)
console.log(`ถ้าตรวจแล้วว่าใบไหนยอดถูกต้องอยู่แล้ว ให้เพิ่มใน scripts/qa-known-unit-mismatches.ts`)
process.exit(1)
