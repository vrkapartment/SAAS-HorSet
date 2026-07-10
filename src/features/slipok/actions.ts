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

export interface SlipOkSettingsView {
  branchId: string
  hasApiKey: boolean
  apiKeyPreview: string
  enabled: boolean
  checkAmount: boolean
  checkReceiver: boolean
}

export async function getSlipOkSettings(workspaceId: string) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("workspace_slipok_settings")
      .select("branch_id, api_key_encrypted, enabled, check_amount, check_receiver")
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
        checkReceiver: true
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
      checkReceiver: data.check_receiver !== false
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
  checkReceiver: boolean
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
      updated_at: string
      api_key_encrypted?: string
    } = {
      workspace_id: workspaceId,
      branch_id: branchId.trim(),
      enabled,
      check_amount: checkAmount,
      check_receiver: checkReceiver,
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
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspace_slipok_settings")
    .select("branch_id, api_key_encrypted, enabled, check_amount, check_receiver")
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
    checkReceiver: data.check_receiver !== false
  }
}

export interface SlipOkQuota {
  quota: number
  overQuota: number
  specialQuota: number
  endDate: string
  specialEndDate: string | null
}

export async function getSlipOkQuota(workspaceId: string) {
  try {
    const { branchId, apiKey } = await getDecryptedCredentials(workspaceId)

    const response = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}/quota`, {
      method: "GET",
      headers: { "x-authorization": apiKey }
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return { success: false, error: mapSlipOkError(json) }
    }

    const quota: SlipOkQuota = {
      quota: json.data.quota,
      overQuota: json.data.overQuota,
      specialQuota: json.data.specialQuota,
      endDate: json.data.endDate,
      specialEndDate: json.data.specialEndDate ?? null
    }

    return { success: true, data: quota }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเชื่อมต่อ SlipOK"
    return { success: false, error: errorMessage }
  }
}

export async function verifySlipWithSlipOk(workspaceId: string, imageUrl: string, amount?: number) {
  try {
    const { branchId, apiKey, checkAmount, checkReceiver } = await getDecryptedCredentials(workspaceId)

    const response = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}`, {
      method: "POST",
      headers: {
        "x-authorization": apiKey,
        "Content-Type": "application/json"
      },
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
      return { success: false, error: mapSlipOkError(json), data: json.data }
    }

    return { success: true, data: json.data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการตรวจสอบสลิปกับ SlipOK"
    return { success: false, error: errorMessage }
  }
}
