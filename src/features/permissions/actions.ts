"use server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getCurrentUserProfileAction } from "@/features/auth/actions"

import { type StaffPermissions, DEFAULT_STAFF_PERMISSIONS } from "./types"

// Check if we are running in Demo mode
const isDemoMode = () => {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
}

// Helper to create Supabase Admin Client
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey || serviceKey.includes("placeholder")) {
    throw new Error("กรุณาตั้งค่า SUPABASE_SERVICE_ROLE_KEY ในไฟล์ .env ของเซิร์ฟเวอร์ก่อนใช้งาน")
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * ดึงรายการ Staff ทั้งหมดใน Workspace ของตนเอง (หรือทั้งหมดในระบบถ้าเป็น Super Admin)
 */
export async function getWorkspaceStaffAction(workspaceId?: string) {
  try {
    const isDemo = isDemoMode()
    
    // 1. ดึงข้อมูล User ปัจจุบัน
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || !profileRes.data) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" }
    }

    const currentUser = profileRes.data
    const isSuperAdmin = currentUser.role === "super_admin"
    const isAdmin = currentUser.role === "admin"

    if (!isAdmin && !isSuperAdmin) {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้ (สงวนไว้สำหรับ Admin / Super Admin เท่านั้น)" }
    }

    // กำหนด Workspace ID ที่จะดึงข้อมูล
    const targetWorkspaceId = workspaceId || currentUser.workspace_id

    if (isDemo) {
      // Mock data ในโหมดเดโม
      const mockStaffs = [
        {
          id: "mock-staff-1",
          email: "staff.john@horset.com",
          full_name: "สมชาย แสนสุข (Staff ทดลอง)",
          phone: "081-234-5678",
          role: "staff" as const,
          workspace_id: targetWorkspaceId,
          created_at: new Date().toISOString(),
          permissions: {
            view_dashboard_stats: false,
            manage_rooms_tenants: true,
            manage_meters_bills: true,
            manage_bills: true,
            manage_finance_expenses: false,
            access_tax: false,
            manage_finance_settings: false,
            manage_staff_permissions: false,
            billing_send_line: true,
            billing_download_pdf: true,
            billing_copy_summary: true
          }
        },
        {
          id: "mock-staff-2",
          email: "staff.jane@horset.com",
          full_name: "สมหญิง เจริญยิ่ง (Staff ทดลอง)",
          phone: "089-876-5432",
          role: "staff" as const,
          workspace_id: targetWorkspaceId,
          created_at: new Date().toISOString(),
          permissions: {
            view_dashboard_stats: true,
            manage_rooms_tenants: false,
            manage_meters_bills: true,
            manage_bills: false,
            manage_finance_expenses: true,
            access_tax: false,
            manage_finance_settings: false,
            manage_staff_permissions: false,
            billing_send_line: false,
            billing_download_pdf: true,
            billing_copy_summary: false
          }
        }
      ]
      return { success: true, data: mockStaffs }
    }

    const supabaseAdmin = getSupabaseAdmin()

    // ค้นหารายชื่อผู้ใช้ที่มีบทบาทเป็น staff
    let query = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, phone, role, workspace_id, created_at, permissions")
      .eq("role", "staff")

    // ถ้าไม่ได้เป็น Super Admin บังคับดึงเฉพาะ Workspace ตัวเองเท่านั้น
    if (!isSuperAdmin) {
      if (!targetWorkspaceId) {
        return { success: true, data: [] }
      }
      query = query.eq("workspace_id", targetWorkspaceId)
    } else if (targetWorkspaceId) {
      // Super admin สามารถเจาะจง workspace ได้
      query = query.eq("workspace_id", targetWorkspaceId)
    }

    const { data: profiles, error } = await query.order("created_at", { ascending: false })

    if (error) throw error

    // ทำการแปลงค่า permissions ให้อยู่ในรูปแบบที่ถูกต้อง เผื่อมีบางคนใน DB เป็น null
    const sanitizedStaffs = (profiles || []).map(p => {
      let perms = DEFAULT_STAFF_PERMISSIONS
      if (p.permissions) {
        if (typeof p.permissions === "string") {
          try {
            perms = JSON.parse(p.permissions)
          } catch (e) {
            perms = DEFAULT_STAFF_PERMISSIONS
          }
        } else {
          perms = p.permissions as any
        }
      }
      return {
        ...p,
        permissions: {
          view_dashboard_stats: perms.view_dashboard_stats !== undefined ? perms.view_dashboard_stats : DEFAULT_STAFF_PERMISSIONS.view_dashboard_stats,
          manage_rooms_tenants: perms.manage_rooms_tenants !== undefined ? perms.manage_rooms_tenants : DEFAULT_STAFF_PERMISSIONS.manage_rooms_tenants,
          manage_meters_bills: perms.manage_meters_bills !== undefined ? perms.manage_meters_bills : DEFAULT_STAFF_PERMISSIONS.manage_meters_bills,
          manage_bills: perms.manage_bills !== undefined ? perms.manage_bills : DEFAULT_STAFF_PERMISSIONS.manage_bills,
          manage_finance_expenses: perms.manage_finance_expenses !== undefined ? perms.manage_finance_expenses : DEFAULT_STAFF_PERMISSIONS.manage_finance_expenses,
          access_tax: perms.access_tax !== undefined ? perms.access_tax : DEFAULT_STAFF_PERMISSIONS.access_tax,
          manage_finance_settings: perms.manage_finance_settings !== undefined ? perms.manage_finance_settings : DEFAULT_STAFF_PERMISSIONS.manage_finance_settings,
          manage_staff_permissions: perms.manage_staff_permissions !== undefined ? perms.manage_staff_permissions : DEFAULT_STAFF_PERMISSIONS.manage_staff_permissions,
          billing_send_line: perms.billing_send_line !== undefined ? perms.billing_send_line : DEFAULT_STAFF_PERMISSIONS.billing_send_line,
          billing_download_pdf: perms.billing_download_pdf !== undefined ? perms.billing_download_pdf : DEFAULT_STAFF_PERMISSIONS.billing_download_pdf,
          billing_copy_summary: perms.billing_copy_summary !== undefined ? perms.billing_copy_summary : DEFAULT_STAFF_PERMISSIONS.billing_copy_summary,
        }
      }
    })

    return { success: true, data: JSON.parse(JSON.stringify(sanitizedStaffs)) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล Staff" }
  }
}

/**
 * สร้าง Staff บัญชีใหม่ใน Workspace
 */
export async function createWorkspaceStaffAction(data: {
  email: string
  password?: string
  fullName: string
  phone: string
  permissions: StaffPermissions
  workspaceId?: string
}) {
  try {
    const isDemo = isDemoMode()
    
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || !profileRes.data) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" }
    }

    const currentUser = profileRes.data
    const isSuperAdmin = currentUser.role === "super_admin"
    const isAdmin = currentUser.role === "admin"

    if (!isAdmin && !isSuperAdmin) {
      return { success: false, error: "คุณไม่มีสิทธิ์สร้าง Staff" }
    }

    const targetWorkspaceId = data.workspaceId || currentUser.workspace_id
    if (!targetWorkspaceId) {
      return { success: false, error: "ไม่พบ Workspace ID สำหรับผู้ใช้ปัจจุบัน" }
    }

    if (isDemo) {
      return {
        success: true,
        message: "Demo Mode: จำลองการเพิ่มบัญชี Staff ใหม่เสร็จสมบูรณ์"
      }
    }

    const supabaseAdmin = getSupabaseAdmin()

    // 1. สร้างบัญชีผู้ใช้งานใหม่ลงในระบบ Supabase Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password || "123456", // รหัสดีฟอลต์ถ้าไม่ได้ใส่
      email_confirm: true,
      user_metadata: {
        role: "staff",
        full_name: data.fullName,
        phone: data.phone,
        workspace_id: targetWorkspaceId
      }
    })

    if (authError) {
      throw authError
    }

    // 2. อัปเดตตาราง public.profiles เพื่อบันทึกค่าสิทธิ์ permissions เพิ่มเติม
    // (เนื่องจาก Trigger sync profiles จะทำงานอัตโนมัติแล้ว เราจึง update ซ้ำเพื่อใส่ permissions)
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        permissions: data.permissions,
        updated_at: new Date().toISOString()
      })
      .eq("id", authUser.user.id)

    if (updateError) {
      // หากตาราง profiles ไม่ยอมบันทึก permissions (เช่น ยังไม่ได้รัน DDL patch)
      // เราจะเซฟแบบไม่มีสิทธิ์ค้างไว้เพื่อไม่ให้เกิดบล็อค หรือแจ้งเตือนให้ผู้ใช้อัปเกรด DB
      console.warn("ไม่สามารถบันทึกสิทธิ์ลงคอลัมน์ permissions ได้: ตรวจสอบว่าได้รันสคริปต์ SQL patch หรือยัง", updateError.message)
    }

    return { success: true, data: { id: authUser.user.id, email: authUser.user.email } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการสร้างบัญชี Staff" }
  }
}

/**
 * อัปเดตข้อมูลและสิทธิ์ของ Staff
 */
export async function updateStaffPermissionsAction(
  staffId: string,
  data: {
    fullName: string
    phone: string
    permissions: StaffPermissions
  }
) {
  try {
    const isDemo = isDemoMode()
    
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || !profileRes.data) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" }
    }

    const currentUser = profileRes.data
    const isSuperAdmin = currentUser.role === "super_admin"
    const isAdmin = currentUser.role === "admin"

    if (!isAdmin && !isSuperAdmin) {
      return { success: false, error: "คุณไม่มีสิทธิ์แก้ไขสิทธิ์ Staff" }
    }

    if (isDemo) {
      return { success: true, message: "Demo Mode: จำลองการบันทึกสิทธิ์ Staff เสร็จสิ้น" }
    }

    const supabaseAdmin = getSupabaseAdmin()

    // 1. ตรวจสอบให้มั่นใจว่าผู้ที่จะถูกแก้เป็น Staff ใน Workspace เดียวกัน (หรือถ้าเป็น Super Admin จะทำอะไรก็ได้)
    const { data: targetProfile, error: getError } = await supabaseAdmin
      .from("profiles")
      .select("role, workspace_id")
      .eq("id", staffId)
      .single()

    if (getError || !targetProfile) {
      return { success: false, error: "ไม่พบข้อมูล Staff คนดังกล่าวในระบบ" }
    }

    if (targetProfile.role !== "staff") {
      return { success: false, error: "ผู้ใช้นี้ไม่ใช่ Staff (ไม่สามารถแก้ไขสิทธิ์ผ่านช่องทางนี้ได้)" }
    }

    if (!isSuperAdmin && targetProfile.workspace_id !== currentUser.workspace_id) {
      return { success: false, error: "คุณไม่มีสิทธิ์แก้ไขข้อมูลผู้ใช้นอก Workspace ของคุณ" }
    }

    // 2. อัปเดตข้อมูลในตาราง public.profiles
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        phone: data.phone,
        permissions: data.permissions,
        updated_at: new Date().toISOString()
      })
      .eq("id", staffId)

    if (updateError) throw updateError

    // 3. อัปเดตข้อมูล metadata ในระบบ Auth ด้วย เพื่อความปลอดภัยและทำงานสอดคล้องกัน
    try {
      await supabaseAdmin.auth.admin.updateUserById(staffId, {
        user_metadata: {
          full_name: data.fullName,
          phone: data.phone
        }
      })
    } catch (authMetaErr) {
      console.error("Failed to sync updated auth metadata for staff user", authMetaErr)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอัปเดตสิทธิ์ Staff" }
  }
}

/**
 * ลบบัญชี Staff ออกจากระบบ
 */
export async function deleteStaffAction(staffId: string) {
  try {
    const isDemo = isDemoMode()
    
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || !profileRes.data) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" }
    }

    const currentUser = profileRes.data
    const isSuperAdmin = currentUser.role === "super_admin"
    const isAdmin = currentUser.role === "admin"

    if (!isAdmin && !isSuperAdmin) {
      return { success: false, error: "คุณไม่มีสิทธิ์ลบบัญชีผู้ใช้" }
    }

    if (isDemo) {
      return { success: true, message: "Demo Mode: จำลองการลบบัญชี Staff สำเร็จ" }
    }

    const supabaseAdmin = getSupabaseAdmin()

    // ตรวจสอบความถูกต้องของสิทธิ์และ Workspace
    const { data: targetProfile, error: getError } = await supabaseAdmin
      .from("profiles")
      .select("role, workspace_id")
      .eq("id", staffId)
      .single()

    if (getError || !targetProfile) {
      return { success: false, error: "ไม่พบข้อมูล Staff ในระบบ" }
    }

    if (targetProfile.role !== "staff") {
      return { success: false, error: "คุณสามารถลบได้เฉพาะผู้ใช้ที่มีสิทธิ์ Staff เท่านั้น" }
    }

    if (!isSuperAdmin && targetProfile.workspace_id !== currentUser.workspace_id) {
      return { success: false, error: "คุณไม่มีสิทธิ์ลบบัญชีผู้อื่นนอกเหนือจาก Workspace ของตนเอง" }
    }

    // ลบผู้ใช้ผ่าน Auth Admin API (ระบบ Cascade จะลบข้อมูล profiles อัตโนมัติ)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(staffId)

    if (deleteError) throw deleteError

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบบัญชี Staff" }
  }
}
