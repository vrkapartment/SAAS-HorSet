import { OAuth2Client } from "google-auth-library"
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"
import { decryptText } from "@/lib/encryption"
import { getCurrentUserProfileAction } from "@/features/auth/actions"

const DEFAULT_FOLDER_NAME = "HorSet Subscription Slips Archive"

type UploadResult =
  | { success: true; fileId: string; webViewLink: string }
  | { success: false; error: string }

function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey || serviceKey.includes("placeholder")) return null
  return createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * สร้าง OAuth2Client ที่พร้อมขอ access token จาก refresh_token ที่เชื่อมต่อไว้แล้ว (บัญชี Gmail ส่วนตัว)
 * คนละกลไกกับ Service Account (JWT) ที่ใช้กับ Google Translate — ไม่ต้องพึ่ง Shared Drive/Workspace
 */
async function getDriveOAuthClient(
  supabaseAdmin: SupabaseClient
): Promise<{ client: OAuth2Client } | { error: string }> {
  const { data: settings, error } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", ["GOOGLE_DRIVE_OAUTH_CLIENT_ID", "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET", "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN"])

  if (error) throw error

  const clientId = settings?.find((s) => s.key === "GOOGLE_DRIVE_OAUTH_CLIENT_ID")?.value
  const clientSecretEnc = settings?.find((s) => s.key === "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET")?.value
  const refreshTokenEnc = settings?.find((s) => s.key === "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN")?.value

  if (!clientId || !clientSecretEnc) {
    return { error: "ยังไม่ได้ตั้งค่า Google Drive OAuth Client ID/Secret" }
  }
  if (!refreshTokenEnc) {
    return { error: "ยังไม่ได้เชื่อมต่อ Google Drive (บัญชีส่วนตัว) — กรุณากดปุ่มเชื่อมต่อในหน้า Super Admin ก่อน" }
  }

  const clientSecret = decryptText(clientSecretEnc)
  const refreshToken = decryptText(refreshTokenEnc)

  const client = new OAuth2Client({ clientId, clientSecret })
  client.setCredentials({ refresh_token: refreshToken })

  return { client }
}

/**
 * หาโฟลเดอร์หลักที่เคยสร้างไว้ (GOOGLE_DRIVE_FOLDER_ID) หรือสร้างใหม่ครั้งแรกถ้ายังไม่มี
 * ใช้ชื่อจาก GOOGLE_DRIVE_FOLDER_NAME (กำหนดเองได้ผ่านหน้า Super Admin) หรือชื่อ default ถ้ายังไม่ได้ตั้งไว้
 * ต้องให้แอปเป็นคนสร้างโฟลเดอร์นี้เอง (ไม่ใช่ user สร้างเองใน Drive UI) เพราะใช้ scope แคบ drive.file
 * ซึ่งเข้าถึงได้แค่ไฟล์/โฟลเดอร์ที่แอปสร้างขึ้นเองเท่านั้น
 */
async function getOrCreateRootFolder(
  supabaseAdmin: SupabaseClient,
  accessToken: string
): Promise<{ folderId: string } | { error: string }> {
  const { data: settings } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", ["GOOGLE_DRIVE_FOLDER_ID", "GOOGLE_DRIVE_FOLDER_NAME"])

  const existingFolderId = settings?.find((s) => s.key === "GOOGLE_DRIVE_FOLDER_ID")?.value
  const folderName = settings?.find((s) => s.key === "GOOGLE_DRIVE_FOLDER_NAME")?.value || DEFAULT_FOLDER_NAME

  if (existingFolderId) {
    // ตรวจสอบว่าโฟลเดอร์นี้ยังเข้าถึงได้จริงด้วยบัญชี OAuth ปัจจุบันก่อนเชื่อค่าที่บันทึกไว้ทันที
    // กันกรณี id ค้างจากการตั้งค่าครั้งก่อน (เช่น Shared Drive ID เดิมตอนใช้ Service Account
    // ซึ่งบัญชี Gmail ส่วนตัวที่เพิ่งเชื่อมต่อใหม่ไม่มีสิทธิ์เข้าถึงเลย จะเจอ "File not found")
    const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${existingFolderId}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (checkRes.ok) {
      const checkData = await checkRes.json()
      if (!checkData.trashed) {
        return { folderId: existingFolderId }
      }
    }
    // เข้าถึงไม่ได้หรือถูกลบไปแล้ว -> ล้างค่าเดิมทิ้งแล้วสร้างโฟลเดอร์ใหม่ด้านล่างแทน
    console.warn(`Configured GOOGLE_DRIVE_FOLDER_ID (${existingFolderId}) is no longer accessible, creating a new folder.`)
  }

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder" })
  })

  if (!createRes.ok) {
    const errJson = await createRes.json().catch(() => ({}))
    return { error: errJson?.error?.message || "สร้างโฟลเดอร์หลักใน Google Drive ไม่สำเร็จ" }
  }

  const createData = await createRes.json()
  const folderId = createData.id as string

  await supabaseAdmin.from("system_settings").upsert({ key: "GOOGLE_DRIVE_FOLDER_ID", value: folderId }, { onConflict: "key" })

  return { folderId }
}

/**
 * หาโฟลเดอร์ย่อยชื่อ subfolderName ที่อยู่ใต้ parentFolderId ถ้ายังไม่มีให้สร้างใหม่ แล้วคืนค่า folder id
 * ใช้จัดเก็บสลิปแยกตามเดือน-ปี (เช่น "2026-07") ภายใต้โฟลเดอร์หลักเดียวกัน
 */
async function getOrCreateDriveSubfolder(
  accessToken: string,
  parentFolderId: string,
  subfolderName: string
): Promise<string> {
  const escapedName = subfolderName.replace(/'/g, "\\'")
  const query = `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`

  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (listRes.ok) {
    const listData = await listRes.json()
    if (listData?.files?.length > 0) {
      return listData.files[0].id
    }
  }

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: subfolderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId]
    })
  })

  if (!createRes.ok) {
    const errJson = await createRes.json().catch(() => ({}))
    throw new Error(errJson?.error?.message || `สร้างโฟลเดอร์ย่อย "${subfolderName}" ใน Google Drive ไม่สำเร็จ`)
  }

  const createData = await createRes.json()
  return createData.id
}

/**
 * อัปโหลดไฟล์ขึ้น Google Drive ของบัญชี Gmail ส่วนตัวที่เชื่อมต่อไว้ (OAuth2 refresh token)
 * ต่างจาก Google Translate ที่ใช้ Service Account (JWT) — คนละกลไก auth กันคนละไฟล์
 *
 * ถ้าระบุ subfolderName (เช่น "2026-07") ไฟล์จะถูกจัดเก็บในโฟลเดอร์ย่อยชื่อนั้นใต้โฟลเดอร์หลัก
 * (สร้างโฟลเดอร์ย่อยให้อัตโนมัติถ้ายังไม่มี) แทนที่จะวางไว้ที่โฟลเดอร์หลักตรงๆ
 */
export async function uploadFileToGoogleDriveAction(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  subfolderName?: string
): Promise<UploadResult> {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return { success: false, error: "ระบบฐานข้อมูลหรือคีย์เชื่อมต่อเซิร์ฟเวอร์ไม่พร้อมใช้งาน" }
    }

    const clientResult = await getDriveOAuthClient(supabaseAdmin)
    if ("error" in clientResult) return { success: false, error: clientResult.error }

    const { token: accessToken } = await clientResult.client.getAccessToken()
    if (!accessToken) {
      return { success: false, error: "ไม่สามารถขอ Access Token จาก Google ได้" }
    }

    const rootFolderResult = await getOrCreateRootFolder(supabaseAdmin, accessToken)
    if ("error" in rootFolderResult) return { success: false, error: rootFolderResult.error }

    let targetFolderId = rootFolderResult.folderId
    if (subfolderName) {
      try {
        targetFolderId = await getOrCreateDriveSubfolder(accessToken, rootFolderResult.folderId, subfolderName)
      } catch (err) {
        console.error("Failed to get/create Google Drive subfolder:", err)
        return { success: false, error: err instanceof Error ? err.message : "สร้างโฟลเดอร์ย่อยใน Google Drive ไม่สำเร็จ" }
      }
    }

    // อัปโหลดแบบ multipart/related ตรงผ่าน Drive v3 REST API (ไม่ใช้ package googleapis เต็มตัว)
    const boundary = `horset-drive-upload-${Date.now()}`
    const metadata = { name: filename, parents: [targetFolderId] }

    const metadataPart =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n`

    const mediaHeaderPart = `--${boundary}\r\n` + `Content-Type: ${mimeType}\r\n\r\n`
    const closingPart = `\r\n--${boundary}--`

    const body = Buffer.concat([
      Buffer.from(metadataPart, "utf-8"),
      Buffer.from(mediaHeaderPart, "utf-8"),
      fileBuffer,
      Buffer.from(closingPart, "utf-8")
    ])

    const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
    })

    if (!uploadRes.ok) {
      const errJson = await uploadRes.json().catch(() => ({}))
      console.error("Google Drive upload failed:", errJson)
      return { success: false, error: errJson?.error?.message || "อัปโหลดไฟล์ขึ้น Google Drive ไม่สำเร็จ" }
    }

    const uploadData = await uploadRes.json()
    if (!uploadData?.id || !uploadData?.webViewLink) {
      return { success: false, error: "อัปโหลดสำเร็จแต่ไม่พบ webViewLink จาก Google Drive" }
    }

    return { success: true, fileId: uploadData.id, webViewLink: uploadData.webViewLink }
  } catch (error: unknown) {
    console.error("uploadFileToGoogleDriveAction Exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอัปโหลดไฟล์ขึ้น Google Drive"
    }
  }
}

/**
 * Super Admin ตั้ง/แก้ไขชื่อโฟลเดอร์ archive ใน Google Drive เอง — ถ้าโฟลเดอร์ถูกสร้างไปแล้ว
 * (มี GOOGLE_DRIVE_FOLDER_ID อยู่แล้ว) จะเปลี่ยนชื่อจริงใน Drive ให้ตรงกันทันที ไม่ปล่อยให้ชื่อไม่ตรงกัน
 */
export async function updateGoogleDriveFolderNameAction(name: string) {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || profileRes.data?.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }
    if (!name || !name.trim()) {
      return { success: false, error: "กรุณากรอกชื่อโฟลเดอร์" }
    }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return { success: false, error: "ระบบฐานข้อมูลหรือคีย์เชื่อมต่อเซิร์ฟเวอร์ไม่พร้อมใช้งาน" }
    }

    const trimmedName = name.trim()

    const { error: upsertError } = await supabaseAdmin
      .from("system_settings")
      .upsert({ key: "GOOGLE_DRIVE_FOLDER_NAME", value: trimmedName }, { onConflict: "key" })
    if (upsertError) throw upsertError

    const { data: folderIdSetting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "GOOGLE_DRIVE_FOLDER_ID")
      .maybeSingle()

    if (!folderIdSetting?.value) {
      // ยังไม่เคยสร้างโฟลเดอร์จริง -> แค่บันทึกชื่อไว้ใช้ตอนสร้างครั้งแรก
      return { success: true }
    }

    const clientResult = await getDriveOAuthClient(supabaseAdmin)
    if ("error" in clientResult) {
      return { success: true, warning: "บันทึกชื่อในระบบแล้ว แต่ยังไม่ได้เปลี่ยนชื่อโฟลเดอร์จริงใน Drive เพราะยังไม่ได้เชื่อมต่อบัญชี" }
    }

    const { token: accessToken } = await clientResult.client.getAccessToken()
    if (!accessToken) {
      return { success: true, warning: "บันทึกชื่อในระบบแล้ว แต่ขอ Access Token เพื่อเปลี่ยนชื่อโฟลเดอร์จริงใน Drive ไม่สำเร็จ" }
    }

    const renameRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderIdSetting.value}?fields=id`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: trimmedName })
    })

    if (!renameRes.ok) {
      const errJson = await renameRes.json().catch(() => ({}))
      return {
        success: true,
        warning: errJson?.error?.message || "บันทึกชื่อในระบบแล้ว แต่เปลี่ยนชื่อโฟลเดอร์จริงใน Drive ไม่สำเร็จ"
      }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกชื่อโฟลเดอร์" }
  }
}
