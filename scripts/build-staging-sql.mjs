/**
 * รวม schema + patch ทุกไฟล์เป็นไฟล์เดียว สำหรับติดตั้งฐานข้อมูลใหม่ตั้งแต่ต้น (เช่น staging)
 *
 * ใช้: npm run build:sql
 * ผลลัพธ์: database_staging_setup.sql
 *
 * ทำเป็นสคริปต์ไม่ใช่ก๊อปมือ เพราะทุกครั้งที่เพิ่ม patch ใหม่ต้อง regenerate ให้ตรงกัน
 * ถ้าเพิ่ม patch แล้วลืมใส่ในลิสต์นี้ สคริปต์จะ error ไม่ให้ผ่านเงียบ ๆ
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"

const BASE = "schema_multi_workspace.sql"

/**
 * ลำดับสำคัญ — เรียงตาม dependency ไม่ใช่ตามตัวอักษร
 * เหตุผลของแต่ละช่วงเขียนกำกับไว้ เพราะสลับลำดับแล้วจะ error แบบงง ๆ
 */
const ORDER = [
  // 1) แก้ trigger สร้าง user ก่อน (ไม่พึ่งอะไร แต่กระทบทุกอย่างที่ตามมา)
  "database_patch_fix_handle_new_user_workspace_fallback.sql",

  // 2) คอลัมน์ภาษี/VAT — bills.vat_amount ต้องมีก่อน patch ที่อ้างถึง
  "database_patch_add_vat_pp30.sql",
  "database_patch_add_pp30_output_vat_manual.sql",

  // 3) อาคาร + ค่าน้ำไฟหารตามสัดส่วน — เพิ่ม bills.building_id
  "database_patch_add_building_utility_billing.sql",
  "database_patch_add_staff_building_access.sql",

  // 4) ย้ายห้อง + โหมดจดมิเตอร์
  "database_patch_add_tenant_room_transfers.sql",
  "database_patch_add_meter_entry_mode.sql",

  // 5) room_id ขั้นที่ 1 — ต้องมาก่อนชุด identity ทั้งหมด
  "database_patch_add_room_id_to_meters_bills.sql",

  // 6) RLS ผู้เช่า (ถูกเขียนทับอีกครั้งใน identity_2 แต่ต้องมีสถานะกลางให้ถูก)
  "database_patch_fix_tenant_rls_scope.sql",

  // 7) room_id ขั้นที่ 2-3 — ลำดับ 1 → 2 → 3 ห้ามสลับ
  //    identity_2 มี guard เช็คว่า identity_1 รันแล้วจริง ถ้าสลับจะ raise exception
  "database_patch_room_id_identity_1_additive.sql",
  "database_patch_room_id_identity_2_switch.sql",
  "database_patch_room_id_identity_3_close_null_building_gap.sql",

  // 8) snapshot องค์ประกอบบิล
  "database_patch_add_bill_snapshot.sql",

  // 9) ที่เหลือ ไม่พึ่งกัน
  "database_patch_add_saas_payments_manual_review.sql",
  "database_patch_add_saas_payments_archived_drive_url.sql",
  "database_patch_add_super_admin_line_settings.sql",
  "database_patch_add_super_admin_line_connection.sql",
  "database_patch_add_super_admin_line_quota_behavior.sql",
  "database_patch_add_workspace_google_drive_settings.sql",
]

// schema.sql = สคีมารุ่นเก่าก่อนรองรับหลาย workspace ไม่ใช้แล้ว (schema_multi_workspace.sql แทน)
const IGNORED = new Set(["schema.sql", BASE, "database_staging_setup.sql"])

const onDisk = readdirSync(".").filter(f => f.endsWith(".sql"))
const missing = onDisk.filter(f => !IGNORED.has(f) && !ORDER.includes(f))
if (missing.length) {
  console.error("มี patch ที่ยังไม่ได้ใส่ลำดับใน ORDER — เพิ่มก่อนแล้วรันใหม่:")
  for (const m of missing) console.error("  " + m)
  process.exit(1)
}
const notFound = ORDER.filter(f => !onDisk.includes(f))
if (notFound.length) {
  console.error("ORDER อ้างไฟล์ที่ไม่มีอยู่: " + notFound.join(", "))
  process.exit(1)
}

const bar = "-".repeat(78)
const out = [
  bar,
  "-- HorSet — ติดตั้งฐานข้อมูลใหม่ตั้งแต่ต้น (schema + patch ทุกไฟล์ รวมเป็นไฟล์เดียว)",
  bar,
  "--",
  "-- ไฟล์นี้สร้างอัตโนมัติจาก scripts/build-staging-sql.mjs — ห้ามแก้ไฟล์นี้ตรง ๆ",
  "-- ถ้าต้องแก้ ให้แก้ไฟล์ต้นทางแล้วรัน `npm run build:sql` ใหม่",
  "--",
  "-- ใช้กับ: ฐานข้อมูลเปล่าที่เพิ่งสร้าง (เช่น Supabase project สำหรับ staging/ทดสอบ)",
  "--",
  "-- ⚠️ ห้ามรันกับ production ที่มีข้อมูลอยู่แล้ว — ให้รัน patch แยกไฟล์ทีละตัวตามปกติ",
  "--    ทุกคำสั่งเขียนแบบรันซ้ำได้ (if not exists) แต่ชุด identity_2 มีการ DROP constraint",
  "--    ซึ่งถ้ารันตอนโค้ดเวอร์ชันเก่ายังทำงานอยู่ การออกบิลจะพังทันที",
  "--",
  "-- วิธีใช้: คัดลอกทั้งไฟล์ไปวางใน Supabase SQL Editor แล้วกด Run ครั้งเดียว",
  "--         ถ้าเจอ error ให้ดูว่า error อยู่ในส่วนของไฟล์ไหน (มีหัวข้อคั่นไว้ทุกไฟล์)",
  "--",
  `-- รวม ${ORDER.length + 1} ไฟล์:`,
  `--   1. ${BASE}  (สคีมาหลัก)`,
  ...ORDER.map((f, i) => `--   ${i + 2}. ${f}`),
  bar,
  "",
]

let totalLines = 0
for (const [i, file] of [BASE, ...ORDER].entries()) {
  const body = readFileSync(file, "utf8").replace(/\r\n/g, "\n").trimEnd()
  totalLines += body.split("\n").length
  out.push(
    "",
    bar,
    `-- [${i + 1}/${ORDER.length + 1}]  ${file}`,
    bar,
    "",
    body,
    ""
  )
}

writeFileSync("database_staging_setup.sql", out.join("\n") + "\n", "utf8")
console.log(`สร้าง database_staging_setup.sql — รวม ${ORDER.length + 1} ไฟล์ ${totalLines} บรรทัด`)
