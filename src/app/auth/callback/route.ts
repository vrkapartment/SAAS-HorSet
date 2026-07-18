import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// รับ code จาก Supabase Auth สองทาง:
// 1. ลิงก์อีเมลเก่าที่ยังไม่ได้เปลี่ยนไปใช้ /confirm-email (ไม่มี intent param) — พฤติกรรมเดิมเป๊ะ ไม่แตะ
// 2. Google OAuth redirect กลับมา (มี intent=login หรือ intent=register_workspace แนบมาด้วย)
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const intent = searchParams.get("intent")

  if (!code) {
    return NextResponse.redirect(`${origin}/login?confirm_error=1`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?confirm_error=1`)
  }

  // ไม่มี intent = ลิงก์ยืนยันอีเมลแบบเดิม ไม่เกี่ยวกับ Google
  if (!intent) {
    return NextResponse.redirect(`${origin}/login?confirmed=1`)
  }

  // มี intent = มาจาก Google OAuth เช็คว่า trigger handle_new_user() ผูก workspace_id ไว้แล้วหรือยัง
  // (Google ไม่ส่ง custom metadata แบบ role/workspace_id ได้เหมือน signUp ปกติ ดังนั้นบัญชี Google ใหม่ล้วน
  // จะมี workspace_id เป็น NULL เสมอ ไม่ว่า intent จะเป็น login หรือ register_workspace ก็ตาม)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return NextResponse.redirect(`${origin}/login?confirm_error=1`)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, workspace_id")
    .eq("id", userData.user.id)
    .maybeSingle()

  // เช็คว่าเป็นบัญชี Google ใหม่ล้วนที่ trigger ยังไม่ได้ผูก workspace ให้จริงๆ (role default เป็น "tenant" เสมอ
  // ตาม handle_new_user() ถ้าไม่มี custom metadata) ไม่ใช่แค่เช็ค workspace_id อย่างเดียว เพราะ super_admin
  // ก็มี workspace_id เป็น NULL โดยดีไซน์เช่นกัน (ไม่ได้ผูกกับหอพักใดหอพักหนึ่ง) ต้องไม่โดนเด้งไปกรอกชื่อหอพักผิดๆ
  if (!profile || (profile.role === "tenant" && !profile.workspace_id)) {
    // ยังไม่มี workspace ผูกอยู่ (บัญชี Google ใหม่ล้วน) — ให้ไปกรอกชื่อหอพักก่อนถึงจะใช้งานได้
    return NextResponse.redirect(`${origin}/register/complete-workspace`)
  }

  // มี workspace อยู่แล้ว = บัญชีเดิมที่สมบูรณ์ ถือเป็น login ปกติ ให้หน้า login ไปตั้งคุกกี้สิทธิ์ต่อ
  return NextResponse.redirect(`${origin}/login?oauth_ready=1`)
}
