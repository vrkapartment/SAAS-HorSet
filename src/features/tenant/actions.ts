"use server"

import { createClient } from "@/lib/supabase/server"
import crypto from "crypto"
import { calculateLateDays } from "@/features/billing/actions"

const isSupabaseConfigured = 
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co"

export async function getTenants() {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("tenants")
      .select(`
        *,
        rooms (
          room_number
        )
      `)
      .order("created_at", { ascending: false })

    if (error) throw error

    // จัดรูปแบบข้อมูลให้เข้ากับ TenantItem interface ของหน้าบ้าน
    const formatted = data.map((t: any) => ({
      id: t.id,
      roomNumber: t.rooms?.room_number || "ไม่มีห้อง",
      fullName: t.tenant_name,
      phone: t.tenant_phone,
      lineUserId: t.line_user_id,
      contractStart: t.lease_start,
      contractEnd: t.lease_end,
      status: new Date(t.lease_end) >= new Date() ? "active" : "expired"
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลผู้เช่า"
    return { success: false, error: errorMessage }
  }
}

export async function createTenant(
  roomNumber: string,
  fullName: string,
  phone: string,
  lineUserId: string | null,
  contractStart: string,
  contractEnd: string
) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()

    // 1. ค้นหา roomId จาก roomNumber
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("room_number", roomNumber)
      .single()

    if (roomError || !room) {
      throw new Error(`ไม่พบห้องหมายเลข ${roomNumber} ในระบบ กรุณาตรวจสอบหรือสร้างห้องพักก่อนทำสัญญา`)
    }

    // 2. เพิ่มข้อมูลผู้เช่าและสัญญา
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert([{
        room_id: room.id,
        tenant_name: fullName,
        tenant_phone: phone,
        line_user_id: lineUserId || null,
        lease_start: contractStart,
        lease_end: contractEnd
      }])
      .select()

    if (tenantError) throw tenantError

    // 3. อัปเดตห้องพักให้เป็นมีผู้เช่า (occupied)
    const { error: roomUpdateError } = await supabase
      .from("rooms")
      .update({ status: "occupied" })
      .eq("id", room.id)

    if (roomUpdateError) throw roomUpdateError

    return { success: true, data: tenant[0] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการทำสัญญาเช่าใหม่"
    return { success: false, error: errorMessage }
  }
}

export async function deleteTenant(id: string, roomNumber: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()

    // 1. ลบสัญญาผู้เช่า
    const { error: deleteError } = await supabase
      .from("tenants")
      .delete()
      .eq("id", id)

    if (deleteError) throw deleteError

    // 2. ค้นหาห้องและตั้งค่าเป็นว่าง (available)
    const { data: room } = await supabase
      .from("rooms")
      .select("id")
      .eq("room_number", roomNumber)
      .single()

    if (room) {
      await supabase
        .from("rooms")
        .update({ status: "available" })
        .eq("id", room.id)
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบสัญญาผู้เช่า"
    return { success: false, error: errorMessage }
  }
}

export async function updateTenant(
  id: string,
  roomNumber: string,
  fullName: string,
  phone: string,
  lineUserId: string | null,
  contractStart: string,
  contractEnd: string
) {
  try {
    const supabase = await createClient()

    // 1. ดึงข้อมูลสัญญาเดิมมาเช็คว่ามีการย้ายห้องหรือไม่
    const { data: oldTenant, error: oldError } = await supabase
      .from("tenants")
      .select("room_id, rooms(room_number)")
      .eq("id", id)
      .single()

    if (oldError || !oldTenant) {
      throw new Error("ไม่พบข้อมูลผู้เช่าที่ต้องการแก้ไข")
    }

    // 2. ค้นหา roomId ใหม่จาก roomNumber
    const { data: newRoom, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("room_number", roomNumber)
      .single()

    if (roomError || !newRoom) {
      throw new Error(`ไม่พบห้องหมายเลข ${roomNumber} ในระบบ`)
    }

    // 3. อัปเดตข้อมูลผู้เช่า
    const { data: updatedTenant, error: tenantError } = await supabase
      .from("tenants")
      .update({
        room_id: newRoom.id,
        tenant_name: fullName,
        tenant_phone: phone,
        line_user_id: lineUserId || null,
        lease_start: contractStart,
        lease_end: contractEnd,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()

    if (tenantError) throw tenantError

    // 4. หากมีการย้ายห้องพัก ให้สลับสถานะห้องเดิมและห้องใหม่
    const oldRoomNumber = (oldTenant.rooms as any)?.room_number
    if (oldRoomNumber && oldRoomNumber !== roomNumber) {
      // ตั้งห้องเก่าเป็นว่าง (available)
      await supabase
        .from("rooms")
        .update({ status: "available" })
        .eq("id", oldTenant.room_id)

      // ตั้งห้องใหม่เป็นมีผู้เช่า (occupied)
      await supabase
        .from("rooms")
        .update({ status: "occupied" })
        .eq("id", newRoom.id)
    }

    return { success: true, data: updatedTenant[0] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้เช่า"
    return { success: false, error: errorMessage }
  }
}

export async function getTenantPortalData() {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()

    // 1. Get the current logged-in auth user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนใช้งาน" }
    }

    // 2. Get profile details of the user
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return { success: false, error: "ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน" }
    }

    // 3. Find tenant by matching phone number (เรียงลำดับสัญญาเข้าอยู่ล่าสุดก่อนเพื่อความถูกต้องกรณีเคยอยู่หลายสัญญา)
    const { data: tenantsList, error: tenantError } = await supabase
      .from("tenants")
      .select(`
        *,
        rooms (
          id,
          room_number,
          base_rent,
          room_types (
            default_rent
          )
        )
      `)
      .eq("tenant_phone", profile.phone)
      .order("lease_start", { ascending: false })

    if (tenantError) throw tenantError

    const tenant = tenantsList && tenantsList.length > 0 ? tenantsList[0] : null

    let promptPayId = ""
    let promptPayName = ""
    let workspaceName = ""
    let workspaceAddress = ""
    let workspacePhone = ""
    let workspaceTaxId = ""
    let commonFee = 50
    let waterRate = 18
    let electricRate = 7

    let latePenaltyRate = 0
    if (tenant && tenant.workspace_id) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("name, promptpay_id, promptpay_name, tax_address, tax_phone, tax_id, common_fee, water_rate, electric_rate")
        .eq("id", tenant.workspace_id)
        .maybeSingle()
      if (ws) {
        promptPayId = ws.promptpay_id || ""
        promptPayName = ws.promptpay_name || ""
        workspaceName = ws.name || ""
        workspaceAddress = ws.tax_address || ""
        workspacePhone = ws.tax_phone || ""
        workspaceTaxId = ws.tax_id || ""
        if (ws.common_fee !== null && ws.common_fee !== undefined) commonFee = Number(ws.common_fee)
        if (ws.water_rate !== null && ws.water_rate !== undefined) waterRate = Number(ws.water_rate)
        if (ws.electric_rate !== null && ws.electric_rate !== undefined) electricRate = Number(ws.electric_rate)
      }

      // ดึงข้อมูล late_penalty_rate แบบปลอดภัย เผื่อคอลัมน์ยังไม่มีในตาราง
      try {
        const { data: lpData } = await supabase
          .from("workspaces")
          .select("late_penalty_rate")
          .eq("id", tenant.workspace_id)
          .maybeSingle()
        if (lpData && lpData.late_penalty_rate !== null && lpData.late_penalty_rate !== undefined) {
          latePenaltyRate = Number(lpData.late_penalty_rate)
        }
      } catch (err) {
        console.warn("Could not query late_penalty_rate, defaulting to 0:", err)
      }
    }

    if (!tenant) {
      // Profile exists but not assigned as a tenant in any room yet
      return {
        success: true,
        data: {
          profile,
          roomNumber: null,
          tenantName: profile.full_name || profile.email,
          baseRent: 0,
          bills: [],
          promptPayId,
          promptPayName,
          workspaceName,
          workspaceAddress,
          workspacePhone,
          workspaceTaxId,
          commonFee,
          waterRate,
          electricRate,
          latePenaltyRate
        }
      }
    }

    // 4. Get bills for this room number
    const roomNumber = tenant.rooms?.room_number
    let formattedBills: any[] = []

    if (roomNumber) {
      const { data: bills, error: billsError } = await supabase
        .from("bills")
        .select("*")
        .eq("room_number", roomNumber)
        .order("billing_cycle", { ascending: false })

      if (billsError) throw billsError

      if (bills) {
        // ตรวจสอบว่ามีผู้เช่ารายใหม่เข้ามาอยู่ต่อหลังจากคนนี้หรือไม่
        const { data: newer } = await supabase
          .from("tenants")
          .select("id")
          .eq("room_id", tenant.room_id)
          .gt("lease_start", tenant.lease_start)
          .limit(1)
        const isLatestTenant = !newer || newer.length === 0

        const leaseStartCycle = tenant.lease_start ? tenant.lease_start.substring(0, 7) : ""
        const leaseEndCycle = tenant.lease_end ? tenant.lease_end.substring(0, 7) : ""

        let filteredBills = bills
        if (leaseStartCycle) {
          filteredBills = filteredBills.filter((b: any) => b.billing_cycle >= leaseStartCycle)
        }
        if (leaseEndCycle && !isLatestTenant) {
          filteredBills = filteredBills.filter((b: any) => b.billing_cycle <= leaseEndCycle)
        }

        formattedBills = filteredBills.map((b: any) => {
          let lateDays = b.late_days !== null && b.late_days !== undefined ? Number(b.late_days) : null
          let penaltyAmount = b.penalty_amount !== null && b.penalty_amount !== undefined ? Number(b.penalty_amount) : null
          let amount = Number(b.amount)

          if (b.status === "unpaid") {
            const calculatedLateDays = calculateLateDays(b.billing_cycle)
            const calculatedPenalty = calculatedLateDays * latePenaltyRate
            lateDays = calculatedLateDays
            penaltyAmount = calculatedPenalty
            amount = amount + penaltyAmount
          }

          return {
            id: b.id,
            roomNumber: b.room_number,
            tenantName: b.tenant_name,
            amount: amount,
            status: b.status,
            billingCycle: b.billing_cycle,
            slipUrl: b.slip_url,
            electricUnits: Number(b.electric_units),
            waterUnits: Number(b.water_units),
            penaltyAmount: penaltyAmount,
            lateDays: lateDays,
            otherServiceAmount: b.other_service_amount !== null && b.other_service_amount !== undefined ? Number(b.other_service_amount) : 0
          }
        })
      }
    }

    return {
      success: true,
      data: {
        profile,
        roomNumber: roomNumber || null,
        tenantName: tenant.tenant_name || profile.full_name,
        baseRent: tenant.rooms?.room_types ? Number((tenant.rooms as any).room_types.default_rent) : (tenant.rooms?.base_rent ? Number(tenant.rooms.base_rent) : 0),
        bills: formattedBills,
        promptPayId,
        promptPayName,
        workspaceName,
        workspaceAddress,
        workspacePhone,
        workspaceTaxId,
        commonFee,
        waterRate,
        electricRate,
        latePenaltyRate
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล Tenant Portal"
    return { success: false, error: errorMessage }
  }
}

/**
 * ฟังก์ชันช่วยสร้างและตรวจสอบ Token ลิงก์ดูบิลแบบไม่ล็อกอิน (เพื่อป้องกัน IDOR)
 */
function getSignatureSecret() {
  return process.env.PORTAL_SIGNATURE_SECRET || process.env.LINE_CHANNEL_SECRET || "horset-portal-signature-secret-key-fallback"
}

export async function generatePortalToken(workspaceId: string, roomNumber: string): Promise<string> {
  const secret = getSignatureSecret()
  return crypto
    .createHmac("sha256", secret)
    .update(`${workspaceId}:${roomNumber}`)
    .digest("hex")
}

export async function verifyPortalToken(workspaceId: string, roomNumber: string, token: string): Promise<boolean> {
  if (!token) return false
  const expectedToken = await generatePortalToken(workspaceId, roomNumber)
  try {
    return crypto.timingSafeEqual(Buffer.from(token, "utf-8"), Buffer.from(expectedToken, "utf-8"))
  } catch {
    return token === expectedToken
  }
}

export async function generateSecurePortalLinkAction(workspaceId: string, roomNumber: string) {
  try {
    const token = await generatePortalToken(workspaceId, roomNumber)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
    const link = `${appUrl}/portal?workspace_id=${workspaceId}&room_number=${encodeURIComponent(roomNumber)}&token=${token}`
    return { success: true, link }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * ดึงข้อมูลบิลและค่าใช้จ่ายแบบไม่ต้อง Login โดยอาศัยรหัสความปลอดภัยร่วมกัน (workspaceId + roomNumber + token เพื่อความปลอดภัย)
 */
export async function getTenantPortalDataNoLoginAction(workspaceId: string, roomNumber: string, token?: string) {
  try {
    if (!token) {
      return { success: false, error: "กรุณาระบุรหัสความปลอดภัยในการเข้าถึงข้อมูล (Missing signature token)" }
    }

    const isValid = await verifyPortalToken(workspaceId, roomNumber, token)
    if (!isValid) {
      return { success: false, error: "ลิงก์ดูข้อมูลบิลไม่ถูกต้องหรือไม่ได้รับอนุญาต (Invalid signature token)" }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey || serviceKey.includes("placeholder")) {
      return { success: false, error: "ระบบฐานข้อมูลหลังบ้านไม่พร้อมใช้งาน" }
    }

    const { createClient: createSupabaseClient } = await import("@supabase/supabase-js")
    const supabase = createSupabaseClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })

    // 1. ค้นหาข้อมูลห้องพัก
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, base_rent, room_types(default_rent)")
      .eq("workspace_id", workspaceId)
      .eq("room_number", roomNumber)
      .maybeSingle()

    if (roomError || !room) {
      return { success: false, error: "ไม่พบข้อมูลห้องพักนี้ในระบบ" }
    }

    // 2. ค้นหาข้อมูลผู้เช่าของห้องนี้ (ดึงสัญญาล่าสุดของห้องนี้เพื่อป้องกันข้อผิดพลาดกรณีมีประวัติสัญญาเช่าหลายใบ)
    const { data: tenantsList, error: tenantError } = await supabase
      .from("tenants")
      .select("*")
      .eq("room_id", room.id)
      .eq("workspace_id", workspaceId)
      .order("lease_start", { ascending: false })

    if (tenantError) throw tenantError
    const tenant = tenantsList && tenantsList.length > 0 ? tenantsList[0] : null

    // 3. ค้นหารายละเอียดของ Workspace และการตั้งค่าพร้อมเพย์
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name, promptpay_id, promptpay_name, tax_address, tax_phone, tax_id, common_fee, water_rate, electric_rate")
      .eq("id", workspaceId)
      .maybeSingle()

    let promptPayId = ""
    let promptPayName = ""
    let workspaceName = ""
    let workspaceAddress = ""
    let workspacePhone = ""
    let workspaceTaxId = ""
    let commonFee = 50
    let waterRate = 18
    let electricRate = 7
    let latePenaltyRate = 0

    if (ws) {
      promptPayId = ws.promptpay_id || ""
      promptPayName = ws.promptpay_name || ""
      workspaceName = ws.name || ""
      workspaceAddress = ws.tax_address || ""
      workspacePhone = ws.tax_phone || ""
      workspaceTaxId = ws.tax_id || ""
      if (ws.common_fee !== null && ws.common_fee !== undefined) commonFee = Number(ws.common_fee)
      if (ws.water_rate !== null && ws.water_rate !== undefined) waterRate = Number(ws.water_rate)
      if (ws.electric_rate !== null && ws.electric_rate !== undefined) electricRate = Number(ws.electric_rate)
    }

    // ดึงข้อมูล late_penalty_rate แบบปลอดภัย เผื่อคอลัมน์ยังไม่มีในตาราง
    try {
      const { data: lpData } = await supabase
        .from("workspaces")
        .select("late_penalty_rate")
        .eq("id", workspaceId)
        .maybeSingle()
      if (lpData && lpData.late_penalty_rate !== null && lpData.late_penalty_rate !== undefined) {
        latePenaltyRate = Number(lpData.late_penalty_rate)
      }
    } catch (err) {
      console.warn("Could not query late_penalty_rate, defaulting to 0:", err)
    }

    // 4. ดึงข้อมูลบิลทั้งหมดประจำห้องนี้ในตึกนี้
    const { data: bills, error: billsError } = await supabase
      .from("bills")
      .select("*")
      .eq("room_number", roomNumber)
      .eq("workspace_id", workspaceId)
      .order("billing_cycle", { ascending: false })

    if (billsError) throw billsError

    let formattedBills: any[] = []
    if (bills) {
      // ใน NoLogin โหลดข้อมูลสัญญาของผู้เช่าล่าสุดของห้องนี้โดยตรงอยู่แล้ว จึงถือว่าเป็นผู้เช่าคนล่าสุด (isLatestTenant = true)
      const isLatestTenant = true

      const leaseStartCycle = tenant?.lease_start ? tenant.lease_start.substring(0, 7) : ""
      const leaseEndCycle = tenant?.lease_end ? tenant.lease_end.substring(0, 7) : ""

      let filteredBills = bills
      if (leaseStartCycle) {
        filteredBills = filteredBills.filter((b: any) => b.billing_cycle >= leaseStartCycle)
      }
      if (leaseEndCycle && !isLatestTenant) {
        filteredBills = filteredBills.filter((b: any) => b.billing_cycle <= leaseEndCycle)
      }

      formattedBills = filteredBills.map((b: any) => {
        let lateDays = b.late_days !== null && b.late_days !== undefined ? Number(b.late_days) : null
        let penaltyAmount = b.penalty_amount !== null && b.penalty_amount !== undefined ? Number(b.penalty_amount) : null
        let amount = Number(b.amount)

        if (b.status === "unpaid") {
          const calculatedLateDays = calculateLateDays(b.billing_cycle)
          const calculatedPenalty = calculatedLateDays * latePenaltyRate
          lateDays = calculatedLateDays
          penaltyAmount = calculatedPenalty
          amount = amount + penaltyAmount
        }

        return {
          id: b.id,
          roomNumber: b.room_number,
          tenantName: b.tenant_name,
          amount: amount,
          status: b.status,
          billingCycle: b.billing_cycle,
          slipUrl: b.slip_url,
          electricUnits: Number(b.electric_units),
          waterUnits: Number(b.water_units),
          penaltyAmount: penaltyAmount,
          lateDays: lateDays,
          otherServiceAmount: b.other_service_amount !== null && b.other_service_amount !== undefined ? Number(b.other_service_amount) : 0
        }
      })
    }

    const baseRent = room.room_types ? Number((room.room_types as any).default_rent) : Number(room.base_rent)

    return {
      success: true,
      data: {
        roomNumber,
        tenantName: tenant ? tenant.tenant_name : "ผู้เช่า",
        baseRent,
        bills: formattedBills,
        promptPayId,
        promptPayName,
        workspaceName,
        workspaceAddress,
        workspacePhone,
        workspaceTaxId,
        commonFee,
        waterRate,
        electricRate,
        latePenaltyRate
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลบิล"
    return { success: false, error: errorMessage }
  }
}

export async function getCancelledContracts(workspaceId: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true, data: [] }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("cancelled_contracts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })

    if (error) {
      if (error.code === "42P01") {
        console.warn("Table cancelled_contracts does not exist. Please run the SQL patch.")
        return { success: false, error: "table_not_found", data: [] }
      }
      throw error
    }

    const formatted = data.map((item: any) => ({
      id: item.id,
      tenantId: item.tenant_id,
      roomNumber: item.room_number,
      tenantName: item.tenant_name,
      cancellationDate: item.cancellation_date,
      depositAmount: Number(item.deposit_amount || 0),
      refundedAmount: Number(item.refunded_amount || 0),
      actualRefund: Number(item.actual_refund !== null && item.actual_refund !== undefined ? item.actual_refund : (item.refunded_amount || 0)),
      forfeitedAmount: Number(item.forfeited_amount || 0)
    }))

    return { success: true, data: formatted }
  } catch (error: any) {
    const errorMessage = error?.message || "เกิดข้อผิดพลาดในการดึงประวัติการยกเลิกสัญญา"
    return { success: false, error: errorMessage }
  }
}

export async function saveCancelledContract(workspaceId: string, contract: {
  id?: string
  tenantId: string | null
  roomNumber: string
  tenantName: string
  cancellationDate: string
  depositAmount: number
  refundedAmount: number
  actualRefund?: number
  forfeitedAmount: number
}) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("cancelled_contracts")
      .insert([{
        id: contract.id || undefined,
        workspace_id: workspaceId,
        tenant_id: contract.tenantId || null,
        room_number: contract.roomNumber,
        tenant_name: contract.tenantName,
        cancellation_date: contract.cancellationDate,
        deposit_amount: contract.depositAmount,
        refunded_amount: contract.refundedAmount,
        actual_refund: contract.actualRefund !== undefined ? contract.actualRefund : contract.refundedAmount,
        forfeited_amount: contract.forfeitedAmount
      }])
      .select()

    if (error) {
      if (error.code === "42P01") {
        return { success: false, error: "table_not_found" }
      }
      throw error
    }
    return { success: true, data: data[0] }
  } catch (error: any) {
    return { success: false, error: error?.message || "เกิดข้อผิดพลาดในการบันทึกประวัติการยกเลิกสัญญา" }
  }
}

export async function deleteCancelledContract(id: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("cancelled_contracts")
      .delete()
      .eq("id", id)

    if (error) {
      if (error.code === "42P01") {
        return { success: false, error: "table_not_found" }
      }
      throw error
    }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || "เกิดข้อผิดพลาดในการลบประวัติการยกเลิกสัญญา" }
  }
}

export async function migrateLocalStorageCancelledContracts(workspaceId: string, contracts: any[]) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    
    const toInsert = contracts.map(contract => ({
      id: contract.id || undefined,
      workspace_id: workspaceId,
      tenant_id: contract.tenantId || null,
      room_number: contract.roomNumber || "",
      tenant_name: contract.tenantName || "",
      cancellation_date: contract.cancellationDate || "",
      deposit_amount: Number(contract.depositAmount || 0),
      refunded_amount: Number(contract.refundedAmount || 0),
      actual_refund: Number(contract.actualRefund !== undefined ? contract.actualRefund : (contract.refundedAmount || 0)),
      forfeited_amount: Number(contract.forfeitedAmount || 0)
    }))

    if (toInsert.length > 0) {
      const { error } = await supabase
        .from("cancelled_contracts")
        .insert(toInsert)
      
      if (error) {
        if (error.code === "42P01") {
          return { success: false, error: "table_not_found" }
        }
        throw error
      }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || "เกิดข้อผิดพลาดในการย้ายข้อมูลประวัติการยกเลิกสัญญา" }
  }
}



