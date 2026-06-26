"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { calculateLateDays } from "./utils"
import { getRooms } from "@/features/room/actions"
import { getMeterRecords, getMeterReplacements } from "@/features/meter/actions"
import { getFinanceSettings } from "@/features/finance/actions"

const isSupabaseConfigured = 
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co"

export async function getBills(billingCycle?: string, year?: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    let query = supabase.from("bills").select("*")
    if (billingCycle) {
      query = query.eq("billing_cycle", billingCycle)
    } else if (year) {
      query = query.like("billing_cycle", `${year}-%`)
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
      penaltyAmount: b.penalty_amount !== null && b.penalty_amount !== undefined ? Number(b.penalty_amount) : null,
      lateDays: b.late_days !== null && b.late_days !== undefined ? Number(b.late_days) : null,
      otherServiceAmount: b.other_service_amount !== null && b.other_service_amount !== undefined ? Number(b.other_service_amount) : 0,
      invoiceId: b.invoice_id
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
  waterUnits: number,
  otherServiceAmount: number = 0
) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    
    // Check if a bill already exists for this room and cycle
    const { data: existing } = await supabase
      .from("bills")
      .select("id, penalty_amount, invoice_id")
      .eq("room_number", roomNumber)
      .eq("billing_cycle", billingCycle)
      .maybeSingle()

    let result
    if (existing) {
      // ป้องกันยอดเงินรวมโดนทับ หากมีค่าปรับบันทึกไว้อยู่แล้ว
      const existingPenalty = Number(existing.penalty_amount || 0)
      const finalAmount = amount + existingPenalty
      
      const invoiceId = (existing as any).invoice_id || `INV-${billingCycle.replace('-', '')}-${roomNumber}`

      result = await supabase
        .from("bills")
        .update({
          tenant_name: tenantName,
          amount: finalAmount,
          status,
          electric_units: electricUnits,
          water_units: waterUnits,
          other_service_amount: otherServiceAmount,
          invoice_id: invoiceId
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
          water_units: waterUnits,
          other_service_amount: otherServiceAmount,
          late_days: null,
          penalty_amount: null,
          invoice_id: `INV-${billingCycle.replace('-', '')}-${roomNumber}`
        }])
        .select()
    }

    if (result.error) throw result.error
    return { success: true, data: result.data[0] }
  } catch (error: any) {
    let errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการออกใบแจ้งหนี้"
    if (errorMessage.includes("column") && (errorMessage.includes("other_service_amount"))) {
      errorMessage = `⚠️ ตรวจพบว่าระบบยังมองไม่เห็นคอลัมน์ 'other_service_amount' ในตาราง bills (Schema Cache ใน Supabase ยังไม่อัปเดต)\n\nกรุณาทำตามขั้นตอนต่อไปนี้เพื่อแก้ไข:\n1. ไปที่แดชบอร์ด Supabase ของท่าน\n2. เข้าเมนู SQL Editor ทางด้านซ้าย\n3. สร้าง Query ใหม่แล้วพิมพ์คำสั่งดังนี้:\n   ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS other_service_amount numeric DEFAULT 0;\n   NOTIFY pgrst, 'reload schema';\n4. กดปุ่ม Run เพื่อเพิ่มคอลัมน์และล้างแคช จากนั้นกลับมาทดสอบบันทึกบิลใหม่อีกครั้ง!`
    }
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
      // ตรวจสอบว่าบิลนี้มีค่าปรับเดิมบันทึกไว้ในฐานข้อมูลแล้วหรือไม่ (รวมถึงกรณีเป็น 0 ที่ผู้ใช้ตั้งใจกรอกหรือตั้งค่าไว้)
      const hasExistingPenalty = billData.penalty_amount !== null && billData.penalty_amount !== undefined

      if (status === "paid") {
        // หากเปลี่ยนเป็นสถานะชำระแล้ว และก่อนหน้านี้ยังไม่ใช่ paid
        if (billData.status !== "paid") {
          if (hasExistingPenalty) {
            // หากมีค่าปรับเดิมอยู่แล้ว (รวมถึงกรณีเป็น 0 ที่จงใจตั้งค่าไว้) ให้เกียรติและใช้ค่าเดิม ห้ามคำนวณใหม่ทับเด็ดขาด
            updateData.penalty_amount = Number(billData.penalty_amount)
            updateData.late_days = billData.late_days !== null && billData.late_days !== undefined ? Number(billData.late_days) : 0
            
            if (amount !== undefined && amount !== null) {
              updateData.amount = Number(amount)
            } else {
              // ใช้ยอดเงินเดิมใน DB เลย ไม่บวกซ้ำซ้อน
              updateData.amount = Number(billData.amount)
            }
          } else {
            // หากไม่เคยมีข้อมูลค่าปรับมาก่อน (เป็น null) ให้ทำการคำนวณตามสูตรปกติ
            let latePenaltyRate = 0
            let workspaceId = billData.workspace_id
            if (!workspaceId) {
              try {
                const profileRes = await getCurrentUserProfileAction()
                if (profileRes.success && profileRes.data?.workspace_id) {
                  workspaceId = profileRes.data.workspace_id
                }
              } catch (err) {
                console.warn("Could not get workspace_id from current profile:", err)
              }
            }

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

            updateData.late_days = lateDays
            if (penaltyAmount > 0) {
              updateData.penalty_amount = penaltyAmount
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
          }
        } else {
          if (amount !== undefined && amount !== null) {
            updateData.amount = Number(amount)
          }
        }
      } else if (status === "pending") {
        if (hasExistingPenalty) {
          // หากมีค่าปรับเดิมอยู่แล้ว ให้ใช้ค่าเดิม ไม่คำนวณใหม่
          updateData.penalty_amount = Number(billData.penalty_amount)
          updateData.late_days = billData.late_days !== null && billData.late_days !== undefined ? Number(billData.late_days) : 0
          if (amount !== undefined && amount !== null) {
            updateData.amount = Number(amount)
          }
        } else {
          // คำนวณและบันทึกค่าปรับล่าช้าในขั้นตอนส่งสลิปตรวจ
          let latePenaltyRate = 0
          let workspaceId = billData.workspace_id
          if (!workspaceId) {
            try {
              const profileRes = await getCurrentUserProfileAction()
              if (profileRes.success && profileRes.data?.workspace_id) {
                workspaceId = profileRes.data.workspace_id
              }
            } catch (err) {
              console.warn("Could not get workspace_id from current profile:", err)
            }
          }

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
          
          updateData.late_days = lateDays
          updateData.penalty_amount = penaltyAmount

          if (amount !== undefined && amount !== null) {
            updateData.amount = Number(amount)
          } else if (billData.status === "unpaid") {
            updateData.amount = Number(billData.amount) + penaltyAmount
          }
        }
      } else if (status === "unpaid") {
        // เมื่อปฏิเสธสลิปหรือกลับไปค้างชำระ
        if (hasExistingPenalty) {
          updateData.penalty_amount = Number(billData.penalty_amount)
          updateData.late_days = billData.late_days !== null && billData.late_days !== undefined ? Number(billData.late_days) : 0
        } else {
          updateData.penalty_amount = 0
          updateData.late_days = 0
        }
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

export async function updateBillPenalty(id: string, lateDays: number, penaltyAmount: number, amount: number, otherServiceAmount?: number) {
  console.log("🖥️ [Server Action] updateBillPenalty started:", { id, lateDays, penaltyAmount, amount, otherServiceAmount })
  if (!isSupabaseConfigured) {
    console.error("🖥️ [Server Action] Supabase is NOT configured")
    return { success: false, fallback: true }
  }

  try {
    // 1. ตรวจสอบสิทธิ์ผู้ใช้งานบน Server (เฉพาะ Staff, Admin หรือ Super Admin เท่านั้น) เพื่อความปลอดภัยสูงสุด
    const profileRes = await getCurrentUserProfileAction()
    console.log("🖥️ [Server Action] Checked profile response success:", profileRes.success)
    if (!profileRes.success || !profileRes.data) {
      console.error("🖥️ [Server Action] Profile lookup failed or unauthorized")
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" }
    }
    
    const role = profileRes.data.role
    console.log("🖥️ [Server Action] User role:", role)
    if (role !== "admin" && role !== "staff" && role !== "super_admin") {
      console.error("🖥️ [Server Action] Role is unauthorized:", role)
      return { success: false, error: "⚠️ ขออภัย คุณไม่มีสิทธิ์ในการบันทึกค่าปรับล่าช้า" }
    }

    // 2. เชื่อมต่อฐานข้อมูลโดยสลับไปใช้ Admin Client หากตั้งค่า Service Role Key ไว้
    const supabase = await createClient()
    let activeClient = supabase

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const hasServiceKey = !!(url && serviceKey && !serviceKey.includes("placeholder"))
    console.log("🖥️ [Server Action] Service Role Key present:", hasServiceKey)

    if (hasServiceKey) {
      console.log("🖥️ [Server Action] Instantiating Admin Client to bypass RLS...")
      activeClient = createSupabaseClient(url, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }) as any
    } else {
      console.log("🖥️ [Server Action] No Service Role Key found. Using default User Client...")
    }

    console.log("🖥️ [Server Action] Executing UPDATE query on 'bills' for ID:", id)
    
    const updatePayload: any = {
      late_days: lateDays,
      penalty_amount: penaltyAmount,
      amount: amount
    }
    if (otherServiceAmount !== undefined) {
      updatePayload.other_service_amount = otherServiceAmount
    }

    const { data, error } = await activeClient
      .from("bills")
      .update(updatePayload)
      .eq("id", id)
      .select()

    if (error) {
      console.error("🖥️ [Server Action] Database error during UPDATE:", error)
      throw error
    }

    console.log("🖥️ [Server Action] Database returned rows count:", data ? data.length : 0, "rows:", data)

    // ตรวจสอบว่ามีแถวถูกแก้ไขจริงหรือไม่ เพื่อจับกรณี RLS บล็อก หรือส่ง ID ผิด โดยไม่ส่งผลให้สำเร็จหลอกๆ บนหน้าบ้าน
    if (!data || data.length === 0) {
      const rlsContext = !hasServiceKey 
        ? " (ตรวจไม่พบ SUPABASE_SERVICE_ROLE_KEY ใน Environment Variables ของท่าน ทำให้ระบบต้องใช้สิทธิ์ของท่านตามนโยบาย RLS ดั้งเดิม)" 
        : ""
      const noRowsError = `ไม่สามารถอัปเดตข้อมูลบิลได้: ไม่พบข้อมูลบิลที่มีรหัส '${id}' ในระบบ หรือบัญชีของท่านไม่มีสิทธิ์เข้าถึงเพื่อแก้ไข${rlsContext}`
      console.error("🖥️ [Server Action] Error: 0 rows modified. Threw:", noRowsError)
      throw new Error(noRowsError)
    }

    console.log("🖥️ [Server Action] Penalty updated successfully. Returning first row:", data[0])
    return { success: true, data: data[0] }
  } catch (error: any) {
    console.error("🖥️ [Server Action] Exception caught:", error)
    
    let errorMessage = error?.message || (error instanceof Error ? error.message : typeof error === "object" ? JSON.stringify(error) : String(error))
    
    // ตรวจจับข้อผิดพลาด Schema Cache เพื่อแจ้งคู่มือแก้ปัญหาแบบละเอียดให้ผู้ใช้เห็นทันทีบน Alert Dialog
    if (errorMessage.includes("column") && (errorMessage.includes("schema cache") || errorMessage.includes("late_days") || errorMessage.includes("penalty_amount"))) {
      errorMessage = `⚠️ ตรวจพบว่าระบบยังมองไม่เห็นคอลัมน์ 'late_days' หรือ 'penalty_amount' ในตาราง bills (Schema Cache ใน Supabase ยังไม่อัปเดต)\n\nกรุณาทำตามขั้นตอนต่อไปนี้เพื่อแก้ไข:\n1. ไปที่แดชบอร์ด Supabase ของท่าน\n2. เข้าเมนู SQL Editor ทางด้านซ้าย\n3. สร้าง Query ใหม่แล้วพิมพ์คำสั่งดังนี้:\n   NOTIFY pgrst, 'reload schema';\n4. กดปุ่ม Run เพื่อล้างแคช จากนั้นกลับมาทดสอบบันทึกบิลใหม่อีกครั้ง!`
    }
    
    return { success: false, error: errorMessage }
  }
}

export async function getBillingPageData(cycle: string, prevCycle: string, workspaceId: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const [
      roomsRes,
      billsRes,
      metersRes,
      replacementsRes,
      prevMetersRes,
      financeRes
    ] = await Promise.all([
      getRooms(),
      getBills(cycle),
      getMeterRecords(cycle),
      getMeterReplacements(cycle),
      getMeterRecords(prevCycle),
      workspaceId ? getFinanceSettings(workspaceId) : Promise.resolve({ success: true, data: null })
    ])

    return {
      success: true,
      data: {
        rooms: roomsRes.success && roomsRes.data ? roomsRes.data : [],
        bills: billsRes.success && billsRes.data ? billsRes.data : [],
        meters: metersRes.success && metersRes.data ? metersRes.data : [],
        replacements: replacementsRes.success && replacementsRes.data ? replacementsRes.data : [],
        prevMeters: prevMetersRes.success && prevMetersRes.data ? prevMetersRes.data : [],
        financeSettings: financeRes.success && financeRes.data ? financeRes.data : null
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลตั้งต้น"
    return { success: false, error: errorMessage }
  }
}

