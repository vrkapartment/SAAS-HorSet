/**
 * Helper สำหรับ "Export ข้อมูลรายหอขึ้น Google Drive" และ "ลบหอถาวร (Purge)" ของ Super Admin Console
 *
 * ไฟล์นี้ไม่ใช่ "use server" — เป็นโมดูลช่วยล้วนๆ ที่ถูกเรียกจาก Server Action ใน
 * src/features/super-admin/actions.ts เท่านั้น (ตามกฎ CLAUDE.md ที่ให้ Server Action อยู่ใน actions.ts)
 * แยกออกมาเพราะ logic การรวบรวมตาราง/สร้าง ZIP/หาไฟล์ใน Storage ยาวพอสมควร
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import JSZip from "jszip"

/**
 * รายชื่อตารางทั้งหมดที่ผูกกับ workspace เดียว (มีคอลัมน์ workspace_id) — ใช้ทั้งตอน Export และตอนนับจำนวนแถว
 *
 * ⚠️ เพิ่มตารางใหม่ที่มี workspace_id เมื่อไหร่ ต้องมาเพิ่มชื่อในลิสต์นี้ด้วยทุกครั้ง
 * ไม่งั้นข้อมูลตารางนั้นจะหายไปจากไฟล์ Export ที่ส่งคืนเจ้าของหอ
 *
 * ตารางที่ไม่อยู่ในลิสต์นี้โดยตั้งใจ: tax_form_templates / tax_form_field_mappings / system_settings /
 * saas_plans / cached_translations / super_admin_* — เป็นข้อมูลระดับระบบ (ใช้ร่วมกันทุกหอ) ไม่ใช่ของหอใดหอหนึ่ง
 */
export const WORKSPACE_SCOPED_TABLES = [
  "buildings",
  "room_types",
  "rooms",
  "tenants",
  "tenants_old",
  "tenant_room_transfers",
  "meter_records",
  "meter_replacements",
  "bills",
  "bills_deleted",
  "building_utility_bills",
  "expenses",
  "cancelled_contracts",
  "staff_building_access",
  "tax_deductions",
  "pit_filings",
  "pp30_filings",
  "workspace_subscriptions",
  "saas_payments",
  "saas_payment_retry_queue",
  "slipok_retry_queue",
  "workspace_line_settings",
  "workspace_slipok_settings",
  "workspace_google_drive_settings",
  "support_access_grants",
  "registration_codes",
  "admin_connection_codes"
] as const

/**
 * ตารางที่คอลัมน์ workspace_id ไม่มี Foreign Key ผูกกับ workspaces โดยตรง (อาศัย cascade ผ่านตารางแม่แทน)
 * ต้องกวาดลบซ้ำด้วยตัวเองหลังลบ workspace เผื่อมีแถวกำพร้าหลงเหลือ
 */
export const TABLES_WITHOUT_WORKSPACE_FK = ["slipok_retry_queue", "saas_payment_retry_queue"] as const

/** Bucket เดียวที่ระบบใช้เก็บไฟล์ของหอ (สลิปค่าเช่า, สลิป subscription, โลโก้หอ) */
export const WORKSPACE_STORAGE_BUCKET = "payment-slips"

/** รหัส error ของ PostgREST/Postgres ที่แปลว่า "ยังไม่มีตารางนี้ในฐานข้อมูล" — ข้ามไปเงียบๆ ได้ */
export const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205", "PGRST106"])

/** ข้อมูลผู้ใช้ 1 คนในหอ ที่หน้าจัดการรายหอใช้แสดงผล (รวมข้อมูลจาก auth.users ที่ไม่มีใน public.profiles) */
export type WorkspaceMember = {
  id: string
  email: string
  role: "super_admin" | "admin" | "staff" | "tenant"
  full_name: string | null
  phone: string | null
  tfa_enabled: boolean
  created_at: string
  email_confirmed_at: string | null
  last_sign_in_at: string | null
}

/**
 * คอลัมน์ที่เป็นความลับ (token / secret / api key) — ต้องปิดบังก่อนเขียนลงไฟล์ Export
 * เพราะไฟล์นี้จะถูกอัปขึ้น Google Drive และอาจส่งต่อให้เจ้าของหอ ห้ามให้ credential หลุดออกไปเด็ดขาด
 */
const SECRET_COLUMN_PATTERN = /(token|secret|api_key|password|refresh)/i
const REDACTED_PLACEHOLDER = "***REDACTED***"

export type ExportedTable = {
  table: string
  rowCount: number
  /** ถ้าตารางนี้ดึงไม่สำเร็จ (นอกจากกรณีตารางไม่มีอยู่จริง) จะเก็บข้อความ error ไว้รายงานให้ Super Admin เห็น */
  error?: string
}

type TableDump = {
  table: string
  rows: Record<string, unknown>[]
  error?: string
}

/**
 * แปลงชื่อหอให้ใช้เป็นชื่อโฟลเดอร์/ไฟล์บน Google Drive ได้อย่างปลอดภัย
 * (ตัดอักขระต้องห้ามของระบบไฟล์ออก แต่ยังเก็บภาษาไทยไว้ครบเพื่อให้เจ้าของหออ่านออก)
 */
export function sanitizeDriveName(name: string, fallbackId: string): string {
  const cleaned = (name || "")
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
  if (cleaned) return cleaned.slice(0, 100)
  return `workspace-${fallbackId.slice(0, 8)}`
}

/** timestamp รูปแบบ YYYY-MM-DD_HHmm ตามเวลาไทย ใช้ต่อท้ายชื่อไฟล์ Export */
export function buildExportTimestamp(now: Date): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${bangkok.getUTCFullYear()}-${pad(bangkok.getUTCMonth() + 1)}-${pad(bangkok.getUTCDate())}_${pad(bangkok.getUTCHours())}${pad(bangkok.getUTCMinutes())}`
}

function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    result[key] = SECRET_COLUMN_PATTERN.test(key) && value != null && value !== "" ? REDACTED_PLACEHOLDER : value
  }
  return result
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  const text = typeof value === "object" ? JSON.stringify(value) : String(value)
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/**
 * แปลงข้อมูลเป็น CSV พร้อม BOM เพื่อให้ Excel เปิดแล้วภาษาไทยไม่เพี้ยน
 * หัวตารางรวม union ของ key ทุกแถว เผื่อบางแถวมีคอลัมน์ไม่ครบ (jsonb ที่เป็น null)
 */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "﻿"

  const headers: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        headers.push(key)
      }
    }
  }

  const lines = [headers.map(escapeCsvValue).join(",")]
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header])).join(","))
  }
  return `﻿${lines.join("\r\n")}`
}

/**
 * ดึงข้อมูลทุกตารางของ workspace นี้ออกมาแบบแบ่งหน้า (Supabase จำกัดผลลัพธ์ต่อ query อยู่แล้ว)
 * ตารางที่ยังไม่ถูกสร้างในฐานข้อมูลจะถูกข้ามไปเงียบๆ ไม่ถือเป็น error
 */
async function dumpWorkspaceTables(
  supabaseAdmin: SupabaseClient,
  workspaceId: string
): Promise<TableDump[]> {
  const PAGE_SIZE = 1000
  const dumps: TableDump[] = []

  // ตาราง workspaces เองใช้คีย์ id ไม่ใช่ workspace_id จึงต้องดึงแยก
  const { data: workspaceRow, error: workspaceError } = await supabaseAdmin
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
  dumps.push({
    table: "workspaces",
    rows: (workspaceRow || []) as Record<string, unknown>[],
    error: workspaceError?.message
  })

  // profiles ใช้ workspace_id แต่แยกออกมาเพราะอยากให้อยู่ต้นๆ ของไฟล์ Export (เป็นข้อมูลที่คนดูบ่อยสุด)
  const { data: profileRows, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("workspace_id", workspaceId)
  dumps.push({
    table: "profiles",
    rows: (profileRows || []) as Record<string, unknown>[],
    error: profileError?.message
  })

  for (const table of WORKSPACE_SCOPED_TABLES) {
    const rows: Record<string, unknown>[] = []
    let dumpError: string | undefined

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("*")
        .eq("workspace_id", workspaceId)
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) {
        // ตารางยังไม่มีในฐานข้อมูลนี้ (ยังไม่ได้รัน patch) — ข้ามไป ไม่ต้องรายงานเป็นข้อผิดพลาด
        if (MISSING_RELATION_CODES.has(error.code)) {
          dumpError = undefined
          break
        }
        dumpError = error.message
        break
      }

      rows.push(...((data || []) as Record<string, unknown>[]))
      if (!data || data.length < PAGE_SIZE) break
    }

    dumps.push({ table, rows, error: dumpError })
  }

  return dumps
}

/**
 * สร้างไฟล์ ZIP รวมข้อมูลทุกตารางของหอ (CSV ต่อ 1 ตาราง + full-data.json สำหรับนำเข้ากลับ)
 * คืนทั้ง Buffer ของไฟล์ และสรุปจำนวนแถวต่อตารางเพื่อแสดงผลบนหน้าจอ
 */
export async function buildWorkspaceExportZip(
  supabaseAdmin: SupabaseClient,
  workspaceId: string,
  workspaceName: string,
  generatedAt: Date
): Promise<{ buffer: Buffer; tables: ExportedTable[] }> {
  const dumps = await dumpWorkspaceTables(supabaseAdmin, workspaceId)
  const zip = new JSZip()

  const jsonPayload: Record<string, Record<string, unknown>[]> = {}
  const summary: ExportedTable[] = []

  for (const dump of dumps) {
    const redacted = dump.rows.map(redactRow)
    jsonPayload[dump.table] = redacted
    summary.push({ table: dump.table, rowCount: redacted.length, error: dump.error })

    // ตารางที่ไม่มีข้อมูลเลยไม่ต้องสร้างไฟล์ CSV เปล่าให้รก
    if (redacted.length > 0) {
      zip.file(`tables/${dump.table}.csv`, rowsToCsv(redacted))
    }
  }

  const totalRows = summary.reduce((sum, item) => sum + item.rowCount, 0)
  const failedTables = summary.filter((item) => item.error)

  const readme = [
    `ข้อมูลสำรองของหอพัก: ${workspaceName}`,
    `Workspace ID: ${workspaceId}`,
    `สร้างเมื่อ: ${generatedAt.toISOString()} (UTC)`,
    `จำนวนแถวรวมทั้งหมด: ${totalRows.toLocaleString("th-TH")} แถว จาก ${summary.length} ตาราง`,
    "",
    "โครงสร้างไฟล์",
    "- tables/<ชื่อตาราง>.csv  : ข้อมูลแต่ละตารางในรูปแบบ CSV (เข้ารหัส UTF-8 พร้อม BOM เปิดด้วย Excel ได้เลย)",
    "- full-data.json          : ข้อมูลทุกตารางในไฟล์เดียว ใช้สำหรับนำเข้ากลับเข้าระบบ",
    "",
    "หมายเหตุสำคัญ",
    "- คอลัมน์ที่เป็นความลับ (access token, channel secret, api key, refresh token) ถูกแทนที่ด้วย " + REDACTED_PLACEHOLDER,
    "  เพื่อความปลอดภัย ไม่สามารถกู้คืนค่าเหล่านี้จากไฟล์สำรองได้ ต้องเชื่อมต่อ LINE / SlipOK / Google Drive ใหม่",
    "- ไฟล์รูปภาพ (สลิปโอนเงิน, โลโก้หอ) ไม่ได้รวมอยู่ในไฟล์นี้ — ไฟล์นี้เก็บเฉพาะข้อมูลที่เป็นตารางเท่านั้น",
    "  URL ของรูปเดิมยังคงอยู่ในคอลัมน์ slip_url / slip_image_url / logo_url ของแต่ละตาราง",
    "",
    failedTables.length > 0
      ? `⚠️ ตารางที่ดึงข้อมูลไม่สำเร็จ: ${failedTables.map((item) => `${item.table} (${item.error})`).join(", ")}`
      : "✓ ดึงข้อมูลครบทุกตารางเรียบร้อย"
  ].join("\n")

  zip.file("README.txt", `﻿${readme}`)
  zip.file("full-data.json", JSON.stringify(jsonPayload, null, 2))

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  return { buffer, tables: summary }
}

/**
 * แปลง Public URL ของ Supabase Storage กลับเป็น path ภายใน bucket (เช่น "slips/bill_xxx.jpeg")
 * คืน null ถ้า URL ไม่ใช่ของ bucket นี้ หรือรูปแบบไม่ตรง
 */
export function extractStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null
  const marker = `/storage/v1/object/public/${WORKSPACE_STORAGE_BUCKET}/`
  const index = publicUrl.indexOf(marker)
  if (index === -1) return null

  const rawPath = publicUrl.slice(index + marker.length).split("?")[0]
  if (!rawPath) return null

  try {
    return decodeURIComponent(rawPath)
  } catch {
    return rawPath
  }
}

/**
 * รวบรวม path ของไฟล์ทั้งหมดใน Storage ที่เป็นของหอนี้ โดยไล่จากคอลัมน์ URL ในฐานข้อมูล
 * (path ของสลิปค่าเช่าไม่มี workspace_id อยู่ในชื่อไฟล์ จึงต้องไล่ย้อนจาก DB เท่านั้น ไม่สามารถ list ตามชื่อได้)
 */
export async function collectWorkspaceStoragePaths(
  supabaseAdmin: SupabaseClient,
  workspaceId: string
): Promise<string[]> {
  const paths = new Set<string>()

  const sources: Array<{ table: string; column: string }> = [
    { table: "bills", column: "slip_url" },
    { table: "bills_deleted", column: "slip_url" },
    { table: "saas_payments", column: "slip_image_url" },
    { table: "slipok_retry_queue", column: "slip_url" },
    { table: "saas_payment_retry_queue", column: "slip_url" }
  ]

  for (const source of sources) {
    const { data, error } = await supabaseAdmin
      .from(source.table)
      .select(source.column)
      .eq("workspace_id", workspaceId)
      .not(source.column, "is", null)

    if (error) {
      if (MISSING_RELATION_CODES.has(error.code)) continue
      throw error
    }

    for (const row of (data || []) as unknown as Record<string, unknown>[]) {
      const path = extractStoragePath(row[source.column] as string | null)
      if (path) paths.add(path)
    }
  }

  // โลโก้ของหอเก็บอยู่ใน bucket เดียวกันภายใต้ path logos/
  const { data: workspaceRow } = await supabaseAdmin
    .from("workspaces")
    .select("logo_url")
    .eq("id", workspaceId)
    .maybeSingle()

  const logoPath = extractStoragePath((workspaceRow as { logo_url?: string | null } | null)?.logo_url)
  if (logoPath) paths.add(logoPath)

  return Array.from(paths)
}
