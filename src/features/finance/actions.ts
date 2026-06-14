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
}

/**
 * ดึงข้อมูลการตั้งค่าการเงินและพร้อมเพย์ของ Workspace ที่กำหนด
 */
export async function getFinanceSettings(workspaceId: string) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("workspaces")
      .select("tax_firstname, tax_lastname, tax_id, tax_address, tax_phone, promptpay_type, promptpay_id, promptpay_name, common_fee")
      .eq("id", workspaceId)
      .single()

    if (error) {
      // ตรวจสอบว่าคอลัมน์ไม่มีอยู่ในตารางหรือไม่ (undefined_column)
      const isMissingColumn = 
        error.message.includes("column") || 
        error.code === "42703"

      if (isMissingColumn) {
        return { 
          success: true, 
          fallback: true,
          data: null,
          message: "Database columns not created yet. Falling back to local storage." 
        }
      }
      throw error
    }

    return { 
      success: true, 
      data: {
        tax_firstname: data.tax_firstname || "",
        tax_lastname: data.tax_lastname || "",
        tax_id: data.tax_id || "",
        tax_address: data.tax_address || "",
        tax_phone: data.tax_phone || "",
        promptpay_type: (data.promptpay_type as "phone" | "national_id") || "phone",
        promptpay_id: data.promptpay_id || "",
        promptpay_name: data.promptpay_name || "",
        common_fee: Number(data.common_fee || 50)
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

    // 2. ทำการอัปเดตข้อมูลตาราง workspaces
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
        common_fee: Number(settings.common_fee)
      })
      .eq("id", workspaceId)

    if (updateError) {
      const isMissingColumn = 
        updateError.message.includes("column") || 
        updateError.code === "42703"

      if (isMissingColumn) {
        return { 
          success: true, 
          fallback: true,
          message: "Database columns not created yet. Simulating save using local storage fallback." 
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
