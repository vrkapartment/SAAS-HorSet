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

// Helper to parse CSV properly with support for simple quoted values
function parseCSV(csvText: string) {
  const lines = csvText.split(/\r?\n/)
  const results: string[][] = []
  for (const line of lines) {
    if (!line.trim()) continue
    // Splitting by comma, accounting for basic quotes and trim whitespace
    const row = line.split(",").map(val => val.trim().replace(/^["']|["']$/g, ""))
    results.push(row)
  }
  return results
}

/**
 * นำเข้าข้อมูลห้องพักผ่านไฟล์ CSV แบบกลุ่ม (Batch Import) 
 * รองรับการค้นหา room_type_id อัตโนมัติจากชื่อประเภทห้องพัก
 * และใช้ Database transaction (ผ่าน single atomic batch insert ใน Supabase)
 */
export async function importRoomsFromCSV(csvText: string, workspaceId: string) {
  try {
    const supabase = await createClient()

    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัส Workspace (กรุณาลงชื่อเข้าใช้งานใหม่)" }
    }

    // 1. ดึงประเภทห้องพักทั้งหมดของ Workspace นี้มาไว้เป็นแมปสแกนชื่อ
    const { data: roomTypes, error: rtError } = await supabase
      .from("room_types")
      .select("id, name, default_rent")
      .eq("workspace_id", workspaceId)

    if (rtError) throw rtError

    const roomTypeMap = new Map<string, { id: string; defaultRent: number }>()
    roomTypes.forEach(rt => {
      roomTypeMap.set(rt.name.trim().toLowerCase(), { id: rt.id, defaultRent: Number(rt.default_rent || 0) })
    })

    // 2. แปลงไฟล์ CSV เป็นอาร์เรย์แถว
    const rows = parseCSV(csvText)
    if (rows.length < 2) {
      return { success: false, error: "โครงสร้างไฟล์ CSV ไม่ถูกต้อง หรือไม่มีข้อมูลในไฟล์" }
    }

    const headers = rows[0].map(h => h.toLowerCase().trim())
    const roomNumIdx = headers.indexOf("room_number")
    const typeNameIdx = headers.indexOf("room_type_name")
    const floorIdx = headers.indexOf("floor")

    if (roomNumIdx === -1 || typeNameIdx === -1) {
      return { 
        success: false, 
        error: "หัวคอลัมน์ไม่ถูกต้อง ในไฟล์ CSV ต้องมีคอลัมน์ room_number และ room_type_name" 
      }
    }

    const roomsToInsert: any[] = []
    const skippedRooms: { roomNumber: string; reason: string }[] = []

    // 3. วนลูปอ่านข้อมูลทีละแถว และแมปข้อมูล
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (row.length <= Math.max(roomNumIdx, typeNameIdx)) continue

      const roomNumber = row[roomNumIdx]?.trim()
      const typeName = row[typeNameIdx]?.trim()

      if (!roomNumber) continue

      const matchedType = typeName ? roomTypeMap.get(typeName.toLowerCase()) : null

      if (!matchedType) {
        skippedRooms.push({ 
          roomNumber, 
          reason: `ไม่พบประเภทห้อง "${typeName || "ไม่ได้ระบุ"}" ในระบบ` 
        })
        continue
      }

      // ตรวจสอบชั้น (floor) จากคอลัมน์ หรือเดาเลขชั้นโดยดูจากตัวเลขแรกของห้องพัก
      let floor = ""
      if (floorIdx !== -1 && row[floorIdx]?.trim()) {
        floor = row[floorIdx].trim()
      } else {
        const numMatch = roomNumber.match(/^(\d+)/)
        if (numMatch) {
          const numStr = numMatch[1]
          if (numStr.length === 3) {
            floor = numStr.substring(0, 1)
          } else if (numStr.length === 4) {
            floor = numStr.substring(0, 2)
          }
        }
      }

      roomsToInsert.push({
        room_number: roomNumber,
        room_type_id: matchedType.id,
        base_rent: matchedType.defaultRent,
        status: "available",
        floor: floor || null,
        workspace_id: workspaceId
      })
    }

    if (roomsToInsert.length === 0) {
      return {
        success: false,
        error: "ไม่พบรายการห้องพักที่สามารถนำเข้าได้จากไฟล์ที่เลือก",
        skippedRooms
      }
    }

    // 4. บันทึกข้อมูลแบบกลุ่ม (Single Statement Batch) ซึ่งเป็น Transaction ในตัวเองแบบอัตโนมัติ
    const { data, error: insertError } = await supabase
      .from("rooms")
      .insert(roomsToInsert)
      .select()

    if (insertError) {
      console.error("Database Insert Error during CSV import:", insertError)
      let errorMsg = insertError.message
      if (insertError.code === "23505") {
        errorMsg = "มีหมายเลขห้องพักบางส่วนซ้ำซ้อนกับที่มีอยู่แล้วในระบบ กรุณาตรวจสอบและอัปโหลดไฟล์ที่มีเลขห้องใหม่ทั้งหมดอีกครั้ง"
      }
      return { 
        success: false, 
        error: `เกิดข้อผิดพลาดในการบันทึกข้อมูล (ระบบได้ยกเลิกและยกยอดกลับทั้งหมด): ${errorMsg}` 
      }
    }

    return { 
      success: true, 
      insertedCount: roomsToInsert.length,
      skippedRooms 
    }

  } catch (error: any) {
    console.error("Critical error in importRoomsFromCSV server action:", error)
    return { 
      success: false, 
      error: error?.message || "เกิดข้อผิดพลาดไม่คาดคิดขณะนำเข้าข้อมูลไฟล์ CSV" 
    }
  }
}

/**
 * บันทึกรายการห้องพักแบบกลุ่ม (Batch) จากข้อมูลที่ถูก Mapping ประเภทห้องแล้วจากหน้าบ้าน
 */
export async function createRoomsBatch(rooms: {
  room_number: string
  room_type_id: string | null
  base_rent: number
  status: "available" | "occupied"
  floor: string | null
  workspace_id: string
}[]) {
  try {
    const supabase = await createClient()

    if (rooms.length === 0) {
      return { success: false, error: "ไม่พบรายการห้องพักที่จะนำเข้า" }
    }

    const { data, error } = await supabase
      .from("rooms")
      .insert(rooms)
      .select()

    if (error) {
      console.error("Database error in createRoomsBatch:", error)
      let errorMsg = error.message
      if (error.code === "23505") {
        errorMsg = "มีหมายเลขห้องพักบางส่วนซ้ำซ้อนกับที่มีอยู่แล้วในระบบ กรุณาตรวจสอบและเปลี่ยนหมายเลขห้องให้ถูกต้องทั้งหมด"
      }
      return { 
        success: false, 
        error: `เกิดข้อผิดพลาดขณะนำเข้าฐานข้อมูล (รายการทั้งหมดถูกยกเลิกแล้ว): ${errorMsg}` 
      }
    }

    return { success: true, count: rooms.length }
  } catch (error: any) {
    console.error("Critical error in createRoomsBatch:", error)
    return { success: false, error: error?.message || "เกิดข้อผิดพลาดของระบบขณะบันทึกข้อมูล" }
  }
}


