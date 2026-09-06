/**
 * ติดตั้งและผูก "เมนูผู้ดูแลหอ" ให้แอดมินเป็นรายบุคคล
 *
 * ไฟล์นี้ตั้งใจไม่ใช่ Server Action เพราะต้องเรียกจาก 2 ที่ที่ต่างกันมาก:
 *   - หน้าตั้งค่า (ผ่าน richmenu-actions.ts) — มี session ของแอดมินที่ล็อกอินอยู่
 *   - webhook ของ LINE — ไม่มี session ใด ๆ เลย ตอนแอดมินคนใหม่ผูก UID ด้วยรหัส 6 หลัก
 * ถ้าเขียนเป็น Server Action ฝั่ง webhook จะเรียกไม่ได้เพราะ assertWorkspaceAdmin ต้องใช้ cookie
 *
 * หลักการของ LINE ที่ใช้: per-user link (POST /v2/bot/user/{userId}/richmenu/{richMenuId})
 * จะ "ทับ" เมนู default ของ channel เฉพาะคนนั้น คนอื่นยังเห็นเมนูผู้เช่าตามเดิม
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  ADMIN_RICHMENU_TEMPLATE,
  DEFAULT_ADMIN_MENU_IMAGE_PATH,
  buildAdminRichMenu,
  checkRichMenuImage
} from "./richmenu"
import { splitUids } from "./line-admin"

export type LineCallResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string }

export async function lineRequest(
  url: string,
  token: string,
  init: RequestInit = {}
): Promise<LineCallResult> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) }
    })
  } catch {
    return { ok: false, error: "เชื่อมต่อ LINE API ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }

  const text = await res.text()
  if (!res.ok) {
    console.error(`LINE richmenu API ${init.method || "GET"} ${url} → ${res.status} ${text}`)
    return { ok: false, error: `LINE ตอบกลับว่าไม่สำเร็จ (HTTP ${res.status}) — ${text.slice(0, 200)}` }
  }

  try {
    return { ok: true, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
  } catch {
    return { ok: true, body: {} }
  }
}

export type AdminMenuSyncResult = {
  ok: boolean
  error?: string
  richMenuId: string | null
  /** จำนวนแอดมินที่ผูกเมนูสำเร็จ */
  linked: number
  /** จำนวนแอดมินทั้งหมดที่ควรได้เมนู */
  total: number
}

type AdminMenuRow = {
  admin_line_user_id: string | null
  richmenu_admin_id: string | null
  richmenu_admin_template_version: string | null
  richmenu_admin_linked_uids: string | null
  richmenu_admin_enabled: boolean | null
  richmenu_admin_image_url: string | null
  richmenu_admin_installed_image_url: string | null
}

/**
 * ภาพที่จะใช้ติดตั้งจริง — ภาพที่หอพักอัปโหลดเอง ถ้าไม่มีก็ใช้ภาพต้นแบบของระบบ
 *
 * แยกออกมาเป็นฟังก์ชันเพราะต้องใช้ 2 ที่: ตอนดึงไบต์ไปติดตั้ง และตอนเทียบว่าภาพที่ติดตั้ง
 * ไปแล้วตรงกับภาพปัจจุบันหรือยัง ถ้าคำนวณคนละแบบจะกลายเป็นสร้างเมนูใหม่ทุกครั้งที่ซิงก์
 */
export function resolveAdminMenuImageUrl(
  customImageUrl: string | null | undefined,
  appUrl: string
): string {
  const custom = (customImageUrl || "").trim()
  if (custom) return custom
  return appUrl ? `${appUrl}${DEFAULT_ADMIN_MENU_IMAGE_PATH}` : ""
}

/** คอลัมน์ของ patch นี้ยังไม่ถูกเพิ่ม — ถือว่าใช้ฟีเจอร์นี้ไม่ได้ แทนที่จะพังทั้ง flow */
export function isAdminMenuColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === "42703" || (error.message || "").includes("richmenu_admin_")
}

export const ADMIN_MENU_COLUMN_HINT =
  "ตารางฐานข้อมูลยังไม่มีคอลัมน์สำหรับเมนูผู้ดูแล กรุณารัน database_patch_add_line_admin_richmenu.sql ใน Supabase SQL Editor ก่อน"

async function readAdminMenuRow(
  db: SupabaseClient,
  workspaceId: string
): Promise<{ row: AdminMenuRow | null; error?: string }> {
  const { data, error } = await db
    .from("workspace_line_settings")
    .select(
      "admin_line_user_id, richmenu_admin_id, richmenu_admin_template_version, richmenu_admin_linked_uids, richmenu_admin_enabled, richmenu_admin_image_url, richmenu_admin_installed_image_url"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) {
    if (isAdminMenuColumnMissing(error)) return { row: null, error: ADMIN_MENU_COLUMN_HINT }
    return { row: null, error: error.message }
  }
  return { row: (data as AdminMenuRow | null) ?? null }
}

/**
 * ดึงไบต์ภาพเมนูแอดมินแล้วตรวจว่าส่งขึ้น LINE ได้จริง
 *
 * ตรวจซ้ำที่ฝั่งเซิร์ฟเวอร์เสมอแม้เบราว์เซอร์จะตรวจมาแล้วตอนอัปโหลด เพราะไฟล์ใน Storage
 * ถูกเปลี่ยนทีหลังได้ และ LINE จะตอบ error กำกวมถ้าขนาดไม่ตรงผัง
 */
export async function fetchAdminMenuImage(
  url: string
): Promise<{ ok: true; buffer: Buffer; type: string } | { ok: false; error: string }> {
  if (!url) return { ok: false, error: "ไม่พบภาพเมนูผู้ดูแลที่จะใช้ติดตั้ง" }

  let res: Response
  try {
    res = await fetch(url, { cache: "no-store" })
  } catch {
    return { ok: false, error: "ดาวน์โหลดภาพเมนูผู้ดูแลไม่สำเร็จ" }
  }
  if (!res.ok) {
    return { ok: false, error: `ดาวน์โหลดภาพเมนูผู้ดูแลไม่สำเร็จ (HTTP ${res.status})` }
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const check = checkRichMenuImage(buffer, ADMIN_RICHMENU_TEMPLATE)
  if (!check.ok) return { ok: false, error: check.error }

  return { ok: true, buffer, type: check.type }
}

/** ผูกเมนูให้ทีละคน — แอดมินมีไม่กี่คน จึงไม่ใช้ bulk API ที่พังทั้งชุดถ้ามี UID เสียแค่ตัวเดียว */
async function linkToUsers(
  token: string,
  richMenuId: string,
  uids: string[]
): Promise<string[]> {
  const linked: string[] = []
  for (const uid of uids) {
    const res = await lineRequest(
      `https://api.line.me/v2/bot/user/${encodeURIComponent(uid)}/richmenu/${richMenuId}`,
      token,
      { method: "POST" }
    )
    if (res.ok) {
      linked.push(uid)
    } else {
      console.warn(`richmenu-admin: ผูกเมนูให้ ${uid} ไม่สำเร็จ: ${res.error}`)
    }
  }
  return linked
}

/**
 * ถอดเมนูรายบุคคลออก ทำให้คนนั้นกลับไปเห็นเมนู default ของ channel
 *
 * ไม่ถือว่าพลาดเป็นเรื่องร้ายแรง — คนที่ถูกถอดสิทธิ์แล้วยังกดปุ่มไม่ได้อยู่ดี
 * เพราะ handleAdminPostback ตรวจสิทธิ์จากฐานข้อมูลซ้ำทุกครั้ง
 */
export async function unlinkAdminMenuFromUsers(token: string, uids: string[]): Promise<void> {
  for (const uid of uids) {
    const res = await lineRequest(
      `https://api.line.me/v2/bot/user/${encodeURIComponent(uid)}/richmenu`,
      token,
      { method: "DELETE" }
    )
    if (!res.ok) {
      console.warn(`richmenu-admin: ถอดเมนูของ ${uid} ไม่สำเร็จ: ${res.error}`)
    }
  }
}

/**
 * ทำให้เมนูแอดมินบน LINE ตรงกับรายชื่อแอดมินในฐานข้อมูล
 *
 * เรียกได้บ่อยเท่าที่ต้องการ (idempotent) — ถ้าเมนูใบเดิมยังใช้ผังเดียวกันอยู่ก็ไม่สร้างใหม่
 * แค่ผูก/ถอดให้ตรงรายชื่อปัจจุบัน
 *
 * `forceRecreate` ใช้ตอนกดปุ่มติดตั้งจากหน้าตั้งค่า เพื่อให้ได้เมนูใบใหม่แน่ ๆ แม้ผังไม่เปลี่ยน
 */
export async function syncAdminRichMenu(args: {
  db: SupabaseClient
  workspaceId: string
  channelAccessToken: string
  appUrl: string
  forceRecreate?: boolean
}): Promise<AdminMenuSyncResult> {
  const { db, workspaceId, channelAccessToken, appUrl, forceRecreate = false } = args
  const empty: AdminMenuSyncResult = { ok: false, richMenuId: null, linked: 0, total: 0 }

  if (!channelAccessToken || channelAccessToken === "placeholder") {
    return { ...empty, error: "ยังไม่ได้ตั้งค่า Channel Access Token ของหอพักนี้" }
  }
  if (!appUrl) {
    return { ...empty, error: "ระบบยังไม่ได้ตั้งค่า NEXT_PUBLIC_APP_URL จึงสร้างเมนูผู้ดูแลไม่ได้" }
  }

  const { row, error: readError } = await readAdminMenuRow(db, workspaceId)
  if (readError) return { ...empty, error: readError }

  const adminIds = splitUids(row?.admin_line_user_id)

  // หอพักปิดเมนูผู้ดูแลไว้ — เงียบไว้ ไม่ไปแตะ LINE เลย
  //
  // กันไว้ที่นี่จุดเดียวเพราะมีที่เรียก 3 ทาง (กดติดตั้ง / แอดมินใหม่ส่งรหัสใน webhook /
  // ลบ LINE Admin) ถ้าไปกันทีละที่จะพลาดง่ายและกลายเป็นว่าปิดแล้วเมนูเด้งกลับมาเอง
  // การถอดเมนูออกทำตอนกดปิดสวิตช์ไปแล้ว (teardownAdminRichMenu) ที่นี่จึงไม่ต้องทำซ้ำ
  if (row?.richmenu_admin_enabled === false) {
    return { ok: true, richMenuId: null, linked: 0, total: adminIds.length }
  }
  const previouslyLinked = splitUids(row?.richmenu_admin_linked_uids)
  const existingMenuId = row?.richmenu_admin_id || null

  // ไม่มีแอดมินผูก LINE ไว้เลย — เก็บกวาดของเก่าให้เรียบร้อยแล้วจบ ไม่ต้องมีเมนูค้างไว้บน LINE
  if (adminIds.length === 0) {
    if (previouslyLinked.length > 0) {
      await unlinkAdminMenuFromUsers(channelAccessToken, previouslyLinked)
    }
    if (existingMenuId) {
      await lineRequest(`https://api.line.me/v2/bot/richmenu/${existingMenuId}`, channelAccessToken, {
        method: "DELETE"
      })
    }
    const cleared = await saveAdminMenuState(db, workspaceId, {
      richmenu_admin_id: null,
      richmenu_admin_installed_at: null,
      richmenu_admin_template_version: null,
      richmenu_admin_linked_uids: null,
      richmenu_admin_installed_image_url: null
    })
    if (cleared) return { ...empty, error: cleared }
    return { ok: true, richMenuId: null, linked: 0, total: 0 }
  }

  const templateChanged = row?.richmenu_admin_template_version !== ADMIN_RICHMENU_TEMPLATE.name

  // LINE ไม่มี API เปลี่ยนภาพของเมนูที่สร้างแล้ว เปลี่ยนภาพจึงต้องสร้างเมนูใบใหม่
  // ถ้าไม่เทียบตรงนี้ เจ้าหอเปลี่ยนแค่ภาพ (ผังปุ่มไม่เปลี่ยน) แล้วกดซิงก์จะไม่เกิดอะไรขึ้นเลย
  const imageUrl = resolveAdminMenuImageUrl(row?.richmenu_admin_image_url, appUrl)
  const imageChanged = row?.richmenu_admin_installed_image_url !== imageUrl

  const needNewMenu = forceRecreate || !existingMenuId || templateChanged || imageChanged

  let richMenuId = existingMenuId
  if (needNewMenu) {
    const image = await fetchAdminMenuImage(imageUrl)
    if (!image.ok) return { ...empty, error: image.error }

    let menu
    try {
      menu = buildAdminRichMenu(appUrl)
    } catch (buildError) {
      const message = buildError instanceof Error ? buildError.message : "สร้างผังเมนูผู้ดูแลไม่สำเร็จ"
      return { ...empty, error: message }
    }

    const created = await lineRequest("https://api.line.me/v2/bot/richmenu", channelAccessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(menu)
    })
    if (!created.ok) return { ...empty, error: created.error }

    const newId = typeof created.body.richMenuId === "string" ? created.body.richMenuId : ""
    if (!newId) return { ...empty, error: "LINE ไม่ได้คืนรหัสเมนูผู้ดูแลกลับมา" }

    // เมนูที่ยังไม่มีภาพใช้งานไม่ได้ ถ้าอัปโหลดพลาดต้องลบใบใหม่ทิ้งไม่ให้ค้างกิน limit
    const uploaded = await lineRequest(
      `https://api-data.line.me/v2/bot/richmenu/${newId}/content`,
      channelAccessToken,
      { method: "POST", headers: { "Content-Type": image.type }, body: new Uint8Array(image.buffer) }
    )
    if (!uploaded.ok) {
      await lineRequest(`https://api.line.me/v2/bot/richmenu/${newId}`, channelAccessToken, {
        method: "DELETE"
      })
      return { ...empty, error: uploaded.error }
    }

    richMenuId = newId
  }

  if (!richMenuId) return { ...empty, error: "ไม่พบเมนูผู้ดูแลที่จะผูกให้แอดมิน" }

  // ผูกใบปัจจุบันให้แอดมินทุกคน — การผูกใบใหม่จะแทนที่ใบเก่าของคนนั้นเองโดยไม่ต้องถอดก่อน
  const linked = await linkToUsers(channelAccessToken, richMenuId, adminIds)

  // คนที่เคยเป็นแอดมินแต่ตอนนี้ไม่ใช่แล้ว ต้องถอดเมนูออกให้กลับไปเห็นเมนูปกติ
  const staleUids = previouslyLinked.filter(uid => !adminIds.includes(uid))
  if (staleUids.length > 0) {
    await unlinkAdminMenuFromUsers(channelAccessToken, staleUids)
  }

  // ลบเมนูใบเก่าหลังผูกใบใหม่เรียบร้อย (1 channel เก็บได้ 1,000 ใบ ถ้าไม่ลบจะบวมจนสร้างไม่ได้)
  if (needNewMenu && existingMenuId && existingMenuId !== richMenuId) {
    const removed = await lineRequest(
      `https://api.line.me/v2/bot/richmenu/${existingMenuId}`,
      channelAccessToken,
      { method: "DELETE" }
    )
    if (!removed.ok) {
      console.warn(`richmenu-admin: ลบเมนูผู้ดูแลใบเก่า ${existingMenuId} ไม่สำเร็จ: ${removed.error}`)
    }
  }

  const saveError = await saveAdminMenuState(db, workspaceId, {
    richmenu_admin_id: richMenuId,
    richmenu_admin_installed_at: new Date().toISOString(),
    richmenu_admin_template_version: ADMIN_RICHMENU_TEMPLATE.name,
    richmenu_admin_linked_uids: linked.join(",") || null,
    richmenu_admin_installed_image_url: imageUrl
  })
  if (saveError) return { ...empty, richMenuId, linked: linked.length, total: adminIds.length, error: saveError }

  return { ok: true, richMenuId, linked: linked.length, total: adminIds.length }
}

/** ถอดเมนูแอดมินออกจากทุกคนและลบตัวเมนูทิ้ง — ใช้ตอนปิดสวิตช์หรือถอดเมนูออกจาก LINE */
export async function teardownAdminRichMenu(args: {
  db: SupabaseClient
  workspaceId: string
  channelAccessToken: string
}): Promise<void> {
  const { db, workspaceId, channelAccessToken } = args
  if (!channelAccessToken || channelAccessToken === "placeholder") return

  const { row } = await readAdminMenuRow(db, workspaceId)
  if (!row) return

  const linked = splitUids(row.richmenu_admin_linked_uids)
  if (linked.length > 0) {
    await unlinkAdminMenuFromUsers(channelAccessToken, linked)
  }

  if (row.richmenu_admin_id) {
    await lineRequest(`https://api.line.me/v2/bot/richmenu/${row.richmenu_admin_id}`, channelAccessToken, {
      method: "DELETE"
    })
  }

  // ไม่ล้าง richmenu_admin_image_url — ภาพที่เจ้าหออัปโหลดไว้ต้องอยู่ต่อ เปิดสวิตช์กลับแล้ว
  // ได้ภาพเดิมโดยไม่ต้องอัปโหลดใหม่ ส่วน installed_image_url ต้องล้างเพราะเมนูถูกลบไปแล้วจริง
  await saveAdminMenuState(db, workspaceId, {
    richmenu_admin_id: null,
    richmenu_admin_installed_at: null,
    richmenu_admin_template_version: null,
    richmenu_admin_linked_uids: null,
    richmenu_admin_installed_image_url: null
  })
}

/** คืนข้อความ error เมื่อบันทึกไม่สำเร็จ (คืน null เมื่อสำเร็จ) */
async function saveAdminMenuState(
  db: SupabaseClient,
  workspaceId: string,
  patch: Record<string, string | null>
): Promise<string | null> {
  const { error } = await db
    .from("workspace_line_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)

  if (!error) return null
  if (isAdminMenuColumnMissing(error)) return ADMIN_MENU_COLUMN_HINT
  return error.message
}
