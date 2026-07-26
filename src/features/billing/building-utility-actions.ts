"use server"

import { createClient } from "@/lib/supabase/server"

export type UtilityType = "electric" | "water"

export interface BuildingUtilityBill {
  id: string
  buildingId: string
  billingCycle: string
  utilityType: UtilityType
  totalAmount: number
  totalUnits: number
  ratePerUnit: number
}

function mapRow(row: Record<string, unknown>): BuildingUtilityBill {
  return {
    id: row.id as string,
    buildingId: row.building_id as string,
    billingCycle: row.billing_cycle as string,
    utilityType: row.utility_type as UtilityType,
    totalAmount: Number(row.total_amount),
    totalUnits: Number(row.total_units),
    ratePerUnit: Number(row.rate_per_unit)
  }
}

/**
 * ดึงยอดบิลรวมทั้งอาคารของ utility เดียว รอบบิลเดียว (ใช้ตอน resolve อัตราสำหรับออกบิลจริง)
 */
export async function getBuildingUtilityBill(buildingId: string, billingCycle: string, utilityType: UtilityType) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("building_utility_bills")
      .select("*")
      .eq("building_id", buildingId)
      .eq("billing_cycle", billingCycle)
      .eq("utility_type", utilityType)
      .maybeSingle()

    if (error) {
      if (error.code === "42P01") return { success: false, error: "table_not_found", data: null }
      throw error
    }

    return { success: true, data: data ? mapRow(data) : null }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงยอดบิลรวมทั้งอาคาร"
    return { success: false, error: errorMessage, data: null }
  }
}

/**
 * ดึงยอดบิลรวมทั้งอาคารของทุกอาคาร/ทุก utility ในรอบบิลเดียวกันของ workspace นี้
 * (ให้หน้าออกบิลเช็คได้ในครั้งเดียวว่าอาคารไหนยังกรอกไม่ครบ ก่อนอนุญาตให้ส่งบิล)
 */
export async function getBuildingUtilityBillsForWorkspaceCycle(workspaceId: string, billingCycle: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("building_utility_bills")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("billing_cycle", billingCycle)

    if (error) {
      if (error.code === "42P01") return { success: false, error: "table_not_found", data: [] as BuildingUtilityBill[] }
      throw error
    }

    return { success: true, data: (data || []).map(mapRow) }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงยอดบิลรวมทั้งอาคาร"
    return { success: false, error: errorMessage, data: [] as BuildingUtilityBill[] }
  }
}

/**
 * บันทึกยอดบิลไฟฟ้า/น้ำประปาจริงทั้งอาคาร + จำนวนหน่วยรวม ต่อรอบบิล — เจ้าของหอ/staff กรอกเอง
 * ระบบคำนวณ rate_per_unit = total_amount / total_units แล้วเก็บไว้ใช้ resolve ตอนออกบิลจริง
 */
export async function saveBuildingUtilityBill(
  buildingId: string,
  billingCycle: string,
  utilityType: UtilityType,
  totalAmount: number,
  totalUnits: number
) {
  try {
    if (!buildingId) {
      return { success: false, error: "กรุณาเลือกอาคาร" }
    }
    if (!totalUnits || totalUnits <= 0) {
      return { success: false, error: "จำนวนหน่วยรวมทั้งอาคารต้องมากกว่า 0" }
    }
    if (totalAmount < 0) {
      return { success: false, error: "ยอดบิลรวมทั้งอาคารต้องไม่ติดลบ" }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, workspace_id")
      .eq("id", user.id)
      .single()

    if (!profile || (profile.role !== "admin" && profile.role !== "staff" && profile.role !== "super_admin")) {
      return { success: false, error: "คุณไม่มีสิทธิ์บันทึกยอดบิลรวมทั้งอาคาร" }
    }

    const { data: building, error: buildingError } = await supabase
      .from("buildings")
      .select("workspace_id")
      .eq("id", buildingId)
      .single()

    if (buildingError || !building) {
      return { success: false, error: "ไม่พบข้อมูลอาคารนี้ในระบบ" }
    }

    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    await assertSubscriptionActive(building.workspace_id)

    const ratePerUnit = totalAmount / totalUnits

    const { data, error } = await supabase
      .from("building_utility_bills")
      .upsert(
        [{
          workspace_id: building.workspace_id,
          building_id: buildingId,
          billing_cycle: billingCycle,
          utility_type: utilityType,
          total_amount: totalAmount,
          total_units: totalUnits,
          rate_per_unit: ratePerUnit,
          created_by: user.id,
          updated_at: new Date().toISOString()
        }],
        { onConflict: "building_id,billing_cycle,utility_type" }
      )
      .select()
      .single()

    if (error) {
      if (error.code === "42P01") return { success: false, error: "table_not_found" }
      throw error
    }

    return { success: true, data: mapRow(data) }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกยอดบิลรวมทั้งอาคาร"
    return { success: false, error: errorMessage }
  }
}
