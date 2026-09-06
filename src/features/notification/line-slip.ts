import type { SupabaseClient } from "@supabase/supabase-js"
import { generatePortalToken } from "@/features/tenant/actions"

/**
 * ส่งสลิปโอนเงินผ่านห้องแชท LINE ได้โดยตรง
 *
 * ผู้เช่าถ่ายรูปสลิปส่งในแชทเหมือนคุยกับคนปกติ ไม่ต้องเปิดหน้าเว็บ ไม่ต้องรอโหลด
 *
 * ลำดับคือ "ถามให้จบก่อน แล้วค่อยส่งรูป"
 *
 *   กดปุ่ม "ส่งสลิป"  →  (ถ้าเช่าหลายห้อง) ห้องไหน?
 *                     →  (ถ้าค้างหลายรอบ) รอบไหน?
 *                     →  "ส่งรูปสลิปได้เลย"  →  ผู้เช่าส่งรูป  →  แปะเข้าบิลใบนั้น
 *
 * ที่ถามก่อนส่งรูปเพราะผู้เช่าจะได้เห็นว่ากำลังจ่ายบิลใบไหนก่อนตัดสินใจ และไม่มีรูปกำพร้า
 * ค้างใน Storage เวลาเลิกกลางคัน
 *
 * ⚠️ กติกาสำคัญ: ระบบ "ไม่" นับทุกรูปที่ส่งเข้ามาเป็นสลิป — ต้องกดปุ่มก่อนเสมอ หอที่ใช้
 * LINE OA คุยเรื่องอื่นด้วยจึงปลอดภัยโดยอัตโนมัติ ไม่ต้องมีสวิตช์ให้เจ้าหอมาตัดสินใจ
 *
 * เมื่อได้สลิปแล้วส่งต่อเข้า updateBillStatus() ตัวเดิมที่หน้าเว็บใช้ จึงได้ SlipOK อัตโนมัติ
 * การปิดบิลเมื่อตรวจผ่าน คิว retry และการแจ้งเตือนแอดมิน มาครบโดยไม่ต้องเขียนซ้ำ
 */

/** ช่วงเวลาที่รับสลิปหลังผู้เช่ากดปุ่ม — สั้นพอจะไม่เผลอนับรูปอื่น ยาวพอให้ตอบคำถามและหาสลิปทัน */
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

/** จำนวนปุ่มสูงสุดที่ LINE ให้ใส่ใน quick reply ชุดเดียว */
const QUICK_REPLY_MAX = 13

export type LineTextMessage = { type: "text"; text: string; quickReply?: LineQuickReply }
export type LineQuickReply = {
  items: {
    type: "action"
    action: { type: "postback"; label: string; data: string; displayText?: string }
  }[]
}

type TenantRow = {
  id: string
  room_id: string
  slip_armed_at: string | null
  /** บิลที่เลือกไว้ รอรูปที่จะส่งตามมา */
  slip_target_bill_id: string | null
  /** เลขห้องไว้แสดงบนปุ่มตอนผู้เช่าเช่าหลายห้อง */
  roomNumber: string
}

type BillRow = {
  id: string
  billing_cycle: string
  amount: number
  slip_url: string | null
}

type RoomBills = { tenant: TenantRow; bills: BillRow[] }

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

/** ห้องทั้งหมดที่ LINE คนนี้เช่าอยู่ในหอนี้ (ยุบสัญญาซ้ำห้องเดิมออก) */
async function findTenants(ctx: Ctx): Promise<TenantRow[]> {
  const { data, error } = await ctx.db
    .from("tenants")
    .select("id, room_id, slip_armed_at, slip_target_bill_id, rooms(room_number)")
    .eq("line_user_id", ctx.lineUserId)
    .eq("workspace_id", ctx.workspaceId)
    .not("room_id", "is", null)
    .order("lease_start", { ascending: false })

  if (error) {
    // คอลัมน์ยังไม่ถูกเพิ่ม (ยังไม่ได้รัน SQL patch) — ถือว่าใช้ฟีเจอร์นี้ไม่ได้
    if (error.code === "42703" || (error.message || "").includes("slip_")) {
      console.warn("line-slip: ยังไม่ได้รัน database_patch_add_line_slip_upload.sql")
      return []
    }
    console.error("line-slip: หา tenant ไม่สำเร็จ:", error.message)
    return []
  }

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
      slip_target_bill_id:
        typeof row.slip_target_bill_id === "string" ? row.slip_target_bill_id : null,
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

/** ห้องที่มีบิลค้างพร้อมรายการบิลของแต่ละห้อง */
async function findRoomsWithBills(ctx: Ctx, tenants: TenantRow[]): Promise<RoomBills[]> {
  const all = await Promise.all(
    tenants.map(async t => ({ tenant: t, bills: await findUnpaidBills(ctx, t.room_id) }))
  )
  return all.filter(entry => entry.bills.length > 0)
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

/** เปิดโหมดรับสลิปให้ทุกห้องของผู้เช่าคนนี้ และล้างบิลเป้าหมายเดิมทิ้ง */
async function armAllRooms(ctx: Ctx, tenants: TenantRow[]): Promise<boolean> {
  const { error } = await ctx.db
    .from("tenants")
    .update({ slip_armed_at: new Date().toISOString(), slip_target_bill_id: null })
    .in("id", tenants.map(t => t.id))

  if (error) {
    console.error("line-slip: เปิดโหมดรับสลิปไม่สำเร็จ:", error.message)
    return false
  }
  return true
}

/** จำไว้ว่าผู้เช่าเลือกบิลใบไหน แล้วรอรูปที่จะส่งตามมา */
async function setTargetBill(ctx: Ctx, billId: string): Promise<boolean> {
  const { error } = await ctx.db
    .from("tenants")
    .update({ slip_armed_at: new Date().toISOString(), slip_target_bill_id: billId })
    .eq("line_user_id", ctx.lineUserId)
    .eq("workspace_id", ctx.workspaceId)

  if (error) {
    console.error("line-slip: บันทึกบิลเป้าหมายไม่สำเร็จ:", error.message)
    return false
  }
  return true
}

/** ปิดโหมดรับสลิปและล้างบิลเป้าหมาย (ใช้หลังแปะสลิปสำเร็จ) */
async function disarm(ctx: Ctx) {
  await ctx.db
    .from("tenants")
    .update({ slip_armed_at: null, slip_target_bill_id: null })
    .eq("line_user_id", ctx.lineUserId)
    .eq("workspace_id", ctx.workspaceId)
}

/** ขั้นถามห้อง — สลิปใบนี้เป็นของห้องไหน */
function askWhichRoom(entries: RoomBills[]): LineTextMessage {
  const items: LineQuickReply["items"] = entries.slice(0, QUICK_REPLY_MAX).map(({ tenant, bills }) => ({
    type: "action" as const,
    action: {
      type: "postback" as const,
      label: `ห้อง ${tenant.roomNumber}`.slice(0, 20),
      data: `${SLIP_ROOM_PREFIX}${tenant.room_id}`,
      displayText: `ห้อง ${tenant.roomNumber} (ค้าง ${bills.length} รอบ)`
    }
  }))

  return {
    type: "text",
    text: `คุณเช่าอยู่ ${entries.length} ห้องที่มีบิลค้างชำระครับ\n\nจะส่งสลิปของห้องไหน?`,
    quickReply: { items }
  }
}

/** ขั้นถามรอบบิล — จ่ายของรอบไหน */
function askWhichBill(tenant: TenantRow, bills: BillRow[]): LineTextMessage {
  const items: LineQuickReply["items"] = bills.slice(0, QUICK_REPLY_MAX).map(b => ({
    type: "action" as const,
    action: {
      type: "postback" as const,
      label: `${b.billing_cycle} · ${Number(b.amount ?? 0).toLocaleString()}฿`.slice(0, 20),
      data: `${SLIP_ATTACH_PREFIX}${b.id}`,
      displayText: `จ่ายรอบ ${b.billing_cycle}`
    }
  }))

  return {
    type: "text",
    text: `ห้อง ${tenant.roomNumber} มีบิลค้างชำระ ${bills.length} รอบครับ\n\nจะส่งสลิปของรอบไหน?`,
    quickReply: { items }
  }
}

/** ขั้นสุดท้าย — เลือกครบแล้ว บอกให้ส่งรูปได้เลย */
async function askForPhoto(ctx: Ctx, tenant: TenantRow, bill: BillRow): Promise<LineTextMessage[]> {
  if (!(await setTargetBill(ctx, bill.id))) {
    return [text("ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ")]
  }

  const minutes = Math.round(SLIP_ARM_WINDOW_MS / 60000)
  const uploadUrl = await buildUploadPageUrl(ctx, tenant.room_id)

  return [
    text(
      `📤 ส่งรูปสลิปโอนเงินเข้ามาในแชทนี้ได้เลยครับ (ภายใน ${minutes} นาที)\n\n` +
        `ห้อง ${tenant.roomNumber} · รอบ ${bill.billing_cycle}\n` +
        `ยอด ${Number(bill.amount ?? 0).toLocaleString()} บาท\n\n` +
        "ระบบจะตรวจสอบและอัปเดตสถานะบิลให้อัตโนมัติ" +
        (uploadUrl ? `\n\nหรืออัปโหลดผ่านหน้าเว็บได้ที่\n${uploadUrl}` : "")
    )
  ]
}

/** เลือกห้องได้แล้ว — ถ้าค้างรอบเดียวก็ข้ามไปขอรูปเลย ไม่ต้องถามซ้ำ */
async function afterRoomPicked(ctx: Ctx, entry: RoomBills): Promise<LineTextMessage[]> {
  if (entry.bills.length === 1) {
    return askForPhoto(ctx, entry.tenant, entry.bills[0])
  }
  return [askWhichBill(entry.tenant, entry.bills)]
}

/**
 * กดปุ่ม "ส่งสลิป" ใน rich menu — เริ่มบทสนทนา
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

  const roomsWithBills = await findRoomsWithBills(ctx, tenants)
  if (roomsWithBills.length === 0) {
    return [text("ตอนนี้ห้องของคุณไม่มีบิลค้างชำระครับ 🎉\n\nหากเพิ่งโอนเงินไปแล้วรอสักครู่ ระบบอาจกำลังอัปเดตอยู่")]
  }

  if (!(await armAllRooms(ctx, tenants))) {
    return [text("ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ")]
  }

  // เช่าหลายห้องและค้างมากกว่าหนึ่งห้อง — ต้องรู้ก่อนว่าจะจ่ายห้องไหน
  if (roomsWithBills.length > 1) {
    return [askWhichRoom(roomsWithBills)]
  }

  return afterRoomPicked(ctx, roomsWithBills[0])
}

/** ผู้เช่ากดเลือกห้อง */
export async function handleSlipRoomChoice(ctx: Ctx, data: string): Promise<LineTextMessage[] | null> {
  if (!data.startsWith(SLIP_ROOM_PREFIX)) return null

  const roomId = data.slice(SLIP_ROOM_PREFIX.length)
  if (!roomId) return null

  // ต้องยืนยันว่าห้องที่กดมาเป็นห้องของผู้เช่าคนนี้จริง ไม่เชื่อ roomId ที่ส่งกลับมาลอย ๆ
  const tenant = (await findTenants(ctx)).find(t => t.room_id === roomId)
  if (!tenant) return [text("ไม่พบห้องที่เลือกครับ กรุณากดปุ่ม \"ส่งสลิป\" ในเมนูใหม่อีกครั้ง")]

  const bills = await findUnpaidBills(ctx, roomId)
  if (bills.length === 0) {
    return [text(`ห้อง ${tenant.roomNumber} ไม่มีบิลค้างชำระแล้วครับ`)]
  }

  return afterRoomPicked(ctx, { tenant, bills })
}

/** ผู้เช่ากดเลือกรอบบิล */
export async function handleSlipBillChoice(ctx: Ctx, data: string): Promise<LineTextMessage[] | null> {
  if (!data.startsWith(SLIP_ATTACH_PREFIX)) return null

  const billId = data.slice(SLIP_ATTACH_PREFIX.length)
  if (!billId) return null

  const tenants = await findTenants(ctx)
  if (tenants.length === 0) return null

  // ต้องยืนยันว่าบิลใบนี้เป็นของห้องใดห้องหนึ่งที่ผู้เช่าคนนี้เช่าอยู่จริง
  const { data: bill } = await ctx.db
    .from("bills")
    .select("id, billing_cycle, amount, slip_url, room_id")
    .eq("id", billId)
    .eq("workspace_id", ctx.workspaceId)
    .in("room_id", tenants.map(t => t.room_id))
    .maybeSingle()

  if (!bill) return [text("ไม่พบบิลใบที่เลือกครับ กรุณากดปุ่ม \"ส่งสลิป\" ในเมนูใหม่อีกครั้ง")]

  const tenant = tenants.find(t => t.room_id === bill.room_id)
  if (!tenant) return [text("ไม่พบห้องของบิลใบนี้ครับ")]

  return askForPhoto(ctx, tenant, bill as BillRow)
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
 * ผู้เช่าส่งรูปเข้ามาในแชท
 *
 * คืนค่าเป็น null เมื่อไม่ควรตอบอะไรเลย (ไม่ใช่ผู้เช่า / ไม่มีบิลค้าง) เพื่อไม่ให้บอตไปทัก
 * คนที่แค่ส่งรูปคุยเรื่องอื่น
 */
export async function handleSlipImage(ctx: Ctx, messageId: string): Promise<LineTextMessage[] | null> {
  const tenants = await findTenants(ctx)
  if (tenants.length === 0) return null

  // เปิดโหมดพร้อมกันทุกห้อง จึงถือว่าเปิดอยู่ถ้ามีแถวใดแถวหนึ่งยังไม่หมดเวลา
  const armedRow = tenants.find(t => {
    const armedAt = t.slip_armed_at ? new Date(t.slip_armed_at).getTime() : 0
    return armedAt > 0 && Date.now() - armedAt <= SLIP_ARM_WINDOW_MS
  })

  if (!armedRow) {
    // เตือนเฉพาะคนที่มีบิลค้างจริง — คนอื่นส่งรูปคุยเล่นได้ตามปกติโดยบอตไม่ไปยุ่ง
    const roomsWithBills = await findRoomsWithBills(ctx, tenants)
    if (roomsWithBills.length === 0) return null
    return [
      text(
        "ถ้าต้องการส่งสลิปโอนเงิน กรุณากดปุ่ม \"ส่งสลิป\" ในเมนูด้านล่างก่อนนะครับ\n\n" +
          "ระบบจะถามว่าจ่ายบิลใบไหน แล้วค่อยให้ส่งรูปสลิปตามเข้ามา"
      )
    ]
  }

  // เปิดโหมดแล้วแต่ยังไม่ได้เลือกบิล (ตอบคำถามค้างไว้) — ถามต่อจากตรงที่ค้าง
  const targetBillId = tenants.find(t => t.slip_target_bill_id)?.slip_target_bill_id
  if (!targetBillId) {
    const roomsWithBills = await findRoomsWithBills(ctx, tenants)
    if (roomsWithBills.length === 0) {
      return [text("ตอนนี้ห้องของคุณไม่มีบิลค้างชำระครับ 🎉")]
    }
    if (roomsWithBills.length > 1) return [askWhichRoom(roomsWithBills)]
    return afterRoomPicked(ctx, roomsWithBills[0])
  }

  // บิลที่เลือกไว้ต้องยังค้างชำระอยู่ (อาจถูกปิดไประหว่างที่ผู้เช่าหารูป)
  const { data: bill } = await ctx.db
    .from("bills")
    .select("id, billing_cycle, amount, slip_url, room_id, status")
    .eq("id", targetBillId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle()

  if (!bill || bill.status !== "unpaid") {
    await disarm(ctx)
    return [text("บิลที่เลือกไว้ถูกอัปเดตสถานะไปแล้วครับ กรุณากดปุ่ม \"ส่งสลิป\" ในเมนูใหม่อีกครั้ง")]
  }

  // กันซ้ำ: LINE ส่ง webhook ซ้ำได้เมื่อระบบตอบช้า — ชื่อไฟล์ผูกกับ messageId จึงเช็คได้ว่าเคยรับแล้ว
  if ((bill.slip_url || "").includes(`${messageId}.jpg`)) return null

  const tenant = tenants.find(t => t.room_id === bill.room_id)
  if (!tenant) return null

  const slipUrl = await downloadAndStoreSlip(ctx, messageId)
  if (!slipUrl) {
    return [text("รับรูปสลิปไม่สำเร็จครับ กรุณาลองส่งใหม่อีกครั้ง")]
  }

  return attachSlip(ctx, bill as BillRow, tenant, slipUrl)
}

/**
 * ส่งสลิปเข้าบิลใบที่เลือกไว้ โดยใช้เส้นทางเดียวกับหน้าเว็บทุกประการ
 *
 * ปิดโหมดรับสลิปทันทีที่แปะสำเร็จ ไม่ปล่อยค้างจนหมดเวลาเอง — ไม่งั้นรูปถัดไปที่ผู้เช่าส่ง
 * (เช่นถ่ายห้องให้ดู) จะยังถูกจับเข้าโหมดสลิปอยู่
 */
async function attachSlip(
  ctx: Ctx,
  bill: BillRow,
  tenant: TenantRow,
  slipUrl: string
): Promise<LineTextMessage[]> {
  const token = await generatePortalToken(ctx.workspaceId, tenant.room_id)
  const { updateBillStatus } = await import("@/features/billing/actions")

  const res = await updateBillStatus(bill.id, "pending", slipUrl, Number(bill.amount ?? 0), {
    workspaceId: ctx.workspaceId,
    room: { roomId: tenant.room_id },
    token
  })

  if (!res.success) {
    console.error("line-slip: updateBillStatus ไม่สำเร็จ:", res.error)
    return [text(`ส่งสลิปไม่สำเร็จครับ (${res.error || "ระบบขัดข้อง"})\n\nกรุณาลองใหม่อีกครั้ง`)]
  }

  await disarm(ctx)

  // updateBillStatus จะปิดบิลเป็น "paid" ให้เองเมื่อ SlipOK ตรวจผ่าน — อ่านสถานะจริงกลับมาบอกผู้เช่า
  const { data: after } = await ctx.db.from("bills").select("status").eq("id", bill.id).maybeSingle()
  const paid = after?.status === "paid"

  return [
    text(
      paid
        ? `✅ ตรวจสอบสลิปผ่านเรียบร้อยแล้ว\n\nห้อง ${tenant.roomNumber} รอบ ${bill.billing_cycle} ถูกบันทึกเป็น "ชำระเงินแล้ว" ขอบคุณครับ 🙏`
        : `📨 รับสลิปของห้อง ${tenant.roomNumber} รอบ ${bill.billing_cycle} เรียบร้อยแล้วครับ\n\nส่งให้เจ้าหน้าที่ตรวจสอบแล้ว จะอัปเดตสถานะบิลให้เร็วที่สุด`
    )
  ]
}
