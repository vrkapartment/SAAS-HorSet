import type { SupabaseClient } from "@supabase/supabase-js"
import { generatePortalToken } from "@/features/tenant/actions"

/**
 * ส่งสลิปโอนเงินผ่านห้องแชท LINE ได้โดยตรง
 *
 * ผู้เช่าถ่ายรูปสลิปส่งในแชทเหมือนคุยกับคนปกติ ไม่ต้องเปิดหน้าเว็บ ไม่ต้องรอโหลด
 *
 * ⚠️ กติกาสำคัญ: ระบบ "ไม่" นับทุกรูปที่ส่งเข้ามาเป็นสลิป — ผู้เช่าต้องกดปุ่ม "ส่งสลิป"
 * ใน rich menu ก่อน (postback) ถึงจะเปิดโหมดรับสลิปไว้ชั่วคราว หอที่ใช้ LINE OA คุยเรื่องอื่น
 * ด้วยจึงปลอดภัยโดยอัตโนมัติ ไม่ต้องมีสวิตช์ให้เจ้าหอมาตัดสินใจ
 *
 * เมื่อได้สลิปแล้วส่งต่อเข้า updateBillStatus() ตัวเดิมที่หน้าเว็บใช้ จึงได้ SlipOK อัตโนมัติ
 * การปิดบิลเมื่อตรวจผ่าน คิว retry และการแจ้งเตือนแอดมิน มาครบโดยไม่ต้องเขียนซ้ำ
 */

/** ช่วงเวลาที่รับสลิปหลังผู้เช่ากดปุ่ม — สั้นพอจะไม่เผลอนับรูปอื่น ยาวพอให้หาสลิปในเครื่องทัน */
export const SLIP_ARM_WINDOW_MS = 10 * 60 * 1000

const STORAGE_BUCKET = "payment-slips"
const STORAGE_PATH_PREFIX = "line-slips"

/** postback data ของปุ่ม "ส่งสลิป" ใน rich menu */
export const SLIP_ARM_POSTBACK = "action=arm_slip"

/** ขึ้นต้น postback data ของปุ่มเลือกบิล (ตอนมีบิลค้างหลายรอบ) */
const SLIP_ATTACH_PREFIX = "slip|"

export type LineTextMessage = { type: "text"; text: string; quickReply?: LineQuickReply }
export type LineQuickReply = {
  items: {
    type: "action"
    action: { type: "postback"; label: string; data: string; displayText?: string }
  }[]
}

type TenantRow = {
  id: string
  room_id: string | null
  slip_armed_at: string | null
}

type BillRow = {
  id: string
  billing_cycle: string
  amount: number
  slip_url: string | null
}

type Ctx = {
  db: SupabaseClient
  workspaceId: string
  lineUserId: string
  channelAccessToken: string
  /** URL ของแอป ใช้ทำลิงก์สำรองไปหน้าอัปโหลดบนเว็บ (ว่างได้) */
  appUrl: string
}

function text(message: string): LineTextMessage {
  return { type: "text", text: message }
}

/** หาสัญญาที่ยังใช้งานอยู่ของ LINE คนนี้ในหอนี้ */
async function findTenant(ctx: Ctx): Promise<TenantRow | null> {
  const { data, error } = await ctx.db
    .from("tenants")
    .select("id, room_id, slip_armed_at")
    .eq("line_user_id", ctx.lineUserId)
    .eq("workspace_id", ctx.workspaceId)
    .not("room_id", "is", null)
    .order("lease_start", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // คอลัมน์ slip_armed_at ยังไม่ถูกเพิ่ม (ยังไม่ได้รัน SQL patch) — ถือว่าใช้ฟีเจอร์นี้ไม่ได้
    if (error.code === "42703" || (error.message || "").includes("slip_armed_at")) {
      console.warn("line-slip: ยังไม่ได้รัน database_patch_add_line_slip_upload.sql")
      return null
    }
    console.error("line-slip: หา tenant ไม่สำเร็จ:", error.message)
    return null
  }
  return (data as TenantRow | null) ?? null
}

/** บิลที่ยังไม่ได้ชำระของห้องนี้ เรียงรอบล่าสุดก่อน */
async function findUnpaidBills(ctx: Ctx, roomId: string): Promise<BillRow[]> {
  const { data, error } = await ctx.db
    .from("bills")
    .select("id, billing_cycle, amount, slip_url")
    .eq("workspace_id", ctx.workspaceId)
    .eq("room_id", roomId)
    .eq("status", "unpaid")
    .order("billing_cycle", { ascending: false })

  if (error) {
    console.error("line-slip: หาบิลค้างชำระไม่สำเร็จ:", error.message)
    return []
  }
  return (data as BillRow[] | null) ?? []
}

function slipStoragePath(workspaceId: string, messageId: string) {
  return `${STORAGE_PATH_PREFIX}/${workspaceId}/${messageId}.jpg`
}

/** ลิงก์หน้าอัปโหลดบนเว็บ ใช้เป็นทางเลือกสำรองในข้อความตอบกลับ */
async function buildUploadPageUrl(ctx: Ctx, roomId: string): Promise<string> {
  if (!ctx.appUrl) return ""
  const token = await generatePortalToken(ctx.workspaceId, roomId)
  const params = new URLSearchParams({
    workspace_id: ctx.workspaceId,
    room_id: roomId,
    token,
    action: "slip"
  })
  return `${ctx.appUrl}/portal?${params.toString()}`
}

/**
 * กดปุ่ม "ส่งสลิป" ใน rich menu — เปิดโหมดรับสลิปไว้ชั่วคราว
 */
export async function armSlipUpload(ctx: Ctx): Promise<LineTextMessage[]> {
  const tenant = await findTenant(ctx)
  if (!tenant || !tenant.room_id) {
    return [
      text(
        "ยังไม่พบห้องพักที่ผูกกับบัญชี LINE นี้\n\n" +
          "กรุณาขอ \"ลิงก์ลงทะเบียนผู้เช่า\" จากผู้ดูแลหอพักก่อนใช้งานครับ"
      )
    ]
  }

  const bills = await findUnpaidBills(ctx, tenant.room_id)
  if (bills.length === 0) {
    return [text("ตอนนี้ห้องของคุณไม่มีบิลค้างชำระครับ 🎉\n\nหากเพิ่งโอนเงินไปแล้วรอสักครู่ ระบบอาจกำลังอัปเดตอยู่")]
  }

  const { error } = await ctx.db
    .from("tenants")
    .update({ slip_armed_at: new Date().toISOString() })
    .eq("id", tenant.id)

  if (error) {
    console.error("line-slip: บันทึก slip_armed_at ไม่สำเร็จ:", error.message)
    return [text("ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ")]
  }

  const minutes = Math.round(SLIP_ARM_WINDOW_MS / 60000)
  const uploadUrl = await buildUploadPageUrl(ctx, tenant.room_id)

  return [
    text(
      `📤 ส่งรูปสลิปโอนเงินเข้ามาในแชทนี้ได้เลยครับ (ภายใน ${minutes} นาที)\n\n` +
        "ระบบจะตรวจสอบและอัปเดตสถานะบิลให้อัตโนมัติ" +
        (uploadUrl ? `\n\nหรืออัปโหลดผ่านหน้าเว็บได้ที่\n${uploadUrl}` : "")
    )
  ]
}

/** ดึงไฟล์รูปจาก LINE แล้วเก็บขึ้น Storage — ชื่อไฟล์ผูกกับ messageId เพื่อกันซ้ำเวลา LINE ส่งซ้ำ */
async function downloadAndStoreSlip(ctx: Ctx, messageId: string): Promise<string | null> {
  const path = slipStoragePath(ctx.workspaceId, messageId)

  let res: Response
  try {
    res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${ctx.channelAccessToken}` }
    })
  } catch (err) {
    console.error("line-slip: ดึงรูปจาก LINE ไม่สำเร็จ:", err)
    return null
  }
  if (!res.ok) {
    console.error(`line-slip: LINE ตอบ ${res.status} ตอนขอไฟล์รูป`)
    return null
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  const { error } = await ctx.db.storage
    .from(STORAGE_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", cacheControl: "3600", upsert: true })

  if (error) {
    console.error("line-slip: อัปโหลดสลิปขึ้น Storage ไม่สำเร็จ:", error.message)
    return null
  }

  const { data } = ctx.db.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * ส่งสลิปเข้าบิลใบที่ระบุ โดยใช้เส้นทางเดียวกับหน้าเว็บทุกประการ
 *
 * ปิดโหมดรับสลิปทันทีที่แปะสำเร็จ ไม่ปล่อยค้างจนหมดเวลาเอง — ไม่งั้นรูปถัดไปที่ผู้เช่าส่ง
 * (เช่นถ่ายห้องให้ดู) จะยังถูกจับเข้าโหมดสลิปอยู่
 */
async function attachSlip(ctx: Ctx, bill: BillRow, roomId: string, slipUrl: string): Promise<LineTextMessage[]> {
  const token = await generatePortalToken(ctx.workspaceId, roomId)
  const { updateBillStatus } = await import("@/features/billing/actions")

  const res = await updateBillStatus(bill.id, "pending", slipUrl, Number(bill.amount ?? 0), {
    workspaceId: ctx.workspaceId,
    room: { roomId },
    token
  })

  if (!res.success) {
    console.error("line-slip: updateBillStatus ไม่สำเร็จ:", res.error)
    return [text(`ส่งสลิปไม่สำเร็จครับ (${res.error || "ระบบขัดข้อง"})\n\nกรุณาลองใหม่อีกครั้ง`)]
  }

  await ctx.db
    .from("tenants")
    .update({ slip_armed_at: null })
    .eq("line_user_id", ctx.lineUserId)
    .eq("workspace_id", ctx.workspaceId)

  // updateBillStatus จะปิดบิลเป็น "paid" ให้เองเมื่อ SlipOK ตรวจผ่าน — อ่านสถานะจริงกลับมาบอกผู้เช่า
  const { data: after } = await ctx.db.from("bills").select("status").eq("id", bill.id).maybeSingle()
  const paid = after?.status === "paid"

  return [
    text(
      paid
        ? `✅ ตรวจสอบสลิปผ่านเรียบร้อยแล้ว\n\nบิลรอบ ${bill.billing_cycle} ถูกบันทึกเป็น "ชำระเงินแล้ว" ขอบคุณครับ 🙏`
        : `📨 รับสลิปของรอบ ${bill.billing_cycle} เรียบร้อยแล้วครับ\n\nส่งให้เจ้าหน้าที่ตรวจสอบแล้ว จะอัปเดตสถานะบิลให้เร็วที่สุด`
    )
  ]
}

/**
 * ผู้เช่าส่งรูปเข้ามาในแชท
 *
 * คืนค่าเป็น null เมื่อไม่ควรตอบอะไรเลย (ไม่ใช่ผู้เช่า / ไม่ได้กดปุ่มก่อน / ไม่มีบิลค้าง)
 * เพื่อไม่ให้บอตไปทักคนที่แค่ส่งรูปคุยเรื่องอื่น
 */
export async function handleSlipImage(ctx: Ctx, messageId: string): Promise<LineTextMessage[] | null> {
  const tenant = await findTenant(ctx)
  if (!tenant || !tenant.room_id) return null

  const armedAt = tenant.slip_armed_at ? new Date(tenant.slip_armed_at).getTime() : 0
  const isArmed = armedAt > 0 && Date.now() - armedAt <= SLIP_ARM_WINDOW_MS

  const bills = await findUnpaidBills(ctx, tenant.room_id)

  if (!isArmed) {
    // เตือนเฉพาะคนที่มีบิลค้างจริง — คนอื่นส่งรูปคุยเล่นได้ตามปกติโดยบอตไม่ไปยุ่ง
    if (bills.length === 0) return null
    return [
      text(
        "ถ้าต้องการส่งสลิปโอนเงิน กรุณากดปุ่ม \"ส่งสลิป\" ในเมนูด้านล่างก่อนนะครับ\n\n" +
          "แล้วค่อยส่งรูปสลิปตามเข้ามา ระบบจะได้แยกออกว่ารูปไหนคือสลิป"
      )
    ]
  }

  if (bills.length === 0) {
    return [text("ตอนนี้ห้องของคุณไม่มีบิลค้างชำระครับ 🎉")]
  }

  // กันซ้ำ: LINE ส่ง webhook ซ้ำได้เมื่อระบบตอบช้า — ชื่อไฟล์ผูกกับ messageId จึงเช็คได้ว่าเคยรับแล้ว
  const alreadyAttached = bills.some(b => (b.slip_url || "").includes(`${messageId}.jpg`))
  if (alreadyAttached) return null

  const slipUrl = await downloadAndStoreSlip(ctx, messageId)
  if (!slipUrl) {
    return [text("รับรูปสลิปไม่สำเร็จครับ กรุณาลองส่งใหม่อีกครั้ง")]
  }

  if (bills.length === 1) {
    return attachSlip(ctx, bills[0], tenant.room_id, slipUrl)
  }

  // มีบิลค้างหลายรอบ — ให้ผู้เช่าเลือกเองว่าสลิปใบนี้จ่ายของรอบไหน ไม่เดาแทน
  // (รูปเก็บขึ้น Storage แล้ว รอแค่ผูกกับบิล จึงส่งแค่ messageId ไปกับปุ่มก็พอ)
  const items: LineQuickReply["items"] = bills.slice(0, 13).map(b => ({
    type: "action" as const,
    action: {
      type: "postback" as const,
      label: `${b.billing_cycle} · ${Number(b.amount ?? 0).toLocaleString()}฿`.slice(0, 20),
      data: `${SLIP_ATTACH_PREFIX}${b.id}|${messageId}`,
      displayText: `จ่ายรอบ ${b.billing_cycle}`
    }
  }))

  return [
    {
      type: "text",
      text: `ห้องของคุณมีบิลค้างชำระ ${bills.length} รอบครับ\n\nสลิปใบนี้เป็นการชำระของรอบไหน?`,
      quickReply: { items }
    }
  ]
}

/** ผู้เช่ากดเลือกรอบบิลจาก quick reply */
export async function handleSlipBillChoice(ctx: Ctx, data: string): Promise<LineTextMessage[] | null> {
  if (!data.startsWith(SLIP_ATTACH_PREFIX)) return null

  const [, billId, messageId] = data.split("|")
  if (!billId || !messageId) return null

  const tenant = await findTenant(ctx)
  if (!tenant || !tenant.room_id) return null

  // ต้องยืนยันว่าบิลใบนี้เป็นของห้องผู้เช่าคนนี้จริง ไม่เชื่อ billId ที่ส่งกลับมาลอย ๆ
  const { data: bill } = await ctx.db
    .from("bills")
    .select("id, billing_cycle, amount, slip_url")
    .eq("id", billId)
    .eq("workspace_id", ctx.workspaceId)
    .eq("room_id", tenant.room_id)
    .maybeSingle()

  if (!bill) return [text("ไม่พบบิลใบที่เลือกครับ กรุณาลองส่งสลิปใหม่อีกครั้ง")]

  const path = slipStoragePath(ctx.workspaceId, messageId)
  const { data: publicData } = ctx.db.storage.from(STORAGE_BUCKET).getPublicUrl(path)

  return attachSlip(ctx, bill as BillRow, tenant.room_id, publicData.publicUrl)
}
