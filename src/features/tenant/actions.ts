"use server"

import { createClient } from "@/lib/supabase/server"

const isSupabaseConfigured = 
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co"

export async function getTenants() {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("tenants")
      .select(`
        *,
        rooms (
          room_number
        )
      `)
      .order("created_at", { ascending: false })

    if (error) throw error

    // จัดรูปแบบข้อมูลให้เข้ากับ TenantItem interface ของหน้าบ้าน
    const formatted = data.map((t: any) => ({
      id: t.id,
      roomNumber: t.rooms?.room_number || "ไม่มีห้อง",
      fullName: t.tenant_name,
      phone: t.tenant_phone,
      lineUserId: t.line_user_id,
      contractStart: t.lease_start,
      contractEnd: t.lease_end,
      status: new Date(t.lease_end) >= new Date() ? "active" : "expired"
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลผู้เช่า"
    return { success: false, error: errorMessage }
  }
}

export async function createTenant(
  roomNumber: string,
  fullName: string,
  phone: string,
  lineUserId: string | null,
  contractStart: string,
  contractEnd: string
) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()

    // 1. ค้นหา roomId จาก roomNumber
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("room_number", roomNumber)
      .single()

    if (roomError || !room) {
      throw new Error(`ไม่พบห้องหมายเลข ${roomNumber} ในระบบ กรุณาตรวจสอบหรือสร้างห้องพักก่อนทำสัญญา`)
    }

    // 2. เพิ่มข้อมูลผู้เช่าและสัญญา
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert([{
        room_id: room.id,
        tenant_name: fullName,
        tenant_phone: phone,
        line_user_id: lineUserId || null,
        lease_start: contractStart,
        lease_end: contractEnd
      }])
      .select()

    if (tenantError) throw tenantError

    // 3. อัปเดตห้องพักให้เป็นมีผู้เช่า (occupied)
    const { error: roomUpdateError } = await supabase
      .from("rooms")
      .update({ status: "occupied" })
      .eq("id", room.id)

    if (roomUpdateError) throw roomUpdateError

    return { success: true, data: tenant[0] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการทำสัญญาเช่าใหม่"
    return { success: false, error: errorMessage }
  }
}

export async function deleteTenant(id: string, roomNumber: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()

    // 1. ลบสัญญาผู้เช่า
    const { error: deleteError } = await supabase
      .from("tenants")
      .delete()
      .eq("id", id)

    if (deleteError) throw deleteError

    // 2. ค้นหาห้องและตั้งค่าเป็นว่าง (available)
    const { data: room } = await supabase
      .from("rooms")
      .select("id")
      .eq("room_number", roomNumber)
      .single()

    if (room) {
      await supabase
        .from("rooms")
        .update({ status: "available" })
        .eq("id", room.id)
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบสัญญาผู้เช่า"
    return { success: false, error: errorMessage }
  }
}

export async function updateTenant(
  id: string,
  roomNumber: string,
  fullName: string,
  phone: string,
  lineUserId: string | null,
  contractStart: string,
  contractEnd: string
) {
  try {
    const supabase = await createClient()

    // 1. ดึงข้อมูลสัญญาเดิมมาเช็คว่ามีการย้ายห้องหรือไม่
    const { data: oldTenant, error: oldError } = await supabase
      .from("tenants")
      .select("room_id, rooms(room_number)")
      .eq("id", id)
      .single()

    if (oldError || !oldTenant) {
      throw new Error("ไม่พบข้อมูลผู้เช่าที่ต้องการแก้ไข")
    }

    // 2. ค้นหา roomId ใหม่จาก roomNumber
    const { data: newRoom, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("room_number", roomNumber)
      .single()

    if (roomError || !newRoom) {
      throw new Error(`ไม่พบห้องหมายเลข ${roomNumber} ในระบบ`)
    }

    // 3. อัปเดตข้อมูลผู้เช่า
    const { data: updatedTenant, error: tenantError } = await supabase
      .from("tenants")
      .update({
        room_id: newRoom.id,
        tenant_name: fullName,
        tenant_phone: phone,
        line_user_id: lineUserId || null,
        lease_start: contractStart,
        lease_end: contractEnd,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()

    if (tenantError) throw tenantError

    // 4. หากมีการย้ายห้องพัก ให้สลับสถานะห้องเดิมและห้องใหม่
    const oldRoomNumber = (oldTenant.rooms as any)?.room_number
    if (oldRoomNumber && oldRoomNumber !== roomNumber) {
      // ตั้งห้องเก่าเป็นว่าง (available)
      await supabase
        .from("rooms")
        .update({ status: "available" })
        .eq("id", oldTenant.room_id)

      // ตั้งห้องใหม่เป็นมีผู้เช่า (occupied)
      await supabase
        .from("rooms")
        .update({ status: "occupied" })
        .eq("id", newRoom.id)
    }

    return { success: true, data: updatedTenant[0] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้เช่า"
    return { success: false, error: errorMessage }
  }
}

export async function getTenantPortalData() {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()

    // 1. Get the current logged-in auth user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนใช้งาน" }
    }

    // 2. Get profile details of the user
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return { success: false, error: "ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน" }
    }

    // 3. Find tenant by matching phone number
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select(`
        *,
        rooms (
          id,
          room_number,
          base_rent,
          room_types (
            default_rent
          )
        )
      `)
      .eq("tenant_phone", profile.phone)
      .maybeSingle()

    if (tenantError) throw tenantError

    let promptPayId = ""
    let promptPayName = ""

    if (tenant && tenant.workspace_id) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("promptpay_id, promptpay_name")
        .eq("id", tenant.workspace_id)
        .maybeSingle()
      if (ws) {
        promptPayId = ws.promptpay_id || ""
        promptPayName = ws.promptpay_name || ""
      }
    }

    if (!tenant) {
      // Profile exists but not assigned as a tenant in any room yet
      return {
        success: true,
        data: {
          profile,
          roomNumber: null,
          tenantName: profile.full_name || profile.email,
          baseRent: 0,
          bills: [],
          promptPayId,
          promptPayName
        }
      }
    }

    // 4. Get bills for this room number
    const roomNumber = tenant.rooms?.room_number
    let formattedBills: any[] = []

    if (roomNumber) {
      const { data: bills, error: billsError } = await supabase
        .from("bills")
        .select("*")
        .eq("room_number", roomNumber)
        .order("billing_cycle", { ascending: false })

      if (billsError) throw billsError

      if (bills) {
        formattedBills = bills.map((b: any) => ({
          id: b.id,
          roomNumber: b.room_number,
          tenantName: b.tenant_name,
          amount: Number(b.amount),
          status: b.status,
          billingCycle: b.billing_cycle,
          slipUrl: b.slip_url,
          electricUnits: Number(b.electric_units),
          waterUnits: Number(b.water_units)
        }))
      }
    }

    return {
      success: true,
      data: {
        profile,
        roomNumber: roomNumber || null,
        tenantName: tenant.tenant_name || profile.full_name,
        baseRent: tenant.rooms?.room_types ? Number((tenant.rooms as any).room_types.default_rent) : (tenant.rooms?.base_rent ? Number(tenant.rooms.base_rent) : 0),
        bills: formattedBills,
        promptPayId,
        promptPayName
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล Tenant Portal"
    return { success: false, error: errorMessage }
  }
}

