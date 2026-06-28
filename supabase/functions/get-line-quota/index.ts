import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

// In-memory fallback cache
let memoryCache: { [key: string]: {
  limit: number;
  consumed: number;
  remaining: number;
  percentage_used: number;
  updatedAt: number;
} } = {};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 1. Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = Date.now()
    const tenMinutes = 10 * 60 * 1000

    // Parse query parameters
    const requestUrl = new URL(req.url)
    const bypassCache = requestUrl.searchParams.get("bypass_cache") === "true"
    const workspaceId = requestUrl.searchParams.get("workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"

    // 2. Query the database cache and token together
    let dbCacheSuccess = false
    let cachedData = null
    let dbToken: string | null = null
    let dbRowData: any = null

    try {
      // First try workspace_line_settings (multi-tenant)
      const { data, error } = await supabase
        .from("workspace_line_settings")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle()

      if (!error) {
        dbCacheSuccess = true
        if (data) {
          dbRowData = data
          if (data.channel_access_token) {
            dbToken = data.channel_access_token
          }
          const cacheAge = now - new Date(data.updated_at).getTime()
          // Only use database cache if bypassCache is FALSE
          if (!bypassCache && cacheAge < tenMinutes && data.limit_count !== null && data.consumed_count !== null) {
            cachedData = {
              limit: data.limit_count,
              consumed: data.consumed_count,
              remaining: data.remaining_count,
              percentage_used: data.percentage_used,
              cached: true,
              source: "database",
              updated_at: data.updated_at
            }
          }
        }
      } else {
        // Fallback to legacy single-tenant line_quota_cache table
        console.warn("workspace_line_settings query failed, trying legacy line_quota_cache:", error.message)
        const { data: legacyData, error: legacyErr } = await supabase
          .from("line_quota_cache")
          .select("*")
          .eq("id", 1)
          .maybeSingle()

        if (!legacyErr && legacyData) {
          dbCacheSuccess = true // Mark success if legacy table exists
          dbRowData = legacyData
          dbRowData.isLegacy = true // Flag to identify legacy row
          if (legacyData.channel_access_token) {
            dbToken = legacyData.channel_access_token
          }
          const cacheAge = now - new Date(legacyData.updated_at).getTime()
          if (!bypassCache && cacheAge < tenMinutes && legacyData.limit_count !== null && legacyData.consumed_count !== null) {
            cachedData = {
              limit: legacyData.limit_count,
              consumed: legacyData.consumed_count,
              remaining: legacyData.remaining_count,
              percentage_used: legacyData.percentage_used,
              cached: true,
              source: "database_legacy",
              updated_at: legacyData.updated_at
            }
          }
        }
      }
    } catch (dbErr) {
      console.warn("Database cache query error:", dbErr)
    }

    // 3. Resolve Active LINE Channel Access Token
    const lineAccessToken = dbToken || Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")
    if (!lineAccessToken) {
      throw new Error(`LINE Channel Access Token is not configured for workspace ${workspaceId}. Please set it in Settings.`)
    }

    // 4. Check in-memory fallback cache
    if (!bypassCache && !cachedData && memoryCache[workspaceId]) {
      const cacheAge = now - memoryCache[workspaceId].updatedAt
      if (cacheAge < tenMinutes) {
        cachedData = {
          limit: memoryCache[workspaceId].limit,
          consumed: memoryCache[workspaceId].consumed,
          remaining: memoryCache[workspaceId].remaining,
          percentage_used: memoryCache[workspaceId].percentage_used,
          cached: true,
          source: "memory",
          updated_at: new Date(memoryCache[workspaceId].updatedAt).toISOString()
        }
      }
    }

    // If cache is valid, return it immediately
    if (cachedData) {
      return new Response(
        JSON.stringify({
          success: true,
          ...cachedData
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      )
    }

    // 5. Fetch fresh data from LINE Messaging API concurrently
    const quotaPromise = fetch("https://api.line.me/v2/bot/message/quota", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${lineAccessToken}`
      }
    })

    const consumptionPromise = fetch("https://api.line.me/v2/bot/message/quota/consumption", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${lineAccessToken}`
      }
    })

    const [quotaRes, consumptionRes] = await Promise.all([quotaPromise, consumptionPromise])

    if (!quotaRes.ok) {
      const errText = await quotaRes.text()
      throw new Error(`LINE Messaging API (quota) error: ${quotaRes.status} - ${errText}`)
    }

    if (!consumptionRes.ok) {
      const errText = await consumptionRes.text()
      throw new Error(`LINE Messaging API (consumption) error: ${consumptionRes.status} - ${errText}`)
    }

    const quotaJson = await quotaRes.json()
    const consumptionJson = await consumptionRes.json()

    const limitType = quotaJson.type
    const limit = limitType === "none" ? 100000 : (quotaJson.value || 1000)
    const consumed = consumptionJson.totalUsage || 0
    const remaining = limitType === "none" ? 100000 - consumed : Math.max(0, limit - consumed)
    const percentage_used = limit > 0 ? Math.round((consumed / limit) * 100) : 0

    const responsePayload = {
      success: true,
      limit,
      consumed,
      remaining,
      percentage_used,
      cached: false,
      source: "api",
      updated_at: new Date().toISOString()
    }

    // 6. Update in-memory fallback cache
    memoryCache[workspaceId] = {
      limit,
      consumed,
      remaining,
      percentage_used,
      updatedAt: now
    }

    // 7. Safe database update
    if (dbCacheSuccess) {
      try {
        if (dbRowData && !dbRowData.isLegacy) {
          // Row exists in workspace_line_settings
          await supabase
            .from("workspace_line_settings")
            .update({
              limit_count: limit,
              consumed_count: consumed,
              remaining_count: remaining,
              percentage_used,
              updated_at: responsePayload.updated_at
            })
            .eq("workspace_id", workspaceId)
        } else if (dbRowData && dbRowData.isLegacy) {
          // Fallback legacy row update
          await supabase
            .from("line_quota_cache")
            .update({
              limit_count: limit,
              consumed_count: consumed,
              remaining_count: remaining,
              percentage_used,
              updated_at: responsePayload.updated_at
            })
            .eq("id", 1)
        } else {
          // Row doesn't exist: insert new workspace settings
          await supabase
            .from("workspace_line_settings")
            .insert({
              workspace_id: workspaceId,
              limit_count: limit,
              consumed_count: consumed,
              remaining_count: remaining,
              percentage_used,
              updated_at: responsePayload.updated_at
            })
        }
      } catch (dbUpsertErr) {
        console.error("Failed to update database cache table:", dbUpsertErr)
      }
    }

    return new Response(
      JSON.stringify(responsePayload),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    )

  } catch (error: any) {
    console.error("Error in get-line-quota edge function:", error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || String(error)
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    )
  }
})
