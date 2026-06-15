"use server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getCurrentUserProfileAction } from "@/features/auth/actions"

interface CreateUserParams {
  email: string
  password?: string
  fullName: string
  phone: string
  role: "admin" | "staff" | "tenant"
  workspaceId: string
}

/**
 * Server Action สำหรับการสร้างบัญชีผู้ใช้งานในระบบจริงผ่าน Supabase Auth Admin API
 * ซึ่งจะสามารถกำหนดรหัสผ่าน (Password) และทำการกดยืนยันอีเมล (Auto Confirm) ได้ทันที
 */
export async function createWorkspaceUserAction(data: CreateUserParams) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (!isDemo) {
      const profileRes = await getCurrentUserProfileAction()
      if (!profileRes.success || profileRes.data?.role !== "super_admin") {
        return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
      }
    }

    if (isDemo) {
      return { 
        success: true, 
        message: "Demo Mode: จำลองการสร้างบัญชีผู้ใช้งานเสร็จสิ้น" 
      }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceKey || serviceKey.includes("placeholder")) {
      return { 
        success: false, 
        error: "ไม่สามารถเชื่อมต่อ Auth Admin API ได้: กรุณาตั้งค่า SUPABASE_SERVICE_ROLE_KEY (Service Role Key) ในไฟล์ .env ฝั่งเซิร์ฟเวอร์ก่อนใช้งาน" 
      }
    }

    // สร้าง admin client สำหรับเข้าถึง Auth API ฝั่งเซิร์ฟเวอร์แบบข้าม RLS
    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 1. สร้างผู้ใช้งานลงในระบบ Supabase Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password || "123456", // รหัสผ่านดีฟอลต์หากไม่ได้กรอก
      email_confirm: true, // ทำการ Auto-confirm อีเมลเพื่อล็อกอินได้ทันทีโดยไม่ต้องคลิกลิงก์กดยืนยัน
      user_metadata: {
        role: data.role,
        full_name: data.fullName,
        phone: data.phone,
        workspace_id: data.workspaceId
      }
    })

    if (authError) {
      throw authError
    }

    // หมายเหตุ: ตาราง public.profiles จะได้รับการสร้างและอัปเดตข้อมูลโดยอัตโนมัติ
    // ผ่าน PostgreSQL Trigger "on_auth_user_created" บนระบบ Supabase Database
    
    return { 
      success: true, 
      data: {
        id: authUser.user.id,
        email: authUser.user.email,
        role: data.role
      } 
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการสร้างบัญชีผู้ใช้งานจริง"
    return { success: false, error: errorMessage }
  }
}

/**
 * อัปเดตข้อมูลและสิทธิ์ของผู้ใช้ผ่าน Admin API ฝั่งเซิร์ฟเวอร์แบบข้าม RLS
 */
export async function updateUserProfileAdminAction(profileId: string, data: {
  role: "admin" | "staff" | "tenant" | "super_admin"
  workspaceId: string | null
  fullName: string | null
  phone: string | null
}) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (!isDemo) {
      const profileRes = await getCurrentUserProfileAction()
      if (!profileRes.success || profileRes.data?.role !== "super_admin") {
        return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
      }
    }

    if (isDemo) {
      return { success: true }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceKey || serviceKey.includes("placeholder")) {
      return { success: false, error: "กรุณาตั้งค่า SUPABASE_SERVICE_ROLE_KEY" }
    }

    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        role: data.role,
        workspace_id: data.workspaceId,
        full_name: data.fullName,
        phone: data.phone,
        updated_at: new Date().toISOString()
      })
      .eq("id", profileId)

    if (error) throw error

    // อัปเดตข้อมูลในระบบ Auth ด้วยเพื่อความสอดคล้องกัน (เช่น metadata)
    try {
      await supabaseAdmin.auth.admin.updateUserById(profileId, {
        user_metadata: {
          role: data.role,
          workspace_id: data.workspaceId,
          full_name: data.fullName,
          phone: data.phone
        }
      })
    } catch (authErr) {
      console.warn("Auth user metadata update warning:", authErr)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอัปเดตข้อมูลผู้ใช้" }
  }
}

/**
 * ลบ/ถอนสิทธิ์ผู้ใช้ออกจากระบบผ่าน Admin API ฝั่งเซิร์ฟเวอร์แบบข้าม RLS
 */
export async function deleteUserProfileAdminAction(profileId: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (!isDemo) {
      const profileRes = await getCurrentUserProfileAction()
      if (!profileRes.success || profileRes.data?.role !== "super_admin") {
        return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
      }
    }

    if (isDemo) {
      return { success: true }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceKey || serviceKey.includes("placeholder")) {
      return { success: false, error: "กรุณาตั้งค่า SUPABASE_SERVICE_ROLE_KEY" }
    }

    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", profileId)

    if (profileError) throw profileError

    try {
      await supabaseAdmin.auth.admin.deleteUser(profileId)
    } catch (authErr) {
      console.warn("Auth user deletion warning:", authErr)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบสิทธิ์ผู้ใช้" }
  }
}

/**
 * อัปเดตชื่อ Workspace ผ่าน Admin API ฝั่งเซิร์ฟเวอร์แบบข้าม RLS
 */
export async function updateWorkspaceNameAdminAction(workspaceId: string, name: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (!isDemo) {
      const profileRes = await getCurrentUserProfileAction()
      if (!profileRes.success || profileRes.data?.role !== "super_admin") {
        return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
      }
    }

    if (isDemo) {
      return { success: true }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceKey || serviceKey.includes("placeholder")) {
      return { success: false, error: "กรุณาตั้งค่า SUPABASE_SERVICE_ROLE_KEY" }
    }

    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { error } = await supabaseAdmin
      .from("workspaces")
      .update({ name: name })
      .eq("id", workspaceId)

    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการแก้ไข Workspace" }
  }
}

/**
 * ลบ Workspace ผ่าน Admin API ฝั่งเซิร์ฟเวอร์แบบข้าม RLS
 */
export async function deleteWorkspaceAdminAction(workspaceId: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (!isDemo) {
      const profileRes = await getCurrentUserProfileAction()
      if (!profileRes.success || profileRes.data?.role !== "super_admin") {
        return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
      }
    }

    if (isDemo) {
      return { success: true }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceKey || serviceKey.includes("placeholder")) {
      return { success: false, error: "กรุณาตั้งค่า SUPABASE_SERVICE_ROLE_KEY" }
    }

    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { error } = await supabaseAdmin
      .from("workspaces")
      .delete()
      .eq("id", workspaceId)

    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบ Workspace" }
  }
}

/**
 * ดึงข้อมูลทั้งหมดสำหรับหน้า Super Admin ผ่าน Admin API ฝั่งเซิร์ฟเวอร์แบบข้าม RLS
 */
export async function getSuperAdminDataAction() {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (!isDemo) {
      const profileRes = await getCurrentUserProfileAction()
      if (!profileRes.success || profileRes.data?.role !== "super_admin") {
        return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
      }
    }

    if (isDemo) {
      return { success: true, isDemo: true }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceKey || serviceKey.includes("placeholder")) {
      return { success: false, error: "กรุณาตั้งค่า SUPABASE_SERVICE_ROLE_KEY" }
    }

    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. โหลดข้อมูล Workspaces
    const { data: workspaces, error: wsError } = await supabaseAdmin
      .from("workspaces")
      .select("*")
      .order("created_at", { ascending: false })

    if (wsError) throw wsError

    // 2. โหลดข้อมูล Profiles
    const { data: profiles, error: profError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })

    if (profError) throw profError

    // 3. โหลดข้อมูลการช่วยเหลือ (Support Access Grants)
    const { data: grants, error: grantError } = await supabaseAdmin
      .from("support_access_grants")
      .select("*")

    if (grantError) throw grantError

    // 4. โหลดข้อมูลรหัสเชิญชวน (Registration Secret Codes)
    const { data: codes, error: codeError } = await supabaseAdmin
      .from("registration_codes")
      .select("*")
      .order("created_at", { ascending: false })

    if (codeError) throw codeError

    return {
      success: true,
      isDemo: false,
      data: {
        workspaces: workspaces || [],
        profiles: profiles || [],
        supportGrants: grants || [],
        registrationCodes: codes || []
      }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลจากระบบ" }
  }
}
