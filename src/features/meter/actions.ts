"use server"

import { createClient } from "@/lib/supabase/server"

const isSupabaseConfigured = 
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co"

export async function getMeterRecords(billingCycle: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("meter_records")
      .select("*")
      .eq("billing_cycle", billingCycle)
      .order("room_number", { ascending: true })

    if (error) throw error

    const formatted = data.map((m: any) => ({
      id: m.id,
      roomNumber: m.room_number,
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
  roomNumber: string,
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
  async function attemptSave(elecVal: number | null, waterVal: number | null) {
    // Check if record already exists for this room and cycle
    const { data: existing } = await supabase
      .from("meter_records")
      .select("id")
      .eq("room_number", roomNumber)
      .eq("billing_cycle", billingCycle)
      .maybeSingle()

    if (existing) {
      return await supabase
        .from("meter_records")
        .update({
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
    const elecCurrVal = elecCurr === "" ? null : Number(elecCurr)
    const waterCurrVal = waterCurr === "" ? null : Number(waterCurr)

    let result = await attemptSave(elecCurrVal, waterCurrVal)

    // Handle database NOT NULL constraint violation (Postgrest code 23502)
    if (result.error && result.error.code === "23502") {
      console.warn("Database column is NOT NULL. Falling back to previous values. Please run migration to drop NOT NULL constraints.");
      
      // Fallback: Substitute empty (null) values with previous values
      const fallbackElec = elecCurrVal === null ? Number(elecPrev) : elecCurrVal
      const fallbackWater = waterCurrVal === null ? Number(waterPrev) : waterCurrVal
      
      result = await attemptSave(fallbackElec, fallbackWater)
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
  roomNumber: string,
  billingCycle: string,
  meterType: "electric" | "water",
  oldFinalReading: number,
  newStartReading: number
) {
  if (!isSupabaseConfigured) {
    return { success: true, mock: true }
  }

  try {
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from("meter_replacements")
      .select("id")
      .eq("room_number", roomNumber)
      .eq("billing_cycle", billingCycle)
      .eq("meter_type", meterType)
      .maybeSingle()

    let result
    if (existing) {
      result = await supabase
        .from("meter_replacements")
        .update({
          workspace_id: workspaceId,
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
          room_number: roomNumber,
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

export async function getMeterReplacements(billingCycle: string) {
  if (!isSupabaseConfigured) {
    return { success: true, data: [] }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("meter_replacements")
      .select("*")
      .eq("billing_cycle", billingCycle)
      .eq("is_active", true)

    if (error) throw error

    const formatted = data.map((m: any) => ({
      id: m.id,
      workspaceId: m.workspace_id,
      roomNumber: m.room_number,
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
  roomNumber: string,
  billingCycle: string,
  meterType: "electric" | "water"
) {
  if (!isSupabaseConfigured) {
    return { success: true }
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("meter_replacements")
      .delete()
      .eq("room_number", roomNumber)
      .eq("billing_cycle", billingCycle)
      .eq("meter_type", meterType)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    const errorMessage = error && error.message ? error.message : "เกิดข้อผิดพลาดในการลบข้อมูลการเปลี่ยนมิเตอร์"
    return { success: false, error: errorMessage }
  }
}
