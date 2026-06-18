"use server"

import { createClient } from "@/lib/supabase/server"

const isSupabaseConfigured = 
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co"

export async function getBills(billingCycle?: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    let query = supabase.from("bills").select("*")
    if (billingCycle) {
      query = query.eq("billing_cycle", billingCycle)
    }
    const { data, error } = await query.order("room_number", { ascending: true })
    if (error) throw error

    const formatted = data.map((b: any) => ({
      id: b.id,
      roomNumber: b.room_number,
      tenantName: b.tenant_name,
      amount: Number(b.amount),
      status: b.status as "unpaid" | "pending" | "paid",
      billingCycle: b.billing_cycle,
      slipUrl: b.slip_url,
      electricUnits: Number(b.electric_units),
      waterUnits: Number(b.water_units)
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลบิล"
    return { success: false, error: errorMessage }
  }
}

export async function createBill(
  roomNumber: string,
  tenantName: string,
  amount: number,
  status: "unpaid" | "pending" | "paid",
  billingCycle: string,
  electricUnits: number,
  waterUnits: number
) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    
    // Check if a bill already exists for this room and cycle
    const { data: existing } = await supabase
      .from("bills")
      .select("id")
      .eq("room_number", roomNumber)
      .eq("billing_cycle", billingCycle)
      .single()

    let result
    if (existing) {
      result = await supabase
        .from("bills")
        .update({
          tenant_name: tenantName,
          amount,
          status,
          electric_units: electricUnits,
          water_units: waterUnits
        })
        .eq("id", existing.id)
        .select()
    } else {
      result = await supabase
        .from("bills")
        .insert([{
          room_number: roomNumber,
          tenant_name: tenantName,
          amount,
          status,
          billing_cycle: billingCycle,
          electric_units: electricUnits,
          water_units: waterUnits
        }])
        .select()
    }

    if (result.error) throw result.error
    return { success: true, data: result.data[0] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการออกใบแจ้งหนี้"
    return { success: false, error: errorMessage }
  }
}

export async function updateBillStatus(id: string, status: "unpaid" | "pending" | "paid", slipUrl?: string | null, amount?: number) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    let activeClient = supabase

    // ความปลอดภัยสูงมาก (High Security): 
    // - หากผู้เช่ากดส่งสลิปเพื่อขอตรวจสอบ (สถานะเป็น "pending") อนุญาตให้ใช้ Admin Client บายพาส RLS ได้ 
    // - หากเป็นค่ายอดชำระจริง ("paid" หรือ "unpaid") ที่ต้องการสิทธิ์แอดมิน ให้ใช้สิทธิ์คุกกี้ผู้ใช้ตาม RLS ทั่วไป เพื่อป้องกันการแฮกเปลี่ยนสถานะบิลของตนเอง
    if (status === "pending") {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (url && serviceKey && !serviceKey.includes("placeholder")) {
        const { createClient: createSupabaseClient } = await import("@supabase/supabase-js")
        activeClient = createSupabaseClient(url, serviceKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          }
        }) as any
      }
    }

    const updateData: any = { status }
    if (slipUrl !== undefined) {
      updateData.slip_url = slipUrl
    }
    if (amount !== undefined && amount !== null) {
      updateData.amount = Number(amount)
    }

    const { data, error } = await activeClient
      .from("bills")
      .update(updateData)
      .eq("id", id)
      .select()

    if (error) throw error
    return { success: true, data: data[0] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอัปเดตสถานะบิล"
    return { success: false, error: errorMessage }
  }
}

export async function deleteBill(id: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("bills")
      .delete()
      .eq("id", id)

    if (error) throw error
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบบิล"
    return { success: false, error: errorMessage }
  }
}
