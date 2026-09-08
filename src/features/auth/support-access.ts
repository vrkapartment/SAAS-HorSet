/**
 * ด่านสิทธิ์ "เข้าช่วยเหลือ" ของทีมงาน HorSet (super admin)
 *
 * ทีมงานเข้าถึงข้อมูลหอพักได้เฉพาะเมื่อเจ้าของหอกดอนุมัติแล้ว โดยสถานะเก็บใน
 * ตาราง support_access_grants (สถานะ pending / approved / revoked)
 *
 * ⚠️ ทำไมต้องเช็คในโค้ดด้วย ทั้งที่ RLS ก็เช็คอยู่แล้ว:
 *   RLS กันได้เฉพาะเส้นทางที่เขียนผ่าน JWT ของผู้ใช้ ส่วนเส้นทางที่ใช้ service-role
 *   จะ bypass RLS ทั้งหมด (ระบบนี้ยังใช้ service-role อยู่หลายจุดที่ย้ายไม่ได้)
 *   และ RLS ที่ปฏิเสธจะคืน 0 แถวเงียบ ๆ ไม่ได้บอกผู้ใช้ว่าเพราะอะไร
 *   การเช็คในโค้ดจึงให้ทั้งการกันจริงและข้อความที่อธิบายสาเหตุได้
 *
 * ไม่ใช่ Server Action เพื่อให้เรียกจาก action ไฟล์ไหนก็ได้โดยไม่กลายเป็น endpoint
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export const SUPPORT_ACCESS_REQUIRED_MESSAGE =
  "ทีมงาน HorSet ต้องได้รับอนุมัติสิทธิ์เข้าช่วยเหลือจากเจ้าของหอพักก่อน " +
  "กรุณากดปุ่ม \"ขอสิทธิ์\" แล้วรอให้แอดมินของหอกดยอมรับ"

/**
 * เจ้าของหอกดอนุมัติให้ทีมงานเข้าช่วยเหลือหอนี้แล้วหรือยัง
 *
 * คืน false เมื่ออ่านไม่ได้หรือไม่มีแถว — ตั้งใจให้ fail-closed
 * (ปฏิเสธเมื่อไม่แน่ใจ ดีกว่าปล่อยผ่านเพราะอ่านสถานะไม่สำเร็จ)
 */
export async function hasApprovedSupportGrant(
  db: SupabaseClient,
  workspaceId: string | null | undefined
): Promise<boolean> {
  if (!workspaceId) return false

  const { data, error } = await db
    .from("support_access_grants")
    .select("status")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) {
    console.error("support-access: อ่านสถานะสิทธิ์เข้าช่วยเหลือไม่สำเร็จ:", error.message)
    return false
  }

  return data?.status === "approved"
}

/**
 * ด่านสำหรับ Server Action ที่ super admin อาจเรียกเพื่อจัดการข้อมูลของหอพัก
 *
 * คืน null เมื่อผ่าน (ไม่ใช่ super admin หรือเป็น super admin ที่ได้รับอนุมัติแล้ว)
 * คืนข้อความบอกเหตุผลเมื่อไม่ผ่าน ให้ผู้เรียกส่งกลับเป็น error ได้ตรง ๆ
 */
export async function blockUnapprovedSupportAccess(args: {
  db: SupabaseClient
  isSuperAdmin: boolean
  workspaceId: string | null | undefined
}): Promise<string | null> {
  const { db, isSuperAdmin, workspaceId } = args
  if (!isSuperAdmin) return null

  if (!workspaceId) {
    return "ไม่พบหอพักเป้าหมาย กรุณาเลือกหอพักจากเมนูด้านบนก่อน"
  }

  const approved = await hasApprovedSupportGrant(db, workspaceId)
  return approved ? null : SUPPORT_ACCESS_REQUIRED_MESSAGE
}
