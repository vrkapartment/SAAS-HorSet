"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { verifyPortalToken, type PortalRoomRef } from "@/features/tenant/actions"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { calculateLateDays, buildInvoiceId, hasBillSnapshot, readBillSnapshot } from "./utils"
import type { RoomRef } from "@/features/room/utils"
import { getRooms } from "@/features/room/actions"
import { getMeterRecords, getMeterReplacements } from "@/features/meter/actions"
import { getFinanceSettings, type FinanceSettings } from "@/features/finance/actions"

import { calculateBillTotal } from "./bill-calculator"
import { getBuildingUtilityBillsForWorkspaceCycle, type BuildingUtilityBill } from "./building-utility-actions"
import { resolveUtilityRate } from "./rate-utils"
import {
  groupSegmentsByBillRoom,
  parseUtilitySegments,
  sumSegments,
  type BillUtilitySegment
} from "@/lib/billSegments"


/**
 * Resolve ว่าบิลของรอบเดือนนี้ต้องคิด VAT หรือไม่ + อัตราเท่าไร ตามกฎเดียวกับ lib/tax/vat.ts's vatStatus():
 * charging = vatRegistered && (ไม่มี vatRegisteredFrom หรือ billingCycle >= vatRegisteredFrom)
 * คิดเฉพาะฐาน 40(8) (ค่าน้ำ-ไฟ-ส่วนกลาง-บริการอื่น-ค่าใช้จ่ายเพิ่มเติม) — ค่าเช่า 40(5) ยกเว้น VAT เสมอ
 * บวก VAT เพิ่มจากยอดเดิม (ผู้เช่าจ่ายเพิ่มขึ้นจริง) ไม่ถอดจากยอดเดิม
 */
function resolveVatCharging(
  settings: FinanceSettings,
  billingCycle: string
): { applies: boolean; rate: number } {
  const registered = Boolean(settings.vat_registered)
  if (!registered) return { applies: false, rate: 0 }
  const registeredFrom = settings.vat_registered_from ? settings.vat_registered_from.slice(0, 7) : null
  const applies = !registeredFrom || billingCycle >= registeredFrom
  return { applies, rate: applies ? Number(settings.vat_rate ?? 0.07) : 0 }
}

const isSupabaseConfigured =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co"

/**
 * ดึง "ส่วนของห้องเดิม" ที่ต้องยกมารวมในบิลของห้องปลายทาง ในรอบบิลนี้
 *
 * คีย์ของผลลัพธ์คือ rooms.id ของห้องที่บิลจะออก
 *
 * ⚠️ ต้องไล่โซ่การย้าย ไม่ใช่ผูก segment ไว้กับ to_room_id ตรง ๆ
 *
 * ผู้เช่าย้าย A→B→C ในเดือนเดียวกันได้ ถ้าผูกตรง ๆ ส่วนของ A จะไปอยู่กับบิลห้อง B
 * ซึ่งปลายเดือน "ไม่มีผู้เช่าแล้วจึงไม่มีบิล" → ค่าน้ำ-ไฟของห้อง A หายไปทั้งก้อนแบบเงียบ ๆ
 * ทุก segment ของผู้เช่าคนเดียวกันในรอบเดียวกัน ต้องไปรวมที่ "ห้องสุดท้ายที่เขาอยู่" ห้องเดียว
 *
 * เรียงตามวันที่ย้ายเพื่อให้รายการย่อยบนใบเรียงตามเวลาที่ผู้เช่าอยู่จริง
 *
 * ⚠️ อ่านอย่างเดียว ไม่เขียนอะไร — ยอดถูกคิดเสร็จไว้ตอนย้ายแล้ว (ดู transferTenantRoom)
 *    การออกบิลซ้ำจึงได้ยอดเท่าเดิมทุกครั้ง
 */
async function fetchTransferSegments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  billingCycle: string,
  toRoomIds: string[]
): Promise<Map<string, BillUtilitySegment[]>> {
  const result = new Map<string, BillUtilitySegment[]>()
  if (toRoomIds.length === 0) return result

  // ดึงการย้ายทั้งรอบ (ไม่กรองด้วย to_room_id) เพราะต้องเห็นทั้งโซ่จึงจะรู้ว่าห้องสุดท้ายคือห้องไหน
  // ถ้ากรองแต่ห้องที่ถาม จะมองไม่เห็นขาแรกของโซ่ที่ปลายทางเป็นห้องกลางทาง
  const { data: transfers, error } = await supabase
    .from("tenant_room_transfers")
    .select(`
      id, tenant_id, from_room_id, from_room_number, to_room_id, transfer_date,
      closing_elec_prev, closing_elec_curr, closing_elec_units, closing_elec_rate,
      closing_elec_amount, closing_elec_min_applied,
      closing_water_prev, closing_water_curr, closing_water_units, closing_water_rate,
      closing_water_amount, closing_water_min_applied,
      include_old_room_rent, old_room_rent_amount
    `)
    .eq("workspace_id", workspaceId)
    .eq("billing_cycle", billingCycle)
    .order("transfer_date", { ascending: true })

  // ตารางหรือคอลัมน์ยังไม่มี (ยังไม่ได้รัน patch) → ไม่มี segment ให้รวม ออกบิลต่อได้ปกติ
  // ไม่ throw เพราะจะทำให้ออกบิลทั้งหอไม่ได้เลย ซึ่งกระทบหนักกว่าการไม่มีรายการย่อย
  if (error) {
    console.warn("[fetchTransferSegments] อ่าน tenant_room_transfers ไม่ได้ (ข้ามการรวมส่วนห้องเดิม):", error.message)
    return result
  }
  if (!transfers || transfers.length === 0) return result

  // รหัสอาคารของห้องเดิม — ใช้กำกับบนใบเมื่อเลขห้องซ้ำข้ามอาคาร
  const fromRoomIds = [...new Set(transfers.map(t => t.from_room_id).filter((v): v is string => typeof v === "string"))]
  const codeByRoomId = new Map<string, string | null>()
  if (fromRoomIds.length > 0) {
    const { data: fromRooms } = await supabase
      .from("rooms")
      .select("id, buildings ( code )")
      .in("id", fromRoomIds)
    for (const r of fromRooms ?? []) {
      codeByRoomId.set(r.id as string, (r.buildings as { code?: string | null } | null)?.code ?? null)
    }
  }

  // ตรรกะไล่โซ่อยู่ใน groupSegmentsByBillRoom (โมดูลบริสุทธิ์ ทดสอบได้) — ฟังก์ชันนี้ทำแค่ query
  return groupSegmentsByBillRoom(transfers, codeByRoomId, toRoomIds)
}

export async function getBills(billingCycle?: string, year?: string, workspaceId?: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    let query = supabase.from("bills").select("*")
    // กรอง workspace ตรง ๆ เพื่อให้ query ใช้ index ได้ ไม่ต้องพึ่ง RLS ประเมินทีละแถวทั่วทั้งตาราง —
    // ถ้าไม่กรอง cost จะโตตามขนาดตาราง "รวมทุก workspace" ไม่ใช่ตามข้อมูลของหอที่กำลังเปิดอยู่
    // (ยังคงเป็น optional เพื่อไม่พังผู้เรียกที่ไม่มี workspaceId ในมือ — RLS ยังเป็นด่านความปลอดภัยเสมอ)
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }
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
      // ตัวระบุห้องที่แท้จริง — ฝั่ง client ใช้ตัวนี้จับคู่ ไม่ใช่ roomNumber ที่ซ้ำกันได้ข้ามอาคาร
      roomId: b.room_id ?? null,
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
      invoiceId: b.invoice_id,
      vatAmount: b.vat_amount !== null && b.vat_amount !== undefined ? Number(b.vat_amount) : 0,
      // องค์ประกอบที่บันทึกไว้ ณ ตอนออกบิล — ฝั่งแสดงผลต้องใช้ค่าเหล่านี้ ไม่ใช่ค่า config ปัจจุบัน
      // (null ทั้งชุด = บิลเก่าที่ออกก่อนมี snapshot ให้ถอยไปพฤติกรรมเดิม)
      snapshot: readBillSnapshot(b),
      hasSnapshot: hasBillSnapshot(readBillSnapshot(b))
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลบิล"
    return { success: false, error: errorMessage }
  }
}

// คำนวณรอบบิลย้อนหลังจากรอบที่ระบุ (เช่น "2026-07" ย้อน 3 เดือน -> ["2026-06", "2026-05", "2026-04"])
function getPreviousCycles(cycle: string, count: number): string[] {
  const [yearStr, monthStr] = cycle.split("-")
  let year = parseInt(yearStr, 10)
  let month = parseInt(monthStr, 10)
  const cycles: string[] = []
  for (let i = 0; i < count; i++) {
    month -= 1
    if (month === 0) {
      month = 12
      year -= 1
    }
    cycles.push(`${year}-${String(month).padStart(2, "0")}`)
  }
  return cycles
}

// ดึงค่าเฉลี่ยหน่วยไฟ/น้ำของแต่ละห้องจากบิลย้อนหลัง N เดือน (ไม่รวมรอบปัจจุบัน) ใช้เทียบเพื่อเตือนเลขมิเตอร์ที่ผิดปกติ
export async function getRoomUsageAverages(workspaceId: string, currentCycle: string, monthsBack: number = 3) {
  if (!isSupabaseConfigured || !workspaceId) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    const previousCycles = getPreviousCycles(currentCycle, monthsBack)

    const { data, error } = await supabase
      .from("bills")
      .select("room_id, electric_units, water_units")
      .eq("workspace_id", workspaceId)
      .in("billing_cycle", previousCycles)
    if (error) throw error

    // คีย์ด้วย room_id — ถ้าคีย์ด้วยเลขห้อง ค่าเฉลี่ยของห้อง 101 สองอาคารจะถูกเฉลี่ยรวมกัน
    // แล้วคำเตือน "เลขมิเตอร์ผิดปกติ" จะเทียบกับค่าที่ไม่ใช่ของห้องนั้น
    const totals = new Map<string, { elecSum: number; waterSum: number; count: number }>()
    for (const row of data) {
      const key = row.room_id
      if (!key) continue
      const entry = totals.get(key) || { elecSum: 0, waterSum: 0, count: 0 }
      entry.elecSum += Number(row.electric_units) || 0
      entry.waterSum += Number(row.water_units) || 0
      entry.count += 1
      totals.set(key, entry)
    }

    const averages: Record<string, { avgElec: number; avgWater: number; sampleCount: number }> = {}
    for (const [roomId, entry] of totals) {
      averages[roomId] = {
        avgElec: entry.elecSum / entry.count,
        avgWater: entry.waterSum / entry.count,
        sampleCount: entry.count
      }
    }

    return { success: true, data: averages }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงค่าเฉลี่ยการใช้มิเตอร์"
    return { success: false, error: errorMessage }
  }
}

export async function createBill(
  room: RoomRef,
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
    
    // 1. Get workspace_id from current profile
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || !profileRes.data) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" }
    }
    const workspaceId = profileRes.data.workspace_id

    // ตรวจสอบสิทธิ์การใช้งาน subscription ของ workspace ก่อนสร้าง/แก้ไขบิล (บล็อกถ้า read_only/cancelled)
    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    if (workspaceId) await assertSubscriptionActive(workspaceId)

    // 2. Fetch workspace finance settings
    const financeRes = await getFinanceSettings(workspaceId)
    if (!financeRes.success || !financeRes.data) {
      return { success: false, error: "ไม่สามารถดึงข้อมูลตั้งค่าการเงินได้" }
    }
    const settings = financeRes.data

    // 3. Fetch room details
    // จับด้วย rooms.id (uuid ที่ unique ทั้งระบบ) ไม่ใช่เลขห้อง — เลขห้องซ้ำกันได้ข้ามอาคาร
    // ดึงรหัสอาคารมาด้วยเพื่อประกอบเลขใบกำกับให้ไม่ซ้ำระหว่างสองอาคารที่ใช้เลขห้องเดียวกัน
    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select(`
        *,
        room_types (
          default_rent
        ),
        buildings (
          code
        )
      `)
      .eq("id", room.roomId)
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (roomError) throw roomError
    if (!roomData) {
      return { success: false, error: "ไม่พบข้อมูลห้องพักนี้ในระบบ" }
    }
    const roomNumber: string = roomData.room_number
    const buildingCode: string | null = (roomData.buildings as { code?: string | null } | null)?.code ?? null

    const baseRent = roomData.room_types ? Number(roomData.room_types.default_rent) : Number(roomData.base_rent || 0)
    const waiveElectricMin = !!roomData.waive_electric_min
    const waiveWaterMin = !!roomData.waive_water_min
    const extraExpenses = roomData.extra_expenses || []
    const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

    // 3.5 Resolve อัตราไฟฟ้า/น้ำตามโหมดที่ workspace ตั้งไว้ (fixed_rate เดิม หรือ building_total ใหม่)
    let buildingBillsMap = new Map<string, BuildingUtilityBill>()
    if (settings.electric_billing_mode === "building_total" || settings.water_billing_mode === "building_total") {
      const bRes = await getBuildingUtilityBillsForWorkspaceCycle(workspaceId, billingCycle)
      if (bRes.success && bRes.data) {
        buildingBillsMap = new Map(bRes.data.map(row => [`${row.buildingId}:${row.utilityType}`, row]))
      }
    }
    const electricResolved = resolveUtilityRate("electric", settings.electric_billing_mode, settings.electric_rate, roomData.building_id, buildingBillsMap)
    if (electricResolved.error) return { success: false, error: electricResolved.error }
    const waterResolved = resolveUtilityRate("water", settings.water_billing_mode, settings.water_rate, roomData.building_id, buildingBillsMap)
    if (waterResolved.error) return { success: false, error: waterResolved.error }

    // 3.6 Resolve ว่าต้องคิด VAT กับบิลนี้หรือไม่ (workspace จด VAT แล้ว + ถึงเดือนที่มีผล)
    const vatResolved = resolveVatCharging(settings, billingCycle)

    // 3.7 ส่วนของห้องเดิมที่ต้องยกมารวม (ผู้เช่าย้ายห้องมาที่ห้องนี้กลางเดือน)
    const segmentsByRoom = await fetchTransferSegments(supabase, workspaceId, billingCycle, [room.roomId])
    const segments = segmentsByRoom.get(room.roomId) ?? []
    const segTotals = sumSegments(segments)

    // 4. Calculate total on Server
    const { elecCost, waterCost, elecMinApplied, waterMinApplied, vatAmount, total: serverCalculatedTotal } = calculateBillTotal({
      baseRent,
      electricUnitsUsed: electricUnits,
      waterUnitsUsed: waterUnits,
      electricRate: electricResolved.rate,
      waterRate: waterResolved.rate,
      commonFee: settings.common_fee,
      otherServiceAmount,
      extraExpensesSum,
      waiveWaterMin,
      waterMinChecked: settings.water_min_checked,
      waterMinUnit: settings.water_min_unit,
      waiveElectricMin,
      electricMinChecked: settings.electric_min_checked,
      electricMinUnit: settings.electric_min_unit,
      vatRate: vatResolved.rate,
      vatApplies: vatResolved.applies,
      transferUtilitySum: segTotals.utility,
      transferRentSum: segTotals.rent
    })

    // Log warning if client is sending different amount
    if (Math.abs(serverCalculatedTotal - amount) > 0.01) {
      console.warn(`⚠️ [createBill] Amount mismatch for room ${roomNumber}. Client: ${amount}, Server computed: ${serverCalculatedTotal}. Using server amount.`);
    }

    const finalBillAmount = serverCalculatedTotal

    // snapshot ขององค์ประกอบบิล ณ ตอนออก — ให้ใบแจ้งหนี้อธิบายที่มาของทุกตัวเลขได้เอง
    // ไม่ต้องให้ฝั่งแสดงผลไปเดาจาก config ปัจจุบัน (ซึ่งเปลี่ยนได้ทุกเมื่อ)
    // ดู database_patch_add_bill_snapshot.sql
    //
    // เลขมิเตอร์อ่านจาก meter_records ของรอบนี้ ไม่รับจากผู้เรียก เพื่อให้ตรงกับหน่วยที่ใช้คิดจริง
    const { data: meterRow } = await supabase
      .from("meter_records")
      .select("elec_prev, elec_curr, water_prev, water_curr")
      .eq("workspace_id", workspaceId)
      .eq("room_id", room.roomId)
      .eq("billing_cycle", billingCycle)
      .maybeSingle()

    const billSnapshot = {
      base_rent: baseRent,
      electric_amount: elecCost,
      water_amount: waterCost,
      electric_rate: electricResolved.rate,
      water_rate: waterResolved.rate,
      common_fee: settings.common_fee,
      elec_prev: meterRow?.elec_prev ?? null,
      elec_curr: meterRow?.elec_curr ?? null,
      water_prev: meterRow?.water_prev ?? null,
      water_curr: meterRow?.water_curr ?? null,
      extra_expenses: extraExpenses,
      // การคิดขั้นต่ำ ณ ตอนออกบิล — ใช้เลือกข้อความป้ายบนใบแจ้งหนี้ ไม่ให้คิดใหม่จาก config ปัจจุบัน
      elec_min_applied: elecMinApplied,
      water_min_applied: waterMinApplied,
      electric_min_unit: settings.electric_min_unit,
      water_min_unit: settings.water_min_unit,
      // รายการย่อยของห้องเดิม — เขียนลงบิลด้วยเพื่อให้ใบแจ้งหนี้อธิบายที่มาของยอดได้เองทั้งใบ
      // โดยไม่ต้องกลับไป join tenant_room_transfers ตอนแสดงผล (ซึ่ง Portal ผู้เช่าทำไม่ได้ตาม RLS)
      utility_segments: segments
    }

    // Check if a bill already exists for this room and cycle
    // จับด้วย room_id — เลขห้องซ้ำกันได้ข้ามอาคาร (ดูหมายเหตุเดียวกันใน saveMeterRecord)
    // ยังกรอง workspace_id ด้วย ไม่พึ่ง RLS อย่างเดียว — super_admin ที่ถือ support grant หลายหอ
    // จะเห็นหลายแถวแล้ว maybeSingle() พังทันที
    // กรอง bill_kind = 'regular' ด้วย — ห้องเดียวกันในรอบเดียวกันมีบิลปิดรอบตอนย้ายห้องอยู่ได้อีกใบ
    // ถ้าไม่กรอง maybeSingle() จะเจอ 2 แถวแล้ว error ทันที (bug ที่มีอยู่ก่อน patch room_id)
    const { data: existing } = await supabase
      .from("bills")
      .select("id, penalty_amount, invoice_id")
      .eq("workspace_id", workspaceId)
      .eq("room_id", room.roomId)
      .eq("billing_cycle", billingCycle)
      .eq("bill_kind", "regular")
      .maybeSingle()

    let result
    if (existing) {
      // ป้องกันยอดเงินรวมโดนทับ หากมีค่าปรับบันทึกไว้อยู่แล้ว
      const existingPenalty = Number(existing.penalty_amount || 0)
      const finalAmount = finalBillAmount + existingPenalty
      
      // บิลที่มีอยู่แล้วคงเลขเดิมเสมอ — ห้ามให้การออกบิลซ้ำเปลี่ยนเลขบนใบที่ผู้เช่าถืออยู่
      const invoiceId = existing.invoice_id || buildInvoiceId(billingCycle, roomNumber, buildingCode)

      result = await supabase
        .from("bills")
        .update({
          tenant_name: tenantName,
          amount: finalAmount,
          status,
          electric_units: electricUnits,
          water_units: waterUnits,
          other_service_amount: otherServiceAmount,
          invoice_id: invoiceId,
          // เขียน room_id ควบคู่กับ room_number (ตัวระบุห้องที่แท้จริง) เพื่อเตรียมเลิกจับคู่ด้วยเลขห้อง
          // ที่ซ้ำกันได้ข้ามตึก — ดู database_patch_add_room_id_to_meters_bills.sql
          room_id: roomData.id,
          building_id: roomData.building_id ?? null,
          vat_amount: vatAmount,
          ...billSnapshot
        })
        .eq("id", existing.id)
        .select()
    } else {
      result = await supabase
        .from("bills")
        .insert([{
          room_number: roomNumber,
          // เขียน room_id ควบคู่กับ room_number (ดูหมายเหตุที่ branch update ด้านบน)
          room_id: roomData.id,
          bill_kind: "regular",
          tenant_name: tenantName,
          amount: finalBillAmount,
          status,
          billing_cycle: billingCycle,
          electric_units: electricUnits,
          water_units: waterUnits,
          other_service_amount: otherServiceAmount,
          late_days: null,
          penalty_amount: null,
          invoice_id: buildInvoiceId(billingCycle, roomNumber, buildingCode),
          building_id: roomData.building_id ?? null,
          vat_amount: vatAmount,
          ...billSnapshot
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



export async function updateBillStatus(
  id: string,
  status: "unpaid" | "pending" | "paid",
  slipUrl?: string | null,
  amount?: number,
  portalAuth?: { workspaceId: string; room: PortalRoomRef; token: string }
) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    // ตรวจสอบสิทธิ์การใช้งาน subscription ของ workspace ก่อนแก้ไขสถานะบิล/อัปโหลดสลิป (บล็อกถ้า read_only/cancelled)
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const subscriptionWorkspaceId = portalAuth?.workspaceId || (await getCurrentWorkspaceId())
    if (subscriptionWorkspaceId) await assertSubscriptionActive(subscriptionWorkspaceId)

    const supabase = await createClient()
    let activeClient = supabase

    // ความปลอดภัยสูงมาก (High Security):
    // - หากผู้เช่ากดส่งสลิปเพื่อขอตรวจสอบ (สถานะเป็น "pending") อนุญาตให้ใช้ Admin Client บายพาส RLS ได้
    // - หากเป็นค่ายอดชำระจริง ("paid" หรือ "unpaid") ที่ต้องการสิทธิ์แอดมิน ให้ใช้สิทธิ์คุกกี้ผู้ใช้ตาม RLS ทั่วไป เพื่อป้องกันการแฮกเปลี่ยนสถานะบิลของตนเอง
    if (status === "pending") {
      // ต้องพิสูจน์ก่อนว่าผู้เรียกเป็นเจ้าของบิลนี้จริง ก่อนอนุญาตให้บายพาส RLS
      // ไม่เช่นนั้นใครก็สามารถส่ง bill id ของ workspace/ห้องอื่นเข้ามาแก้ไขได้ (IDOR)
      let isOwner = false

      // เส้นทางที่ 1: ผู้เช่าที่ login ปกติ - ถ้า session ปัจจุบันมองเห็นบิลนี้ผ่าน RLS ปกติได้
      // (นโยบาย "Read bills for tenants" อนุญาตเฉพาะบิลของห้องตัวเองเท่านั้น) แปลว่าเป็นเจ้าของจริง
      const { data: visibleBill } = await supabase.from("bills").select("id").eq("id", id).maybeSingle()
      if (visibleBill) {
        isOwner = true
      }

      // เส้นทางที่ 2: หน้า Portal แบบไม่ต้อง Login (ไม่มี session ให้ RLS ตรวจ) - ตรวจสอบผ่าน token เซ็นชื่อแทน
      if (!isOwner && portalAuth?.workspaceId && portalAuth?.room && portalAuth?.token) {
        // คีย์ที่ใช้เซ็น token ต้องตรงกับตัวระบุห้องที่อยู่ในลิงก์จริง — ลิงก์ใหม่เซ็นด้วย rooms.id
        // ลิงก์เก่าที่ยังค้างใน LINE เซ็นด้วยเลขห้อง (ดู PortalRoomRef ใน tenant/actions.ts)
        const portalRoom = portalAuth.room
        const roomKey = "roomId" in portalRoom ? portalRoom.roomId : portalRoom.roomNumber
        const tokenValid = await verifyPortalToken(portalAuth.workspaceId, roomKey, portalAuth.token)
        if (tokenValid) {
          const url = process.env.NEXT_PUBLIC_SUPABASE_URL
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
          if (url && serviceKey && !serviceKey.includes("placeholder")) {
            const checkClient = createSupabaseClient(url, serviceKey, {
              auth: { persistSession: false, autoRefreshToken: false }
            })
            let scopedQuery = checkClient
              .from("bills")
              .select("id")
              .eq("id", id)
              .eq("workspace_id", portalAuth.workspaceId)
            scopedQuery = "roomId" in portalRoom
              ? scopedQuery.eq("room_id", portalRoom.roomId)
              : scopedQuery.eq("room_number", portalRoom.roomNumber)
            const { data: scopedBill } = await scopedQuery.maybeSingle()
            if (scopedBill) isOwner = true
          }
        }
      }

      if (!isOwner) {
        return { success: false, error: "คุณไม่มีสิทธิ์แก้ไขบิลนี้" }
      }

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

    // ยอดที่ใช้ส่งไปเทียบกับ SlipOK จริง (คำนวณค่าปรับล่าช้าฝั่ง server สดๆ ในบล็อกด้านล่าง เพื่อไม่พึ่งค่าที่ client
    // ส่งมา ซึ่งอาจจะเก่ากว่าเวลาปัจจุบันไปแล้วบ้าง (เช่น เปิดหน้าค้างไว้ข้ามวัน ทำให้ค่าปรับที่คำนวณไว้ตอนโหลดหน้าน้อยไป)
    // ค่านี้ไม่กระทบยอดที่บันทึกลงตาราง bills เลย (updateData.amount ด้านล่างยังทำงานแบบเดิมทุกอย่าง)
    let serverVerifiedAmount: number | undefined = amount

    if (billData) {
      // ตรวจสอบว่าบิลนี้มีค่าปรับเดิมบันทึกไว้ในฐานข้อมูลแล้วหรือไม่ (รวมถึงกรณีเป็น 0 ที่ผู้ใช้ตั้งใจกรอกหรือตั้งค่าไว้)
      const hasExistingPenalty = billData.penalty_amount !== null && billData.penalty_amount !== undefined

      if (status === "paid") {
        // หากเปลี่ยนเป็นสถานะชำระแล้ว และก่อนหน้านี้ยังไม่ใช่ paid
        if (billData.status !== "paid") {
          if (hasExistingPenalty && billData.status !== "unpaid") {
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
        if (hasExistingPenalty && billData.status !== "unpaid") {
          // หากมีค่าปรับเดิมอยู่แล้ว ให้ใช้ค่าเดิม ไม่คำนวณใหม่ (billData.amount รวมค่าปรับนี้ไว้แล้ว)
          updateData.penalty_amount = Number(billData.penalty_amount)
          updateData.late_days = billData.late_days !== null && billData.late_days !== undefined ? Number(billData.late_days) : 0
          serverVerifiedAmount = Number(billData.amount)
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

          // ยอดที่แท้จริง ณ วินาทีนี้ (ต้นฉบับ + ค่าปรับที่คำนวณสดข้างบน) ไว้ใช้เทียบกับ SlipOK เท่านั้น
          serverVerifiedAmount = Number(billData.amount) + penaltyAmount

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

    // ลองอัปเดตฟิลด์ updated_at ไปด้วยเพื่อบันทึกเวลาอัปโหลดสลิปแบบ Real-time (ต้องรันสคริปต์ SQL Patch ก่อน)
    // โดยใช้ระบบ Fallback หากเกิด error (เช่น ยังไม่มีคอลัมน์ updated_at ในตาราง) ให้ถอยไปอัปเดตปกติเพื่อไม่ให้ระบบสะดุด
    let finalData = null;
    try {
      const updateDataWithTime = { ...updateData, updated_at: new Date().toISOString() };
      const { data: dataWithTime, error: errorWithTime } = await activeClient
        .from("bills")
        .update(updateDataWithTime)
        .eq("id", id)
        .select();

      if (!errorWithTime && dataWithTime && dataWithTime.length > 0) {
        finalData = dataWithTime[0];
      } else {
        const { data: dataFallback, error: errorFallback } = await activeClient
          .from("bills")
          .update(updateData)
          .eq("id", id)
          .select();
        if (errorFallback) throw errorFallback;
        if (dataFallback && dataFallback.length > 0) {
          finalData = dataFallback[0];
        }
      }
    } catch (e) {
      const { data: dataFallback, error: errorFallback } = await activeClient
        .from("bills")
        .update(updateData)
        .eq("id", id)
        .select();
      if (errorFallback) throw errorFallback;
      if (dataFallback && dataFallback.length > 0) {
        finalData = dataFallback[0];
      }
    }

    // ถ้าไม่มีบิลไหนถูกอัปเดตจริง (id ผิด, บิลถูกลบไปแล้ว, หรือไม่มีสิทธิ์แก้ไข) ห้ามคืนค่าสำเร็จหลอกๆ
    if (!finalData) {
      return { success: false, error: "ไม่พบบิลที่ต้องการอัปเดต หรือคุณไม่มีสิทธิ์แก้ไขบิลนี้" }
    }

    if (status === "pending") {
      const workspaceId = finalData.workspace_id || billData?.workspace_id;
      if (workspaceId) {
        // ค่าเริ่มต้น: ยังไม่ได้เชื่อมต่อ SlipOK (หรือปิดใช้งานอยู่) -> ส่งข้อความ "มีสลิปใหม่" แบบเดิม
        let variant: "new" | "success" | "warning" = "new"
        let slipOkReason: string | undefined
        // true เมื่อเจอ error ชั่วคราวจากธนาคาร (1009/1010) แล้วเข้าคิว auto-retry ไว้แทน -> ยังไม่ต้องแจ้งเตือนไลน์รอบนี้
        let deferNotificationForRetry = false

        // ตรวจสอบสลิปกับ SlipOK อัตโนมัติ เฉพาะหอพักที่ตั้งค่า Branch ID/API Key ไว้แล้วเท่านั้น
        // (ข้ามเงียบๆ ถ้ายังไม่ได้ตั้งค่า เพื่อไม่กระทบการอัปโหลดสลิปของหอพักที่ยังไม่ได้เชื่อมต่อ SlipOK)
        if (slipUrl) {
          try {
            const { isSlipOkReadyForAutoVerify, verifySlipWithSlipOk } = await import("@/features/slipok/actions");
            const { SLIPOK_RETRYABLE_ERROR_CODES } = await import("@/features/slipok/constants");
            const slipOkReady = await isSlipOkReadyForAutoVerify(workspaceId);
            if (slipOkReady) {
              // ใช้ serverVerifiedAmount (คำนวณค่าปรับล่าช้าสดฝั่ง server ด้านบน) ไม่ใช่ amount ที่ client ส่งมา
              // เพื่อกันปัญหายอดเพี้ยนถ้า client เปิดหน้าทิ้งไว้ข้ามวันก่อนกดส่งสลิป
              const verifyRes = await verifySlipWithSlipOk(workspaceId, slipUrl, serverVerifiedAmount);
              if (verifyRes.success) {
                variant = "success"
                // SlipOK ตรวจสอบสลิปผ่านแล้ว -> ปิดบิลเป็น "ชำระเงินแล้ว" ให้ทันทีโดยไม่ต้องรอ staff กดยืนยันซ้ำ
                const { data: paidData, error: paidError } = await activeClient
                  .from("bills")
                  .update({ status: "paid", updated_at: new Date().toISOString() })
                  .eq("id", id)
                  .select()
                if (paidError) {
                  console.error("Error auto-marking bill as paid after SlipOK success:", paidError)
                } else if (paidData && paidData.length > 0) {
                  finalData = paidData[0]
                }
              } else if (verifyRes.code && SLIPOK_RETRYABLE_ERROR_CODES.includes(verifyRes.code)) {
                // ข้อมูลธนาคารยังไม่เข้าระบบ SlipOK -> เข้าคิวให้ Cron ตรวจซ้ำทุก 5 นาที (สูงสุด 3 ครั้ง)
                // ก่อนแจ้งเตือนแอดมิน เพื่อลดการแจ้งเตือน false-warning ที่จะหายไปเองถ้ารอสักพัก
                const { error: queueError } = await activeClient
                  .from("slipok_retry_queue")
                  .insert({
                    bill_id: id,
                    workspace_id: workspaceId,
                    slip_url: slipUrl,
                    amount: serverVerifiedAmount ?? null,
                    next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                    last_error_code: verifyRes.code,
                    last_error_message: verifyRes.error
                  })
                if (queueError) {
                  console.error("Error queueing SlipOK retry:", queueError)
                  variant = "warning"
                  slipOkReason = verifyRes.error || "ตรวจสอบสลิปอัตโนมัติไม่ผ่าน กรุณาตรวจสอบด้วยตนเอง"
                } else {
                  deferNotificationForRetry = true
                }
              } else {
                variant = "warning"
                slipOkReason = verifyRes.error || "ตรวจสอบสลิปอัตโนมัติไม่ผ่าน กรุณาตรวจสอบด้วยตนเอง"
              }
            }
          } catch (err) {
            console.error("Error auto-verifying slip with SlipOK:", err);
          }
        }

        if (!deferNotificationForRetry) {
          // Dynamically import to avoid circular dependencies
          const { sendLineSlipNotificationAction } = await import("@/features/notification/actions");
          try {
            const res = await sendLineSlipNotificationAction(id, workspaceId, variant, slipOkReason);
            if (!res.success) {
              console.error("⚠️ LINE Slip Notification Failed:", res.error);
            } else {
              console.log("✅ LINE Slip Notification Sent:", res.data);
            }
          } catch (err) {
            console.error("Error sending LINE slip notification:", err);
          }
        }
      }
    }

    return { success: true, data: finalData }
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
    // ตรวจสอบสิทธิ์การใช้งาน subscription ของ workspace ก่อนลบบิล (บล็อกถ้า read_only/cancelled)
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const subscriptionWorkspaceId = await getCurrentWorkspaceId()
    if (subscriptionWorkspaceId) await assertSubscriptionActive(subscriptionWorkspaceId)

    const supabase = await createClient()

    // 1. ดึงข้อมูลบิลก่อนลบ เพื่อสำรองไว้ที่ bills_deleted ก่อนลบจริง (ห้ามลบข้อมูลการเงินถาวรโดยไม่มีสำรอง)
    const { data: bill, error: fetchError } = await supabase
      .from("bills")
      .select("*")
      .eq("id", id)
      .maybeSingle()

    if (fetchError) {
      console.error("Error fetching bill before deletion:", fetchError)
    }

    if (bill) {
      const { error: archiveError } = await supabase
        .from("bills_deleted")
        .insert([{
          original_bill_id: bill.id,
          workspace_id: bill.workspace_id,
          room_number: bill.room_number,
          tenant_name: bill.tenant_name,
          amount: bill.amount,
          status: bill.status,
          billing_cycle: bill.billing_cycle,
          slip_url: bill.slip_url,
          electric_units: bill.electric_units,
          water_units: bill.water_units,
          penalty_amount: bill.penalty_amount,
          late_days: bill.late_days,
          other_service_amount: bill.other_service_amount,
          invoice_id: bill.invoice_id,
          bill_created_at: bill.created_at,
          bill_updated_at: bill.updated_at
        }])

      if (archiveError) {
        console.error("Failed to archive bill to bills_deleted:", archiveError)
        // หยุดทันทีถ้าสำรองข้อมูลไม่สำเร็จ ห้ามลบบิลจริงทิ้งแบบไม่มีการสำรอง
        return { success: false, error: `ไม่สามารถสำรองข้อมูลบิลได้ก่อนลบ (${archiveError.message}) ระบบยกเลิกการลบเพื่อป้องกันข้อมูลสูญหาย` }
      }
    }

    // 2. ลบบิลจริง
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

    // ตรวจสอบสิทธิ์การใช้งาน subscription ของ workspace ก่อนแก้ไขค่าปรับล่าช้า (บล็อกถ้า read_only/cancelled)
    if (profileRes.data.workspace_id) {
      const { assertSubscriptionActive } = await import("@/features/subscription/actions")
      await assertSubscriptionActive(profileRes.data.workspace_id)
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

    // 3. Fetch current bill data
    const { data: billData, error: billFetchError } = await activeClient
      .from("bills")
      .select("*")
      .eq("id", id)
      .maybeSingle()

    if (billFetchError) {
      console.error("🖥️ [Server Action] Bill fetch error:", billFetchError)
      throw billFetchError
    }
    if (!billData) {
      return { success: false, error: "ไม่พบข้อมูลบิลที่ระบุ" }
    }

    // 4. Fetch finance settings
    const workspaceId = billData.workspace_id || profileRes.data.workspace_id
    const financeRes = await getFinanceSettings(workspaceId)
    if (!financeRes.success || !financeRes.data) {
      return { success: false, error: "ไม่สามารถดึงข้อมูลตั้งค่าการเงินได้" }
    }
    const settings = financeRes.data

    const latePenaltyRate = settings.late_penalty_rate
    const calculatedPenaltyAmount = lateDays * latePenaltyRate

    // 5. Fetch room details
    // จับด้วย room_id ของบิลใบนี้ — เลขห้องซ้ำกันได้ข้ามอาคาร ถ้าเทียบด้วยเลขห้องจะได้ค่าเช่า
    // ของห้องผิดอาคาร แล้วยอดบิลที่คำนวณใหม่ตอนคิดค่าปรับจะเพี้ยน
    // (ถอยไปเทียบเลขห้องเฉพาะบิลเก่าที่ยังไม่มี room_id)
    let roomQuery = activeClient
      .from("rooms")
      .select(`
        *,
        room_types (
          default_rent
        )
      `)
      .eq("workspace_id", workspaceId)
    roomQuery = billData.room_id
      ? roomQuery.eq("id", billData.room_id)
      : roomQuery.eq("room_number", billData.room_number)
    const { data: roomData, error: roomError } = await roomQuery.maybeSingle()

    if (roomError) {
      console.error("🖥️ [Server Action] Room fetch error:", roomError)
      throw roomError
    }
    if (!roomData) {
      return { success: false, error: `ไม่พบข้อมูลห้องพักเลขที่ ${billData.room_number}` }
    }

    const baseRent = roomData.room_types ? Number(roomData.room_types.default_rent) : Number(roomData.base_rent || 0)
    const waiveElectricMin = !!roomData.waive_electric_min
    const waiveWaterMin = !!roomData.waive_water_min
    const extraExpenses = roomData.extra_expenses || []
    const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

    // ส่วนของห้องเดิมที่ยกมารวมไว้ในใบนี้ตอนออกบิล (ย้ายห้องกลางเดือน)
    //
    // ⚠️ ต้องบวกกลับเข้าไปด้วย เพราะฟังก์ชันนี้คำนวณยอดรวมใหม่ทั้งใบ ไม่ได้แก้แค่ช่องค่าปรับ
    // ถ้าไม่บวก การที่แอดมินไปแตะค่าปรับของบิลใบนั้น จะลบค่าน้ำ-ไฟของห้องเดิมออกจากยอด
    // ทั้งก้อนแบบเงียบ ๆ (ผู้เช่าได้ส่วนลดฟรี และรายการย่อยบนใบจะบวกไม่เท่ายอดรวมอีกต่อไป)
    const penaltySegTotals = sumSegments(parseUtilitySegments(billData.utility_segments))

    // 6. Recalculate bill total (excluding penalty) and then add calculated penalty
    const { total: baseBillTotal } = calculateBillTotal({
      baseRent,
      electricUnitsUsed: Number(billData.electric_units || 0),
      waterUnitsUsed: Number(billData.water_units || 0),
      electricRate: settings.electric_rate,
      waterRate: settings.water_rate,
      commonFee: settings.common_fee,
      otherServiceAmount: otherServiceAmount !== undefined ? otherServiceAmount : Number(billData.other_service_amount || 0),
      extraExpensesSum,
      waiveWaterMin,
      waterMinChecked: settings.water_min_checked,
      waterMinUnit: settings.water_min_unit,
      waiveElectricMin,
      electricMinChecked: settings.electric_min_checked,
      electricMinUnit: settings.electric_min_unit,
      transferUtilitySum: penaltySegTotals.utility,
      transferRentSum: penaltySegTotals.rent
    })

    const finalAmount = baseBillTotal + calculatedPenaltyAmount

    // Check mismatch and log
    if (Math.abs(finalAmount - amount) > 0.01) {
      console.warn(`⚠️ [updateBillPenalty] Amount mismatch for bill ${id}. Client: ${amount}, Server computed: ${finalAmount}. Using server amount.`);
    }

    console.log("🖥️ [Server Action] Executing UPDATE query on 'bills' for ID:", id)
    
    const updatePayload: any = {
      late_days: lateDays,
      penalty_amount: calculatedPenaltyAmount,
      amount: finalAmount
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

export async function getBillingPageData(
  cycle: string,
  prevCycle: string,
  workspaceId: string,
  cached?: { rooms?: Awaited<ReturnType<typeof getRooms>>["data"]; financeSettings?: FinanceSettings | null }
) {
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
      financeRes,
      usageAveragesRes
    ] = await Promise.all([
      // ถ้ามีข้อมูลที่ cache ไว้แล้วจากฝั่ง caller (เช่น สลับเดือนแต่ห้องพัก/การตั้งค่าการเงินยังไม่เปลี่ยน) ไม่ต้อง fetch ซ้ำ
      cached?.rooms ? Promise.resolve({ success: true, data: cached.rooms }) : getRooms(workspaceId),
      getBills(cycle, undefined, workspaceId),
      getMeterRecords(cycle, workspaceId),
      getMeterReplacements(cycle, workspaceId),
      getMeterRecords(prevCycle, workspaceId),
      cached?.financeSettings
        ? Promise.resolve({ success: true, data: cached.financeSettings })
        : workspaceId ? getFinanceSettings(workspaceId) : Promise.resolve({ success: true, data: null }),
      workspaceId ? getRoomUsageAverages(workspaceId, cycle, 3) : Promise.resolve({ success: true, data: {} })
    ])

    return {
      success: true,
      data: {
        rooms: roomsRes.success && roomsRes.data ? roomsRes.data : [],
        bills: billsRes.success && billsRes.data ? billsRes.data : [],
        meters: metersRes.success && metersRes.data ? metersRes.data : [],
        replacements: replacementsRes.success && replacementsRes.data ? replacementsRes.data : [],
        prevMeters: prevMetersRes.success && prevMetersRes.data ? prevMetersRes.data : [],
        financeSettings: financeRes.success && financeRes.data ? financeRes.data : null,
        usageAverages: usageAveragesRes.success && usageAveragesRes.data ? usageAveragesRes.data : {}
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลตั้งต้น"
    return { success: false, error: errorMessage }
  }
}

export interface BulkBillItem {
  /** rooms.id — ตัวจับคู่ห้องที่แท้จริง (roomNumber ใช้แค่ในข้อความรายงานห้องที่ถูกข้าม) */
  roomId: string
  roomNumber: string
  tenantName: string | null
  elecPrev: number
  elecCurr: number | ""
  waterPrev: number
  waterCurr: number | ""
  otherServiceAmount: number
  status: "unpaid" | "pending" | "paid"
  hasNotifiedCheckout: boolean
}

export async function saveAllBillsForCycle(billingCycle: string, items: BulkBillItem[]) {
  if (!isSupabaseConfigured) return { success: false, fallback: true }

  try {
    const supabase = await createClient()

    // 1. ดึง context ที่ใช้ร่วมกันทุกห้อง "ครั้งเดียว" (แทนที่จะดึงซ้ำทุกห้องเหมือนเดิม)
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || !profileRes.data) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" }
    }
    const workspaceId = profileRes.data.workspace_id

    // ตรวจสอบสิทธิ์การใช้งาน subscription ของ workspace ก่อนบันทึกบิล/มิเตอร์ทั้งหมด (บล็อกถ้า read_only/cancelled)
    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    if (workspaceId) await assertSubscriptionActive(workspaceId)

    const financeRes = await getFinanceSettings(workspaceId)
    if (!financeRes.success || !financeRes.data) {
      return { success: false, error: "ไม่สามารถดึงข้อมูลตั้งค่าการเงินได้" }
    }
    const settings = financeRes.data

    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select(`*, room_types (default_rent), buildings (code)`)
      .eq("workspace_id", workspaceId)
    if (roomsError) throw roomsError
    // ดัชนีคีย์ด้วย rooms.id — เลขห้องซ้ำกันได้ข้ามอาคาร ถ้าคีย์ด้วยเลขห้อง ห้อง 101 ของตึกที่สอง
    // จะทับตัวแรกในดัชนี แล้วบิลของทั้งสองห้องจะใช้ค่าเช่า/อาคารของห้องเดียวกัน
    const roomsMap = new Map(roomsData.map(r => [r.id as string, r]))

    // 1.7 ดึงบิลที่มีอยู่แล้วของรอบนี้มาก่อน "ครั้งเดียว" — กันไม่ให้การออกบิลซ้ำ (เช่น แก้เลขมิเตอร์แล้วกดออกบิลใหม่)
    // ไปเขียนทับค่าปรับล่าช้า/จำนวนวันที่บันทึกไว้แล้วของห้องที่มีอยู่ก่อน (ตรงกับ logic ป้องกันเดียวกับ createBill)
    const { data: existingBillsData, error: existingBillsError } = await supabase
      .from("bills")
      .select("room_id, penalty_amount, late_days")
      .eq("workspace_id", workspaceId)
      .eq("billing_cycle", billingCycle)
      // เฉพาะบิลรอบปกติ — บิลปิดรอบตอนย้ายห้องเป็นอีกใบ ไม่ใช่ใบที่กำลังจะเขียนทับ
      .eq("bill_kind", "regular")
    if (existingBillsError) throw existingBillsError
    const existingBillsMap = new Map(existingBillsData.map(b => [b.room_id as string, b]))

    // 1.5 ถ้าเปิดโหมด building_total ของ utility ใดก็ตาม ดึงยอดบิลรวมทั้งอาคารของรอบนี้มาครั้งเดียว
    let buildingBillsMap = new Map<string, BuildingUtilityBill>()
    if (settings.electric_billing_mode === "building_total" || settings.water_billing_mode === "building_total") {
      const bRes = await getBuildingUtilityBillsForWorkspaceCycle(workspaceId, billingCycle)
      if (bRes.success && bRes.data) {
        buildingBillsMap = new Map(bRes.data.map(row => [`${row.buildingId}:${row.utilityType}`, row]))
      }
    }

    // 1.6 Resolve ว่าต้องคิด VAT กับรอบบิลนี้หรือไม่ — ค่าเดียวกันทุกห้อง (ขึ้นกับ settings+billingCycle เท่านั้น)
    const vatResolved = resolveVatCharging(settings, billingCycle)

    // 1.8 ส่วนของห้องเดิมที่ต้องยกมารวม — ดึงครั้งเดียวสำหรับทุกห้องในรอบนี้ (ไม่มี await ในลูป)
    const segmentsByRoom = await fetchTransferSegments(
      supabase, workspaceId, billingCycle,
      items.map(i => i.roomId).filter((v): v is string => typeof v === "string" && v !== "")
    )

    // 2. คำนวณทุกห้องใน memory (ไม่มี await ในลูปนี้เลย)
    const meterRows: any[] = []
    const billRows: any[] = []
    const skippedRooms: string[] = []

    for (const item of items) {
      if (item.hasNotifiedCheckout) { skippedRooms.push(item.roomNumber); continue }

      const elecVal = item.elecCurr === "" ? null : Number(item.elecCurr)
      const waterVal = item.waterCurr === "" ? null : Number(item.waterCurr)

      const roomData = roomsMap.get(item.roomId)
      // ห้องที่หาไม่เจอใน workspace นี้ ห้ามเขียนอะไรลงไปเลย — แถวที่ room_id เป็น null
      // จะไม่ถูก unique constraint คุ้มกัน แล้วการกดบันทึกซ้ำจะสร้างแถวซ้ำเพิ่มทุกครั้ง
      if (!roomData) { skippedRooms.push(item.roomNumber); continue }

      meterRows.push({
        workspace_id: workspaceId,
        room_number: roomData.room_number,
        // เขียน room_id ควบคู่ไปด้วย (ตัวระบุห้องที่แท้จริง) เพื่อให้แถวใหม่พร้อมสำหรับการเปลี่ยนไป
        // จับคู่ด้วย room_id แทน room_number ที่ซ้ำกันได้ข้ามตึก — ดู database_patch_add_room_id_to_meters_bills.sql
        room_id: roomData.id,
        billing_cycle: billingCycle,
        elec_prev: item.elecPrev,
        elec_curr: elecVal,
        water_prev: item.waterPrev,
        water_curr: waterVal
      })

      if (!item.tenantName) continue  // ไม่มีผู้เช่า ไม่ต้องออกบิล (ตาม logic เดิม)

      // Resolve อัตราไฟฟ้า/น้ำตามโหมดของ workspace — ถ้า building_total ยังไม่ได้กรอกยอดของอาคารนี้
      // ในรอบบิลนี้ ให้ข้ามห้องนี้ไปก่อน (ห้ามเดา/ใช้อัตราคงที่แทนแบบเงียบๆ) ห้องอื่นที่ไม่ติดเงื่อนไขนี้ยังออกบิลต่อได้ปกติ
      const electricResolved = resolveUtilityRate("electric", settings.electric_billing_mode, settings.electric_rate, roomData.building_id, buildingBillsMap)
      const waterResolved = resolveUtilityRate("water", settings.water_billing_mode, settings.water_rate, roomData.building_id, buildingBillsMap)
      if (electricResolved.error || waterResolved.error) { skippedRooms.push(item.roomNumber); continue }

      const eUnits = elecVal !== null ? Math.max(0, elecVal - item.elecPrev) : 0
      const wUnits = waterVal !== null ? Math.max(0, waterVal - item.waterPrev) : 0
      const baseRent = roomData.room_types ? Number(roomData.room_types.default_rent) : Number(roomData.base_rent || 0)
      const extraExpensesSum = (roomData.extra_expenses || []).reduce((a: number, c: any) => a + Number(c.amount || 0), 0)

      // ส่วนของห้องเดิมที่ยกมารวมในบิลห้องนี้ (ว่างเกือบทุกห้อง — มีเฉพาะห้องที่มีคนย้ายเข้ามากลางเดือน)
      const segments = segmentsByRoom.get(roomData.id as string) ?? []
      const segTotals = sumSegments(segments)

      // ใช้ calculateBillTotal ตัวเดียวกับที่ createBill ใช้อยู่ (ห้ามเขียนสูตรซ้ำ)
      const { elecCost, waterCost, elecMinApplied, waterMinApplied, total, vatAmount } = calculateBillTotal({
        baseRent, electricUnitsUsed: eUnits, waterUnitsUsed: wUnits,
        electricRate: electricResolved.rate, waterRate: waterResolved.rate,
        commonFee: settings.common_fee, otherServiceAmount: item.otherServiceAmount,
        extraExpensesSum,
        waiveWaterMin: !!roomData.waive_water_min, waterMinChecked: settings.water_min_checked, waterMinUnit: settings.water_min_unit,
        waiveElectricMin: !!roomData.waive_electric_min, electricMinChecked: settings.electric_min_checked, electricMinUnit: settings.electric_min_unit,
        vatRate: vatResolved.rate, vatApplies: vatResolved.applies,
        transferUtilitySum: segTotals.utility, transferRentSum: segTotals.rent
      })

      // ป้องกันยอดเงินรวม/ค่าปรับล่าช้าโดนทับ หากห้องนี้มีบิลของรอบนี้อยู่แล้ว (ตรงกับ logic เดียวกับ createBill)
      const existingBill = existingBillsMap.get(roomData.id as string)
      const existingPenalty = Number(existingBill?.penalty_amount || 0)

      billRows.push({
        workspace_id: workspaceId,
        room_number: roomData.room_number,
        // เขียน room_id ควบคู่ไปด้วย (ดูหมายเหตุที่ meterRows ด้านบน)
        room_id: roomData.id,
        bill_kind: "regular",
        // snapshot ขององค์ประกอบบิล ณ ตอนออก (ดู createBill และ database_patch_add_bill_snapshot.sql)
        // เลขมิเตอร์ใช้ค่าเดียวกับที่เพิ่งเขียนลง meter_records ในรอบนี้ จึงตรงกับหน่วยที่คิดเงินแน่นอน
        base_rent: baseRent,
        electric_amount: elecCost,
        water_amount: waterCost,
        electric_rate: electricResolved.rate,
        water_rate: waterResolved.rate,
        common_fee: settings.common_fee,
        elec_prev: item.elecPrev,
        elec_curr: elecVal,
        water_prev: item.waterPrev,
        water_curr: waterVal,
        extra_expenses: roomData.extra_expenses || [],
        elec_min_applied: elecMinApplied,
        water_min_applied: waterMinApplied,
        electric_min_unit: settings.electric_min_unit,
        water_min_unit: settings.water_min_unit,
        // รายการย่อยของห้องเดิม (ดูหมายเหตุเดียวกันใน createBill)
        utility_segments: segments,
        tenant_name: item.tenantName,
        amount: total + existingPenalty,
        status: item.status,
        billing_cycle: billingCycle,
        electric_units: eUnits,
        water_units: wUnits,
        other_service_amount: item.otherServiceAmount,
        invoice_id: buildInvoiceId(billingCycle, roomData.room_number, (roomData.buildings as { code?: string | null } | null)?.code ?? null),
        building_id: roomData.building_id ?? null,
        vat_amount: vatAmount,
        // บิลใหม่ (ไม่เคยมีมาก่อน) ต้องเป็น null เสมอ เพื่อให้หน้าจัดการใบแจ้งหนี้คำนวณวันล่าช้าสดจากวันที่ปัจจุบัน
        // ได้ทุกครั้งที่เปิดหน้า จนกว่าจะมีเหตุการณ์จริง (ผู้เช่าส่งสลิป/admin กดรับเงิน) มาเขียนค่าจริงทับ —
        // บิลที่มีอยู่แล้วต้องคงค่าเดิมไว้เป๊ะ ห้ามให้การออกบิลซ้ำมารีเซ็ตค่าที่บันทึกไปแล้วทิ้ง
        late_days: existingBill ? (existingBill.late_days ?? null) : null,
        penalty_amount: existingBill ? (existingBill.penalty_amount ?? null) : null,
      })
    }

    // 3. บันทึกเป็น bulk upsert 2 ครั้ง (แทน N×2 ครั้ง)
    const { data: savedMeters, error: meterErr } = await supabase
      .from("meter_records")
      .upsert(meterRows, { onConflict: "workspace_id,room_id,billing_cycle" })
      .select()
    if (meterErr) throw meterErr

    const { data: savedBills, error: billErr } = await supabase
      .from("bills")
      // ต้องมี bill_kind ใน conflict target ให้ตรงกับ unique constraint ของ bills
      // (workspace_id, room_id, billing_cycle, bill_kind) — บิลปิดรอบตอนย้ายห้องเป็นอีกใบของห้องเดียวกัน
      .upsert(billRows, { onConflict: "workspace_id,room_id,billing_cycle,bill_kind" })
      .select()
    if (billErr) throw billErr

    return { success: true, data: { meters: savedMeters, bills: savedBills, skippedRooms } }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูลทั้งหมด"
    return { success: false, error: errorMessage }
  }
}

