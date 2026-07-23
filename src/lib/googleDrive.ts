import { OAuth2Client } from "google-auth-library"
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"
import { encryptText, decryptText } from "@/lib/encryption"
import { getCurrentUserProfileAction } from "@/features/auth/actions"

const DEFAULT_FOLDER_NAME = "HorSet Subscription Slips Archive"
const DEFAULT_WORKSPACE_FOLDER_NAME = "HorSet Rent Payment Slips Archive"

type UploadResult =
  | { success: true; fileId: string; webViewLink: string }
  | { success: false; error: string }

type FolderNameUpdateResult =
  | { success: true; warning?: string }
  | { success: false; error: string }

function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey || serviceKey.includes("placeholder")) return null
  return createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * เก็บ/อ่านค่า refresh_token + โฟลเดอร์ archive แยกเป็น 2 ที่:
 * - "global": system_settings ของ HorSet เอง (บัญชี Super Admin ใช้ archive สลิป subscription)
 * - "workspace": workspace_google_drive_settings ของแต่ละหอ (ใช้ archive สลิปค่าเช่า)
 * ทั้ง 2 โหมดใช้ GOOGLE_DRIVE_OAUTH_CLIENT_ID/SECRET ตัวเดียวกันจาก system_settings เสมอ (Client เดียวกัน
 * ใช้ร่วมกันทุกหอ) ต่างกันแค่ "บัญชี Gmail ที่เชื่อมต่อ" (refresh_token) และ "โฟลเดอร์ปลายทาง"
 */
interface DriveCredentialStore {
  defaultFolderName: string
  getRefreshToken(): Promise<string | null>
  getFolderId(): Promise<string | null>
  getFolderName(): Promise<string>
  saveFolderId(folderId: string): Promise<void>
}

function createGlobalStore(supabaseAdmin: SupabaseClient): DriveCredentialStore {
  return {
    defaultFolderName: DEFAULT_FOLDER_NAME,
    async getRefreshToken() {
      const { data } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN")
        .maybeSingle()
      return data?.value ? decryptText(data.value) : null
    },
    async getFolderId() {
      const { data } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "GOOGLE_DRIVE_FOLDER_ID")
        .maybeSingle()
      return data?.value || null
    },
    async getFolderName() {
      const { data } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "GOOGLE_DRIVE_FOLDER_NAME")
        .maybeSingle()
      return data?.value || DEFAULT_FOLDER_NAME
    },
    async saveFolderId(folderId: string) {
      await supabaseAdmin.from("system_settings").upsert({ key: "GOOGLE_DRIVE_FOLDER_ID", value: folderId }, { onConflict: "key" })
    }
  }
}

function createWorkspaceStore(supabaseAdmin: SupabaseClient, workspaceId: string): DriveCredentialStore {
  return {
    defaultFolderName: DEFAULT_WORKSPACE_FOLDER_NAME,
    async getRefreshToken() {
      const { data } = await supabaseAdmin
        .from("workspace_google_drive_settings")
        .select("refresh_token")
        .eq("workspace_id", workspaceId)
        .maybeSingle()
      return data?.refresh_token ? decryptText(data.refresh_token) : null
    },
    async getFolderId() {
      const { data } = await supabaseAdmin
        .from("workspace_google_drive_settings")
        .select("folder_id")
        .eq("workspace_id", workspaceId)
        .maybeSingle()
      return data?.folder_id || null
    },
    async getFolderName() {
      const { data } = await supabaseAdmin
        .from("workspace_google_drive_settings")
        .select("folder_name")
        .eq("workspace_id", workspaceId)
        .maybeSingle()
      return data?.folder_name || DEFAULT_WORKSPACE_FOLDER_NAME
    },
    async saveFolderId(folderId: string) {
      await supabaseAdmin
        .from("workspace_google_drive_settings")
        .upsert({ workspace_id: workspaceId, folder_id: folderId, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" })
    }
  }
}

/**
 * สร้าง OAuth2Client ที่พร้อมขอ access token จาก refresh_token ที่เชื่อมต่อไว้แล้ว (บัญชี Gmail ส่วนตัว)
 * คนละกลไกกับ Service Account (JWT) ที่ใช้กับ Google Translate — ไม่ต้องพึ่ง Shared Drive/Workspace
 */
async function getDriveOAuthClient(
  supabaseAdmin: SupabaseClient,
  store: DriveCredentialStore
): Promise<{ client: OAuth2Client } | { error: string }> {
  const { data: settings, error } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", ["GOOGLE_DRIVE_OAUTH_CLIENT_ID", "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"])

  if (error) throw error

  const clientId = settings?.find((s) => s.key === "GOOGLE_DRIVE_OAUTH_CLIENT_ID")?.value
  const clientSecretEnc = settings?.find((s) => s.key === "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET")?.value

  if (!clientId || !clientSecretEnc) {
    return { error: "ยังไม่ได้ตั้งค่า Google Drive OAuth Client ID/Secret" }
  }

  const refreshToken = await store.getRefreshToken()
  if (!refreshToken) {
    return { error: "ยังไม่ได้เชื่อมต่อ Google Drive — กรุณากดปุ่มเชื่อมต่อในหน้าตั้งค่าก่อน" }
  }

  const clientSecret = decryptText(clientSecretEnc)

  const client = new OAuth2Client({ clientId, clientSecret })
  client.setCredentials({ refresh_token: refreshToken })

  return { client }
}

/**
 * หาโฟลเดอร์หลักที่เคยสร้างไว้ หรือสร้างใหม่ครั้งแรกถ้ายังไม่มี ใช้ชื่อที่กำหนดเองได้ผ่านหน้าตั้งค่า
 * หรือชื่อ default ถ้ายังไม่ได้ตั้งไว้ ต้องให้แอปเป็นคนสร้างโฟลเดอร์นี้เอง (ไม่ใช่ user สร้างเองใน Drive UI)
 * เพราะใช้ scope แคบ drive.file ซึ่งเข้าถึงได้แค่ไฟล์/โฟลเดอร์ที่แอปสร้างขึ้นเองเท่านั้น
 */
async function getOrCreateRootFolder(
  accessToken: string,
  store: DriveCredentialStore
): Promise<{ folderId: string } | { error: string }> {
  const existingFolderId = await store.getFolderId()

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
    console.warn(`Configured Drive folder id (${existingFolderId}) is no longer accessible, creating a new folder.`)
  }

  const folderName = await store.getFolderName()

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

  await store.saveFolderId(folderId)

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
 * อัปโหลดไฟล์ขึ้น Google Drive ของบัญชี Gmail ที่เชื่อมต่อไว้ (OAuth2 refresh token)
 * ต่างจาก Google Translate ที่ใช้ Service Account (JWT) — คนละกลไก auth กันคนละไฟล์
 *
 * ถ้าไม่ระบุ workspaceId → ใช้บัญชี Drive กลางของ HorSet (สำหรับ archive สลิป subscription)
 * ถ้าระบุ workspaceId → ใช้บัญชี Drive ของ workspace นั้นๆ เอง (สำหรับ archive สลิปค่าเช่า)
 *
 * ถ้าระบุ subfolderName (เช่น "2026-07") ไฟล์จะถูกจัดเก็บในโฟลเดอร์ย่อยชื่อนั้นใต้โฟลเดอร์หลัก
 * (สร้างโฟลเดอร์ย่อยให้อัตโนมัติถ้ายังไม่มี) แทนที่จะวางไว้ที่โฟลเดอร์หลักตรงๆ
 */
export async function uploadFileToGoogleDriveAction(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  subfolderName?: string,
  workspaceId?: string
): Promise<UploadResult> {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return { success: false, error: "ระบบฐานข้อมูลหรือคีย์เชื่อมต่อเซิร์ฟเวอร์ไม่พร้อมใช้งาน" }
    }

    const store = workspaceId ? createWorkspaceStore(supabaseAdmin, workspaceId) : createGlobalStore(supabaseAdmin)

    const clientResult = await getDriveOAuthClient(supabaseAdmin, store)
    if ("error" in clientResult) return { success: false, error: clientResult.error }

    const { token: accessToken } = await clientResult.client.getAccessToken()
    if (!accessToken) {
      return { success: false, error: "ไม่สามารถขอ Access Token จาก Google ได้" }
    }

    const rootFolderResult = await getOrCreateRootFolder(accessToken, store)
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
 * เช็คสิทธิ์: ต้องเป็น super_admin หรือเป็น admin ของ workspace นั้นเป๊ะๆ เท่านั้น (ใช้ซ้ำในหลาย action
 * ด้านล่าง กันไม่ให้ admin ของหอหนึ่งไปยุ่งกับการตั้งค่า Google Drive ของอีกหอหนึ่งได้)
 */
async function assertWorkspaceAdminOrSuperAdmin(workspaceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const profileRes = await getCurrentUserProfileAction()
  if (!profileRes.success) {
    return { ok: false, error: "ไม่พบข้อมูลผู้ใช้ปัจจุบัน" }
  }
  const role = profileRes.data?.role
  if (role === "super_admin") return { ok: true }
  if (role === "admin" && profileRes.data?.workspace_id === workspaceId) return { ok: true }
  return { ok: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
}

/**
 * Super Admin ตั้ง/แก้ไขชื่อโฟลเดอร์ archive ใน Google Drive กลางของ HorSet (สำหรับสลิป subscription)
 * ถ้าโฟลเดอร์ถูกสร้างไปแล้ว จะเปลี่ยนชื่อจริงใน Drive ให้ตรงกันทันที ไม่ปล่อยให้ชื่อไม่ตรงกัน
 */
export async function updateGoogleDriveFolderNameAction(name: string): Promise<FolderNameUpdateResult> {
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
    const store = createGlobalStore(supabaseAdmin)

    await supabaseAdmin.from("system_settings").upsert({ key: "GOOGLE_DRIVE_FOLDER_NAME", value: trimmedName }, { onConflict: "key" })

    const existingFolderId = await store.getFolderId()
    if (!existingFolderId) {
      // ยังไม่เคยสร้างโฟลเดอร์จริง -> แค่บันทึกชื่อไว้ใช้ตอนสร้างครั้งแรก
      return { success: true }
    }

    return await renameExistingFolder(supabaseAdmin, store, existingFolderId, trimmedName)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกชื่อโฟลเดอร์" }
  }
}

/**
 * Admin ของ workspace ตั้ง/แก้ไขชื่อโฟลเดอร์ archive ใน Google Drive ของ workspace ตัวเอง (สลิปค่าเช่า)
 */
export async function updateWorkspaceGoogleDriveFolderNameAction(workspaceId: string, name: string): Promise<FolderNameUpdateResult> {
  try {
    const guard = await assertWorkspaceAdminOrSuperAdmin(workspaceId)
    if (!guard.ok) return { success: false, error: guard.error }
    if (!name || !name.trim()) {
      return { success: false, error: "กรุณากรอกชื่อโฟลเดอร์" }
    }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return { success: false, error: "ระบบฐานข้อมูลหรือคีย์เชื่อมต่อเซิร์ฟเวอร์ไม่พร้อมใช้งาน" }
    }

    const trimmedName = name.trim()
    const store = createWorkspaceStore(supabaseAdmin, workspaceId)

    await supabaseAdmin
      .from("workspace_google_drive_settings")
      .upsert({ workspace_id: workspaceId, folder_name: trimmedName, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" })

    const existingFolderId = await store.getFolderId()
    if (!existingFolderId) {
      return { success: true }
    }

    return await renameExistingFolder(supabaseAdmin, store, existingFolderId, trimmedName)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกชื่อโฟลเดอร์" }
  }
}

async function renameExistingFolder(
  supabaseAdmin: SupabaseClient,
  store: DriveCredentialStore,
  folderId: string,
  newName: string
): Promise<FolderNameUpdateResult> {
  const clientResult = await getDriveOAuthClient(supabaseAdmin, store)
  if ("error" in clientResult) {
    return { success: true, warning: "บันทึกชื่อในระบบแล้ว แต่ยังไม่ได้เปลี่ยนชื่อโฟลเดอร์จริงใน Drive เพราะยังไม่ได้เชื่อมต่อบัญชี" }
  }

  const { token: accessToken } = await clientResult.client.getAccessToken()
  if (!accessToken) {
    return { success: true, warning: "บันทึกชื่อในระบบแล้ว แต่ขอ Access Token เพื่อเปลี่ยนชื่อโฟลเดอร์จริงใน Drive ไม่สำเร็จ" }
  }

  const renameRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: newName })
  })

  if (!renameRes.ok) {
    const errJson = await renameRes.json().catch(() => ({}))
    return {
      success: true,
      warning: errJson?.error?.message || "บันทึกชื่อในระบบแล้ว แต่เปลี่ยนชื่อโฟลเดอร์จริงใน Drive ไม่สำเร็จ"
    }
  }

  return { success: true }
}

/**
 * สถานะการเชื่อมต่อ Google Drive ของ workspace หนึ่งๆ (สำหรับหน้าตั้งค่าของแต่ละหอ)
 */
export async function getWorkspaceGoogleDriveStatusAction(workspaceId: string) {
  try {
    const guard = await assertWorkspaceAdminOrSuperAdmin(workspaceId)
    if (!guard.ok) return { success: false, error: guard.error }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return { success: false, error: "ระบบฐานข้อมูลหรือคีย์เชื่อมต่อเซิร์ฟเวอร์ไม่พร้อมใช้งาน" }
    }

    const { data } = await supabaseAdmin
      .from("workspace_google_drive_settings")
      .select("refresh_token, folder_id, folder_name")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    return {
      success: true,
      connected: !!data?.refresh_token,
      folderId: data?.folder_id || null,
      folderName: data?.folder_name || DEFAULT_WORKSPACE_FOLDER_NAME
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการตรวจสอบสถานะ Google Drive" }
  }
}

/**
 * คืนแค่ Google Drive OAuth Client ID (ไม่ใช่ Secret — Client ID ไม่ใช่ความลับ ปรากฏใน URL ตอน consent
 * อยู่แล้ว) ให้ Admin ทั่วไปเรียกได้ เพื่อเอาไปสร้างปุ่ม "เชื่อมต่อ Google Drive" ในหน้าตั้งค่าของหอตัวเอง
 */
export async function getGoogleDriveOAuthClientIdAction() {
  try {
    const profileRes = await getCurrentUserProfileAction()
    if (!profileRes.success || (profileRes.data?.role !== "admin" && profileRes.data?.role !== "super_admin")) {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงหรือทำรายการในส่วนนี้" }
    }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return { success: false, error: "ระบบฐานข้อมูลหรือคีย์เชื่อมต่อเซิร์ฟเวอร์ไม่พร้อมใช้งาน" }
    }

    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "GOOGLE_DRIVE_OAUTH_CLIENT_ID")
      .maybeSingle()

    return { success: true, clientId: data?.value || null }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงค่า Client ID" }
  }
}
