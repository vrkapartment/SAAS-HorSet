"use server"

import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// Helper to create Supabase Admin Client to bypass RLS for registration code marking
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

// ปลายทาง redirect หลังกดลิงก์ยืนยันอีเมล (ตัด / ท้าย NEXT_PUBLIC_APP_URL ออกก่อนเสมอ ป้องกัน URL ซ้อนกัน // )
// ชี้ไปหน้า /confirm-email (ต้องกดปุ่มยืนยันเองก่อนถึงจะแลก code จริง) แทนที่จะแลกอัตโนมัติทันทีที่เปิดลิงก์
// เพราะ code ใช้ได้แค่ครั้งเดียว และอีเมล client บางเจ้า (Outlook Safe Links ฯลฯ) แอบยิง GET ไปสแกนลิงก์
// ล่วงหน้าก่อนผู้ใช้กดจริง ทำให้ code ถูกใช้ไปก่อนโดยไม่ได้ตั้งใจ ผู้ใช้กดจริงทีหลังเลยเจอ error หลอกๆ
function getEmailCallbackUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  let safeAppUrl = appUrl.trim()
  while (safeAppUrl.endsWith("/")) {
    safeAppUrl = safeAppUrl.slice(0, -1)
  }
  return `${safeAppUrl}/confirm-email`
}


/**
 * ฟังก์ชันสำหรับการทำ Login ผ่าน Supabase
 */
export async function loginAction(email: string, password: string, captchaToken?: string) {
  try {
    const supabase = await createClient()
    
    // เข้าสู่ระบบด้วย Email และ Password ผ่าน Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        captchaToken: captchaToken || undefined,
      }
    })

    if (authError) {
      // แยกกรณี "ยังไม่ยืนยันอีเมล" ออกมาต่างหาก เพื่อให้หน้า UI เสนอปุ่มส่งอีเมลยืนยันซ้ำแทน error ทั่วไป
      if (authError.code === "email_not_confirmed") {
        return {
          success: false,
          error: "กรุณายืนยันอีเมลของคุณก่อนเข้าสู่ระบบ ตรวจสอบกล่องจดหมาย (รวมถึงโฟลเดอร์สแปม) สำหรับลิงก์ยืนยัน",
          code: "email_not_confirmed" as const
        }
      }
      return { success: false, error: authError.message }
    }

    // ดึงบทบาทผู้ใช้งาน (role), workspace_id และสิทธิ์ (permissions) จากตาราง profiles ในฐานข้อมูล
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, full_name, phone, tfa_enabled, workspace_id, permissions")
      .eq("id", authData.user.id)
      .single()

    if (profileError || !profile) {
      // หากไม่มีโปรไฟล์ ให้สร้างจำลองหรือคืนค่าผิดพลาด (ในขั้นตอนการใช้จริงตาราง profiles จะ sync กับ auth.users ผ่าน Trigger)
      return {
        success: false,
        error: "เข้าสู่ระบบแล้ว แต่ไม่พบข้อมูล Profile และสิทธิ์การใช้งานในตาราง profiles"
      }
    }

    // หน้าแรกหลัง login ของ staff ที่ admin กำหนดไว้เฉพาะคน (ถ้าไม่ได้ตั้งไว้ ใช้ /billing เป็นค่าเริ่มต้น)
    const landingPage = profile.permissions?.landing_page || "/billing"

    // ตั้งค่าคุกกี้สิทธิ์ของผู้ใช้เพื่อใช้งานร่วมกับ middleware
    const cookieStore = await cookies()
    cookieStore.set("horset_user_role", profile.role, {
      path: "/",
      maxAge: 86400, // 1 วัน
      secure: process.env.NODE_ENV === "production",
      httpOnly: false, // ต้องการอ่านค่านี้ที่ client-side ใน UI บางส่วน
    })

    // ตั้งค่าคุกกี้หน้าแรกหลัง login ของ staff คนนี้ เพื่อให้ middleware ใช้ตัดสินใจได้โดยไม่ต้อง query DB ซ้ำ
    if (profile.role === "staff") {
      cookieStore.set("horset_staff_landing_page", landingPage, {
        path: "/",
        maxAge: 86400, // 1 วัน
        secure: process.env.NODE_ENV === "production",
        httpOnly: false,
      })
    }

    // ตั้งค่าคุกกี้ Workspace ปัจจุบันของผู้ใช้เพื่อใช้ทำ Tenant Isolation ทันที
    if (profile.workspace_id) {
      cookieStore.set("horset_current_workspace_id", profile.workspace_id, {
        path: "/",
        maxAge: 86400, // 1 วัน
        secure: process.env.NODE_ENV === "production",
        httpOnly: false, // ต้องการอ่านค่านี้ฝั่ง client-side และ middleware
      })
    }

    return {
      success: true,
      data: {
        userId: authData.user.id,
        email: authData.user.email,
        role: profile.role,
        fullName: profile.full_name,
        tfaEnabled: profile.tfa_enabled,
        workspaceId: profile.workspace_id,
        landingPage
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
    return { success: false, error: errorMessage }
  }
}

/**
 * ฟังก์ชันสำหรับการทำ Logout ออกจากระบบ
 */
export async function logoutAction() {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
    
    const cookieStore = await cookies()
    cookieStore.delete("horset_user_role")
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดขณะออกจากระบบ" }
  }
}

/**
 * ดึงข้อมูลโปรไฟล์ของผู้ใช้ปัจจุบัน
 */
export async function getCurrentUserProfileAction() {
  try {
    const supabase = await createClient()
    
    // ดึงข้อมูล User ปัจจุบัน
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "ไม่ได้เข้าสู่ระบบหรือเซสชันหมดอายุ" }
    }

    // ดึงข้อมูลจากตาราง profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, role, full_name, phone, tfa_enabled, workspace_id, created_at, permissions")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      // คืนข้อมูลเบื้องต้นจาก auth.user ถ้าไม่มี profile ในตาราง db
      return {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          role: "tenant",
          full_name: user.user_metadata?.full_name || "",
          phone: user.phone || "",
          tfa_enabled: false,
          workspace_id: null,
          created_at: user.created_at,
          workspace_created_at: user.created_at
        }
      }
    }

    // ดึงวันสร้าง Workspace เพื่อนำไปอ้างอิงเป็นรอบบิลสมัครใช้งานเริ่มต้น
    let workspaceCreatedAt = null
    if (profile.workspace_id) {
      const { data: wsData } = await supabase
        .from("workspaces")
        .select("created_at")
        .eq("id", profile.workspace_id)
        .single()
      if (wsData) {
        workspaceCreatedAt = wsData.created_at
      }
    }

    return {
      success: true,
      data: JSON.parse(JSON.stringify({
        ...profile,
        workspace_created_at: workspaceCreatedAt || profile.created_at
      }))
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" }
  }
}

/**
 * อัปเดตข้อมูลโปรไฟล์และรหัสผ่านของผู้ใช้ปัจจุบัน
 */
export async function updateUserProfileAction(data: {
  fullName?: string
  phone?: string
  password?: string
}) {
  try {
    const supabase = await createClient()
    
    // 1. ตรวจสอบผู้ใช้ปัจจุบัน
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "ไม่ได้เข้าสู่ระบบหรือเซสชันหมดอายุ" }
    }

    // 2. อัปเดตรหัสผ่านถ้ามีการกรอกมา
    if (data.password && data.password.trim() !== "") {
      const { error: passwordError } = await supabase.auth.updateUser({
        password: data.password
      })
      if (passwordError) {
        return { success: false, error: `ไม่สามารถเปลี่ยนรหัสผ่านได้: ${passwordError.message}` }
      }
    }

    // 3. อัปเดตข้อมูลตาราง profiles
    const updateData: any = {
      updated_at: new Date().toISOString()
    }
    if (data.fullName !== undefined) updateData.full_name = data.fullName
    if (data.phone !== undefined) updateData.phone = data.phone

    const { error: profileError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id)

    if (profileError) {
      return { success: false, error: `อัปเดตข้อมูลโปรไฟล์ล้มเหลว: ${profileError.message}` }
    }

    return { success: true, message: "อัปเดตข้อมูลโปรไฟล์สำเร็จเรียบร้อยแล้ว" }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ" }
  }
}

/**
 * ฟังก์ชันสำหรับการลงทะเบียนสมาชิกใหม่ด้วย Secret Code (เชิญชวน) ที่เจ็นโดย Super Admin
 */
export async function registerWithSecretCodeAction(data: {
  email: string
  password: string
  fullName: string
  phone: string
  secretCode: string
  captchaToken?: string
}) {
  try {
    const supabase = await createClient()

    // 1. ตรวจสอบ Secret Code ในฐานข้อมูล ผ่าน Secure RPC เพื่อเลี่ยงข้อจำกัด RLS
    const { data: codeData, error: codeErr } = (await supabase
      .rpc("verify_registration_code", { input_code: data.secretCode.trim() })
      .single()) as any

    if (codeErr || !codeData) {
      return { success: false, error: "ไม่พบรหัสเชิญชวนนี้ในระบบ กรุณาตรวจสอบความถูกต้อง" }
    }

    if (codeData.is_used) {
      return { success: false, error: "รหัสเชิญชวนนี้ถูกใช้งานไปแล้ว" }
    }

    if (new Date(codeData.expires_at) < new Date()) {
      return { success: false, error: "รหัสเชิญชวนนี้หมดอายุแล้ว (รหัสเชิญชวนมีอายุการใช้งาน 2 ชั่วโมง)" }
    }

    // 1.5 ถ้าเป็นการสมัครในบทบาท Staff ต้องเช็คโควตาจำนวนบัญชี Staff ของ workspace ก่อนสมัครสมาชิกเสมอ
    if (codeData.role === "staff") {
      try {
        const { checkWorkspaceQuota } = await import("@/features/subscription/actions")
        await checkWorkspaceQuota(codeData.workspace_id, "staff")
      } catch (quotaError) {
        return { success: false, error: quotaError instanceof Error ? quotaError.message : "เกิดข้อผิดพลาดในการตรวจสอบโควตาบัญชี Staff" }
      }
    }

    // 2. สมัครสมาชิกผ่าน Supabase Auth พร้อมระบุ role, workspace_id และ registration_code
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email.trim(),
      password: data.password,
      options: {
        emailRedirectTo: getEmailCallbackUrl(),
        captchaToken: data.captchaToken || undefined,
        data: {
          role: codeData.role,
          full_name: data.fullName.trim(),
          phone: data.phone.trim(),
          workspace_id: codeData.workspace_id,
          registration_code: data.secretCode.trim()
        }
      }
    })

    if (authError) {
      return { success: false, error: `สมัครสมาชิกไม่สำเร็จ: ${authError.message}` }
    }

    if (!authData.user) {
      return { success: false, error: "สมัครสมาชิกไม่สำเร็จ: ไม่มีข้อมูลผู้ใช้งานที่สร้างขึ้น" }
    }

    // 3. ปรับสถานะ Secret Code ว่าถูกใช้แล้ว โดยใช้สิทธิ์ Admin
    const supabaseAdmin = getSupabaseAdmin()
    const { error: updateErr } = await supabaseAdmin
      .from("registration_codes")
      .update({
        is_used: true,
        used_by_email: data.email.trim()
      })
      .eq("code", data.secretCode.trim())

    if (updateErr) {
      console.error("Warning: Failed to mark code as used:", updateErr)
    }

    return {
      success: true,
      message: "สมัครสมาชิกและลงทะเบียนสิทธิ์ของคุณเรียบร้อยแล้ว! กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันตัวตนก่อนเข้าสู่ระบบ"
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลงทะเบียน"
    return { success: false, error: errorMessage }
  }
}

/**
 * ส่งอีเมลยืนยันตัวตนซ้ำอีกครั้ง (ใช้ตอนผู้ใช้ยังไม่ได้กดลิงก์ยืนยันจากอีเมลแรก)
 */
export async function resendConfirmationEmailAction(email: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: getEmailCallbackUrl()
      }
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, message: "ส่งอีเมลยืนยันตัวตนอีกครั้งเรียบร้อยแล้ว กรุณาตรวจสอบกล่องจดหมายของคุณ" }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการส่งอีเมลยืนยัน" }
  }
}

/**
 * แลก code ยืนยันอีเมลเป็น session จริง — เรียกเฉพาะตอนผู้ใช้กดปุ่มยืนยันเองที่หน้า /confirm-email เท่านั้น
 * (ไม่ทำอัตโนมัติทันทีที่เปิดลิงก์ กัน email scanner แอบใช้ code ไปก่อนผู้ใช้จริง)
 */
export async function confirmEmailAction(code: string) {
  try {
    if (!code || !code.trim()) {
      return { success: false, error: "ลิงก์ยืนยันอีเมลไม่ถูกต้องหรือหมดอายุ กรุณาขอส่งอีเมลยืนยันใหม่" }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code.trim())

    if (error) {
      return { success: false, error: "ลิงก์ยืนยันอีเมลไม่ถูกต้องหรือหมดอายุ กรุณาขอส่งอีเมลยืนยันใหม่" }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการยืนยันอีเมล" }
  }
}

/**
 * ฟังก์ชันสำหรับการสมัครสมาชิกใหม่แบบ Self-Serve สำหรับเจ้าของหอพักรายใหม่ (ไม่ต้องใช้รหัสเชิญชวน)
 * สร้าง workspace ของตัวเองให้อัตโนมัติ (trial 30 วันผ่าน trigger handle_new_workspace_subscription)
 * แล้วจึงสมัครบัญชีผู้ใช้บทบาท admin ผูกกับ workspace นั้นทันที
 */
export async function registerNewWorkspaceAction(data: {
  email: string
  password: string
  fullName: string
  phone: string
  propertyName: string
  captchaToken?: string
}) {
  const email = data.email.trim()
  const propertyName = data.propertyName.trim()

  if (!propertyName) {
    return { success: false, error: "กรุณากรอกชื่อหอพัก/อพาร์ทเมนต์ของคุณ" }
  }
  if (data.password.length < 6) {
    return { success: false, error: "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร" }
  }

  const supabaseAdmin = getSupabaseAdmin()
  let newWorkspaceId: string | null = null

  try {
    // 1. เช็คอีเมลซ้ำก่อนสร้างอะไรทั้งนั้น เพื่อไม่ให้เกิด workspace กำพร้าเวลามีคนลองสมัครซ้ำ
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle()

    if (existingProfile) {
      return { success: false, error: "อีเมลนี้ถูกใช้งานในระบบแล้ว กรุณาเข้าสู่ระบบ หรือใช้อีเมลอื่นในการสมัคร" }
    }

    // 2. สร้าง Workspace ใหม่ก่อน (trigger จะสร้าง trial subscription + อาคารหลักให้อัตโนมัติ)
    const { data: newWorkspace, error: workspaceError } = await supabaseAdmin
      .from("workspaces")
      .insert({ name: propertyName })
      .select("id")
      .single()

    if (workspaceError || !newWorkspace) {
      return { success: false, error: `สร้างหอพักใหม่ไม่สำเร็จ: ${workspaceError?.message || "ไม่ทราบสาเหตุ"}` }
    }

    newWorkspaceId = newWorkspace.id

    // 3. สมัครสมาชิกผ่าน Supabase Auth พร้อมส่ง workspace_id ที่เพิ่งสร้างเข้าไปใน metadata ทันที
    //    (ห้ามลืมขั้นตอนนี้ — ถ้าไม่ส่ง workspace_id มา trigger handle_new_user() จะไปผูกกับ workspace แรกสุดในระบบแทนโดยอัตโนมัติ)
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: data.password,
      options: {
        emailRedirectTo: getEmailCallbackUrl(),
        captchaToken: data.captchaToken || undefined,
        data: {
          role: "admin",
          full_name: data.fullName.trim(),
          phone: data.phone.trim(),
          workspace_id: newWorkspaceId
        }
      }
    })

    // 4. ถ้าสมัครไม่สำเร็จ หรือเป็นอีเมลที่ยืนยันแล้วในระบบอยู่ก่อน (Supabase จะคืน identities ว่างเปล่าแทนการแจ้ง error ตรง ๆ
    //    เพื่อป้องกันการสุ่มเช็คอีเมลในระบบ) ให้ rollback ลบ workspace ที่เพิ่งสร้างทิ้งทันที (cascade ลบ subscription/building ให้เอง)
    const isDuplicateEmail = !authError && authData.user && authData.user.identities?.length === 0

    if (authError || isDuplicateEmail) {
      await supabaseAdmin.from("workspaces").delete().eq("id", newWorkspaceId)

      if (isDuplicateEmail) {
        return { success: false, error: "อีเมลนี้ถูกใช้งานในระบบแล้ว กรุณาเข้าสู่ระบบ หรือใช้อีเมลอื่นในการสมัคร" }
      }
      return { success: false, error: `สมัครสมาชิกไม่สำเร็จ: ${authError?.message}` }
    }

    return {
      success: true,
      message: "สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันตัวตนก่อนเข้าสู่ระบบ"
    }
  } catch (error) {
    // หากเกิดข้อผิดพลาดไม่คาดคิดหลังสร้าง workspace ไปแล้ว ให้พยายาม rollback ทิ้งเพื่อไม่ให้ค้างเป็น workspace กำพร้า
    if (newWorkspaceId) {
      const { error: rollbackError } = await supabaseAdmin.from("workspaces").delete().eq("id", newWorkspaceId)
      if (rollbackError) {
        console.error("Warning: Failed to rollback orphaned workspace:", rollbackError)
      }
    }
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการสมัครสมาชิก"
    return { success: false, error: errorMessage }
  }
}

