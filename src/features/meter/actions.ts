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

  try {
    const supabase = await createClient()
    
    // Check if record already exists for this room and cycle
    const { data: existing } = await supabase
      .from("meter_records")
      .select("id")
      .eq("room_number", roomNumber)
      .eq("billing_cycle", billingCycle)
      .single()

    const elecCurrVal = elecCurr === "" ? null : Number(elecCurr)
    const waterCurrVal = waterCurr === "" ? null : Number(waterCurr)

    let result
    if (existing) {
      result = await supabase
        .from("meter_records")
        .update({
          elec_prev: elecPrev,
          elec_curr: elecCurrVal,
          water_prev: waterPrev,
          water_curr: waterCurrVal
        })
        .eq("id", existing.id)
        .select()
    } else {
      result = await supabase
        .from("meter_records")
        .insert([{
          room_number: roomNumber,
          billing_cycle: billingCycle,
          elec_prev: elecPrev,
          elec_curr: elecCurrVal,
          water_prev: waterPrev,
          water_curr: waterCurrVal
        }])
        .select()
    }

    if (result.error) throw result.error
    return { success: true, data: result.data[0] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูลมิเตอร์น้ำไฟ"
    return { success: false, error: errorMessage }
  }
}
