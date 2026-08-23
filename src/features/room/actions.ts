"use server"

import { createClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * หา building_id ที่จะใช้ตอนสร้าง/แก้ไขห้อง — ถ้าไม่ได้ระบุมา (buildingId ว่าง) และ workspace
 * นี้มีอาคารเดียว จะใช้อาคารนั้นให้อัตโนมัติ (ครอบคลุมเคสส่วนใหญ่ที่มีอาคารเดียวโดยไม่ต้องเลือกเอง)
 * ถ้ามีมากกว่า 1 อาคารและไม่ได้ระบุมา จะคืนค่า null (ห้ามเดา ต้องให้ผู้ใช้เลือกจาก UI)
 */
async function resolveBuildingId(
  supabase: SupabaseClient,
  workspaceId: string | null | undefined,
  buildingId?: string | null
): Promise<string | null> {
  if (buildingId) return buildingId
  if (!workspaceId) return null

  const { data } = await supabase
    .from("buildings")
    .select("id")
    .eq("workspace_id", workspaceId)

  if (data && data.length === 1) return data[0].id
  return null
}

// =========================================================================
// 1. Room Types Actions (จัดการประเภทห้องพัก แอร์/พัดลม)
// =========================================================================

export async function getRoomTypes(workspaceId?: string) {
  try {
    const supabase = await createClient()
    let query = supabase.from("room_types").select("*")
    
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }
    
    const { data, error } = await query.order("name", { ascending: true })

    if (error) throw error
    return { success: true, data }
  } catch (error: any) {
    const errorMessage = error?.message || (error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงประเภทห้องพัก")
    return { success: false, error: errorMessage }
  }
}

export async function createRoomType(name: string, defaultRent: number) {
  try {
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
    }

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
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
    }

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
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
    }

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

export async function getRooms(workspaceId?: string) {
  try {
    const supabase = await createClient()
    let query = supabase
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
          lease_end,
          deposit_paid
        ),
        buildings (
          code,
          name
        )
      `)

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }

    const { data, error } = await query.order("room_number", { ascending: true })

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
        depositPaid: tenant && tenant.deposit_paid !== null && tenant.deposit_paid !== undefined ? Number(tenant.deposit_paid) : null,
        buildingId: room.building_id || null,
        // รหัส/ชื่ออาคาร ใช้กำกับเลขห้องที่ซ้ำกันข้ามอาคาร และประกอบเลขใบกำกับฝั่ง client
        // (ชื่ออาคารเป็นตัวสำรองเมื่อยังไม่ได้ตั้งรหัส — ดู formatRoomLabel)
        buildingCode: room.buildings?.code ?? null,
        buildingName: room.buildings?.name ?? null,
        roomTypeId: room.room_type_id,
        roomTypeName: room.room_types ? room.room_types.name : "ไม่ได้ระบุ",
        waiveElectricMin: !!room.waive_electric_min,
        waiveWaterMin: !!room.waive_water_min,
        extraExpenses: room.extra_expenses || [],
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

export async function createRoom(roomNumber: string, roomTypeId: string, baseRent: number, floor: string, extraExpenses: any[] = [], buildingId?: string) {
  try {
    const { assertSubscriptionActive, checkWorkspaceQuota, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
      await checkWorkspaceQuota(workspaceId, "rooms")
    }

    const supabase = await createClient()
    const resolvedBuildingId = await resolveBuildingId(supabase, workspaceId, buildingId)

    const { data, error } = await supabase
      .from("rooms")
      .insert([{
        room_number: roomNumber,
        room_type_id: roomTypeId || null,
        base_rent: baseRent,
        status: "available",
        floor: floor || null,
        extra_expenses: extraExpenses,
        building_id: resolvedBuildingId
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
  status: "occupied" | "available" | "Pending_Refund",
  floor: string,
  waiveElectricMin: boolean = false,
  waiveWaterMin: boolean = false,
  extraExpenses: any[] = [],
  buildingId?: string
) {
  try {
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
    }

    const supabase = await createClient()

    const updatePayload: {
      room_number: string
      room_type_id: string | null
      base_rent: number
      status: "occupied" | "available" | "Pending_Refund"
      floor: string | null
      waive_electric_min: boolean
      waive_water_min: boolean
      extra_expenses: any[]
      updated_at: string
      building_id?: string | null
    } = {
      room_number: roomNumber,
      room_type_id: roomTypeId || null,
      base_rent: baseRent,
      status: status,
      floor: floor || null,
      waive_electric_min: waiveElectricMin,
      waive_water_min: waiveWaterMin,
      extra_expenses: extraExpenses,
      updated_at: new Date().toISOString()
    }
    // เซ็ต building_id เฉพาะตอนที่ผู้เรียกส่งมาจริง ไม่งั้นปล่อยค่าเดิมของห้องไว้ (ไม่ auto-resolve
    // ตอนแก้ไข เพราะห้องนี้อาจถูกกำหนดอาคารไว้แล้วก่อนหน้า ไม่ควรเดาทับ)
    if (buildingId !== undefined) {
      updatePayload.building_id = buildingId || null
    }

    const { data, error } = await supabase
      .from("rooms")
      .update(updatePayload)
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
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
    }

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
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
    }

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
    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
    }

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
 * เช็คโควตาห้องพักแบบกลุ่ม (batch) ก่อน insert หลายห้องพร้อมกัน (importRoomsFromCSV / createRoomsBatch)
 * ต้องเช็คจำนวนห้องที่มีอยู่แล้ว + จำนวนที่จะเพิ่มใหม่ทั้งหมด ไม่เกิน limit ของแผน
 * (เช็คทีละห้องแบบ checkWorkspaceQuota ไม่ได้ เพราะ count จะไม่อัปเดตจนกว่าจะ insert จริง)
 * คืนค่า error message ภาษาไทยถ้าจะเกินโควตา หรือ null ถ้าผ่าน (all-or-nothing ก่อน insert ใดๆ ทั้งสิ้น)
 */
async function checkRoomsQuotaForBatch(workspaceId: string, additionalCount: number): Promise<string | null> {
  if (!workspaceId || additionalCount <= 0) return null

  const supabase = await createClient()
  const { data: sub, error: subError } = await supabase
    .from("workspace_subscriptions")
    .select("saas_plans (max_rooms, name)")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  // ยังไม่มี migration หรือยังไม่มีแถว subscription -> ไม่จำกัด (fail-open เหมือน checkWorkspaceQuota)
  if (subError?.code === "42P01" || !sub) return null

  const planRow = Array.isArray(sub.saas_plans) ? sub.saas_plans[0] : sub.saas_plans
  if (!planRow) return null

  const limit = (planRow as { max_rooms: number | null; name: string }).max_rooms
  if (limit === null || limit === undefined) return null // ไม่จำกัด

  const { count } = await supabase.from("rooms").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId)
  const currentCount = count || 0
  const totalAfter = currentCount + additionalCount

  if (totalAfter > limit) {
    const planName = (planRow as { max_rooms: number | null; name: string }).name
    const overBy = totalAfter - limit
    return `แผน "${planName}" ของคุณรองรับจำนวนห้องพักสูงสุด ${limit} ห้อง (ปัจจุบันมี ${currentCount} ห้อง และกำลังจะนำเข้าเพิ่มอีก ${additionalCount} ห้อง ซึ่งเกินโควตาไป ${overBy} ห้อง) กรุณาอัปเกรดแผนหรือลดจำนวนห้องที่จะนำเข้าก่อน`
  }

  return null
}

/**
 * นำเข้าข้อมูลห้องพักผ่านไฟล์ CSV แบบกลุ่ม (Batch Import) 
 * รองรับการค้นหา room_type_id อัตโนมัติจากชื่อประเภทห้องพัก
 * และใช้ Database transaction (ผ่าน single atomic batch insert ใน Supabase)
 */
export async function importRoomsFromCSV(csvText: string, workspaceId: string) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัส Workspace (กรุณาลงชื่อเข้าใช้งานใหม่)" }
    }

    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    await assertSubscriptionActive(workspaceId)

    const supabase = await createClient()

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

    // 1.5 หาอาคารเริ่มต้นของ workspace นี้ (ใช้ตอนที่ workspace มีอาคารเดียวเท่านั้น กันเดาผิดถ้ามีหลายอาคาร)
    const defaultBuildingId = await resolveBuildingId(supabase, workspaceId, undefined)

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
        workspace_id: workspaceId,
        building_id: defaultBuildingId
      })
    }

    if (roomsToInsert.length === 0) {
      return {
        success: false,
        error: "ไม่พบรายการห้องพักที่สามารถนำเข้าได้จากไฟล์ที่เลือก",
        skippedRooms
      }
    }

    // 3.5 เช็คโควตาห้องพักของแผนก่อน insert จริง (all-or-nothing เหมือน transaction เดิม)
    const quotaError = await checkRoomsQuotaForBatch(workspaceId, roomsToInsert.length)
    if (quotaError) {
      return { success: false, error: quotaError }
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
  building_id?: string | null
}[]) {
  try {
    if (rooms.length === 0) {
      return { success: false, error: "ไม่พบรายการห้องพักที่จะนำเข้า" }
    }

    const workspaceId = rooms[0]?.workspace_id
    if (workspaceId) {
      const { assertSubscriptionActive } = await import("@/features/subscription/actions")
      await assertSubscriptionActive(workspaceId)

      const quotaError = await checkRoomsQuotaForBatch(workspaceId, rooms.length)
      if (quotaError) {
        return { success: false, error: quotaError }
      }
    }

    const supabase = await createClient()

    // ถ้าแถวไหนไม่ได้ระบุ building_id มา ให้ resolve อาคารเริ่มต้นของ workspace นั้น (เฉพาะกรณีมีอาคารเดียว)
    const defaultBuildingId = await resolveBuildingId(supabase, workspaceId, undefined)
    const roomsWithBuilding = rooms.map(r => ({
      ...r,
      building_id: r.building_id !== undefined ? r.building_id : defaultBuildingId
    }))

    const { data, error } = await supabase
      .from("rooms")
      .insert(roomsWithBuilding)
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

export async function updateRoomStatus(id: string, status: "occupied" | "available" | "Pending_Refund") {
  try {
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rooms")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()

    if (error) throw error
    return { success: true, data: data[0] }
  } catch (error: any) {
    return { success: false, error: error?.message || "เกิดข้อผิดพลาดในการอัปเดตสถานะห้องพัก" }
  }
}


