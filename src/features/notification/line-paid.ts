/**
 * ส่งข้อความแจ้งผู้เช่าทาง LINE เมื่อบิลถูกปิดเป็น "ชำระเงินแล้ว"
 *
 * บิลกลายเป็น paid ได้ 3 ทาง และทุกทางต้องแจ้งผู้เช่าเหมือนกันหมด:
 *   1. แอดมินกดยืนยันการชำระเงินเอง       (updateBillStatus(id, "paid"))
 *   2. SlipOK ตรวจสลิปผ่านแล้วปิดบิลให้ทันที (ในเส้นทาง "pending" ของ updateBillStatus)
 *   3. SlipOK retry cron ตรวจผ่านทีหลัง      (api/cron/retry-slipok-verification)
 *
 * ไฟล์นี้ตั้งใจไม่ใช่ Server Action เพราะข้อ 3 เป็น route handler ที่ไม่มี session
 * (เหตุผลเดียวกับ richmenu-admin.ts)
 *
 * หลักการสำคัญ: **ห้ามทำให้การปิดบิลล้มเหลว** ไม่ว่าจะส่งไม่สำเร็จด้วยเหตุใด
 * เงินเข้าแล้วและบิลถูกปิดไปแล้ว การแจ้งเตือนพลาดเป็นเรื่องรองเสมอ
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { renderPaidMessage, resolvePaidMessageTemplate } from "./paid-message"

export type PaidNotifyResult =
  | { sent: true }
  | { sent: false; reason: string }

type SettingsRow = {
  channel_access_token: string | null
  paid_notify_enabled: boolean | null
  paid_notify_template: string | null
}

/** คอลัมน์ของ patch นี้ยังไม่ถูกเพิ่ม — ถือว่ายังใช้ฟีเจอร์นี้ไม่ได้ แทนที่จะพังทั้ง flow */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === "42703" || (error.message || "").includes("paid_notify_")
}

export const PAID_NOTIFY_COLUMN_HINT =
  "ตารางฐานข้อมูลยังไม่มีคอลัมน์สำหรับแจ้งเตือนชำระเงิน กรุณารัน database_patch_add_paid_notify.sql ใน Supabase SQL Editor ก่อน"

/**
 * แจ้งผู้เช่าว่าบิลใบนี้ชำระเรียบร้อยแล้ว
 *
 * คืน { sent: false, reason } ในทุกกรณีที่ไม่ได้ส่ง (ปิดสวิตช์ / ผู้เช่าไม่ได้ผูก LINE /
 * ยังไม่ได้ตั้ง token) โดยไม่ throw — ผู้เรียกแค่เอาไป log ไม่ต้องจัดการอะไรต่อ
 */
export async function sendTenantPaidNotification(args: {
  db: SupabaseClient
  billId: string
  workspaceId: string
}): Promise<PaidNotifyResult> {
  const { db, billId, workspaceId } = args
  if (!billId || !workspaceId) return { sent: false, reason: "ไม่มี billId หรือ workspaceId" }

  const { data: settingsData, error: settingsError } = await db
    .from("workspace_line_settings")
    .select("channel_access_token, paid_notify_enabled, paid_notify_template")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (settingsError) {
    if (isMissingColumn(settingsError)) {
      console.warn("line-paid: ยังไม่ได้รัน database_patch_add_paid_notify.sql")
      return { sent: false, reason: "ยังไม่ได้รัน SQL patch" }
    }
    console.error("line-paid: อ่านการตั้งค่าไม่สำเร็จ:", settingsError.message)
    return { sent: false, reason: settingsError.message }
  }

  const settings = (settingsData as SettingsRow | null) ?? null
  if (settings?.paid_notify_enabled === false) {
    return { sent: false, reason: "หอพักปิดการแจ้งเตือนนี้ไว้" }
  }

  const channelAccessToken = settings?.channel_access_token?.trim() || ""
  if (!channelAccessToken || channelAccessToken === "placeholder") {
    return { sent: false, reason: "ยังไม่ได้ตั้งค่า Channel Access Token" }
  }

  const { data: bill, error: billError } = await db
    .from("bills")
    .select("id, room_id, room_number, billing_cycle, amount, workspace_id")
    .eq("id", billId)
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (billError || !bill) {
    return { sent: false, reason: billError?.message || "ไม่พบบิล" }
  }

  // หาผู้เช่าปัจจุบันของห้องนี้ที่ผูก LINE ไว้ — เอาสัญญาล่าสุดก่อน เพราะห้องหนึ่งอาจมี
  // ประวัติผู้เช่าเก่าค้างอยู่ ไม่ควรส่งใบเสร็จของคนใหม่ไปหาคนเก่า
  const { data: tenants } = await db
    .from("tenants")
    .select("tenant_name, line_user_id, lease_start")
    .eq("workspace_id", workspaceId)
    .eq("room_id", bill.room_id)
    .not("line_user_id", "is", null)
    .order("lease_start", { ascending: false })
    .limit(1)

  const tenant = (tenants || [])[0] as { tenant_name?: string; line_user_id?: string } | undefined
  const lineUserId = tenant?.line_user_id?.trim() || ""
  if (!lineUserId) {
    return { sent: false, reason: "ผู้เช่าห้องนี้ยังไม่ได้ผูกบัญชี LINE" }
  }

  const { data: workspace } = await db
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle()

  const message = renderPaidMessage(resolvePaidMessageTemplate(settings?.paid_notify_template), {
    tenantName: tenant?.tenant_name || "",
    workspaceName: (workspace as { name?: string } | null)?.name || "",
    roomNumber: bill.room_number || "",
    billingCycle: bill.billing_cycle || "",
    amount: Number(bill.amount ?? 0),
    paidAt: new Date()
  })

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`
      },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: message }] })
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`line-paid: LINE ตอบ ${res.status} — ${body.slice(0, 200)}`)
      return { sent: false, reason: `LINE ตอบ HTTP ${res.status}` }
    }
  } catch (err) {
    console.error("line-paid: ส่งข้อความไม่สำเร็จ:", err)
    return { sent: false, reason: err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ" }
  }

  return { sent: true }
}

/**
 * เรียกแบบ "ยิงแล้วลืม" — ไม่มีทางทำให้ผู้เรียกพัง
 *
 * ใช้ในจุดที่ปิดบิลสำเร็จไปแล้ว การแจ้งเตือนพลาดจึงไม่ควรย้อนกลับไปทำให้ผลลัพธ์เป็น error
 */
export async function notifyTenantPaidSafely(args: {
  db: SupabaseClient
  billId: string
  workspaceId: string
}): Promise<void> {
  try {
    const result = await sendTenantPaidNotification(args)
    if (!result.sent) {
      console.log(`line-paid: ไม่ได้ส่งแจ้งเตือนบิล ${args.billId} — ${result.reason}`)
    }
  } catch (err) {
    console.error("line-paid: แจ้งเตือนผู้เช่าไม่สำเร็จ:", err)
  }
}
