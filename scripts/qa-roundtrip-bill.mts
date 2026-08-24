/**
 * QA harness: ทดสอบเส้นทางเขียน snapshot ลงฐานข้อมูลจริง แล้วลบทิ้ง
 *
 * ใช้: npm run qa:roundtrip
 *
 * ⚠️ สคริปต์นี้ "เขียน" ฐานข้อมูล ต่างจาก qa:db / qa:sim ที่อ่านอย่างเดียว
 *
 * มาตรการกันพลาด (บังคับในโค้ด ไม่ใช่แค่ความระวัง):
 *   1. แตะได้แค่ billing_cycle = '2099-12' เท่านั้น — เช็คก่อนทุกคำสั่งเขียน/ลบ
 *      รอบนี้ไม่มีทางเป็นข้อมูลจริง จึงชนกับบิลของผู้เช่าไม่ได้เลย
 *   2. ปฏิเสธทันทีถ้าพบว่ามีแถวของรอบนี้อยู่ก่อนแล้ว (กันเขียนทับของที่ค้างไว้)
 *   3. ลบสิ่งที่สร้างทุกครั้งใน finally แม้ตรวจล้มเหลวกลางทาง
 *   4. ไม่แตะแถวอื่นของห้องเดียวกันเลย
 *
 * ทำไมต้องมี: qa:sim ยืนยันได้แค่ว่าสูตรถูก แต่ยืนยันไม่ได้ว่าคอลัมน์ snapshot 15 ช่อง
 * เขียนลงฐานข้อมูลได้จริงและอ่านกลับมาครบ — ชื่อคอลัมน์ผิดตัวเดียวก็หายไปเงียบ ๆ ทั้งช่อง
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { calculateBillTotal } from "../src/features/billing/bill-calculator"
import { resolveBillLines } from "../src/lib/billLines"
import { readBillSnapshot, hasBillSnapshot, buildInvoiceId } from "../src/features/billing/utils"

/** รอบบิลที่สคริปต์นี้แตะได้เท่านั้น — ห้ามเปลี่ยนเป็นรอบจริงเด็ดขาด */
const TEST_CYCLE = "2099-12"

for (const f of [".env.local", ".env"]) {
  try {
    for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
  } catch { /* ไม่มีไฟล์ก็ข้าม */ }
}
const url = process.env.QA_DB_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.QA_DB_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error("ไม่พบ SUPABASE URL/KEY"); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

function assertTestCycle(cycle: string) {
  if (cycle !== TEST_CYCLE) throw new Error(`ปฏิเสธ: สคริปต์นี้แตะได้แค่รอบ ${TEST_CYCLE} (ได้ ${cycle})`)
}

const created: { bills: string[]; meters: string[] } = { bills: [], meters: [] }
const fail: string[] = []
const pass: string[] = []

try {
  // 1) เลือกห้องจริงมาอ่านค่า — ไม่แก้ข้อมูลของห้องนั้นเลย
  const { data: room, error: rErr } = await db.from("rooms")
    .select("id, room_number, workspace_id, base_rent, building_id, waive_electric_min, waive_water_min, extra_expenses, room_types(default_rent), buildings(code)")
    .not("building_id", "is", null).not("room_type_id", "is", null)
    .limit(1).maybeSingle()
  if (rErr) throw rErr
  if (!room) throw new Error("ไม่พบห้องที่มีอาคารและประเภทห้องสำหรับทดสอบ")

  const { data: ws, error: wErr } = await db.from("workspaces")
    .select("name, electric_rate, water_rate, common_fee, electric_min_checked, electric_min_unit, water_min_checked, water_min_unit, vat_registered, vat_registered_from, vat_rate")
    .eq("id", room.workspace_id).single()
  if (wErr) throw wErr

  console.log(`ทดสอบกับห้อง ${room.room_number} (หอ ${ws.name}) รอบปลอม ${TEST_CYCLE}\n`)

  // 2) กันเขียนทับ — รอบนี้ต้องว่างเปล่าก่อน
  for (const t of ["bills", "meter_records"]) {
    const { count } = await db.from(t).select("*", { count: "exact", head: true })
      .eq("billing_cycle", TEST_CYCLE)
    if ((count ?? 0) > 0) throw new Error(`มีแถวของรอบ ${TEST_CYCLE} ค้างอยู่ใน ${t} — ตรวจและลบก่อน`)
  }

  // 3) คิดบิลด้วยสูตรจริง ตั้งมิเตอร์ให้ใช้ไฟ 0 หน่วย เพื่อทดสอบเคสคิดขั้นต่ำซึ่งยากสุด
  const elecPrev = 1000, elecCurr = 1000
  const waterPrev = 500, waterCurr = 507
  const eUnits = elecCurr - elecPrev
  const wUnits = waterCurr - waterPrev
  const rt = room.room_types as { default_rent?: number } | null
  const baseRent = rt ? Number(rt.default_rent) : Number(room.base_rent || 0)
  const extras = Array.isArray(room.extra_expenses) ? room.extra_expenses : []
  const extraSum = extras.reduce((a: number, c: { amount?: number }) => a + Number(c.amount || 0), 0)
  const vatApplies = !!ws.vat_registered &&
    (!ws.vat_registered_from || TEST_CYCLE >= String(ws.vat_registered_from).slice(0, 7))

  const calc = calculateBillTotal({
    baseRent, electricUnitsUsed: eUnits, waterUnitsUsed: wUnits,
    electricRate: Number(ws.electric_rate), waterRate: Number(ws.water_rate),
    commonFee: Number(ws.common_fee), otherServiceAmount: 0, extraExpensesSum: extraSum,
    waiveWaterMin: !!room.waive_water_min, waterMinChecked: !!ws.water_min_checked, waterMinUnit: Number(ws.water_min_unit),
    waiveElectricMin: !!room.waive_electric_min, electricMinChecked: !!ws.electric_min_checked, electricMinUnit: Number(ws.electric_min_unit),
    vatRate: Number(ws.vat_rate ?? 0.07), vatApplies
  })
  console.log(`คิดได้: เช่า ${baseRent} · ไฟ ${calc.elecCost} (${eUnits}u${calc.elecMinApplied ? " ขั้นต่ำ" : ""}) · น้ำ ${calc.waterCost} (${wUnits}u${calc.waterMinApplied ? " ขั้นต่ำ" : ""}) · กลาง ${ws.common_fee} → รวม ${calc.total}\n`)

  // 4) เขียนมิเตอร์ + บิล ด้วย payload ชุดเดียวกับที่ createBill ใช้
  assertTestCycle(TEST_CYCLE)
  const { data: mIns, error: mErr } = await db.from("meter_records").insert([{
    workspace_id: room.workspace_id, room_id: room.id, room_number: room.room_number,
    billing_cycle: TEST_CYCLE, elec_prev: elecPrev, elec_curr: elecCurr,
    water_prev: waterPrev, water_curr: waterCurr
  }]).select("id")
  if (mErr) throw mErr
  created.meters = (mIns ?? []).map(r => r.id)

  const bld = room.buildings as { code?: string | null } | null
  const { data: bIns, error: bErr } = await db.from("bills").insert([{
    workspace_id: room.workspace_id, room_id: room.id, room_number: room.room_number,
    building_id: room.building_id, bill_kind: "regular",
    tenant_name: "QA ทดสอบระบบ", amount: calc.total, status: "unpaid",
    billing_cycle: TEST_CYCLE, electric_units: eUnits, water_units: wUnits,
    other_service_amount: 0, late_days: null, penalty_amount: null,
    invoice_id: buildInvoiceId(TEST_CYCLE, room.room_number, bld?.code ?? null),
    vat_amount: calc.vatAmount,
    base_rent: baseRent, electric_amount: calc.elecCost, water_amount: calc.waterCost,
    electric_rate: Number(ws.electric_rate), water_rate: Number(ws.water_rate),
    common_fee: Number(ws.common_fee),
    elec_prev: elecPrev, elec_curr: elecCurr, water_prev: waterPrev, water_curr: waterCurr,
    extra_expenses: extras,
    elec_min_applied: calc.elecMinApplied, water_min_applied: calc.waterMinApplied,
    electric_min_unit: Number(ws.electric_min_unit), water_min_unit: Number(ws.water_min_unit)
  }]).select("id, invoice_id")
  if (bErr) throw bErr
  created.bills = (bIns ?? []).map(r => r.id)
  console.log(`เขียนบิลแล้ว: ${bIns?.[0]?.invoice_id}\n`)

  // 5) อ่านกลับจากฐานข้อมูลจริง แล้วตรวจทุกช่อง
  const { data: back, error: readErr } = await db.from("bills").select("*").eq("id", created.bills[0]).single()
  if (readErr) throw readErr

  const snap = readBillSnapshot(back)
  const check = (ok: boolean, msg: string) => (ok ? pass : fail).push(msg)

  check(hasBillSnapshot(snap), "บิลที่เพิ่งออกถูกนับว่ามี snapshot")
  check(snap.baseRent === baseRent, `ค่าเช่าใน snapshot = ${snap.baseRent} (ต้องเป็น ${baseRent})`)
  check(snap.electricAmount === calc.elecCost, `ยอดค่าไฟ = ${snap.electricAmount} (ต้องเป็น ${calc.elecCost})`)
  check(snap.waterAmount === calc.waterCost, `ยอดค่าน้ำ = ${snap.waterAmount} (ต้องเป็น ${calc.waterCost})`)
  check(snap.commonFee === Number(ws.common_fee), `ค่าส่วนกลาง = ${snap.commonFee}`)
  check(snap.electricRate === Number(ws.electric_rate), `อัตราค่าไฟ = ${snap.electricRate}`)
  check(snap.elecPrev === elecPrev && snap.elecCurr === elecCurr, `เลขมิเตอร์ไฟ ${snap.elecPrev} → ${snap.elecCurr}`)
  check(snap.waterPrev === waterPrev && snap.waterCurr === waterCurr, `เลขมิเตอร์น้ำ ${snap.waterPrev} → ${snap.waterCurr}`)
  check(snap.elecMinApplied === calc.elecMinApplied, `ธงคิดขั้นต่ำไฟ = ${snap.elecMinApplied} (ต้องเป็น ${calc.elecMinApplied})`)
  check(snap.waterMinApplied === calc.waterMinApplied, `ธงคิดขั้นต่ำน้ำ = ${snap.waterMinApplied}`)
  check(snap.electricMinUnit === Number(ws.electric_min_unit), `หน่วยขั้นต่ำไฟ = ${snap.electricMinUnit}`)
  check(Array.isArray(snap.extraExpenses), "ค่าใช้จ่ายเสริมอ่านกลับมาเป็น array")

  const lines = resolveBillLines({
    hasSnapshot: true,
    amount: Number(back.amount),
    baseRent: snap.baseRent ?? 0,
    electricUnits: Number(back.electric_units),
    electricRate: snap.electricRate ?? 0,
    electricAmount: snap.electricAmount ?? undefined,
    waterUnits: Number(back.water_units),
    waterRate: snap.waterRate ?? 0,
    waterAmount: snap.waterAmount ?? undefined,
    commonFee: snap.commonFee ?? undefined,
    elecMinApplied: snap.elecMinApplied ?? undefined,
    waterMinApplied: snap.waterMinApplied ?? undefined,
    electricMinUnit: snap.electricMinUnit ?? undefined,
    waterMinUnit: snap.waterMinUnit ?? undefined,
    extraExpenses: snap.extraExpenses ?? undefined,
    vatAmount: Number(back.vat_amount || 0),
    penaltyAmount: Number(back.penalty_amount || 0),
    otherServiceAmount: Number(back.other_service_amount || 0)
  })

  check(Math.abs(lines.lineSum - Number(back.amount)) < 0.01,
    `รายการย่อยบวกได้ ${lines.lineSum} เทียบยอดรวมที่เก็บ ${back.amount}`)
  check(lines.rent === baseRent, `ค่าเช่าที่จะพิมพ์บนใบ = ${lines.rent} (ต้องเป็น ${baseRent})`)
  check(lines.elecIsMin === calc.elecMinApplied, `ป้ายขั้นต่ำไฟบนใบ = ${lines.elecIsMin}`)
  check(lines.elecDesc.includes(calc.elecMinApplied ? "ขั้นต่ำ" : "Electricity"), `ข้อความป้ายไฟ: ${lines.elecDesc}`)
  check(lines.elecRateDisplay === (calc.elecMinApplied ? "-" : String(Number(ws.electric_rate))),
    `คอลัมน์อัตราไฟบนใบ = ${lines.elecRateDisplay}`)

  console.log("ผลตรวจ:")
  for (const p of pass) console.log(`  OK   ${p}`)
  for (const f of fail) console.log(`  FAIL ${f}`)
} catch (e) {
  const msg = `ข้อผิดพลาด: ${e instanceof Error ? e.message : String(e)}`
  fail.push(msg)
  console.error(`\nERR ${msg}`)
} finally {
  // ลบทุกอย่างที่สร้าง — ทำเสมอแม้ล้มเหลวกลางทาง
  assertTestCycle(TEST_CYCLE)
  for (const id of created.bills) await db.from("bills").delete().eq("id", id).eq("billing_cycle", TEST_CYCLE)
  for (const id of created.meters) await db.from("meter_records").delete().eq("id", id).eq("billing_cycle", TEST_CYCLE)

  const left: string[] = []
  for (const t of ["bills", "meter_records"]) {
    const { count } = await db.from(t).select("*", { count: "exact", head: true }).eq("billing_cycle", TEST_CYCLE)
    if ((count ?? 0) > 0) left.push(`${t}: ${count}`)
  }
  console.log(`\nเก็บกวาด: ลบบิล ${created.bills.length} · มิเตอร์ ${created.meters.length} แถว` +
    (left.length ? `  ⚠️ ยังเหลือ ${left.join(" · ")}` : "  (ไม่มีอะไรค้าง)"))
}

console.log(fail.length === 0
  ? "\nผ่านทั้งหมด — เส้นทางเขียน snapshot ลงฐานข้อมูลจริงทำงานถูกต้อง"
  : `\nไม่ผ่าน ${fail.length} ข้อ`)
process.exit(fail.length === 0 ? 0 : 1)
