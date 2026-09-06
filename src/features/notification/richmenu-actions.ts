"use server"

import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js"
import { assertWorkspaceFeatureEnabled } from "@/features/subscription/actions"
import { DEFAULT_LIFF_ID } from "@/lib/lineLiff"
import {
  ADMIN_RICHMENU_TEMPLATE,
  DEFAULT_TENANT_MENU_IMAGE_PATH,
  buildTenantRichMenu,
  checkRichMenuImage,
  phoneToContactUri,
  TENANT_RICHMENU_TEMPLATE
} from "./richmenu"
import {
  ADMIN_MENU_COLUMN_HINT,
  lineRequest,
  syncAdminRichMenu,
  teardownAdminRichMenu
} from "./richmenu-admin"
import { splitUids } from "./line-admin"

/**
 * จัดการ LINE Rich Menu ของแต่ละหอพักจากหน้าตั้งค่า › LINE OA
 *
 * ⚠️ LINE ไม่มี API แก้ rich menu ที่สร้างแล้ว มีแค่สร้างใหม่กับลบ ดังนั้น "อัปเดตเมนู" ทุกครั้ง
 * คือการสร้างใบใหม่ → อัปโหลดภาพใส่ใบใหม่ → สลับให้ผู้ติดตามทุกคน → ลบใบเก่า
 * ค่าที่ฝังลงเมนู (เบอร์ติดต่อ, LIFF ID) จึงเป็นค่า ณ วินาทีที่กดติดตั้ง ไม่ใช่ค่าสดจาก DB
 * เราจึงเก็บค่าที่ฝังไปไว้ใน workspace_line_settings เพื่อเตือนได้ว่าเมนูใน LINE ล้าสมัยแล้ว
 */

type RichMenuSettingsRow = {
  channel_access_token: string | null
  liff_id: string | null
  richmenu_id: string | null
  richmenu_image_url: string | null
  richmenu_installed_at: string | null
  richmenu_contact_uri: string | null
  richmenu_liff_id: string | null
  richmenu_enabled: boolean | null
  richmenu_template_version: string | null
  admin_line_user_id: string | null
  richmenu_admin_id: string | null
  richmenu_admin_installed_at: string | null
  richmenu_admin_template_version: string | null
  richmenu_admin_linked_uids: string | null
  richmenu_admin_enabled: boolean | null
}

/** สถานะของเมนูใบที่สองซึ่งผูกให้เฉพาะแอดมิน (ดู richmenu-admin.ts) */
export type AdminRichMenuStatus = {
  /** สวิตช์ของเมนูผู้ดูแล — แยกอิสระจาก enabled ของเมนูผู้เช่า */
  enabled: boolean
  /** false = คอลัมน์ของ patch นี้ยังไม่ถูกเพิ่ม จึงยังใช้เมนูผู้ดูแลไม่ได้ */
  ready: boolean
  installed: boolean
  installedAt: string | null
  /** จำนวนแอดมินที่ผูก LINE ไว้กับหอนี้ (0 = ยังไม่มีใครให้ผูกเมนู) */
  adminCount: number
  /** จำนวนที่ผูกเมนูผู้ดูแลไว้สำเร็จจริงบน LINE */
  linkedCount: number
  /** ผังปุ่มในโค้ดเปลี่ยนไปหลังหอนี้ติดตั้ง หรือมีแอดมินที่ยังไม่ได้รับเมนู */
  needsSync: boolean
}

export type RichMenuStatus = {
  /** หอพักเปิดใช้งานเมนูล่างอยู่หรือไม่ (ปิด = ผู้เช่าไม่เห็นปุ่ม แต่ตัวเมนูกับภาพยังถูกเก็บไว้) */
  enabled: boolean
  installed: boolean
  installedAt: string | null
  /** ภาพที่หอพักอัปโหลดเอง (ว่าง = ใช้ภาพต้นแบบของระบบ) */
  customImageUrl: string
  /** ภาพที่จะถูกใช้จริงตอนติดตั้ง */
  effectiveImageUrl: string
  requiredWidth: number
  requiredHeight: number
  /** เบอร์ติดต่อที่ระบบจะฝังลงเมนูถ้ากดติดตั้งเดี๋ยวนี้ */
  currentContactUri: string
  /** เบอร์ติดต่อที่ฝังลงเมนูที่ใช้อยู่จริงใน LINE */
  installedContactUri: string
  /** true = ข้อมูลในระบบเปลี่ยนไปแล้วแต่เมนูใน LINE ยังเป็นของเก่า */
  outdated: boolean
  /** true = หอพักยังไม่ได้กรอกเบอร์โทร ติดตั้งไม่ได้ */
  contactMissing: boolean
  channelReady: boolean
  admin: AdminRichMenuStatus
}

const COLUMN_MISSING_HINT =
  "ตารางฐานข้อมูลยังไม่มีคอลัมน์สำหรับ Rich Menu กรุณารัน database_patch_add_line_richmenu.sql ใน Supabase SQL Editor ก่อน"

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === "42703" || (error.message || "").includes("richmenu_")
}

/** สร้าง client ที่ bypass RLS ได้ — เรียกได้เฉพาะหลังตรวจสิทธิ์ด้วยโค้ดแล้วเท่านั้น */
function getServiceClient(fallback: Awaited<ReturnType<typeof createClient>>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key && !key.includes("placeholder")) {
    return createSupabaseServiceClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  }
  return fallback
}

/**
 * ตรวจว่าผู้เรียกเป็นแอดมินของหอพักนี้จริง
 *
 * ใช้ pattern เดียวกับ savePropertyLogoUrl — ตรวจ role กับ workspace ด้วยโค้ดก่อน
 * แล้วจึงเขียนด้วย service role client
 */
async function assertWorkspaceAdmin(workspaceId: string) {
  if (!workspaceId) {
    return { ok: false as const, error: "ไม่พบรหัสหอพัก (workspace)" }
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false as const, error: "ไม่ได้เข้าสู่ระบบหรือเซสชันหมดอายุ" }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, workspace_id")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    return { ok: false as const, error: "ไม่พบข้อมูลสิทธิ์ผู้ใช้งาน" }
  }

  const isAdmin = profile.role === "admin" || profile.role === "super_admin"
  const isSameWorkspace = profile.workspace_id === workspaceId || profile.role === "super_admin"
  if (!isAdmin || !isSameWorkspace) {
    return { ok: false as const, error: "ขออภัย คุณไม่มีสิทธิ์ (Workspace Admin) ในการจัดการเมนู LINE" }
  }

  return { ok: true as const, supabase, db: getServiceClient(supabase) }
}

function resolveAppUrl(): string {
  let appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim()
  while (appUrl.endsWith("/")) appUrl = appUrl.slice(0, -1)
  if (!appUrl) return ""
  return appUrl.startsWith("http://") || appUrl.startsWith("https://") ? appUrl : `https://${appUrl}`
}

const BASE_COLUMNS =
  "channel_access_token, liff_id, richmenu_id, richmenu_image_url, richmenu_installed_at, richmenu_contact_uri, richmenu_liff_id, richmenu_enabled, richmenu_template_version, admin_line_user_id"

const ADMIN_MENU_COLUMNS =
  "richmenu_admin_id, richmenu_admin_installed_at, richmenu_admin_template_version, richmenu_admin_linked_uids, richmenu_admin_enabled"

/**
 * อ่านค่าตั้งค่าเมนูของหอพัก
 *
 * คอลัมน์ของเมนูผู้ดูแลมาทีหลัง จึงถอยไปอ่านเฉพาะคอลัมน์เดิมได้ถ้ายังไม่ได้รัน SQL patch
 * — หน้าตั้งค่าจะยังใช้จัดการเมนูผู้เช่าได้ตามปกติ แค่ส่วนเมนูผู้ดูแลขึ้นว่ายังไม่พร้อม
 */
async function readSettings(
  db: ReturnType<typeof getServiceClient>,
  workspaceId: string
): Promise<{ row: RichMenuSettingsRow | null; error?: string; adminColumnsReady: boolean }> {
  const full = await db
    .from("workspace_line_settings")
    .select(`${BASE_COLUMNS}, ${ADMIN_MENU_COLUMNS}`)
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (!full.error) {
    return { row: (full.data as RichMenuSettingsRow | null) ?? null, adminColumnsReady: true }
  }

  if (!isMissingColumnError(full.error)) {
    return { row: null, error: full.error.message, adminColumnsReady: false }
  }

  const base = await db
    .from("workspace_line_settings")
    .select(BASE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (base.error) {
    if (isMissingColumnError(base.error)) {
      return { row: null, error: COLUMN_MISSING_HINT, adminColumnsReady: false }
    }
    return { row: null, error: base.error.message, adminColumnsReady: false }
  }

  return { row: (base.data as RichMenuSettingsRow | null) ?? null, adminColumnsReady: false }
}

/**
 * สรุปสถานะเมนูผู้ดูแลจากแถวที่อ่านมา
 *
 * needsSync ตั้งใจให้ครอบคลุมทั้ง 3 กรณีที่ทำให้แอดมินไม่ได้เมนูที่ถูกต้อง:
 * มีแอดมินแต่ยังไม่เคยติดตั้ง / ผังปุ่มในโค้ดเปลี่ยนไปแล้ว / มีแอดมินที่ผูกไม่ครบ
 */
function buildAdminStatus(
  row: RichMenuSettingsRow | null,
  adminColumnsReady: boolean
): AdminRichMenuStatus {
  const adminCount = splitUids(row?.admin_line_user_id).length

  if (!adminColumnsReady) {
    return {
      enabled: true,
      ready: false,
      installed: false,
      installedAt: null,
      adminCount,
      linkedCount: 0,
      needsSync: false
    }
  }

  const enabled = row?.richmenu_admin_enabled !== false
  const installed = !!row?.richmenu_admin_id
  const linkedCount = splitUids(row?.richmenu_admin_linked_uids).length
  const templateChanged = row?.richmenu_admin_template_version !== ADMIN_RICHMENU_TEMPLATE.name

  return {
    enabled,
    ready: true,
    installed,
    installedAt: row?.richmenu_admin_installed_at || null,
    adminCount,
    linkedCount,
    // ปิดสวิตช์อยู่ = ไม่มีอะไรให้ซิงก์ ไม่ควรขึ้นเตือนให้เจ้าหอกดทั้งที่ตั้งใจปิดเอง
    needsSync:
      enabled && adminCount > 0 && (!installed || templateChanged || linkedCount < adminCount)
  }
}

/** อ่านสถานะเมนูปัจจุบันสำหรับแสดงในหน้าตั้งค่า */
export async function getRichMenuStatusAction(workspaceId: string) {
  try {
    const auth = await assertWorkspaceAdmin(workspaceId)
    if (!auth.ok) return { success: false, error: auth.error }

    const { row, error, adminColumnsReady } = await readSettings(auth.db, workspaceId)
    if (error) return { success: false, error }

    const { data: ws } = await auth.db
      .from("workspaces")
      .select("tax_phone")
      .eq("id", workspaceId)
      .maybeSingle()

    const currentContactUri = phoneToContactUri(ws?.tax_phone)
    const currentLiffId = row?.liff_id?.trim() || DEFAULT_LIFF_ID
    const customImageUrl = row?.richmenu_image_url?.trim() || ""
    const appUrl = resolveAppUrl()
    const installed = !!row?.richmenu_id

    const status: RichMenuStatus = {
      // คอลัมน์เพิ่งเพิ่มทีหลัง แถวเก่าที่ยังเป็น null ให้ถือว่าเปิดอยู่ (ตรงกับ default ของคอลัมน์)
      enabled: row?.richmenu_enabled !== false,
      installed,
      installedAt: row?.richmenu_installed_at || null,
      customImageUrl,
      effectiveImageUrl: customImageUrl || `${appUrl}${DEFAULT_TENANT_MENU_IMAGE_PATH}`,
      requiredWidth: TENANT_RICHMENU_TEMPLATE.size.width,
      requiredHeight: TENANT_RICHMENU_TEMPLATE.size.height,
      currentContactUri,
      installedContactUri: row?.richmenu_contact_uri || "",
      outdated:
        installed &&
        (row?.richmenu_contact_uri !== currentContactUri ||
          row?.richmenu_liff_id !== currentLiffId ||
          // ผังปุ่มในโค้ดเปลี่ยนไปหลังหอนี้ติดตั้ง (เช่นปุ่มส่งสลิปเปลี่ยนพฤติกรรม) ต้องติดตั้งใหม่
          row?.richmenu_template_version !== TENANT_RICHMENU_TEMPLATE.name),
      contactMissing: !currentContactUri,
      channelReady: !!row?.channel_access_token?.trim() && row.channel_access_token !== "placeholder",
      admin: buildAdminStatus(row, adminColumnsReady)
    }

    return { success: true, data: status }
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอ่านสถานะเมนู LINE"
    return { success: false, error: message }
  }
}

/**
 * บันทึก URL ภาพเมนูที่เจ้าหออัปโหลดขึ้น Storage แล้ว
 *
 * ตัวไฟล์อัปโหลดจากเบราว์เซอร์ตรงเข้า bucket (pattern เดียวกับโลโก้หอพัก) แล้วส่งแค่ URL
 * มาที่นี่ — ฝั่งนี้ดึงไบต์กลับมาตรวจซ้ำเสมอ ไม่เชื่อผลตรวจจากเบราว์เซอร์
 * ส่งค่าว่างมาเพื่อกลับไปใช้ภาพต้นแบบของระบบ
 */
export async function saveRichMenuImageAction(workspaceId: string, imageUrl: string) {
  try {
    const auth = await assertWorkspaceAdmin(workspaceId)
    if (!auth.ok) return { success: false, error: auth.error }

    const trimmed = (imageUrl || "").trim()

    if (trimmed) {
      if (!/^https?:\/\//i.test(trimmed)) {
        return { success: false, error: "ลิงก์ภาพไม่ถูกต้อง" }
      }
      const check = await fetchAndCheckImage(trimmed)
      if (!check.ok) return { success: false, error: check.error }
    }

    const { error } = await auth.db
      .from("workspace_line_settings")
      .update({ richmenu_image_url: trimmed || null, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)

    if (error) {
      if (isMissingColumnError(error)) return { success: false, error: COLUMN_MISSING_HINT }
      throw error
    }

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกภาพเมนู"
    return { success: false, error: message }
  }
}

type FetchedImage = { ok: true; buffer: Buffer; type: "image/png" | "image/jpeg" } | { ok: false; error: string }

async function fetchAndCheckImage(url: string): Promise<FetchedImage> {
  let res: Response
  try {
    res = await fetch(url, { cache: "no-store" })
  } catch {
    return { ok: false, error: "ดาวน์โหลดไฟล์ภาพไม่สำเร็จ กรุณาลองอัปโหลดใหม่" }
  }
  if (!res.ok) {
    return { ok: false, error: `ดาวน์โหลดไฟล์ภาพไม่สำเร็จ (HTTP ${res.status})` }
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const check = checkRichMenuImage(buffer, TENANT_RICHMENU_TEMPLATE)
  if (!check.ok) return { ok: false, error: check.error }

  return { ok: true, buffer, type: check.type }
}

/**
 * เปิด/ปิดการใช้งานเมนูล่างของหอพักนี้
 *
 * ปิด = ยกเลิกเมนูเริ่มต้นของ channel เท่านั้น ตัวเมนูยังอยู่บน LINE และภาพที่อัปโหลดไว้ยังอยู่
 * จึงกดเปิดกลับได้ทันทีโดยไม่ต้องสร้างเมนูใหม่และไม่ต้องอัปโหลดภาพซ้ำ
 * (ต่างจาก removeRichMenuAction ที่ลบตัวเมนูทิ้งจริง)
 */
export async function setRichMenuEnabledAction(workspaceId: string, enabled: boolean) {
  try {
    const auth = await assertWorkspaceAdmin(workspaceId)
    if (!auth.ok) return { success: false, error: auth.error }

    const { row, error: readError } = await readSettings(auth.db, workspaceId)
    if (readError) return { success: false, error: readError }

    const channelAccessToken = row?.channel_access_token?.trim() || ""
    const hasToken = !!channelAccessToken && channelAccessToken !== "placeholder"
    const richMenuId = row?.richmenu_id || null

    // แตะ LINE เฉพาะเมื่อมีเมนูติดตั้งอยู่จริง — ถ้ายังไม่เคยติดตั้งก็แค่จำค่าสวิตช์ไว้เฉย ๆ
    if (richMenuId && hasToken) {
      if (enabled) {
        const applied = await lineRequest(
          `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
          channelAccessToken,
          { method: "POST" }
        )
        if (!applied.ok) {
          // เมนูอาจถูกลบไปแล้วจากฝั่ง LINE (เช่นลบมือใน OA Manager) — ล้างค่าที่จำไว้
          // แล้วบอกให้ติดตั้งใหม่ ดีกว่าปล่อยให้สวิตช์เปิดค้างโดยไม่มีเมนูจริง
          await auth.db
            .from("workspace_line_settings")
            .update({ richmenu_id: null, richmenu_installed_at: null, richmenu_enabled: true })
            .eq("workspace_id", workspaceId)
          return {
            success: false,
            error: "ไม่พบเมนูเดิมบน LINE แล้ว (อาจถูกลบไปก่อนหน้านี้) กรุณากดติดตั้งเมนูใหม่อีกครั้ง"
          }
        }
      } else {
        const unset = await lineRequest(
          "https://api.line.me/v2/bot/user/all/richmenu",
          channelAccessToken,
          { method: "DELETE" }
        )
        if (!unset.ok) return { success: false, error: unset.error }
      }
    }

    // ตั้งใจไม่แตะเมนูผู้ดูแลตรงนี้ — สวิตช์นี้คุมเฉพาะเมนูผู้เช่า เมนูผู้ดูแลมีสวิตช์ของตัวเอง
    // (setAdminRichMenuEnabledAction) เพราะมีหอที่ไม่อยากให้ผู้เช่ามีเมนู แต่เจ้าของหอยังอยากใช้

    const { error: saveError } = await auth.db
      .from("workspace_line_settings")
      .update({ richmenu_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)

    if (saveError) {
      if (isMissingColumnError(saveError)) return { success: false, error: COLUMN_MISSING_HINT }
      throw saveError
    }

    return { success: true, data: { enabled, appliedToLine: !!richMenuId && hasToken } }
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเปลี่ยนสถานะเมนู LINE"
    return { success: false, error: message }
  }
}

/** สร้างเมนูใบใหม่จากค่าปัจจุบัน สลับให้ผู้ติดตามทุกคน แล้วลบใบเก่า */
export async function installRichMenuAction(workspaceId: string) {
  try {
    const auth = await assertWorkspaceAdmin(workspaceId)
    if (!auth.ok) return { success: false, error: auth.error }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const { row, error: readError } = await readSettings(auth.db, workspaceId)
    if (readError) return { success: false, error: readError }

    if (row?.richmenu_enabled === false) {
      return {
        success: false,
        error: "หอพักนี้ปิดการใช้งานเมนูล่างอยู่ กรุณาเปิดสวิตช์ก่อนติดตั้งเมนู"
      }
    }

    const channelAccessToken = row?.channel_access_token?.trim() || ""
    if (!channelAccessToken || channelAccessToken === "placeholder") {
      return {
        success: false,
        error: "ยังไม่ได้ตั้งค่า Channel Access Token ของหอพักนี้ กรุณาเชื่อมต่อ LINE OA ให้เสร็จก่อน"
      }
    }

    const { data: ws } = await auth.db
      .from("workspaces")
      .select("tax_phone")
      .eq("id", workspaceId)
      .maybeSingle()

    const contactUri = phoneToContactUri(ws?.tax_phone)
    if (!contactUri) {
      return {
        success: false,
        error:
          "เมนูมีปุ่ม \"ติดต่อหอพัก\" แต่ยังไม่ได้กรอกเบอร์โทรศัพท์ติดต่อ " +
          "กรุณากรอกที่หน้า ตั้งค่า › การเงิน/ภาษี ก่อนติดตั้งเมนู"
      }
    }

    const liffId = row?.liff_id?.trim() || DEFAULT_LIFF_ID
    const appUrl = resolveAppUrl()
    const imageUrl = row?.richmenu_image_url?.trim() || `${appUrl}${DEFAULT_TENANT_MENU_IMAGE_PATH}`
    if (!row?.richmenu_image_url?.trim() && !appUrl) {
      return {
        success: false,
        error: "ระบบยังไม่ได้ตั้งค่า NEXT_PUBLIC_APP_URL จึงหาภาพต้นแบบไม่ได้ กรุณาอัปโหลดภาพเมนูเอง"
      }
    }

    const image = await fetchAndCheckImage(imageUrl)
    if (!image.ok) return { success: false, error: image.error }

    let menu
    try {
      menu = buildTenantRichMenu({ liffId, workspaceId, contactUri })
    } catch (buildError) {
      const message = buildError instanceof Error ? buildError.message : "สร้างผังเมนูไม่สำเร็จ"
      return { success: false, error: message }
    }

    // 1. สร้างเมนูใบใหม่
    const created = await lineRequest("https://api.line.me/v2/bot/richmenu", channelAccessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(menu)
    })
    if (!created.ok) return { success: false, error: created.error }

    const richMenuId = typeof created.body.richMenuId === "string" ? created.body.richMenuId : ""
    if (!richMenuId) {
      return { success: false, error: "LINE ไม่ได้คืนรหัสเมนูกลับมา กรุณาลองใหม่อีกครั้ง" }
    }

    // 2. อัปโหลดภาพใส่เมนูใบใหม่ (เมนูที่ไม่มีภาพใช้งานไม่ได้ ถ้าพลาดตรงนี้ต้องลบใบใหม่ทิ้ง)
    const uploaded = await lineRequest(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      channelAccessToken,
      { method: "POST", headers: { "Content-Type": image.type }, body: new Uint8Array(image.buffer) }
    )
    if (!uploaded.ok) {
      await lineRequest(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, channelAccessToken, {
        method: "DELETE"
      })
      return { success: false, error: uploaded.error }
    }

    // 3. สลับให้ผู้ติดตามทุกคนใน channel เห็นเมนูใบใหม่
    const applied = await lineRequest(
      `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
      channelAccessToken,
      { method: "POST" }
    )
    if (!applied.ok) {
      await lineRequest(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, channelAccessToken, {
        method: "DELETE"
      })
      return { success: false, error: applied.error }
    }

    // 4. ลบใบเก่าที่ระบบเคยสร้างไว้ (1 channel เก็บได้ 1,000 เมนู ถ้าไม่ลบจะบวมจนติดตั้งไม่ได้)
    //    ลบเฉพาะใบที่ระบบเราสร้าง ไม่ไปแตะเมนูที่เจ้าหอสร้างเองไว้ใน LINE OA Manager
    if (row?.richmenu_id && row.richmenu_id !== richMenuId) {
      const removed = await lineRequest(
        `https://api.line.me/v2/bot/richmenu/${row.richmenu_id}`,
        channelAccessToken,
        { method: "DELETE" }
      )
      if (!removed.ok) {
        console.warn(`ลบ rich menu ใบเก่า ${row.richmenu_id} ไม่สำเร็จ: ${removed.error}`)
      }
    }

    const installedAt = new Date().toISOString()
    const { error: saveError } = await auth.db
      .from("workspace_line_settings")
      .update({
        richmenu_id: richMenuId,
        richmenu_installed_at: installedAt,
        richmenu_contact_uri: contactUri,
        richmenu_liff_id: liffId,
        richmenu_template_version: TENANT_RICHMENU_TEMPLATE.name,
        updated_at: installedAt
      })
      .eq("workspace_id", workspaceId)

    if (saveError) {
      if (isMissingColumnError(saveError)) return { success: false, error: COLUMN_MISSING_HINT }
      throw saveError
    }

    // เมนูผู้ดูแลเป็นของแถม ไม่ใช่เงื่อนไขความสำเร็จของเมนูผู้เช่า — ถ้าพลาดก็รายงานเป็นคำเตือน
    // ไม่ย้อนการติดตั้งเมนูผู้เช่าที่สำเร็จไปแล้ว เจ้าหอกดปุ่มซิงก์เมนูผู้ดูแลซ้ำทีหลังได้
    const adminSync = await syncAdminRichMenu({
      db: auth.db,
      workspaceId,
      channelAccessToken,
      appUrl,
      forceRecreate: true
    })

    return {
      success: true,
      data: {
        richMenuId,
        installedAt,
        adminLinked: adminSync.linked,
        adminTotal: adminSync.total,
        adminWarning: adminSync.ok ? "" : adminSync.error || ""
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการติดตั้งเมนู LINE"
    return { success: false, error: message }
  }
}

/**
 * เปิด/ปิดเมนูผู้ดูแล — แยกอิสระจากสวิตช์ของเมนูผู้เช่า
 *
 * เมนูผู้ดูแลผูกเป็นรายบุคคล ไม่มี "เมนูเริ่มต้นของ channel" ให้ยกเลิกเหมือนเมนูผู้เช่า
 * การปิดจึงต้องถอดออกจากทุกคนแล้วลบตัวเมนูทิ้งจริง ๆ ซึ่งไม่มีอะไรให้เสียเพราะเมนูนี้
 * ใช้ภาพต้นแบบของระบบเสมอ เปิดกลับเมื่อไหร่ก็สร้างใหม่ได้ทันที
 */
export async function setAdminRichMenuEnabledAction(workspaceId: string, enabled: boolean) {
  try {
    const auth = await assertWorkspaceAdmin(workspaceId)
    if (!auth.ok) return { success: false, error: auth.error }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const { row, error: readError, adminColumnsReady } = await readSettings(auth.db, workspaceId)
    if (readError) return { success: false, error: readError }
    if (!adminColumnsReady) return { success: false, error: ADMIN_MENU_COLUMN_HINT }

    const channelAccessToken = row?.channel_access_token?.trim() || ""
    const hasToken = !!channelAccessToken && channelAccessToken !== "placeholder"

    // บันทึกสวิตช์ก่อนเสมอ เพราะ syncAdminRichMenu อ่านค่านี้เพื่อตัดสินใจว่าจะผูกไหม
    const { error: saveError } = await auth.db
      .from("workspace_line_settings")
      .update({ richmenu_admin_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)

    if (saveError) {
      if (isMissingColumnError(saveError)) return { success: false, error: ADMIN_MENU_COLUMN_HINT }
      throw saveError
    }

    if (!hasToken) {
      return { success: true, data: { enabled, linked: 0, total: 0, appliedToLine: false } }
    }

    if (!enabled) {
      await teardownAdminRichMenu({ db: auth.db, workspaceId, channelAccessToken })
      return { success: true, data: { enabled, linked: 0, total: 0, appliedToLine: true } }
    }

    const result = await syncAdminRichMenu({
      db: auth.db,
      workspaceId,
      channelAccessToken,
      appUrl: resolveAppUrl()
    })

    if (!result.ok) return { success: false, error: result.error || "เปิดเมนูผู้ดูแลไม่สำเร็จ" }
    return {
      success: true,
      data: { enabled, linked: result.linked, total: result.total, appliedToLine: true }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเปลี่ยนสถานะเมนูผู้ดูแล"
    return { success: false, error: message }
  }
}

/**
 * ผูกเมนูผู้ดูแลให้ตรงกับรายชื่อแอดมินปัจจุบัน โดยไม่ยุ่งกับเมนูผู้เช่า
 *
 * ใช้เมื่อเพิ่ม/ลบแอดมินแล้วอยากให้เมนูตามทันทีโดยไม่ต้องติดตั้งเมนูผู้เช่าใหม่ทั้งใบ
 */
export async function syncAdminRichMenuAction(workspaceId: string) {
  try {
    const auth = await assertWorkspaceAdmin(workspaceId)
    if (!auth.ok) return { success: false, error: auth.error }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const { row, error: readError } = await readSettings(auth.db, workspaceId)
    if (readError) return { success: false, error: readError }

    if (row?.richmenu_admin_enabled === false) {
      return { success: false, error: "หอพักนี้ปิดเมนูผู้ดูแลอยู่ กรุณาเปิดสวิตช์ก่อน" }
    }

    const channelAccessToken = row?.channel_access_token?.trim() || ""
    const result = await syncAdminRichMenu({
      db: auth.db,
      workspaceId,
      channelAccessToken,
      appUrl: resolveAppUrl()
    })

    if (!result.ok) return { success: false, error: result.error || "ซิงก์เมนูผู้ดูแลไม่สำเร็จ" }
    return { success: true, data: { linked: result.linked, total: result.total } }
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการซิงก์เมนูผู้ดูแล"
    return { success: false, error: message }
  }
}

/** เอาเมนูออกจาก LINE OA (ผู้ติดตามจะกลับไปไม่มีเมนูล่าง) */
export async function removeRichMenuAction(workspaceId: string) {
  try {
    const auth = await assertWorkspaceAdmin(workspaceId)
    if (!auth.ok) return { success: false, error: auth.error }

    const { row, error: readError } = await readSettings(auth.db, workspaceId)
    if (readError) return { success: false, error: readError }

    const channelAccessToken = row?.channel_access_token?.trim() || ""
    if (!row?.richmenu_id) {
      return { success: false, error: "ยังไม่มีเมนูที่ติดตั้งไว้ในระบบ" }
    }
    if (!channelAccessToken || channelAccessToken === "placeholder") {
      return { success: false, error: "ยังไม่ได้ตั้งค่า Channel Access Token ของหอพักนี้" }
    }

    // ตั้งใจไม่แตะเมนูผู้ดูแล — ปุ่มนี้นำ "เมนูผู้เช่า" ออก เมนูผู้ดูแลถอดด้วยสวิตช์ของตัวเอง
    //
    // ยกเลิกเมนูเริ่มต้นก่อน แล้วจึงลบตัวเมนู — สลับลำดับจะลบไม่ได้เพราะยังถูกใช้เป็น default อยู่
    const unset = await lineRequest("https://api.line.me/v2/bot/user/all/richmenu", channelAccessToken, {
      method: "DELETE"
    })
    if (!unset.ok) return { success: false, error: unset.error }

    const deleted = await lineRequest(
      `https://api.line.me/v2/bot/richmenu/${row.richmenu_id}`,
      channelAccessToken,
      { method: "DELETE" }
    )
    if (!deleted.ok) {
      console.warn(`ลบ rich menu ${row.richmenu_id} ไม่สำเร็จ: ${deleted.error}`)
    }

    const { error: saveError } = await auth.db
      .from("workspace_line_settings")
      .update({
        richmenu_id: null,
        richmenu_installed_at: null,
        richmenu_contact_uri: null,
        richmenu_liff_id: null,
        richmenu_template_version: null,
        updated_at: new Date().toISOString()
      })
      .eq("workspace_id", workspaceId)

    if (saveError) {
      if (isMissingColumnError(saveError)) return { success: false, error: COLUMN_MISSING_HINT }
      throw saveError
    }

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการนำเมนูออกจาก LINE"
    return { success: false, error: message }
  }
}
