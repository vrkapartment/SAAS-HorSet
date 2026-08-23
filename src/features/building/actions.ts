"use server"

import { createClient } from "@/lib/supabase/server"

// รหัส Postgres error เมื่อยังไม่มีตาราง (เช่น ยังไม่ได้รัน schema_multi_workspace.sql)
const RELATION_MISSING_CODE = "42P01"

export interface Building {
  id: string
  workspaceId: string
  name: string
  /**
   * รหัสอาคารสั้น ๆ (A, B, …) ใช้ประกอบเลขใบกำกับและกำกับเลขห้องที่ซ้ำกันข้ามอาคาร
   * ดู database_patch_room_id_identity_1_additive.sql ข้อ 1 — backfill ให้ทุกอาคารแล้ว แอดมินแก้ได้ทีหลัง
   */
  code: string | null
  address: string | null
  createdAt: string
  updatedAt: string
}

function mapBuildingRow(row: Record<string, unknown>): Building {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    code: (row.code as string) ?? null,
    address: (row.address as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

/**
 * ดึงรายการอาคารทั้งหมด (filter ตาม workspaceId ถ้าระบุ) เรียงตามชื่อ
 * ใช้สำหรับหน้าเลือกอาคารในการจัดการห้องพัก (Multi-property แบบเบา)
 */
export async function getBuildings(workspaceId?: string) {
  try {
    const supabase = await createClient()
    let query = supabase.from("buildings").select("*")

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }

    const { data, error } = await query.order("name", { ascending: true })

    if (error) {
      if (error.code === RELATION_MISSING_CODE) return { success: true, data: [] as Building[] }
      throw error
    }

    return { success: true, data: (data || []).map(mapBuildingRow) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลอาคาร" }
  }
}

/**
 * สร้างอาคารใหม่ใน workspace ปัจจุบัน (ต้องเช็คสถานะ subscription และโควตาจำนวนอาคารก่อนเสมอ)
 */
export async function createBuilding(name: string, address: string, code?: string) {
  try {
    if (!name?.trim()) {
      return { success: false, error: "กรุณาระบุชื่ออาคาร" }
    }

    const { assertSubscriptionActive, checkWorkspaceQuota, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()

    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัส Workspace (กรุณาลงชื่อเข้าใช้งานใหม่)" }
    }

    await assertSubscriptionActive(workspaceId)
    await checkWorkspaceQuota(workspaceId, "buildings")

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("buildings")
      .insert([{
        workspace_id: workspaceId,
        name: name.trim(),
        address: address?.trim() || null,
        // ไม่กรอกรหัสมาก็ให้ null ไว้ก่อน — เลขใบกำกับจะไม่มีรหัสอาคารกำกับจนกว่าแอดมินจะมาตั้ง
        // (ยังออกบิลได้ปกติ แต่ถ้ามีอาคารอื่นใช้เลขห้องเดียวกันควรตั้งรหัสให้ครบ)
        code: code?.trim() || null
      }])
      .select()
      .single()

    if (error) throw error

    return { success: true, data: mapBuildingRow(data as Record<string, unknown>) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการสร้างอาคาร" }
  }
}

/**
 * แก้ไขชื่อ/ที่อยู่/รหัสอาคาร
 *
 * code = รหัสสั้น ๆ ที่ไปประกอบเลขใบกำกับ (INV-202608-A-101) และกำกับเลขห้องที่ซ้ำกันข้ามอาคาร
 * ส่ง undefined มา = ไม่แก้ค่าเดิม (ผู้เรียกที่ยังไม่รองรับช่องนี้จะไม่ล้างรหัสทิ้งโดยไม่ตั้งใจ)
 */
export async function updateBuilding(id: string, name: string, address: string, code?: string) {
  try {
    if (!name?.trim()) {
      return { success: false, error: "กรุณาระบุชื่ออาคาร" }
    }

    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("buildings")
      .update({
        name: name.trim(),
        address: address?.trim() || null,
        ...(code === undefined ? {} : { code: code.trim() || null }),
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    return { success: true, data: mapBuildingRow(data as Record<string, unknown>) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการแก้ไขอาคาร" }
  }
}

/**
 * ลบอาคาร — ห้ามลบถ้ายังมีห้องพักผูกอยู่กับอาคารนี้ ต้องย้ายห้องออกก่อน
 */
export async function deleteBuilding(id: string) {
  try {
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) {
      await assertSubscriptionActive(workspaceId)
    }

    const supabase = await createClient()

    const { count, error: countError } = await supabase
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("building_id", id)

    if (countError) throw countError

    if ((count || 0) > 0) {
      return {
        success: false,
        error: `ไม่สามารถลบอาคารนี้ได้ เนื่องจากยังมีห้องพักผูกอยู่ ${count} ห้อง กรุณาย้ายห้องพักออกจากอาคารนี้ก่อน`
      }
    }

    const { error } = await supabase.from("buildings").delete().eq("id", id)

    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบอาคาร" }
  }
}