/**
 * คำสั่งของ "เมนูผู้ดูแลหอ" ที่บอทตอบกลับในแชท LINE
 *
 * ทำไมต้องมี: เมนูผู้เช่าถูกตั้งเป็น default ของทั้ง channel เจ้าของหอที่แอด OA มาเพื่อรับ
 * แจ้งเตือนสลิปจึงได้เมนูผู้เช่าไปด้วย กดปุ่มไหนก็เจอ "ไม่พบห้องพักที่ผูกกับบัญชีนี้"
 * เราจึงผูกเมนูอีกใบให้เฉพาะ UID ของแอดมิน (ดู richmenu-actions.ts)
 *
 * ขอบเขตที่ตั้งใจจำกัดไว้ — เพราะข้อมูลตรงนี้เข้าถึงได้โดย "ไม่ผ่าน 2FA" ต่างจากหน้าหลังบ้าน:
 *   1. อ่านอย่างเดียว ไม่มีคำสั่งไหนแก้ข้อมูลได้เลย การกระทำทุกอย่างต้องไปทำบนเว็บ
 *   2. ไม่แสดงชื่อหรือเบอร์ผู้เช่า แสดงแค่เลขห้อง — ลดความเสียหายถ้ามือถือแอดมินหลุดมือ
 *   3. ตรวจสิทธิ์จาก admin_line_user_id ทุกครั้งที่กด ไม่เชื่อว่า "เคยผูกเมนูไว้"
 *      เพราะเมนูที่ผูกไปแล้วยังค้างบนมือถือของคนที่ถูกถอดสิทธิ์ไปแล้วได้
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export const ADMIN_SUMMARY_POSTBACK = "action=admin_summary"
export const ADMIN_PENDING_POSTBACK = "action=admin_pending"
export const ADMIN_UNPAID_POSTBACK = "action=admin_unpaid"

/** postback ทั้งหมดที่ไฟล์นี้รับผิดชอบ */
export const ADMIN_POSTBACKS: readonly string[] = [
  ADMIN_SUMMARY_POSTBACK,
  ADMIN_PENDING_POSTBACK,
  ADMIN_UNPAID_POSTBACK
]

/** จำนวนรายการสูงสุดต่อข้อความ — LINE จำกัดข้อความละ 5,000 ตัวอักษร และยาวไปก็อ่านบนมือถือไม่ไหว */
const LIST_LIMIT = 10

export type AdminCtx = {
  db: SupabaseClient
  workspaceId: string
  lineUserId: string
  /** URL ของแอปสำหรับแนบท้ายข้อความ (ว่างได้ — แค่ไม่มีลิงก์ให้กดต่อ) */
  appUrl: string
}

export type LineTextMessage = { type: "text"; text: string }

function text(message: string): LineTextMessage {
  return { type: "text", text: message }
}

function baht(value: unknown): string {
  return Number(value ?? 0).toLocaleString("th-TH")
}

/**
 * วันที่แบบไทยสั้น ๆ เช่น "6 ก.ย."
 *
 * ตัดปีออกตั้งใจ — เป็นสรุป "วันนี้" ปีจึงไม่ได้ให้ข้อมูลอะไรเพิ่ม และถ้าใส่ไว้จะได้ พ.ศ. (2569)
 * มาอยู่บรรทัดเดียวกับรอบบิลที่เป็น ค.ศ. (2026-08) ซึ่งอ่านแล้วชวนสับสน
 */
function thaiDate(input: Date): string {
  return input.toLocaleDateString("th-TH", { day: "numeric", month: "short" })
}

/** วันเวลาแบบสั้นสำหรับรายการในลิสต์ เช่น "6 ก.ย. 11:21" */
function thaiDateTime(iso: string | null): string {
  if (!iso) return "-"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  return `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`
}

/**
 * UID ของแอดมินหอนี้
 *
 * นับรวมคนที่ปิดแจ้งเตือนไว้ (disabled_admin_line_user_ids) ด้วย — การ mute คือ
 * "ไม่อยากโดนเตือน" ไม่ใช่ "หมดสิทธิ์ดูข้อมูล" จึงยังใช้เมนูได้ตามปกติ
 */
export async function findWorkspaceAdminIds(
  db: SupabaseClient,
  workspaceId: string
): Promise<string[]> {
  const { data, error } = await db
    .from("workspace_line_settings")
    .select("admin_line_user_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) {
    console.error("line-admin: อ่านรายชื่อแอดมินไม่สำเร็จ:", error.message)
    return []
  }

  return splitUids(data?.admin_line_user_id)
}

/** แยกสตริง UID ที่คั่นด้วย comma / เว้นวรรค / ขึ้นบรรทัดใหม่ ให้เป็นอาเรย์ที่ไม่ซ้ำกัน */
export function splitUids(raw: string | null | undefined): string[] {
  const parts = (raw || "")
    .split(/[\s,\n]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0)
  return [...new Set(parts)]
}

type BillRow = {
  room_number: string | null
  billing_cycle: string | null
  amount: number | null
  updated_at: string | null
}

/** สรุปตัวเลขรวมของหอ ณ วันนี้ */
async function buildSummary(ctx: AdminCtx): Promise<LineTextMessage[]> {
  const [wsRes, unpaidRes, pendingRes, roomsRes] = await Promise.all([
    ctx.db.from("workspaces").select("name").eq("id", ctx.workspaceId).maybeSingle(),
    ctx.db.from("bills").select("amount").eq("workspace_id", ctx.workspaceId).eq("status", "unpaid"),
    ctx.db
      .from("bills")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "pending"),
    ctx.db.from("rooms").select("status").eq("workspace_id", ctx.workspaceId)
  ])

  const unpaidBills = (unpaidRes.data as { amount: number | null }[] | null) ?? []
  const unpaidTotal = unpaidBills.reduce((sum, b) => sum + Number(b.amount ?? 0), 0)
  const pendingCount = pendingRes.count ?? 0

  const rooms = (roomsRes.data as { status: string | null }[] | null) ?? []
  const vacant = rooms.filter(r => r.status === "available").length

  const workspaceName = (wsRes.data as { name?: string } | null)?.name || "หอพัก"

  const lines = [
    `📊 สรุป ${workspaceName} · ${thaiDate(new Date())}`,
    "",
    `• บิลค้างชำระ ${unpaidBills.length} ใบ · ${baht(unpaidTotal)} บาท`,
    `• สลิปรอตรวจ ${pendingCount} ใบ`,
    `• ห้องว่าง ${vacant} จาก ${rooms.length} ห้อง`
  ]

  if (ctx.appUrl) {
    lines.push("", `ดูรายละเอียดที่หลังบ้าน\n${ctx.appUrl}/dashboard`)
  }

  return [text(lines.join("\n"))]
}

/** บิลที่ผู้เช่าส่งสลิปมาแล้วรอเจ้าหน้าที่ตรวจ */
async function buildPendingSlips(ctx: AdminCtx): Promise<LineTextMessage[]> {
  const { data, error } = await ctx.db
    .from("bills")
    .select("room_number, billing_cycle, amount, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "pending")
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT + 1)

  if (error) {
    console.error("line-admin: อ่านสลิปรอตรวจไม่สำเร็จ:", error.message)
    return [text("อ่านข้อมูลไม่สำเร็จครับ กรุณาลองใหม่อีกครั้ง")]
  }

  const bills = (data as BillRow[] | null) ?? []
  if (bills.length === 0) {
    return [text("ไม่มีสลิปรอตรวจสอบครับ 🎉")]
  }

  const shown = bills.slice(0, LIST_LIMIT)
  const lines = [`🧾 สลิปรอตรวจสอบ ${bills.length > LIST_LIMIT ? `${LIST_LIMIT}+` : shown.length} ใบ`, ""]
  for (const b of shown) {
    lines.push(
      `• ห้อง ${b.room_number || "-"} · รอบ ${b.billing_cycle || "-"} · ${baht(b.amount)} บาท`,
      `  ส่งเมื่อ ${thaiDateTime(b.updated_at)}`
    )
  }

  if (bills.length > LIST_LIMIT) {
    lines.push("", `(แสดง ${LIST_LIMIT} รายการล่าสุด)`)
  }
  if (ctx.appUrl) {
    lines.push("", `ตรวจสลิปที่หลังบ้าน\n${ctx.appUrl}/manage-bills`)
  }

  return [text(lines.join("\n"))]
}

/** ห้องที่ยังไม่ได้ชำระ เรียงรอบเก่าสุดก่อนเพราะเป็นหนี้ที่ค้างนานที่สุด */
async function buildUnpaid(ctx: AdminCtx): Promise<LineTextMessage[]> {
  const { data, error } = await ctx.db
    .from("bills")
    .select("room_number, billing_cycle, amount, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "unpaid")
    .order("billing_cycle", { ascending: true })

  if (error) {
    console.error("line-admin: อ่านบิลค้างชำระไม่สำเร็จ:", error.message)
    return [text("อ่านข้อมูลไม่สำเร็จครับ กรุณาลองใหม่อีกครั้ง")]
  }

  const bills = (data as BillRow[] | null) ?? []
  if (bills.length === 0) {
    return [text("ไม่มีห้องค้างชำระครับ 🎉")]
  }

  // ยอดรวมนับจากทุกใบ ไม่ใช่แค่ที่แสดง — ไม่งั้นเจ้าหอจะเข้าใจยอดหนี้รวมผิด
  const total = bills.reduce((sum, b) => sum + Number(b.amount ?? 0), 0)
  const shown = bills.slice(0, LIST_LIMIT)

  const lines = [`🔴 ห้องค้างชำระ ${bills.length} ใบ · รวม ${baht(total)} บาท`, ""]
  for (const b of shown) {
    lines.push(`• ห้อง ${b.room_number || "-"} · รอบ ${b.billing_cycle || "-"} · ${baht(b.amount)} บาท`)
  }

  if (bills.length > LIST_LIMIT) {
    lines.push("", `(แสดง ${LIST_LIMIT} รายการที่ค้างนานที่สุด)`)
  }
  if (ctx.appUrl) {
    lines.push("", `ดูทั้งหมดที่หลังบ้าน\n${ctx.appUrl}/manage-bills`)
  }

  return [text(lines.join("\n"))]
}

/**
 * จัดการ postback ของเมนูแอดมิน
 *
 * คืน null เมื่อไม่ใช่คำสั่งของเมนูนี้ เพื่อให้ webhook ส่งต่อให้ตัวจัดการอื่น
 */
export async function handleAdminPostback(
  ctx: AdminCtx,
  data: string
): Promise<LineTextMessage[] | null> {
  if (!ADMIN_POSTBACKS.includes(data)) return null

  const adminIds = await findWorkspaceAdminIds(ctx.db, ctx.workspaceId)
  if (!adminIds.includes(ctx.lineUserId)) {
    // เมนูที่ผูกไว้ยังค้างบนมือถือของคนที่ถูกถอดสิทธิ์ไปแล้วได้ จึงต้องกันที่ตรงนี้เสมอ
    return [text("บัญชี LINE นี้ไม่มีสิทธิ์ผู้ดูแลของหอพักนี้แล้วครับ")]
  }

  switch (data) {
    case ADMIN_SUMMARY_POSTBACK:
      return buildSummary(ctx)
    case ADMIN_PENDING_POSTBACK:
      return buildPendingSlips(ctx)
    case ADMIN_UNPAID_POSTBACK:
      return buildUnpaid(ctx)
    default:
      return null
  }
}
