/**
 * ยืนยันว่า database_patch_move_segments.sql ลงครบจริง ก่อน deploy
 *
 * ใช้: npx tsx scripts/qa-verify-patch-move-segments.mts
 *
 * ⚠️ อ่านอย่างเดียว ไม่เขียนอะไร
 *
 * ทำไมต้องมี: PostgREST คืน error ต่อ query ไม่ใช่ต่อคอลัมน์ ถ้า select คอลัมน์ที่ยังไม่มี
 * ทั้ง query จะพังพร้อมกัน ทำให้แยกไม่ออกว่า "ขาดคอลัมน์ไหน" สคริปต์นี้ยิงทีละคอลัมน์
 * จึงบอกได้ว่าอันไหนลงแล้ว อันไหนยังขาด — ต่างจากการเปิดโค้ดแล้วรอพังตอนใช้งานจริง
 */
import { qaClient } from "./qa-db"

const { db, label } = qaClient()
console.log(`ตรวจฐานข้อมูล: ${label}  (อ่านอย่างเดียว)\n`)

const expected: Record<string, string[]> = {
  bills: ["utility_segments"],
  cancelled_contracts: ["closing_elec_prev", "closing_elec_curr", "closing_water_prev", "closing_water_curr"],
  meter_records: ["occupancy_start_elec", "occupancy_start_water", "occupancy_start_reason", "occupancy_start_date"],
  tenant_room_transfers: [
    "closing_elec_units", "closing_elec_rate", "closing_elec_amount", "closing_elec_min_applied",
    "closing_water_units", "closing_water_rate", "closing_water_amount", "closing_water_min_applied",
    "include_old_room_rent", "old_room_rent_amount"
  ]
}

let missing = 0
let present = 0
for (const [table, columns] of Object.entries(expected)) {
  const results: string[] = []
  for (const col of columns) {
    const { error } = await db.from(table).select(col).limit(1)
    if (error) {
      missing++
      results.push(`❌ ${col} — ${error.message}`)
    } else {
      present++
      results.push(`✅ ${col}`)
    }
  }
  console.log(`${table}`)
  for (const r of results) console.log(`   ${r}`)
  console.log("")
}

// utility_segments ต้องมี default '[]' ไม่ใช่ null สำหรับแถวใหม่ — ตรวจด้วยการอ่านบิลที่มีอยู่
// (แถวเก่าเป็น null ได้ ฝั่งโค้ดรับไหว — parseUtilitySegments คืน array ว่าง)
const { data: sample, error: sampleErr } = await db.from("bills")
  .select("invoice_id, utility_segments").limit(5)
if (!sampleErr && sample) {
  const nullCount = sample.filter(b => b.utility_segments === null).length
  console.log(`bills.utility_segments ในบิลตัวอย่าง ${sample.length} ใบ: เป็น null ${nullCount} ใบ (ปกติ — แถวเก่าไม่ถูก backfill โดยเจตนา)`)
}

console.log("")
console.log(missing === 0
  ? `ครบทั้ง ${present} คอลัมน์ — patch ลงเรียบร้อย`
  : `ขาด ${missing} คอลัมน์ (มีแล้ว ${present}) — ยังรัน patch ไม่ครบ ห้าม deploy`)
process.exit(missing === 0 ? 0 : 1)
