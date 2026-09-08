/**
 * หอพักที่ผู้ใช้ "กำลังดูอยู่"
 *
 * แอดมินทั่วไปสังกัดหอเดียว (profiles.workspace_id) แต่ super admin ไม่สังกัดหอใดเลย
 * (workspace_id = null) จึงต้องถอยไปอ่านหอที่เลือกไว้จากตัวสลับหอด้านบน ซึ่งเก็บใน cookie
 *
 * ⚠️ ลำดับสำคัญ: workspace ในโปรไฟล์ต้องมาก่อน cookie เสมอ
 * ทำให้ cookie มีผลเฉพาะกับคนที่ไม่สังกัดหอ (super admin) ซึ่งเข้าถึงได้ทุกหออยู่แล้ว
 * cookie จึงทำได้แค่ "เลือกให้แคบลง" ไม่ใช่ "ขยายสิทธิ์"
 *
 * แยกออกมาเป็นที่เดียวเพราะเป็นตรรกะที่เกี่ยวกับความปลอดภัย ถ้าปล่อยให้ก็อปไปใช้หลายที่
 * แล้ววันหนึ่งแก้ไม่ครบ จะเกิดช่องที่มองข้อมูลข้ามหอได้
 */

import { cookies } from "next/headers"

export const ACTIVE_WORKSPACE_COOKIE = "horset_current_workspace_id"

export async function resolveActiveWorkspaceId(
  profileWorkspaceId: string | null | undefined
): Promise<string | null> {
  if (profileWorkspaceId) return profileWorkspaceId

  try {
    const store = await cookies()
    return store.get(ACTIVE_WORKSPACE_COOKIE)?.value || null
  } catch {
    // ไม่มี request context (เช่นถูกเรียกจาก cron) — ถือว่าไม่ได้เลือกหอไว้
    return null
  }
}
