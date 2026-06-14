"use server"

import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"

/**
 * ฟังก์ชันสำหรับการทำ Login ผ่าน Supabase
 */
export async function loginAction(email: string, password: string) {
  try {
    const supabase = await createClient()
    
    // เข้าสู่ระบบด้วย Email และ Password ผ่าน Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      return { success: false, error: authError.message }
    }

    // ดึงบทบาทผู้ใช้งาน (role) จากตาราง profiles ในฐานข้อมูล
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, full_name, phone, tfa_enabled")
      .eq("id", authData.user.id)
      .single()

    if (profileError || !profile) {
      // หากไม่มีโปรไฟล์ ให้สร้างจำลองหรือคืนค่าผิดพลาด (ในขั้นตอนการใช้จริงตาราง profiles จะ sync กับ auth.users ผ่าน Trigger)
      return { 
        success: false, 
        error: "เข้าสู่ระบบแล้ว แต่ไม่พบข้อมูล Profile และสิทธิ์การใช้งานในตาราง profiles" 
      }
    }

    // ตั้งค่าคุกกี้สิทธิ์ของผู้ใช้เพื่อใช้งานร่วมกับ middleware
    const cookieStore = await cookies()
    cookieStore.set("horset_user_role", profile.role, {
      path: "/",
      maxAge: 86400, // 1 วัน
      secure: process.env.NODE_ENV === "production",
      httpOnly: false, // ต้องการอ่านค่านี้ที่ client-side ใน UI บางส่วน
    })

    return { 
      success: true, 
      data: {
        userId: authData.user.id,
        email: authData.user.email,
        role: profile.role,
        fullName: profile.full_name,
        tfaEnabled: profile.tfa_enabled
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

