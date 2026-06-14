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
      .select("id, email, role, full_name, phone, tfa_enabled")
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
          tfa_enabled: false
        }
      }
    }

    return { success: true, data: profile }
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


