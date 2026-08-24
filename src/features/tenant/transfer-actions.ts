"use server"

import { createClient } from "@/lib/supabase/server"
import { computeStandardDeposit } from "@/features/room/deposit-calculator"
import { getFinanceSettings } from "@/features/finance/actions"
import { calculateBillTotal } from "@/features/billing/bill-calculator"
import { saveMeterRecord, getLatestMeterRecord } from "@/features/meter/actions"
import { sendLineBillNotificationAction } from "@/features/notification/actions"
import { updateRoomStatus } from "@/features/room/actions"
import { buildInvoiceId } from "@/features/billing/utils"

interface TenantCurrentRoom {
  id: string
  room_number: string
  building_id: string | null
  base_rent: number | null
  waive_electric_min: boolean | null
  waive_water_min: boolean | null
  room_type_id: string | null
  room_types: { deposit_amount: number | null } | null
  /** ใช้ประกอบเลขใบกำกับให้ไม่ซ้ำเมื่อคนละอาคารใช้เลขห้องเดียวกัน (ดู buildInvoiceId) */
  buildings: { code: string | null } | null
}

interface TenantRoomTransferHistoryRow {
  id: string
  tenant_id: string | null
  tenant_name: string
  from_room_number: string
  to_room_number: string
  billing_cycle: string
  transfer_date: string
  deposit_paid_before: number | null
  deposit_topup_amount: number | null
  deposit_paid_after: number | null
  line_notification_sent: boolean | null
  note: string | null
  created_at: string
}

export interface TransferTenantRoomInput {
  tenantId: string
  toRoomId: string
  transferDate: string // YYYY-MM-DD
  depositTopupAmount?: number
  closingElecCurr: number
  closingWaterCurr: number
  startingElecReading: number
  startingWaterReading: number
  note?: string
}

/**
 * ย้ายผู้เช่าไปห้องใหม่แบบครบวงจร:
 * - ตรวจสอบห้องปลายทางว่าง
 * - ปิดมิเตอร์/ออกบิล prorate ตามวันของห้องเดิม แล้วส่งแจ้งเตือน LINE ทันที (ก่อน room_id เปลี่ยน
 *   เพราะทุกจุดส่งบิลอื่นในระบบ resolve ผู้รับแบบ live จาก tenants.room_id ปัจจุบันเท่านั้น —
 *   ถ้าปล่อยให้ส่งทีหลังหลัง room_id เปลี่ยนแล้ว จะหาผู้รับไม่เจอหรือส่งผิดคน)
 * - ตั้งมิเตอร์เริ่มต้นห้องใหม่
 * - เพิ่มเงินประกัน (ถ้ามี) เข้า deposit_paid
 * - ย้าย room_id (ไม่แตะ line_user_id/tenant_name/tenant_phone/lease_start/lease_end)
 * - สลับสถานะห้อง + บันทึกประวัติ
 *
 * จำกัดสิทธิ์เฉพาะ Admin/Super Admin เท่านั้น (ไม่รวม Staff) เพราะเขียนข้อมูลการเงิน (deposit_paid)
 * และสร้างประวัติถาวร
 */
export async function transferTenantRoom(input: TransferTenantRoomInput) {
  try {
    const supabase = await createClient()

    // 1. Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, workspace_id")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return { success: false, error: "ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน" }
    }

    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์ย้ายห้องผู้เช่า (เฉพาะผู้ดูแลระบบเท่านั้น)" }
    }

    // 2. โหลดผู้เช่า + ห้องปัจจุบัน (ยังไม่ filter workspace เพราะ super_admin ไม่มี profile.workspace_id ของตัวเอง)
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select(`
        id, workspace_id, tenant_name, room_id, line_user_id, deposit_paid,
        rooms (
          id, room_number, building_id, base_rent, waive_electric_min, waive_water_min, room_type_id,
          room_types ( deposit_amount ),
          buildings ( code )
        )
      `)
      .eq("id", input.tenantId)
      .single()

    if (tenantError || !tenant) {
      return { success: false, error: "ไม่พบข้อมูลผู้เช่าที่ต้องการย้าย" }
    }

    if (profile.role === "admin" && profile.workspace_id !== tenant.workspace_id) {
      return { success: false, error: "คุณไม่มีสิทธิ์ย้ายห้องผู้เช่ารายนี้" }
    }

    const workspaceId = tenant.workspace_id
    if (!workspaceId) {
      return { success: false, error: "ไม่พบ Workspace ของผู้เช่ารายนี้" }
    }

    const oldRoom = tenant.rooms as unknown as TenantCurrentRoom | null
    if (!oldRoom) {
      return { success: false, error: "ผู้เช่ารายนี้ไม่มีห้องพักปัจจุบัน ไม่สามารถย้ายห้องได้" }
    }

    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    await assertSubscriptionActive(workspaceId)

    // 3. โหลด + ตรวจสอบห้องปลายทางว่าง (แก้ gap เดิมที่ updateTenant() ไม่เคยเช็ค)
    const { data: toRoom, error: toRoomError } = await supabase
      .from("rooms")
      .select("id, room_number, status")
      .eq("id", input.toRoomId)
      .eq("workspace_id", workspaceId)
      .single()

    if (toRoomError || !toRoom) {
      return { success: false, error: "ไม่พบห้องปลายทางในระบบ" }
    }
    if (toRoom.id === oldRoom.id) {
      return { success: false, error: "ห้องปลายทางต้องไม่ใช่ห้องเดิมของผู้เช่า" }
    }
    if (toRoom.status !== "available") {
      return { success: false, error: `ห้อง ${toRoom.room_number} ไม่ว่าง ไม่สามารถย้ายผู้เช่าเข้าไปได้` }
    }

    const billingCycle = input.transferDate.substring(0, 7)

    const financeRes = await getFinanceSettings(workspaceId)
    if (!financeRes.success || !financeRes.data) {
      return { success: false, error: "ไม่สามารถดึงข้อมูลตั้งค่าการเงินได้" }
    }
    const settings = financeRes.data

    // 4. ปิดมิเตอร์ห้องเดิม
    const prevRes = await getLatestMeterRecord({ roomId: oldRoom.id }, workspaceId)
    const prevElec = prevRes.success && prevRes.data ? Number(prevRes.data.elecCurr ?? prevRes.data.elecPrev) : 0
    const prevWater = prevRes.success && prevRes.data ? Number(prevRes.data.waterCurr ?? prevRes.data.waterPrev) : 0

    if (input.closingElecCurr < prevElec || input.closingWaterCurr < prevWater) {
      return { success: false, error: "เลขมิเตอร์ปิดห้องเดิมต้องไม่น้อยกว่าเลขมิเตอร์ครั้งก่อนหน้า" }
    }

    const meterCloseRes = await saveMeterRecord({ roomId: oldRoom.id }, billingCycle, prevElec, input.closingElecCurr, prevWater, input.closingWaterCurr)
    if (!meterCloseRes.success) {
      return { success: false, error: `บันทึกมิเตอร์ปิดห้องเดิมไม่สำเร็จ: ${meterCloseRes.error || "unknown error"}` }
    }

    // 5. สร้างบิลปิดรอบห้องเดิมแบบ prorate ตามวัน (ไม่เรียก createBill() เพราะคิดเต็มเดือนเสมอ)
    const daysStayed = new Date(input.transferDate).getDate()
    const proratedRent = Math.round((Number(oldRoom.base_rent || 0) / 30) * daysStayed * 100) / 100
    const elecUnitsUsed = Math.max(0, input.closingElecCurr - prevElec)
    const waterUnitsUsed = Math.max(0, input.closingWaterCurr - prevWater)

    const { elecCost, waterCost, elecMinApplied, waterMinApplied, total: closingBillTotal } = calculateBillTotal({
      baseRent: proratedRent,
      electricUnitsUsed: elecUnitsUsed,
      waterUnitsUsed: waterUnitsUsed,
      electricRate: settings.electric_rate,
      waterRate: settings.water_rate,
      commonFee: settings.common_fee,
      otherServiceAmount: 0,
      extraExpensesSum: 0,
      waiveWaterMin: !!oldRoom.waive_water_min,
      waterMinChecked: settings.water_min_checked,
      waterMinUnit: settings.water_min_unit,
      waiveElectricMin: !!oldRoom.waive_electric_min,
      electricMinChecked: settings.electric_min_checked,
      electricMinUnit: settings.electric_min_unit
    })

    // บิลปิดรอบเป็นบิล "อีกใบ" ของห้องเดิมในรอบเดียวกันได้ (ถ้ามีผู้เช่าใหม่ย้ายเข้าห้องเดิมในเดือนนั้น
    // ห้องนั้นจะมีทั้งบิลปิดรอบและบิลปกติ) จึงแยกกันด้วย bill_kind ไม่ให้บิลปกติ upsert ทับ
    // ดู database_patch_room_id_identity_1_additive.sql ข้อ 3 (คอลัมน์) และข้อ 5 (unique key)
    const closingInvoiceId = `${buildInvoiceId(billingCycle, oldRoom.room_number, oldRoom.buildings?.code ?? null)}-TRANSFER`
    const { data: closingBill, error: closingBillError } = await supabase
      .from("bills")
      .upsert([{
        workspace_id: workspaceId,
        room_number: oldRoom.room_number,
        room_id: oldRoom.id,
        building_id: oldRoom.building_id ?? null,
        tenant_name: tenant.tenant_name,
        amount: closingBillTotal,
        status: "unpaid",
        billing_cycle: billingCycle,
        electric_units: elecUnitsUsed,
        water_units: waterUnitsUsed,
        other_service_amount: 0,
        bill_kind: "transfer_closing",
        // snapshot ขององค์ประกอบบิล ณ ตอนออก (ดู database_patch_add_bill_snapshot.sql)
        // ค่าเช่าเป็นยอด prorate ตามจำนวนวันที่อยู่จริง ไม่ใช่ค่าเช่าเต็มเดือนของห้อง —
        // ถ้าไม่บันทึกไว้ ใบ PDF จะคำนวณค่าเช่าย้อนจากยอดรวมแล้วได้ตัวเลขที่อธิบายไม่ได้
        base_rent: proratedRent,
        electric_amount: elecCost,
        water_amount: waterCost,
        electric_rate: settings.electric_rate,
        water_rate: settings.water_rate,
        common_fee: settings.common_fee,
        elec_prev: prevElec,
        elec_curr: input.closingElecCurr,
        water_prev: prevWater,
        water_curr: input.closingWaterCurr,
        extra_expenses: [],
        elec_min_applied: elecMinApplied,
        water_min_applied: waterMinApplied,
        electric_min_unit: settings.electric_min_unit,
        water_min_unit: settings.water_min_unit,
        invoice_id: closingInvoiceId
      }], { onConflict: "workspace_id,room_id,billing_cycle,bill_kind" })
      .select()
      .single()

    if (closingBillError) {
      return { success: false, error: `สร้างบิลปิดรอบห้องเดิมไม่สำเร็จ: ${closingBillError.message}` }
    }

    // 6. ส่งแจ้งเตือน LINE บิลปิดรอบทันที — ต้องทำ "ก่อน" ย้าย room_id (ดู comment ด้านบนไฟล์)
    let lineNotificationSent = false
    let lineNotificationError: string | null = null
    if (tenant.line_user_id) {
      const sendRes = await sendLineBillNotificationAction({
        lineUserId: tenant.line_user_id,
        roomNumber: oldRoom.room_number,
        roomId: oldRoom.id,
        tenantName: tenant.tenant_name,
        billingCycle,
        baseRent: proratedRent,
        electricUnits: elecUnitsUsed,
        electricAmount: elecCost,
        waterUnits: waterUnitsUsed,
        waterAmount: waterCost,
        commonFee: settings.common_fee,
        totalAmount: closingBillTotal,
        workspaceName: settings.name || "",
        workspaceId,
        extraExpenses: []
      })
      lineNotificationSent = !!sendRes.success
      if (!sendRes.success) lineNotificationError = sendRes.error || "unknown error"
    } else {
      lineNotificationError = "ผู้เช่าไม่มี LINE User ID เชื่อมต่อไว้"
    }

    // 7. ตั้งมิเตอร์เริ่มต้นห้องใหม่ (ยังไม่จดรอบนี้ — elecCurr/waterCurr ปล่อยว่างตาม convention เดิม)
    await saveMeterRecord({ roomId: toRoom.id }, billingCycle, input.startingElecReading, "", input.startingWaterReading, "")

    // 8. คำนวณเงินประกันใหม่
    const depositTopup = Number(input.depositTopupAmount || 0)
    let depositBefore = tenant.deposit_paid !== null && tenant.deposit_paid !== undefined ? Number(tenant.deposit_paid) : null
    if (depositBefore === null) {
      const roomTypeDeposit = oldRoom.room_types?.deposit_amount
      depositBefore = computeStandardDeposit(
        Number(oldRoom.base_rent || 0),
        settings.deposit_type,
        Number(settings.deposit_amount || 0),
        roomTypeDeposit !== null && roomTypeDeposit !== undefined ? Number(roomTypeDeposit) : null
      )
    }
    const depositAfter = depositBefore + depositTopup

    // 9. อัปเดต tenant row — เซ็ตแค่ room_id/deposit_paid/updated_at เท่านั้น ไม่แตะฟิลด์อื่นเลย
    //    (ตัด line_user_id/tenant_name/tenant_phone/lease_start/lease_end ออกจาก payload ไปเลย
    //    ไม่ใช่ pass-through) เพื่อรับประกันว่า LINE ไม่มีทางหลุดจาก action นี้
    const { error: updateTenantError } = await supabase
      .from("tenants")
      .update({
        room_id: toRoom.id,
        deposit_paid: depositAfter,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.tenantId)

    if (updateTenantError) {
      return {
        success: false,
        error: `ย้ายห้องผู้เช่าไม่สำเร็จ: ${updateTenantError.message} (บิลปิดรอบและมิเตอร์ถูกบันทึกไว้แล้ว กรุณาตรวจสอบและลองใหม่)`
      }
    }

    // 10. สลับสถานะห้อง
    await updateRoomStatus(oldRoom.id, "available")
    await updateRoomStatus(toRoom.id, "occupied")

    // 11. บันทึกประวัติการย้ายห้อง
    const noteParts = [
      input.note || null,
      lineNotificationError ? `แจ้งเตือน LINE บิลปิดรอบ: ไม่สำเร็จ (${lineNotificationError})` : null
    ].filter(Boolean)

    const { error: historyError } = await supabase
      .from("tenant_room_transfers")
      .insert([{
        workspace_id: workspaceId,
        tenant_id: input.tenantId,
        tenant_name: tenant.tenant_name,
        from_room_id: oldRoom.id,
        from_room_number: oldRoom.room_number,
        to_room_id: toRoom.id,
        to_room_number: toRoom.room_number,
        billing_cycle: billingCycle,
        transfer_date: input.transferDate,
        deposit_paid_before: depositBefore,
        deposit_topup_amount: depositTopup,
        deposit_paid_after: depositAfter,
        closing_elec_prev: prevElec,
        closing_elec_curr: input.closingElecCurr,
        closing_water_prev: prevWater,
        closing_water_curr: input.closingWaterCurr,
        closing_bill_id: closingBill?.id || null,
        starting_elec_reading: input.startingElecReading,
        starting_water_reading: input.startingWaterReading,
        line_notification_sent: lineNotificationSent,
        note: noteParts.length > 0 ? noteParts.join(" | ") : null,
        created_by: user.id
      }])

    if (historyError) {
      if (historyError.code === "42P01") {
        console.warn("Table tenant_room_transfers does not exist. Please run database_patch_add_tenant_room_transfers.sql.")
      } else {
        console.error("Failed to write tenant_room_transfers history row:", historyError)
      }
    }

    return {
      success: true,
      data: {
        tenantId: input.tenantId,
        fromRoomNumber: oldRoom.room_number,
        toRoomNumber: toRoom.room_number,
        depositPaidBefore: depositBefore,
        depositPaidAfter: depositAfter,
        lineNotificationSent
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการย้ายห้องผู้เช่า"
    return { success: false, error: errorMessage }
  }
}

/**
 * ดึงประวัติการย้ายห้องของ workspace (หรือกรองเฉพาะผู้เช่ารายเดียว)
 */
export async function getTenantRoomTransferHistory(workspaceId: string, tenantId?: string) {
  try {
    const supabase = await createClient()
    let query = supabase
      .from("tenant_room_transfers")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })

    if (tenantId) {
      query = query.eq("tenant_id", tenantId)
    }

    const { data, error } = await query

    if (error) {
      if (error.code === "42P01") {
        console.warn("Table tenant_room_transfers does not exist. Please run the SQL patch.")
        return { success: false, error: "table_not_found", data: [] }
      }
      throw error
    }

    const formatted = (data as TenantRoomTransferHistoryRow[]).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      fromRoomNumber: row.from_room_number,
      toRoomNumber: row.to_room_number,
      billingCycle: row.billing_cycle,
      transferDate: row.transfer_date,
      depositPaidBefore: Number(row.deposit_paid_before || 0),
      depositTopupAmount: Number(row.deposit_topup_amount || 0),
      depositPaidAfter: Number(row.deposit_paid_after || 0),
      lineNotificationSent: !!row.line_notification_sent,
      note: row.note,
      createdAt: row.created_at
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงประวัติการย้ายห้อง"
    return { success: false, error: errorMessage, data: [] }
  }
}
