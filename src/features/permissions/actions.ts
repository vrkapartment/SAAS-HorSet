"use server"

import { cookies } from "next/headers"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { blockUnapprovedSupportAccess } from "@/features/auth/support-access"

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
 * หอพักที่ผู้ใช้เลือกไว้จากตัวสลับหอด้านบน
 *
 * ใช้สำหรับ super admin ซึ่งไม่สังกัดหอใดหอหนึ่ง (profiles.workspace_id = null)
 * cookie ตัวนี้ถูกตั้งจากฝั่งเบราว์เซอร์ใน DashboardLayout
 */
async function readSelectedWorkspaceCookie(): Promise<string | null> {
  try {
    const store = await cookies()
    return store.get("horset_current_workspace_id")?.value || null
  } catch {
    // เรียกจากบริบทที่ไม่มี request context (เช่น cron) — ถือว่าไม่ได้เลือกหอไว้
    return null
  }
}

/**
 * ดึงรายการ Staff ของหอพักที่ระบุ (หรือหอที่กำลังเลือกอยู่)
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
    //
    // super admin ไม่สังกัดหอ (workspace_id = null) จึงต้องถอยไปอ่านหอที่เลือกไว้จาก cookie
    // ที่ตัวสลับหอด้านบนตั้งไว้ ไม่งั้นจะไม่รู้ว่ากำลังดูหอไหน
    //
    // ปลอดภัยที่จะเชื่อ cookie ตรงนี้ เพราะมันแค่ "เลือกให้แคบลง" ในกลุ่มที่ผู้ใช้เข้าถึงได้อยู่แล้ว
    // และสำหรับ admin ทั่วไป currentUser.workspace_id มาก่อนเสมอ cookie จึงไม่มีผล
    const targetWorkspaceId =
      workspaceId || currentUser.workspace_id || (await readSelectedWorkspaceCookie())

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

    // บังคับกรองตาม workspace เสมอ ไม่มีข้อยกเว้น
    //
    // ⚠️ เดิม super admin ที่ไม่ระบุ workspace จะไม่ถูกกรองเลย → ได้ staff ของทุกหอ
    // พร้อมอีเมล/เบอร์โทร/สิทธิ์ มาในหน้าเดียว โดยเจ้าหอไม่รู้ตัว
    // (เกิดจริงเพราะ PermissionsTab เรียกโดยไม่ส่ง workspaceId และ super admin
    //  ก็ไม่มี workspace_id ในโปรไฟล์)
    //
    // เปลี่ยนเป็น fail-safe: ไม่รู้ว่าหอไหน = ไม่คืนอะไรเลย เหมือนที่ admin ทำอยู่แล้ว
    // โค้ดใหม่ในอนาคตที่ลืมส่ง workspace จะปลอดภัยโดยปริยาย ไม่ใช่รั่วโดยปริยาย
    if (!targetWorkspaceId) {
      return { success: true, data: [] }
    }
    query = query.eq("workspace_id", targetWorkspaceId)

    const { data: profiles, error } = await query.order("created_at", { ascending: false })

    if (error) throw error

    // ดึงสิทธิ์อาคารของ staff ทุกคนที่พบมาในครั้งเดียว (ไม่มีแถว = ไม่จำกัด เห็นทุกอาคาร)
    const profileIds = (profiles || []).map(p => p.id)
    const buildingAccessByProfile: Record<string, string[]> = {}
    if (profileIds.length > 0) {
      const { data: accessRows } = await supabaseAdmin
        .from("staff_building_access")
        .select("profile_id, building_id")
        .in("profile_id", profileIds)
      for (const row of accessRows || []) {
        if (!buildingAccessByProfile[row.profile_id]) buildingAccessByProfile[row.profile_id] = []
        buildingAccessByProfile[row.profile_id].push(row.building_id)
      }
    }

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
          ...DEFAULT_STAFF_PERMISSIONS,
          ...perms
        },
        // รายชื่ออาคารที่ถูกจำกัดสิทธิ์ไว้ — array ว่าง = ไม่จำกัด เห็นทุกอาคาร
        allowedBuildingIds: buildingAccessByProfile[p.id] || []
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
  password: string
  fullName: string
  phone: string
  permissions: StaffPermissions
  workspaceId?: string
  // รายชื่ออาคารที่จำกัดสิทธิ์ให้ staff คนนี้ — array ว่าง = ไม่จำกัด เห็นทุกอาคาร
  allowedBuildingIds?: string[]
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

    if (!data.password || data.password.length < 6) {
      return { success: false, error: "กรุณากรอกรหัสผ่านอย่างน้อย 6 ตัวอักษร" }
    }

    const targetWorkspaceId =
      data.workspaceId || currentUser.workspace_id || (await readSelectedWorkspaceCookie())
    if (!targetWorkspaceId) {
      return { success: false, error: "ไม่พบ Workspace ID สำหรับผู้ใช้ปัจจุบัน" }
    }

    // สร้างบัญชีทำผ่าน Auth Admin API เช่นเดียวกับการลบ — RLS กันไม่ได้ ต้องกันในโค้ด
    // ไม่งั้น super admin สร้างบัญชี staff ในหอไหนก็ได้โดยเจ้าหอไม่รู้ตัว
    {
      const supabaseAdminForGuard = getSupabaseAdmin()
      const supportBlock = await blockUnapprovedSupportAccess({
        db: supabaseAdminForGuard,
        isSuperAdmin,
        workspaceId: targetWorkspaceId
      })
      if (supportBlock) return { success: false, error: supportBlock }
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
      password: data.password,
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

    // 3. บันทึกสิทธิ์อาคารที่จำกัดไว้ (ถ้ามีการระบุ) — ไม่ระบุหรือ array ว่าง = ไม่จำกัด ไม่ต้อง insert อะไร
    if (data.allowedBuildingIds && data.allowedBuildingIds.length > 0) {
      const { error: buildingAccessError } = await supabaseAdmin
        .from("staff_building_access")
        .insert(data.allowedBuildingIds.map(buildingId => ({
          profile_id: authUser.user.id,
          building_id: buildingId,
          workspace_id: targetWorkspaceId
        })))
      if (buildingAccessError) {
        console.warn("ไม่สามารถบันทึกสิทธิ์อาคารได้: ตรวจสอบว่าได้รันสคริปต์ SQL patch add_staff_building_access หรือยัง", buildingAccessError.message)
      }
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
    // รายชื่ออาคารที่จำกัดสิทธิ์ให้ staff คนนี้ — array ว่าง = ไม่จำกัด เห็นทุกอาคาร (undefined = ไม่แตะต้องค่าเดิม)
    allowedBuildingIds?: string[]
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

    // super admin ต้องได้รับอนุมัติสิทธิ์เข้าช่วยเหลือจากเจ้าของหอก่อน
    // เช็คในโค้ดด้วยเพื่อได้ข้อความบอกเหตุผล ไม่ใช่ปล่อยให้ RLS ปฏิเสธเงียบ ๆ
    const supportBlock = await blockUnapprovedSupportAccess({
      db: supabaseAdmin,
      isSuperAdmin,
      workspaceId: targetProfile.workspace_id
    })
    if (supportBlock) return { success: false, error: supportBlock }

    // 2. อัปเดตข้อมูลในตาราง public.profiles
    //
    // ⚠️ ตั้งใจใช้ client ของผู้ใช้ที่ล็อกอิน (ไม่ใช่ supabaseAdmin) เฉพาะการเขียนตรงนี้
    //
    // เหตุผล: การเปลี่ยนสิทธิ์คือจุดที่ต้องรู้ตัวคนทำมากที่สุดในเรื่องกันโกง (คนโกงยกสิทธิ์
    // ตัวเองก่อนลงมือ) การเขียนผ่าน JWT ทำให้ auth.uid() ใช้ได้ในฐานข้อมูล audit log
    // จึงบันทึกชื่อคนทำได้แบบปลอมไม่ได้ — ต่างจาก service-role ที่ไม่มีตัวตนติดไปเลย
    //
    // RLS รองรับอยู่แล้ว: policy "Manage profiles for admin" ให้แอดมินแก้โปรไฟล์ในหอตัวเองได้
    // ส่วน super admin ต้องได้รับอนุมัติสิทธิ์เข้าช่วยเหลือจากเจ้าหอก่อน
    // (policy profiles_update_super_admin_needs_grant)
    //
    // ส่วนที่เหลือในฟังก์ชันนี้ยังใช้ supabaseAdmin ตามเดิม เพราะย้ายไม่ได้:
    //   - auth.admin.updateUserById ต้องใช้ service-role เท่านั้น
    //   - staff_building_access ไม่ได้อยู่ในขอบเขตที่ต้องรู้ตัวคนทำ
    const supabaseUser = await createClient()
    const { data: updatedRows, error: updateError } = await supabaseUser
      .from("profiles")
      .update({
        full_name: data.fullName,
        phone: data.phone,
        permissions: data.permissions,
        updated_at: new Date().toISOString()
      })
      .eq("id", staffId)
      .select("id")

    if (updateError) throw updateError

    // RLS ที่ปฏิเสธจะคืน 0 แถวโดยไม่โยน error — ถ้าไม่เช็คจะขึ้นว่าบันทึกสำเร็จทั้งที่ไม่เปลี่ยน
    if (!updatedRows || updatedRows.length === 0) {
      return {
        success: false,
        error:
          "ไม่สามารถบันทึกสิทธิ์ได้: บัญชีของท่านไม่มีสิทธิ์แก้ไขผู้ใช้คนนี้ " +
          "(กรณีเป็นทีมงาน HorSet ต้องได้รับอนุมัติสิทธิ์เข้าช่วยเหลือจากเจ้าของหอก่อน)"
      }
    }

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

    // 4. ซิงค์สิทธิ์อาคาร (ถ้ามีการส่งค่ามา) — ลบของเดิมทั้งหมดแล้วเซ็ตใหม่ตามที่ระบุเสมอ
    // (allowedBuildingIds เป็น undefined = ไม่แตะต้องค่าเดิม, array ว่าง = ล้างเป็นไม่จำกัด)
    if (data.allowedBuildingIds !== undefined) {
      const { error: deleteAccessError } = await supabaseAdmin
        .from("staff_building_access")
        .delete()
        .eq("profile_id", staffId)
      if (deleteAccessError) {
        console.warn("ไม่สามารถล้างสิทธิ์อาคารเดิมได้: ตรวจสอบว่าได้รันสคริปต์ SQL patch add_staff_building_access หรือยัง", deleteAccessError.message)
      } else if (data.allowedBuildingIds.length > 0) {
        const { error: insertAccessError } = await supabaseAdmin
          .from("staff_building_access")
          .insert(data.allowedBuildingIds.map(buildingId => ({
            profile_id: staffId,
            building_id: buildingId,
            workspace_id: targetProfile.workspace_id
          })))
        if (insertAccessError) {
          console.warn("ไม่สามารถบันทึกสิทธิ์อาคารใหม่ได้", insertAccessError.message)
        }
      }
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

    // ⚠️ การลบบัญชีทำผ่าน Auth Admin API ซึ่งย้ายไป JWT ไม่ได้ (Supabase บังคับ service-role)
    // RLS จึงกันไม่ได้เลย — ด่านนี้ในโค้ดเป็นด่านเดียวที่กันการลบข้ามหอโดยไม่ขออนุญาต
    const supportBlock = await blockUnapprovedSupportAccess({
      db: supabaseAdmin,
      isSuperAdmin,
      workspaceId: targetProfile.workspace_id
    })
    if (supportBlock) return { success: false, error: supportBlock }

    // ลบผู้ใช้ผ่าน Auth Admin API (ระบบ Cascade จะลบข้อมูล profiles อัตโนมัติ)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(staffId)

    if (deleteError) throw deleteError

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบบัญชี Staff" }
  }
}
