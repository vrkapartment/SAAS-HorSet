import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

// In-memory fallback cache in case the database table is not yet created
// Deno Edge Functions can be ephemeral, but they can persist state across some invocations
let memoryCache: {
  limit: number;
  consumed: number;
  remaining: number;
  percentage_used: number;
  updatedAt: number;
} | null = null;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 1. Get LINE_CHANNEL_ACCESS_TOKEN from Environment Variable
    const lineAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")
    if (!lineAccessToken) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN Environment Variable is not configured in Supabase.")
    }

    // 2. Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = Date.now()
    const tenMinutes = 10 * 60 * 1000

    // 3. Try to check database cache first (if table exists)
    let dbCacheSuccess = false
    let cachedData = null

    try {
      const { data, error } = await supabase
        .from("line_quota_cache")
        .select("*")
        .eq("id", 1)
        .maybeSingle()

      if (!error) {
        dbCacheSuccess = true
        if (data) {
          const cacheAge = now - new Date(data.updated_at).getTime()
          if (cacheAge < tenMinutes) {
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
        console.warn("Database cache check failed or table not found, falling back to memory/API:", error.message)
      }
    } catch (dbErr) {
      console.warn("Database cache query error (table probably doesn't exist yet):", dbErr)
    }

    // 4. Check in-memory fallback cache if database cache wasn't found or failed
    if (!cachedData && memoryCache) {
      const cacheAge = now - memoryCache.updatedAt
      if (cacheAge < tenMinutes) {
        cachedData = {
          limit: memoryCache.limit,
          consumed: memoryCache.consumed,
          remaining: memoryCache.remaining,
          percentage_used: memoryCache.percentage_used,
          cached: true,
          source: "memory",
          updated_at: new Date(memoryCache.updatedAt).toISOString()
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
    // GET https://api.line.me/v2/bot/message/quota (To see the limit)
    // GET https://api.line.me/v2/bot/message/quota/consumption (To see consumption)
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

    // quotaJson structure: { type: "none" | "limited", value: number }
    // consumptionJson structure: { totalUsage: number }
    const limitType = quotaJson.type
    // If type is "none" (unlimited), use a default high number or 0 to represent unlimited
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
    memoryCache = {
      limit,
      consumed,
      remaining,
      percentage_used,
      updatedAt: now
    }

    // 7. Update database cache table if it exists
    if (dbCacheSuccess) {
      try {
        await supabase
          .from("line_quota_cache")
          .upsert({
            id: 1,
            limit_count: limit,
            consumed_count: consumed,
            remaining_count: remaining,
            percentage_used,
            updated_at: responsePayload.updated_at
          }, { onConflict: "id" })
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
        status: 200, // Return 200 with success: false to let UI handle the error parsing smoothly
      }
    )
  }
})
