import { JWT } from "google-auth-library"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { decryptText } from "@/lib/encryption"

type UploadResult =
  | { success: true; fileId: string; webViewLink: string }
  | { success: false; error: string }

/**
 * หาโฟลเดอร์ย่อยชื่อ subfolderName ที่อยู่ใต้ parentFolderId ถ้ายังไม่มีให้สร้างใหม่ แล้วคืนค่า folder id
 * ใช้จัดเก็บสลิปแยกตามเดือน-ปี (เช่น "2026-07") ภายใน Shared Drive เดียวกัน
 */
async function getOrCreateDriveSubfolder(
  accessToken: string,
  parentFolderId: string,
  subfolderName: string
): Promise<string> {
  const escapedName = subfolderName.replace(/'/g, "\\'")
  const query = `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`

  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (listRes.ok) {
    const listData = await listRes.json()
    if (listData?.files?.length > 0) {
      return listData.files[0].id
    }
  }

  // ยังไม่มีโฟลเดอร์ย่อยนี้ -> สร้างใหม่ใต้โฟลเดอร์หลัก
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
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
 * อัปโหลดไฟล์ขึ้น Google Drive โดยใช้ Google Service Account ตัวเดียวกับที่ใช้กับ Google Translate
 * (system_settings.GOOGLE_SERVICE_ACCOUNT_KEY) — ต้องเปิด Drive API บน GCP project เดียวกัน และแชร์
 * Shared Drive ปลายทางให้กับอีเมลของ service account ไว้ก่อน (ดูวิธีตั้งค่าในหน้า Super Admin)
 *
 * ถ้าระบุ subfolderName (เช่น "2026-07") ไฟล์จะถูกจัดเก็บในโฟลเดอร์ย่อยชื่อนั้นใต้ Folder ID หลัก
 * (สร้างโฟลเดอร์ย่อยให้อัตโนมัติถ้ายังไม่มี) แทนที่จะวางไว้ที่โฟลเดอร์หลักตรงๆ
 */
export async function uploadFileToGoogleDriveAction(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  subfolderName?: string
): Promise<UploadResult> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey || serviceKey.includes("placeholder")) {
      return { success: false, error: "ระบบฐานข้อมูลหรือคีย์เชื่อมต่อเซิร์ฟเวอร์ไม่พร้อมใช้งาน" }
    }

    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["GOOGLE_SERVICE_ACCOUNT_KEY", "GOOGLE_DRIVE_FOLDER_ID"])

    if (settingsError) throw settingsError

    const serviceKeySetting = settings?.find((s) => s.key === "GOOGLE_SERVICE_ACCOUNT_KEY")
    const folderIdSetting = settings?.find((s) => s.key === "GOOGLE_DRIVE_FOLDER_ID")

    if (!serviceKeySetting?.value) {
      return { success: false, error: "ยังไม่ได้ตั้งค่า Google Service Account Key" }
    }
    if (!folderIdSetting?.value) {
      return { success: false, error: "ยังไม่ได้ตั้งค่า Google Drive Folder ID" }
    }

    let credentials: { client_email: string; private_key: string }
    try {
      const decryptedKeyString = decryptText(serviceKeySetting.value)
      credentials = JSON.parse(decryptedKeyString)
    } catch (err) {
      console.error("Failed to parse Google Service Account Key JSON", err)
      return { success: false, error: "รูปแบบ Google Service Account Key ไม่ถูกต้อง" }
    }

    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/drive.file"]
    })

    const { token: accessToken } = await jwtClient.getAccessToken()
    if (!accessToken) {
      return { success: false, error: "ไม่สามารถขอ Access Token จาก Google ได้" }
    }

    let targetFolderId = folderIdSetting.value
    if (subfolderName) {
      try {
        targetFolderId = await getOrCreateDriveSubfolder(accessToken, folderIdSetting.value, subfolderName)
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

    // supportsAllDrives=true จำเป็นเพราะปลายทางเป็น Shared Drive (service account ไม่มี "My Drive" ส่วนตัว)
    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body
      }
    )

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
