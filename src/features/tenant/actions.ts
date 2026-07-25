"use server"

import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import crypto from "crypto"
import { calculateLateDays } from "@/features/billing/utils"
import { calculateDepositProration } from "@/features/room/deposit-calculator"
import { getFinanceSettings } from "@/features/finance/actions"

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
        id,
        tenant_name,
        tenant_phone,
        line_user_id,
        lease_start,
        lease_end,
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
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const workspaceId = await getCurrentWorkspaceId()
    if (workspaceId) await assertSubscriptionActive(workspaceId)

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

    // 4. ค้นหาห้องและตั้งค่าเป็นว่าง (available)
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


export async function getOldTenants() {
  if (!isSupabaseConfigured) {
    return { success: false, fallback: true, data: [] }
  }

  try {
    const supabase = await createClient()

    // จำกัดประวัติผู้เช่าเก่าไว้แค่ 365 วันล่าสุด เพื่อไม่ให้ query ช้าลงเรื่อยๆ ตามอายุการใช้งานของหอ
    const cutoffDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from("tenants_old")
      .select("id, tenant_id, room_number, tenant_name, tenant_phone, line_user_id, lease_start, lease_end, moved_out_at")
      .gte("moved_out_at", cutoffDate)
      .order("moved_out_at", { ascending: false })

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
  roomNumber: string,
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

    let latePenaltyRate = 0
    let workspaceLogo = ""
    if (tenant && tenant.workspace_id) {
      // logo_url และ late_penalty_rate เป็นคอลัมน์ในตาราง workspaces ตั้งแต่ base schema (schema_multi_workspace.sql)
      // จึงรวมเข้ากับ query หลักได้โดยไม่ต้องแยกยิงซ้ำเพื่อความปลอดภัยแบบเดิมอีกต่อไป
      const { data: ws } = await supabase
        .from("workspaces")
        .select("name, promptpay_id, promptpay_name, tax_address, tax_phone, tax_id, common_fee, water_rate, electric_rate, water_min_checked, water_min_unit, electric_min_checked, electric_min_unit, logo_url, late_penalty_rate")
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
            otherServiceAmount: b.other_service_amount !== null && b.other_service_amount !== undefined ? Number(b.other_service_amount) : 0,
            invoiceId: b.invoice_id
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
      .select("id, base_rent, waive_electric_min, waive_water_min, extra_expenses, room_types(default_rent)")
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
    // logo_url และ late_penalty_rate เป็นคอลัมน์ในตาราง workspaces ตั้งแต่ base schema (schema_multi_workspace.sql)
    // จึงรวมเข้ากับ query หลักได้โดยไม่ต้องแยกยิงซ้ำเพื่อความปลอดภัยแบบเดิมอีกต่อไป
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name, promptpay_id, promptpay_name, tax_address, tax_phone, tax_id, common_fee, water_rate, electric_rate, water_min_checked, water_min_unit, electric_min_checked, electric_min_unit, logo_url, late_penalty_rate")
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
          otherServiceAmount: b.other_service_amount !== null && b.other_service_amount !== undefined ? Number(b.other_service_amount) : 0,
          invoiceId: b.invoice_id
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
        waiveElectricMin: room.waive_electric_min,
        waiveWaterMin: room.waive_water_min,
        extraExpenses: room.extra_expenses || [],
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
      .select("id, room_number")
      .eq("workspace_id", workspaceId)

    if (roomsError) {
      console.error("Error fetching rooms in createTenantsBatch:", roomsError)
      return { success: false, error: "ไม่สามารถดึงข้อมูลห้องพักเพื่อตรวจสอบได้" }
    }

    const roomMap = new Map<string, string>()
    dbRooms?.forEach(r => {
      roomMap.set(r.room_number.trim().toLowerCase(), r.id)
    })

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

      const roomId = roomMap.get(rawRoomNum.toLowerCase())
      if (!roomId) {
        errors.push(`แถวที่ ${lineNum}: ไม่พบห้องหมายเลข "${rawRoomNum}" ในระบบตึกนี้ กรุณาเพิ่มห้องนี้เข้าสู่ระบบก่อน`)
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





