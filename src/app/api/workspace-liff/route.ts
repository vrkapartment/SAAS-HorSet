import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// In-memory cache for bot information to prevent excessive LINE API calls
const botCache = new Map<string, { botBasicId: string; botDisplayName: string; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspace_id")
    const defaultLiffId = "2010442620-H4josaDy"
    const defaultBotBasicId = "@423xmlwo"
    const defaultBotDisplayName = "แชทบิลอัตโนมัติ"

    if (!workspaceId) {
      return NextResponse.json({
        success: true,
        liffId: defaultLiffId,
        botBasicId: defaultBotBasicId,
        botDisplayName: defaultBotDisplayName
      })
    }

    const supabase = await createClient()
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
      liffId: "2010442620-H4josaDy",
      botBasicId: "@423xmlwo",
      botDisplayName: "แชทบิลอัตโนมัติ"
    })
  }
}

