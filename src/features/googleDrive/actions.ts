"use server"

// Wrapper บาง ๆ เพื่อให้ Client Component (เช่น GoogleDriveSettingsTab.tsx) import ผ่าน server action
// file นี้แทน ไม่ import "@/lib/googleDrive" ตรงๆ จาก client component เด็ดขาด เพราะไฟล์นั้นดึง
// google-auth-library/gaxios (Node-only, มี node:net) เข้ามาด้วย ถ้า client component import ตรงจะทำให้
// build พยายาม bundle dependency เหล่านี้ลง browser bundle แล้ว error ทันที — ต้องผ่าน "use server" นี้เท่านั้น
// (ใช้ wrapper function ชัดเจนแทน re-export ตรงๆ เพราะ "use server" transform ของ Next.js ต้องการ
// function declaration จริงในไฟล์ ไม่รองรับ barrel re-export)
import {
  getWorkspaceGoogleDriveStatusAction as getWorkspaceGoogleDriveStatusImpl,
  updateWorkspaceGoogleDriveFolderNameAction as updateWorkspaceGoogleDriveFolderNameImpl,
  getGoogleDriveOAuthClientIdAction as getGoogleDriveOAuthClientIdImpl
} from "@/lib/googleDrive"

export async function getWorkspaceGoogleDriveStatusAction(workspaceId: string) {
  return getWorkspaceGoogleDriveStatusImpl(workspaceId)
}

export async function updateWorkspaceGoogleDriveFolderNameAction(workspaceId: string, name: string) {
  return updateWorkspaceGoogleDriveFolderNameImpl(workspaceId, name)
}

export async function getGoogleDriveOAuthClientIdAction() {
  return getGoogleDriveOAuthClientIdImpl()
}
