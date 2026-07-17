import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// รับลิงก์ยืนยันอีเมลจาก Supabase Auth (ทั้งฝั่งสมัครหอพักใหม่และฝั่งรหัสเชิญชวนเดิม)
// แลก code เป็น session แล้วส่งต่อไปหน้า login พร้อมสถานะผลลัพธ์
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}/login?confirmed=1`)
    }
  }

  return NextResponse.redirect(`${origin}/login?confirm_error=1`)
}
