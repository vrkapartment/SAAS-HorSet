"use client"

import { useEffect, useState } from "react"
import { HardDrive, RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import {
  getWorkspaceGoogleDriveStatusAction,
  updateWorkspaceGoogleDriveFolderNameAction,
  getGoogleDriveOAuthClientIdAction
} from "@/features/googleDrive/actions"

export default function GoogleDriveSettingsTab() {
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  const [workspaceId, setWorkspaceId] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [connected, setConnected] = useState(false)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [folderName, setFolderName] = useState("")
  const [oauthClientId, setOauthClientId] = useState<string | null>(null)

  const [savingFolderName, setSavingFolderName] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadStatus = async (wsId: string) => {
    const [statusRes, clientIdRes] = await Promise.all([
      getWorkspaceGoogleDriveStatusAction(wsId),
      getGoogleDriveOAuthClientIdAction()
    ])

    if (statusRes.success) {
      setConnected(!!statusRes.connected)
      setFolderId(statusRes.folderId ?? null)
      setFolderName(statusRes.folderName || "HorSet Rent Payment Slips Archive")
    } else {
      setLoadError(statusRes.error || "ไม่สามารถโหลดสถานะ Google Drive ได้")
    }

    if (clientIdRes.success) {
      setOauthClientId(clientIdRes.clientId || null)
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true)
      setLoadError(null)
      try {
        if (isDemo) {
          setConnected(false)
          setFolderName("HorSet Rent Payment Slips Archive")
          setLoading(false)
          return
        }

        const profileRes = await getCurrentUserProfileClient()
        if (!profileRes.success || !profileRes.data?.workspace_id) {
          setLoadError("ไม่พบข้อมูลหอพักของผู้ใช้ปัจจุบัน")
          setLoading(false)
          return
        }
        const wsId = profileRes.data.workspace_id
        setWorkspaceId(wsId)
        await loadStatus(wsId)
      } catch (err) {
        console.error("Error loading Google Drive settings:", err)
        setLoadError("เกิดข้อผิดพลาดในการโหลดข้อมูล")
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // อ่านผลลัพธ์การเชื่อมต่อที่ redirect กลับมาจาก /api/google-drive/oauth-callback
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const connectedParam = params.get("google_drive_connected")
    const errorParam = params.get("google_drive_error")

    if (connectedParam) {
      setSuccess("เชื่อมต่อ Google Drive สำเร็จแล้ว")
      window.history.replaceState({}, "", window.location.pathname + "?tab=google_drive")
      if (workspaceId) loadStatus(workspaceId)
    } else if (errorParam) {
      setError("เชื่อมต่อ Google Drive ไม่สำเร็จ: " + errorParam)
      window.history.replaceState({}, "", window.location.pathname + "?tab=google_drive")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  const handleSaveFolderName = async () => {
    setSavingFolderName(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await updateWorkspaceGoogleDriveFolderNameAction(workspaceId, folderName)
      if (!res.success) throw new Error(res.error)
      setSuccess("warning" in res && res.warning ? res.warning : "บันทึกชื่อโฟลเดอร์เรียบร้อยแล้ว")
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึกชื่อโฟลเดอร์")
    } finally {
      setSavingFolderName(false)
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://saas-horset.vercel.app"
  const authorizeUrl = oauthClientId
    ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(oauthClientId)}&redirect_uri=${encodeURIComponent(appUrl + "/api/google-drive/oauth-callback")}&response_type=code&scope=${encodeURIComponent("https://www.googleapis.com/auth/drive.file")}&access_type=offline&prompt=consent&state=${encodeURIComponent("workspace:" + workspaceId)}`
    : undefined

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        กำลังโหลด...
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-500 flex items-center justify-center border border-teal-500/20">
          <HardDrive className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Google Drive (สำรองข้อมูลสลิปค่าเช่า)</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            เชื่อมต่อ Google Drive ของหอพักคุณเอง เพื่อสำรองสลิปค่าเช่าเก่าก่อนลบออกจากระบบอัตโนมัติ
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 text-teal-700 dark:text-teal-400 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          {success}
        </div>
      )}
      {loadError && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
          {loadError}
        </div>
      )}

      {!oauthClientId && !isDemo && (
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm">
          ฟีเจอร์นี้ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">ชื่อโฟลเดอร์ Archive ใน Google Drive</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="HorSet Rent Payment Slips Archive"
            className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 outline-none transition-all text-sm"
          />
          <button
            onClick={handleSaveFolderName}
            disabled={savingFolderName || !workspaceId}
            className={`px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all shrink-0 ${
              savingFolderName || !workspaceId
                ? "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                : "bg-slate-800 hover:bg-slate-700 text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:border dark:border-slate-700"
            }`}
          >
            {savingFolderName ? <RefreshCw className="w-4 h-4 animate-spin" /> : "บันทึกชื่อ"}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          * ระบบจะสร้างโฟลเดอร์นี้ในบัญชี Drive ที่เชื่อมต่ออัตโนมัติเองตอนอัปโหลดครั้งแรก
        </p>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {connected ? (
          <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 text-sm text-teal-700 dark:text-teal-400 font-bold flex items-center gap-2 flex-1">
            <CheckCircle2 className="w-4 h-4" />
            เชื่อมต่อ Google Drive แล้ว
            {folderId && (
              <a
                href={`https://drive.google.com/drive/folders/${folderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-slate-600 dark:text-slate-300 hover:underline font-normal flex items-center gap-1"
              >
                เปิดโฟลเดอร์ <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-500 flex-1">ยังไม่ได้เชื่อมต่อ Google Drive ของหอพักนี้</p>
        )}
        <a
          href={authorizeUrl}
          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all shrink-0 text-center ${
            authorizeUrl
              ? "bg-teal-600 hover:bg-teal-500 text-white shadow-teal-500/20"
              : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed pointer-events-none"
          }`}
        >
          {connected ? "เชื่อมต่อใหม่อีกครั้ง" : "เชื่อมต่อ Google Drive"}
        </a>
      </div>
    </div>
  )
}
