"use server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

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
