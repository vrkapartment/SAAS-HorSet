import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { DEFAULT_BOT_BASIC_ID, DEFAULT_BOT_DISPLAY_NAME, DEFAULT_LIFF_ID } from "@/lib/lineLiff"

// In-memory cache for bot information to prevent excessive LINE API calls
const botCache = new Map<string, { botBasicId: string; botDisplayName: string; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Route นี้ต้องเปิดให้เรียกได้แบบไม่มี session (หน้าลงทะเบียนผู้เช่าต้องใช้ liffId เปิด LINE Login
// ก่อน login จริง) ข้อมูลที่คืนกลับเป็นแค่ liffId/ชื่อบอทสาธารณะ ไม่มี token หลุดออกไป — จำกัดแค่
// รูปแบบ workspace_id ต้องเป็น UUID จริง + rate limit ต่อ IP กันการไล่ scrape เท่านั้น
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 20
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspace_id")
    const defaultLiffId = DEFAULT_LIFF_ID
    const defaultBotBasicId = DEFAULT_BOT_BASIC_ID
    const defaultBotDisplayName = DEFAULT_BOT_DISPLAY_NAME

    if (!workspaceId || !UUID_RE.test(workspaceId)) {
      return NextResponse.json({
        success: true,
        liffId: defaultLiffId,
        botBasicId: defaultBotBasicId,
        botDisplayName: defaultBotDisplayName
      })
    }

    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    if (isRateLimited(clientIp)) {
      return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    let supabase
    if (url && serviceKey && !serviceKey.includes("placeholder")) {
      const { createClient: createSupabaseClient } = await import("@supabase/supabase-js")
      supabase = createSupabaseClient(url, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      })
    } else {
      supabase = await createClient()
    }

    const { data, error } = await supabase
      .from("workspace_line_settings")
      .select("liff_id, channel_access_token")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (error) {
      console.warn("Error fetching workspace LINE settings, falling back to default:", error.message)
      return NextResponse.json({
        success: true,
        liffId: defaultLiffId,
        botBasicId: defaultBotBasicId,
        botDisplayName: defaultBotDisplayName
      })
    }

    const liffId = data?.liff_id || defaultLiffId
    let botBasicId = defaultBotBasicId
    let botDisplayName = defaultBotDisplayName

    if (data?.channel_access_token) {
      const cached = botCache.get(workspaceId)
      const now = Date.now()

      if (cached && (now - cached.timestamp < CACHE_TTL)) {
        botBasicId = cached.botBasicId
        botDisplayName = cached.botDisplayName
      } else {
        try {
          const botRes = await fetch("https://api.line.me/v2/bot/info", {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${data.channel_access_token}`
            }
          })
          if (botRes.ok) {
            const botInfo = await botRes.json()
            if (botInfo.basicId) {
              botBasicId = botInfo.basicId
              botDisplayName = botInfo.displayName || "LINE OA ของหอพัก"
              // Save to cache
              botCache.set(workspaceId, {
                botBasicId,
                botDisplayName,
                timestamp: now
              })
            }
          } else {
            console.warn(`LINE API bot/info returned status ${botRes.status} for workspace ${workspaceId}`)
          }
        } catch (fetchErr) {
          console.error("Error fetching bot info from LINE API:", fetchErr)
        }
      }
    }

    return NextResponse.json({
      success: true,
      liffId,
      botBasicId,
      botDisplayName
    })
  } catch (error: any) {
    console.error("Workspace LIFF API Exception:", error)
    return NextResponse.json({
      success: true,
      liffId: DEFAULT_LIFF_ID,
      botBasicId: DEFAULT_BOT_BASIC_ID,
      botDisplayName: DEFAULT_BOT_DISPLAY_NAME
    })
  }
}

