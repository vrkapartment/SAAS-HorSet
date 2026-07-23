import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { OAuth2Client } from "google-auth-library"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { encryptText, decryptText } from "@/lib/encryption"

export const dynamic = "force-dynamic"

function getAppUrlBase(): string {
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
  const state = searchParams.get("state") || "global"

  const safeAppUrl = getAppUrlBase()

  // state = "global" -> Super Admin เชื่อมต่อบัญชี Drive กลางของ HorSet (สำหรับสลิป subscription)
  // state = "workspace:{id}" -> Admin ของหอเชื่อมต่อ Drive ของหอตัวเอง (สำหรับสลิปค่าเช่า)
  const isWorkspaceFlow = state.startsWith("workspace:")
  const workspaceId = isWorkspaceFlow ? state.slice("workspace:".length) : null

  const redirectUrl = isWorkspaceFlow ? `${safeAppUrl}/settings?tab=google_drive` : `${safeAppUrl}/super-admin`

  // ผู้ใช้กด "ยกเลิก" ในหน้า consent ของ Google หรือเกิด error อื่นระหว่าง authorize
  if (oauthError) {
    return NextResponse.redirect(`${redirectUrl}?google_drive_error=${encodeURIComponent(oauthError)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${redirectUrl}?google_drive_error=missing_code`)
  }
  if (isWorkspaceFlow && !workspaceId) {
    return NextResponse.redirect(`${redirectUrl}?google_drive_error=missing_workspace_id`)
  }

  try {
    // เช็คสิทธิ์ของ user ปัจจุบันจาก session จริง — ห้ามเชื่อค่า workspaceId ใน state เฉยๆ โดยไม่ตรวจสอบ
    // (กัน user คนหนึ่งปลอม state=workspace:{id ของหออื่น} เพื่อเขียนทับการตั้งค่า Drive ของหอที่ไม่ใช่ของตัวเอง)
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success) {
      return NextResponse.redirect(`${redirectUrl}?google_drive_error=unauthorized`)
    }

    const role = profileRes.data?.role
    if (isWorkspaceFlow) {
      const isAllowed = role === "super_admin" || (role === "admin" && profileRes.data?.workspace_id === workspaceId)
      if (!isAllowed) {
        return NextResponse.redirect(`${redirectUrl}?google_drive_error=unauthorized`)
      }
    } else if (role !== "super_admin") {
      return NextResponse.redirect(`${redirectUrl}?google_drive_error=unauthorized`)
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey || serviceKey.includes("placeholder")) {
      return NextResponse.redirect(`${redirectUrl}?google_drive_error=server_not_ready`)
    }

    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Client ID/Secret ตัวเดียวกันใช้ร่วมกันทุก workspace เสมอ (เก็บไว้ที่ system_settings กลาง)
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["GOOGLE_DRIVE_OAUTH_CLIENT_ID", "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"])

    if (settingsError) throw settingsError

    const clientId = settings?.find((s) => s.key === "GOOGLE_DRIVE_OAUTH_CLIENT_ID")?.value
    const clientSecretEnc = settings?.find((s) => s.key === "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET")?.value

    if (!clientId || !clientSecretEnc) {
      return NextResponse.redirect(`${redirectUrl}?google_drive_error=missing_client_credentials`)
    }

    const clientSecret = decryptText(clientSecretEnc)
    const redirectUri = `${safeAppUrl}/api/google-drive/oauth-callback`

    const oauth2Client = new OAuth2Client({ clientId, clientSecret, redirectUri })
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      // ไม่ได้ refresh_token กลับมา (Google จะไม่ส่งซ้ำถ้าเคย consent ไปแล้วโดยไม่ระบุ prompt=consent)
      return NextResponse.redirect(`${redirectUrl}?google_drive_error=no_refresh_token`)
    }

    const encryptedRefreshToken = encryptText(tokens.refresh_token)

    if (isWorkspaceFlow) {
      const { error: upsertError } = await supabaseAdmin
        .from("workspace_google_drive_settings")
        .upsert(
          { workspace_id: workspaceId, refresh_token: encryptedRefreshToken, updated_at: new Date().toISOString() },
          { onConflict: "workspace_id" }
        )
      if (upsertError) throw upsertError
    } else {
      const { error: upsertError } = await supabaseAdmin
        .from("system_settings")
        .upsert({ key: "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN", value: encryptedRefreshToken }, { onConflict: "key" })
      if (upsertError) throw upsertError
    }

    return NextResponse.redirect(`${redirectUrl}?google_drive_connected=1`)
  } catch (err: unknown) {
    console.error("Google Drive OAuth callback error:", err)
    const message = err instanceof Error ? err.message : "unknown_error"
    return NextResponse.redirect(`${redirectUrl}?google_drive_error=${encodeURIComponent(message)}`)
  }
}
