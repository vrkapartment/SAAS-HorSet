"use client"

import { getCurrentUserProfileAction } from "./actions"

// In-memory global profile cache in the browser's JavaScript runtime.
// This persists across client-side page transitions in Next.js (SPA mode).
let cachedProfile: any = null

/**
 * ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบันแบบประหยัดทรัพยากร (มีระบบ In-Memory Caching)
 * @param forceRefresh บังคับให้ข้ามแคชและดึงใหม่จากฐานข้อมูล
 */
export async function getCurrentUserProfileClient(forceRefresh = false) {
  if (typeof window !== "undefined" && !forceRefresh && cachedProfile) {
    return { success: true, data: cachedProfile }
  }

  const res = await getCurrentUserProfileAction()
  if (res.success && res.data) {
    cachedProfile = res.data
  }
  return res
}

/**
 * บันทึกหรืออัปเดตข้อมูลโปรไฟล์ผู้ใช้ในแคช
 */
export function setCachedUserProfile(profile: any) {
  cachedProfile = profile
}

/**
 * ล้างแคชโปรไฟล์ผู้ใช้ทั้งหมด (เช่น ตอนที่ออกจากระบบ)
 */
export function clearCachedUserProfile() {
  cachedProfile = null
}
