"use server"

import { createClient } from "@/lib/supabase/server"

// =========================================================================
// 1. Room Types Actions (จัดการประเภทห้องพัก แอร์/พัดลม)
// =========================================================================

export async function getRoomTypes() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("room_types")
      .select("*")
      .order("name", { ascending: true })

    if (error) throw error
    return { success: true, data }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงประเภทห้องพัก")
    return { success: false, error: errorMessage }
  }
}

export async function createRoomType(name: string, defaultRent: number) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("room_types")
      .insert([{ name, default_rent: defaultRent }])
      .select()

    if (error) throw error
    return { success: true, data: data[0] }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการสร้างประเภทห้องพัก")
    return { success: false, error: errorMessage }
  }
}

export async function updateRoomType(id: string, name: string, defaultRent: number) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("room_types")
      .update({ name, default_rent: defaultRent })
      .eq("id", id)
      .select()

    if (error) throw error
    return { success: true, data: data[0] }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการแก้ไขประเภทห้องพัก")
    return { success: false, error: errorMessage }
  }
}

export async function deleteRoomType(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("room_types")
      .delete()
      .eq("id", id)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบประเภทห้องพัก")
    return { success: false, error: errorMessage }
  }
}

// =========================================================================
// 2. Rooms Actions (เชื่อมโยงกับ Room Types)
// =========================================================================

export async function getRooms() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rooms")
      .select(`
        *,
        room_types (
          id,
          name,
          default_rent
        ),
        tenants (
          id,
          tenant_name,
          tenant_phone,
          line_user_id,
          lease_start,
          lease_end
        )
      `)
      .order("room_number", { ascending: true })

    if (error) throw error

    const formatted = data.map((room: any) => {
      const tenant = room.tenants && room.tenants[0] ? room.tenants[0] : null
      return {
        id: room.id,
        roomNumber: room.room_number,
        floor: room.floor || "",
        status: room.status,
        baseRent: room.room_types ? Number(room.room_types.default_rent) : Number(room.base_rent),
        tenantId: tenant ? tenant.id : null,
        tenantName: tenant ? tenant.tenant_name : null,
        tenantPhone: tenant ? tenant.tenant_phone : null,
        lineUserId: tenant ? tenant.line_user_id : null,
        leaseStart: tenant ? tenant.lease_start : null,
        leaseEnd: tenant ? tenant.lease_end : null,
        roomTypeId: room.room_type_id,
        roomTypeName: room.room_types ? room.room_types.name : "ไม่ได้ระบุ",
        waiveElectricMin: !!room.waive_electric_min,
        waiveWaterMin: !!room.waive_water_min,
        allTenants: (room.tenants || []).map((t: any) => ({
          id: t.id,
          tenantName: t.tenant_name,
          tenantPhone: t.tenant_phone,
          lineUserId: t.line_user_id,
          leaseStart: t.lease_start,
          leaseEnd: t.lease_end
        }))
      }
    })

    return { success: true, data: formatted }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลห้องพัก")
    return { success: false, error: errorMessage }
  }
}

export async function createRoom(roomNumber: string, roomTypeId: string, baseRent: number, floor: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rooms")
      .insert([{ 
        room_number: roomNumber, 
        room_type_id: roomTypeId || null, 
        base_rent: baseRent, 
        status: "available",
        floor: floor || null
      }])
      .select()

    if (error) throw error
    return { success: true, data: data[0] }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการสร้างห้องพัก")
    return { success: false, error: errorMessage }
  }
}

export async function updateRoom(
  id: string, 
  roomNumber: string, 
  roomTypeId: string, 
  baseRent: number, 
  status: "occupied" | "available",
  floor: string,
  waiveElectricMin: boolean = false,
  waiveWaterMin: boolean = false
) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rooms")
      .update({
        room_number: roomNumber,
        room_type_id: roomTypeId || null,
        base_rent: baseRent,
        status: status,
        floor: floor || null,
        waive_electric_min: waiveElectricMin,
        waive_water_min: waiveWaterMin,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()

    if (error) throw error
    return { success: true, data: data[0] }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการแก้ไขห้องพัก")
    return { success: false, error: errorMessage }
  }
}

export async function deleteRoom(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("rooms")
      .delete()
      .eq("id", id)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบห้องพัก")
    return { success: false, error: errorMessage }
  }
}

/**
 * อัปเดตเงินประกันของประเภทห้องพักเฉพาะ (ใช้ในโหมด ระบุจำนวนเงินคงที่แยกตามประเภทห้อง)
 */
export async function updateRoomTypeDeposit(id: string, depositAmount: number) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("room_types")
      .update({ deposit_amount: depositAmount })
      .eq("id", id)
      .select()

    if (error) throw error
    return { success: true, data: data[0] }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการแก้ไขค่าเงินประกันประเภทห้องพัก")
    return { success: false, error: errorMessage }
  }
}

export async function migrateRoomTypeDeposits(workspaceId: string, depositsMap: { [key: string]: number }) {
  try {
    const supabase = await createClient()
    for (const [id, amount] of Object.entries(depositsMap)) {
      await supabase
        .from("room_types")
        .update({ deposit_amount: Number(amount) })
        .eq("id", id)
    }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || "เกิดข้อผิดพลาดในการย้ายข้อมูลเงินประกันประเภทห้องพัก" }
  }
}

