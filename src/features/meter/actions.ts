"use server"

import { createClient } from "@/lib/supabase/server"
import type { RoomRef } from "@/features/room/utils"

const isSupabaseConfigured = 
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co"

export async function getMeterRecords(billingCycle: string, workspaceId?: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    // กรอง workspace ตรง ๆ เพื่อให้ query ใช้ index ได้ ไม่ต้องพึ่ง RLS ประเมินทีละแถวทั่วทั้งตาราง
    // (optional เพื่อไม่พังผู้เรียกที่ไม่มี workspaceId ในมือ — RLS ยังเป็นด่านความปลอดภัยเสมอ)
    let query = supabase
      .from("meter_records")
      .select("*")
      .eq("billing_cycle", billingCycle)
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }
    const { data, error } = await query.order("room_number", { ascending: true })

    if (error) throw error

    const formatted = data.map((m: any) => ({
      id: m.id,
      roomNumber: m.room_number,
      roomId: m.room_id ?? null,
      billingCycle: m.billing_cycle,
      elecPrev: Number(m.elec_prev),
      elecCurr: m.elec_curr === null || m.elec_curr === undefined ? "" : Number(m.elec_curr),
      waterPrev: Number(m.water_prev),
      waterCurr: m.water_curr === null || m.water_curr === undefined ? "" : Number(m.water_curr)
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลมิเตอร์น้ำไฟ"
    return { success: false, error: errorMessage }
  }
}

export async function saveMeterRecord(
  room: RoomRef,
  billingCycle: string,
  elecPrev: number,
  elecCurr: number | string,
  waterPrev: number,
  waterCurr: number | string
) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  const supabase = await createClient()

  // Helper function to perform the insert or update in Supabase
  // จับคู่แถวเดิมด้วย room_id (ตัวระบุห้องที่แท้จริง) — เลขห้องซ้ำกันได้ข้ามอาคาร ถ้าเทียบด้วย
  // room_number การจดมิเตอร์ห้อง 101 ตึก A จะไปทับแถวของห้อง 101 ตึก B
  // room_number ยังเขียนลงไปด้วยในฐานะ snapshot ของประวัติ (ไว้อ่านได้แม้ห้องถูกลบภายหลัง)
  async function attemptSave(
    elecVal: number | null,
    waterVal: number | null,
    roomNumber: string,
    scopedWorkspaceId: string | null
  ) {
    // Check if record already exists for this room and cycle
    //
    // ต้องกรอง workspace_id ด้วย ไม่พึ่ง RLS อย่างเดียว เพราะ policy ของ super_admin คือ
    // "เห็นทุก workspace ที่มี support grant อนุมัติแล้ว" (พหูพจน์) — super_admin ที่ถือ grant
    // สองหอพร้อมกัน และทั้งสองหอมีเลขห้อง+รอบบิลเดียวกัน จะได้ 2 แถวแล้ว maybeSingle() พังทันที
    let existingQuery = supabase
      .from("meter_records")
      .select("id")
      .eq("room_id", room.roomId)
      .eq("billing_cycle", billingCycle)
    if (scopedWorkspaceId) {
      existingQuery = existingQuery.eq("workspace_id", scopedWorkspaceId)
    }
    const { data: existing } = await existingQuery.maybeSingle()

    if (existing) {
      return await supabase
        .from("meter_records")
        .update({
          room_id: room.roomId,
          room_number: roomNumber,
          elec_prev: elecPrev,
          elec_curr: elecVal,
          water_prev: waterPrev,
          water_curr: waterVal
        })
        .eq("id", existing.id)
        .select()
    } else {
      return await supabase
        .from("meter_records")
        .insert([{
          room_number: roomNumber,
          room_id: room.roomId,
          billing_cycle: billingCycle,
          elec_prev: elecPrev,
          elec_curr: elecVal,
          water_prev: waterPrev,
          water_curr: waterVal
        }])
        .select()
    }
  }

  try {
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) await assertSubscriptionActive(workspaceId)

    const elecCurrVal = elecCurr === "" ? null : Number(elecCurr)
    const waterCurrVal = waterCurr === "" ? null : Number(waterCurr)

    // อ่านเลขห้องจาก rooms.id ที่ส่งมา (ไม่ให้ผู้เรียกส่งเลขห้องมาเอง — ถ้าสองฝั่งไม่ตรงกัน
    // คอลัมน์ snapshot จะโกหก) rooms.id เป็น uuid ที่ unique ทั้งระบบ จึงไม่ต้องกรอง workspace ซ้ำ
    const { data: roomRow, error: roomError } = await supabase
      .from("rooms")
      .select("room_number")
      .eq("id", room.roomId)
      .maybeSingle()
    if (roomError) throw roomError
    if (!roomRow) {
      return { success: false, error: "ไม่พบข้อมูลห้องพักนี้ในระบบ" }
    }
    const roomNumber: string = roomRow.room_number

    let result = await attemptSave(elecCurrVal, waterCurrVal, roomNumber, workspaceId)

    // Handle database NOT NULL constraint violation (Postgrest code 23502)
    if (result.error && result.error.code === "23502") {
      console.warn("Database column is NOT NULL. Falling back to previous values. Please run migration to drop NOT NULL constraints.");

      // Fallback: Substitute empty (null) values with previous values
      const fallbackElec = elecCurrVal === null ? Number(elecPrev) : elecCurrVal
      const fallbackWater = waterCurrVal === null ? Number(waterPrev) : waterCurrVal

      result = await attemptSave(fallbackElec, fallbackWater, roomNumber, workspaceId)
    }

    if (result.error) throw result.error
    return { success: true, data: result.data[0] }
  } catch (error: any) {
    const errorMessage = error && error.message ? error.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูลมิเตอร์น้ำไฟ"
    return { success: false, error: errorMessage }
  }
}

export async function saveMeterReplacement(
  workspaceId: string,
  room: RoomRef,
  billingCycle: string,
  meterType: "electric" | "water",
  oldFinalReading: number,
  newStartReading: number
) {
  if (!isSupabaseConfigured) {
    return { success: true, mock: true }
  }

  try {
    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    await assertSubscriptionActive(workspaceId)

    const supabase = await createClient()

    // อ่านเลขห้องจาก rooms.id ที่ส่งมา (ดูหมายเหตุเดียวกันใน saveMeterRecord)
    const { data: roomRow, error: roomError } = await supabase
      .from("rooms")
      .select("room_number")
      .eq("id", room.roomId)
      .maybeSingle()
    if (roomError) throw roomError
    if (!roomRow) {
      return { success: false, error: "ไม่พบข้อมูลห้องพักนี้ในระบบ" }
    }

    // จับคู่แถวเดิมด้วย room_id — เลขห้องซ้ำกันได้ข้ามอาคาร (ดูหมายเหตุใน saveMeterRecord)
    // ยังกรอง workspace_id ด้วย ไม่พึ่ง RLS อย่างเดียว — super_admin ที่ถือ support grant หลายหอ
    // จะเห็นหลายแถวแล้ว maybeSingle() พังทันที
    const { data: existing } = await supabase
      .from("meter_replacements")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("room_id", room.roomId)
      .eq("billing_cycle", billingCycle)
      .eq("meter_type", meterType)
      .maybeSingle()

    let result
    if (existing) {
      result = await supabase
        .from("meter_replacements")
        .update({
          workspace_id: workspaceId,
          room_id: room.roomId,
          room_number: roomRow.room_number,
          old_final_reading: oldFinalReading,
          new_start_reading: newStartReading,
          is_active: true
        })
        .eq("id", existing.id)
        .select()
    } else {
      result = await supabase
        .from("meter_replacements")
        .insert([{
          workspace_id: workspaceId,
          room_number: roomRow.room_number,
          room_id: room.roomId,
          billing_cycle: billingCycle,
          meter_type: meterType,
          old_final_reading: oldFinalReading,
          new_start_reading: newStartReading,
          is_active: true
        }])
        .select()
    }

    if (result.error) throw result.error
    return { success: true, data: result.data[0] }
  } catch (error: any) {
    const errorMessage = error && error.message ? error.message : "เกิดข้อผิดพลาดในการบันทึกเปลี่ยนมิเตอร์"
    return { success: false, error: errorMessage }
  }
}

export async function getMeterReplacements(billingCycle: string, workspaceId?: string) {
  if (!isSupabaseConfigured) {
    return { success: true, data: [] }
  }

  try {
    const supabase = await createClient()
    // กรอง workspace ตรง ๆ เพื่อให้ query ใช้ index ได้ ไม่ต้องพึ่ง RLS ประเมินทีละแถวทั่วทั้งตาราง
    // (optional เพื่อไม่พังผู้เรียกที่ไม่มี workspaceId ในมือ — RLS ยังเป็นด่านความปลอดภัยเสมอ)
    let query = supabase
      .from("meter_replacements")
      .select("*")
      .eq("billing_cycle", billingCycle)
      .eq("is_active", true)
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }
    const { data, error } = await query

    if (error) throw error

    const formatted = data.map((m: any) => ({
      id: m.id,
      workspaceId: m.workspace_id,
      roomNumber: m.room_number,
      roomId: m.room_id ?? null,
      billingCycle: m.billing_cycle,
      meterType: m.meter_type as "electric" | "water",
      oldFinalReading: Number(m.old_final_reading),
      newStartReading: Number(m.new_start_reading)
    }))

    return { success: true, data: formatted }
  } catch (error: any) {
    const errorMessage = error && error.message ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลการเปลี่ยนมิเตอร์"
    return { success: false, error: errorMessage, data: [] }
  }
}

export async function deleteMeterReplacement(
  room: RoomRef,
  billingCycle: string,
  meterType: "electric" | "water"
) {
  if (!isSupabaseConfigured) {
    return { success: true }
  }

  try {
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) await assertSubscriptionActive(workspaceId)

    // ห้ามลบโดยไม่ระบุ workspace — DELETE ที่พึ่ง RLS อย่างเดียวจะกวาดข้ามหอได้
    // (super_admin ที่ถือ support grant สองหอ และทั้งสองหอมีเลขห้อง+รอบบิล+ประเภทมิเตอร์เดียวกัน
    //  จะลบข้อมูลของทั้งสองหอพร้อมกันแบบเงียบ ๆ) ถ้าหา workspace ไม่ได้ให้ปฏิเสธไปเลย ปลอดภัยกว่าลบมั่ว
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพักของผู้ใช้ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง" }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("meter_replacements")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("room_id", room.roomId)
      .eq("billing_cycle", billingCycle)
      .eq("meter_type", meterType)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    const errorMessage = error && error.message ? error.message : "เกิดข้อผิดพลาดในการลบข้อมูลการเปลี่ยนมิเตอร์"
    return { success: false, error: errorMessage }
  }
}

/**
 * ดึงมิเตอร์ครั้งล่าสุดของห้องนี้ (รอบบิลใหม่สุด)
 *
 * workspaceId ควรส่งมาเสมอ — ถ้าไม่ส่ง จะพึ่ง RLS อย่างเดียวซึ่งอาจคืนแถวของหออื่นที่มีเลขห้อง
 * เดียวกันได้ (super_admin ที่ถือ support grant หลายหอ) แล้วค่าที่ได้จะถูกเอาไปใช้เป็น
 * "เลขมิเตอร์ครั้งก่อนหน้า" ตอนย้ายห้องจริง ดู transfer-actions.ts
 */
export async function getLatestMeterRecord(room: RoomRef, workspaceId?: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true, data: null }
  }
  try {
    const supabase = await createClient()
    let query = supabase
      .from("meter_records")
      .select("*")
      .eq("room_id", room.roomId)
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }
    const { data, error } = await query
      .order("billing_cycle", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!data) return { success: true, data: null }

    return {
      success: true,
      data: {
        id: data.id,
        roomNumber: data.room_number,
        roomId: data.room_id ?? null,
        billingCycle: data.billing_cycle,
        elecPrev: Number(data.elec_prev),
        elecCurr: data.elec_curr === null || data.elec_curr === undefined ? null : Number(data.elec_curr),
        waterPrev: Number(data.water_prev),
        waterCurr: data.water_curr === null || data.water_curr === undefined ? null : Number(data.water_curr)
      }
    }
  } catch (error: any) {
    return { success: false, error: error?.message || "เกิดข้อผิดพลาดในการดึงเลขมิเตอร์ล่าสุด" }
  }
}
