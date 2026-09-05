import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generatePortalToken } from "@/features/tenant/actions"
import { DEFAULT_LIFF_ID, liffChannelId } from "@/lib/lineLiff"

/**
 * แปลง "บัญชี LINE ที่กดปุ่มใน rich menu" ให้เป็น "ลิงก์ดูบิลของห้องตัวเอง"
 *
 * ปุ่มใน rich menu เป็นปุ่มเดียวที่ผู้ติดตามทุกคนกดร่วมกัน จึงฝัง room_id + token ของใครไว้ล่วงหน้าไม่ได้
 * หน้า /tenant-register?to=portal จะส่ง LINE access token เข้ามาที่นี่ แล้ว route นี้ชี้ว่าเป็นผู้เช่าห้องไหน
 * โดยเทียบกับ tenants.line_user_id ที่บันทึกไว้ตอนผู้เช่าลงทะเบียนผ่าน LIFF
 *
 * ⚠️ route นี้ต้องเรียกได้แบบไม่มี session (ผู้เช่าไม่มีบัญชีในระบบ) — ด่านความปลอดภัยคือ
 *    1. access token ต้องผ่านการ verify กับ LINE จริง และยังไม่หมดอายุ
 *    2. channel ที่ออก token ต้องเป็น channel ของเราเอง (กัน token จากแอปอื่น)
 *    3. คืนเฉพาะห้องที่ผูกกับ LINE user คนนั้นเท่านั้น ไม่รับ room_id จาก client มาเชื่อ
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 30
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const bucket = rateLimitBuckets.get(ip)
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(ip, { count: 1, windowStart: now })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_LIMIT_MAX_REQUESTS
}

type ResolvedRoom = {
  workspaceId: string
  workspaceName: string
  roomId: string
  roomNumber: string
  token: string
}

/**
 * Channel ID ที่ยอมรับ token ได้
 *
 * รู้ workspace อยู่แล้ว (ปุ่มมาจาก rich menu ของหอนั้น) → เทียบกับ LIFF ของหอนั้น + LIFF กลาง
 * ไม่รู้ workspace (ปุ่มมาจาก OA กลางที่หลายหอใช้ร่วมกัน) → เทียบกับ LIFF ของทุกหอที่ตั้งค่าไว้
 */
async function allowedChannelIds(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<Set<string>> {
  const ids = new Set<string>()
  const defaultChannel = liffChannelId(DEFAULT_LIFF_ID)
  if (defaultChannel) ids.add(defaultChannel)

  if (workspaceId) {
    const { data, error } = await supabase
      .from("workspace_line_settings")
      .select("liff_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    if (error) {
      console.warn("portal-resolve: failed to read workspace liff_id:", error.message)
    }
    const channel = liffChannelId(data?.liff_id)
    if (channel) ids.add(channel)
    return ids
  }

  const { data, error } = await supabase
    .from("workspace_line_settings")
    .select("liff_id")
    .not("liff_id", "is", null)
  if (error) {
    console.warn("portal-resolve: failed to list workspace liff_id:", error.message)
    return ids
  }
  for (const row of data || []) {
    const channel = liffChannelId(row.liff_id)
    if (channel) ids.add(channel)
  }
  return ids
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { success: false, error: "มีการเรียกใช้บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" },
        { status: 429 }
      )
    }

    let body: unknown = null
    try {
      body = await request.json()
    } catch {
      body = null
    }
    const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>

    const accessToken = typeof payload.accessToken === "string" ? payload.accessToken.trim() : ""
    const rawWorkspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId.trim() : ""
    const workspaceId = UUID_RE.test(rawWorkspaceId) ? rawWorkspaceId : ""

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: "ไม่พบข้อมูลการยืนยันตัวตนจาก LINE" },
        { status: 400 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey || serviceKey.includes("placeholder")) {
      return NextResponse.json(
        { success: false, error: "ระบบฐานข้อมูลหลังบ้านไม่พร้อมใช้งาน" },
        { status: 503 }
      )
    }

    const { createClient: createSupabaseClient } = await import("@supabase/supabase-js")
    const supabase = createSupabaseClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // 1. ตรวจ access token กับ LINE — ได้ client_id ของ channel ที่ออก token มาให้ตรวจต่อ
    const verifyRes = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`
    )
    if (!verifyRes.ok) {
      return NextResponse.json(
        { success: false, error: "เซสชัน LINE หมดอายุแล้ว กรุณาปิดหน้านี้แล้วกดปุ่มในเมนูใหม่อีกครั้ง" },
        { status: 401 }
      )
    }
    const verifyData = await verifyRes.json()
    const tokenChannelId = verifyData?.client_id ? String(verifyData.client_id) : ""
    if (!tokenChannelId || Number(verifyData?.expires_in) <= 0) {
      return NextResponse.json(
        { success: false, error: "เซสชัน LINE หมดอายุแล้ว กรุณาปิดหน้านี้แล้วกดปุ่มในเมนูใหม่อีกครั้ง" },
        { status: 401 }
      )
    }

    // 2. channel ที่ออก token ต้องเป็นของเราเอง
    const allowed = await allowedChannelIds(supabase, workspaceId)
    if (!allowed.has(tokenChannelId)) {
      return NextResponse.json(
        { success: false, error: "การยืนยันตัวตนนี้ไม่ได้มาจาก LINE OA ของหอพัก" },
        { status: 403 }
      )
    }

    // 3. ขอ userId ของผู้กดปุ่ม
    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!profileRes.ok) {
      return NextResponse.json(
        { success: false, error: "ไม่สามารถอ่านข้อมูลบัญชี LINE ได้ กรุณาลองใหม่อีกครั้ง" },
        { status: 401 }
      )
    }
    const profileData = await profileRes.json()
    const lineUserId = typeof profileData?.userId === "string" ? profileData.userId : ""
    if (!lineUserId) {
      return NextResponse.json(
        { success: false, error: "ไม่สามารถอ่านข้อมูลบัญชี LINE ได้ กรุณาลองใหม่อีกครั้ง" },
        { status: 401 }
      )
    }

    // 4. หาสัญญาที่ยังใช้งานอยู่ของ LINE คนนี้
    //    (ผู้เช่าที่ย้ายออกแล้วถูกย้ายไปตาราง tenants_old จึงไม่ต้องกรอง moved_out_at ที่นี่)
    let query = supabase
      .from("tenants")
      .select("room_id, workspace_id, lease_start, rooms(room_number), workspaces(name)")
      .eq("line_user_id", lineUserId)
      .not("room_id", "is", null)
      .order("lease_start", { ascending: false })
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }

    const { data: tenantRows, error: tenantError } = await query
    if (tenantError) {
      console.error("portal-resolve: failed to query tenants:", tenantError.message)
      return NextResponse.json(
        { success: false, error: "ไม่สามารถค้นหาข้อมูลผู้เช่าได้ กรุณาลองใหม่อีกครั้ง" },
        { status: 500 }
      )
    }

    // ผู้เช่าคนเดียวอาจมีหลายสัญญาในห้องเดิม (ต่อสัญญา) — ยุบให้เหลือห้องละหนึ่งรายการ
    const seenRooms = new Set<string>()
    const rooms: ResolvedRoom[] = []
    for (const row of tenantRows || []) {
      const roomId = typeof row.room_id === "string" ? row.room_id : ""
      const rowWorkspaceId = typeof row.workspace_id === "string" ? row.workspace_id : ""
      if (!roomId || !rowWorkspaceId) continue
      const key = `${rowWorkspaceId}:${roomId}`
      if (seenRooms.has(key)) continue
      seenRooms.add(key)

      const roomRel = row.rooms as { room_number?: string } | { room_number?: string }[] | null
      const roomRow = Array.isArray(roomRel) ? roomRel[0] : roomRel
      const workspaceRel = row.workspaces as { name?: string } | { name?: string }[] | null
      const workspaceRow = Array.isArray(workspaceRel) ? workspaceRel[0] : workspaceRel

      rooms.push({
        workspaceId: rowWorkspaceId,
        workspaceName: workspaceRow?.name || "หอพัก",
        roomId,
        roomNumber: roomRow?.room_number || "-",
        token: await generatePortalToken(rowWorkspaceId, roomId)
      })
    }

    if (rooms.length === 0) {
      return NextResponse.json({ success: true, status: "not_registered" })
    }
    if (rooms.length === 1) {
      return NextResponse.json({ success: true, status: "resolved", room: rooms[0] })
    }
    // ผู้เช่าหลายห้อง/หลายหอในบัญชี LINE เดียว — ให้เลือกเองเสมอ ห้ามเดาแทน
    return NextResponse.json({ success: true, status: "multiple", rooms })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error"
    console.error("portal-resolve exception:", message)
    return NextResponse.json(
      { success: false, error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    )
  }
}
