"use server"

/**
 * อ่านประวัติการแก้ไข (audit log) สำหรับหน้า ตั้งค่า › ประวัติการแก้ไข
 *
 * ⚠️ ตั้งใจอ่านผ่าน client ของผู้ใช้ที่ล็อกอิน (createClient) ไม่ใช่ service-role
 *
 * เหตุผล: service-role bypass RLS ทั้งหมด ถ้าใช้ตัวนั้นแล้วเผลอลืมใส่เงื่อนไข
 * workspace_id แม้ครั้งเดียว จะรั่วประวัติการแก้ไขข้ามหอทันที การอ่านผ่าน JWT
 * ทำให้ RLS เป็นด่านสุดท้ายที่กันไว้ให้เสมอ แม้โค้ดจะพลาด
 *
 * นอกจาก RLS ยังตรวจสิทธิ์ในโค้ดซ้ำอีกชั้น เพื่อให้ตอบเหตุผลได้ว่าทำไมไม่เห็นข้อมูล
 * (RLS ที่ปฏิเสธจะคืนลิสต์ว่างเฉย ๆ ซึ่งแยกไม่ออกจาก "ไม่มีเหตุการณ์เลย")
 */

import { createClient } from "@/lib/supabase/server"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { resolveActiveWorkspaceId } from "@/features/auth/current-workspace"
import { hasApprovedSupportGrant, SUPPORT_ACCESS_REQUIRED_MESSAGE } from "@/features/auth/support-access"
import { AUDITED_TABLES } from "./labels"

export type AuditLogRow = {
  id: number
  createdAt: string
  actorId: string | null
  actorName: string | null
  actorRole: string | null
  /**
   * น้ำหนักหลักฐานว่าใครทำ
   *   'jwt'     = พิสูจน์จาก JWT ปลอมไม่ได้
   *   'server'  = โค้ดฝั่งเซิร์ฟเวอร์แจ้งมาหลังตรวจ session (ปลอมได้เฉพาะผู้ถือ service role key)
   *   'unknown' = ไม่มีตัวตนติดมา (cron / webhook / ลิงก์ผู้เช่าที่ไม่ต้องล็อกอิน)
   */
  actorSource: string
  action: string
  tableName: string
  recordId: string | null
  recordLabel: string | null
  changedFields: string[] | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export type AuditLogFilter = {
  /** ย้อนหลังกี่วัน (ค่าเริ่มต้น 7) */
  days?: number
  /** ตารางที่สนใจ — ว่าง = ทุกตาราง */
  tables?: string[]
  /** INSERT / UPDATE / DELETE — ว่าง = ทุกอย่าง */
  actions?: string[]
  /** id ของคนทำ, "system" = เหตุการณ์ที่ระบบทำเอง (ไม่มีตัวตน) */
  actorId?: string | null
  /** ค้นหาในป้ายรายการ เช่นเลขห้อง หรือรอบบิล */
  search?: string
  /** โหลดหน้าถัดไป — ส่ง id ของแถวสุดท้ายที่ได้ไปแล้ว */
  beforeId?: number | null
  limit?: number
}

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

/**
 * รูปแบบแถวที่ audit_logs คืนมา
 *
 * ต้องประกาศเองเพราะ type ของ Supabase client มาจาก database.ts ที่ generate ไว้
 * ตั้งแต่ก่อนมีตารางนี้ จึงยังไม่รู้จัก audit_logs (คืนมาเป็น GenericStringError)
 * เมื่อ regenerate types ครั้งถัดไปแล้ว จะเอา cast ออกได้
 */
type AuditLogRaw = {
  id: number | string
  created_at: string
  actor_id: string | null
  actor_name: string | null
  actor_role: string | null
  actor_source: string | null
  action: string
  table_name: string
  record_id: string | null
  record_label: string | null
  changed_fields: string[] | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

type AuditActorRaw = Pick<AuditLogRaw, "actor_id" | "actor_name" | "actor_role">

/** ตรวจสิทธิ์ + หาหอที่กำลังดู — ใช้ร่วมกันทั้ง 2 action ในไฟล์นี้ */
async function resolveAuditScope() {
  const profileRes = await getCurrentUserProfileAction()
  if (!profileRes.success || !profileRes.data) {
    return { ok: false as const, error: "กรุณาเข้าสู่ระบบก่อนดูประวัติการแก้ไข" }
  }

  const user = profileRes.data
  const isSuperAdmin = user.role === "super_admin"
  const isAdmin = user.role === "admin"

  if (!isAdmin && !isSuperAdmin) {
    return {
      ok: false as const,
      error: "ประวัติการแก้ไขสงวนไว้สำหรับเจ้าของหอพักเท่านั้น"
    }
  }

  const workspaceId = await resolveActiveWorkspaceId(user.workspace_id)
  if (!workspaceId) {
    return { ok: false as const, error: "กรุณาเลือกหอพักจากเมนูด้านบนก่อน" }
  }

  const supabase = await createClient()

  // ทีมงานต้องได้รับอนุมัติสิทธิ์เข้าช่วยเหลือก่อน (RLS กันอยู่แล้ว แต่เช็คซ้ำเพื่อบอกเหตุผล)
  if (isSuperAdmin) {
    const approved = await hasApprovedSupportGrant(supabase, workspaceId)
    if (!approved) return { ok: false as const, error: SUPPORT_ACCESS_REQUIRED_MESSAGE }
  }

  return { ok: true as const, supabase, workspaceId }
}

/** ยังไม่ได้รัน SQL patch — บอกให้รู้ตัวแทนที่จะโยน error ดิบ */
function isTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (error.message || "").includes("audit_logs")
  )
}

const TABLE_MISSING_HINT =
  "ยังไม่ได้เปิดใช้ระบบประวัติการแก้ไข กรุณารัน database_patch_add_audit_logs.sql ใน Supabase ก่อน"

export async function getAuditLogsAction(filter: AuditLogFilter = {}) {
  try {
    const scope = await resolveAuditScope()
    if (!scope.ok) return { success: false, error: scope.error }

    const days = Math.min(Math.max(filter.days ?? 7, 1), 365)
    const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    let query = scope.supabase
      .from("audit_logs")
      .select(
        "id, created_at, actor_id, actor_name, actor_role, actor_source, action, " +
          "table_name, record_id, record_label, changed_fields, before, after"
      )
      // ใส่เงื่อนไข workspace เองด้วย ไม่พึ่ง RLS อย่างเดียว (กันพลาดสองชั้น)
      .eq("workspace_id", scope.workspaceId)
      .gte("created_at", since)
      .order("id", { ascending: false })
      .limit(limit)

    // กรองเฉพาะตารางที่ระบบรู้จัก — กันไม่ให้ส่งชื่อตารางอะไรก็ได้เข้ามา
    const tables = (filter.tables || []).filter(t =>
      (AUDITED_TABLES as readonly string[]).includes(t)
    )
    if (tables.length > 0) query = query.in("table_name", tables)

    const actions = (filter.actions || []).filter(a =>
      ["INSERT", "UPDATE", "DELETE"].includes(a)
    )
    if (actions.length > 0) query = query.in("action", actions)

    if (filter.actorId === "system") {
      query = query.is("actor_id", null)
    } else if (filter.actorId) {
      query = query.eq("actor_id", filter.actorId)
    }

    const search = (filter.search || "").trim()
    if (search) {
      // ค้นในป้ายรายการ (เลขห้อง / รอบบิล / ชื่อรายการ)
      query = query.ilike("record_label", `%${search}%`)
    }

    if (filter.beforeId) query = query.lt("id", filter.beforeId)

    const { data, error } = await query

    if (error) {
      if (isTableMissing(error)) return { success: false, error: TABLE_MISSING_HINT }
      throw error
    }

    const rows: AuditLogRow[] = ((data as unknown as AuditLogRaw[] | null) ?? []).map(r => ({
      id: Number(r.id),
      createdAt: r.created_at,
      actorId: r.actor_id,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      actorSource: r.actor_source || "unknown",
      action: r.action,
      tableName: r.table_name,
      recordId: r.record_id,
      recordLabel: r.record_label,
      changedFields: r.changed_fields,
      before: r.before,
      after: r.after
    }))

    return {
      success: true,
      data: {
        rows,
        // ได้ครบ limit = อาจมีต่อ ให้หน้าจอโชว์ปุ่มโหลดเพิ่ม
        hasMore: rows.length === limit,
        nextBeforeId: rows.length > 0 ? rows[rows.length - 1].id : null
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "อ่านประวัติการแก้ไขไม่สำเร็จ"
    return { success: false, error: message }
  }
}

/** รายชื่อคนที่เคยแก้ข้อมูลในหอนี้ — ใช้ทำ dropdown ตัวกรอง "คนทำ" */
export async function getAuditActorsAction(days = 90) {
  try {
    const scope = await resolveAuditScope()
    if (!scope.ok) return { success: false, error: scope.error }

    const since = new Date(
      Date.now() - Math.min(Math.max(days, 1), 365) * 24 * 60 * 60 * 1000
    ).toISOString()

    const { data, error } = await scope.supabase
      .from("audit_logs")
      .select("actor_id, actor_name, actor_role")
      .eq("workspace_id", scope.workspaceId)
      .gte("created_at", since)
      .limit(2000)

    if (error) {
      if (isTableMissing(error)) return { success: false, error: TABLE_MISSING_HINT }
      throw error
    }

    // ยุบให้เหลือคนละรายการ — เก็บชื่อล่าสุดที่พบของแต่ละ id
    const byId = new Map<string, { id: string; name: string; role: string | null }>()
    let hasSystem = false

    for (const row of (data as unknown as AuditActorRaw[] | null) ?? []) {
      if (!row.actor_id) {
        hasSystem = true
        continue
      }
      if (!byId.has(row.actor_id)) {
        byId.set(row.actor_id, {
          id: row.actor_id,
          name: row.actor_name || "(ไม่ทราบชื่อ)",
          role: row.actor_role
        })
      }
    }

    return {
      success: true,
      data: {
        actors: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "th")),
        hasSystem
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "อ่านรายชื่อผู้แก้ไขไม่สำเร็จ"
    return { success: false, error: message }
  }
}
