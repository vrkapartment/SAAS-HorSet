import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getWorkspaceStaffAction } from "@/features/permissions/actions"

export async function GET() {
  const diagnostics: any = {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET (length: " + process.env.NEXT_PUBLIC_SUPABASE_URL.length + ")" : "MISSING",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "SET (length: " + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length + ")" : "MISSING",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY 
        ? `SET (length: ${process.env.SUPABASE_SERVICE_ROLE_KEY.length}, starts with: ${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 8)}...)` 
        : "MISSING",
    },
    action_call: null,
    direct_db_query: null
  }

  // 1. Try calling the action
  try {
    const res = await getWorkspaceStaffAction()
    diagnostics.action_call = { success: true, result: res }
  } catch (err: any) {
    diagnostics.action_call = { 
      success: false, 
      error: err?.message || String(err),
      stack: err?.stack
    }
  }

  // 2. Try direct DB query with service role key if available
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const client = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      )
      const { data, error } = await client.from("profiles").select("id, email, role, permissions").limit(5)
      diagnostics.direct_db_query = {
        success: !error,
        error: error ? error.message : null,
        data: data || []
      }
    } catch (err: any) {
      diagnostics.direct_db_query = {
        success: false,
        error: err?.message || String(err),
        stack: err?.stack
      }
    }
  } else {
    diagnostics.direct_db_query = {
      success: false,
      error: "Skipped: Missing URL or Service Role Key"
    }
  }

  return NextResponse.json(diagnostics)
}
