"use client"

import { useEffect, useState } from "react"
import { HardDrive, RefreshCw, CheckCircle2, AlertCircle, ExternalLink, Clock, AlertTriangle, Save } from "lucide-react"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import {
  getWorkspaceGoogleDriveStatusAction,
  updateWorkspaceGoogleDriveFolderNameAction,
  getGoogleDriveOAuthClientIdAction
} from "@/features/googleDrive/actions"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import {
  cleanupExpiredSlipsAction,
  getSlipRetentionMonthsAction,
  saveSlipRetentionMonthsAction
} from "@/features/finance/actions"

type LocalizedMessage = string | {
  key: string
  params?: Record<string, string | number>
}

export default function GoogleDriveSettingsTab() {
  const { t } = useLanguage()
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  const [workspaceId, setWorkspaceId] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<LocalizedMessage | null>(null)

  const [connected, setConnected] = useState(false)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [folderName, setFolderName] = useState("")
  const [oauthClientId, setOauthClientId] = useState<string | null>(null)

  const [savingFolderName, setSavingFolderName] = useState(false)
  const [slipRetentionMonths, setSlipRetentionMonths] = useState(12)
  const [savedSlipRetentionMonths, setSavedSlipRetentionMonths] = useState(12)
  const [savingRetention, setSavingRetention] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [error, setError] = useState<LocalizedMessage | null>(null)
  const [success, setSuccess] = useState<LocalizedMessage | null>(null)

  const renderMessage = (message: LocalizedMessage) =>
    typeof message === "string" ? message : t(message.key, message.params)

  const loadStatus = async (wsId: string) => {
    const [statusRes, clientIdRes, retentionRes] = await Promise.all([
      getWorkspaceGoogleDriveStatusAction(wsId),
      getGoogleDriveOAuthClientIdAction(),
      getSlipRetentionMonthsAction(wsId)
    ])

    if (statusRes.success) {
      setConnected(!!statusRes.connected)
      setFolderId(statusRes.folderId ?? null)
      setFolderName(statusRes.folderName || "HorSet Rent Payment Slips Archive")
    } else {
      setLoadError(statusRes.error || { key: "google_drive_settings.err_status" })
    }

    if (clientIdRes.success) {
      setOauthClientId(clientIdRes.clientId || null)
    }

    if (retentionRes.success) {
      setSlipRetentionMonths(retentionRes.months)
      setSavedSlipRetentionMonths(retentionRes.months)
    } else {
      setLoadError(retentionRes.error || { key: "google_drive_settings.retention_load_error" })
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
          setLoadError({ key: "google_drive_settings.err_workspace" })
          setLoading(false)
          return
        }
        const wsId = profileRes.data.workspace_id
        setWorkspaceId(wsId)
        await loadStatus(wsId)
      } catch (err) {
        console.error("Error loading Google Drive settings:", err)
        setLoadError({ key: "google_drive_settings.err_load" })
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
      setSuccess({ key: "google_drive_settings.connect_success" })
      window.history.replaceState({}, "", window.location.pathname + "?tab=google_drive")
      if (workspaceId) loadStatus(workspaceId)
    } else if (errorParam) {
      setError({ key: "google_drive_settings.connect_error", params: { error: errorParam } })
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
      setSuccess("warning" in res && res.warning ? res.warning : { key: "google_drive_settings.save_success" })
    } catch (err) {
      setError(err instanceof Error ? err.message : { key: "google_drive_settings.err_save" })
    } finally {
      setSavingFolderName(false)
    }
  }

  const handleSaveRetention = async () => {
    setSavingRetention(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await saveSlipRetentionMonthsAction(workspaceId, slipRetentionMonths)
      if (!res.success) throw new Error(res.error)
      setSlipRetentionMonths(res.months)
      setSavedSlipRetentionMonths(res.months)
      setSuccess({ key: "google_drive_settings.retention_save_success" })
    } catch (err) {
      setError(err instanceof Error ? err.message : { key: "google_drive_settings.retention_save_error" })
    } finally {
      setSavingRetention(false)
    }
  }

  const handleManualCleanup = async () => {
    if (!workspaceId || !confirm(t("google_drive_settings.cleanup_confirm"))) return

    setIsCleaning(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await cleanupExpiredSlipsAction(workspaceId)
      if (!res.success) throw new Error(res.error)
      const deletedCount = res.count ?? 0
      const archiveFailedCount = res.archiveFailedCount ?? 0
      if (archiveFailedCount > 0) {
        setSuccess({
          key: "google_drive_settings.cleanup_partial",
          params: { deleted: deletedCount, failed: archiveFailedCount }
        })
      } else if (deletedCount === 0) {
        setSuccess({ key: "google_drive_settings.cleanup_none" })
      } else {
        setSuccess({
          key: res.googleDriveConnected
            ? "google_drive_settings.cleanup_success_with_drive"
            : "google_drive_settings.cleanup_success",
          params: { count: deletedCount }
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : { key: "google_drive_settings.cleanup_error" })
    } finally {
      setIsCleaning(false)
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
        {t("google_drive_settings.loading")}
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
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t("google_drive_settings.title")}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t("google_drive_settings.subtitle")}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {renderMessage(error)}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 text-teal-700 dark:text-teal-400 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          {renderMessage(success)}
        </div>
      )}
      {loadError && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
          {renderMessage(loadError)}
        </div>
      )}

      <section className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-5 sm:p-6 space-y-5 shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
          <Clock className="w-5 h-5 text-rose-500" />
          <h4 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200">
            {t("google_drive_settings.retention_title")}
          </h4>
        </div>

        <div className="space-y-2">
          <label htmlFor="slip-retention-months" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold block">
            {t("google_drive_settings.retention_label")}
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              id="slip-retention-months"
              value={slipRetentionMonths}
              onChange={(event) => setSlipRetentionMonths(Number(event.target.value))}
              className="flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-rose-500 text-slate-800 dark:text-slate-200 text-sm font-bold cursor-pointer"
            >
              <option value={1}>{t("google_drive_settings.retention_1_month")}</option>
              <option value={3}>{t("google_drive_settings.retention_3_months")}</option>
              <option value={6}>{t("google_drive_settings.retention_6_months")}</option>
              <option value={12}>{t("google_drive_settings.retention_12_months")}</option>
            </select>
            <button
              type="button"
              onClick={handleSaveRetention}
              disabled={savingRetention || !workspaceId || slipRetentionMonths === savedSlipRetentionMonths}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
            >
              {savingRetention ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingRetention ? t("google_drive_settings.retention_saving") : t("google_drive_settings.retention_save")}
            </button>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {t("google_drive_settings.retention_desc")}
          </p>
        </div>

        <div className={`p-4 rounded-xl border space-y-2 ${
          connected
            ? "bg-teal-500/5 border-teal-500/20"
            : "bg-amber-500/5 border-amber-500/20"
        }`}>
          <div className="flex items-start gap-2">
            {connected
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-teal-500 shrink-0" />
              : <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />}
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
              {connected
                ? t("google_drive_settings.retention_with_drive")
                : t("google_drive_settings.retention_without_drive")}
            </p>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("google_drive_settings.retention_records_preserved")}
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualCleanup}
          disabled={isCleaning || !workspaceId}
          className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 disabled:bg-slate-800 disabled:cursor-not-allowed transition-colors"
        >
          {isCleaning && <RefreshCw className="w-4 h-4 animate-spin" />}
          {isCleaning ? t("google_drive_settings.cleanup_running") : t("google_drive_settings.cleanup_button")}
        </button>
      </section>

      <div className="pt-2">
        <h4 className="text-base font-black text-slate-800 dark:text-slate-200">{t("google_drive_settings.drive_section_title")}</h4>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("google_drive_settings.drive_section_desc")}</p>
      </div>

      {!oauthClientId && !isDemo && (
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm">
          {t("google_drive_settings.not_configured")}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t("google_drive_settings.folder_label")}</label>
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
            {savingFolderName ? <RefreshCw className="w-4 h-4 animate-spin" /> : t("google_drive_settings.save_name")}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          {t("google_drive_settings.folder_hint")}
        </p>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {connected ? (
          <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 text-sm text-teal-700 dark:text-teal-400 font-bold flex items-center gap-2 flex-1">
            <CheckCircle2 className="w-4 h-4" />
            {t("google_drive_settings.connected")}
            {folderId && (
              <a
                href={`https://drive.google.com/drive/folders/${folderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-slate-600 dark:text-slate-300 hover:underline font-normal flex items-center gap-1"
              >
                {t("google_drive_settings.open_folder")} <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-500 flex-1">{t("google_drive_settings.not_connected")}</p>
        )}
        <a
          href={authorizeUrl}
          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all shrink-0 text-center ${
            authorizeUrl
              ? "bg-teal-600 hover:bg-teal-500 text-white shadow-teal-500/20"
              : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed pointer-events-none"
          }`}
        >
          {connected ? t("google_drive_settings.reconnect") : t("google_drive_settings.connect")}
        </a>
      </div>
    </div>
  )
}
