"use server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { encryptText, decryptText } from "@/lib/encryption"
import { generateSecurePassword } from "@/lib/password"
import { updateGoogleDriveFolderNameAction as updateGoogleDriveFolderNameImpl } from "@/lib/googleDrive"

// Wrapper บาง ๆ เพื่อให้ Client Component (หน้า Super Admin) import ผ่าน server action file นี้แทน
// ไม่ import "@/lib/googleDrive" ตรงๆ จาก client component เด็ดขาด เพราะไฟล์นั้นดึง google-auth-library/gaxios
// (Node-only, มี node:net) เข้ามาด้วย ถ้า client component import ตรงจะทำให้ build พยายาม bundle
// dependency เหล่านี้ลง browser bundle แล้ว error ทันที — ต้องผ่าน "use server" boundary ของไฟล์นี้เท่านั้น
export async function updateGoogleDriveFolderNameAction(name: string) {
  return updateGoogleDriveFolderNameImpl(name)
}

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

    // 0. ถ้าเป็นการสร้างบัญชีบทบาท Staff ต้องเช็คโควตาจำนวนบัญชี Staff ของ workspace ก่อนสร้างบัญชีเสมอ
    if (data.role === "staff") {
      try {
        const { checkWorkspaceQuota } = await import("@/features/subscription/actions")
        await checkWorkspaceQuota(data.workspaceId, "staff")
      } catch (quotaError) {
        return { success: false, error: quotaError instanceof Error ? quotaError.message : "เกิดข้อผิดพลาดในการตรวจสอบโควตาบัญชี Staff" }
      }
    }

    // 1. สร้างผู้ใช้งานลงในระบบ Supabase Auth
    // ถ้าไม่ได้กรอกรหัสผ่านมา ให้สุ่มรหัสผ่านที่ปลอดภัยแทนการใช้ค่าดีฟอลต์ตายตัว แล้วส่งกลับให้ Super Admin คัดลอกไปให้ผู้ใช้
    const finalPassword = data.password || generateSecurePassword()
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: finalPassword,
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
        role: data.role,
        password: finalPassword
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

export async function getSystemSettingsAction() {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true, data: [] }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data, error } = await supabaseAdmin.from("system_settings").select("*")
    if (error) throw error

    let googleKeyInfo = null

    // Decrypt values safely
    const decryptedData = data.map(item => {
      let val = item.value
      if (item.key.includes("KEY") || item.key.includes("SECRET") || item.key.includes("TOKEN")) {
        val = decryptText(item.value)
        if (item.key === "GOOGLE_SERVICE_ACCOUNT_KEY") {
          try {
            const parsed = JSON.parse(val)
            googleKeyInfo = {
              projectId: parsed.project_id || "",
              clientEmail: parsed.client_email || ""
            }
          } catch (e) {
            // invalid JSON or not set yet
          }
        }
      }
      return {
        ...item,
        value: val
      }
    })

    return { success: true, data: decryptedData, googleKeyInfo }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to fetch settings" }
  }
}

export async function updateSystemSettingAction(key: string, value: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const valueToStore = key.includes("KEY") || key.includes("SECRET") || key.includes("TOKEN") ? encryptText(value) : value

    const { error } = await supabaseAdmin.from("system_settings").upsert({ key, value: valueToStore }, { onConflict: "key" })
    if (error) throw error

    let googleKeyInfo = null
    if (key === "GOOGLE_SERVICE_ACCOUNT_KEY") {
      try {
        const parsed = JSON.parse(value)
        googleKeyInfo = {
          projectId: parsed.project_id || "",
          clientEmail: parsed.client_email || ""
        }
      } catch (e) {}
    }

    return { success: true, googleKeyInfo }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update setting" }
  }
}

/**
 * ดึงการตั้งค่า LINE OA สำหรับรับแจ้งเตือนระดับระบบของ Super Admin เอง (public.super_admin_line_settings)
 * คนละตารางกับ workspace_line_settings ของแต่ละหอพัก
 */
export async function getSuperAdminLineSettingsAction() {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true, data: null }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data, error } = await supabaseAdmin
      .from("super_admin_line_settings")
      .select("channel_access_token, channel_secret, admin_line_user_id, admin_line_group_id, notification_active, quota_exceeded_behavior")
      .eq("id", 1)
      .maybeSingle()
    if (error) throw error

    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to fetch super admin LINE settings" }
  }
}

export async function updateSuperAdminLineSettingsAction(input: {
  channelAccessToken?: string
  channelSecret?: string
  adminLineUserId?: string
  adminLineGroupId?: string
  notificationActive: boolean
  quotaExceededBehavior?: "skip" | "send_anyway"
}) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { error } = await supabaseAdmin.from("super_admin_line_settings").upsert(
      {
        id: 1,
        channel_access_token: input.channelAccessToken?.trim() || null,
        channel_secret: input.channelSecret?.trim() || null,
        admin_line_user_id: input.adminLineUserId?.trim() || null,
        admin_line_group_id: input.adminLineGroupId?.trim() || null,
        notification_active: input.notificationActive,
        quota_exceeded_behavior: input.quotaExceededBehavior || "skip",
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    )
    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update super admin LINE settings" }
  }
}

/**
 * สร้างรหัสความปลอดภัย 6 หลัก อายุ 5 นาที ให้ Super Admin พิมพ์ในแชท LINE OA ของ HorSet เอง
 * เพื่อผูก LINE User ID ให้อัตโนมัติ (มิเรอร์ generateAdminConnectionCodeAction ของ workspace admin
 * แต่ไม่มี workspace_id เกี่ยวข้องเลย — ใช้ตาราง super_admin_connection_codes แยกต่างหาก)
 */
export async function generateSuperAdminConnectionCodeAction() {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) {
      return { success: true, code: "123456", expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() }
    }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // ลบรหัสที่หมดอายุแล้วออกก่อนเสมอ กันตารางบวมและกันรหัสเก่าสับสนกับรหัสใหม่
    await supabaseAdmin.from("super_admin_connection_codes").delete().lt("expires_at", new Date().toISOString())

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    const { error } = await supabaseAdmin
      .from("super_admin_connection_codes")
      .insert({ code, expires_at: expiresAt, is_used: false })
    if (error) throw error

    return { success: true, code, expiresAt }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "ไม่สามารถสร้างรหัสเชื่อมต่อได้ กรุณาลองใหม่อีกครั้ง" }
  }
}

/**
 * ให้หน้า UI มา poll เช็คว่ารหัสที่สร้างไว้ถูกใช้ไปแล้วหรือยัง (LINE webhook เป็นคนกด mark is_used ให้)
 */
export async function checkSuperAdminConnectionCodeStatusAction(code: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true, isUsed: false }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data, error } = await supabaseAdmin
      .from("super_admin_connection_codes")
      .select("is_used")
      .eq("code", code)
      .maybeSingle()
    if (error) throw error

    return { success: true, isUsed: !!data?.is_used }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to check connection code status" }
  }
}

export async function cancelSuperAdminConnectionCodeAction(code: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { error } = await supabaseAdmin.from("super_admin_connection_codes").delete().eq("code", code)
    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to cancel connection code" }
  }
}

/**
 * ดึงโควต้าข้อความ LINE คงเหลือของ Super Admin สดจาก LINE Messaging API เท่านั้น (ไม่มี cache table)
 * ถ้าพบว่าโควต้าเหลือ 0 จะปิดการแจ้งเตือน (notification_active) ให้อัตโนมัติทันทีเพื่อป้องกันค่าใช้จ่ายไหล
 * (กันเผื่อกรณีไม่มีการส่งแจ้งเตือนจริงเกิดขึ้นเลยหลังโควต้าหมด — sendLineSuperAdminNotificationAction เองก็เช็คซ้ำอีกชั้นก่อนส่งทุกครั้ง)
 */
export async function getSuperAdminLineQuotaAction() {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) {
      return {
        success: true,
        data: { limitType: "limited", limit: 500, consumed: 120, remaining: 380, percentageUsed: 24, botName: "HorSet Ops (Demo)", botBasicId: "@horset_demo" }
      }
    }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: settings } = await supabaseAdmin
      .from("super_admin_line_settings")
      .select("channel_access_token, quota_exceeded_behavior")
      .eq("id", 1)
      .maybeSingle()

    const channelAccessToken = settings?.channel_access_token
    if (!channelAccessToken || !channelAccessToken.trim()) {
      return { success: false, error: "ยังไม่ได้ตั้งค่า LINE Channel Access Token กรุณาตั้งค่าก่อน" }
    }

    const { fetchSuperAdminLineQuota } = await import("@/features/notification/actions")
    const quota = await fetchSuperAdminLineQuota(channelAccessToken)

    // ปิดการแจ้งเตือนอัตโนมัติเมื่อโควต้าหมด เฉพาะกรณีเลือกโหมด "ข้ามการส่ง" (ค่า default) เท่านั้น —
    // ถ้าเลือก "ส่งต่อแม้เกินโควต้าฟรี" ไว้ ให้ยังคงเปิดแจ้งเตือนต่อไปตามที่ตั้งใจไว้
    if (quota.remaining !== null && quota.remaining <= 0 && (settings?.quota_exceeded_behavior || "skip") === "skip") {
      await supabaseAdmin
        .from("super_admin_line_settings")
        .update({ notification_active: false, updated_at: new Date().toISOString() })
        .eq("id", 1)
    }

    return { success: true, data: quota }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการตรวจสอบโควต้า LINE" }
  }
}

/**
 * ดึงโปรไฟล์ (ชื่อ/รูป) ของ LINE User ID ที่ผูกไว้เป็น Super Admin — มิเรอร์ getLineProfilesAction ของ
 * workspace admin แต่ดึง token จาก super_admin_line_settings แทน workspace_line_settings
 */
async function fetchLineProfilesForToken(channelAccessToken: string, userIdsStr: string) {
  const userIds = userIdsStr.split(/[\s,\n]+/).map((id) => id.trim()).filter((id) => id.length > 0).slice(0, 5)

  return Promise.all(
    userIds.map(async (userId) => {
      try {
        const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          headers: { Authorization: `Bearer ${channelAccessToken}` },
          signal: AbortSignal.timeout(8000)
        })
        if (res.ok) {
          const profile = await res.json()
          return { userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl, statusMessage: profile.statusMessage, success: true }
        }
        const errBody = await res.json().catch(() => ({}))
        return {
          userId,
          displayName: "ไม่พบชื่อ (ยังไม่ได้เพิ่มเพื่อนบอท หรือ ID ไม่ถูกต้อง)",
          pictureUrl: null,
          success: false,
          error: errBody?.message || `HTTP ${res.status}`
        }
      } catch (err) {
        return {
          userId,
          displayName: "ไม่สามารถเชื่อมต่อ LINE เพื่อดึงโปรไฟล์ได้",
          pictureUrl: null,
          success: false,
          error: err instanceof Error ? err.message : "unknown error"
        }
      }
    })
  )
}

export async function getSuperAdminLineProfilesAction(userIdsStr: string) {
  try {
    if (!userIdsStr || !userIdsStr.trim()) {
      return { success: true, data: [] }
    }

    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) {
      const ids = userIdsStr.split(/[\s,\n]+/).map((id) => id.trim()).filter((id) => id.length > 0).slice(0, 5)
      return {
        success: true,
        data: ids.map((id, index) => ({ userId: id, displayName: `Super Admin จำลองท่านที่ ${index + 1}`, pictureUrl: null, success: true }))
      }
    }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: settings } = await supabaseAdmin
      .from("super_admin_line_settings")
      .select("channel_access_token")
      .eq("id", 1)
      .maybeSingle()

    const channelAccessToken = settings?.channel_access_token
    if (!channelAccessToken || !channelAccessToken.trim()) {
      return { success: false, error: "ไม่มี Channel Access Token ของ LINE" }
    }

    const profiles = await fetchLineProfilesForToken(channelAccessToken, userIdsStr)
    return { success: true, data: profiles }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงโปรไฟล์ LINE" }
  }
}

/**
 * รวม 3 การเรียก (settings + quota + profiles) ที่หน้า Super Admin เดิมเคยยิงแยกกัน เข้าเป็นรอบเดียว —
 * เช็ค role ครั้งเดียว และ query ตาราง super_admin_line_settings ครั้งเดียว (จากเดิมที่ getSuperAdminLineSettingsAction,
 * getSuperAdminLineQuotaAction, getSuperAdminLineProfilesAction แต่ละตัวต่างคนต่าง query แถวเดียวกันนี้ซ้ำกัน 3 รอบ)
 * ใช้เฉพาะตอนโหลดหน้าครั้งแรก — ปุ่ม "รีเฟรชโควต้า" แยกยังเรียก getSuperAdminLineQuotaAction() เดี่ยวๆ ได้ตามปกติ
 */
export async function getSuperAdminLineBootstrapAction() {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true, data: { settings: null, quota: null, profiles: [] } }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: settings, error } = await supabaseAdmin
      .from("super_admin_line_settings")
      .select("channel_access_token, channel_secret, admin_line_user_id, admin_line_group_id, notification_active, quota_exceeded_behavior")
      .eq("id", 1)
      .maybeSingle()
    if (error) throw error

    const channelAccessToken = settings?.channel_access_token
    const adminLineUserId = settings?.admin_line_user_id

    const [quota, profiles] = await Promise.all([
      channelAccessToken
        ? (async () => {
            try {
              const { fetchSuperAdminLineQuota } = await import("@/features/notification/actions")
              const q = await fetchSuperAdminLineQuota(channelAccessToken)
              if (q.remaining !== null && q.remaining <= 0 && (settings?.quota_exceeded_behavior || "skip") === "skip") {
                await supabaseAdmin
                  .from("super_admin_line_settings")
                  .update({ notification_active: false, updated_at: new Date().toISOString() })
                  .eq("id", 1)
              }
              return q
            } catch {
              return null
            }
          })()
        : Promise.resolve(null),
      channelAccessToken && adminLineUserId
        ? fetchLineProfilesForToken(channelAccessToken, adminLineUserId)
        : Promise.resolve([])
    ])

    return { success: true, data: { settings, quota, profiles } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล LINE ของ Super Admin" }
  }
}

export async function testSuperAdminLineNotificationAction() {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true, data: "Demo Mode: จำลองการส่งแจ้งเตือนทดสอบเสร็จสิ้น" }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const { sendLineSuperAdminNotificationAction } = await import("@/features/notification/actions")
    return sendLineSuperAdminNotificationAction(
      "🔔 ทดสอบการแจ้งเตือน Super Admin จากระบบ HorSet\n\nถ้าคุณได้รับข้อความนี้ แสดงว่าตั้งค่า LINE เรียบร้อยแล้ว"
    )
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to send test notification" }
  }
}

// ดึงโควต้า SlipOK คงเหลือของบัญชี HorSet เอง (ใช้รับชำระค่า subscription จากเจ้าของหอพัก ไม่เกี่ยวกับ SlipOK ของแต่ละ workspace)
export async function getHorsetSlipOkQuotaAction() {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) {
      return { success: true, data: { quota: 87, overQuota: 0, specialQuota: 0, endDate: "2026-12-31", specialEndDate: null } }
    }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data, error } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["HORSET_SLIPOK_BRANCH_ID", "HORSET_SLIPOK_API_KEY"])
    if (error) throw error

    const branchId = data?.find((d) => d.key === "HORSET_SLIPOK_BRANCH_ID")?.value
    const encryptedApiKey = data?.find((d) => d.key === "HORSET_SLIPOK_API_KEY")?.value

    if (!branchId || !encryptedApiKey) {
      return { success: false, error: "ยังไม่ได้ตั้งค่า Branch ID/API Key ของ SlipOK สำหรับ HorSet กรุณาตั้งค่าก่อน" }
    }

    const apiKey = decryptText(encryptedApiKey)
    const { fetchQuotaFromSlipOk } = await import("@/features/slipok/actions")
    return await fetchQuotaFromSlipOk(branchId, apiKey)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการตรวจสอบโควต้า SlipOK ของ HorSet" }
  }
}

// ดึงรายการ PDF template ของ ภ.ง.ด. 90/94 ทั้งหมดที่มีการอัปโหลดไว้ (สำหรับแสดงในหน้าตั้งค่า Super Admin)
export async function getTaxFormTemplatesAction() {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true, data: [] }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data, error } = await supabaseAdmin
      .from("tax_form_templates")
      .select("id, form_type, tax_year, file_url, file_name, updated_at")
      .order("form_type", { ascending: true })
      .order("tax_year", { ascending: false })
    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงรายการ PDF template" }
  }
}

// บันทึก PDF template ใหม่ของ ภ.ง.ด. 90 (ใช้ข้ามทุกปี ไม่ผูก tax_year) หรือ ภ.ง.ด. 94 (ผูกกับปีภาษีเฉพาะเจาะจง)
export async function uploadTaxFormTemplateAction(formType: "90" | "94", taxYear: string | null, fileUrl: string, fileName: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    if (formType === "94" && !taxYear) {
      return { success: false, error: "กรุณาระบุปีภาษีสำหรับแบบฟอร์ม ภ.ง.ด. 94" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // หา record เดิมด้วยตัวเองก่อนเสมอ (ไม่ใช้ .upsert(onConflict) เพราะ unique index ของ tax_year เป็น partial index
    // (WHERE form_type = '94') ซึ่ง PostgREST/Postgres ไม่สามารถ infer มาเป็น ON CONFLICT arbiter แบบ bare column ได้
    // ถ้าใช้ upsert ตรงๆ จะ error หรือไม่อัปเดตแถวเดิมจริง ทำให้ Admin ยังโหลด template ของปีเก่าอยู่)
    const existingQuery = supabaseAdmin.from("tax_form_templates").select("id").eq("form_type", formType)
    const { data: existing, error: findError } = await (
      formType === "90" ? existingQuery : existingQuery.eq("tax_year", taxYear)
    ).maybeSingle()
    if (findError) throw findError

    if (existing) {
      // อัปเดตไฟล์ของ record เดิม (สำหรับ '90' จะไม่แตะ tax_year เดิมที่ Super Admin เคยตั้งไว้)
      const { error: updateError } = await supabaseAdmin
        .from("tax_form_templates")
        .update({ file_url: fileUrl, file_name: fileName, updated_by: profileRes.data.id })
        .eq("id", existing.id)
      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabaseAdmin.from("tax_form_templates").insert({
        form_type: formType,
        tax_year: formType === "90" ? null : taxYear,
        file_url: fileUrl,
        file_name: fileName,
        updated_by: profileRes.data.id,
      })
      if (insertError) throw insertError
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึก PDF template" }
  }
}

// ลบ PDF template ที่อัปโหลดไว้ (กลับไปใช้ไฟล์เริ่มต้นของระบบโดยอัตโนมัติ)
export async function deleteTaxFormTemplateAction(id: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { error } = await supabaseAdmin.from("tax_form_templates").delete().eq("id", id)
    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบ PDF template" }
  }
}

// ตั้งค่าปีภาษีที่ให้พิมพ์ลงบนแบบฟอร์ม ภ.ง.ด. 90 (ใช้ข้ามทุกปีที่ Admin ดูรายงานภาษี จนกว่า Super Admin จะเปลี่ยนอีกครั้ง)
export async function updatePnd90TaxYearAction(taxYear: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    if (!taxYear.trim()) {
      return { success: false, error: "กรุณาระบุปีภาษี" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: existing, error: findError } = await supabaseAdmin
      .from("tax_form_templates")
      .select("id")
      .eq("form_type", "90")
      .maybeSingle()
    if (findError) throw findError

    if (!existing) {
      return { success: false, error: "กรุณาอัปโหลดไฟล์ PDF template ของ ภ.ง.ด. 90 ก่อน จึงจะกำหนดปีภาษีได้" }
    }

    const { error: updateError } = await supabaseAdmin
      .from("tax_form_templates")
      .update({ tax_year: taxYear.trim() })
      .eq("id", existing.id)
    if (updateError) throw updateError

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกปีภาษี" }
  }
}

// ===== ระบบ Visual Field Mapping — ดูภาพรวมที่ src/lib/pdfHelper.ts (PND_LOGICAL_KEYS, PndFieldMapping) =====

interface SaveFieldMappingParams {
  templateId: string
  logicalKey: string
  fieldKind: "text" | "radio"
  physicalFieldName: string
  optionKey?: string | null
  widgetIndex?: number | null
  valueFormat?: "raw" | "comb" | "plain_decimal" | null
}

// บันทึก mapping 1 แถว (text field 1 แถวต่อ logicalKey, radio 1 แถวต่อ optionKey) — หาแถวเดิมก่อนเสมอแล้วค่อย
// insert/update เอง (ไม่ใช้ .upsert(onConflict) เพราะ unique index เป็น partial index เหมือนกับ tax_form_templates)
export async function saveFieldMappingAction(params: SaveFieldMappingParams) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    if (params.fieldKind === "text" && !params.valueFormat) {
      return { success: false, error: "กรุณาระบุรูปแบบข้อมูล (raw/comb/plain_decimal) สำหรับ field ประเภทข้อความ" }
    }
    if (params.fieldKind === "radio" && (!params.optionKey || params.widgetIndex === undefined || params.widgetIndex === null)) {
      return { success: false, error: "กรุณาระบุ option และ widget index สำหรับ field ประเภท radio" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    let existingQuery = supabaseAdmin
      .from("tax_form_field_mappings")
      .select("id")
      .eq("template_id", params.templateId)
      .eq("logical_key", params.logicalKey)
      .is("deleted_at", null)
    existingQuery = params.fieldKind === "radio"
      ? existingQuery.eq("option_key", params.optionKey!)
      : existingQuery.is("option_key", null)
    const { data: existing, error: findError } = await existingQuery.maybeSingle()
    if (findError) throw findError

    const row = {
      template_id: params.templateId,
      logical_key: params.logicalKey,
      field_kind: params.fieldKind,
      physical_field_name: params.physicalFieldName,
      option_key: params.fieldKind === "radio" ? params.optionKey : null,
      widget_index: params.fieldKind === "radio" ? params.widgetIndex : null,
      value_format: params.fieldKind === "text" ? params.valueFormat : null,
      updated_by: profileRes.data.id,
    }

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from("tax_form_field_mappings")
        .update(row)
        .eq("id", existing.id)
      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabaseAdmin.from("tax_form_field_mappings").insert(row)
      if (insertError) throw insertError
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึก field mapping" }
  }
}

// ลบ mapping 1 แถว (soft delete) — ใช้เมื่อ Super Admin ต้องการเลิก map field นั้นแล้วปล่อยว่างไว้
export async function deleteFieldMappingAction(mappingId: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { error } = await supabaseAdmin
      .from("tax_form_field_mappings")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", mappingId)
    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบ field mapping" }
  }
}

// ดึง mapping ทั้งหมดของ template หนึ่งไฟล์ (สำหรับหน้า mapping ของ Super Admin แสดงสถานะปัจจุบัน)
export async function getFieldMappingsAdminAction(templateId: string) {
  try {
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
    if (isDemo) return { success: true, data: [] }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้", data: [] }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data, error } = await supabaseAdmin
      .from("tax_form_field_mappings")
      .select("id, logical_key, field_kind, physical_field_name, option_key, widget_index, value_format")
      .eq("template_id", templateId)
      .is("deleted_at", null)
    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึง field mapping", data: [] }
  }
}

// ตรวจ "ความครบถ้วน" ของ mapping เทียบกับคำศัพท์ logical key ที่ระบบต้องใช้ (แทนที่ REQUIRED_PND_FIELDS แบบเดิมที่เช็คแค่
// ว่าชื่อ field มีอยู่จริงหรือไม่ โดยไม่รู้ว่า field นั้นถูก map ให้ตรงความหมายแล้วหรือยัง) และเช็คด้วยว่า mapping ที่มีอยู่
// ชี้ไป field ชื่อที่ยังมีอยู่จริงในไฟล์ template หรือไม่ (จับ revision drift ทันทีที่เปิดหน้า mapping)
export async function getTaxFormMappingCoverageAction(templateId: string, formType: "90" | "94") {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const [{ data: template, error: templateError }, { data: mappings, error: mappingsError }] = await Promise.all([
      supabaseAdmin.from("tax_form_templates").select("file_url").eq("id", templateId).single(),
      supabaseAdmin
        .from("tax_form_field_mappings")
        .select("logical_key, physical_field_name")
        .eq("template_id", templateId)
        .is("deleted_at", null),
    ])
    if (templateError) throw templateError
    if (mappingsError) throw mappingsError

    const { PDFDocument } = await import("pdf-lib")
    const { PND_LOGICAL_KEYS, repairOrphanedFormFields } = await import("@/lib/pdfHelper")

    const fileResponse = await fetch(template.file_url)
    if (!fileResponse.ok) throw new Error("ไม่สามารถโหลดไฟล์ template ได้")
    const bytes = await fileResponse.arrayBuffer()
    const pdfDoc = await PDFDocument.load(bytes)
    repairOrphanedFormFields(pdfDoc)
    const existingFieldNames = new Set(pdfDoc.getForm().getFields().map((f) => f.getName()))

    const mappedKeys = new Set((mappings || []).map((m) => m.logical_key))
    const unmappedRequiredKeys = PND_LOGICAL_KEYS[formType].filter((key) => !mappedKeys.has(key))
    const danglingMappings = (mappings || []).filter((m) => !existingFieldNames.has(m.physical_field_name))

    return {
      success: true,
      data: {
        totalRequiredKeys: PND_LOGICAL_KEYS[formType].length,
        mappedKeyCount: mappedKeys.size,
        unmappedRequiredKeys,
        danglingMappings,
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการตรวจสอบความครบถ้วนของ mapping" }
  }
}
