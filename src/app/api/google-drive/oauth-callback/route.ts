import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { OAuth2Client } from "google-auth-library"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { encryptText, decryptText } from "@/lib/encryption"

export const dynamic = "force-dynamic"

function getSettingsRedirectBase(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  let safeAppUrl = appUrl.trim()
  while (safeAppUrl.endsWith("/")) {
    safeAppUrl = safeAppUrl.slice(0, -1)
  }
  return safeAppUrl
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const oauthError = searchParams.get("error")

  const safeAppUrl = getSettingsRedirectBase()
  const settingsUrl = `${safeAppUrl}/super-admin`

  // ผู้ใช้กด "ยกเลิก" ในหน้า consent ของ Google หรือเกิด error อื่นระหว่าง authorize
  if (oauthError) {
    return NextResponse.redirect(`${settingsUrl}?google_drive_error=${encodeURIComponent(oauthError)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${settingsUrl}?google_drive_error=missing_code`)
  }

  try {
    // ต้องเป็น super_admin เท่านั้นถึงจะบันทึก refresh_token ลงระบบได้ (ป้องกันคนอื่นแอบยิง callback นี้)
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return NextResponse.redirect(`${settingsUrl}?google_drive_error=unauthorized`)
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey || serviceKey.includes("placeholder")) {
      return NextResponse.redirect(`${settingsUrl}?google_drive_error=server_not_ready`)
    }

    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["GOOGLE_DRIVE_OAUTH_CLIENT_ID", "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"])

    if (settingsError) throw settingsError

    const clientId = settings?.find((s) => s.key === "GOOGLE_DRIVE_OAUTH_CLIENT_ID")?.value
    const clientSecretEnc = settings?.find((s) => s.key === "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET")?.value

    if (!clientId || !clientSecretEnc) {
      return NextResponse.redirect(`${settingsUrl}?google_drive_error=missing_client_credentials`)
    }

    const clientSecret = decryptText(clientSecretEnc)
    const redirectUri = `${safeAppUrl}/api/google-drive/oauth-callback`

    const oauth2Client = new OAuth2Client({ clientId, clientSecret, redirectUri })
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      // ไม่ได้ refresh_token กลับมา (Google จะไม่ส่งซ้ำถ้าเคย consent ไปแล้วโดยไม่ระบุ prompt=consent)
      return NextResponse.redirect(`${settingsUrl}?google_drive_error=no_refresh_token`)
    }

    const { error: upsertError } = await supabaseAdmin
      .from("system_settings")
      .upsert(
        { key: "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN", value: encryptText(tokens.refresh_token) },
        { onConflict: "key" }
      )
    if (upsertError) throw upsertError

    return NextResponse.redirect(`${settingsUrl}?google_drive_connected=1`)
  } catch (err: unknown) {
    console.error("Google Drive OAuth callback error:", err)
    const message = err instanceof Error ? err.message : "unknown_error"
    return NextResponse.redirect(`${settingsUrl}?google_drive_error=${encodeURIComponent(message)}`)
  }
}
