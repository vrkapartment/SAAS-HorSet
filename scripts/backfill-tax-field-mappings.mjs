// สคริปต์ backfill mapping สำหรับ template ภ.ง.ด. 90 ที่อัปโหลดไว้แล้วในปัจจุบัน (form_type='90')
// ใช้ DEFAULT_PND90_MAPPING จาก src/lib/pdfHelper.ts เป็นต้นฉบับตรงๆ (ไม่พิมพ์ค่าซ้ำในสคริปต์นี้)
// เพื่อให้ระบบ Visual Field Mapping มีจุดเริ่มต้นที่ "ถูกต้องเหมือนเดิม" ก่อนที่ Super Admin จะเข้ามาแก้ไขต่อผ่าน UI
//
// วิธีรัน (ครั้งเดียว หลัง apply database_patch_tax_form_field_mappings.sql แล้ว):
//   node scripts/backfill-tax-field-mappings.mjs
//
// สคริปต์นี้ทำงานแบบ idempotent — ถ้า template นั้นมี mapping อยู่แล้ว (ไม่ว่าจากรอบก่อนหรือจากที่ Super Admin แก้เอง)
// จะข้ามไปเลย ไม่ทับข้อมูลที่มีอยู่ ต้องการรีเซ็ตให้ลบแถวใน tax_form_field_mappings ของ template นั้นออกก่อนแล้วรันใหม่

import fs from "fs"
import { createClient } from "@supabase/supabase-js"

function loadEnv() {
  const env = {}
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue
    const content = fs.readFileSync(file, "utf8")
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
  }
  return env
}

async function main() {
  const env = loadEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error("ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน .env/.env.local")
    process.exit(1)
  }

  const { DEFAULT_PND90_MAPPING, DEFAULT_PND94_MAPPING } = await import("../src/lib/pdfHelper.ts")
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  async function backfillForFormType(formType, defaultMapping) {
    const { data: templates, error } = await supabase
      .from("tax_form_templates")
      .select("id, file_name, tax_year")
      .eq("form_type", formType)
    if (error) throw error
    if (!templates || templates.length === 0) {
      console.log(`[${formType}] ไม่มี template ที่อัปโหลดไว้ ข้าม`)
      return
    }

    for (const template of templates) {
      const { count, error: countError } = await supabase
        .from("tax_form_field_mappings")
        .select("id", { count: "exact", head: true })
        .eq("template_id", template.id)
        .is("deleted_at", null)
      if (countError) throw countError

      if (count && count > 0) {
        console.log(`[${formType}] template ${template.id} (${template.file_name}) มี mapping อยู่แล้ว ${count} แถว ข้าม`)
        continue
      }

      const rows = defaultMapping.map((m) => ({
        template_id: template.id,
        logical_key: m.logicalKey,
        field_kind: m.fieldKind,
        physical_field_name: m.physicalFieldName,
        option_key: m.optionKey ?? null,
        widget_index: m.widgetIndex ?? null,
        value_format: m.valueFormat ?? null,
      }))
      const { error: insertError } = await supabase.from("tax_form_field_mappings").insert(rows)
      if (insertError) throw insertError
      console.log(`[${formType}] template ${template.id} (${template.file_name}) backfill สำเร็จ ${rows.length} แถว`)
    }
  }

  await backfillForFormType("90", DEFAULT_PND90_MAPPING)
  await backfillForFormType("94", DEFAULT_PND94_MAPPING)
}

main().catch((err) => {
  console.error("Backfill ล้มเหลว:", err)
  process.exit(1)
})
