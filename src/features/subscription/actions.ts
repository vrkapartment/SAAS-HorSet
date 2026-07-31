"use server"

import { createClient } from "@/lib/supabase/server"
import { decryptText } from "@/lib/encryption"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { sendLineSuperAdminNotificationAction } from "@/features/notification/actions"
import { SLIPOK_RETRYABLE_ERROR_CODES, SLIPOK_ERROR_MESSAGES } from "@/features/slipok/constants"

// ใช้ Service Role Client เมื่อมี Env พร้อม เพื่อให้ฟังก์ชันกลุ่มนี้เรียกได้จากทุกที่ (Cron Job)
// ที่ไม่มี session คุกกี้ของผู้ใช้ให้ RLS ตรวจสอบ เช่นเดียวกับ pattern ใน features/slipok/actions.ts
async function getServiceRoleOrSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && serviceKey && !serviceKey.includes("placeholder")) {
    const { createClient: createSupabaseClient } = await import("@supabase/supabase-js")
    return createSupabaseClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  }
  return await createClient()
}

// รหัส Postgres error เมื่อยังไม่มีตาราง (เช่น ยังไม่ได้รัน schema_multi_workspace.sql)
const RELATION_MISSING_CODE = "42P01"

export interface SaasPlan {
  id: string
  code: "trial" | "starter" | "pro" | "business"
  name: string
  priceMonthly: number
  priceYearly: number | null
  maxRooms: number | null
  maxStaff: number | null
  maxBuildings: number | null
  features: { line_notify?: boolean; tax_export?: boolean; slipok_auto_verify?: boolean }
  isActive: boolean
}

function mapPlanRow(row: Record<string, unknown>): SaasPlan {
  return {
    id: row.id as string,
    code: row.code as SaasPlan["code"],
    name: row.name as string,
    priceMonthly: Number(row.price_monthly),
    priceYearly: row.price_yearly === null ? null : Number(row.price_yearly),
    maxRooms: row.max_rooms === null ? null : Number(row.max_rooms),
    maxStaff: row.max_staff === null ? null : Number(row.max_staff),
    maxBuildings: row.max_buildings === null ? null : Number(row.max_buildings),
    features: (row.features as SaasPlan["features"]) || {},
    isActive: row.is_active !== false
  }
}

/**
 * ดึงแผนการใช้งานทั้งหมดที่เปิดขาย สำหรับหน้าราคา (Pricing Page)
 */
export async function listSaasPlans() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("saas_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_monthly", { ascending: true })

    if (error) {
      if (error.code === RELATION_MISSING_CODE) return { success: true, data: [] as SaasPlan[] }
      throw error
    }

    return { success: true, data: (data || []).map(mapPlanRow) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลแผนการใช้งาน" }
  }
}

export interface WorkspaceSubscriptionView {
  status: "trial" | "active" | "past_due" | "read_only" | "cancelled"
  billingCycle: "monthly" | "yearly"
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  plan: SaasPlan | null
  usage: { rooms: number; staff: number; buildings: number }
}

async function getWorkspaceUsage(workspaceId: string) {
  const supabase = await createClient()
  const [{ count: rooms }, { count: staff }, { count: buildings }] = await Promise.all([
    supabase.from("rooms").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("role", "staff"),
    supabase.from("buildings").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId)
  ])
  return { rooms: rooms || 0, staff: staff || 0, buildings: buildings || 0 }
}

/**
 * ดึงสถานะ/แผนปัจจุบันของ workspace หนึ่งๆ
 * หมายเหตุ: ถ้ายังไม่มี migration หรือยังไม่มีแถว subscription เลย ให้ถือว่าใช้งานได้ปกติ (fail-open)
 * เพื่อไม่ให้ระบบเดิมพังก่อนที่แอดมินจะรัน schema_multi_workspace.sql
 */
export async function getWorkspaceSubscription(workspaceId: string): Promise<{ success: boolean; data?: WorkspaceSubscriptionView; error?: string }> {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("workspace_subscriptions")
      .select("status, billing_cycle, trial_ends_at, current_period_end, saas_plans (*)")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    const emptyUsage = { rooms: 0, staff: 0, buildings: 0 }

    if (error) {
      if (error.code === RELATION_MISSING_CODE) {
        return { success: true, data: { status: "active", billingCycle: "monthly", trialEndsAt: null, currentPeriodEnd: null, plan: null, usage: emptyUsage } }
      }
      throw error
    }

    if (!data) {
      return { success: true, data: { status: "active", billingCycle: "monthly", trialEndsAt: null, currentPeriodEnd: null, plan: null, usage: emptyUsage } }
    }

    const planRow = Array.isArray(data.saas_plans) ? data.saas_plans[0] : data.saas_plans

    let usage = emptyUsage
    try {
      usage = await getWorkspaceUsage(workspaceId)
    } catch {
      // ถ้านับ usage ไม่ได้ (เช่น ยังไม่มีตาราง buildings) ให้ใช้ค่าว่างไปก่อน ไม่บล็อกการแสดงผลสถานะแผน
    }

    return {
      success: true,
      data: {
        status: data.status,
        billingCycle: data.billing_cycle,
        trialEndsAt: data.trial_ends_at,
        currentPeriodEnd: data.current_period_end,
        plan: planRow ? mapPlanRow(planRow as Record<string, unknown>) : null,
        usage
      }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลแผนการใช้งานของหอพัก" }
  }
}

/**
 * ดึง workspace_id ของผู้ใช้ที่ล็อกอินอยู่ปัจจุบัน ใช้เป็น shortcut ให้ Server Action อื่น
 * ที่ไม่ได้รับ workspaceId มาจาก client (เช่น createRoom) เรียกเช็คสิทธิ์/โควตาได้โดยไม่ต้องแก้ signature เดิม
 */
export async function getCurrentWorkspaceId(): Promise<string | null> {
  const profileRes = await getCurrentUserProfileAction()
  if (!profileRes.success) return null
  return (profileRes.data as { workspace_id?: string | null } | undefined)?.workspace_id || null
}

/**
 * บล็อกการสร้าง/แก้ไข/ลบข้อมูล เมื่อ workspace อยู่ในสถานะ read_only หรือ cancelled
 * ให้ทุก Server Action ที่เป็น mutation (สร้างห้อง, สร้างบิล, จดมิเตอร์ ฯลฯ) เรียกที่ต้นฟังก์ชันเสมอ
 */
export async function assertSubscriptionActive(workspaceId: string): Promise<void> {
  if (!workspaceId) return

  // ใช้ getServiceRoleOrSessionClient (ไม่ใช่ createClient ตรงๆ) เพราะฟังก์ชันนี้ถูกเรียกจาก
  // route สาธารณะที่ไม่มี session คุกกี้ด้วย (เช่น api/register-tenant) ถ้าใช้ session client เฉยๆ
  // RLS จะกรองไม่เจอแถวเลยเมื่อไม่มีผู้ใช้ login ทำให้ fail-open และข้าม guard ไปโดยไม่ได้ตั้งใจ
  const supabase = await getServiceRoleOrSessionClient()
  const { data, error } = await supabase
    .from("workspace_subscriptions")
    .select("status")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  // ยังไม่มี migration หรือยังไม่มีแถว -> ไม่บล็อก (fail-open)
  if (error?.code === RELATION_MISSING_CODE || !data) return

  if (data.status === "read_only") {
    throw new Error("ระยะเวลาทดลองใช้งานหรือรอบบิลของหอพักนี้สิ้นสุดแล้ว กรุณาชำระค่าบริการเพื่อกลับมาใช้งานได้ตามปกติ (ขณะนี้ดูข้อมูลได้อย่างเดียว)")
  }
  // หมายเหตุ: status "cancelled" ตั้งใจไม่บล็อกที่นี่ — บัญชีที่ยกเลิกยังใช้งานได้ตามปกติจนถึงวันหมดอายุ
  // ปัจจุบัน (current_period_end/trial_ends_at) เดิม แล้วค่อยถูก cron เปลี่ยนเป็น read_only เมื่อครบกำหนดจริง
}

const QUOTA_LABELS: Record<"rooms" | "staff" | "buildings", string> = {
  rooms: "จำนวนห้องพัก",
  staff: "จำนวนบัญชี Staff",
  buildings: "จำนวนอาคาร"
}

/**
 * เช็คโควตาก่อนสร้างทรัพยากรใหม่ (ห้องพัก/staff/อาคาร) เทียบกับแผนปัจจุบันของ workspace
 * ให้ Server Action ที่ insert ทรัพยากรเหล่านี้เรียกก่อน insert เสมอ
 */
export async function checkWorkspaceQuota(workspaceId: string, resource: "rooms" | "staff" | "buildings"): Promise<void> {
  if (!workspaceId) return

  const supabase = await createClient()
  const { data: sub, error: subError } = await supabase
    .from("workspace_subscriptions")
    .select("saas_plans (max_rooms, max_staff, max_buildings, name)")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  // ยังไม่มี migration หรือยังไม่มีแถว -> ไม่จำกัด (fail-open)
  if (subError?.code === RELATION_MISSING_CODE || !sub) return

  const planRow = Array.isArray(sub.saas_plans) ? sub.saas_plans[0] : sub.saas_plans
  if (!planRow) return

  const limitKey = resource === "rooms" ? "max_rooms" : resource === "staff" ? "max_staff" : "max_buildings"
  const limit = (planRow as Record<string, unknown>)[limitKey] as number | null
  if (limit === null || limit === undefined) return // ไม่จำกัด

  let currentCount = 0
  if (resource === "rooms") {
    const { count } = await supabase.from("rooms").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId)
    currentCount = count || 0
  } else if (resource === "staff") {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("role", "staff")
    currentCount = count || 0
  } else {
    const { count } = await supabase.from("buildings").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId)
    currentCount = count || 0
  }

  if (currentCount >= limit) {
    const planName = (planRow as Record<string, unknown>).name as string
    throw new Error(
      `แผน "${planName}" ของคุณรองรับ${QUOTA_LABELS[resource]}สูงสุด ${limit} รายการ (ปัจจุบันใช้ครบแล้ว) กรุณาอัปเกรดแผนเพื่อเพิ่มโควตา`
    )
  }
}

const FEATURE_LABELS: Record<keyof SaasPlan["features"], string> = {
  tax_export: "ส่งออกรายงานภาษี (PDF/CSV)",
  line_notify: "แจ้งเตือนผ่าน LINE",
  slipok_auto_verify: "ตรวจสอบสลิปอัตโนมัติ (SlipOK)"
}

/**
 * อ่าน saas_plans.features ของแผนปัจจุบันของ workspace (jsonb ที่ Super Admin ตั้งค่าไว้จริงในหน้าจัดการแผน
 * ไม่ hardcode รายชื่อแผน) — fail-open (ถือว่าเปิดใช้ได้) เมื่อยังไม่มี migration/แถว subscription/ยังไม่ผูกแผน
 * เพื่อไม่ให้ระบบเดิมพังก่อนตั้งค่า เช่นเดียวกับ pattern ของ checkWorkspaceQuota/assertSubscriptionActive ด้านบน
 */
async function getWorkspacePlanFeatureState(
  workspaceId: string,
  feature: keyof SaasPlan["features"]
): Promise<{ enabled: boolean; planName: string | null }> {
  if (!workspaceId) return { enabled: true, planName: null }

  const supabase = await getServiceRoleOrSessionClient()
  const { data: sub, error } = await supabase
    .from("workspace_subscriptions")
    .select("saas_plans (features, name)")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error?.code === RELATION_MISSING_CODE || !sub) return { enabled: true, planName: null }

  const planRow = Array.isArray(sub.saas_plans) ? sub.saas_plans[0] : sub.saas_plans
  if (!planRow) return { enabled: true, planName: null }

  const features = (planRow as Record<string, unknown>).features as SaasPlan["features"] | null | undefined
  const planName = (planRow as Record<string, unknown>).name as string
  return { enabled: !!features?.[feature], planName }
}

/**
 * ใช้เช็คแบบ boolean เมื่อ Server Action ต้องการ "ทางเลือกสำรอง" แทนที่จะบล็อกด้วย error
 * (เช่น isSlipOkReadyForAutoVerify ที่ใช้ตัดสินใจว่าจะลองตรวจสลิปอัตโนมัติหรือข้ามไปเฉยๆ)
 */
export async function isWorkspaceFeatureEnabled(workspaceId: string, feature: keyof SaasPlan["features"]): Promise<boolean> {
  const { enabled } = await getWorkspacePlanFeatureState(workspaceId, feature)
  return enabled
}

/**
 * บล็อกการใช้ฟีเจอร์ที่แผนปัจจุบันของ workspace ไม่รองรับ ให้ Server Action ที่ทำงานเฉพาะฟีเจอร์นั้น
 * (ส่งออกรายงานภาษี, แจ้งเตือน LINE, ตรวจสลิปอัตโนมัติ) เรียกก่อนเริ่มทำงานเสมอ
 */
export async function assertWorkspaceFeatureEnabled(workspaceId: string, feature: keyof SaasPlan["features"]): Promise<void> {
  const { enabled, planName } = await getWorkspacePlanFeatureState(workspaceId, feature)
  if (enabled) return

  throw new Error(
    `แผน${planName ? ` "${planName}"` : ""}ของคุณไม่รองรับฟีเจอร์${FEATURE_LABELS[feature]} กรุณาอัปเกรดแผนเพื่อใช้งานฟีเจอร์นี้`
  )
}

// ---------------------------------------------------------------------------
// HorSet's own SlipOK/PromptPay credentials (เก็บใน system_settings แยกจากของแต่ละ workspace)
// ---------------------------------------------------------------------------

const SETTINGS_KEYS = {
  branchId: "HORSET_SLIPOK_BRANCH_ID",
  apiKey: "HORSET_SLIPOK_API_KEY",
  promptpayId: "HORSET_PROMPTPAY_ID",
  promptpayType: "HORSET_PROMPTPAY_TYPE",
  promptpayName: "HORSET_PROMPTPAY_NAME",
  bankName: "HORSET_BANK_NAME"
} as const

export interface HorSetPaymentInfo {
  promptpayId: string
  promptpayType: "phone" | "national_id"
  promptpayName: string
  bankName: string
}

/**
 * ข้อมูลบัญชีรับเงินของ HorSet เอง สำหรับแสดงในหน้าชำระเงินค่า subscription
 * ปลอดภัยที่จะเปิดเผยให้ client เห็นได้ (เหมือนเลขบัญชีร้านค้าที่โชว์ให้ลูกค้าทุกคนเห็นตอนจ่ายเงินอยู่แล้ว)
 * ไม่รวม Branch ID / API Key ของ SlipOK ซึ่งเป็นความลับ (ดึงเฉพาะฝั่ง server ผ่าน getHorSetSlipOkCredentials เท่านั้น)
 */
export async function getHorSetPaymentInfo() {
  try {
    // ใช้ Service Role Client เพราะ RLS ของ system_settings เปิดให้อ่านได้เฉพาะ super_admin เท่านั้น
    // แต่ข้อมูลนี้ต้องให้ admin ของทุก workspace อ่านได้ตอนจะจ่ายเงินซื้อแพ็กเกจ (ปลอดภัยที่จะเปิดเผย ไม่ใช่ความลับ)
    const supabase = await getServiceRoleOrSessionClient()
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [SETTINGS_KEYS.promptpayId, SETTINGS_KEYS.promptpayType, SETTINGS_KEYS.promptpayName, SETTINGS_KEYS.bankName])

    if (error) throw error

    const promptpayId = data?.find(r => r.key === SETTINGS_KEYS.promptpayId)?.value || ""
    const promptpayType = (data?.find(r => r.key === SETTINGS_KEYS.promptpayType)?.value as "phone" | "national_id") || "phone"
    const promptpayName = data?.find(r => r.key === SETTINGS_KEYS.promptpayName)?.value || ""
    const bankName = data?.find(r => r.key === SETTINGS_KEYS.bankName)?.value || ""

    if (!promptpayId) {
      return { success: false, error: "ยังไม่ได้ตั้งค่าบัญชี PromptPay ของ HorSet กรุณาติดต่อผู้ดูแลระบบ" }
    }

    const info: HorSetPaymentInfo = { promptpayId, promptpayType, promptpayName, bankName }
    return { success: true, data: info }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลบัญชีรับเงินของ HorSet" }
  }
}

async function getHorSetSlipOkCredentials() {
  const supabase = await getServiceRoleOrSessionClient()
  const { data, error } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", [SETTINGS_KEYS.branchId, SETTINGS_KEYS.apiKey])

  if (error) throw new Error(error.message)

  const branchIdRow = data?.find(r => r.key === SETTINGS_KEYS.branchId)
  const apiKeyRow = data?.find(r => r.key === SETTINGS_KEYS.apiKey)

  if (!branchIdRow?.value || !apiKeyRow?.value) {
    throw new Error("ยังไม่ได้ตั้งค่า Branch ID หรือ API Key ของ SlipOK สำหรับ HorSet เอง กรุณาตั้งค่าในหน้า Super Admin ก่อน")
  }

  return {
    branchId: branchIdRow.value as string,
    apiKey: decryptText(apiKeyRow.value as string)
  }
}

// ข้อความเฉพาะบางโค้ดที่ต้องเปลี่ยนคำให้ชัดว่าเป็นบัญชี/โควต้าของ HorSet เอง ไม่ใช่ของหอพัก
// (ต่างจาก SLIPOK_ERROR_MESSAGES ที่ใช้คำกลางๆ สำหรับ SlipOK ของแต่ละ workspace)
const HORSET_SLIPOK_ERROR_MESSAGE_OVERRIDES: Record<number, string> = {
  1004: "โควต้า SlipOK ของ HorSet หมดสำหรับเดือนนี้ กรุณาติดต่อผู้ดูแลระบบ",
  1014: "บัญชีผู้รับในสลิปไม่ตรงกับบัญชี PromptPay ของ HorSet"
}

function getHorsetSlipOkErrorMessage(code: number | undefined, fallback: string | undefined) {
  if (code && HORSET_SLIPOK_ERROR_MESSAGE_OVERRIDES[code]) return HORSET_SLIPOK_ERROR_MESSAGE_OVERRIDES[code]
  if (code && SLIPOK_ERROR_MESSAGES[code]) return SLIPOK_ERROR_MESSAGES[code]
  return fallback || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุจาก SlipOK"
}

/**
 * ตรวจสอบสลิปที่เจ้าของหอโอนเงินมาให้ "HorSet" เอง (ไม่ใช่บัญชีของหอพัก) ผ่าน SlipOK
 * ใช้ credential ชุดของ HorSet จาก system_settings เท่านั้น
 */
export async function verifySlipWithHorSetSlipOk(imageUrl: string, amount: number) {
  const { branchId, apiKey } = await getHorSetSlipOkCredentials()

  const response = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}`, {
    method: "POST",
    headers: { "x-authorization": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ url: imageUrl, log: true, amount })
  })

  const json = await response.json()

  if (!response.ok || !json.success) {
    const code = typeof json?.code === "number" ? json.code : undefined
    const message = getHorsetSlipOkErrorMessage(code, json?.message)
    // ส่ง raw response ของ SlipOK กลับไปด้วยเสมอ (ไม่ใช่แค่ตอนสำเร็จ) เพื่อให้ Super Admin
    // เปิดดูสาเหตุที่แท้จริงตอนตรวจสอบสลิปด้วยตนเองได้ ไม่ต้องเดาจากข้อความแปลอย่างเดียว
    return { success: false as const, error: message, code, data: json }
  }

  return { success: true as const, data: json.data }
}

/**
 * คำนวณ current_period_start/end ของรอบบิลใหม่ พร้อม logic "trial-carryover": ถ้า workspace ยังอยู่ใน
 * trial และยังไม่หมดอายุ ให้เริ่มนับรอบบิลใหม่หลังวันที่ trial หมดอายุจริง แทนที่จะเริ่มนับทันที
 * เพื่อไม่ให้เสียวันทดลองใช้ที่เหลืออยู่ไปฟรีๆ — ใช้ร่วมกันทั้งเส้นทาง verify สำเร็จทันที (uploadSubscriptionSlip)
 * และเส้นทาง retry คิวสำเร็จภายหลัง (cron subscription-check) เพื่อไม่ให้ผลลัพธ์ต่างกันตามแต่ว่า SlipOK
 * ผ่านตั้งแต่ครั้งแรกหรือผ่านตอน retry
 */
export async function computeSubscriptionPeriodWithTrialCarryover(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
  billingCycle: "monthly" | "yearly"
): Promise<{ periodStart: Date; currentPeriodEnd: Date; carriedOverDays: number }> {
  const periodMs = billingCycle === "yearly" ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
  const now = new Date()

  const { data: existingSub } = await supabase
    .from("workspace_subscriptions")
    .select("status, trial_ends_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  const trialEndsAt = existingSub?.status === "trial" && existingSub.trial_ends_at ? new Date(existingSub.trial_ends_at) : null
  const periodStart = trialEndsAt && trialEndsAt.getTime() > now.getTime() ? trialEndsAt : now
  const currentPeriodEnd = new Date(periodStart.getTime() + periodMs)
  const carriedOverDays = trialEndsAt && trialEndsAt.getTime() > now.getTime()
    ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : 0

  return { periodStart, currentPeriodEnd, carriedOverDays }
}

/**
 * อัปโหลดสลิปจ่ายค่า subscription รายเดือน/รายปี ให้ HorSet -> ตรวจสอบผ่าน SlipOK -> ปรับแผนอัตโนมัติเมื่อสำเร็จ
 */
export async function uploadSubscriptionSlip(workspaceId: string, planId: string, billingCycle: "monthly" | "yearly", slipImageUrl: string) {
  try {
    if (!workspaceId || !planId || !slipImageUrl) {
      return { success: false, error: "ข้อมูลไม่ครบถ้วน กรุณาเลือกแผนและอัปโหลดสลิปให้เรียบร้อย" }
    }

    const supabase = await createClient()

    const { data: plan, error: planError } = await supabase
      .from("saas_plans")
      .select("*")
      .eq("id", planId)
      .single()
    if (planError || !plan) throw new Error("ไม่พบแผนการใช้งานที่เลือก")

    const amount = billingCycle === "yearly" ? Number(plan.price_yearly ?? plan.price_monthly * 12) : Number(plan.price_monthly)

    const { data: paymentRow, error: insertError } = await supabase
      .from("saas_payments")
      .insert({ workspace_id: workspaceId, plan_id: planId, billing_cycle: billingCycle, amount, slip_image_url: slipImageUrl, status: "pending" })
      .select()
      .single()
    if (insertError) throw insertError

    const verifyRes = await verifySlipWithHorSetSlipOk(slipImageUrl, amount)

    if (verifyRes.success) {
      const now = new Date()
      const serviceClient = await getServiceRoleOrSessionClient()

      const { periodStart, currentPeriodEnd, carriedOverDays } = await computeSubscriptionPeriodWithTrialCarryover(
        serviceClient,
        workspaceId,
        billingCycle
      )

      await serviceClient
        .from("saas_payments")
        .update({ status: "verified", slipok_response: verifyRes.data, verified_at: now.toISOString() })
        .eq("id", paymentRow.id)

      const { error: subUpdateError } = await serviceClient
        .from("workspace_subscriptions")
        .upsert(
          {
            workspace_id: workspaceId,
            plan_id: planId,
            status: "active",
            billing_cycle: billingCycle,
            current_period_start: periodStart.toISOString(),
            current_period_end: currentPeriodEnd.toISOString()
          },
          { onConflict: "workspace_id" }
        )
      if (subUpdateError) throw subUpdateError

      if (carriedOverDays > 0) {
        return {
          success: true,
          message: `ชำระเงินสำเร็จ! ระบบจะให้คุณใช้สิทธิ์ทดลองใช้ฟรีต่ออีก ${carriedOverDays} วันตามเดิม แล้วค่อยเริ่มนับรอบบิลของแผน "${plan.name}" หลังจากนั้น`
        }
      }

      return { success: true, message: `ชำระเงินสำเร็จ! อัปเกรดเป็นแผน "${plan.name}" เรียบร้อยแล้ว` }
    }

    if (verifyRes.code && SLIPOK_RETRYABLE_ERROR_CODES.includes(verifyRes.code)) {
      const serviceClient = await getServiceRoleOrSessionClient()
      await serviceClient.from("saas_payment_retry_queue").insert({
        saas_payment_id: paymentRow.id,
        workspace_id: workspaceId,
        slip_url: slipImageUrl,
        amount,
        next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        last_error_code: verifyRes.code,
        last_error_message: verifyRes.error
      })
      return { success: false, retrying: true, error: "ข้อมูลธนาคารขัดข้องชั่วคราว ระบบจะตรวจสอบสลิปนี้ให้อีกครั้งอัตโนมัติภายใน 5 นาที" }
    }

    // หมายเหตุ: saas_payments ไม่มีคอลัมน์ last_error_code (ต่างจาก saas_payment_retry_queue) — เดิมโค้ดนี้เคย
    // ส่ง last_error_code ไปด้วยและถูก cast เป็น `as never` เพื่อหลบ TypeScript ทำให้ PostgREST ปฏิเสธ request
    // ทั้งก้อนเงียบๆ (ไม่มีใคร check error) ผลคือ status ไม่ถูกอัปเดตเป็น "failed" จริง ค้างเป็น "pending" ตลอดไป
    // สาเหตุ/code เก็บอยู่ใน slipok_response (jsonb) อยู่แล้วผ่าน verifyRes.error/verifyRes.code/verifyRes.data
    const { error: markFailedError } = await supabase
      .from("saas_payments")
      .update({ status: "failed", slipok_response: verifyRes })
      .eq("id", paymentRow.id)

    if (markFailedError) {
      console.error("Error marking saas_payments as failed:", markFailedError)
    }

    // แจ้ง Super Admin แบบ fire-and-forget เพื่อให้เข้าไปตรวจสอบสลิปที่ระบบตรวจสอบแล้วว่าไม่ผ่านทันที
    const { data: ws } = await supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle()
    sendLineSuperAdminNotificationAction(
      `⚠️ สลิปจ่ายเงิน subscription ตรวจสอบไม่ผ่าน\n\nหอพัก: ${ws?.name || "หอพัก"}\nแผน: ${plan.name}\nจำนวนเงิน: ${amount} บาท\nสาเหตุ: ${verifyRes.error || "ไม่ทราบสาเหตุ"}`
    ).catch((err) => console.error("Error sending super admin payment-failed LINE notification:", err))

    return { success: false, error: verifyRes.error }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการตรวจสอบสลิปการชำระเงิน" }
  }
}

/**
 * ดึงแผนการใช้งานทั้งหมด (รวมที่ปิดขายแล้ว/is_active=false) สำหรับหน้าจัดการแผนของ Super Admin เท่านั้น
 * ต่างจาก listSaasPlans() ที่กรองเฉพาะแผนที่เปิดขายอยู่ สำหรับหน้า Pricing ของลูกค้าทั่วไป
 */
export async function listAllSaasPlansForAdmin() {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const serviceClient = await getServiceRoleOrSessionClient()
    const { data, error } = await serviceClient
      .from("saas_plans")
      .select("*")
      .order("price_monthly", { ascending: true })

    if (error) {
      if (error.code === RELATION_MISSING_CODE) return { success: true, data: [] as SaasPlan[] }
      throw error
    }

    return { success: true, data: (data || []).map(mapPlanRow) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลแผนการใช้งานทั้งหมด" }
  }
}

export interface SaasPlanInput {
  code: "trial" | "starter" | "pro" | "business"
  name: string
  priceMonthly: number
  priceYearly: number | null
  maxRooms: number | null
  maxStaff: number | null
  maxBuildings: number | null
  features: { line_notify?: boolean; tax_export?: boolean; slipok_auto_verify?: boolean }
}

function validateSaasPlanInput(input: SaasPlanInput): string | null {
  if (!input.code || !["trial", "starter", "pro", "business"].includes(input.code)) {
    return "รหัสแผน (code) ไม่ถูกต้อง ต้องเป็น trial, starter, pro หรือ business เท่านั้น"
  }
  if (!input.name || !input.name.trim()) {
    return "กรุณากรอกชื่อแผน"
  }
  if (input.priceMonthly === null || input.priceMonthly === undefined || input.priceMonthly < 0) {
    return "กรุณากรอกราคารายเดือนให้ถูกต้อง (ต้องไม่ติดลบ)"
  }
  return null
}

/**
 * Super Admin สร้างแผนการใช้งานใหม่ — ในทางปฏิบัติแทบไม่ได้ใช้เพราะ code ถูกจำกัดแค่ 4 ค่าตาม
 * check constraint ของตาราง (trial/starter/pro/business) และแต่ละ code unique อยู่แล้ว ฟังก์ชันนี้
 * มีไว้เพื่อความครบถ้วนกรณีมี code ใดยังไม่เคย seed ไว้ (เช่น ตั้งฐานข้อมูลใหม่)
 */
export async function createSaasPlan(input: SaasPlanInput) {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const validationError = validateSaasPlanInput(input)
    if (validationError) return { success: false, error: validationError }

    const serviceClient = await getServiceRoleOrSessionClient()
    const { error } = await serviceClient.from("saas_plans").insert({
      code: input.code,
      name: input.name.trim(),
      price_monthly: input.priceMonthly,
      price_yearly: input.priceYearly,
      max_rooms: input.maxRooms,
      max_staff: input.maxStaff,
      max_buildings: input.maxBuildings,
      features: input.features,
      is_active: true
    })

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: `มีแผนรหัส "${input.code}" อยู่แล้วในระบบ กรุณาแก้ไขแผนเดิมแทนการสร้างใหม่` }
      }
      throw error
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการสร้างแผนการใช้งาน" }
  }
}

/**
 * Super Admin แก้ไขรายละเอียดแผน (ราคา, โควตา, ฟีเจอร์) — การใช้งานหลักของหน้าจัดการแผนราคา
 */
export async function updateSaasPlan(planId: string, input: SaasPlanInput) {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }
    if (!planId) {
      return { success: false, error: "ไม่พบรหัสแผนการใช้งานที่จะแก้ไข" }
    }

    const validationError = validateSaasPlanInput(input)
    if (validationError) return { success: false, error: validationError }

    const serviceClient = await getServiceRoleOrSessionClient()
    const { error } = await serviceClient
      .from("saas_plans")
      .update({
        code: input.code,
        name: input.name.trim(),
        price_monthly: input.priceMonthly,
        price_yearly: input.priceYearly,
        max_rooms: input.maxRooms,
        max_staff: input.maxStaff,
        max_buildings: input.maxBuildings,
        features: input.features
      })
      .eq("id", planId)

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: `มีแผนรหัส "${input.code}" อยู่แล้วในระบบ ไม่สามารถเปลี่ยนไปใช้รหัสซ้ำได้` }
      }
      throw error
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการแก้ไขแผนการใช้งาน" }
  }
}

/**
 * Super Admin เปิด/ปิดการขายแผน (soft toggle ผ่าน is_active) — ไม่ลบแผนออกจากฐานข้อมูลจริง
 * เพื่อไม่ให้กระทบ workspace_subscriptions/saas_payments เดิมที่ยังอ้างอิง plan_id นี้อยู่ (ตามธรรมเนียม soft delete ของโปรเจค)
 */
export async function toggleSaasPlanActive(planId: string, isActive: boolean) {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }
    if (!planId) {
      return { success: false, error: "ไม่พบรหัสแผนการใช้งาน" }
    }

    const serviceClient = await getServiceRoleOrSessionClient()
    const { error } = await serviceClient
      .from("saas_plans")
      .update({ is_active: isActive })
      .eq("id", planId)
    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเปลี่ยนสถานะแผนการใช้งาน" }
  }
}

/**
 * Super Admin ปรับแผน/สถานะของ workspace ด้วยตนเอง (กรณีพิเศษ เช่น โปรโมชั่น, คืนเงิน, แก้ปัญหาลูกค้า)
 */
export async function superAdminOverrideSubscription(
  workspaceId: string,
  planId: string,
  status: "trial" | "active" | "past_due" | "read_only" | "cancelled",
  currentPeriodEnd: string | null
) {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const serviceClient = await getServiceRoleOrSessionClient()
    const { error } = await serviceClient
      .from("workspace_subscriptions")
      .upsert(
        { workspace_id: workspaceId, plan_id: planId, status, current_period_end: currentPeriodEnd },
        { onConflict: "workspace_id" }
      )
    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการปรับแผนการใช้งาน" }
  }
}

/**
 * ให้ Admin ของ workspace เอง (ไม่ใช่ Super Admin) ยกเลิกการใช้งานบัญชีตนเอง
 * บัญชีจะยังใช้งานได้ตามปกติจนถึงวันหมดอายุปัจจุบัน (trial_ends_at หรือ current_period_end) จากนั้นจะกลายเป็น cancelled
 * ไม่ได้ตัดสิทธิ์ทันที เพื่อไม่ให้เสียเงิน/เวลาที่จ่ายไปแล้วฟรีๆ
 */
export async function cancelWorkspaceSubscription(workspaceId: string) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "admin" || profileRes.data?.workspace_id !== workspaceId) {
      return { success: false, error: "คุณไม่มีสิทธิ์ยกเลิกบัญชีของหอพักนี้" }
    }

    // ใช้ Service Role Client เพราะ RLS ของ workspace_subscriptions ไม่ได้เปิด update ให้ role admin โดยตรง
    // (การเช็คสิทธิ์ที่แท้จริงคือ getCurrentUserProfileAction ด้านบนที่ยืนยันแล้วว่าเป็น admin ของ workspace นี้เท่านั้น)
    const serviceClient = await getServiceRoleOrSessionClient()
    const { data: sub, error: subError } = await serviceClient
      .from("workspace_subscriptions")
      .select("status, trial_ends_at, current_period_end")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    if (subError) throw subError

    const expiresAt = sub?.status === "trial" ? sub.trial_ends_at : sub?.current_period_end

    const { error } = await serviceClient
      .from("workspace_subscriptions")
      .update({ status: "cancelled", current_period_end: expiresAt || new Date().toISOString() })
      .eq("workspace_id", workspaceId)
    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการยกเลิกบัญชี" }
  }
}

/**
 * ดึงรายการ subscription ของทุก workspace พร้อมชื่อแผน สำหรับหน้า Super Admin Console
 */
export async function listAllWorkspaceSubscriptions() {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const serviceClient = await getServiceRoleOrSessionClient()
    const { data, error } = await serviceClient
      .from("workspace_subscriptions")
      .select("*, saas_plans (*)")
      .order("updated_at", { ascending: false })

    if (error) {
      if (error.code === RELATION_MISSING_CODE) return { success: true, data: [] }
      throw error
    }

    return { success: true, data: data || [] }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูล subscription" }
  }
}

/**
 * ดึงประวัติการจ่ายเงินค่า subscription ทั้งหมด (หรือของ workspace เดียวถ้าระบุ) สำหรับ Super Admin Console
 */
export async function listSaasPayments(workspaceId?: string) {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const serviceClient = await getServiceRoleOrSessionClient()
    let query = serviceClient.from("saas_payments").select("*, saas_plans (name)").order("created_at", { ascending: false })
    if (workspaceId) query = query.eq("workspace_id", workspaceId)

    const { data, error } = await query
    if (error) {
      if (error.code === RELATION_MISSING_CODE) return { success: true, data: [] }
      throw error
    }

    const payments = data || []

    // ดึงเหตุผลล่าสุดจากคิว retry มาแนบให้รายการที่ยังค้าง "pending" อยู่ด้วย (กรณี SlipOK ตรวจไม่ผ่านแบบ
    // ชั่วคราวและรอ retry อัตโนมัติอยู่ — ตาราง saas_payments เองไม่ได้เก็บ error/attempt ล่าสุดของรอบที่กำลังรอ)
    const pendingIds = payments.filter((p) => p.status === "pending").map((p) => p.id)
    const retryQueueMap = new Map<string, { status: string; attempt_count: number; max_attempts: number; last_error_code: number | null; last_error_message: string | null; next_retry_at: string }>()

    if (pendingIds.length > 0) {
      const { data: retryRows } = await serviceClient
        .from("saas_payment_retry_queue")
        .select("saas_payment_id, status, attempt_count, max_attempts, last_error_code, last_error_message, next_retry_at, updated_at")
        .in("saas_payment_id", pendingIds)
        .order("updated_at", { ascending: false })

      // มีได้แค่แถวเดียวต่อ payment ตามปกติ แต่กันเหนียวเผื่อมีหลายแถว เอาแถวล่าสุดสุด (เรียง updated_at desc ไว้แล้ว)
      for (const row of retryRows || []) {
        if (!retryQueueMap.has(row.saas_payment_id)) retryQueueMap.set(row.saas_payment_id, row)
      }
    }

    const enrichedPayments = payments.map((p) => ({
      ...p,
      retry_queue_status: retryQueueMap.get(p.id) || null
    }))

    return { success: true, data: enrichedPayments }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงประวัติการชำระเงิน" }
  }
}

/**
 * Super Admin ตรวจสอบสลิปจ่ายเงิน subscription ด้วยตนเอง (manual review) — ใช้เมื่อ SlipOK ตรวจสอบผิดพลาด
 * หรือ Super Admin เปิดดูสลิปแล้วเห็นว่าสถานะที่ SlipOK ให้มาไม่ตรงกับความเป็นจริง
 * - approve: เปิดสิทธิ์ใช้งานให้ workspace เหมือนกับตรวจผ่านอัตโนมัติ (ใช้ logic คำนวณรอบบิลเดียวกัน)
 * - reject: ปิดรายการเป็น failed อย่างเป็นทางการ (เผื่อกรณี SlipOK ปล่อยผ่านผิดๆ หรือสลิปปลอม)
 * ทั้งสองกรณีจะปิดคิว retry ที่ค้างอยู่ (ถ้ามี) ก่อนเสมอ ไม่ให้ cron รอบถัดไปมาเขียนทับการตัดสินใจของ Super Admin
 */
export async function manuallyReviewSaasPaymentAction(
  paymentId: string,
  decision: "approve" | "reject",
  note?: string
) {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const serviceClient = await getServiceRoleOrSessionClient()

    const { data: payment, error: paymentError } = await serviceClient
      .from("saas_payments")
      .select("id, workspace_id, plan_id, billing_cycle, amount, status, saas_plans (name)")
      .eq("id", paymentId)
      .single()

    if (paymentError || !payment) throw new Error("ไม่พบรายการชำระเงินนี้")
    if (payment.status !== "pending") {
      return { success: false, error: `รายการนี้ถูกดำเนินการไปแล้ว (สถานะปัจจุบัน: ${payment.status})` }
    }

    // ปิดคิว retry ที่ยังค้างอยู่ก่อนเสมอ ไม่ให้ cron job มาประมวลผลซ้ำทับการตัดสินใจของ Super Admin ภายหลัง
    await serviceClient
      .from("saas_payment_retry_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("saas_payment_id", paymentId)
      .eq("status", "pending")

    const reviewedAt = new Date().toISOString()

    if (decision === "reject") {
      const { error } = await serviceClient
        .from("saas_payments")
        .update({
          status: "failed",
          manual_review_note: note?.trim() || null,
          reviewed_by: profileRes.data.id,
          reviewed_at: reviewedAt
        })
        .eq("id", paymentId)
      if (error) throw error

      return { success: true, message: "ปฏิเสธสลิปนี้เรียบร้อยแล้ว — ปิดรายการเป็นล้มเหลวอย่างเป็นทางการ" }
    }

    const { periodStart, currentPeriodEnd, carriedOverDays } = await computeSubscriptionPeriodWithTrialCarryover(
      serviceClient,
      payment.workspace_id,
      payment.billing_cycle
    )

    const { error: updatePaymentError } = await serviceClient
      .from("saas_payments")
      .update({
        status: "verified",
        verified_at: reviewedAt,
        manual_review_note: note?.trim() || null,
        reviewed_by: profileRes.data.id,
        reviewed_at: reviewedAt
      })
      .eq("id", paymentId)
    if (updatePaymentError) throw updatePaymentError

    const { error: subUpsertError } = await serviceClient
      .from("workspace_subscriptions")
      .upsert(
        {
          workspace_id: payment.workspace_id,
          plan_id: payment.plan_id,
          status: "active",
          billing_cycle: payment.billing_cycle,
          current_period_start: periodStart.toISOString(),
          current_period_end: currentPeriodEnd.toISOString()
        },
        { onConflict: "workspace_id" }
      )
    if (subUpsertError) throw subUpsertError

    return {
      success: true,
      message: carriedOverDays > 0
        ? `อนุมัติสลิปด้วยตนเองสำเร็จ! ระบบจะให้ทดลองใช้ฟรีต่ออีก ${carriedOverDays} วันตามเดิม แล้วค่อยเริ่มนับรอบบิลหลังจากนั้น`
        : "อนุมัติสลิปด้วยตนเองสำเร็จ! เปิดสิทธิ์ใช้งานให้ workspace แล้ว"
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการตรวจสอบสลิปด้วยตนเอง" }
  }
}