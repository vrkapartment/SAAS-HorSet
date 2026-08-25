"use server"

import { createClient } from "@/lib/supabase/server"
import { computeStandardDeposit, computeMidMonthRent } from "@/features/room/deposit-calculator"
import { getFinanceSettings } from "@/features/finance/actions"
import { calculateBillTotal } from "@/features/billing/bill-calculator"
import { resolveUtilityRate } from "@/features/billing/rate-utils"
import { getBuildingUtilityBillsForWorkspaceCycle, type BuildingUtilityBill } from "@/features/billing/building-utility-actions"
import { saveMeterRecord, getMeterStartForCycle, getLatestMeterReadingUpTo } from "@/features/meter/actions"
import { meterUnitsUsed, isPlausibleRollover } from "@/features/meter/utils"
import { updateRoomStatus } from "@/features/room/actions"
import { nextBillingCycle } from "@/features/billing/utils"

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
  /**
   * true = รวมค่าเช่าห้องเดิม (ต้นเดือนถึงวันย้าย) ไว้ในบิลห้องใหม่ด้วย
   *
   * ค่าเริ่มต้นเป็น false โดยเจตนา: ค่าเช่าห้องเดิมกับค่าเช่าห้องใหม่ทับช่วงเวลากันเสมอเมื่อ
   * บิลห้องใหม่คิดเต็มเดือน — ให้ผู้ดูแลเป็นคนตัดสินใจ ไม่ใช่ระบบเก็บเพิ่มให้เองแบบเงียบ ๆ
   */
  includeOldRoomRent?: boolean
  /**
   * ค่าเช่าห้องเดิมที่จะคิดรวม (บาท) — ไม่ส่งมา = ใช้ยอดตามนโยบายย้ายออกกลางเดือนของหอ
   * ที่ตั้งไว้ใน /settings?tab=property
   */
  oldRoomRentAmount?: number
  /**
   * ผู้ดูแลยืนยันว่ามิเตอร์ "หมุนครบรอบ" (9,999 → 0,000) จึงกรอกเลขที่ต่ำกว่าเลขเดิมได้
   *
   * ต้องเป็นการยืนยันโดยเจตนา ไม่ใช่ระบบเดาให้เอง เพราะ "เลขใหม่ต่ำกว่าเลขเดิม"
   * เป็นได้ทั้งมิเตอร์วนจริง กับคนพิมพ์เลขผิด ซึ่งสองอย่างนี้ต่างกันเป็นพันบาท
   * และไม่มีข้อมูลอะไรในระบบแยกมันออกจากกันได้
   */
  closingElecRolledOver?: boolean
  closingWaterRolledOver?: boolean
  startingElecRolledOver?: boolean
  startingWaterRolledOver?: boolean
}

/**
 * ย้ายผู้เช่าไปห้องใหม่แบบครบวงจร:
 * - ตรวจสอบห้องปลายทางว่าง
 * - ปิดมิเตอร์ห้องเดิม แล้วคิดค่าน้ำ-ไฟ (และค่าเช่าถ้าเลือกให้รวม) ของห้องเดิมให้เสร็จ
 *   เก็บเป็น segment ไว้ยกไปรวมใน "บิลห้องใหม่ใบเดียว" ปลายเดือน
 * - ตั้งมิเตอร์เริ่มต้นห้องใหม่ + ปักหมุดเลขตั้งต้นของห้องเดิมให้ผู้เช่ารายถัดไป
 * - เพิ่มเงินประกัน (ถ้ามี) เข้า deposit_paid
 * - ย้าย room_id (ไม่แตะ line_user_id/tenant_name/tenant_phone/lease_start/lease_end)
 * - สลับสถานะห้อง + บันทึกประวัติ
 *
 * ⚠️ เลิกออกบิลปิดรอบแยกใบ (bill_kind = transfer_closing, เลขใบลงท้าย -TRANSFER) แล้ว
 *    เหตุผล: ผู้เช่าคนเดียวได้บิลสองใบในเดือนเดียว ต้องจ่ายสองรอบ และดูไม่ออกว่าใบไหนห้องไหน
 *    ตอนนี้ค่าน้ำ-ไฟห้องเดิมไปเป็นรายการย่อยในบิลห้องใหม่ แยกให้เห็นชัดว่าส่วนไหนห้องไหน
 *    (ดู src/lib/billSegments.ts) ใบ -TRANSFER ที่ออกไปแล้วยังอยู่ครบและอ่านได้เหมือนเดิม
 *
 *    ผลข้างเคียงที่ตั้งใจ: ผู้เช่าจ่ายทีเดียวปลายเดือน ไม่ต้องจ่ายทันทีที่ย้าย
 *    และไม่มีการแจ้งเตือน LINE ตอนย้ายอีก เพราะไม่มีบิลให้แจ้ง
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

    // 4. เลขมิเตอร์ "ตั้งต้นของรอบนี้" ของห้องเดิม
    //
    // ต้องเป็นเลขต้นรอบ ไม่ใช่เลขที่จดล่าสุด — เดิมใช้ getLatestMeterRecord() ซึ่งคืนแถวของ
    // รอบปัจจุบันเมื่อสตาฟจดมิเตอร์รอบนี้ไปแล้ว แล้วเอา elecCurr ของมัน (เลขกลางเดือน) มาเป็น prev
    // → ผู้เช่าถูกคิดหน่วยแค่ "ช่วงกลางเดือนถึงวันย้าย" แทนที่จะเป็น "ต้นเดือนถึงวันย้าย"
    // เก็บเงินขาดจริงมาแล้ว (ดู scripts/qa-known-unit-mismatches.ts)
    const startRes = await getMeterStartForCycle({ roomId: oldRoom.id }, billingCycle, workspaceId)
    if (!startRes.success || !startRes.data) {
      return { success: false, error: `ไม่สามารถอ่านเลขมิเตอร์ตั้งต้นของห้อง ${oldRoom.room_number} ได้` }
    }
    const prevElec = startRes.data.elecStart
    const prevWater = startRes.data.waterStart

    // เลขปิดที่ต่ำกว่าเลขตั้งต้น ยอมได้เฉพาะเมื่อผู้ดูแลยืนยันว่ามิเตอร์หมุนครบรอบ
    // ถ้าไม่ยืนยันแล้วปล่อยผ่าน หน่วยจะถูกคิดเป็น 0 (เก็บเงินขาดทั้งช่วง) แบบเงียบ ๆ
    const elecRolled = input.closingElecRolledOver === true && isPlausibleRollover(input.closingElecCurr, prevElec)
    const waterRolled = input.closingWaterRolledOver === true && isPlausibleRollover(input.closingWaterCurr, prevWater)

    if (input.closingElecCurr < prevElec && !elecRolled) {
      return {
        success: false,
        error: `เลขมิเตอร์ไฟปิดห้องเดิม (${input.closingElecCurr}) ต่ำกว่าเลขตั้งต้นของรอบนี้ (${prevElec}) `
          + `ถ้ามิเตอร์หมุนครบรอบจริง ให้ติ๊กยืนยัน "มิเตอร์หมุนครบรอบ" ในฟอร์มก่อน`
      }
    }
    if (input.closingWaterCurr < prevWater && !waterRolled) {
      return {
        success: false,
        error: `เลขมิเตอร์น้ำปิดห้องเดิม (${input.closingWaterCurr}) ต่ำกว่าเลขตั้งต้นของรอบนี้ (${prevWater}) `
          + `ถ้ามิเตอร์หมุนครบรอบจริง ให้ติ๊กยืนยัน "มิเตอร์หมุนครบรอบ" ในฟอร์มก่อน`
      }
    }

    // 4.5 กันเก็บเงินซ้ำ
    //
    // ถ้าห้องเดิมมีบิลรอบปกติของรอบนี้ออกไปแล้ว ค่าน้ำ-ไฟช่วงนี้ถูกเรียกเก็บไปแล้วหนึ่งครั้ง
    // การยกไปรวมในบิลห้องใหม่จะเป็นการเก็บครั้งที่สอง — เลือกหยุดแล้วบอกวิธีแก้
    // ดีกว่าเก็บซ้ำเงียบ ๆ ซึ่งไม่มีใครจับได้จนผู้เช่าทักมา
    const { data: existingOldBill, error: existingOldBillError } = await supabase
      .from("bills")
      .select("invoice_id")
      .eq("workspace_id", workspaceId)
      .eq("room_id", oldRoom.id)
      .eq("billing_cycle", billingCycle)
      .eq("bill_kind", "regular")
      .maybeSingle()
    if (existingOldBillError) {
      return { success: false, error: `ตรวจบิลเดิมของห้อง ${oldRoom.room_number} ไม่สำเร็จ: ${existingOldBillError.message}` }
    }
    if (existingOldBill) {
      return {
        success: false,
        error: `ห้อง ${oldRoom.room_number} มีบิลรอบ ${billingCycle} ออกไปแล้ว (${existingOldBill.invoice_id || "ไม่มีเลขใบ"}) `
          + `ถ้าย้ายห้องตอนนี้ ค่าน้ำ-ค่าไฟของห้องเดิมจะถูกเก็บซ้ำ — กรุณาลบบิลใบนั้นก่อนแล้วย้ายอีกครั้ง `
          + `ระบบจะยกค่าน้ำ-ค่าไฟของห้องเดิมไปรวมไว้ในบิลของห้องใหม่ให้เอง`
      }
    }

    // 4.55 เลขมิเตอร์เริ่มต้นของห้องปลายทาง ต้องไม่ต่ำกว่าเลขล่าสุดของห้องนั้น
    //
    // มิเตอร์เดินหน้าอย่างเดียว ถ้าเลขเริ่มต้นต่ำกว่าเลขล่าสุดของห้อง หน่วยที่ผู้เช่าคนก่อน
    // ใช้ไปจะถูกยกมาให้ผู้เช่าคนใหม่จ่าย และไม่มีอะไรในระบบฟ้องเลยจนกว่าผู้เช่าจะทักมา
    //
    // เคยเกิดจริงตอน QA: กรอกเลขเริ่มต้นเป็น 0 ให้ห้องที่มิเตอร์อยู่แถว 9159 ได้โดยไม่มีการทักท้วง
    //
    // ตรวจซ้ำที่นี่ด้วย ไม่พึ่งการตรวจในฟอร์มอย่างเดียว — ฟอร์มกันคนพิมพ์ผิด
    // ด่านนี้กันทุกเส้นทางที่เรียก action นี้
    const toRoomFloorRes = await getLatestMeterReadingUpTo({ roomId: toRoom.id }, billingCycle, workspaceId)
    if (!toRoomFloorRes.success) {
      return { success: false, error: `ไม่สามารถอ่านเลขมิเตอร์ล่าสุดของห้อง ${toRoom.room_number} ได้` }
    }
    const toRoomFloor = toRoomFloorRes.data
    if (toRoomFloor) {
      // ยอมให้ต่ำกว่าพื้นได้เฉพาะเมื่อผู้ดูแลยืนยันว่ามิเตอร์ห้องนั้นหมุนครบรอบ
      const startElecRolled = input.startingElecRolledOver === true
        && isPlausibleRollover(input.startingElecReading, toRoomFloor.elec)
      const startWaterRolled = input.startingWaterRolledOver === true
        && isPlausibleRollover(input.startingWaterReading, toRoomFloor.water)

      const tooLow: string[] = []
      if (input.startingElecReading < toRoomFloor.elec && !startElecRolled) {
        tooLow.push(`ไฟ ${input.startingElecReading} < ${toRoomFloor.elec}`)
      }
      if (input.startingWaterReading < toRoomFloor.water && !startWaterRolled) {
        tooLow.push(`น้ำ ${input.startingWaterReading} < ${toRoomFloor.water}`)
      }
      if (tooLow.length > 0) {
        return {
          success: false,
          error: `เลขมิเตอร์เริ่มต้นของห้อง ${toRoom.room_number} ต่ำกว่าเลขล่าสุดของห้องนั้น (${tooLow.join(" · ")}) `
            + `เลขล่าสุดมาจากรอบ ${toRoomFloor.cycle} — มิเตอร์เดินหน้าอย่างเดียว `
            + `ถ้ากรอกต่ำกว่านี้ ผู้เช่ารายใหม่จะถูกคิดหน่วยที่คนก่อนใช้ไปแล้ว `
            + `ถ้ามิเตอร์หมุนครบรอบจริง ให้ติ๊กยืนยัน "มิเตอร์หมุนครบรอบ" ในฟอร์มก่อน`
        }
      }
    }

    // 4.6 กันบันทึกซ้ำ (กดปุ่มย้ายสองครั้ง / เน็ตหลุดแล้วกดใหม่)
    //
    // แถวใน tenant_room_transfers เป็นตัวกำหนดยอดที่จะไปโผล่ในบิลห้องใหม่ ถ้ามีสองแถว
    // ของการย้ายครั้งเดียวกัน บิลจะขึ้นรายการย่อยสองก้อนเหมือนกัน = เก็บเงินซ้ำ
    // (เดิมไม่มีปัญหานี้เพราะบิล -TRANSFER upsert ทับกันเองด้วย unique key)
    const { data: duplicateTransfer, error: duplicateError } = await supabase
      .from("tenant_room_transfers")
      .select("id, created_at")
      .eq("workspace_id", workspaceId)
      .eq("tenant_id", input.tenantId)
      .eq("from_room_id", oldRoom.id)
      .eq("to_room_id", toRoom.id)
      .eq("billing_cycle", billingCycle)
      .eq("transfer_date", input.transferDate)
      .maybeSingle()
    if (duplicateError && duplicateError.code !== "42P01") {
      return { success: false, error: `ตรวจประวัติการย้ายซ้ำไม่สำเร็จ: ${duplicateError.message}` }
    }
    if (duplicateTransfer) {
      return {
        success: false,
        error: `การย้ายจากห้อง ${oldRoom.room_number} ไปห้อง ${toRoom.room_number} วันที่ ${input.transferDate} `
          + `ถูกบันทึกไว้แล้ว ถ้าต้องการแก้ไข ให้ลบประวัติการย้ายรายการนั้นก่อน `
          + `(บันทึกซ้ำจะทำให้ค่าน้ำ-ค่าไฟห้องเดิมถูกเก็บสองครั้งในบิลใบเดียว)`
      }
    }

    // 5. คิดค่าน้ำ-ไฟของห้องเดิม "ให้เสร็จตรงนี้" แล้วเก็บเป็น segment ไปรวมในบิลห้องใหม่
    //
    // ต้องคิดตอนนี้ ไม่ใช่ตอนออกบิลปลายเดือน เพราะระหว่างนั้นอัตราค่าไฟ/การตั้งค่าขั้นต่ำ
    // เปลี่ยนได้ ผู้เช่าต้องถูกคิดด้วยอัตราของช่วงที่เขาอยู่จริง (ดู src/lib/billSegments.ts)
    let buildingBillsMap = new Map<string, BuildingUtilityBill>()
    if (settings.electric_billing_mode === "building_total" || settings.water_billing_mode === "building_total") {
      const bRes = await getBuildingUtilityBillsForWorkspaceCycle(workspaceId, billingCycle)
      if (bRes.success && bRes.data) {
        buildingBillsMap = new Map(bRes.data.map(row => [`${row.buildingId}:${row.utilityType}`, row]))
      }
    }
    // โหมด building_total ที่ยังไม่ได้กรอกยอดรวมทั้งอาคารของรอบนี้ → ถอยไปใช้อัตราคงที่
    // ไม่บล็อกการย้ายห้อง: การย้ายเป็นเหตุการณ์ที่รอไม่ได้ ต่างจากการออกบิลที่รอกรอกยอดได้
    const elecRateRes = resolveUtilityRate("electric", settings.electric_billing_mode, settings.electric_rate, oldRoom.building_id, buildingBillsMap)
    const waterRateRes = resolveUtilityRate("water", settings.water_billing_mode, settings.water_rate, oldRoom.building_id, buildingBillsMap)
    const oldElecRate = elecRateRes.error ? Number(settings.electric_rate) : elecRateRes.rate
    const oldWaterRate = waterRateRes.error ? Number(settings.water_rate) : waterRateRes.rate

    // ใช้สูตรกลางที่รองรับมิเตอร์หมุนครบรอบ (ดู features/meter/utils.ts)
    // เดิมใช้ Math.max(0, curr - prev) ซึ่งได้ 0 หน่วยเมื่อมิเตอร์วน = เก็บเงินขาดทั้งช่วง
    const elecUnitsUsed = meterUnitsUsed(input.closingElecCurr, prevElec)
    const waterUnitsUsed = meterUnitsUsed(input.closingWaterCurr, prevWater)

    // ⚠️ ไม่คิดขั้นต่ำกับช่วงห้องเดิม (ตัดสินใจโดยเจ้าของระบบ)
    //
    // เหตุผล: ในเดือนที่ย้ายห้อง บิลห้องใหม่คิดขั้นต่ำของตัวเองอยู่แล้ว ถ้าช่วงห้องเดิมคิดด้วย
    // ผู้เช่าคนเดียวจะโดนขั้นต่ำสองครั้งในเดือนเดียว ทั้งที่ขั้นต่ำมีไว้เป็นพื้นของ "ห้อง-เดือน"
    // ไม่ใช่ของ "ช่วงการอยู่" — บิลปิดรอบแบบเดิม (-TRANSFER) คิดขั้นต่ำด้วย ซึ่งเป็นพฤติกรรมที่เลิกแล้ว
    //
    // ยังเรียกผ่าน calculateBillTotal ตัวเดียวกับการออกบิล (ปิดขั้นต่ำด้วย waive*) ไม่คูณเอง
    // เพื่อให้ถ้าสูตรคิดค่าน้ำ-ไฟเปลี่ยนวันหลัง ช่วงห้องเดิมเปลี่ยนตามอัตโนมัติ
    //
    // baseRent/commonFee = 0 เพราะบรรทัดนี้คิดแค่ค่าน้ำ-ไฟ (ค่าเช่าจัดการแยกด้านล่าง
    // และค่าส่วนกลางเก็บครั้งเดียวที่บิลห้องใหม่ ไม่เก็บซ้ำต่อห้อง)
    const { elecCost, waterCost } = calculateBillTotal({
      baseRent: 0,
      electricUnitsUsed: elecUnitsUsed,
      waterUnitsUsed: waterUnitsUsed,
      electricRate: oldElecRate,
      waterRate: oldWaterRate,
      commonFee: 0,
      otherServiceAmount: 0,
      extraExpensesSum: 0,
      waiveWaterMin: true,
      waterMinChecked: false,
      waterMinUnit: 0,
      waiveElectricMin: true,
      electricMinChecked: false,
      electricMinUnit: 0
    })

    // ค่าเช่าห้องเดิม: ผู้ดูแลเลือกว่าจะรวมหรือไม่ (ช่องแยกในฟอร์มย้ายห้อง)
    // ถ้ารวม ค่าเริ่มต้นยึดตามนโยบายย้ายออกกลางเดือนที่หอตั้งไว้ที่ /settings?tab=property
    // แต่แก้ตัวเลขเองได้ — สูตรเดียวกับที่ใช้หักค่าเช่าจากเงินประกันตอนย้ายออก
    const includeOldRoomRent = input.includeOldRoomRent === true
    const defaultOldRoomRent = computeMidMonthRent(
      Number(oldRoom.base_rent || 0),
      input.transferDate,
      settings.checkout_policy || "DAILY_PRORATE"
    )
    const oldRoomRentAmount = !includeOldRoomRent
      ? 0
      : (input.oldRoomRentAmount === undefined || input.oldRoomRentAmount === null
          ? defaultOldRoomRent
          : Math.max(0, Number(input.oldRoomRentAmount)))

    // 6. คำนวณเงินประกันใหม่
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

    // 7. อัปเดต tenant row — เซ็ตแค่ room_id/deposit_paid/updated_at เท่านั้น ไม่แตะฟิลด์อื่นเลย
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
        error: `ย้ายห้องผู้เช่าไม่สำเร็จ: ${updateTenantError.message} (เลขมิเตอร์ถูกบันทึกไว้แล้ว กรุณาตรวจสอบและลองใหม่)`
      }
    }

    // 8. สลับสถานะห้อง
    await updateRoomStatus(oldRoom.id, "available")
    await updateRoomStatus(toRoom.id, "occupied")

    // 9. บันทึกประวัติการย้ายห้อง + ยอดที่คิดไว้ของห้องเดิม
    //
    // ⚠️ แถวนี้ไม่ใช่ "ประวัติ" อย่างเดียวแล้ว — เป็นที่เดียวที่เก็บยอดค่าน้ำ-ไฟของห้องเดิม
    // ที่ยังไม่ได้เรียกเก็บ ถ้าเขียนไม่สำเร็จแล้วปล่อยผ่าน ค่าน้ำ-ไฟก้อนนี้จะหายไปเงียบ ๆ
    // (เดิมเขียนไม่สำเร็จแค่ console.error ได้ เพราะยอดอยู่ในบิล -TRANSFER ไปแล้ว)
    const noteParts = [
      input.note || null,
      `ค่าน้ำ-ไฟห้อง ${oldRoom.room_number} (${elecUnitsUsed} หน่วยไฟ / ${waterUnitsUsed} หน่วยน้ำ) `
        + `จะไปรวมในบิลห้อง ${toRoom.room_number} รอบ ${billingCycle}`
        + (includeOldRoomRent ? ` พร้อมค่าเช่าห้องเดิม ${oldRoomRentAmount.toLocaleString()} บาท` : " (ไม่รวมค่าเช่าห้องเดิม)")
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
        // ไม่มีบิลปิดรอบแยกใบแล้ว — ยอดไปรวมในบิลห้องใหม่ (คงคอลัมน์ไว้ให้แถวเก่าอ่านได้)
        closing_bill_id: null,
        starting_elec_reading: input.startingElecReading,
        starting_water_reading: input.startingWaterReading,
        // ยอดที่คิดเสร็จแล้วของห้องเดิม — บิลห้องใหม่จะยกไปเป็นรายการย่อยโดยไม่คิดใหม่
        closing_elec_units: elecUnitsUsed,
        closing_elec_rate: oldElecRate,
        closing_elec_amount: elecCost,
        // ช่วงห้องเดิมไม่คิดขั้นต่ำ (ดูเหตุผลที่ขั้นที่ 5) — บันทึก false ไว้ให้ segment
        // อธิบายตัวเองได้ว่ายอดนี้ไม่ได้ผ่านการคิดขั้นต่ำ ไม่ใช่ปล่อยว่างแล้วเดาทีหลัง
        closing_elec_min_applied: false,
        closing_water_units: waterUnitsUsed,
        closing_water_rate: oldWaterRate,
        closing_water_amount: waterCost,
        closing_water_min_applied: false,
        include_old_room_rent: includeOldRoomRent,
        old_room_rent_amount: oldRoomRentAmount,
        // ไม่มีบิลให้แจ้งเตือนตอนย้ายแล้ว ผู้เช่าจะได้บิลรวมใบเดียวปลายเดือน
        line_notification_sent: false,
        note: noteParts.length > 0 ? noteParts.join(" | ") : null,
        created_by: user.id
      }])

    if (historyError) {
      const hint = historyError.code === "42P01"
        ? "ยังไม่ได้รัน database_patch_add_tenant_room_transfers.sql"
        : "ถ้าเป็นเรื่องคอลัมน์ไม่พบ ให้รัน database_patch_move_segments.sql"
      console.error("Failed to write tenant_room_transfers history row:", historyError)
      return {
        success: false,
        error: `ย้ายห้องสำเร็จแล้ว แต่บันทึกยอดค่าน้ำ-ไฟของห้อง ${oldRoom.room_number} ไม่สำเร็จ: ${historyError.message} `
          + `(${hint}) — ยอดก้อนนี้จะไม่ถูกนำไปรวมในบิลห้อง ${toRoom.room_number} `
          + `กรุณาแก้แล้วบันทึกค่าน้ำ-ไฟส่วนนี้เข้าบิลเอง`
      }
    }

    // 10. เขียนเลขมิเตอร์ — ทำเป็นขั้นสุดท้ายโดยเจตนา
    //
    // ⚠️ ลำดับนี้สำคัญกับเงิน: การตั้งเลขมิเตอร์ห้องเดิมให้ "เริ่มนับใหม่ที่เลขปิดห้อง"
    // ทำให้ getMeterStartForCycle() ครั้งต่อไปคืนเลขปิดเป็นเลขตั้งต้น
    // ถ้าทำขั้นนี้ก่อนแล้วขั้นอื่นล้ม พอผู้ดูแลกดย้ายใหม่ ระบบจะคิดได้ 0 หน่วยแบบเงียบ ๆ
    // (เก็บเงินขาดโดยไม่มีอะไรฟ้อง) — วางไว้ท้ายสุดจึงไม่มีทางเกิดเส้นทางนั้น
    //
    // ล้มที่ขั้นนี้แทน = ย้ายห้องสำเร็จแล้วและยอดถูกบันทึกไว้ครบ เหลือแค่เลขมิเตอร์ที่ต้องแก้
    // ซึ่งบอกผู้ดูแลตรง ๆ ได้ว่าต้องใส่เลขอะไร
    //
    // ห้องเดิม: ตั้งแถวของรอบนี้ให้ "เริ่มนับใหม่ที่เลขปิดห้อง" และเว้น curr ไว้
    //   → ผู้เช่ารายถัดไปที่ย้ายเข้าห้องนี้ในเดือนเดียวกัน ถูกคิดหน่วยตั้งแต่เลขปิด
    //     ไม่ใช่เลขตั้งต้นของผู้เช่าคนเดิม (ซึ่งเป็นบั๊กเดิมที่ทำให้เก็บเงินซ้ำหน่วยของคนก่อน)
    //   เลขที่ผู้เช่าเดิมใช้จริงไม่หาย — อยู่ทั้งใน tenant_room_transfers และใน segment ของบิล
    //   ต้องส่ง occupancyStart ไปด้วย ไม่งั้นหน้าออกบิลจะทับ prev กลับเป็น curr ของรอบก่อน
    //   (ดู database_patch_move_segments.sql ข้อ 4)
    const oldRoomRebaseRes = await saveMeterRecord(
      { roomId: oldRoom.id }, billingCycle,
      input.closingElecCurr, "", input.closingWaterCurr, "",
      { elec: input.closingElecCurr, water: input.closingWaterCurr, reason: "transfer_out", date: input.transferDate }
    )
    if (!oldRoomRebaseRes.success) {
      return {
        success: false,
        error: `ย้ายห้องสำเร็จแล้ว (ยอดค่าน้ำ-ไฟห้องเดิมถูกบันทึกไว้ครบ) แต่ตั้งเลขมิเตอร์ตั้งต้นใหม่ของ`
          + ` ห้อง ${oldRoom.room_number} ไม่สำเร็จ: ${oldRoomRebaseRes.error || "unknown error"} — `
          + `ถ้ามีผู้เช่าใหม่เข้าห้อง ${oldRoom.room_number} ในเดือนนี้ ให้ตั้งเลขมิเตอร์ตั้งต้นเป็น`
          + ` ไฟ ${input.closingElecCurr} / น้ำ ${input.closingWaterCurr} ก่อนออกบิล`
      }
    }

    // ห้องเดิม (รอบถัดไป): ส่งเลขปิดไปเป็นเลขตั้งต้นของเดือนหน้า
    // เส้นทางย้ายออกทำข้อนี้อยู่แล้ว แต่เส้นทางย้ายห้องไม่เคยทำ — ห้องที่ถูกย้ายออกจึงไม่มี
    // เลขตั้งต้นของเดือนถัดไป แล้วผู้เช่ารายใหม่เริ่มนับจาก 0 (เก็บเงินขาดทั้งเดือน)
    await saveMeterRecord(
      { roomId: oldRoom.id }, nextBillingCycle(billingCycle),
      input.closingElecCurr, "", input.closingWaterCurr, ""
    )

    // ห้องปลายทาง: ตั้งเลขเริ่มต้น (ยังไม่จดรอบนี้ — elecCurr/waterCurr ปล่อยว่างตาม convention เดิม)
    //
    // ต้องปักหมุด occupancyStart ที่ห้องปลายทางด้วย ไม่ใช่แค่ห้องเดิม:
    // ถ้าห้องปลายทางเคยมีผู้เช่าและมีเลขมิเตอร์ของ "รอบก่อนหน้า" อยู่ หน้าออกบิลจะเอา curr
    // ของรอบก่อนมาเป็น prev แล้วทับเลขเริ่มต้นที่กรอกไว้ตอนย้ายทิ้ง — ผู้เช่าที่ย้ายเข้ามา
    // จะถูกคิดหน่วยตั้งแต่เลขของผู้เช่าคนก่อนในห้องนั้น
    const toRoomStartRes = await saveMeterRecord(
      { roomId: toRoom.id }, billingCycle,
      input.startingElecReading, "", input.startingWaterReading, "",
      { elec: input.startingElecReading, water: input.startingWaterReading, reason: "transfer_in", date: input.transferDate }
    )
    if (!toRoomStartRes.success) {
      return {
        success: false,
        error: `ย้ายห้องสำเร็จแล้ว แต่ตั้งเลขมิเตอร์เริ่มต้นของห้อง ${toRoom.room_number} ไม่สำเร็จ: `
          + `${toRoomStartRes.error || "unknown error"} — ให้ตั้งเลขตั้งต้นเป็น ไฟ ${input.startingElecReading} / `
          + `น้ำ ${input.startingWaterReading} ก่อนออกบิลรอบนี้`
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
        /** ค่าน้ำ-ไฟ (+ค่าเช่าถ้าเลือกรวม) ของห้องเดิมที่จะไปโผล่ในบิลห้องใหม่ */
        oldRoomCharges: {
          elecUnits: elecUnitsUsed,
          elecAmount: elecCost,
          waterUnits: waterUnitsUsed,
          waterAmount: waterCost,
          rentIncluded: includeOldRoomRent,
          rentAmount: oldRoomRentAmount,
          total: elecCost + waterCost + oldRoomRentAmount,
          willAppearOnCycle: billingCycle
        }
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
