"use server"

import { createClient } from "@/lib/supabase/server"
import type { RoomRef } from "@/features/room/utils"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import crypto from "crypto"
import { resolveBillPenalty } from "@/features/billing/utils"
import { calculateDepositProration, computeStandardDeposit } from "@/features/room/deposit-calculator"
import { getFinanceSettings } from "@/features/finance/actions"

const isSupabaseConfigured = 
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co"

export async function getTenants(workspaceId?: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const supabase = await createClient()
    let query = supabase
      .from("tenants")
      .select(`
        id,
        tenant_name,
        tenant_phone,
        line_user_id,
        lease_start,
        lease_end,
        deposit_paid,
        rooms (
          id,
          room_number
        )
      `)
    // กรอง workspace ตรง ๆ ให้ query ใช้ idx_tenants_workspace_id ได้ ไม่ต้องพึ่ง RLS ประเมินทีละแถวทั่วทั้งตาราง
    // (optional เพื่อไม่พังผู้เรียกที่ไม่มี workspaceId ในมือ — RLS ยังเป็นด่านความปลอดภัยเสมอ)
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }
    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) throw error

    // จัดรูปแบบข้อมูลให้เข้ากับ TenantItem interface ของหน้าบ้าน
    const formatted = data.map((t: any) => ({
      id: t.id,
      roomId: t.rooms?.id || null,
      roomNumber: t.rooms?.room_number || "ไม่มีห้อง",
      fullName: t.tenant_name,
      phone: t.tenant_phone,
      lineUserId: t.line_user_id,
      contractStart: t.lease_start,
      contractEnd: t.lease_end,
      depositPaid: t.deposit_paid !== null && t.deposit_paid !== undefined ? Number(t.deposit_paid) : null,
      status: new Date(t.lease_end) >= new Date() ? "active" : "expired"
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลผู้เช่า"
    return { success: false, error: errorMessage }
  }
}

export async function createTenant(
  room: RoomRef,
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
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) await assertSubscriptionActive(workspaceId)

    const supabase = await createClient()

    // 1. อ่านข้อมูลห้องจาก rooms.id ที่ส่งมา (ค่าเช่า/ประเภทห้องใช้คำนวณเงินประกันตั้งต้น)
    //    ห้ามหาห้องจากเลขห้อง — เลขห้องซ้ำกันได้ข้ามอาคาร ผู้เช่าจะไปผูกกับห้องผิดอาคาร
    const { data: roomRow, error: roomError } = await supabase
      .from("rooms")
      .select("id, room_number, base_rent, room_types(deposit_amount)")
      .eq("id", room.roomId)
      .single()

    if (roomError || !roomRow) {
      throw new Error("ไม่พบข้อมูลห้องพักนี้ในระบบ กรุณาตรวจสอบหรือสร้างห้องพักก่อนทำสัญญา")
    }
    const roomNumber: string = roomRow.room_number

    // 1.5 คำนวณยอดเงินประกันตั้งต้น (ground truth) จากการตั้งค่า workspace/room_type ปัจจุบัน
    //     เพื่อให้ deposit_paid มีค่าเสมอตั้งแต่สร้างสัญญา ไม่ต้องรอ backfill
    let depositPaid: number | null = null
    if (workspaceId) {
      const financeRes = await getFinanceSettings(workspaceId)
      if (financeRes.success && financeRes.data) {
        const roomTypeDeposit = (roomRow.room_types as { deposit_amount?: number | null } | null)?.deposit_amount
        depositPaid = computeStandardDeposit(
          Number(roomRow.base_rent || 0),
          financeRes.data.deposit_type,
          Number(financeRes.data.deposit_amount || 0),
          roomTypeDeposit !== null && roomTypeDeposit !== undefined ? Number(roomTypeDeposit) : null
        )
      }
    }

    // 2. เพิ่มข้อมูลผู้เช่าและสัญญา
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert([{
        room_id: roomRow.id,
        tenant_name: fullName,
        tenant_phone: phone,
        line_user_id: lineUserId || null,
        lease_start: contractStart,
        lease_end: contractEnd,
        deposit_paid: depositPaid
      }])
      .select()

    if (tenantError) throw tenantError

    // 3. อัปเดตห้องพักให้เป็นมีผู้เช่า (occupied)
    const { error: roomUpdateError } = await supabase
      .from("rooms")
      .update({ status: "occupied" })
      .eq("id", roomRow.id)

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
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) await assertSubscriptionActive(workspaceId)

    const supabase = await createClient()

    // 1. ดึงข้อมูลผู้เช่ารายนี้ก่อนเพื่อนำไปสำรองประวัติลง tenants_old
    const { data: tenant, error: fetchError } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", id)
      .maybeSingle()

    if (fetchError) {
      console.error("Error fetching tenant before deletion:", fetchError)
    }

    // 2. ถ้าเจอข้อมูลผู้เช่า ให้บันทึกไปที่ tenants_old ก่อนทำการลบจริง
    if (tenant) {
      const { error: archiveError } = await supabase
        .from("tenants_old")
        .insert([{
          workspace_id: tenant.workspace_id,
          tenant_id: tenant.id,
          room_id: tenant.room_id,
          room_number: roomNumber,
          tenant_name: tenant.tenant_name,
          tenant_phone: tenant.tenant_phone,
          line_user_id: tenant.line_user_id,
          lease_start: tenant.lease_start,
          lease_end: tenant.lease_end,
          moved_out_at: new Date().toISOString()
        }])

      if (archiveError) {
        console.error("Failed to archive tenant to tenants_old:", archiveError)
        // หยุดทันทีถ้าสำรองประวัติไม่สำเร็จ ห้ามลบข้อมูลผู้เช่าจริงทิ้งแบบไม่มีการสำรอง (violates soft-delete policy)
        return { success: false, error: `ไม่สามารถสำรองประวัติผู้เช่าได้ก่อนลบ (${archiveError.message}) ระบบยกเลิกการลบเพื่อป้องกันข้อมูลสูญหาย` }
      }
    }

    // 3. ลบสัญญาผู้เช่า
    const { error: deleteError } = await supabase
      .from("tenants")
      .delete()
      .eq("id", id)

    if (deleteError) throw deleteError

    // 4. ตั้งห้องของผู้เช่ารายนี้เป็นว่าง (available)
    //    ใช้ tenant.room_id ที่อ่านมาแล้ว ไม่หาห้องจากเลขห้องซ้ำ — ไม่งั้นอาจไปปล่อยห้องของอีกอาคาร
    if (tenant?.room_id) {
      await supabase
        .from("rooms")
        .update({ status: "available" })
        .eq("id", tenant.room_id)
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบสัญญาผู้เช่า"
    return { success: false, error: errorMessage }
  }
}

export async function lazyCleanupPastDueTenants(workspaceId: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true, count: 0 }
  }

  try {
    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    await assertSubscriptionActive(workspaceId)

    const supabase = await createClient()

    // ดึงวันที่ปัจจุบันตามโซนเวลาประเทศไทย (+07:00)
    const d = new Date(new Date().getTime() + 7 * 60 * 60 * 1000)
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const date = String(d.getUTCDate()).padStart(2, '0')
    const todayStr = `${year}-${month}-${date}`

    // 1. ค้นหาประวัติการแจ้งยกเลิกสัญญาที่เลยกำหนดแล้ว (cancellation_date <= todayStr)
    const { data: cancellations, error: cancelError } = await supabase
      .from("cancelled_contracts")
      .select("tenant_id, room_number")
      .eq("workspace_id", workspaceId)
      .lte("cancellation_date", todayStr)

    if (cancelError) throw cancelError

    if (!cancellations || cancellations.length === 0) {
      return { success: true, count: 0 }
    }

    const tenantIdsToCleanup = cancellations.map(c => c.tenant_id).filter(Boolean) as string[]

    if (tenantIdsToCleanup.length === 0) {
      return { success: true, count: 0 }
    }

    // 2. ดึงรายชื่อผู้เช่าที่ต้องการทำความสะอาดและตรวจสอบความถูกต้องของสิทธิ์ผู้ใช้
    const { data: tenants, error: fetchTenantsError } = await supabase
      .from("tenants")
      .select("id, room_id, tenant_name, tenant_phone, line_user_id, lease_start, lease_end, rooms(room_number)")
      .in("id", tenantIdsToCleanup)
      .eq("workspace_id", workspaceId)

    if (fetchTenantsError) throw fetchTenantsError

    if (!tenants || tenants.length === 0) {
      return { success: true, count: 0 }
    }

    // 1. Archive ทั้งหมดในครั้งเดียว (bulk insert)
    const archiveRows = tenants.map(t => ({
      workspace_id: workspaceId,
      tenant_id: t.id,
      room_id: t.room_id,
      room_number: (t.rooms as any)?.room_number || "",
      tenant_name: t.tenant_name,
      tenant_phone: t.tenant_phone,
      line_user_id: t.line_user_id,
      lease_start: t.lease_start,
      lease_end: t.lease_end,
      moved_out_at: new Date().toISOString()
    }))
    const { error: archiveError } = await supabase.from("tenants_old").insert(archiveRows)
    if (archiveError) {
      console.error("Failed to bulk archive tenants:", archiveError)
      // หยุดทันทีถ้าสำรองประวัติไม่สำเร็จ ห้ามลบข้อมูลผู้เช่าจริงทิ้งแบบไม่มีการสำรอง (violates soft-delete policy)
      return { success: false, error: `ไม่สามารถสำรองประวัติผู้เช่าได้ก่อนลบ (${archiveError.message})`, count: 0 }
    }

    // 2. ลบ tenants ทั้งหมดในครั้งเดียว (bulk delete)
    const tenantIds = tenants.map(t => t.id)
    const { error: deleteError } = await supabase.from("tenants").delete().in("id", tenantIds)
    if (deleteError) throw deleteError

    // 3. อัปเดตห้องเป็น available ทั้งหมดในครั้งเดียว (bulk update)
    const roomIds = tenants.map(t => t.room_id).filter(Boolean) as string[]
    if (roomIds.length > 0) {
      const { error: roomUpdateError } = await supabase.from("rooms").update({ status: "available" }).in("id", roomIds)
      if (roomUpdateError) {
        console.error("Failed to bulk update rooms to available:", roomUpdateError)
      }
    }

    const cleanedCount = tenants.length

    return { success: true, count: cleanedCount }
  } catch (error) {
    console.error("Error in lazyCleanupPastDueTenants:", error)
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการทำความสะอาดข้อมูลผู้เช่าล่าช้า"
    return { success: false, error: errorMessage, count: 0 }
  }
}


export async function getOldTenants(workspaceId?: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true, data: [] }
  }

  try {
    const supabase = await createClient()

    // จำกัดประวัติผู้เช่าเก่าไว้แค่ 365 วันล่าสุด เพื่อไม่ให้ query ช้าลงเรื่อยๆ ตามอายุการใช้งานของหอ
    const cutoffDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

    // กรอง workspace ตรง ๆ ให้ query ใช้ idx_tenants_old_workspace_id ได้ ไม่ต้องพึ่ง RLS ประเมินทีละแถว
    // (optional เพื่อไม่พังผู้เรียกที่ไม่มี workspaceId ในมือ — RLS ยังเป็นด่านความปลอดภัยเสมอ)
    let query = supabase
      .from("tenants_old")
      .select("id, tenant_id, room_number, tenant_name, tenant_phone, line_user_id, lease_start, lease_end, moved_out_at")
      .gte("moved_out_at", cutoffDate)
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }
    const { data, error } = await query.order("moved_out_at", { ascending: false })

    if (error) {
      if (error.code === "42P01") {
        console.warn("Table tenants_old does not exist. Please run the SQL patch.")
        return { success: false, error: "table_not_found", data: [] }
      }
      throw error
    }

    const formatted = data.map((t: any) => ({
      id: t.id,
      tenantId: t.tenant_id,
      roomNumber: t.room_number || "ไม่มีข้อมูล",
      fullName: t.tenant_name,
      phone: t.tenant_phone,
      lineUserId: t.line_user_id,
      contractStart: t.lease_start,
      contractEnd: t.lease_end,
      movedOutAt: t.moved_out_at
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลผู้เช่าเก่า"
    return { success: false, error: errorMessage }
  }
}

export async function deleteOldTenant(id: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) await assertSubscriptionActive(workspaceId)

    const supabase = await createClient()
    const { error } = await supabase
      .from("tenants_old")
      .delete()
      .eq("id", id)

    if (error) throw error
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบข้อมูลผู้เช่าเก่า"
    return { success: false, error: errorMessage }
  }
}


export async function updateTenant(
  id: string,
  room: RoomRef,
  fullName: string,
  phone: string,
  lineUserId: string | null,
  contractStart: string,
  contractEnd: string
) {
  try {
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) await assertSubscriptionActive(workspaceId)

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

    // 2. ตรวจว่าห้องที่ระบุมามีจริง (จับด้วย rooms.id ไม่ใช่เลขห้องที่ซ้ำกันได้ข้ามอาคาร)
    const { data: newRoom, error: roomError } = await supabase
      .from("rooms")
      .select("id, room_number")
      .eq("id", room.roomId)
      .single()

    if (roomError || !newRoom) {
      throw new Error("ไม่พบข้อมูลห้องพักนี้ในระบบ")
    }
    const roomNumber: string = newRoom.room_number

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
          building_id,
          waive_electric_min,
          waive_water_min,
          extra_expenses,
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
    let waterMinChecked = true
    let waterMinUnit = 3
    let electricMinChecked = true
    let electricMinUnit = 10
    let electricBillingMode: "fixed_rate" | "building_total" = "fixed_rate"
    let waterBillingMode: "fixed_rate" | "building_total" = "fixed_rate"

    let latePenaltyRate = 0
    let workspaceLogo = ""
    if (tenant && tenant.workspace_id) {
      // logo_url และ late_penalty_rate เป็นคอลัมน์ในตาราง workspaces ตั้งแต่ base schema (schema_multi_workspace.sql)
      // จึงรวมเข้ากับ query หลักได้โดยไม่ต้องแยกยิงซ้ำเพื่อความปลอดภัยแบบเดิมอีกต่อไป
      const { data: ws } = await supabase
        .from("workspaces")
        .select("name, promptpay_id, promptpay_name, tax_address, tax_phone, tax_id, common_fee, water_rate, electric_rate, water_min_checked, water_min_unit, electric_min_checked, electric_min_unit, logo_url, late_penalty_rate, electric_billing_mode, water_billing_mode")
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
        if (ws.water_min_checked !== null && ws.water_min_checked !== undefined) waterMinChecked = Boolean(ws.water_min_checked)
        if (ws.water_min_unit !== null && ws.water_min_unit !== undefined) waterMinUnit = Number(ws.water_min_unit)
        if (ws.electric_min_checked !== null && ws.electric_min_checked !== undefined) electricMinChecked = Boolean(ws.electric_min_checked)
        if (ws.electric_min_unit !== null && ws.electric_min_unit !== undefined) electricMinUnit = Number(ws.electric_min_unit)
        if (ws.logo_url) workspaceLogo = ws.logo_url
        if (ws.late_penalty_rate !== null && ws.late_penalty_rate !== undefined) latePenaltyRate = Number(ws.late_penalty_rate)
        if (ws.electric_billing_mode === "building_total") electricBillingMode = "building_total"
        if (ws.water_billing_mode === "building_total") waterBillingMode = "building_total"
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
          waterMinChecked,
          waterMinUnit,
          electricMinChecked,
          electricMinUnit,
          latePenaltyRate,
          electricBillingMode,
          waterBillingMode
        }
      }
    }

    // 4. Get bills for this room
    //    จับด้วย room_id เท่านั้น — ถ้าเทียบด้วยเลขห้อง ผู้เช่าจะเห็นบิลของห้องเลขเดียวกันในอาคารอื่นด้วย
    const roomNumber = tenant.rooms?.room_number
    const tenantRoomId: string | null = tenant.room_id ?? null
    let formattedBills: any[] = []

    if (tenantRoomId) {
      const { data: bills, error: billsError } = await supabase
        .from("bills")
        .select("*")
        .eq("room_id", tenantRoomId)
        .eq("workspace_id", tenant.workspace_id)
        .order("billing_cycle", { ascending: false })

      if (billsError) throw billsError

      if (bills) {
        // ตรวจสอบว่ามีผู้เช่ารายใหม่เข้ามาอยู่ต่อหลังจากสัญญาเช่าของตนเองหรือไม่
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
        
        // 1. กรองด้วยประวัติชื่อผู้เช่า (ต้องตรงกัน) ป้องกันไม่ให้เห็นบิลของผู้เช่ารายอื่น
        if (tenant.tenant_name) {
          filteredBills = filteredBills.filter((b: any) => b.tenant_name === tenant.tenant_name)
        }

        // 2. กรองตามเงื่อนไข lease_start และ lease_end ที่นำกลับมา
        if (leaseStartCycle) {
          filteredBills = filteredBills.filter((b: any) => b.billing_cycle >= leaseStartCycle)
        }
        if (leaseEndCycle && !isLatestTenant) {
          filteredBills = filteredBills.filter((b: any) => b.billing_cycle <= leaseEndCycle)
        }

        // ดึงเลขมิเตอร์ก่อนหน้า-ปัจจุบันของทุกรอบบิลที่จะแสดง (ครั้งเดียว ไม่ query แยกทีละบิล)
        // เพื่อเอาไปโชว์ "เลขมิเตอร์เดือนก่อนหน้า - เลขมิเตอร์เดือนที่วางบิล" ในหน้าบิลของผู้เช่า
        const billingCyclesForMeters = Array.from(new Set(filteredBills.map((b: any) => b.billing_cycle)))
        const meterByCycle = new Map<string, { elecPrev: number; elecCurr: number | null; waterPrev: number; waterCurr: number | null }>()
        if (tenantRoomId && billingCyclesForMeters.length > 0) {
          const { data: meterRows } = await supabase
            .from("meter_records")
            .select("billing_cycle, elec_prev, elec_curr, water_prev, water_curr")
            .eq("workspace_id", tenant.workspace_id)
            .eq("room_id", tenantRoomId)
            .in("billing_cycle", billingCyclesForMeters)

          meterRows?.forEach((m: any) => {
            meterByCycle.set(m.billing_cycle, {
              elecPrev: Number(m.elec_prev),
              elecCurr: m.elec_curr === null || m.elec_curr === undefined ? null : Number(m.elec_curr),
              waterPrev: Number(m.water_prev),
              waterCurr: m.water_curr === null || m.water_curr === undefined ? null : Number(m.water_curr)
            })
          })
        }

        // ถ้าเปิดโหมด building_total ของ utility ใดก็ตาม ดึงยอดบิลรวมทั้งอาคารของทุกรอบบิลที่จะแสดง
        // (ครั้งเดียว) เพื่อเอาไปโชว์ "รายละเอียดใบแจ้งหนี้จริงจากหน่วยงาน" ในหน้าบิลของผู้เช่า
        // ใช้ building_id ที่ snapshot ไว้ ณ ตอนออกบิล (bills.building_id) ไม่ใช่ building_id ปัจจุบันของห้อง
        // เพราะห้องอาจถูกย้ายไปอาคารอื่นภายหลัง บิลเก่าต้องอ้างอิงอาคารที่ถูกต้อง ณ ตอนออกบิลเสมอ
        const currentRoomBuildingId = (tenant.rooms as any)?.building_id ?? null
        const buildingIdsForUtility = Array.from(new Set(
          filteredBills.map((b: any) => b.building_id ?? currentRoomBuildingId).filter(Boolean)
        ))
        const buildingUtilityByCycle = new Map<string, { electric?: { amount: number; units: number }; water?: { amount: number; units: number } }>()
        if (buildingIdsForUtility.length > 0 && (electricBillingMode === "building_total" || waterBillingMode === "building_total") && billingCyclesForMeters.length > 0) {
          const { data: buildingBillRows } = await supabase
            .from("building_utility_bills")
            .select("billing_cycle, building_id, utility_type, total_amount, total_units")
            .in("building_id", buildingIdsForUtility)
            .in("billing_cycle", billingCyclesForMeters)

          buildingBillRows?.forEach((row: any) => {
            const key = `${row.building_id}:${row.billing_cycle}`
            const entry = buildingUtilityByCycle.get(key) || {}
            entry[row.utility_type as "electric" | "water"] = { amount: Number(row.total_amount), units: Number(row.total_units) }
            buildingUtilityByCycle.set(key, entry)
          })
        }

        formattedBills = filteredBills.map((b: any) => {
          // ค่าปรับล่าช้า — กฎอยู่ใน resolveBillPenalty ที่เดียว (ห้ามเขียนซ้ำที่นี่)
          const { lateDays, penaltyAmount, amount } = resolveBillPenalty({
            savedPenaltyAmount: b.penalty_amount,
            savedLateDays: b.late_days,
            billAmount: b.amount,
            billingCycle: b.billing_cycle,
            billStatus: b.status,
            latePenaltyRate
          })

          const meter = meterByCycle.get(b.billing_cycle)
          const billBuildingId = b.building_id ?? currentRoomBuildingId
          const buildingUtility = billBuildingId ? buildingUtilityByCycle.get(`${billBuildingId}:${b.billing_cycle}`) : undefined
          const electricBuildingTotal = electricBillingMode === "building_total" ? buildingUtility?.electric : undefined
          const waterBuildingTotal = waterBillingMode === "building_total" ? buildingUtility?.water : undefined

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
            otherServiceAmount: b.other_service_amount !== null && b.other_service_amount !== undefined ? Number(b.other_service_amount) : 0,
            vatAmount: b.vat_amount !== null && b.vat_amount !== undefined ? Number(b.vat_amount) : 0,
            invoiceId: b.invoice_id,
            elecPrev: meter?.elecPrev ?? null,
            elecCurr: meter?.elecCurr ?? null,
            waterPrev: meter?.waterPrev ?? null,
            waterCurr: meter?.waterCurr ?? null,
            electricBuildingTotalAmount: electricBuildingTotal?.amount ?? null,
            electricBuildingTotalUnits: electricBuildingTotal?.units ?? null,
            waterBuildingTotalAmount: waterBuildingTotal?.amount ?? null,
            waterBuildingTotalUnits: waterBuildingTotal?.units ?? null
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
        waiveElectricMin: tenant.rooms?.waive_electric_min,
        waiveWaterMin: tenant.rooms?.waive_water_min,
        extraExpenses: tenant.rooms?.extra_expenses || [],
        bills: formattedBills,
        electricBillingMode,
        waterBillingMode,
        promptPayId,
        promptPayName,
        workspaceName,
        workspaceAddress,
        workspacePhone,
        workspaceTaxId,
        commonFee,
        waterRate,
        electricRate,
        waterMinChecked,
        waterMinUnit,
        electricMinChecked,
        electricMinUnit,
        latePenaltyRate,
        workspaceLogo
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

/**
 * ตัวระบุห้องในลิงก์ดูบิลแบบไม่ล็อกอิน
 *
 * `roomId` = รูปแบบปัจจุบัน (rooms.id) — ใช้กับลิงก์ที่ออกใหม่ทุกใบ
 * `roomNumber` = รูปแบบเก่าที่เคยส่งไปใน LINE ก่อนหน้านี้ ยังรับไว้เพื่อไม่ให้ผู้เช่ากดลิงก์
 * เดือนก่อนแล้วเปิดไม่ได้ — แต่เปิดได้เฉพาะเมื่อเลขห้องนั้นไม่กำกวมในหอ (ดู resolvePortalRoom)
 */
export type PortalRoomRef = { roomId: string } | { roomNumber: string }

/** คีย์ที่ใช้เซ็น token — roomId สำหรับลิงก์ใหม่, roomNumber สำหรับลิงก์เก่า */
function portalRoomKey(room: PortalRoomRef): string {
  return "roomId" in room ? room.roomId : room.roomNumber
}

export async function generatePortalToken(workspaceId: string, roomKey: string): Promise<string> {
  const secret = getSignatureSecret()
  return crypto
    .createHmac("sha256", secret)
    .update(`${workspaceId}:${roomKey}`)
    .digest("hex")
}

export async function verifyPortalToken(workspaceId: string, roomKey: string, token: string): Promise<boolean> {
  if (!token) return false
  const expectedToken = await generatePortalToken(workspaceId, roomKey)
  try {
    return crypto.timingSafeEqual(Buffer.from(token, "utf-8"), Buffer.from(expectedToken, "utf-8"))
  } catch {
    return token === expectedToken
  }
}

/**
 * สร้างลิงก์ดูบิลแบบไม่ต้องล็อกอิน
 *
 * ⚠️ ต้องส่ง rooms.id เข้ามา ไม่ใช่เลขห้อง — เลขห้องซ้ำกันได้ข้ามอาคาร ถ้าใช้เลขห้องเป็นตัวระบุ
 * ผู้เช่าห้อง 101 ตึก A จะเปิดลิงก์แล้วเห็นบิลของห้อง 101 ตึก B (หรือกลับกัน) แบบสุ่ม
 */
export async function generateSecurePortalLinkAction(workspaceId: string, roomId: string) {
  try {
    const token = await generatePortalToken(workspaceId, roomId)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
    const link = `${appUrl}/portal?workspace_id=${workspaceId}&room_id=${encodeURIComponent(roomId)}&token=${token}`
    return { success: true, link }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * ดึงข้อมูลบิลและค่าใช้จ่ายแบบไม่ต้อง Login โดยอาศัยรหัสความปลอดภัยร่วมกัน (workspaceId + ตัวระบุห้อง + token เพื่อความปลอดภัย)
 *
 * รับตัวระบุห้องได้ 2 รูปแบบ (ดู PortalRoomRef) — ลิงก์ใหม่ใช้ roomId, ลิงก์เก่าที่ยังค้างใน LINE ใช้ roomNumber
 */
export async function getTenantPortalDataNoLoginAction(workspaceId: string, room: PortalRoomRef, token?: string) {
  try {
    if (!token) {
      return { success: false, error: "กรุณาระบุรหัสความปลอดภัยในการเข้าถึงข้อมูล (Missing signature token)" }
    }

    const isValid = await verifyPortalToken(workspaceId, portalRoomKey(room), token)
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
    //
    // ลิงก์รูปแบบเก่าเทียบด้วยเลขห้อง ซึ่งกำกวมได้เมื่อหอมีหลายอาคารใช้เลขห้องซ้ำกัน —
    // ในกรณีนั้นต้องปฏิเสธ ไม่ใช่หยิบห้องแรกที่เจอ (ไม่งั้นผู้เช่าจะเห็นบิลของคนอื่น)
    // ผู้เช่าใช้ลิงก์รอบบิลล่าสุดที่ระบบส่งให้ทาง LINE ได้เสมอ ลิงก์นั้นใช้ roomId แล้ว
    const roomSelect = "id, room_number, base_rent, building_id, waive_electric_min, waive_water_min, extra_expenses, room_types(default_rent)"
    let roomRow: any = null
    if ("roomId" in room) {
      const { data, error } = await supabase
        .from("rooms")
        .select(roomSelect)
        .eq("workspace_id", workspaceId)
        .eq("id", room.roomId)
        .maybeSingle()
      if (error) return { success: false, error: "ไม่พบข้อมูลห้องพักนี้ในระบบ" }
      roomRow = data
    } else {
      const { data, error } = await supabase
        .from("rooms")
        .select(roomSelect)
        .eq("workspace_id", workspaceId)
        .eq("room_number", room.roomNumber)
      if (error) return { success: false, error: "ไม่พบข้อมูลห้องพักนี้ในระบบ" }
      if (data && data.length > 1) {
        return { success: false, error: "ลิงก์นี้เป็นรูปแบบเดิมและใช้ไม่ได้แล้วเนื่องจากหอพักมีห้องเลขนี้มากกว่าหนึ่งอาคาร กรุณาใช้ลิงก์จากใบแจ้งหนี้รอบล่าสุด" }
      }
      roomRow = data && data.length === 1 ? data[0] : null
    }

    if (!roomRow) {
      return { success: false, error: "ไม่พบข้อมูลห้องพักนี้ในระบบ" }
    }
    const roomId: string = roomRow.id
    const roomNumber: string = roomRow.room_number

    // 2. ค้นหาข้อมูลผู้เช่าของห้องนี้ (ดึงสัญญาล่าสุดของห้องนี้เพื่อป้องกันข้อผิดพลาดกรณีมีประวัติสัญญาเช่าหลายใบ)
    const { data: tenantsList, error: tenantError } = await supabase
      .from("tenants")
      .select("*")
      .eq("room_id", roomId)
      .eq("workspace_id", workspaceId)
      .order("lease_start", { ascending: false })

    if (tenantError) throw tenantError
    const tenant = tenantsList && tenantsList.length > 0 ? tenantsList[0] : null

    // 3. ค้นหารายละเอียดของ Workspace และการตั้งค่าพร้อมเพย์
    // logo_url และ late_penalty_rate เป็นคอลัมน์ในตาราง workspaces ตั้งแต่ base schema (schema_multi_workspace.sql)
    // จึงรวมเข้ากับ query หลักได้โดยไม่ต้องแยกยิงซ้ำเพื่อความปลอดภัยแบบเดิมอีกต่อไป
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name, promptpay_id, promptpay_name, tax_address, tax_phone, tax_id, common_fee, water_rate, electric_rate, water_min_checked, water_min_unit, electric_min_checked, electric_min_unit, logo_url, late_penalty_rate, electric_billing_mode, water_billing_mode")
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
    let waterMinChecked = true
    let waterMinUnit = 3
    let electricMinChecked = true
    let electricMinUnit = 10
    let latePenaltyRate = 0
    let electricBillingMode: "fixed_rate" | "building_total" = "fixed_rate"
    let waterBillingMode: "fixed_rate" | "building_total" = "fixed_rate"

    let workspaceLogo = ""
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
      if (ws.water_min_checked !== null && ws.water_min_checked !== undefined) waterMinChecked = Boolean(ws.water_min_checked)
      if (ws.water_min_unit !== null && ws.water_min_unit !== undefined) waterMinUnit = Number(ws.water_min_unit)
      if (ws.electric_min_checked !== null && ws.electric_min_checked !== undefined) electricMinChecked = Boolean(ws.electric_min_checked)
      if (ws.electric_min_unit !== null && ws.electric_min_unit !== undefined) electricMinUnit = Number(ws.electric_min_unit)
      if (ws.logo_url) workspaceLogo = ws.logo_url
      if (ws.late_penalty_rate !== null && ws.late_penalty_rate !== undefined) latePenaltyRate = Number(ws.late_penalty_rate)
      if (ws.electric_billing_mode === "building_total") electricBillingMode = "building_total"
      if (ws.water_billing_mode === "building_total") waterBillingMode = "building_total"
    }

    // 4. ดึงข้อมูลบิลทั้งหมดประจำห้องนี้ในตึกนี้ — จับด้วย room_id เท่านั้น
    // (เลขห้องซ้ำกันได้ข้ามอาคาร ถ้าเทียบด้วยเลขห้องผู้เช่าจะเห็นบิลของห้องเลขเดียวกันในตึกอื่นด้วย)
    const { data: bills, error: billsError } = await supabase
      .from("bills")
      .select("*")
      .eq("room_id", roomId)
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
      
      // 1. กรองด้วยประวัติชื่อผู้เช่า (ต้องตรงกัน) ป้องกันไม่ให้เห็นบิลของผู้เช่ารายอื่น
      if (tenant?.tenant_name) {
        filteredBills = filteredBills.filter((b: any) => b.tenant_name === tenant.tenant_name)
      }

      // 2. กรองตามเงื่อนไข lease_start และ lease_end ที่นำกลับมา
      if (leaseStartCycle) {
        filteredBills = filteredBills.filter((b: any) => b.billing_cycle >= leaseStartCycle)
      }
      if (leaseEndCycle && !isLatestTenant) {
        filteredBills = filteredBills.filter((b: any) => b.billing_cycle <= leaseEndCycle)
      }

      // ดึงเลขมิเตอร์ก่อนหน้า-ปัจจุบันของทุกรอบบิลที่จะแสดง (ครั้งเดียว ไม่ query แยกทีละบิล)
      const billingCyclesForMeters = Array.from(new Set(filteredBills.map((b: any) => b.billing_cycle)))
      const meterByCycle = new Map<string, { elecPrev: number; elecCurr: number | null; waterPrev: number; waterCurr: number | null }>()
      if (billingCyclesForMeters.length > 0) {
        const { data: meterRows } = await supabase
          .from("meter_records")
          .select("billing_cycle, elec_prev, elec_curr, water_prev, water_curr")
          .eq("workspace_id", workspaceId)
          .eq("room_id", roomId)
          .in("billing_cycle", billingCyclesForMeters)

        meterRows?.forEach((m: any) => {
          meterByCycle.set(m.billing_cycle, {
            elecPrev: Number(m.elec_prev),
            elecCurr: m.elec_curr === null || m.elec_curr === undefined ? null : Number(m.elec_curr),
            waterPrev: Number(m.water_prev),
            waterCurr: m.water_curr === null || m.water_curr === undefined ? null : Number(m.water_curr)
          })
        })
      }

      // ถ้าเปิดโหมด building_total ของ utility ใดก็ตาม ดึงยอดบิลรวมทั้งอาคารของทุกรอบบิลที่จะแสดง
      // ใช้ building_id ที่ snapshot ไว้ ณ ตอนออกบิล (bills.building_id) ไม่ใช่ building_id ปัจจุบันของห้อง
      // เพราะห้องอาจถูกย้ายไปอาคารอื่นภายหลัง บิลเก่าต้องอ้างอิงอาคารที่ถูกต้อง ณ ตอนออกบิลเสมอ
      const currentRoomBuildingId = roomRow.building_id ?? null
      const buildingIdsForUtility = Array.from(new Set(
        filteredBills.map((b: any) => b.building_id ?? currentRoomBuildingId).filter(Boolean)
      ))
      const buildingUtilityByCycle = new Map<string, { electric?: { amount: number; units: number }; water?: { amount: number; units: number } }>()
      if (buildingIdsForUtility.length > 0 && (electricBillingMode === "building_total" || waterBillingMode === "building_total") && billingCyclesForMeters.length > 0) {
        const { data: buildingBillRows } = await supabase
          .from("building_utility_bills")
          .select("billing_cycle, building_id, utility_type, total_amount, total_units")
          .in("building_id", buildingIdsForUtility)
          .in("billing_cycle", billingCyclesForMeters)

        buildingBillRows?.forEach((row: any) => {
          const key = `${row.building_id}:${row.billing_cycle}`
          const entry = buildingUtilityByCycle.get(key) || {}
          entry[row.utility_type as "electric" | "water"] = { amount: Number(row.total_amount), units: Number(row.total_units) }
          buildingUtilityByCycle.set(key, entry)
        })
      }

      formattedBills = filteredBills.map((b: any) => {
        // ค่าปรับล่าช้า — กฎอยู่ใน resolveBillPenalty ที่เดียว (ห้ามเขียนซ้ำที่นี่)
        // เดิมตรรกะนี้ถูกคัดลอกไว้สองที่ ซึ่งเสี่ยงให้ผู้เช่าที่ล็อกอินกับที่กดลิงก์เห็นยอดต่างกัน
        const { lateDays, penaltyAmount, amount } = resolveBillPenalty({
          savedPenaltyAmount: b.penalty_amount,
          savedLateDays: b.late_days,
          billAmount: b.amount,
          billingCycle: b.billing_cycle,
          billStatus: b.status,
          latePenaltyRate
        })

        const meter = meterByCycle.get(b.billing_cycle)
        const billBuildingId = b.building_id ?? currentRoomBuildingId
        const buildingUtility = billBuildingId ? buildingUtilityByCycle.get(`${billBuildingId}:${b.billing_cycle}`) : undefined
        const electricBuildingTotal = electricBillingMode === "building_total" ? buildingUtility?.electric : undefined
        const waterBuildingTotal = waterBillingMode === "building_total" ? buildingUtility?.water : undefined

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
          otherServiceAmount: b.other_service_amount !== null && b.other_service_amount !== undefined ? Number(b.other_service_amount) : 0,
          vatAmount: b.vat_amount !== null && b.vat_amount !== undefined ? Number(b.vat_amount) : 0,
          invoiceId: b.invoice_id,
          elecPrev: meter?.elecPrev ?? null,
          elecCurr: meter?.elecCurr ?? null,
          waterPrev: meter?.waterPrev ?? null,
          waterCurr: meter?.waterCurr ?? null,
          electricBuildingTotalAmount: electricBuildingTotal?.amount ?? null,
          electricBuildingTotalUnits: electricBuildingTotal?.units ?? null,
          waterBuildingTotalAmount: waterBuildingTotal?.amount ?? null,
          waterBuildingTotalUnits: waterBuildingTotal?.units ?? null
        }
      })
    }

    const baseRent = roomRow.room_types ? Number(roomRow.room_types.default_rent) : Number(roomRow.base_rent)

    return {
      success: true,
      data: {
        roomNumber,
        tenantName: tenant ? tenant.tenant_name : "ผู้เช่า",
        baseRent,
        waiveElectricMin: roomRow.waive_electric_min,
        waiveWaterMin: roomRow.waive_water_min,
        extraExpenses: roomRow.extra_expenses || [],
        bills: formattedBills,
        electricBillingMode,
        waterBillingMode,
        promptPayId,
        promptPayName,
        workspaceName,
        workspaceAddress,
        workspacePhone,
        workspaceTaxId,
        commonFee,
        waterRate,
        electricRate,
        waterMinChecked,
        waterMinUnit,
        electricMinChecked,
        electricMinUnit,
        latePenaltyRate,
        workspaceLogo
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
      forfeitedAmount: Number(item.forfeited_amount || 0),
      deductedRent405: Number(item.deducted_rent_405 || 0),
      deductedUtilities408: Number(item.deducted_utilities_408 || 0),
      deductedServices408: Number(item.deducted_services_408 || 0)
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
  deductedRent405?: number
  deductedUtilities408?: number
  deductedServices408?: number

  // Raw fields for backend-side calculation
  baseRent?: number
  contractEnd?: string | null
  checkoutPolicy?: "DAILY_PRORATE" | "FULL_MONTH"
  isRentWaived?: boolean
  totalUtilities408?: number
  customDeductions?: { name: string; amount: number }[]
  isHistoricalEdit?: boolean
  isHistoricalBreach?: boolean
  historicalRentDeduction?: number
  historicalUtilitiesDeduction?: number
}) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    await assertSubscriptionActive(workspaceId)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Unauthorized - กรุณาเข้าสู่ระบบก่อนดำเนินการ" }
    }

    const { data: profile } = await supabase
       .from("profiles")
       .select("role, workspace_id")
       .eq("id", user.id)
       .single()

    if (!profile) {
      return { success: false, error: "ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน" }
    }

    const isSuperAdmin = profile.role === "super_admin"
    const isWorkspaceMember = profile.workspace_id === workspaceId && (profile.role === "admin" || profile.role === "staff")

    if (!isSuperAdmin && !isWorkspaceMember) {
      return { success: false, error: "คุณไม่มีสิทธิ์ในการบันทึกประวัติสำหรับหอพักนี้" }
    }

    // Server-Side Recomputation for Source of Truth
    let finalRefundedAmount = contract.refundedAmount
    let finalActualRefund = contract.actualRefund !== undefined && contract.actualRefund !== null ? contract.actualRefund : contract.refundedAmount
    let finalForfeitedAmount = contract.forfeitedAmount
    let finalDeductedRent405 = contract.deductedRent405 || 0
    let finalDeductedUtilities408 = contract.deductedUtilities408 || 0
    let finalDeductedServices408 = contract.deductedServices408 || 0

    if (contract.baseRent !== undefined) {
      let policy = contract.checkoutPolicy
      if (!policy) {
        const settingsRes = await getFinanceSettings(workspaceId)
        if (settingsRes.success && settingsRes.data) {
          policy = settingsRes.data.checkout_policy
        }
      }

      // 2. Perform server-side calculation
      const serverCalc = calculateDepositProration({
        baseRent: contract.baseRent,
        depositAmount: contract.depositAmount,
        checkoutDate: contract.cancellationDate,
        contractEnd: contract.contractEnd || null,
        checkoutPolicy: policy || "DAILY_PRORATE",
        isRentWaived: contract.isRentWaived,
        totalUtilities408: contract.totalUtilities408,
        customDeductions: contract.customDeductions,
        isHistoricalEdit: contract.isHistoricalEdit,
        isHistoricalBreach: contract.isHistoricalBreach,
        historicalRentDeduction: contract.historicalRentDeduction,
        historicalUtilitiesDeduction: contract.historicalUtilitiesDeduction,
      })

      // 3. Compare and warn if they don't match (within 0.01 tolerance)
      const diffRefund = Math.abs(serverCalc.actualRefund - contract.refundedAmount)
      const diffForfeited = Math.abs(serverCalc.forfeitedAmount - contract.forfeitedAmount)
      const diffRent = Math.abs(serverCalc.rentDeduction - (contract.deductedRent405 || 0))
      const diffUtils = Math.abs(serverCalc.utilitiesDeduction - (contract.deductedUtilities408 || 0))
      const diffServices = Math.abs(serverCalc.servicesDeduction - (contract.deductedServices408 || 0))

      if (
        diffRefund > 0.01 ||
        diffForfeited > 0.01 ||
        diffRent > 0.01 ||
        diffUtils > 0.01 ||
        diffServices > 0.01
      ) {
        console.warn(
          `[Server-Side Calculation Discrepancy] for room ${contract.roomNumber} in workspace ${workspaceId}:` +
          `\nClient values: refunded=${contract.refundedAmount}, forfeited=${contract.forfeitedAmount}, rent=${contract.deductedRent405}, utilities=${contract.deductedUtilities408}, services=${contract.deductedServices408}` +
          `\nServer values: refunded=${serverCalc.actualRefund}, forfeited=${serverCalc.forfeitedAmount}, rent=${serverCalc.rentDeduction}, utilities=${serverCalc.utilitiesDeduction}, services=${serverCalc.servicesDeduction}`
        )
      }

      // 4. Overwrite/use server-computed values as the source of truth
      finalRefundedAmount = serverCalc.actualRefund
      finalActualRefund = serverCalc.actualRefund
      finalForfeitedAmount = serverCalc.forfeitedAmount
      finalDeductedRent405 = serverCalc.rentDeduction
      finalDeductedUtilities408 = serverCalc.utilitiesDeduction
      finalDeductedServices408 = serverCalc.servicesDeduction
    }

    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const insertData: any = {
      workspace_id: workspaceId,
      tenant_id: contract.tenantId || null,
      room_number: contract.roomNumber,
      tenant_name: contract.tenantName,
      cancellation_date: contract.cancellationDate,
      deposit_amount: contract.depositAmount,
      refunded_amount: finalRefundedAmount,
      actual_refund: finalActualRefund,
      forfeited_amount: finalForfeitedAmount,
      deducted_rent_405: finalDeductedRent405,
      deducted_utilities_408: finalDeductedUtilities408,
      deducted_services_408: finalDeductedServices408
    }

    if (contract.id) {
      insertData.id = contract.id
    }

    const { data, error } = await adminSupabase
      .from("cancelled_contracts")
      .upsert([insertData])
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Unauthorized - กรุณาเข้าสู่ระบบก่อนดำเนินการ" }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, workspace_id")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return { success: false, error: "ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน" }
    }

    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: contract } = await adminSupabase
      .from("cancelled_contracts")
      .select("workspace_id")
      .eq("id", id)
      .single()

    if (!contract) {
      return { success: false, error: "ไม่พบข้อมูลประวัติการยกเลิกสัญญา" }
    }

    const isSuperAdmin = profile.role === "super_admin"
    const isWorkspaceMember = profile.workspace_id === contract.workspace_id && (profile.role === "admin" || profile.role === "staff")

    if (!isSuperAdmin && !isWorkspaceMember) {
      return { success: false, error: "คุณไม่มีสิทธิ์ในการลบประวัติสำหรับหอพักนี้" }
    }

    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) await assertSubscriptionActive(workspaceId)

    const { error } = await adminSupabase
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Unauthorized - กรุณาเข้าสู่ระบบก่อนดำเนินการ" }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, workspace_id")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return { success: false, error: "ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน" }
    }

    const isSuperAdmin = profile.role === "super_admin"
    const isWorkspaceMember = profile.workspace_id === workspaceId && (profile.role === "admin" || profile.role === "staff")

    if (!isSuperAdmin && !isWorkspaceMember) {
      return { success: false, error: "คุณไม่มีสิทธิ์ในการย้ายข้อมูลสำหรับหอพักนี้" }
    }

    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    await assertSubscriptionActive(workspaceId)

    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const toInsert = contracts.map(contract => {
      const row: any = {
        workspace_id: workspaceId,
        tenant_id: contract.tenantId || null,
        room_number: contract.roomNumber || "",
        tenant_name: contract.tenantName || "",
        cancellation_date: contract.cancellationDate || "",
        deposit_amount: Number(contract.depositAmount || 0),
        refunded_amount: Number(contract.refundedAmount || 0),
        actual_refund: Number(contract.actualRefund !== undefined && contract.actualRefund !== null ? contract.actualRefund : (contract.refundedAmount || 0)),
        forfeited_amount: Number(contract.forfeitedAmount || 0)
      }
      if (contract.id) {
        row.id = contract.id
      }
      return row
    })

    if (toInsert.length > 0) {
      const { error } = await adminSupabase
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

export async function disconnectLine(tenantId: string) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) await assertSubscriptionActive(workspaceId)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("tenants")
      .update({ line_user_id: null, updated_at: new Date().toISOString() })
      .eq("id", tenantId)
      .select()

    if (error) throw error

    return { success: true, data: data[0] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการหยุดเชื่อมต่อ LINE"
    return { success: false, error: errorMessage }
  }
}

/**
 * นำเข้าข้อมูลผู้เช่าและสัญญาแบบกลุ่ม (Batch) จากไฟล์ CSV
 * รองรับการชี้เป้าความผิดพลาดรายบรรทัดอย่างแม่นยำ
 */
export async function createTenantsBatch(
  tenants: {
    room_number: string
    tenant_name: string
    phone: string
    lease_start: string
    line_number: number
    /** อาคารของห้องนี้ — ส่งมาเมื่อหอมีหลายอาคาร เพื่อระบุให้ชัดว่า "ห้อง 101" คือห้องของตึกไหน */
    building_id?: string
  }[],
  workspaceId: string
) {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true }
  }

  try {
    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    await assertSubscriptionActive(workspaceId)

    const supabase = await createClient()

    if (tenants.length === 0) {
      return { success: false, error: "ไม่พบรายการข้อมูลผู้เช่าในไฟล์" }
    }

    // 1. ดึงข้อมูลระยะเวลาสัญญาเริ่มต้นของ Workspace นี้
    let leaseDuration = 6
    try {
      const { data: wsData, error: wsError } = await supabase
        .from("workspaces")
        .select("lease_duration")
        .eq("id", workspaceId)
        .single()
      
      if (!wsError && wsData && wsData.lease_duration !== null && wsData.lease_duration !== undefined) {
        leaseDuration = Number(wsData.lease_duration)
      }
    } catch (e) {
      console.warn("Could not query lease_duration from workspaces table. Defaulting to 6 months.", e)
    }

    // 2. ดึงข้อมูลห้องพักทั้งหมดของ Workspace นี้มาเปรียบเทียบ
    const { data: dbRooms, error: roomsError } = await supabase
      .from("rooms")
      .select("id, room_number, building_id")
      .eq("workspace_id", workspaceId)

    if (roomsError) {
      console.error("Error fetching rooms in createTenantsBatch:", roomsError)
      return { success: false, error: "ไม่สามารถดึงข้อมูลห้องพักเพื่อตรวจสอบได้" }
    }

    // จับคู่ห้องด้วย (building_id, room_number) เมื่อผู้เรียกระบุอาคารมา และถอยไปใช้ room_number
    // เพียว ๆ เมื่อไม่ได้ระบุ (หออาคารเดียว หรือไฟล์เก่าที่ไม่มีคอลัมน์ building_name)
    // จำเป็นเพราะเลขห้องซ้ำกันได้ข้ามตึก ถ้าจับคู่ด้วยเลขห้องอย่างเดียวจะได้ห้องผิดตึกแบบเงียบ ๆ
    const roomMap = new Map<string, string>()
    const roomByBuilding = new Map<string, string>()
    dbRooms?.forEach(r => {
      const numKey = r.room_number.trim().toLowerCase()
      if (!roomMap.has(numKey)) roomMap.set(numKey, r.id)
      if (r.building_id) roomByBuilding.set(`${r.building_id}:${numKey}`, r.id)
    })

    const resolveRoomId = (roomNumber: string, buildingId?: string): string | undefined => {
      const numKey = roomNumber.trim().toLowerCase()
      if (buildingId) return roomByBuilding.get(`${buildingId}:${numKey}`)
      return roomMap.get(numKey)
    }

    const errors: string[] = []
    const validTenantsToInsert: any[] = []
    const roomIdsToUpdate: string[] = []

    const addMonths = (dateStr: string, months: number) => {
      try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) {
          throw new Error()
        }
        d.setMonth(d.getMonth() + months)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const r = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${r}`
      } catch {
        const d = new Date()
        d.setMonth(d.getMonth() + months)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const r = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${r}`
      }
    }

    // ฟังก์ชันช่วยสกัดและแปลงฟอร์แมตวันที่แบบยืดหยุ่น (เช่น 29/12/2025, 29-12-2025 ให้เป็น YYYY-MM-DD)
    const normalizeDate = (rawDate: string): string => {
      if (!rawDate) {
        return new Date().toISOString().split("T")[0]
      }
      
      const clean = rawDate.trim().replace(/^["']|["']$/g, "")
      // ถ้าเป็น YYYY-MM-DD อยู่แล้ว ให้ผ่านได้เลย
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        return clean
      }
      
      // ตัวแปรแยกด้วย / หรือ -
      const parts = clean.split(/[\/\-]/)
      if (parts.length === 3) {
        let day = parts[0]
        let month = parts[1]
        let year = parts[2]
        
        // ถ้ารูปแบบเป็นปีขึ้นก่อน (e.g. YYYY/MM/DD) ให้สลับ
        if (day.length === 4) {
          year = parts[0]
          month = parts[1]
          day = parts[2]
        }
        
        day = day.padStart(2, '0')
        month = month.padStart(2, '0')
        
        let yearNum = parseInt(year, 10)
        // กรณีผู้ใช้กรอกปีเป็น พ.ศ. (พุทธศักราช > 2400) ให้หักออก 543 เพื่อให้เป็น ค.ศ.
        if (yearNum > 2400) {
          yearNum -= 543
        }
        
        let yearStr = String(yearNum)
        if (yearStr.length === 2) {
          yearStr = "20" + yearStr
        }
        
        const formatted = `${yearStr}-${month}-${day}`
        const d = new Date(formatted)
        if (!isNaN(d.getTime())) {
          return formatted
        }
      }
      
      try {
        const d = new Date(clean)
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear()
          const m = String(d.getMonth() + 1).padStart(2, '0')
          const r = String(d.getDate()).padStart(2, '0')
          return `${y}-${m}-${r}`
        }
      } catch {}
      
      return new Date().toISOString().split("T")[0]
    }

    // 3. ตรวจสอบข้อมูลทีละบรรทัดอย่างละเอียด
    for (const tenant of tenants) {
      const lineNum = tenant.line_number
      const rawRoomNum = tenant.room_number?.toString()?.trim() || ""
      const rawName = tenant.tenant_name?.trim() || ""
      let rawPhone = tenant.phone?.toString()?.trim() || ""
      const rawLeaseStart = tenant.lease_start?.trim() || ""
      const leaseStart = normalizeDate(rawLeaseStart)

      // ถ้าเว้นว่างทั้งแถว ให้ข้ามไปได้
      if (!rawRoomNum && !rawName && !rawPhone) {
        continue
      }

      if (!rawRoomNum) {
        errors.push(`แถวที่ ${lineNum}: ไม่ระบุหมายเลขห้องพัก`)
        continue
      }

      if (!rawName) {
        errors.push(`แถวที่ ${lineNum} (ห้อง ${rawRoomNum}): ไม่ระบุชื่อผู้เช่า`)
        continue
      }

      // กู้คืนเบอร์โทรศัพท์ที่โดน Excel ตัดเลข 0 ไปเพื่อความถูกต้องสูงสุด (2nd layer)
      if (rawPhone) {
        rawPhone = rawPhone.replace(/^="?|"?$|^'|^"/g, "").replace(/\D/g, "")
        if (rawPhone.length === 9 && rawPhone[0] !== '0') {
          rawPhone = '0' + rawPhone
        }
      }

      const roomId = resolveRoomId(rawRoomNum, tenant.building_id)
      if (!roomId) {
        // ถ้าระบุอาคารมาแล้วยังหาไม่เจอ ต้องบอกให้ชัดว่าไม่เจอ "ในอาคารนั้น" ไม่ใช่ไม่เจอทั้งหอ
        // ไม่เช่นนั้นผู้ใช้จะงงว่าเห็นห้องนี้อยู่ในระบบชัด ๆ ทำไมบอกว่าไม่มี
        errors.push(
          tenant.building_id
            ? `แถวที่ ${lineNum}: ไม่พบห้องหมายเลข "${rawRoomNum}" ในอาคารที่เลือกไว้ กรุณาตรวจสอบว่าห้องนี้อยู่อาคารไหน หรือเพิ่มห้องเข้าระบบก่อน`
            : `แถวที่ ${lineNum}: ไม่พบห้องหมายเลข "${rawRoomNum}" ในระบบตึกนี้ กรุณาเพิ่มห้องนี้เข้าสู่ระบบก่อน`
        )
        continue
      }

      // คำนวณวันสิ้นสุดสัญญาอัตโนมัติจาก lease_start + lease_duration ของ Workspace
      const calculatedLeaseEnd = addMonths(leaseStart, leaseDuration)

      validTenantsToInsert.push({
        room_id: roomId,
        tenant_name: rawName,
        tenant_phone: rawPhone,
        line_user_id: null,
        lease_start: leaseStart,
        lease_end: calculatedLeaseEnd,
        workspace_id: workspaceId
      })
      roomIdsToUpdate.push(roomId)
    }

    // 4. หากมีข้อผิดพลาดแม้แต่จุดเดียว ให้ส่งรายการข้อผิดพลาดกลับไปชี้เป้าทันที (Atomic Transaction Safety)
    if (errors.length > 0) {
      return { success: false, errors }
    }

    if (validTenantsToInsert.length === 0) {
      return { success: false, error: "ไม่มีข้อมูลผู้เช่าที่สามารถบันทึกได้" }
    }

    // 5. บันทึกข้อมูลผู้เช่าลงตาราง Tenants
    const { data: insertedTenants, error: insertError } = await supabase
      .from("tenants")
      .insert(validTenantsToInsert)
      .select()

    if (insertError) {
      console.error("Error inserting tenants batch:", insertError)
      return { success: false, error: `เกิดข้อผิดพลาดในการบันทึกข้อมูลผู้เช่า: ${insertError.message}` }
    }

    // 6. อัปเดตห้องพักที่เกี่ยวข้องทั้งหมดให้สถานะเป็นมีผู้เช่า (occupied)
    const { error: updateRoomsError } = await supabase
      .from("rooms")
      .update({ status: "occupied" })
      .in("id", roomIdsToUpdate)

    if (updateRoomsError) {
      console.error("Error updating rooms status to occupied in batch:", updateRoomsError)
    }

    return { success: true, count: validTenantsToInsert.length }
  } catch (error: any) {
    console.error("Critical error in createTenantsBatch:", error)
    return { success: false, error: error?.message || "เกิดข้อผิดพลาดไม่คาดคิดในการบันทึกข้อมูล" }
  }
}





