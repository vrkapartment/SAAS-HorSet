"use server"

import { createClient } from "@/lib/supabase/server"

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
 */
export async function getActiveTaxFormTemplateAction(formType: "90" | "94", taxYear: string) {
  try {
    const supabase = await createClient()

    let query = supabase
      .from("tax_form_templates")
      .select("file_url, file_name, tax_year")
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
