"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  LayoutGrid,
  PowerOff,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import {
  getRichMenuStatusAction,
  installRichMenuAction,
  removeRichMenuAction,
  saveRichMenuImageAction,
  setAdminRichMenuEnabledAction,
  setRichMenuEnabledAction,
  syncAdminRichMenuAction,
  type RichMenuStatus
} from "@/features/notification/richmenu-actions"

/**
 * กล่องตั้งค่า LINE Rich Menu ในหน้า ตั้งค่า › LINE OA
 *
 * แยกเป็นคอมโพเนนต์ของตัวเองเพราะ LineSettingsTab ยาวมากอยู่แล้ว และเรื่องนี้มี state
 * ของตัวเองครบชุด (สถานะเมนู, การอัปโหลดภาพ, การติดตั้ง) ไม่ต้องปนกับ state ของการเชื่อมต่อ
 */

const MAX_IMAGE_BYTES = 1024 * 1024
const STORAGE_BUCKET = "payment-slips"

type Props = {
  workspaceId: string
  /** true เมื่อหอพักเชื่อมต่อ LINE OA เรียบร้อยแล้ว (มี channel access token) */
  channelConfigured: boolean
}

export default function RichMenuPanel({ workspaceId, channelConfigured }: Props) {
  const { t, locale } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<RichMenuStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [syncingAdmin, setSyncingAdmin] = useState(false)
  const [togglingAdmin, setTogglingAdmin] = useState(false)

  const loadStatus = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await getRichMenuStatusAction(workspaceId)
      if (res.success && res.data) {
        setStatus(res.data)
        setError(null)
      } else {
        setStatus(null)
        setError(res.error || t("line_settings.richmenu_err_load"))
      }
    } catch (err) {
      setStatus(null)
      setError(err instanceof Error ? err.message : t("line_settings.richmenu_err_load"))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, t])

  // เรียกใน callback ของ timer เพื่อไม่ให้ setState เกิดในจังหวะเดียวกับ render รอบแรก
  useEffect(() => {
    const timer = setTimeout(() => { loadStatus() }, 0)
    return () => clearTimeout(timer)
  }, [loadStatus])

  const formatInstalledAt = (iso: string | null) => {
    if (!iso) return "-"
    try {
      return new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "th-TH", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    } catch {
      return iso
    }
  }

  /** ตรวจไฟล์ฝั่งเบราว์เซอร์ก่อนอัปโหลด เพื่อไม่ให้เสียเวลาอัปไฟล์ที่ LINE จะปฏิเสธอยู่ดี */
  const validateFile = (file: File): Promise<string | null> =>
    new Promise(resolve => {
      if (!["image/png", "image/jpeg"].includes(file.type)) {
        resolve(t("line_settings.richmenu_err_type"))
        return
      }
      if (file.size > MAX_IMAGE_BYTES) {
        resolve(t("line_settings.richmenu_err_size"))
        return
      }
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        const w = status?.requiredWidth ?? 2500
        const h = status?.requiredHeight ?? 1686
        if (img.naturalWidth !== w || img.naturalHeight !== h) {
          resolve(
            t("line_settings.richmenu_err_dimension")
              .replace("{required}", `${w}x${h}`)
              .replace("{actual}", `${img.naturalWidth}x${img.naturalHeight}`)
          )
          return
        }
        resolve(null)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(t("line_settings.richmenu_err_type"))
      }
      img.src = url
    })

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setError(null)
    setSuccess(null)

    const invalid = await validateFile(file)
    if (invalid) {
      setError(invalid)
      return
    }

    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.type === "image/png" ? "png" : "jpg"
      const path = `line-richmenu/workspace_${workspaceId}_menu_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)

      const res = await saveRichMenuImageAction(workspaceId, publicUrl)
      if (!res.success) {
        setError(res.error || t("line_settings.richmenu_err_save_image"))
        return
      }

      setSuccess(t("line_settings.richmenu_image_saved"))
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("line_settings.richmenu_err_save_image"))
    } finally {
      setUploading(false)
    }
  }

  const handleUseDefaultImage = async () => {
    if (!confirm(t("line_settings.richmenu_reset_image_confirm"))) return
    setError(null)
    setSuccess(null)
    setUploading(true)
    try {
      const res = await saveRichMenuImageAction(workspaceId, "")
      if (!res.success) {
        setError(res.error || t("line_settings.richmenu_err_save_image"))
        return
      }
      setSuccess(t("line_settings.richmenu_image_reset"))
      await loadStatus()
    } finally {
      setUploading(false)
    }
  }

  const handleToggleEnabled = async () => {
    if (!status) return
    const next = !status.enabled
    if (!next && status.installed && !confirm(t("line_settings.richmenu_disable_confirm"))) return

    setError(null)
    setSuccess(null)
    setTogglingEnabled(true)
    try {
      const res = await setRichMenuEnabledAction(workspaceId, next)
      if (!res.success) {
        setError(res.error || t("line_settings.richmenu_err_toggle"))
        await loadStatus()
        return
      }
      setSuccess(next ? t("line_settings.richmenu_enabled_msg") : t("line_settings.richmenu_disabled_msg"))
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("line_settings.richmenu_err_toggle"))
    } finally {
      setTogglingEnabled(false)
    }
  }

  const handleInstall = async () => {
    setError(null)
    setSuccess(null)
    setInstalling(true)
    try {
      const res = await installRichMenuAction(workspaceId)
      if (!res.success) {
        setError(res.error || t("line_settings.richmenu_err_install"))
        return
      }
      setSuccess(t("line_settings.richmenu_installed"))
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("line_settings.richmenu_err_install"))
    } finally {
      setInstalling(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm(t("line_settings.richmenu_remove_confirm"))) return
    setError(null)
    setSuccess(null)
    setRemoving(true)
    try {
      const res = await removeRichMenuAction(workspaceId)
      if (!res.success) {
        setError(res.error || t("line_settings.richmenu_err_remove"))
        return
      }
      setSuccess(t("line_settings.richmenu_removed"))
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("line_settings.richmenu_err_remove"))
    } finally {
      setRemoving(false)
    }
  }

  const handleSyncAdminMenu = async () => {
    setError(null)
    setSuccess(null)
    setSyncingAdmin(true)
    try {
      const res = await syncAdminRichMenuAction(workspaceId)
      if (!res.success) {
        setError(res.error || t("line_settings.richmenu_admin_err_sync"))
        return
      }
      setSuccess(
        t("line_settings.richmenu_admin_synced")
          .replace("{linked}", String(res.data?.linked ?? 0))
          .replace("{total}", String(res.data?.total ?? 0))
      )
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("line_settings.richmenu_admin_err_sync"))
    } finally {
      setSyncingAdmin(false)
    }
  }

  const handleToggleAdminMenu = async () => {
    if (!status) return
    const next = !status.admin.enabled
    if (!next && status.admin.installed && !confirm(t("line_settings.richmenu_admin_disable_confirm"))) return

    setError(null)
    setSuccess(null)
    setTogglingAdmin(true)
    try {
      const res = await setAdminRichMenuEnabledAction(workspaceId, next)
      if (!res.success) {
        setError(res.error || t("line_settings.richmenu_admin_err_toggle"))
        await loadStatus()
        return
      }
      setSuccess(
        next
          ? t("line_settings.richmenu_admin_enabled_msg")
              .replace("{linked}", String(res.data?.linked ?? 0))
              .replace("{total}", String(res.data?.total ?? 0))
          : t("line_settings.richmenu_admin_disabled_msg")
      )
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("line_settings.richmenu_admin_err_toggle"))
    } finally {
      setTogglingAdmin(false)
    }
  }

  const busy = uploading || installing || removing || togglingEnabled || syncingAdmin || togglingAdmin
  const enabled = status?.enabled !== false
  const adminEnabled = status?.admin.enabled !== false
  const canInstall = channelConfigured && !!status && enabled && !status.contactMissing && !busy

  return (
    <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-5">
      {/* หัวกล่อง + เวลาอัปเดตล่าสุด */}
      <div className="flex justify-between items-start gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl shrink-0">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">
              {t("line_settings.richmenu_title")}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold mt-1.5 leading-relaxed">
              {t("line_settings.richmenu_desc")}
            </p>
          </div>
        </div>

        <button
          onClick={loadStatus}
          disabled={loading || busy}
          className="p-2 text-slate-400 hover:text-indigo-500 disabled:text-slate-300 dark:disabled:text-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          title={t("line_settings.richmenu_refresh")}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-400 py-4">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>{t("line_settings.richmenu_loading")}</span>
        </div>
      ) : (
        <>
          {/* สวิตช์เปิด/ปิด — หอที่ไม่ต้องการเมนูล่างปิดทิ้งได้โดยไม่เสียภาพและค่าที่ตั้งไว้ */}
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                  enabled
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-slate-100 dark:bg-slate-950 text-slate-400"
                }`}
              >
                {enabled ? <LayoutGrid className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
              </div>
              <div className="space-y-0.5">
                <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                  {t("line_settings.richmenu_toggle_title")}
                </h5>
                <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold leading-normal">
                  {enabled
                    ? `🟢 ${t("line_settings.richmenu_toggle_on")}`
                    : `🔴 ${t("line_settings.richmenu_toggle_off")}`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleEnabled}
              disabled={busy || !status}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none ${
                enabled ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
              } ${busy || !status ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* สถานะ + เวลาอัปเดตล่าสุด */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {t("line_settings.richmenu_status_label")}
              </span>
              {!enabled ? (
                <p className="text-sm font-black text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <PowerOff className="w-4 h-4 shrink-0" />
                  {t("line_settings.richmenu_status_disabled")}
                </p>
              ) : status?.installed ? (
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {t("line_settings.richmenu_status_active")}
                </p>
              ) : (
                <p className="text-sm font-black text-slate-500 dark:text-slate-400">
                  {t("line_settings.richmenu_status_none")}
                </p>
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {t("line_settings.richmenu_updated_label")}
              </span>
              <p className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Clock className="w-4 h-4 shrink-0 text-slate-400" />
                {formatInstalledAt(status?.installedAt ?? null)}
              </p>
            </div>
          </div>

          {/* เตือนเมื่อข้อมูลในระบบเปลี่ยนไปแล้วแต่เมนูใน LINE ยังเป็นของเก่า */}
          {enabled && status?.outdated && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-black text-amber-700 dark:text-amber-400">
                  {t("line_settings.richmenu_outdated_title")}
                </p>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-500/80 font-bold leading-relaxed">
                  {t("line_settings.richmenu_outdated_desc")}
                </p>
              </div>
            </div>
          )}

          {/* เบอร์ติดต่อยังว่าง = ติดตั้งไม่ได้ */}
          {enabled && status?.contactMissing && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-700 dark:text-rose-400 font-bold leading-relaxed">
                {t("line_settings.richmenu_contact_missing")}
              </p>
            </div>
          )}

          {/* ภาพเมนู + ปุ่มลงมือ — หรี่ลงเมื่อปิดสวิตช์ เพื่อบอกว่ายังตั้งค่าเก็บไว้ได้แต่ยังไม่มีผล */}
          <div className={`space-y-3 transition-all duration-300 ${enabled ? "" : "opacity-60 pointer-events-none select-none"}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-black text-slate-600 dark:text-slate-300">
                {t("line_settings.richmenu_image_label")}
              </span>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {status ? `${status.requiredWidth}x${status.requiredHeight}` : "2500x1686"} · PNG/JPEG · ≤1MB
              </span>
            </div>

            {status?.effectiveImageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={status.effectiveImageUrl}
                alt={t("line_settings.richmenu_image_label")}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
              />
            )}

            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
              {status?.customImageUrl
                ? t("line_settings.richmenu_image_custom")
                : t("line_settings.richmenu_image_default")}
            </p>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png,image/jpeg"
              className="hidden"
            />

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="flex-1 min-w-[160px] py-2.5 px-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 disabled:opacity-50 text-slate-700 dark:text-slate-200 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors"
              >
                {uploading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 text-indigo-500" />
                )}
                <span>{t("line_settings.richmenu_upload_btn")}</span>
              </button>

              {status?.customImageUrl && (
                <button
                  onClick={handleUseDefaultImage}
                  disabled={busy}
                  className="py-2.5 px-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 disabled:opacity-50 text-slate-500 dark:text-slate-400 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>{t("line_settings.richmenu_use_default_btn")}</span>
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-700 dark:text-rose-400 font-bold leading-relaxed">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold leading-relaxed">{success}</p>
            </div>
          )}

          {/* ปุ่มลงมือ */}
          <div className={`flex flex-col sm:flex-row gap-2 pt-1 transition-all duration-300 ${enabled ? "" : "opacity-60 pointer-events-none select-none"}`}>
            <button
              onClick={handleInstall}
              disabled={!canInstall}
              className={`flex-1 py-3 px-4 font-black rounded-xl flex items-center justify-center gap-2 text-sm transition-colors ${
                canInstall
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white active:scale-[0.99]"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
              }`}
            >
              {installing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <LayoutGrid className="w-4 h-4" />
              )}
              <span>
                {status?.installed
                  ? t("line_settings.richmenu_update_btn")
                  : t("line_settings.richmenu_install_btn")}
              </span>
            </button>

            {status?.installed && (
              <button
                onClick={handleRemove}
                disabled={busy}
                className="py-3 px-4 bg-white dark:bg-slate-950 border border-rose-500/30 hover:border-rose-500/60 disabled:opacity-50 text-rose-600 dark:text-rose-400 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors"
              >
                {removing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{t("line_settings.richmenu_remove_btn")}</span>
              </button>
            )}
          </div>

          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 leading-relaxed">
            {t("line_settings.richmenu_note")}
          </p>

          {/* เมนูผู้ดูแล — เมนูใบที่สองที่ผูกให้เฉพาะแอดมิน มีสวิตช์ของตัวเองแยกจากเมนูผู้เช่า */}
          <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-sky-500/10 text-sky-500 rounded-xl shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                  {t("line_settings.richmenu_admin_title")}
                </h5>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold mt-1.5 leading-relaxed">
                  {t("line_settings.richmenu_admin_desc")}
                </p>
              </div>
            </div>

            {/* สวิตช์ของเมนูผู้ดูแล — คุมแยกจากเมนูผู้เช่า ปิดอันนี้ผู้เช่าไม่กระทบ */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                    adminEnabled
                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                      : "bg-slate-100 dark:bg-slate-950 text-slate-400"
                  }`}
                >
                  {adminEnabled ? <ShieldCheck className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                </div>
                <div className="space-y-0.5">
                  <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                    {t("line_settings.richmenu_admin_toggle_title")}
                  </h5>
                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold leading-normal">
                    {adminEnabled
                      ? `🟢 ${t("line_settings.richmenu_admin_toggle_on")}`
                      : `🔴 ${t("line_settings.richmenu_admin_toggle_off")}`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleAdminMenu}
                disabled={busy || !status?.admin.ready}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none ${
                  adminEnabled ? "bg-sky-500" : "bg-slate-200 dark:bg-slate-800"
                } ${busy || !status?.admin.ready ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
                    adminEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* ยังไม่ได้รัน SQL patch — สวิตช์กดไม่ได้ ต้องบอกเหตุผล ไม่ใช่ปล่อยให้จางเฉย ๆ */}
            {status && !status.admin.ready && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700/90 dark:text-amber-500/90 font-bold leading-relaxed">
                  {t("line_settings.richmenu_admin_not_ready")}
                </p>
              </div>
            )}

            {!adminEnabled || !status?.admin.ready ? null : status?.admin.adminCount === 0 ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
                  {t("line_settings.richmenu_admin_none")}
                </p>
              </div>
            ) : (
              <>
                <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {t("line_settings.richmenu_admin_linked_label")}
                  </span>
                  <p className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-slate-400" />
                    {t("line_settings.richmenu_admin_linked_value")
                      .replace("{linked}", String(status?.admin.linkedCount ?? 0))
                      .replace("{total}", String(status?.admin.adminCount ?? 0))}
                  </p>
                </div>

                {status?.admin.needsSync && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700/90 dark:text-amber-500/90 font-bold leading-relaxed">
                      {t("line_settings.richmenu_admin_needs_sync")}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleSyncAdminMenu}
                  disabled={busy || !channelConfigured}
                  className={`w-full py-2.5 px-4 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors ${
                    busy || !channelConfigured
                      ? "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                      : "bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-sky-400 text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {syncingAdmin ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-sky-500" />
                  )}
                  <span>{t("line_settings.richmenu_admin_sync_btn")}</span>
                </button>
              </>
            )}

            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 leading-relaxed">
              {t("line_settings.richmenu_admin_note")}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
