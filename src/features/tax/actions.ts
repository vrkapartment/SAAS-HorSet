"use server"

import { createClient } from "@/lib/supabase/server"
import type { PndFieldMapping, PndFieldFormat } from "@/lib/pdfHelper"

/**
 * ฟังก์ชันจำลองสำหรับการส่งออก/คำนวณข้อมูลยื่นภาษี
 */
export async function exportTaxPlaceholder() {
  try {
    const supabase = await createClient()

    // TODO: พัฒนาระบบคำนวณและสรุปข้อมูลรายได้เพื่อกรอกแบบยื่นภาษีเงินได้บุคคลธรรมดาในอนาคต

    return { success: true, data: "ดาวน์โหลดข้อมูลรายงานภาษีสำเร็จ (ตัวอย่าง)" }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
    return { success: false, error: errorMessage }
  }
}

/**
 * ดึง PDF template ของแบบฟอร์ม ภ.ง.ด. 90/94 ที่ Super Admin อัปโหลดไว้ล่าสุด (ถ้ามี)
 * ภ.ง.ด. 90 ใช้ template เดียวข้ามทุกปี (ไม่สน taxYear), ภ.ง.ด. 94 ผูกกับปีภาษีเฉพาะเจาะจง
 * คืนค่า data: null เมื่อยังไม่มีการอัปโหลด เพื่อให้ผู้เรียก fallback ไปใช้ไฟล์เริ่มต้นของระบบ
 * เอา id มาด้วยเพื่อใช้ query mapping field ต่อ (getTaxFormFieldMappingsAction) — ดูระบบ Visual Field Mapping ใน pdfHelper.ts
 */
export async function getActiveTaxFormTemplateAction(formType: "90" | "94", taxYear: string) {
  try {
    const supabase = await createClient()

    let query = supabase
      .from("tax_form_templates")
      .select("id, file_url, file_name, tax_year")
      .eq("form_type", formType)

    if (formType === "94") {
      query = query.eq("tax_year", taxYear)
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle()

    if (error) throw error

    return { success: true, data: data || null }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลด PDF template"
    return { success: false, error: errorMessage, data: null }
  }
}

/**
 * ดึง mapping "field ทางกายภาพ <-> ความหมายเชิงตรรกะ" ของ template หนึ่งไฟล์ (ดูตาราง tax_form_field_mappings)
 * คืนค่าเป็นรูปแบบเดียวกับ PndFieldMapping[] ของ pdfHelper.ts พร้อมส่งให้ generatePndPdf() ใช้ได้เลย
 * data: [] เมื่อยังไม่มีการ map (เช่น template เพิ่งอัปโหลดยังไม่ได้ตั้งค่า) — ผู้เรียกจะ fallback ไปใช้ DEFAULT_PND90/94_MAPPING เอง
 */
export async function getTaxFormFieldMappingsAction(templateId: string) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("tax_form_field_mappings")
      .select("logical_key, field_kind, physical_field_name, option_key, widget_index, value_format")
      .eq("template_id", templateId)
      .is("deleted_at", null)

    if (error) throw error

    const mappings: PndFieldMapping[] = (data || []).map((row) => ({
      logicalKey: row.logical_key,
      fieldKind: row.field_kind as "text" | "radio",
      physicalFieldName: row.physical_field_name,
      optionKey: row.option_key ?? undefined,
      widgetIndex: row.widget_index ?? undefined,
      valueFormat: (row.value_format as PndFieldFormat) ?? undefined,
    }))

    return { success: true, data: mappings }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลด field mapping"
    return { success: false, error: errorMessage, data: [] as PndFieldMapping[] }
  }
}
