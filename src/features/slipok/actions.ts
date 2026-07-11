"use server"

import { createClient } from "@/lib/supabase/server"
import { encryptText, decryptText } from "@/lib/encryption"

const SLIPOK_ERROR_MESSAGES: Record<number, string> = {
  1000: "กรุณาใส่ข้อมูล QR Code ให้ครบ",
  1001: "ไม่พบข้อมูลสาขา กรุณาตรวจสอบ Branch ID อีกครั้ง",
  1002: "API Key ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า SlipOK ของหอพักนี้",
  1003: "Package ของ SlipOK หมดอายุแล้ว กรุณาต่อสมาชิกแพ็กเกจ",
  1004: "Package ของ SlipOK ใช้เกินโควต้าแล้ว กรุณาต่อสมาชิกแพ็กเกจ",
  1005: "ไฟล์ไม่ใช่ไฟล์ภาพที่รองรับ (jpg, jpeg, png, jfif, webp)",
  1006: "รูปภาพไม่ถูกต้อง",
  1007: "รูปภาพไม่มี QR Code หรือหา QR ในสลิปไม่พบ",
  1008: "QR Code ดังกล่าวไม่ใช่ QR สำหรับตรวจสอบการชำระเงิน",
  1009: "ข้อมูลธนาคารขัดข้องชั่วคราว กรุณาตรวจสอบใหม่อีกครั้งใน 15 นาที",
  1010: "สลิปจากธนาคารนี้ต้องรอสักครู่ก่อนตรวจสอบได้ กรุณาลองใหม่อีกครั้งหลังจากนี้",
  1011: "QR Code หมดอายุ หรือไม่มีรายการอยู่จริง",
  1012: "สลิปนี้ถูกส่งเข้าระบบไปแล้วก่อนหน้านี้ (สลิปซ้ำ)",
  1013: "ยอดเงินที่ระบุไม่ตรงกับยอดในสลิป",
  1014: "บัญชีผู้รับในสลิปไม่ตรงกับบัญชีหลักที่ตั้งไว้",
  1015: "ไม่พบข้อมูล Package ของ SlipOK"
}

interface SlipOkErrorPayload {
  code?: number
  message?: string
}

function mapSlipOkError(json: SlipOkErrorPayload): string {
  const code = json?.code
  if (code && SLIPOK_ERROR_MESSAGES[code]) return SLIPOK_ERROR_MESSAGES[code]
  return json?.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุจาก SlipOK"
}

// ใช้ Service Role Client เมื่อมี Env พร้อม เพื่อให้ฟังก์ชันกลุ่มนี้เรียกได้จากทุกที่ (Cron Job, Webhook)
// ที่ไม่มี session คุกกี้ของผู้ใช้ให้ RLS ตรวจสอบ เช่นเดียวกับ pattern ใน features/notification/actions.ts
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

export interface SlipOkSettingsView {
  branchId: string
  hasApiKey: boolean
  apiKeyPreview: string
  enabled: boolean
  checkAmount: boolean
  checkReceiver: boolean
  autoDisableOnQuotaExceeded: boolean
  monthlyPackageQuota: number
}

export async function getSlipOkSettings(workspaceId: string) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("workspace_slipok_settings")
      .select("branch_id, api_key_encrypted, enabled, check_amount, check_receiver, auto_disable_on_quota_exceeded, monthly_package_quota")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      const emptySettings: SlipOkSettingsView = {
        branchId: "",
        hasApiKey: false,
        apiKeyPreview: "",
        enabled: true,
        checkAmount: true,
        checkReceiver: true,
        autoDisableOnQuotaExceeded: true,
        monthlyPackageQuota: 0
      }
      return { success: true, data: emptySettings }
    }

    let apiKeyPreview = ""
    if (data.api_key_encrypted) {
      try {
        const decrypted = decryptText(data.api_key_encrypted)
        apiKeyPreview = decrypted.length > 4 ? `••••${decrypted.slice(-4)}` : "••••"
      } catch {
        apiKeyPreview = "••••"
      }
    }

    const settings: SlipOkSettingsView = {
      branchId: data.branch_id || "",
      hasApiKey: !!data.api_key_encrypted,
      apiKeyPreview,
      enabled: data.enabled !== false,
      checkAmount: data.check_amount !== false,
      checkReceiver: data.check_receiver !== false,
      autoDisableOnQuotaExceeded: data.auto_disable_on_quota_exceeded !== false,
      monthlyPackageQuota: data.monthly_package_quota !== null && data.monthly_package_quota !== undefined ? Number(data.monthly_package_quota) : 0
    }

    return { success: true, data: settings }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลการตั้งค่า SlipOK"
    return { success: false, error: errorMessage }
  }
}

export async function saveSlipOkSettings(
  workspaceId: string,
  branchId: string,
  apiKey: string | null,
  enabled: boolean,
  checkAmount: boolean,
  checkReceiver: boolean,
  autoDisableOnQuotaExceeded: boolean,
  monthlyPackageQuota: number
) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }
    if (!branchId.trim()) {
      return { success: false, error: "กรุณากรอก Branch ID ของ SlipOK" }
    }

    const supabase = await createClient()

    const updatePayload: {
      workspace_id: string
      branch_id: string
      enabled: boolean
      check_amount: boolean
      check_receiver: boolean
      auto_disable_on_quota_exceeded: boolean
      monthly_package_quota: number
      updated_at: string
      api_key_encrypted?: string
    } = {
      workspace_id: workspaceId,
      branch_id: branchId.trim(),
      enabled,
      check_amount: checkAmount,
      check_receiver: checkReceiver,
      auto_disable_on_quota_exceeded: autoDisableOnQuotaExceeded,
      monthly_package_quota: Number(monthlyPackageQuota) || 0,
      updated_at: new Date().toISOString()
    }

    // เข้ารหัสคีย์ใหม่ก่อนบันทึกเสมอ ถ้าผู้ใช้ไม่ได้กรอกคีย์ใหม่มา (ยังเป็นค่า mask เดิม) จะคงคีย์เดิมไว้ไม่แก้ทับ
    if (apiKey && apiKey.trim()) {
      updatePayload.api_key_encrypted = encryptText(apiKey.trim())
    }

    const { error } = await supabase
      .from("workspace_slipok_settings")
      .upsert(updatePayload, { onConflict: "workspace_id" })

    if (error) throw error

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกการตั้งค่า SlipOK"
    return { success: false, error: errorMessage }
  }
}

async function getDecryptedCredentials(workspaceId: string) {
  const supabase = await getServiceRoleOrSessionClient()
  const { data, error } = await supabase
    .from("workspace_slipok_settings")
    .select("branch_id, api_key_encrypted, enabled, check_amount, check_receiver, auto_disable_on_quota_exceeded")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || !data.branch_id || !data.api_key_encrypted) {
    throw new Error("ยังไม่ได้ตั้งค่า Branch ID หรือ API Key ของ SlipOK สำหรับหอพักนี้ กรุณาตั้งค่าก่อน")
  }
  if (data.enabled === false) {
    throw new Error("การเชื่อมต่อ SlipOK ของหอพักนี้ถูกปิดใช้งานอยู่")
  }

  return {
    branchId: data.branch_id as string,
    apiKey: decryptText(data.api_key_encrypted as string),
    checkAmount: data.check_amount !== false,
    checkReceiver: data.check_receiver !== false,
    autoDisableOnQuotaExceeded: data.auto_disable_on_quota_exceeded !== false
  }
}

export interface SlipOkQuota {
  quota: number
  overQuota: number
  specialQuota: number
  endDate: string
  specialEndDate: string | null
}

async function fetchQuotaFromSlipOk(branchId: string, apiKey: string) {
  const response = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}/quota`, {
    method: "GET",
    headers: { "x-authorization": apiKey },
    signal: AbortSignal.timeout(8000)
  })

  const json = await response.json()

  if (!response.ok || !json.success) {
    return { success: false as const, error: mapSlipOkError(json) }
  }

  const quota: SlipOkQuota = {
    quota: json.data.quota,
    overQuota: json.data.overQuota,
    specialQuota: json.data.specialQuota,
    endDate: json.data.endDate,
    specialEndDate: json.data.specialEndDate ?? null
  }

  return { success: true as const, data: quota }
}

// ปิดการใช้งาน SlipOK ของ workspace นี้อัตโนมัติ (ไม่ลบ Branch ID/API Key ทิ้ง แค่ enabled = false)
// เรียกตอนพบว่าโควต้าหมด เพื่อกันไม่ให้เรียก API ต่อจนเกิดค่าใช้จ่ายส่วนเกินโดยไม่ได้ตั้งใจ
async function autoDisableSlipOk(workspaceId: string, reason: string) {
  try {
    const supabase = await getServiceRoleOrSessionClient()
    await supabase
      .from("workspace_slipok_settings")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
    console.warn(`SlipOK auto-disabled for workspace ${workspaceId}: ${reason}`)
  } catch (err) {
    console.error("Failed to auto-disable SlipOK after quota exceeded:", err)
  }
}

const QUOTA_EXCEEDED_MESSAGE_DISABLED =
  "โควต้า SlipOK เดือนนี้หมดแล้ว ระบบได้ปิดการตรวจสอบสลิปอัตโนมัติให้แล้วเพื่อป้องกันค่าใช้จ่ายส่วนเกิน กรุณาติดต่อ SlipOK เพื่อเติมโควต้า หรือกลับมาเปิดใช้งานเองในหน้าตั้งค่าหากต้องการใช้ต่อแม้มีค่าใช้จ่ายเพิ่ม"

// ใช้ตอนที่ admin ปิด toggle "ป้องกันค่าใช้จ่ายส่วนเกิน" ไว้ -> ระบบไม่ได้ปิดการเชื่อมต่อให้ ยังพยายามตรวจสอบต่อไปตามที่ตั้งค่าไว้
const QUOTA_EXCEEDED_MESSAGE_STILL_ON =
  "โควต้า SlipOK เดือนนี้หมดแล้ว แต่ตั้งค่าไว้ให้ยังตรวจสอบต่อไป (ปิดฟีเจอร์ป้องกันค่าใช้จ่ายส่วนเกินไว้อยู่) อาจมีค่าใช้จ่ายส่วนเกินตามแพ็กเกจของ SlipOK"

export async function getSlipOkQuota(workspaceId: string) {
  try {
    const { branchId, apiKey, autoDisableOnQuotaExceeded } = await getDecryptedCredentials(workspaceId)
    const result = await fetchQuotaFromSlipOk(branchId, apiKey)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // ถ้าโควต้าหมดแล้ว (แต่ยังไม่โดน error 1004 จาก SlipOK เพราะยังไม่มีการยิงตรวจสลิปจริง) ปิดการใช้งานไว้ก่อนกันเผื่อ
    // (เฉพาะเมื่อ admin เปิดฟีเจอร์นี้ไว้เท่านั้น)
    if (autoDisableOnQuotaExceeded && result.data.quota <= 0) {
      await autoDisableSlipOk(workspaceId, "โควต้าหมดจากการตรวจสอบด้วยตนเอง")
    }

    return { success: true, data: result.data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเชื่อมต่อ SlipOK"
    return { success: false, error: errorMessage }
  }
}

export async function verifySlipWithSlipOk(workspaceId: string, imageUrl: string, amount?: number) {
  try {
    const { branchId, apiKey, checkAmount, checkReceiver, autoDisableOnQuotaExceeded } = await getDecryptedCredentials(workspaceId)

    // เช็คโควต้าคงเหลือก่อนตรวจสลิปทุกครั้ง ถ้าหมดแล้วปิดการใช้งานอัตโนมัติทันทีและไม่ยิง API ตรวจสลิปต่อ
    // (ป้องกันไม่ให้เกิดค่าใช้จ่ายส่วนเกินโควต้าโดยไม่ได้ตั้งใจ — เฉพาะเมื่อ admin เปิดฟีเจอร์นี้ไว้เท่านั้น)
    if (autoDisableOnQuotaExceeded) {
      const quotaCheck = await fetchQuotaFromSlipOk(branchId, apiKey)
      if (quotaCheck.success && quotaCheck.data.quota <= 0) {
        await autoDisableSlipOk(workspaceId, "โควต้าหมดก่อนตรวจสลิป")
        return { success: false, error: QUOTA_EXCEEDED_MESSAGE_DISABLED, code: undefined as number | undefined }
      }
    }
    // ถ้าปิด toggle ป้องกันค่าใช้จ่ายไว้ จะข้ามการเช็คโควต้าล่วงหน้านี้ไปเลย ปล่อยให้ยิงตรวจสลิปจริงด้านล่างตามปกติ
    // (ถ้าเกินโควต้าจริง SlipOK จะตอบ error 1004 กลับมาเองด้านล่าง)

    const response = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}`, {
      method: "POST",
      headers: {
        "x-authorization": apiKey,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        url: imageUrl,
        // log: true เปิดเช็คบัญชีผู้รับ (ต้องตั้งบัญชีไว้ใน SlipOK LIFF ก่อน) + กันสลิปซ้ำ ปิดได้ถ้าไม่ต้องการ
        log: checkReceiver,
        // ส่ง amount ไปเทียบเฉพาะเมื่อเปิดเช็คยอดเงินไว้เท่านั้น
        ...(checkAmount && amount ? { amount } : {})
      })
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      // SlipOK แจ้งเกินโควต้า (code 1004) -> ปิดการใช้งานอัตโนมัติกันเรียกซ้ำเกินโควต้าต่อไปอีก (เผื่อเช็คด้านบนไม่ทัน)
      if (json.code === 1004) {
        if (autoDisableOnQuotaExceeded) {
          await autoDisableSlipOk(workspaceId, "SlipOK แจ้ง error 1004 (เกินโควต้า)")
          return { success: false, error: QUOTA_EXCEEDED_MESSAGE_DISABLED, code: 1004, data: json.data }
        }
        return { success: false, error: QUOTA_EXCEEDED_MESSAGE_STILL_ON, code: 1004, data: json.data }
      }
      return { success: false, error: mapSlipOkError(json), code: typeof json?.code === "number" ? json.code : undefined, data: json.data }
    }

    return { success: true, data: json.data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการตรวจสอบสลิปกับ SlipOK"
    return { success: false, error: errorMessage, code: undefined as number | undefined }
  }
}
