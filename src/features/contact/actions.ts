"use server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getCurrentUserProfileAction } from "@/features/auth/actions"

/**
 * ช่องทางการติดต่อของทีม HorSet (Facebook/LINE/เบอร์โทร/Instagram/YouTube)
 *
 * เก็บใน public.system_settings (key/value เดิมที่ใช้กับ Google Translate/Drive อยู่แล้ว) ไม่สร้างตารางใหม่
 * ⚠️ getContactChannelsAction() เป็น public — ไม่เช็คสิทธิ์ เพราะหน้า Landing (สาธารณะ) ต้องเรียกได้
 *    ดึงเฉพาะ 5 คีย์นี้เท่านั้น ไม่ select ทั้งตาราง กัน system_settings อื่น (เช่น Google API key/secret) รั่วออกไป
 * แก้ไขได้เฉพาะ super_admin เท่านั้น ผ่าน updateContactChannelsAction()
 */

export interface ContactChannels {
  facebookUrl: string
  lineUrl: string
  phone: string
  instagramUrl: string
  youtubeUrl: string
}

const CONTACT_KEYS: Record<keyof ContactChannels, string> = {
  facebookUrl: "CONTACT_FACEBOOK_URL",
  lineUrl: "CONTACT_LINE_URL",
  phone: "CONTACT_PHONE",
  instagramUrl: "CONTACT_INSTAGRAM_URL",
  youtubeUrl: "CONTACT_YOUTUBE_URL",
}

const EMPTY_CHANNELS: ContactChannels = {
  facebookUrl: "",
  lineUrl: "",
  phone: "",
  instagramUrl: "",
  youtubeUrl: "",
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
}

/** ดึงช่องทางการติดต่อ — ใช้ได้ทั้งหน้า Landing (สาธารณะ) และการ์ด Support Access */
export async function getContactChannelsAction() {
  try {
    if (isDemoMode()) {
      return { success: true, data: EMPTY_CHANNELS }
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", Object.values(CONTACT_KEYS))

    if (error) throw error

    const byKey = new Map((data || []).map((row) => [row.key, row.value]))
    const result: ContactChannels = {
      facebookUrl: byKey.get(CONTACT_KEYS.facebookUrl) || "",
      lineUrl: byKey.get(CONTACT_KEYS.lineUrl) || "",
      phone: byKey.get(CONTACT_KEYS.phone) || "",
      instagramUrl: byKey.get(CONTACT_KEYS.instagramUrl) || "",
      youtubeUrl: byKey.get(CONTACT_KEYS.youtubeUrl) || "",
    }

    return { success: true, data: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงช่องทางการติดต่อ"
    return { success: false, error: errorMessage, data: EMPTY_CHANNELS }
  }
}

/** บันทึกช่องทางการติดต่อ — super_admin เท่านั้น */
export async function updateContactChannelsAction(patch: Partial<ContactChannels>) {
  try {
    if (isDemoMode()) return { success: true }

    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "Unauthorized" }
    }

    const rows = (Object.keys(patch) as (keyof ContactChannels)[])
      .filter((field) => patch[field] !== undefined)
      .map((field) => ({ key: CONTACT_KEYS[field], value: (patch[field] ?? "").trim() }))

    if (rows.length === 0) return { success: true }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from("system_settings").upsert(rows, { onConflict: "key" })
    if (error) throw error

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกช่องทางการติดต่อ"
    return { success: false, error: errorMessage }
  }
}
