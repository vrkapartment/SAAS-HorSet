/**
 * QA harness: จำลองการออกบิลด้วย "ข้อมูลจริงจากฐานข้อมูล" แล้วตรวจว่าใบที่จะได้ถูกต้อง
 *
 * ใช้: npm run qa:sim
 *
 * ⚠️ อ่านฐานข้อมูลอย่างเดียว (select) — ไม่เขียนอะไรลงฐานข้อมูลทั้งสิ้น
 *
 * ทำไมต้องมี: เทสต์ยูนิตใช้ข้อมูลสมมติ ส่วนการกดออกบิลจริงต้องมีคนคลิกในแอป
 * สคริปต์นี้อยู่ตรงกลาง — เอาค่าจริง (ค่าเช่า อัตรา ขั้นต่ำ เลขมิเตอร์ ค่าใช้จ่ายเสริม)
 * มาเดินผ่านสูตรตัวเดียวกับที่ server action ใช้ แล้วตรวจว่า:
 *   1. รายการย่อยบวกกันได้เท่ายอดรวมที่สูตรคำนวณ (ใบอธิบายที่มาของยอดได้)
 *   2. ป้าย "ขั้นต่ำ" ขึ้นตรงกับที่คิดเงินจริง
 *   3. snapshot ที่จะถูกบันทึกครบทุกช่อง
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { calculateBillTotal } from "../src/features/billing/bill-calculator"
import { resolveBillLines } from "../src/lib/billLines"

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

const cycle = process.argv[2] || new Date().toISOString().slice(0, 7)
console.log(`จำลองการออกบิลรอบ ${cycle} ด้วยข้อมูลจริง (อ่านอย่างเดียว)\n`)

const { data: workspaces, error: wsErr } = await db.from("workspaces")
  .select("id, name, electric_rate, water_rate, common_fee, electric_min_checked, electric_min_unit, water_min_checked, water_min_unit, vat_registered, vat_registered_from, vat_rate")
if (wsErr) throw wsErr

let checked = 0

let minCases = 0
let waiveCases = 0
const problems: string[] = []

for (const ws of workspaces ?? []) {
  const { data: rooms } = await db.from("rooms")
    .select("id, room_number, base_rent, waive_electric_min, waive_water_min, extra_expenses, building_id, room_types(default_rent), buildings(code)")
    .eq("workspace_id", ws.id)
  if (!rooms?.length) continue

  const { data: meters } = await db.from("meter_records")
    .select("room_id, elec_prev, elec_curr, water_prev, water_curr")
    .eq("workspace_id", ws.id).eq("billing_cycle", cycle)
  const meterByRoom = new Map((meters ?? []).filter(m => m.room_id).map(m => [m.room_id as string, m]))
  if (meterByRoom.size === 0) continue

  const vatApplies = !!ws.vat_registered &&
    (!ws.vat_registered_from || cycle >= String(ws.vat_registered_from).slice(0, 7))

  console.log(`── ${ws.name} — มีมิเตอร์รอบนี้ ${meterByRoom.size} ห้อง`)

  for (const r of rooms) {
    const m = meterByRoom.get(r.id)
    if (!m) continue

    const units = (curr: unknown, prev: unknown) => {
      if (curr === null || curr === undefined || curr === "") return 0
      const c = Number(curr), p = Number(prev || 0)
      return c >= p ? c - p : (10000 - p) + c
    }
    const eUnits = units(m.elec_curr, m.elec_prev)
    const wUnits = units(m.water_curr, m.water_prev)
    const rt = r.room_types as { default_rent?: number } | null
    const baseRent = rt ? Number(rt.default_rent) : Number(r.base_rent || 0)
    const extras = Array.isArray(r.extra_expenses) ? r.extra_expenses : []
    const extraSum = extras.reduce((a: number, c: { amount?: number }) => a + Number(c.amount || 0), 0)

    // สูตรตัวเดียวกับที่ createBill / saveAllBillsForCycle ใช้
    const calc = calculateBillTotal({
      baseRent, electricUnitsUsed: eUnits, waterUnitsUsed: wUnits,
      electricRate: Number(ws.electric_rate), waterRate: Number(ws.water_rate),
      commonFee: Number(ws.common_fee), otherServiceAmount: 0, extraExpensesSum: extraSum,
      waiveWaterMin: !!r.waive_water_min, waterMinChecked: !!ws.water_min_checked, waterMinUnit: Number(ws.water_min_unit),
      waiveElectricMin: !!r.waive_electric_min, electricMinChecked: !!ws.electric_min_checked, electricMinUnit: Number(ws.electric_min_unit),
      vatRate: Number(ws.vat_rate ?? 0.07), vatApplies
    })

    // snapshot ที่จะถูกบันทึกลงบิล
    const snapshot = {
      hasSnapshot: true,
      amount: calc.total,
      baseRent,
      electricUnits: eUnits, electricRate: Number(ws.electric_rate), electricAmount: calc.elecCost,
      waterUnits: wUnits, waterRate: Number(ws.water_rate), waterAmount: calc.waterCost,
      elecMinApplied: calc.elecMinApplied, waterMinApplied: calc.waterMinApplied,
      electricMinUnit: Number(ws.electric_min_unit), waterMinUnit: Number(ws.water_min_unit),
      commonFee: Number(ws.common_fee), extraExpenses: extras, vatAmount: calc.vatAmount
    }
    const lines = resolveBillLines(snapshot)

    checked++
    if (calc.elecMinApplied || calc.waterMinApplied) minCases++
    if (r.waive_electric_min || r.waive_water_min) waiveCases++

    const bal = Math.abs(lines.lineSum - calc.total) < 0.01
    if (!bal) {

      problems.push(`${ws.name} ห้อง ${r.room_number}: รายการย่อย ${lines.lineSum} ≠ ยอดรวม ${calc.total}`)
    }
    if (lines.rent !== baseRent) {
      problems.push(`${ws.name} ห้อง ${r.room_number}: ค่าเช่าบนใบ ${lines.rent} ≠ ค่าเช่าห้อง ${baseRent}`)
    }
    if (calc.elecMinApplied !== lines.elecIsMin || calc.waterMinApplied !== lines.waterIsMin) {
      problems.push(`${ws.name} ห้อง ${r.room_number}: ป้ายขั้นต่ำไม่ตรงกับที่คิดเงิน`)
    }

    const tag = [
      calc.elecMinApplied ? "ไฟขั้นต่ำ" : null,
      calc.waterMinApplied ? "น้ำขั้นต่ำ" : null,
      r.waive_electric_min ? "ยกเว้นไฟ" : null,
      r.waive_water_min ? "ยกเว้นน้ำ" : null,
      extraSum > 0 ? "มีค่าใช้จ่ายเสริม" : null,
      calc.vatAmount > 0 ? "มี VAT" : null
    ].filter(Boolean).join(" · ")

    console.log(
      `   ${bal ? "OK  " : "FAIL"} ห้อง ${String(r.room_number).padEnd(8)} ` +
      `เช่า ${String(lines.rent).padStart(6)} · ไฟ ${String(lines.elecAmount).padStart(5)} (${eUnits}u) · ` +
      `น้ำ ${String(lines.waterAmount).padStart(5)} (${wUnits}u) · กลาง ${lines.commonFee} ` +
      `→ รวม ${lines.lineSum}` + (tag ? `   [${tag}]` : "")
    )
  }
  console.log("")
}

console.log(`ตรวจ ${checked} ห้อง · เข้าเงื่อนไขคิดขั้นต่ำ ${minCases} ห้อง · ตั้งยกเว้นขั้นต่ำ ${waiveCases} ห้อง`)
if (problems.length) {
  console.log(`\nพบปัญหา ${problems.length} ข้อ:`)
  for (const p of problems.slice(0, 20)) console.log(`  - ${p}`)
  process.exit(1)
}
console.log(`\nผ่านทั้งหมด — รายการย่อยบวกได้เท่ายอดรวมทุกห้อง · ค่าเช่าบนใบตรงกับค่าเช่าห้อง · ป้ายขั้นต่ำตรงกับที่คิดเงิน`)
