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
      waterUnits: Number(b.water_units),
      penaltyAmount: Number(b.penalty_amount || 0),
      lateDays: Number(b.late_days || 0)
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

// Helper to calculate late days (equivalent to the one in Portal)
function calculateLateDays(cycleStr: string): number {
  if (!cycleStr || !cycleStr.includes("-")) return 0
  const [yearStr, monthStr] = cycleStr.split("-")
  const year = parseInt(yearStr, 10)
  
  // สำหรับบิลรอบเดือน มิถุนายน (06) กำหนดจ่ายคือวันที่ 5 ของเดือนถัดไป (กรกฎาคม / index 6)
  const dueMonth = parseInt(monthStr, 10) 
  
  const dueDate = new Date(year, dueMonth, 5, 23, 59, 59, 999)
  const now = new Date()
  
  if (now <= dueDate) return 0
  
  const dueMidnight = new Date(year, dueMonth, 5)
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  const diffTime = nowMidnight.getTime() - dueMidnight.getTime()
  if (diffTime <= 0) return 0
  
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
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

    // ดึงข้อมูลบิลเดิมมาคำนวณและเก็บค่าปรับล่าช้าลงฐานข้อมูลอัตโนมัติ
    let billData: any = null
    try {
      const { data } = await activeClient
        .from("bills")
        .select("*")
        .eq("id", id)
        .maybeSingle()
      billData = data
    } catch (e) {
      console.error("Error fetching bill for penalty calculation:", e)
    }

    const updateData: any = { status }
    if (slipUrl !== undefined) {
      updateData.slip_url = slipUrl
    }

    if (billData) {
      if (status === "paid") {
        // หากเปลี่ยนเป็นสถานะชำระแล้ว และก่อนหน้านี้ยังไม่ใช่ paid
        if (billData.status !== "paid") {
          let latePenaltyRate = 0
          const workspaceId = billData.workspace_id
          if (workspaceId) {
            try {
              const { data: wsData } = await activeClient
                .from("workspaces")
                .select("late_penalty_rate")
                .eq("id", workspaceId)
                .maybeSingle()
              if (wsData && wsData.late_penalty_rate !== null && wsData.late_penalty_rate !== undefined) {
                latePenaltyRate = Number(wsData.late_penalty_rate)
              }
            } catch (err) {
              console.warn("Could not query late_penalty_rate for workspace:", err)
            }
          }

          const lateDays = calculateLateDays(billData.billing_cycle)
          const penaltyAmount = lateDays * latePenaltyRate

          if (penaltyAmount > 0) {
            updateData.penalty_amount = penaltyAmount
            // หากบิลเดิมมีสถานะค้างชำระ (unpaid) และแอดมินกดรับเงินโดยตรง ยอดเงินรวมควรเพิ่มค่าปรับเข้าไป
            if (amount !== undefined && amount !== null) {
              updateData.amount = Number(amount)
            } else if (billData.status === "unpaid") {
              updateData.amount = Number(billData.amount) + penaltyAmount
            }
          } else {
            updateData.penalty_amount = 0
            if (amount !== undefined && amount !== null) {
              updateData.amount = Number(amount)
            }
          }
        } else {
          if (amount !== undefined && amount !== null) {
            updateData.amount = Number(amount)
          }
        }
      } else if (status === "pending") {
        // คำนวณและบันทึกค่าปรับล่าช้าในขั้นตอนส่งสลิปตรวจ
        let latePenaltyRate = 0
        const workspaceId = billData.workspace_id
        if (workspaceId) {
          try {
            const { data: wsData } = await activeClient
              .from("workspaces")
              .select("late_penalty_rate")
              .eq("id", workspaceId)
              .maybeSingle()
            if (wsData && wsData.late_penalty_rate !== null && wsData.late_penalty_rate !== undefined) {
              latePenaltyRate = Number(wsData.late_penalty_rate)
            }
          } catch (err) {
            console.warn("Could not query late_penalty_rate for workspace:", err)
          }
        }

        const lateDays = calculateLateDays(billData.billing_cycle)
        const penaltyAmount = lateDays * latePenaltyRate
        updateData.penalty_amount = penaltyAmount

        if (amount !== undefined && amount !== null) {
          updateData.amount = Number(amount)
        }
      } else if (status === "unpaid") {
        // คืนค่าค่าปรับเป็น 0 หากถูกรีเซ็ตหรือปฏิเสธสลิปกลับเป็นค้างชำระ
        updateData.penalty_amount = 0
        if (amount !== undefined && amount !== null) {
          updateData.amount = Number(amount)
        }
      }
    } else {
      if (amount !== undefined && amount !== null) {
        updateData.amount = Number(amount)
      }
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

export async function updateBillPenalty(id: string, lateDays: number, penaltyAmount: number, amount: number) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("bills")
      .update({
        late_days: lateDays,
        penalty_amount: penaltyAmount,
        amount: amount
      })
      .eq("id", id)
      .select()

    if (error) throw error
    return { success: true, data: data[0] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอัปเดตค่าปรับ"
    return { success: false, error: errorMessage }
  }
}
