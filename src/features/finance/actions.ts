"use server"

import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js"
import { DEFAULT_STAFF_PERMISSIONS, type StaffPermissions } from "@/features/permissions/types"
import { buildTaxSettingsPayload, type TaxSettingsUpdate } from "./tax-settings-payload"
import { uploadFileToGoogleDriveAction } from "@/lib/googleDrive"

// เพจที่เรียก saveFinanceSettings ใช้กันคนละสิทธิ์ staff แยกย่อย (ตั้งค่าการเงิน/ตั้งค่าหอพัก/ภาษี) —
// staff ที่ admin มอบสิทธิ์แก้ไขให้ในสามหน้านี้หน้าใดหน้าหนึ่งต้อง save ผ่านได้ ไม่ใช่แค่ role "admin" เท่านั้น
// (เดิมเช็คแค่ role ทำให้ staff ที่ได้รับสิทธิ์ access_tax_edit กด toggle ได้แต่ save ถูกปฏิเสธเงียบๆ ทุกครั้ง)
function hasStaffEditAccess(rawPermissions: unknown): boolean {
  let perms = rawPermissions
  if (typeof perms === "string") {
    try { perms = JSON.parse(perms) } catch { perms = null }
  }
  const userPerms: StaffPermissions = { ...DEFAULT_STAFF_PERMISSIONS, ...(perms as Partial<StaffPermissions> | null) }
  return !!(userPerms.manage_finance_settings_edit || userPerms.manage_property_settings_edit || userPerms.access_tax_edit)
}

// ระยะเวลาเก็บสลิปต้องเป็นค่าจำกัดเสมอ (ไม่มี "เก็บไว้ตลอดไป"/0 อีกต่อไป) จำกัดสูงสุดไม่เกิน 1 ปี
// ป้องกันชั้น server ไว้อีกชั้นแม้ dropdown ฝั่ง UI จะจำกัดตัวเลือกไว้แล้วก็ตาม
function clampSlipRetentionMonths(value: unknown): number {
  const num = Math.round(Number(value))
  if (!Number.isFinite(num) || num < 1) return 12
  return Math.min(num, 12)
}

export interface FinanceSettings {
  name?: string
  tax_firstname: string
  tax_lastname: string
  tax_id: string
  tax_address: string
  tax_phone: string
  promptpay_type: "phone" | "national_id"
  promptpay_id: string
  promptpay_name: string
  common_fee: number
  water_rate: number
  electric_rate: number
  water_min_checked: boolean
  water_min_unit: number
  electric_min_checked: boolean
  electric_min_unit: number
  late_penalty_rate: number
  deposit_amount?: number
  advance_rent?: number
  deposit_type?: "months" | "fixed"
  lease_duration?: number
  lease_expiry_action?: "renew" | "original"
  slip_retention_months?: number
  checkout_policy?: "DAILY_PRORATE" | "FULL_MONTH"
  logo_url?: string
  // โหมดคำนวณค่าน้ำ-ไฟ: fixed_rate = อัตราคงที่ต่อหน่วยที่ตั้งเอง (เดิม) | building_total = หารตามสัดส่วนยอดบิลจริงทั้งอาคาร (ตามกฎหมายใหม่)
  electric_billing_mode?: "fixed_rate" | "building_total"
  water_billing_mode?: "fixed_rate" | "building_total"
  // สถานภาพผู้เสียภาษี (กำหนดค่าลดหย่อนส่วนตัว ข.1 ของแบบฟอร์ม ภ.ง.ด. 90/94)
  taxpayer_status?: "individual" | "partnership"
  partner_count?: number
  // ภาษีมูลค่าเพิ่ม (VAT) — ดูฟีเจอร์ VAT + ภ.พ.30 ใน src/features/tax/
  vat_registered?: boolean
  vat_registered_from?: string | null
  vat_rate?: number
  vat_threshold?: number
  vat_opening_credit?: number
  expense_a_mode?: "lump" | "actual"
  expense_a_lump_rate?: number
  expense_b_mode?: "lump" | "actual"
  expense_b_lump_rate?: number
  cap_expense_per_bucket?: boolean
  min_tax_enabled?: boolean
  min_tax_rate?: number
  min_tax_threshold_pnd90?: number
  min_tax_threshold_pnd94?: number
  min_tax_exempt_below?: number
  // ที่อยู่แยกช่องย่อยเพิ่มเติม (นอกเหนือจาก เลขที่/ถนน/ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ที่รวมอยู่ใน tax_address)
  // ใช้กรอกช่อง อาคาร/ห้องเลขที่/ชั้นที่/หมู่บ้าน/หมู่ที่/ตรอกซอย/แยก ของแบบฟอร์ม ภ.ง.ด. 94 โดยเฉพาะ
  tax_address_building?: string
  tax_address_room?: string
  tax_address_floor?: string
  tax_address_village?: string
  tax_address_moo?: string
  tax_address_soi?: string
  tax_address_yaek?: string
}

/**
 * ดึงข้อมูลการตั้งค่าการเงินและพร้อมเพย์ของ Workspace ที่กำหนด
 */
export async function getFinanceSettings(workspaceId: string) {
  try {
    const supabase = await createClient()

    // แต่ละส่วนแยก query กันเพื่อความปลอดภัยกรณีคอลัมน์บางตัวยังไม่ถูกสร้างในบาง environment (เหมือนเดิม)
    // แต่ยิงทุก query พร้อมกันผ่าน Promise.all แทนการ await เรียงทีละตัว เพื่อไม่ให้ latency บวกสะสมเป็น 8 เท่า

    // 1. ข้อมูลส่วนข้อมูลหลัก (ที่รับประกันว่ามีอยู่ในตารางแน่ๆ)
    const fetchCore = async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("name, tax_firstname, tax_lastname, tax_id, tax_address, tax_phone, promptpay_type, promptpay_id, promptpay_name, common_fee")
        .eq("id", workspaceId)
        .single()
      if (error) throw error
      return data
    }

    // 2. ค่าน้ำค่าไฟเพิ่มเติม (ซึ่งอาจจะยังไม่ได้รัน SQL เพิ่มคอลัมน์)
    const fetchUtility = async (): Promise<any> => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("water_rate, electric_rate, water_min_checked, water_min_unit, electric_min_checked, electric_min_unit")
        .eq("id", workspaceId)
        .single()
      if (error) {
        console.warn("Utility columns (water_rate, etc.) not available yet in table workspaces. Using defaults.")
        return null
      }
      return data
    }

    // 3. ค่าปรับรายวัน (แยกการดึงข้อมูลเพื่อความปลอดภัยกรณีคอลัมน์ยังไม่ถูกสร้าง)
    const fetchLatePenalty = async (): Promise<number> => {
      try {
        const { data, error } = await supabase
          .from("workspaces")
          .select("late_penalty_rate")
          .eq("id", workspaceId)
          .single()
        if (!error && data) {
          return Number(data.late_penalty_rate || 0)
        }
      } catch (e) {
        console.warn("Column late_penalty_rate not available in workspaces. Defaulting to 0.")
      }
      return 0
    }

    // 4. เงินประกันและค่าเช่าล่วงหน้า (แยกการดึงเพื่อความปลอดภัย)
    const fetchDeposit = async (): Promise<{ depositAmount: number; advanceRent: number; depositType: "months" | "fixed" }> => {
      try {
        const { data: depData, error: depError } = await supabase
          .from("workspaces")
          .select("deposit_amount, advance_rent, deposit_type")
          .eq("id", workspaceId)
          .single()
        if (!depError && depData) {
          return {
            depositAmount: Number(depData.deposit_amount || 0),
            advanceRent: Number(depData.advance_rent || 0),
            depositType: (depData.deposit_type as "months" | "fixed") || "months"
          }
        }
        // หากมี error (เช่น คอลัมน์ deposit_type ยังไม่มี) ให้ลองดึงเฉพาะส่วนเงินประกันและค่าเช่าล่วงหน้า
        const { data: depDataNoType, error: depErrorNoType } = await supabase
          .from("workspaces")
          .select("deposit_amount, advance_rent")
          .eq("id", workspaceId)
          .single()
        if (!depErrorNoType && depDataNoType) {
          const depositAmount = Number(depDataNoType.deposit_amount || 0)
          return {
            depositAmount,
            advanceRent: Number(depDataNoType.advance_rent || 0),
            // Heuristics: ถ้าค่าเงินประกัน > 12 คาดการณ์ว่าเป็นแบบใส่ตัวเลขคงที่ (fixed)
            depositType: depositAmount > 12 ? "fixed" : "months"
          }
        }
      } catch (e) {
        console.warn("Column deposit_type or other deposit columns not available in workspaces. Defaulting.")
      }
      return { depositAmount: 0, advanceRent: 0, depositType: "months" }
    }

    // 5. ระยะเวลาสัญญาเช่าเริ่มต้นและสถานะเมื่อสัญญาหมดอายุ (แยกการดึงเพื่อความปลอดภัย)
    const fetchLease = async (): Promise<{ leaseDuration: number; leaseExpiryAction: "renew" | "original" }> => {
      try {
        const { data, error } = await supabase
          .from("workspaces")
          .select("lease_duration, lease_expiry_action")
          .eq("id", workspaceId)
          .single()
        if (!error && data) {
          return {
            leaseDuration: data.lease_duration !== null && data.lease_duration !== undefined ? Number(data.lease_duration) : 6,
            leaseExpiryAction: (data.lease_expiry_action as "renew" | "original") || "renew"
          }
        }
      } catch (e) {
        console.warn("Columns lease_duration or lease_expiry_action not available in workspaces. Defaulting.")
      }
      return { leaseDuration: 6, leaseExpiryAction: "renew" }
    }

    // 6. ระยะเวลาเก็บสลิปโอนเงิน (แยกดึงเพื่อความปลอดภัยกรณีคอลัมน์ยังไม่ติดตั้ง)
    const fetchSlipRetention = async (): Promise<number> => {
      try {
        const { data, error } = await supabase
          .from("workspaces")
          .select("slip_retention_months")
          .eq("id", workspaceId)
          .single()
        if (!error && data) {
          return Number(data.slip_retention_months || 0)
        }
      } catch (e) {
        console.warn("Column slip_retention_months not available in workspaces. Defaulting to 0.")
      }
      return 0
    }

    // 7. นโยบายหักเงินประกันวันย้ายออก (แยกการดึงเพื่อความปลอดภัย)
    const fetchCheckoutPolicy = async (): Promise<"DAILY_PRORATE" | "FULL_MONTH"> => {
      try {
        const { data, error } = await supabase
          .from("workspaces")
          .select("checkout_policy")
          .eq("id", workspaceId)
          .single()
        if (!error && data && data.checkout_policy) {
          return data.checkout_policy as "DAILY_PRORATE" | "FULL_MONTH"
        }
      } catch (e) {
        console.warn("Column checkout_policy not available in workspaces. Defaulting to DAILY_PRORATE.")
      }
      return "DAILY_PRORATE"
    }

    // 7.5 โหมดคำนวณค่าน้ำ-ไฟ (แยกการดึงเพื่อความปลอดภัยกรณีคอลัมน์ยังไม่ถูกสร้าง)
    const fetchBillingMode = async (): Promise<{ electricBillingMode: "fixed_rate" | "building_total"; waterBillingMode: "fixed_rate" | "building_total" }> => {
      try {
        const { data, error } = await supabase
          .from("workspaces")
          .select("electric_billing_mode, water_billing_mode")
          .eq("id", workspaceId)
          .single()
        if (!error && data) {
          return {
            electricBillingMode: (data.electric_billing_mode as "fixed_rate" | "building_total") || "fixed_rate",
            waterBillingMode: (data.water_billing_mode as "fixed_rate" | "building_total") || "fixed_rate"
          }
        }
      } catch (e) {
        console.warn("Columns electric_billing_mode/water_billing_mode not available in workspaces. Defaulting to fixed_rate.")
      }
      return { electricBillingMode: "fixed_rate", waterBillingMode: "fixed_rate" }
    }

    // 8. รูปภาพ Logo ของหอพัก (แยกดึงเพื่อความปลอดภัย)
    const fetchLogo = async (): Promise<string> => {
      try {
        const { data, error } = await supabase
          .from("workspaces")
          .select("logo_url")
          .eq("id", workspaceId)
          .single()
        if (!error && data) {
          return data.logo_url || ""
        }
      } catch (e) {
        console.warn("Column logo_url not available in workspaces. Defaulting to empty string.")
      }
      return ""
    }

    // 9. สถานภาพผู้เสียภาษี + ที่อยู่ช่องย่อยเพิ่มเติม (แยกดึงเพื่อความปลอดภัยกรณีคอลัมน์ยังไม่ติดตั้ง)
    const fetchTaxpayerStatus = async (): Promise<any> => {
      try {
        const { data, error } = await supabase
          .from("workspaces")
          .select("taxpayer_status, partner_count, tax_address_building, tax_address_room, tax_address_floor, tax_address_village, tax_address_moo, tax_address_soi, tax_address_yaek")
          .eq("id", workspaceId)
          .single()
        if (!error && data) return data
      } catch (e) {
        console.warn("Columns taxpayer_status/partner_count/tax_address_* not available in workspaces. Defaulting.")
      }
      return null
    }

    // 10. ตั้งค่า VAT + โหมดหักค่าใช้จ่าย + ภาษีขั้นต่ำ (แยกดึงเพื่อความปลอดภัยกรณีคอลัมน์ยังไม่ติดตั้ง — ดู database_patch_add_vat_pp30.sql)
    const fetchVatTaxSettings = async (): Promise<any> => {
      try {
        const { data, error } = await supabase
          .from("workspaces")
          .select("vat_registered, vat_registered_from, vat_rate, vat_threshold, vat_opening_credit, expense_a_mode, expense_a_lump_rate, expense_b_mode, expense_b_lump_rate, cap_expense_per_bucket, min_tax_enabled, min_tax_rate, min_tax_threshold_pnd90, min_tax_threshold_pnd94, min_tax_exempt_below")
          .eq("id", workspaceId)
          .single()
        if (!error && data) return data
      } catch (e) {
        console.warn("Columns vat_registered/expense_*_mode/min_tax_* not available in workspaces. Defaulting.")
      }
      return null
    }

    const [
      coreData,
      utilityData,
      latePenaltyRate,
      { depositAmount, advanceRent, depositType },
      { leaseDuration, leaseExpiryAction },
      slipRetentionMonths,
      checkoutPolicy,
      logoUrl,
      taxpayerStatusData,
      { electricBillingMode, waterBillingMode },
      vatTaxData
    ] = await Promise.all([
      fetchCore(),
      fetchUtility(),
      fetchLatePenalty(),
      fetchDeposit(),
      fetchLease(),
      fetchSlipRetention(),
      fetchCheckoutPolicy(),
      fetchLogo(),
      fetchTaxpayerStatus(),
      fetchBillingMode(),
      fetchVatTaxSettings()
    ])

    const merged = {
      ...coreData,
      ...(utilityData || {
        water_rate: 18,
        electric_rate: 7,
        water_min_checked: true,
        water_min_unit: 3,
        electric_min_checked: true,
        electric_min_unit: 10
      }),
      late_penalty_rate: latePenaltyRate,
      deposit_amount: depositAmount,
      advance_rent: advanceRent,
      deposit_type: depositType,
      lease_duration: leaseDuration,
      lease_expiry_action: leaseExpiryAction,
      slip_retention_months: slipRetentionMonths,
      checkout_policy: checkoutPolicy,
      electric_billing_mode: electricBillingMode,
      water_billing_mode: waterBillingMode
    }

    return { 
      success: true, 
      data: {
        name: merged.name || "",
        tax_firstname: merged.tax_firstname || "",
        tax_lastname: merged.tax_lastname || "",
        tax_id: merged.tax_id || "",
        tax_address: merged.tax_address || "",
        tax_phone: merged.tax_phone || "",
        promptpay_type: (merged.promptpay_type as "phone" | "national_id") || "phone",
        promptpay_id: merged.promptpay_id || "",
        promptpay_name: merged.promptpay_name || "",
        common_fee: Number(merged.common_fee || 50),
        water_rate: Number(merged.water_rate !== null && merged.water_rate !== undefined ? merged.water_rate : 18),
        electric_rate: Number(merged.electric_rate !== null && merged.electric_rate !== undefined ? merged.electric_rate : 7),
        water_min_checked: Boolean(merged.water_min_checked !== null && merged.water_min_checked !== undefined ? merged.water_min_checked : true),
        water_min_unit: Number(merged.water_min_unit !== null && merged.water_min_unit !== undefined ? merged.water_min_unit : 3),
        electric_min_checked: Boolean(merged.electric_min_checked !== null && merged.electric_min_checked !== undefined ? merged.electric_min_checked : true),
        electric_min_unit: Number(merged.electric_min_unit !== null && merged.electric_min_unit !== undefined ? merged.electric_min_unit : 10),
        late_penalty_rate: Number(merged.late_penalty_rate !== null && merged.late_penalty_rate !== undefined ? merged.late_penalty_rate : 0),
        deposit_amount: Number(merged.deposit_amount !== null && merged.deposit_amount !== undefined ? merged.deposit_amount : 0),
        advance_rent: Number(merged.advance_rent !== null && merged.advance_rent !== undefined ? merged.advance_rent : 0),
        deposit_type: merged.deposit_type as "months" | "fixed",
        lease_duration: Number(merged.lease_duration !== null && merged.lease_duration !== undefined ? merged.lease_duration : 6),
        lease_expiry_action: (merged.lease_expiry_action as "renew" | "original") || "renew",
        slip_retention_months: Number(merged.slip_retention_months !== null && merged.slip_retention_months !== undefined ? merged.slip_retention_months : 0),
        checkout_policy: merged.checkout_policy || "DAILY_PRORATE",
        electric_billing_mode: (merged.electric_billing_mode as "fixed_rate" | "building_total") || "fixed_rate",
        water_billing_mode: (merged.water_billing_mode as "fixed_rate" | "building_total") || "fixed_rate",
        logo_url: logoUrl,
        taxpayer_status: (taxpayerStatusData?.taxpayer_status as "individual" | "partnership") || "individual",
        partner_count: Number(taxpayerStatusData?.partner_count || 1),
        tax_address_building: taxpayerStatusData?.tax_address_building || "",
        tax_address_room: taxpayerStatusData?.tax_address_room || "",
        tax_address_floor: taxpayerStatusData?.tax_address_floor || "",
        tax_address_village: taxpayerStatusData?.tax_address_village || "",
        tax_address_moo: taxpayerStatusData?.tax_address_moo || "",
        tax_address_soi: taxpayerStatusData?.tax_address_soi || "",
        tax_address_yaek: taxpayerStatusData?.tax_address_yaek || "",
        vat_registered: Boolean(vatTaxData?.vat_registered ?? false),
        vat_registered_from: vatTaxData?.vat_registered_from ?? null,
        vat_rate: Number(vatTaxData?.vat_rate ?? 0.07),
        vat_threshold: Number(vatTaxData?.vat_threshold ?? 1800000),
        vat_opening_credit: Number(vatTaxData?.vat_opening_credit ?? 0),
        expense_a_mode: (vatTaxData?.expense_a_mode as "lump" | "actual") || "lump",
        expense_a_lump_rate: Number(vatTaxData?.expense_a_lump_rate ?? 0.3),
        expense_b_mode: (vatTaxData?.expense_b_mode as "lump" | "actual") || "lump",
        expense_b_lump_rate: Number(vatTaxData?.expense_b_lump_rate ?? 0.6),
        cap_expense_per_bucket: Boolean(vatTaxData?.cap_expense_per_bucket ?? false),
        min_tax_enabled: Boolean(vatTaxData?.min_tax_enabled ?? true),
        min_tax_rate: Number(vatTaxData?.min_tax_rate ?? 0.005),
        min_tax_threshold_pnd90: Number(vatTaxData?.min_tax_threshold_pnd90 ?? 120000),
        min_tax_threshold_pnd94: Number(vatTaxData?.min_tax_threshold_pnd94 ?? 60000),
        min_tax_exempt_below: Number(vatTaxData?.min_tax_exempt_below ?? 5000)
      } as FinanceSettings
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลการเงิน"
    return { success: false, error: errorMessage }
  }
}

/**
 * บันทึกการตั้งค่าการเงินและพร้อมเพย์ของ Workspace โดยจำกัดสิทธิ์เฉพาะ Admin ของ Workspace นั้นๆ เท่านั้น
 */
export async function saveFinanceSettings(workspaceId: string, settings: FinanceSettings) {
  try {
    const supabase = await createClient()

    // 1. ตรวจสอบสิทธิ์ผู้ใช้ปัจจุบัน (Authentication & Authorization)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "ไม่ได้เข้าสู่ระบบหรือเซสชันหมดอายุ" }
    }

    // ดึงโปรไฟล์ตรวจสอบสิทธิ์ว่าเป็น Admin หรือ Super Admin และตรงกับ workspace_id หรือไม่
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, workspace_id, permissions")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return { success: false, error: "ไม่พบข้อมูลสิทธิ์ผู้ใช้งาน" }
    }

    const isAdmin = profile.role === "admin" || profile.role === "super_admin"
    const isAuthorized = isAdmin || (profile.role === "staff" && hasStaffEditAccess(profile.permissions))
    const isSameWorkspace = profile.workspace_id === workspaceId || profile.role === "super_admin"

    if (!isAuthorized || !isSameWorkspace) {
      return { success: false, error: "ขออภัย คุณไม่มีสิทธิ์ในการจัดการข้อมูลส่วนนี้" }
    }

    // สิทธิ์ถูกตรวจสอบด้วยโค้ดข้างบนแล้ว (isAuthorized + isSameWorkspace) จึงเขียนข้อมูลด้วย Service Role Client แทน
    // client ปกติที่ผูกกับ RLS โดยตรง — เพราะ RLS policy เดิมของตาราง workspaces เช็คแค่ profiles.workspace_id
    // ตรงกับ id แถวเป๊ะๆ ซึ่งสำหรับ super_admin ที่ profiles.workspace_id เป็น NULL แล้ว จะไม่ match แถวไหนเลย
    // ทำให้ UPDATE จับคู่ได้ 0 แถวแบบเงียบๆ (ไม่ error) เหมือนบันทึกสำเร็จทั้งที่ไม่มีอะไรถูกเขียนจริง
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const dbClient = (serviceUrl && serviceKey && !serviceKey.includes("placeholder"))
      ? createSupabaseServiceClient(serviceUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : supabase

    // ฟิลด์หลักที่ทั้งสองหน้า (ตั้งค่าหอพัก / ตั้งค่าการเงินฯ) ส่งมาครบทุกครั้งเสมอ (บังคับ required ใน FinanceSettings)
    const corePayload: Record<string, any> = {
      tax_firstname: settings.tax_firstname.trim(),
      tax_lastname: settings.tax_lastname.trim(),
      tax_id: settings.tax_id.trim(),
      tax_address: settings.tax_address.trim(),
      tax_phone: settings.tax_phone.trim(),
      promptpay_type: settings.promptpay_type,
      promptpay_id: settings.promptpay_id.trim(),
      promptpay_name: settings.promptpay_name.trim(),
      common_fee: Number(settings.common_fee),
      water_rate: Number(settings.water_rate),
      electric_rate: Number(settings.electric_rate),
      water_min_checked: Boolean(settings.water_min_checked),
      water_min_unit: Number(settings.water_min_unit),
      electric_min_checked: Boolean(settings.electric_min_checked),
      electric_min_unit: Number(settings.electric_min_unit),
      late_penalty_rate: Number(settings.late_penalty_rate || 0),
    }

    // ฟิลด์ optional ที่หน้า "ตั้งค่าหอพัก" กับ "ตั้งค่าการเงินและบัญชีรับเงิน" แบ่งกันเป็นเจ้าของคนละส่วน
    // (เช่น lease_expiry_action เป็นของหน้าตั้งค่าหอพัก, tax_address_building เป็นของหน้าตั้งค่าการเงินฯ)
    // ใส่ลง payload เฉพาะตอนที่ผู้เรียกส่งค่ามาจริง (!== undefined) เท่านั้น ไม่งั้นหน้าที่ไม่มีฟิลด์นี้ในฟอร์ม
    // ของตัวเองจะเขียนทับด้วยค่า default แทนค่าจริงที่อีกหน้าหนึ่งเคยบันทึกไว้ (สาเหตุของบั๊กข้อมูลรีเซ็ตข้ามหน้า)
    const optionalPayload: Record<string, any> = {}
    if (settings.deposit_amount !== undefined) optionalPayload.deposit_amount = Number(settings.deposit_amount)
    if (settings.advance_rent !== undefined) optionalPayload.advance_rent = Number(settings.advance_rent)
    if (settings.deposit_type !== undefined) optionalPayload.deposit_type = settings.deposit_type
    if (settings.lease_duration !== undefined) optionalPayload.lease_duration = Number(settings.lease_duration)
    if (settings.lease_expiry_action !== undefined) optionalPayload.lease_expiry_action = settings.lease_expiry_action
    if (settings.slip_retention_months !== undefined) optionalPayload.slip_retention_months = clampSlipRetentionMonths(settings.slip_retention_months)
    if (settings.checkout_policy !== undefined) optionalPayload.checkout_policy = settings.checkout_policy
    if (settings.electric_billing_mode !== undefined) optionalPayload.electric_billing_mode = settings.electric_billing_mode
    if (settings.water_billing_mode !== undefined) optionalPayload.water_billing_mode = settings.water_billing_mode
    if (settings.taxpayer_status !== undefined) optionalPayload.taxpayer_status = settings.taxpayer_status
    if (settings.partner_count !== undefined) optionalPayload.partner_count = Number(settings.partner_count)
    if (settings.tax_address_building !== undefined) optionalPayload.tax_address_building = settings.tax_address_building.trim()
    if (settings.tax_address_room !== undefined) optionalPayload.tax_address_room = settings.tax_address_room.trim()
    if (settings.tax_address_floor !== undefined) optionalPayload.tax_address_floor = settings.tax_address_floor.trim()
    if (settings.tax_address_village !== undefined) optionalPayload.tax_address_village = settings.tax_address_village.trim()
    if (settings.tax_address_moo !== undefined) optionalPayload.tax_address_moo = settings.tax_address_moo.trim()
    if (settings.tax_address_soi !== undefined) optionalPayload.tax_address_soi = settings.tax_address_soi.trim()
    if (settings.tax_address_yaek !== undefined) optionalPayload.tax_address_yaek = settings.tax_address_yaek.trim()
    if (settings.vat_registered !== undefined) optionalPayload.vat_registered = Boolean(settings.vat_registered)
    if (settings.vat_registered_from !== undefined) optionalPayload.vat_registered_from = settings.vat_registered_from
    if (settings.vat_rate !== undefined) optionalPayload.vat_rate = Number(settings.vat_rate)
    if (settings.vat_threshold !== undefined) optionalPayload.vat_threshold = Number(settings.vat_threshold)
    if (settings.vat_opening_credit !== undefined) optionalPayload.vat_opening_credit = Number(settings.vat_opening_credit)
    if (settings.expense_a_mode !== undefined) optionalPayload.expense_a_mode = settings.expense_a_mode
    if (settings.expense_a_lump_rate !== undefined) optionalPayload.expense_a_lump_rate = Number(settings.expense_a_lump_rate)
    if (settings.expense_b_mode !== undefined) optionalPayload.expense_b_mode = settings.expense_b_mode
    if (settings.expense_b_lump_rate !== undefined) optionalPayload.expense_b_lump_rate = Number(settings.expense_b_lump_rate)
    if (settings.cap_expense_per_bucket !== undefined) optionalPayload.cap_expense_per_bucket = Boolean(settings.cap_expense_per_bucket)
    if (settings.min_tax_enabled !== undefined) optionalPayload.min_tax_enabled = Boolean(settings.min_tax_enabled)
    if (settings.min_tax_rate !== undefined) optionalPayload.min_tax_rate = Number(settings.min_tax_rate)
    if (settings.min_tax_threshold_pnd90 !== undefined) optionalPayload.min_tax_threshold_pnd90 = Number(settings.min_tax_threshold_pnd90)
    if (settings.min_tax_threshold_pnd94 !== undefined) optionalPayload.min_tax_threshold_pnd94 = Number(settings.min_tax_threshold_pnd94)
    if (settings.min_tax_exempt_below !== undefined) optionalPayload.min_tax_exempt_below = Number(settings.min_tax_exempt_below)

    const { data: updatedRows, error: updateError } = await dbClient
      .from("workspaces")
      .update({ ...corePayload, ...optionalPayload })
      .eq("id", workspaceId)
      .select("id")

    // Supabase/Postgres ไม่ throw error เมื่อ UPDATE จับคู่ได้ 0 แถว (เช่น ถูก RLS policy กรองทิ้งแบบเงียบๆ)
    // ต้องเช็คว่ามีแถวที่อัปเดตจริงกลับมาไหม ไม่งั้นจะรายงาน success ทั้งที่ไม่ได้บันทึกอะไรเลย
    if (!updateError && (!updatedRows || updatedRows.length === 0)) {
      return {
        success: false,
        error: "ไม่สามารถบันทึกข้อมูลได้ (ไม่พบสิทธิ์เข้าถึง workspace นี้ หรือถูกนโยบายความปลอดภัยของฐานข้อมูลปฏิเสธ) กรุณาติดต่อผู้ดูแลระบบ"
      }
    }

    if (updateError) {
      const isMissingColumn = 
        updateError.message.includes("column") || 
        updateError.code === "42703"

      if (isMissingColumn) {
        // หากคอลัมน์ deposit_type หรือ deposit_amount หรือ checkout_policy ยังไม่มี ให้บันทึกแบบจำกัดเท่าที่มี
        const { error: lpMissingError } = await dbClient
          .from("workspaces")
          .update({
            tax_firstname: settings.tax_firstname.trim(),
            tax_lastname: settings.tax_lastname.trim(),
            tax_id: settings.tax_id.trim(),
            tax_address: settings.tax_address.trim(),
            tax_phone: settings.tax_phone.trim(),
            promptpay_type: settings.promptpay_type,
            promptpay_id: settings.promptpay_id.trim(),
            promptpay_name: settings.promptpay_name.trim(),
            common_fee: Number(settings.common_fee),
            water_rate: Number(settings.water_rate),
            electric_rate: Number(settings.electric_rate),
            water_min_checked: Boolean(settings.water_min_checked),
            water_min_unit: Number(settings.water_min_unit),
            electric_min_checked: Boolean(settings.electric_min_checked),
            electric_min_unit: Number(settings.electric_min_unit),
            late_penalty_rate: Number(settings.late_penalty_rate || 0),
            deposit_amount: Number(settings.deposit_amount || 0),
            advance_rent: Number(settings.advance_rent || 0),
            lease_duration: Number(settings.lease_duration !== undefined ? settings.lease_duration : 6),
            lease_expiry_action: settings.lease_expiry_action || "renew",
            slip_retention_months: clampSlipRetentionMonths(settings.slip_retention_months)
          })
          .eq("id", workspaceId)

        if (lpMissingError) {
          // หากไม่มีคอลัมน์อื่นๆ อีก ให้ลดรูปบันทึกส่วนข้อมูลหลักที่รับประกันว่ามีแน่นอน
          const { error: coreUpdateError } = await dbClient
            .from("workspaces")
            .update({
              tax_firstname: settings.tax_firstname.trim(),
              tax_lastname: settings.tax_lastname.trim(),
              tax_id: settings.tax_id.trim(),
              tax_address: settings.tax_address.trim(),
              tax_phone: settings.tax_phone.trim(),
              promptpay_type: settings.promptpay_type,
              promptpay_id: settings.promptpay_id.trim(),
              promptpay_name: settings.promptpay_name.trim(),
              common_fee: Number(settings.common_fee)
            })
            .eq("id", workspaceId)

          if (coreUpdateError) {
            throw coreUpdateError
          }
        }

        return {
          success: true,
          fallback: true,
          message: "บันทึกข้อมูลเรียบร้อยแล้ว! (มีบางคอลัมน์เพิ่มเติม เช่น เงินประกัน/ค่าเช่าล่วงหน้า ยังไม่ได้ติดตั้งลงในฐานข้อมูลระบบคลาวด์ของคุณ)"
        }
      }
      throw updateError
    }

    return { success: true, message: "บันทึกข้อมูลเข้าฐานข้อมูลเรียบร้อยแล้ว!" }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูลการเงิน"
    return { success: false, error: errorMessage }
  }
}

async function getWorkspaceAdminClient(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false as const, error: "ไม่ได้เข้าสู่ระบบหรือเซสชันหมดอายุ" }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, workspace_id")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    return { success: false as const, error: "ไม่พบข้อมูลสิทธิ์ผู้ใช้งาน" }
  }

  const isAdmin = profile.role === "admin" || profile.role === "super_admin"
  const isSameWorkspace = profile.workspace_id === workspaceId || profile.role === "super_admin"
  if (!isAdmin || !isSameWorkspace) {
    return { success: false as const, error: "ขออภัย คุณไม่มีสิทธิ์ (Workspace Admin) ในการจัดการข้อมูลส่วนนี้" }
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const client = serviceUrl && serviceKey && !serviceKey.includes("placeholder")
    ? createSupabaseServiceClient(serviceUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : supabase

  return { success: true as const, client }
}

export async function getSlipRetentionMonthsAction(workspaceId: string) {
  try {
    const access = await getWorkspaceAdminClient(workspaceId)
    if (!access.success) return access

    const { data, error } = await access.client
      .from("workspaces")
      .select("slip_retention_months")
      .eq("id", workspaceId)
      .single()

    if (error || !data) {
      return { success: false as const, error: error?.message || "ไม่พบข้อมูลการตั้งค่าการเก็บสลิป" }
    }

    return {
      success: true as const,
      months: clampSlipRetentionMonths(data.slip_retention_months)
    }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลดการตั้งค่าการเก็บสลิป"
    }
  }
}

export async function saveSlipRetentionMonthsAction(workspaceId: string, months: number) {
  try {
    const access = await getWorkspaceAdminClient(workspaceId)
    if (!access.success) return access

    const normalizedMonths = clampSlipRetentionMonths(months)
    const { data, error } = await access.client
      .from("workspaces")
      .update({ slip_retention_months: normalizedMonths })
      .eq("id", workspaceId)
      .select("id")
      .single()

    if (error || !data) {
      return { success: false as const, error: error?.message || "ไม่สามารถบันทึกระยะเวลาการเก็บสลิปได้" }
    }

    return { success: true as const, months: normalizedMonths }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกระยะเวลาการเก็บสลิป"
    }
  }
}

/**
 * Save only settings owned by the tax page.
 *
 * Do not route this through saveFinanceSettings: that action intentionally
 * updates the finance form's required fields, including PromptPay details.
 */
export async function saveTaxSettings(workspaceId: string, settings: TaxSettingsUpdate) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "ไม่ได้เข้าสู่ระบบหรือเซสชันหมดอายุ" }
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, workspace_id, permissions")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return { success: false, error: "ไม่พบข้อมูลสิทธิ์ผู้ใช้งาน" }
    }

    let rawPermissions = profile.permissions
    if (typeof rawPermissions === "string") {
      try { rawPermissions = JSON.parse(rawPermissions) } catch { rawPermissions = null }
    }
    const permissions: StaffPermissions = {
      ...DEFAULT_STAFF_PERMISSIONS,
      ...(rawPermissions as Partial<StaffPermissions> | null),
    }
    const canEditTax = profile.role === "admin"
      || profile.role === "super_admin"
      || (profile.role === "staff" && permissions.access_tax_edit)
    const isSameWorkspace = profile.workspace_id === workspaceId || profile.role === "super_admin"

    if (!canEditTax || !isSameWorkspace) {
      return { success: false, error: "ขออภัย คุณไม่มีสิทธิ์แก้ไขการตั้งค่าภาษีของ workspace นี้" }
    }

    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const dbClient = (serviceUrl && serviceKey && !serviceKey.includes("placeholder"))
      ? createSupabaseServiceClient(serviceUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : supabase

    const taxPayload = buildTaxSettingsPayload(settings)
    const { data: updatedRows, error: updateError } = await dbClient
      .from("workspaces")
      .update(taxPayload)
      .eq("id", workspaceId)
      .select("id")

    if (updateError) throw updateError
    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: "ไม่สามารถบันทึกการตั้งค่าภาษีของ workspace นี้ได้" }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกการตั้งค่าภาษี",
    }
  }
}

/**
 * ดำเนินการลบรูปภาพสลิปที่หมดอายุสำหรับ Workspace ที่กำหนด
 */
export async function cleanupExpiredSlipsAction(workspaceId: string) {
  try {
    const access = await getWorkspaceAdminClient(workspaceId)
    if (!access.success) return access

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey || serviceKey.includes("placeholder")) {
      return { success: false, error: "ระบบฐานข้อมูลหรือคีย์เชื่อมต่อเซิร์ฟเวอร์ไม่พร้อมใช้งาน" }
    }

    // สร้าง Admin Client ด้วย Service Role Key เพื่อลบรูปใน Storage และอัปเดตบิลได้โดยตรง
    const supabaseAdmin = createSupabaseServiceClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 1. ดึงค่า retention และตรวจว่า workspace เชื่อมต่อ Google Drive หรือไม่
    const { data: wsData, error: wsError } = await supabaseAdmin
      .from("workspaces")
      .select("slip_retention_months")
      .eq("id", workspaceId)
      .single()

    if (wsError || !wsData) {
      return { success: false, error: "ไม่พบข้อมูลการตั้งค่าอพาร์ทเมนท์" }
    }

    const retentionMonths = Number(wsData.slip_retention_months || 0)
    if (retentionMonths <= 0) {
      return { success: true, count: 0, archiveFailedCount: 0, googleDriveConnected: false }
    }

    const { data: driveSettings, error: driveSettingsError } = await supabaseAdmin
      .from("workspace_google_drive_settings")
      .select("refresh_token")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (driveSettingsError) {
      throw driveSettingsError
    }

    const googleDriveConnected = !!driveSettings?.refresh_token

    // 2. ค้นหารายการบิลที่มี slip_url และอายุเกินกว่าระยะเวลาที่กำหนด
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths)
    const cutoffIso = cutoffDate.toISOString()

    const { data: expiredBills, error: billsError } = await supabaseAdmin
      .from("bills")
      .select("id, slip_url, created_at")
      .eq("workspace_id", workspaceId)
      .not("slip_url", "is", null)
      .lt("created_at", cutoffIso)

    if (billsError) {
      throw billsError
    }

    if (!expiredBills || expiredBills.length === 0) {
      return { success: true, count: 0, archiveFailedCount: 0, googleDriveConnected }
    }

    // 3. ถ้าเชื่อมต่อ Drive ต้อง archive สำเร็จก่อนจึงจะนำไฟล์นั้นเข้าคิวลบ
    const pathsToDelete: string[] = []
    const billIdsToUpdate: string[] = []
    let archiveFailedCount = 0

    async function prepareExpiredBill(bill: { id: string; slip_url: string | null; created_at: string }) {
      if (!bill.slip_url) return null

      if (googleDriveConnected) {
        try {
          const fileRes = await fetch(bill.slip_url)
          if (!fileRes.ok) {
            archiveFailedCount++
            return null
          }

          const fileBuffer = Buffer.from(await fileRes.arrayBuffer())
          const contentType = fileRes.headers.get("content-type") || "image/jpeg"
          const urlPath = new URL(bill.slip_url).pathname
          const extMatch = urlPath.match(/\.[a-zA-Z0-9]+$/)
          const extension = extMatch ? extMatch[0] : contentType.includes("png") ? ".png" : ".jpg"
          const billDate = new Date(bill.created_at)
          const monthFolder = `${billDate.getFullYear()}-${String(billDate.getMonth() + 1).padStart(2, "0")}`
          const uploadResult = await uploadFileToGoogleDriveAction(
            fileBuffer,
            `rent-slip-${bill.id}${extension}`,
            contentType,
            monthFolder,
            workspaceId
          )

          if (!uploadResult.success) {
            archiveFailedCount++
            return null
          }
        } catch (archiveError) {
          console.error(`Manual cleanup could not archive bill ${bill.id}:`, archiveError)
          archiveFailedCount++
          return null
        }
      }

      const marker = "/payment-slips/"
      const markerIndex = bill.slip_url.indexOf(marker)
      if (markerIndex === -1) return null
      const path = bill.slip_url.substring(markerIndex + marker.length)
      return path ? { path, billId: bill.id } : null
    }

    const archiveConcurrency = 3
    for (let index = 0; index < expiredBills.length; index += archiveConcurrency) {
      const chunk = expiredBills.slice(index, index + archiveConcurrency)
      const prepared = await Promise.all(chunk.map(prepareExpiredBill))
      for (const item of prepared) {
        if (item) {
          pathsToDelete.push(item.path)
          billIdsToUpdate.push(item.billId)
        }
      }
    }

    let deletedCount = 0

    // 4. ลบเฉพาะไฟล์ที่ archive สำเร็จแล้ว หรือไฟล์ของ workspace ที่ไม่ได้เชื่อมต่อ Drive
    if (pathsToDelete.length > 0) {
      const { data: deleteData, error: deleteStorageError } = await supabaseAdmin
        .storage
        .from("payment-slips")
        .remove(pathsToDelete)

      if (deleteStorageError) {
        throw deleteStorageError
      }
      deletedCount = deleteData?.length || 0

      // 5. ล้าง URL หลัง Storage ยืนยันว่าการลบสำเร็จเท่านั้น
      const { error: dbUpdateError } = await supabaseAdmin
        .from("bills")
        .update({ slip_url: null })
        .in("id", billIdsToUpdate)

      if (dbUpdateError) {
        throw dbUpdateError
      }
    }

    return { 
      success: true, 
      count: deletedCount,
      archiveFailedCount,
      googleDriveConnected
    }
  } catch (err: unknown) {
    console.error("Cleanup expired slips error:", err)
    const errMsg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการล้างไฟล์สลิป"
    return { success: false, error: errMsg }
  }
}

/**
 * บันทึก URL รูป Logo ของหอพักลงในตาราง workspaces
 */
export async function savePropertyLogoUrl(workspaceId: string, logoUrl: string) {
  try {
    const supabase = await createClient()

    // 1. ตรวจสอบสิทธิ์ผู้ใช้
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "ไม่ได้เข้าสู่ระบบหรือเซสชันหมดอายุ" }
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, workspace_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return { success: false, error: "ไม่พบข้อมูลสิทธิ์ผู้ใช้งาน" }
    }

    const isAdmin = profile.role === "admin" || profile.role === "super_admin"
    const isSameWorkspace = profile.workspace_id === workspaceId || profile.role === "super_admin"

    if (!isAdmin || !isSameWorkspace) {
      return { success: false, error: "ขออภัย คุณไม่มีสิทธิ์ (Workspace Admin) ในการจัดการข้อมูลส่วนนี้" }
    }

    // สิทธิ์ตรวจสอบด้วยโค้ดข้างบนแล้ว เขียนด้วย Service Role Client แทน (ดูเหตุผลเดียวกับ saveFinanceSettings)
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const dbClient = (serviceUrl && serviceKey && !serviceKey.includes("placeholder"))
      ? createSupabaseServiceClient(serviceUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : supabase

    // 2. อัปเดตคอลัมน์ logo_url
    const { data: updatedRows, error: updateError } = await dbClient
      .from("workspaces")
      .update({ logo_url: logoUrl })
      .eq("id", workspaceId)
      .select("id")

    if (!updateError && (!updatedRows || updatedRows.length === 0)) {
      return { success: false, error: "ไม่สามารถบันทึกโลโก้ได้ (ไม่พบสิทธิ์เข้าถึง workspace นี้) กรุณาติดต่อผู้ดูแลระบบ" }
    }

    if (updateError) {
      // ตรวจสอบว่าเกิดจากไม่มีคอลัมน์ logo_url หรือไม่
      if (updateError.code === "42703" || updateError.message.includes("logo_url")) {
        return {
          success: false,
          error: "ตารางฐานข้อมูลไม่มีคอลัมน์ logo_url กรุณาติดต่อผู้พัฒนา หรือติดตั้ง SQL Patch (schema_multi_workspace.sql) ในระบบหลังบ้าน"
        }
      }
      throw updateError
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกภาพ Logo"
    return { success: false, error: errorMessage }
  }
}

