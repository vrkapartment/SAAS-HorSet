import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * ฟังก์ชันช่วยล้างและแปลงเบอร์โทรศัพท์ให้อยู่ในรูปแบบตัวเลขล้วน 10 หลัก (กรณีเบอร์ไทย)
 * เช่น "081-234-5678" -> "0812345678"
 * หรือ "66812345678" -> "0812345678"
 */
function normalizePhone(p: string): string {
  if (!p) return ""
  let clean = p.replace(/\D/g, "")
  if (clean.startsWith("66") && clean.length === 11) {
    clean = "0" + clean.slice(2)
  }
  return clean
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { roomNumber, phone, lineUserId, workspaceId } = body

    // 1. ตรวจสอบข้อมูลนำเข้าเบื้องต้น
    if (!roomNumber || typeof roomNumber !== "string") {
      return NextResponse.json({ success: false, error: "กรุณาระบุหมายเลขห้องพัก" }, { status: 400 })
    }
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ success: false, error: "กรุณาระบุเบอร์โทรศัพท์" }, { status: 400 })
    }
    if (!lineUserId || typeof lineUserId !== "string") {
      return NextResponse.json({ success: false, error: "ไม่พบข้อมูล LINE User ID กรุณาเชื่อมต่อไลน์ใหม่อีกครั้ง" }, { status: 400 })
    }
    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ success: false, error: "ไม่พบข้อมูลรหัสอพาร์ทเมนท์ (workspace_id) กรุณาสแกนคิวอาร์โค้ดประจำหอพักอีกครั้ง" }, { status: 400 })
    }

    // 2. ตรวจสอบรูปแบบ UUID ของ workspaceId เพื่อป้องกันความปลอดภัยขั้นสูง
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(workspaceId)) {
      return NextResponse.json({ success: false, error: "รหัสอพาร์ทเมนท์ (workspace_id) ไม่ถูกต้อง" }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey || serviceKey.includes("placeholder")) {
      return NextResponse.json({
        success: false,
        error: "ระบบเซิร์ฟเวอร์ยังไม่พร้อมใช้งาน: กรุณาตั้งค่าสิทธิ์ผู้ควบคุมระบบ (Service Role Key) ในไฟล์ .env"
      }, { status: 500 })
    }

    // 3. สร้าง Supabase Client ด้วยสิทธิ์ Service Role เพื่อก้าวข้าม RLS บนเซิร์ฟเวอร์อย่างปลอดภัย
    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 4. ค้นหาข้อมูลห้องพักใน Workspace นี้ (ทำการตรวจสอบ case-insensitive เพื่อป้องกันผู้ใช้พิมพ์ตัวพิมพ์ใหญ่/เล็กผิดพลาด)
    const { data: room, error: roomError } = await supabaseAdmin
      .from("rooms")
      .select("id, room_number")
      .eq("workspace_id", workspaceId)
      .ilike("room_number", roomNumber.trim())
      .maybeSingle()

    if (roomError) {
      console.error("Room query error:", roomError)
      return NextResponse.json({ success: false, error: "เกิดข้อผิดพลาดในการตรวจสอบข้อมูลห้องพักจากฐานข้อมูล" }, { status: 500 })
    }

    if (!room) {
      return NextResponse.json({ success: false, error: `ไม่พบข้อมูลห้องพักหมายเลข "${roomNumber}" ในหอพักนี้ กรุณาตรวจสอบและลองใหม่อีกครั้ง` }, { status: 404 })
    }

    // 5. ดึงข้อมูลผู้เช่าทั้งหมดในห้องนี้และ Workspace นี้
    const { data: tenants, error: tenantsError } = await supabaseAdmin
      .from("tenants")
      .select("id, tenant_name, tenant_phone, line_user_id")
      .eq("workspace_id", workspaceId)
      .eq("room_id", room.id)

    if (tenantsError) {
      console.error("Tenants query error:", tenantsError)
      return NextResponse.json({ success: false, error: "เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้เช่าจากฐานข้อมูล" }, { status: 500 })
    }

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ success: false, error: `ไม่พบข้อมูลสัญญาเช่าที่เปิดใช้งานอยู่สำหรับห้องหมายเลข ${room.room_number}` }, { status: 404 })
    }

    // 6. ล้างข้อมูลเพื่อตรวจสอบเปรียบเทียบเบอร์โทรศัพท์
    const inputPhoneClean = normalizePhone(phone)
    if (inputPhoneClean.length !== 10) {
      return NextResponse.json({ success: false, error: "กรุณาระบุเบอร์โทรศัพท์ให้ครบ 10 หลัก" }, { status: 400 })
    }

    // ค้นหาผู้เช่าที่มีเบอร์ตรงกัน
    const matchedTenant = tenants.find(t => {
      const tPhoneClean = normalizePhone(t.tenant_phone || "")
      return tPhoneClean === inputPhoneClean || t.tenant_phone === phone
    })

    if (!matchedTenant) {
      return NextResponse.json({
        success: false,
        error: "เบอร์โทรศัพท์นี้ไม่ตรงกับเบอร์ที่ลงทะเบียนไว้ในสัญญาเช่าของห้องนี้ กรุณาติดต่อผู้ดูแลหอพักเพื่อแก้ไขข้อมูลในระบบ"
      }, { status: 400 })
    }

    // 7. อัปเดตผูก LINE User ID เข้ากับข้อมูลผู้เช่าตัวจริง
    const { error: updateError } = await supabaseAdmin
      .from("tenants")
      .update({
        line_user_id: lineUserId,
        updated_at: new Date().toISOString()
      })
      .eq("id", matchedTenant.id)

    if (updateError) {
      console.error("Tenant update error:", updateError)
      return NextResponse.json({ success: false, error: "เกิดข้อผิดพลาดในการบันทึกและผูกบัญชี LINE กับระบบ" }, { status: 500 })
    }

    // 8. ส่งผลลัพธ์ที่สำเร็จกลับไปยังหน้าบ้านพร้อมชื่อผู้เช่าเพื่อให้ความรู้สึกส่วนตัวและน่าเชื่อถือ
    return NextResponse.json({
      success: true,
      tenantName: matchedTenant.tenant_name
    })

  } catch (error) {
    console.error("Registration API Exception:", error)
    return NextResponse.json({
      success: false,
      error: "เกิดข้อผิดพลาดร้ายแรงในระบบเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้งภายหลัง"
    }, { status: 500 })
  }
}
