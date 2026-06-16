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
          tenant_name,
          tenant_phone
        )
      `)
      .order("room_number", { ascending: true })

    if (error) throw error

    const formatted = data.map((room: any) => {
      const tenant = room.tenants && room.tenants[0] ? room.tenants[0] : null
      return {
        id: room.id,
        roomNumber: room.room_number,
        status: room.status,
        baseRent: room.room_types ? Number(room.room_types.default_rent) : Number(room.base_rent),
        tenantName: tenant ? tenant.tenant_name : null,
        tenantPhone: tenant ? tenant.tenant_phone : null,
        roomTypeId: room.room_type_id,
        roomTypeName: room.room_types ? room.room_types.name : "ไม่ได้ระบุ"
      }
    })

    return { success: true, data: formatted }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลห้องพัก")
    return { success: false, error: errorMessage }
  }
}

export async function createRoom(roomNumber: string, roomTypeId: string, baseRent: number) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rooms")
      .insert([{ 
        room_number: roomNumber, 
        room_type_id: roomTypeId || null, 
        base_rent: baseRent, 
        status: "available" 
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
  status: "occupied" | "available"
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
