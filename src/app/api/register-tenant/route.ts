import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { lineUserId, workspaceId, roomNumber, tenantName, tenantPhone } = body

    // 1. ตรวจสอบค่าพารามิเตอร์เบื้องต้นที่ส่งมาจากหน้าลงทะเบียนผู้เช่า
    if (!roomNumber || typeof roomNumber !== "string") {
      return NextResponse.json({ success: false, error: "กรุณาระบุหมายเลขห้องพัก" }, { status: 400 })
    }
    if (!tenantName || typeof tenantName !== "string" || !tenantName.trim()) {
      return NextResponse.json({ success: false, error: "กรุณากรอกชื่อและนามสกุลจริงของคุณ" }, { status: 400 })
    }
    if (!tenantPhone || typeof tenantPhone !== "string" || tenantPhone.trim().length !== 10) {
      return NextResponse.json({ success: false, error: "กรุณาระบุเบอร์โทรศัพท์ที่ถูกต้องจำนวน 10 หลัก" }, { status: 400 })
    }
    if (!lineUserId || typeof lineUserId !== "string") {
      return NextResponse.json({ success: false, error: "ไม่พบข้อมูล LINE User ID กรุณาเข้าสู่ระบบไลน์ใหม่อีกครั้ง" }, { status: 400 })
    }
    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ success: false, error: "ไม่พบรหัสอพาร์ทเมนท์ (workspace_id) ในลิงก์นี้" }, { status: 400 })
    }

    // ตรวจสอบความถูกต้องของโครงสร้างรหัส UUID ของ workspaceId ป้องกันความปลอดภัยเพิ่มเติม
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(workspaceId)) {
      return NextResponse.json({ success: false, error: "รหัสอพาร์ทเมนท์ไม่ถูกต้องตามโครงสร้างระบบ" }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey || serviceKey.includes("placeholder")) {
      return NextResponse.json({
        success: false,
        error: "เซิร์ฟเวอร์ระบบฐานข้อมูลไม่พร้อมใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ"
      }, { status: 500 })
    }

    // สร้าง Supabase Client ด้วย Service Role Key เพื่อก้าวข้าม Row-Level Security บนเซิร์ฟเวอร์
    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 2. ค้นหาค่า id (UUID ของห้อง) จากตาราง rooms โดยระบุเงื่อนไขห้องและอพาร์ทเมนท์ตามสั่ง
    const { data: room, error: roomError } = await supabaseAdmin
      .from("rooms")
      .select("id")
      .eq("room_number", roomNumber.trim())
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (roomError) {
      console.error("Query room ID error:", roomError)
      return NextResponse.json({ success: false, error: "เกิดข้อผิดพลาดในการตรวจสอบห้องพักในระบบ" }, { status: 500 })
    }

    // หากไม่พบห้องพักตามที่ระบุในเงื่อนไข ให้ตอบกลับ HTTP Status 400 ทันทีตามเงื่อนไขที่กำหนด
    if (!room) {
      return NextResponse.json({ success: false, error: `ไม่พบข้อมูลห้องพักหมายเลข ${roomNumber} ในอาคารนี้` }, { status: 400 })
    }

    // 3. เตรียมโครงสร้างออบเจกต์ข้อมูลในการบันทึกแถวใหม่
    const today = new Date()
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    nextYear.setDate(nextYear.getDate() - 1)

    const leaseStart = today.toISOString().split("T")[0]
    const leaseEnd = nextYear.toISOString().split("T")[0]

    const tenantPayload = {
      room_id: room.id,
      line_user_id: lineUserId,
      workspace_id: workspaceId,
      tenant_name: tenantName.trim(),
      tenant_phone: tenantPhone.trim(),
      lease_start: leaseStart,
      lease_end: leaseEnd,
      updated_at: new Date().toISOString()
    }

    let saveError: any = null

    // 4. บันทึกข้อมูลลงตาราง tenants ด้วยคำสั่ง .upsert() ระบุ onConflict: 'line_user_id' เพื่อแก้ไขทับข้อมูลเก่าเมื่อลงทะเบียนซ้ำ
    const { error: upsertError } = await supabaseAdmin
      .from("tenants")
      .upsert(tenantPayload, { onConflict: "line_user_id" })

    if (upsertError) {
      // ตรวจจับกรณีตาราง tenants ในฐานข้อมูล PostgreSQL ของผู้ใช้ยังไม่ได้กำหนดค่า Unique Constraint บน line_user_id
      // ซึ่งอาจทำให้คำสั่ง upsert ล้มเหลว (Postgres Error 42P10) เราจึงสร้างระบบ Fallback ที่ทนทานสูงสุด
      if (upsertError.code === "42P10" || upsertError.message?.includes("unique") || upsertError.message?.includes("conflict")) {
        console.warn("Standard database table public.tenants has no unique index on line_user_id. Running Select-then-Update/Insert fallback flow.")
        
        // ค้นหาผู้เช่าเดิมที่มี LINE ID นี้อยู่ก่อนแล้ว
        const { data: existing, error: selectError } = await supabaseAdmin
          .from("tenants")
          .select("id")
          .eq("line_user_id", lineUserId)
          .maybeSingle()

        if (selectError) {
          saveError = selectError
        } else if (existing) {
          // อัปเดตข้อมูลทับเรคคอร์ดเดิมทันที
          const { error: updateError } = await supabaseAdmin
            .from("tenants")
            .update(tenantPayload)
            .eq("id", existing.id)
          
          if (updateError) saveError = updateError
        } else {
          // แทรกแถวสัญญาใหม่หากไม่พบข้อมูล
          const { error: insertError } = await supabaseAdmin
            .from("tenants")
            .insert([tenantPayload])
          
          if (insertError) saveError = insertError
        }
      } else {
        saveError = upsertError
      }
    }

    if (saveError) {
      console.error("Database save error:", saveError)
      return NextResponse.json({ success: false, error: "เกิดข้อผิดพลาดขึ้นในบันทึกข้อมูลสัญญาเช่าลงฐานข้อมูล" }, { status: 500 })
    }

    // 5. บันทึกและอัปเดตสถานะห้องพักให้เป็นมีผู้เช่า (occupied) โดยอัตโนมัติเพื่อแสดงผลบนระบบบริหารของแอดมิน
    try {
      await supabaseAdmin
        .from("rooms")
        .update({ status: "occupied" })
        .eq("id", room.id)
    } catch (roomUpdateErr) {
      console.warn("Failed to update room status to occupied:", roomUpdateErr)
    }

    // 6. หากบันทึกสำเร็จ ให้ส่งกลับสเตตัส 200 พร้อมกับ JSON แจ้งความสำเร็จตามต้องการ
    return NextResponse.json({
      success: true,
      message: "ลงทะเบียนสัญญาเช่าและผูก LINE สำเร็จเสร็จสิ้น"
    }, { status: 200 })

  } catch (error) {
    console.error("API register-tenant Exception:", error)
    return NextResponse.json({
      success: false,
      error: "เกิดข้อผิดพลาดภายในระบบเซิร์ฟเวอร์หลัก กรุณาลองใหม่อีกครั้งภายหลัง"
    }, { status: 500 })
  }
}
