"use server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { encryptText, decryptText } from "@/lib/encryption"

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
      if (item.key.includes("KEY") || item.key.includes("SECRET")) {
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

    const valueToStore = key.includes("KEY") || key.includes("SECRET") ? encryptText(value) : value

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
