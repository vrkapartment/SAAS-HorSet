import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const isPlaceholderUrl = !supabaseUrl || supabaseUrl.includes("placeholder")
  const isPlaceholderAnon = !supabaseAnonKey || supabaseAnonKey.includes("placeholder")
  
  if (isPlaceholderUrl || isPlaceholderAnon) {
    return NextResponse.json({
      success: false,
      message: "ค่าตั้งค่า Supabase ในไฟล์ .env ยังคงเป็นตัวอย่าง (placeholder) กรุณาแก้ไขข้อมูลใน .env ให้เป็นของโครงการคุณก่อน",
      envState: {
        NEXT_PUBLIC_SUPABASE_URL: isPlaceholderUrl ? "มีค่าว่างหรือ placeholder" : "ตั้งค่าแล้ว",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: isPlaceholderAnon ? "มีค่าว่างหรือ placeholder" : "ตั้งค่าแล้ว",
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey && !serviceRoleKey.includes("placeholder") ? "ตั้งค่าแล้ว" : "ไม่ได้ตั้งค่าหรือเป็น placeholder"
      }
    }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    
    // ทดสอบดึงข้อมูลเซสชัน (ไม่ต้องใช้สิทธิ์หรือตารางพิเศษ)
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      return NextResponse.json({
        success: false,
        message: `เชื่อมต่อกับระบบยืนยันตัวตน Supabase ล้มเหลว: ${sessionError.message}`,
        error: sessionError
      }, { status: 500 })
    }

    // ทดสอบดึงข้อมูลตาราง profiles (เพื่อตรวจสอบว่า database schema และ RLS พร้อมไหม)
    const { data: profileData, error: dbError } = await supabase
      .from("profiles")
      .select("id")
      .limit(1)

    // dbError.code === "PGRST116" หรือข้อผิดพลาด RLS อื่นๆ ไม่ใช่ความล้มเหลวของการเชื่อมต่อ DB (แต่มักเป็นเพราะยังไม่มีตารางหรือสิทธิ์)
    // แต่ถ้าเป็นข้อผิดพลาดการเชื่อมต่อเครือข่าย หรือ URL ผิด จะแครชตรงนี้
    if (dbError && dbError.message.includes("Failed to fetch")) {
      return NextResponse.json({
        success: false,
        message: "ไม่สามารถส่งคำขอไปยังฐานข้อมูลได้ กรุณาตรวจสอบ URL หรือการเชื่อมต่ออินเทอร์เน็ต",
        error: dbError
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "เชื่อมต่อกับ Supabase เรียบร้อยแล้ว!",
      details: {
        authConnection: "ปกติ",
        databaseConnection: dbError ? `เชื่อมต่อสำเร็จ แต่ตารางหรือนโยบายอาจมีข้อจำกัด (${dbError.message})` : "ปกติ (สามารถดึงข้อมูลตาราง profiles ได้)"
      }
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: "เกิดข้อผิดพลาดในการสร้างตัวเชื่อมต่อ Supabase",
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
