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

/**
 * ขึ้นต้น postback data ของปุ่มเลือกห้อง (ตอนผู้เช่าเช่าหลายห้องในหอเดียวกัน)
 *
 * แยกถามสองขั้นเพราะป้ายบนปุ่ม quick reply ของ LINE ยาวได้แค่ 20 ตัวอักษร
 * ยัดทั้งเลขห้อง+รอบบิล+ยอดเงินลงปุ่มเดียวไม่พอ
 */
const SLIP_ROOM_PREFIX = "sliproom|"

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
  /** เลขห้องไว้แสดงบนปุ่มตอนผู้เช่าเช่าหลายห้อง */
  roomNumber: string
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
async function findTenants(ctx: Ctx): Promise<TenantRow[]> {
  const { data, error } = await ctx.db
    .from("tenants")
    .select("id, room_id, slip_armed_at, rooms(room_number)")
    .eq("line_user_id", ctx.lineUserId)
    .eq("workspace_id", ctx.workspaceId)
    .not("room_id", "is", null)
    .order("lease_start", { ascending: false })

  if (error) {
    // คอลัมน์ slip_armed_at ยังไม่ถูกเพิ่ม (ยังไม่ได้รัน SQL patch) — ถือว่าใช้ฟีเจอร์นี้ไม่ได้
    if (error.code === "42703" || (error.message || "").includes("slip_armed_at")) {
      console.warn("line-slip: ยังไม่ได้รัน database_patch_add_line_slip_upload.sql")
      return []
    }
    console.error("line-slip: หา tenant ไม่สำเร็จ:", error.message)
    return []
  }

  // ผู้เช่าคนเดียวอาจมีหลายสัญญาในห้องเดิม (ต่อสัญญา) — ยุบให้เหลือห้องละหนึ่งแถว
  const seen = new Set<string>()
  const rows: TenantRow[] = []
  for (const row of (data || []) as Record<string, unknown>[]) {
    const roomId = typeof row.room_id === "string" ? row.room_id : ""
    if (!roomId || seen.has(roomId)) continue
    seen.add(roomId)

    const roomRel = row.rooms as { room_number?: string } | { room_number?: string }[] | null
    const room = Array.isArray(roomRel) ? roomRel[0] : roomRel

    rows.push({
      id: String(row.id),
      room_id: roomId,
      slip_armed_at: typeof row.slip_armed_at === "string" ? row.slip_armed_at : null,
      roomNumber: room?.room_number || "-"
    })
  }
  return rows
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
  const tenants = await findTenants(ctx)
  if (tenants.length === 0) {
    return [
      text(
        "ยังไม่พบห้องพักที่ผูกกับบัญชี LINE นี้\n\n" +
          "กรุณาขอ \"ลิงก์ลงทะเบียนผู้เช่า\" จากผู้ดูแลหอพักก่อนใช้งานครับ"
      )
    ]
  }

  // นับบิลค้างของทุกห้องที่ผู้เช่าคนนี้เช่าอยู่ ไม่ใช่แค่ห้องล่าสุด
  const unpaidPerRoom = await Promise.all(
    tenants.map(async t => (await findUnpaidBills(ctx, t.room_id as string)).length)
  )
  if (unpaidPerRoom.every(n => n === 0)) {
    return [text("ตอนนี้ห้องของคุณไม่มีบิลค้างชำระครับ 🎉\n\nหากเพิ่งโอนเงินไปแล้วรอสักครู่ ระบบอาจกำลังอัปเดตอยู่")]
  }

  // เปิดโหมดให้ทุกห้องพร้อมกัน — ตอนส่งรูปมาค่อยถามว่าเป็นของห้องไหน
  const { error } = await ctx.db
    .from("tenants")
    .update({ slip_armed_at: new Date().toISOString() })
    .in("id", tenants.map(t => t.id))

  if (error) {
    console.error("line-slip: บันทึก slip_armed_at ไม่สำเร็จ:", error.message)
    return [text("ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ")]
  }

  const minutes = Math.round(SLIP_ARM_WINDOW_MS / 60000)
  // ลิงก์สำรองชี้ห้องแรกที่มีบิลค้าง (หน้าเว็บมีตัวเลือกห้องของตัวเองอยู่แล้วถ้าเช่าหลายห้อง)
  const firstUnpaidIdx = unpaidPerRoom.findIndex(n => n > 0)
  const uploadUrl = await buildUploadPageUrl(ctx, tenants[firstUnpaidIdx].room_id as string)

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
  const tenants = await findTenants(ctx)
  if (tenants.length === 0) return null

  // เปิดโหมดพร้อมกันทุกห้อง จึงถือว่าเปิดอยู่ถ้ามีแถวใดแถวหนึ่งยังไม่หมดเวลา
  const isArmed = tenants.some(t => {
    const armedAt = t.slip_armed_at ? new Date(t.slip_armed_at).getTime() : 0
    return armedAt > 0 && Date.now() - armedAt <= SLIP_ARM_WINDOW_MS
  })

  // ดูบิลค้างของทุกห้องพร้อมกัน เพื่อรู้ว่าต้องถามห้องก่อนไหม
  const roomsWithBills = (
    await Promise.all(
      tenants.map(async t => ({ tenant: t, bills: await findUnpaidBills(ctx, t.room_id as string) }))
    )
  ).filter(entry => entry.bills.length > 0)

  if (!isArmed) {
    // เตือนเฉพาะคนที่มีบิลค้างจริง — คนอื่นส่งรูปคุยเล่นได้ตามปกติโดยบอตไม่ไปยุ่ง
    if (roomsWithBills.length === 0) return null
    return [
      text(
        "ถ้าต้องการส่งสลิปโอนเงิน กรุณากดปุ่ม \"ส่งสลิป\" ในเมนูด้านล่างก่อนนะครับ\n\n" +
          "แล้วค่อยส่งรูปสลิปตามเข้ามา ระบบจะได้แยกออกว่ารูปไหนคือสลิป"
      )
    ]
  }

  if (roomsWithBills.length === 0) {
    return [text("ตอนนี้ห้องของคุณไม่มีบิลค้างชำระครับ 🎉")]
  }

  // กันซ้ำ: LINE ส่ง webhook ซ้ำได้เมื่อระบบตอบช้า — ชื่อไฟล์ผูกกับ messageId จึงเช็คได้ว่าเคยรับแล้ว
  const alreadyAttached = roomsWithBills.some(entry =>
    entry.bills.some(b => (b.slip_url || "").includes(`${messageId}.jpg`))
  )
  if (alreadyAttached) return null

  const slipUrl = await downloadAndStoreSlip(ctx, messageId)
  if (!slipUrl) {
    return [text("รับรูปสลิปไม่สำเร็จครับ กรุณาลองส่งใหม่อีกครั้ง")]
  }

  // ขั้นที่ 1: เช่าหลายห้องและค้างมากกว่าหนึ่งห้อง — ต้องรู้ก่อนว่าสลิปนี้ของห้องไหน
  if (roomsWithBills.length > 1) {
    return [askWhichRoom(roomsWithBills, messageId)]
  }

  const { tenant, bills } = roomsWithBills[0]
  return respondForRoom(ctx, tenant, bills, messageId, slipUrl)
}

/** ขั้นที่ 1 — ถามว่าสลิปใบนี้เป็นของห้องไหน */
function askWhichRoom(
  entries: { tenant: TenantRow; bills: BillRow[] }[],
  messageId: string
): LineTextMessage {
  const items: LineQuickReply["items"] = entries.slice(0, 13).map(({ tenant, bills }) => ({
    type: "action" as const,
    action: {
      type: "postback" as const,
      label: `ห้อง ${tenant.roomNumber}`.slice(0, 20),
      data: `${SLIP_ROOM_PREFIX}${tenant.room_id}|${messageId}`,
      displayText: `ห้อง ${tenant.roomNumber} (ค้าง ${bills.length} รอบ)`
    }
  }))

  return {
    type: "text",
    text: `คุณเช่าอยู่ ${entries.length} ห้องที่มีบิลค้างชำระครับ\n\nสลิปใบนี้เป็นการชำระของห้องไหน?`,
    quickReply: { items }
  }
}

/** ขั้นที่ 2 — รู้ห้องแล้ว เหลือเลือกรอบบิล (ถ้าค้างรอบเดียวก็แปะให้เลย) */
async function respondForRoom(
  ctx: Ctx,
  tenant: TenantRow,
  bills: BillRow[],
  messageId: string,
  slipUrl: string
): Promise<LineTextMessage[]> {
  if (bills.length === 1) {
    return attachSlip(ctx, bills[0], tenant.room_id as string, slipUrl)
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
      text: `ห้อง ${tenant.roomNumber} มีบิลค้างชำระ ${bills.length} รอบครับ\n\nสลิปใบนี้เป็นการชำระของรอบไหน?`,
      quickReply: { items }
    }
  ]
}

/** ผู้เช่ากดเลือกห้องจาก quick reply ขั้นที่ 1 */
export async function handleSlipRoomChoice(ctx: Ctx, data: string): Promise<LineTextMessage[] | null> {
  if (!data.startsWith(SLIP_ROOM_PREFIX)) return null

  const [, roomId, messageId] = data.split("|")
  if (!roomId || !messageId) return null

  // ต้องยืนยันว่าห้องที่กดมาเป็นห้องของผู้เช่าคนนี้จริง ไม่เชื่อ roomId ที่ส่งกลับมาลอย ๆ
  const tenant = (await findTenants(ctx)).find(t => t.room_id === roomId)
  if (!tenant) return [text("ไม่พบห้องที่เลือกครับ กรุณาลองส่งสลิปใหม่อีกครั้ง")]

  const bills = await findUnpaidBills(ctx, roomId)
  if (bills.length === 0) {
    return [text(`ห้อง ${tenant.roomNumber} ไม่มีบิลค้างชำระแล้วครับ`)]
  }

  const { data: publicData } = ctx.db.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(slipStoragePath(ctx.workspaceId, messageId))

  return respondForRoom(ctx, tenant, bills, messageId, publicData.publicUrl)
}

/** ผู้เช่ากดเลือกรอบบิลจาก quick reply ขั้นที่ 2 */
export async function handleSlipBillChoice(ctx: Ctx, data: string): Promise<LineTextMessage[] | null> {
  if (!data.startsWith(SLIP_ATTACH_PREFIX)) return null

  const [, billId, messageId] = data.split("|")
  if (!billId || !messageId) return null

  const tenants = await findTenants(ctx)
  if (tenants.length === 0) return null

  // ต้องยืนยันว่าบิลใบนี้เป็นของห้องใดห้องหนึ่งที่ผู้เช่าคนนี้เช่าอยู่จริง
  const roomIds = tenants.map(t => t.room_id as string)
  const { data: bill } = await ctx.db
    .from("bills")
    .select("id, billing_cycle, amount, slip_url, room_id")
    .eq("id", billId)
    .eq("workspace_id", ctx.workspaceId)
    .in("room_id", roomIds)
    .maybeSingle()

  if (!bill) return [text("ไม่พบบิลใบที่เลือกครับ กรุณาลองส่งสลิปใหม่อีกครั้ง")]

  const path = slipStoragePath(ctx.workspaceId, messageId)
  const { data: publicData } = ctx.db.storage.from(STORAGE_BUCKET).getPublicUrl(path)

  return attachSlip(ctx, bill as BillRow, String(bill.room_id), publicData.publicUrl)
}
