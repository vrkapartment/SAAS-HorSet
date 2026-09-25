/**
 * สิทธิ์เข้าหน้า Portal ของผู้เช่าแบบไม่ต้อง login (ลิงก์จาก LINE / rich menu)
 *
 * ⚠️ ไฟล์นี้ใช้ฝั่ง server เท่านั้น (อ่าน secret + service role key) — ห้าม import จาก client component
 *    และจงใจไม่ใส่ "use server" เพราะทุกฟังก์ชันที่ export จากไฟล์ "use server" กลายเป็น
 *    endpoint ที่ใครก็เรียกได้ ถ้า signPortalToken อยู่ในนั้น คนนอกจะขอ token ของใครก็ได้
 *
 * ── ทำไม token ต้องผูกกับ "ผู้เช่า" ไม่ใช่ "ห้อง" ──
 * รุ่นเดิมเซ็น token จาก workspace + ห้อง และไม่มีวันหมดอายุ ลิงก์ของห้องเดียวกันจึงเหมือนกันทุกคน
 *   - ผู้เช่าที่ย้ายออกแล้วกดลิงก์เก่า → เห็นบิล QR และส่งสลิปแทนผู้เช่าคนใหม่ได้
 *   - ช่วงห้องว่าง ลิงก์เก่าแสดงบิลทุกใบของทุกคนที่เคยอยู่ห้องนั้น
 * รุ่นนี้เซ็นจาก workspace + tenants.id — ผู้เช่าย้ายออก (แถวใน tenants ถูกย้ายไป tenants_old)
 * ลิงก์ของเขาจะใช้ไม่ได้ทันที และผู้เช่าคนใหม่ได้ tenants.id ใหม่ จึงได้ลิงก์ใหม่ของตัวเอง
 *
 * ลิงก์รุ่นเก่า (ไม่มี tenant_id) ถูกปฏิเสธทั้งหมด — แยกไม่ได้ว่าใครถือ
 */
import crypto from "crypto"
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  isBillVisibleToTenant,
  tenantRoomStints,
  type TenantStint,
  type TenantTransferRow,
} from "@/features/tenant/occupancy"

/** เปลี่ยนค่านี้ = ยกเลิกลิงก์ที่ส่งไปแล้วทั้งหมด */
const TOKEN_VERSION = "tenant-v2"

export const LEGACY_PORTAL_LINK_ERROR =
  "ลิงก์นี้เป็นรูปแบบเดิมและถูกยกเลิกแล้วเพื่อความปลอดภัย กรุณาเปิดบิลจากปุ่มเมนูใน LINE ของหอพัก หรือใช้ลิงก์จากใบแจ้งหนี้รอบล่าสุด"

export const INVALID_PORTAL_LINK_ERROR =
  "ลิงก์นี้ใช้ไม่ได้แล้ว (ผู้เช่าย้ายออกหรือลิงก์ไม่ถูกต้อง) กรุณาเปิดบิลจากปุ่มเมนูใน LINE ของหอพัก"

function signatureSecret(): string {
  return process.env.PORTAL_SIGNATURE_SECRET || process.env.LINE_CHANNEL_SECRET || "horset-portal-signature-secret-key-fallback"
}

export function signPortalToken(workspaceId: string, tenantId: string): string {
  return crypto
    .createHmac("sha256", signatureSecret())
    .update(`${TOKEN_VERSION}:${workspaceId}:${tenantId}`)
    .digest("hex")
}

export function isPortalTokenValid(workspaceId: string, tenantId: string, token: string): boolean {
  if (!workspaceId || !tenantId || !token) return false
  const expected = Buffer.from(signPortalToken(workspaceId, tenantId), "utf-8")
  const given = Buffer.from(token, "utf-8")
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

/** query string ของลิงก์ Portal (workspace_id + room_id + tenant_id + token) */
export function buildPortalSearchParams(workspaceId: string, roomId: string, tenantId: string): URLSearchParams {
  return new URLSearchParams({
    workspace_id: workspaceId,
    room_id: roomId,
    tenant_id: tenantId,
    token: signPortalToken(workspaceId, tenantId),
  })
}

export function createServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey || serviceKey.includes("placeholder")) return null
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type PortalTenantRow = {
  id: string
  workspace_id: string
  room_id: string | null
  tenant_name: string
  lease_start: string | null
  lease_end: string | null
  created_at: string | null
  [column: string]: unknown
}

/**
 * ตรวจ token แล้วคืนผู้เช่าเจ้าของลิงก์ — null = ลิงก์ใช้ไม่ได้
 *
 * ผู้เช่าต้องยังอยู่ในหอ (มีแถวใน tenants และมีห้อง) ถ้าย้ายห้องภายในหอ ลิงก์เดิมยังใช้ได้
 * และพาไปห้องปัจจุบัน เพราะเป็นคนเดิม
 */
export async function resolvePortalTenant(
  db: SupabaseClient,
  workspaceId: string,
  tenantId: string,
  token: string
): Promise<PortalTenantRow | null> {
  if (!isPortalTokenValid(workspaceId, tenantId, token)) return null

  const { data, error } = await db
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) {
    console.error("[resolvePortalTenant] อ่านข้อมูลผู้เช่าไม่ได้:", error.message)
    return null
  }
  const tenant = data as PortalTenantRow | null
  if (!tenant || !tenant.room_id) return null
  return tenant
}

export type PortalBillRow = {
  id: string
  room_id: string | null
  billing_cycle: string
  tenant_name: string | null
  [column: string]: unknown
}

async function readTenantTransfers(db: SupabaseClient, tenant: PortalTenantRow): Promise<TenantTransferRow[]> {
  const { data, error } = await db
    .from("tenant_room_transfers")
    .select("id, tenant_id, from_room_id, to_room_id, transfer_date")
    .eq("workspace_id", tenant.workspace_id)
    .eq("tenant_id", tenant.id)

  if (error) {
    // อ่านประวัติไม่ได้ → เห็นแค่ห้องปัจจุบัน (ปลอดภัยกว่าเปิดกว้าง)
    console.warn("[portal-access] อ่าน tenant_room_transfers ไม่ได้:", error.message)
    return []
  }
  return (data as TenantTransferRow[] | null) ?? []
}

/**
 * ผู้เช่าคนนี้เป็นเจ้าของบิลใบนี้หรือไม่ — ใช้กฎเดียวกับที่หน้า Portal ใช้แสดงบิล
 * (ใช้ตรวจก่อนยอมให้ส่งสลิปเข้าบิล)
 */
export async function tenantCanSeeBill(db: SupabaseClient, tenant: PortalTenantRow, billId: string): Promise<boolean> {
  const { data: bill, error } = await db
    .from("bills")
    .select("id, workspace_id, room_id, billing_cycle, tenant_name")
    .eq("id", billId)
    .maybeSingle()
  if (error || !bill || bill.workspace_id !== tenant.workspace_id) return false

  const stints = tenantRoomStints(tenant, await readTenantTransfers(db, tenant))
  return isBillVisibleToTenant(bill as PortalBillRow, tenant.tenant_name, stints)
}

/**
 * บิลทุกใบที่ผู้เช่าคนนี้มีสิทธิ์เห็น — รวมบิลของห้องเก่าก่อนย้ายห้อง
 *
 * ⚠️ db ต้องเป็น service role client — RLS ของผู้เช่าเปิดให้อ่านแค่ห้องปัจจุบัน
 *    ฝั่งผู้เรียกต้องยืนยันตัวตนผู้เช่าให้เรียบร้อยก่อน (token หรือ session)
 */
export async function fetchTenantVisibleBills(
  db: SupabaseClient,
  tenant: PortalTenantRow
): Promise<{ bills: PortalBillRow[]; stints: TenantStint[] }> {
  const stints = tenantRoomStints(tenant, await readTenantTransfers(db, tenant))
  const roomIds = [...new Set(stints.map((s) => s.roomId))]
  if (roomIds.length === 0) return { bills: [], stints }

  const { data: billRows, error: billsError } = await db
    .from("bills")
    .select("*")
    .eq("workspace_id", tenant.workspace_id)
    .in("room_id", roomIds)
    .order("billing_cycle", { ascending: false })

  if (billsError) throw billsError

  const bills = ((billRows as PortalBillRow[] | null) ?? []).filter((b) =>
    isBillVisibleToTenant(b, tenant.tenant_name, stints)
  )
  return { bills, stints }
}
