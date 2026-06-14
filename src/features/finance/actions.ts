"use server"

import { createClient } from "@/lib/supabase/server"

export interface FinanceSettings {
  tax_firstname: string
  tax_lastname: string
  tax_id: string
  tax_address: string
  tax_phone: string
  promptpay_type: "phone" | "national_id"
  promptpay_id: string
  promptpay_name: string
  common_fee: number
  water_rate: number
  electric_rate: number
  water_min_checked: boolean
  water_min_unit: number
  electric_min_checked: boolean
  electric_min_unit: number
}

/**
 * ดึงข้อมูลการตั้งค่าการเงินและพร้อมเพย์ของ Workspace ที่กำหนด
 */
export async function getFinanceSettings(workspaceId: string) {
  try {
    const supabase = await createClient()

    // 1. ดึงข้อมูลส่วนข้อมูลหลัก (ที่รับประกันว่ามีอยู่ในตารางแน่ๆ)
    const { data: coreData, error: coreError } = await supabase
      .from("workspaces")
      .select("tax_firstname, tax_lastname, tax_id, tax_address, tax_phone, promptpay_type, promptpay_id, promptpay_name, common_fee")
      .eq("id", workspaceId)
      .single()

    if (coreError) {
      throw coreError
    }

    // 2. ดึงข้อมูลค่าน้ำค่าไฟเพิ่มเติม (ซึ่งอาจจะยังไม่ได้รัน SQL เพิ่มคอลัมน์)
    let utilityData: any = null
    const { data: utData, error: utError } = await supabase
      .from("workspaces")
      .select("water_rate, electric_rate, water_min_checked, water_min_unit, electric_min_checked, electric_min_unit")
      .eq("id", workspaceId)
      .single()

    if (!utError) {
      utilityData = utData
    } else {
      console.warn("Utility columns (water_rate, etc.) not available yet in table workspaces. Using defaults.")
    }

    const merged = {
      ...coreData,
      ...(utilityData || {
        water_rate: 18,
        electric_rate: 7,
        water_min_checked: true,
        water_min_unit: 3,
        electric_min_checked: true,
        electric_min_unit: 10
      })
    }

    return { 
      success: true, 
      data: {
        tax_firstname: merged.tax_firstname || "",
        tax_lastname: merged.tax_lastname || "",
        tax_id: merged.tax_id || "",
        tax_address: merged.tax_address || "",
        tax_phone: merged.tax_phone || "",
        promptpay_type: (merged.promptpay_type as "phone" | "national_id") || "phone",
        promptpay_id: merged.promptpay_id || "",
        promptpay_name: merged.promptpay_name || "",
        common_fee: Number(merged.common_fee || 50),
        water_rate: Number(merged.water_rate !== null && merged.water_rate !== undefined ? merged.water_rate : 18),
        electric_rate: Number(merged.electric_rate !== null && merged.electric_rate !== undefined ? merged.electric_rate : 7),
        water_min_checked: Boolean(merged.water_min_checked !== null && merged.water_min_checked !== undefined ? merged.water_min_checked : true),
        water_min_unit: Number(merged.water_min_unit !== null && merged.water_min_unit !== undefined ? merged.water_min_unit : 3),
        electric_min_checked: Boolean(merged.electric_min_checked !== null && merged.electric_min_checked !== undefined ? merged.electric_min_checked : true),
        electric_min_unit: Number(merged.electric_min_unit !== null && merged.electric_min_unit !== undefined ? merged.electric_min_unit : 10)
      } as FinanceSettings 
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลการเงิน"
    return { success: false, error: errorMessage }
  }
}

/**
 * บันทึกการตั้งค่าการเงินและพร้อมเพย์ของ Workspace โดยจำกัดสิทธิ์เฉพาะ Admin ของ Workspace นั้นๆ เท่านั้น
 */
export async function saveFinanceSettings(workspaceId: string, settings: FinanceSettings) {
  try {
    const supabase = await createClient()

    // 1. ตรวจสอบสิทธิ์ผู้ใช้ปัจจุบัน (Authentication & Authorization)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "ไม่ได้เข้าสู่ระบบหรือเซสชันหมดอายุ" }
    }

    // ดึงโปรไฟล์ตรวจสอบสิทธิ์ว่าเป็น Admin หรือ Super Admin และตรงกับ workspace_id หรือไม่
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, workspace_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return { success: false, error: "ไม่พบข้อมูลสิทธิ์ผู้ใช้งาน" }
    }

    const isAdmin = profile.role === "admin" || profile.role === "super_admin"
    const isSameWorkspace = profile.workspace_id === workspaceId || profile.role === "super_admin"

    if (!isAdmin || !isSameWorkspace) {
      return { success: false, error: "ขออภัย คุณไม่มีสิทธิ์ (Workspace Admin) ในการจัดการข้อมูลส่วนนี้" }
    }

    // 2. พยายามอัปเดตข้อมูลทั้งหมดรวมทั้งค่าน้ำค่าไฟในตาราง workspaces
    const { error: updateError } = await supabase
      .from("workspaces")
      .update({
        tax_firstname: settings.tax_firstname.trim(),
        tax_lastname: settings.tax_lastname.trim(),
        tax_id: settings.tax_id.trim(),
        tax_address: settings.tax_address.trim(),
        tax_phone: settings.tax_phone.trim(),
        promptpay_type: settings.promptpay_type,
        promptpay_id: settings.promptpay_id.trim(),
        promptpay_name: settings.promptpay_name.trim(),
        common_fee: Number(settings.common_fee),
        water_rate: Number(settings.water_rate),
        electric_rate: Number(settings.electric_rate),
        water_min_checked: Boolean(settings.water_min_checked),
        water_min_unit: Number(settings.water_min_unit),
        electric_min_checked: Boolean(settings.electric_min_checked),
        electric_min_unit: Number(settings.electric_min_unit)
      })
      .eq("id", workspaceId)

    if (updateError) {
      const isMissingColumn = 
        updateError.message.includes("column") || 
        updateError.code === "42703"

      if (isMissingColumn) {
        // หากคอลัมน์ค่าน้ำค่าไฟไม่มี ให้บันทึกเฉพาะส่วนโครงสร้างหลักที่รับประกันว่ามีแน่นอน
        const { error: coreUpdateError } = await supabase
          .from("workspaces")
          .update({
            tax_firstname: settings.tax_firstname.trim(),
            tax_lastname: settings.tax_lastname.trim(),
            tax_id: settings.tax_id.trim(),
            tax_address: settings.tax_address.trim(),
            tax_phone: settings.tax_phone.trim(),
            promptpay_type: settings.promptpay_type,
            promptpay_id: settings.promptpay_id.trim(),
            promptpay_name: settings.promptpay_name.trim(),
            common_fee: Number(settings.common_fee)
          })
          .eq("id", workspaceId)

        if (coreUpdateError) {
          throw coreUpdateError
        }

        return { 
          success: true, 
          fallback: true,
          message: "บันทึกเฉพาะข้อมูลภาษีและพร้อมเพย์สำเร็จแล้ว! (เนื่องจากคอลัมน์ค่าน้ำค่าไฟยังไม่ได้เปิดใช้งานในระบบฐานข้อมูลของคุณ)" 
        }
      }
      throw updateError
    }

    return { success: true, message: "บันทึกข้อมูลเข้าฐานข้อมูลเรียบร้อยแล้ว!" }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูลการเงิน"
    return { success: false, error: errorMessage }
  }
}
