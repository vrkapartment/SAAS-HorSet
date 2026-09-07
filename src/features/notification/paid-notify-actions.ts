"use server"

/**
 * ตั้งค่าข้อความแจ้งผู้เช่าเมื่อชำระเงินสำเร็จ (หน้าตั้งค่า › LINE OA)
 *
 * แยกไฟล์จาก notification/actions.ts ซึ่งยาวเกิน 2,000 บรรทัดแล้ว — รูปแบบเดียวกับ
 * richmenu-actions.ts ที่แยกออกมาด้วยเหตุผลเดียวกัน
 */

import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js"
import { assertWorkspaceFeatureEnabled } from "@/features/subscription/actions"
import {
  DEFAULT_PAID_MESSAGE_TEMPLATE,
  PAID_MESSAGE_MAX_LENGTH,
  resolvePaidMessageTemplate
} from "./paid-message"
import { PAID_NOTIFY_COLUMN_HINT } from "./line-paid"

export type PaidNotifyStatus = {
  enabled: boolean
  /** false = ยังไม่ได้รัน SQL patch จึงยังใช้ฟีเจอร์นี้ไม่ได้ */
  ready: boolean
  /** ข้อความที่หอพักบันทึกไว้ (ว่าง = ใช้ต้นแบบ) */
  template: string
  /** ข้อความที่จะถูกส่งจริงถ้าเกิดขึ้นเดี๋ยวนี้ */
  effectiveTemplate: string
  /** true = กำลังใช้ข้อความต้นแบบของระบบอยู่ */
  usingDefault: boolean
  workspaceName: string
  channelReady: boolean
  /** จำนวนผู้เช่าที่ผูก LINE แล้ว / ทั้งหมด — บอกตรง ๆ ว่าจะมีคนได้รับกี่คน */
  tenantsWithLine: number
  tenantsTotal: number
  maxLength: number
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === "42703" || (error.message || "").includes("paid_notify_")
}

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

/** ตรวจว่าผู้เรียกเป็นแอดมินของหอพักนี้จริง (pattern เดียวกับ richmenu-actions.ts) */
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
    return { ok: false as const, error: "ขออภัย คุณไม่มีสิทธิ์ (Workspace Admin) ในการจัดการการแจ้งเตือนนี้" }
  }

  return { ok: true as const, db: getServiceClient(supabase) }
}

/** อ่านสถานะสำหรับแสดงในหน้าตั้งค่า */
export async function getPaidNotifyStatusAction(workspaceId: string) {
  try {
    const auth = await assertWorkspaceAdmin(workspaceId)
    if (!auth.ok) return { success: false, error: auth.error }

    const { data: ws } = await auth.db
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle()

    const { data: tenants } = await auth.db
      .from("tenants")
      .select("line_user_id")
      .eq("workspace_id", workspaceId)
      .not("room_id", "is", null)

    const tenantRows = (tenants as { line_user_id: string | null }[] | null) ?? []
    const tenantsWithLine = tenantRows.filter(t => (t.line_user_id || "").trim().length > 0).length

    const base: PaidNotifyStatus = {
      enabled: true,
      ready: false,
      template: "",
      effectiveTemplate: DEFAULT_PAID_MESSAGE_TEMPLATE,
      usingDefault: true,
      workspaceName: (ws as { name?: string } | null)?.name || "",
      channelReady: false,
      tenantsWithLine,
      tenantsTotal: tenantRows.length,
      maxLength: PAID_MESSAGE_MAX_LENGTH
    }

    const { data, error } = await auth.db
      .from("workspace_line_settings")
      .select("channel_access_token, paid_notify_enabled, paid_notify_template")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (error) {
      // คอลัมน์ยังไม่ถูกเพิ่ม — ยังแสดงหน้าได้ตามปกติ แค่บอกว่ายังใช้ไม่ได้
      if (isMissingColumnError(error)) return { success: true, data: base }
      return { success: false, error: error.message }
    }

    const row = data as {
      channel_access_token: string | null
      paid_notify_enabled: boolean | null
      paid_notify_template: string | null
    } | null

    const token = row?.channel_access_token?.trim() || ""
    const template = row?.paid_notify_template?.trim() || ""

    return {
      success: true,
      data: {
        ...base,
        ready: true,
        enabled: row?.paid_notify_enabled !== false,
        template,
        effectiveTemplate: resolvePaidMessageTemplate(template),
        usingDefault: !template,
        channelReady: !!token && token !== "placeholder"
      } satisfies PaidNotifyStatus
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "อ่านสถานะการแจ้งเตือนไม่สำเร็จ"
    return { success: false, error: message }
  }
}

/** เปิด/ปิดการแจ้งเตือนผู้เช่าเมื่อชำระเงินสำเร็จ */
export async function setPaidNotifyEnabledAction(workspaceId: string, enabled: boolean) {
  try {
    const auth = await assertWorkspaceAdmin(workspaceId)
    if (!auth.ok) return { success: false, error: auth.error }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const { error } = await auth.db
      .from("workspace_line_settings")
      .update({ paid_notify_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)

    if (error) {
      if (isMissingColumnError(error)) return { success: false, error: PAID_NOTIFY_COLUMN_HINT }
      throw error
    }

    return { success: true, data: { enabled } }
  } catch (error) {
    const message = error instanceof Error ? error.message : "เปลี่ยนสถานะการแจ้งเตือนไม่สำเร็จ"
    return { success: false, error: message }
  }
}

/**
 * บันทึกข้อความที่เจ้าหอปรับเอง
 *
 * ส่งค่าว่างมาเพื่อกลับไปใช้ข้อความต้นแบบของระบบ — ไม่เก็บข้อความเปล่าไว้ในฐานข้อมูล
 * เพราะจะทำให้ผู้เช่าได้รับข้อความว่างเปล่า
 */
export async function savePaidNotifyTemplateAction(workspaceId: string, template: string) {
  try {
    const auth = await assertWorkspaceAdmin(workspaceId)
    if (!auth.ok) return { success: false, error: auth.error }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const trimmed = (template || "").trim()
    if (trimmed.length > PAID_MESSAGE_MAX_LENGTH) {
      return {
        success: false,
        error: `ข้อความยาวเกินกำหนด (${trimmed.length}/${PAID_MESSAGE_MAX_LENGTH} ตัวอักษร)`
      }
    }

    const { error } = await auth.db
      .from("workspace_line_settings")
      .update({ paid_notify_template: trimmed || null, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)

    if (error) {
      if (isMissingColumnError(error)) return { success: false, error: PAID_NOTIFY_COLUMN_HINT }
      throw error
    }

    return { success: true, data: { usingDefault: !trimmed } }
  } catch (error) {
    const message = error instanceof Error ? error.message : "บันทึกข้อความไม่สำเร็จ"
    return { success: false, error: message }
  }
}
