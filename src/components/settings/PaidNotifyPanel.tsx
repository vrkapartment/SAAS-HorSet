"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, BellRing, CheckCircle2, PowerOff, RefreshCw, RotateCcw, Save } from "lucide-react"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import {
  getPaidNotifyStatusAction,
  savePaidNotifyTemplateAction,
  setPaidNotifyEnabledAction,
  type PaidNotifyStatus
} from "@/features/notification/paid-notify-actions"
import {
  DEFAULT_PAID_MESSAGE_TEMPLATE,
  PAID_MESSAGE_VARIABLES,
  renderPaidMessage,
  resolvePaidMessageTemplate,
  samplePaidMessageValues
} from "@/features/notification/paid-message"

/**
 * กล่องตั้งค่า "แจ้งเตือนผู้เช่าเมื่อชำระเงินสำเร็จ" ในหน้า ตั้งค่า › LINE OA
 *
 * พรีวิวคำนวณฝั่งเบราว์เซอร์ด้วย renderPaidMessage ตัวเดียวกับที่ฝั่งส่งจริงใช้
 * จึงมั่นใจได้ว่าสิ่งที่เห็นตรงกับสิ่งที่ผู้เช่าจะได้รับ
 */

type Props = {
  workspaceId: string
  /** true เมื่อหอพักเชื่อมต่อ LINE OA เรียบร้อยแล้ว (มี channel access token) */
  channelConfigured: boolean
}

export default function PaidNotifyPanel({ workspaceId, channelConfigured }: Props) {
  const { t } = useLanguage()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<PaidNotifyStatus | null>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)

  const loadStatus = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await getPaidNotifyStatusAction(workspaceId)
      if (res.success && res.data) {
        setStatus(res.data)
        setDraft(res.data.template || DEFAULT_PAID_MESSAGE_TEMPLATE)
        setError(null)
      } else {
        setStatus(null)
        setError(res.error || t("line_settings.paidnotify_err_load"))
      }
    } catch (err) {
      setStatus(null)
      setError(err instanceof Error ? err.message : t("line_settings.paidnotify_err_load"))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, t])

  // เรียกใน callback ของ timer เพื่อไม่ให้ setState เกิดในจังหวะเดียวกับ render รอบแรก
  useEffect(() => {
    const timer = setTimeout(() => { loadStatus() }, 0)
    return () => clearTimeout(timer)
  }, [loadStatus])

  const enabled = status?.enabled !== false
  const ready = !!status?.ready
  const busy = saving || toggling

  /** แทรกตัวแปรตรงตำแหน่งเคอร์เซอร์ เจ้าหอจะได้ไม่ต้องพิมพ์ {{...}} เอง */
  const insertVariable = (token: string) => {
    const el = textareaRef.current
    if (!el) {
      setDraft(prev => `${prev}${token}`)
      return
    }
    const start = el.selectionStart ?? draft.length
    const end = el.selectionEnd ?? draft.length
    const next = `${draft.slice(0, start)}${token}${draft.slice(end)}`
    setDraft(next)
    // คืนโฟกัสพร้อมวางเคอร์เซอร์ต่อท้ายตัวแปรที่เพิ่งแทรก ให้พิมพ์ต่อได้เลย
    setTimeout(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    }, 0)
  }

  const preview = useMemo(() => {
    const values = samplePaidMessageValues(status?.workspaceName || "")
    return renderPaidMessage(resolvePaidMessageTemplate(draft), values)
  }, [draft, status?.workspaceName])

  const dirty = (status?.template || DEFAULT_PAID_MESSAGE_TEMPLATE) !== draft

  const handleToggle = async () => {
    if (!status) return
    const next = !enabled
    if (!next && !confirm(t("line_settings.paidnotify_disable_confirm"))) return

    setError(null)
    setSuccess(null)
    setToggling(true)
    try {
      const res = await setPaidNotifyEnabledAction(workspaceId, next)
      if (!res.success) {
        setError(res.error || t("line_settings.paidnotify_err_toggle"))
        await loadStatus()
        return
      }
      setSuccess(next ? t("line_settings.paidnotify_enabled_msg") : t("line_settings.paidnotify_disabled_msg"))
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("line_settings.paidnotify_err_toggle"))
    } finally {
      setToggling(false)
    }
  }

  const handleSave = async () => {
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const res = await savePaidNotifyTemplateAction(workspaceId, draft)
      if (!res.success) {
        setError(res.error || t("line_settings.paidnotify_err_save"))
        return
      }
      setSuccess(t("line_settings.paidnotify_saved"))
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("line_settings.paidnotify_err_save"))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm(t("line_settings.paidnotify_reset_confirm"))) return
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const res = await savePaidNotifyTemplateAction(workspaceId, "")
      if (!res.success) {
        setError(res.error || t("line_settings.paidnotify_err_save"))
        return
      }
      setDraft(DEFAULT_PAID_MESSAGE_TEMPLATE)
      setSuccess(t("line_settings.paidnotify_reset_done"))
      await loadStatus()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-5">
      <div className="flex justify-between items-start gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">
              {t("line_settings.paidnotify_title")}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold mt-1.5 leading-relaxed">
              {t("line_settings.paidnotify_desc")}
            </p>
          </div>
        </div>

        <button
          onClick={loadStatus}
          disabled={loading || busy}
          className="p-2 text-slate-400 hover:text-emerald-500 disabled:text-slate-300 dark:disabled:text-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-400 py-4">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>...</span>
        </div>
      ) : (
        <>
          {status && !ready && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700/90 dark:text-amber-500/90 font-bold leading-relaxed">
                {t("line_settings.paidnotify_not_ready")}
              </p>
            </div>
          )}

          {/* สวิตช์เปิด/ปิด */}
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                  enabled
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-slate-100 dark:bg-slate-950 text-slate-400"
                }`}
              >
                {enabled ? <BellRing className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
              </div>
              <div className="space-y-0.5">
                <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                  {t("line_settings.paidnotify_toggle_title")}
                </h5>
                <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold leading-normal">
                  {enabled
                    ? `🟢 ${t("line_settings.paidnotify_toggle_on")}`
                    : `🔴 ${t("line_settings.paidnotify_toggle_off")}`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggle}
              disabled={busy || !ready}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none ${
                enabled ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
              } ${busy || !ready ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {!channelConfigured && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-700 dark:text-rose-400 font-bold leading-relaxed">
                {t("line_settings.paidnotify_channel_missing")}
              </p>
            </div>
          )}

          {/* จะมีผู้เช่ากี่คนที่ได้รับจริง — บอกตรง ๆ ไม่ให้เข้าใจผิดว่าทุกคนได้ */}
          {status && (
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {t("line_settings.paidnotify_coverage_label")}
              </span>
              <p className="text-sm font-black text-slate-700 dark:text-slate-200">
                {t("line_settings.paidnotify_coverage_value")
                  .replace("{with}", String(status.tenantsWithLine))
                  .replace("{total}", String(status.tenantsTotal))}
              </p>
              {status.tenantsWithLine < status.tenantsTotal && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold leading-relaxed">
                  {t("line_settings.paidnotify_coverage_warn")}
                </p>
              )}
            </div>
          )}

          {/* ข้อความ + ปุ่มแทรกตัวแปร */}
          <div className={`space-y-3 transition-all duration-300 ${enabled && ready ? "" : "opacity-60 pointer-events-none select-none"}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-black text-slate-600 dark:text-slate-300">
                {t("line_settings.paidnotify_message_label")}
              </span>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {draft.length}/{status?.maxLength ?? 1000}
              </span>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {t("line_settings.paidnotify_insert_label")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PAID_MESSAGE_VARIABLES.map(v => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertVariable(v.token)}
                    disabled={busy}
                    className="py-1.5 px-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 disabled:opacity-50 text-slate-600 dark:text-slate-300 font-bold rounded-lg text-[11px] transition-colors"
                  >
                    + {v.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={9}
              maxLength={status?.maxLength ?? 1000}
              className="w-full p-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-400 focus:outline-none text-slate-700 dark:text-slate-200 text-xs font-medium rounded-2xl leading-relaxed resize-y"
            />

            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
              {status?.usingDefault
                ? t("line_settings.paidnotify_using_default")
                : t("line_settings.paidnotify_using_custom")}
            </p>

            {/* พรีวิว — ใช้ฟังก์ชันแทนค่าตัวเดียวกับฝั่งส่งจริง */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {t("line_settings.paidnotify_preview_label")}
              </span>
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                <p className="text-xs text-slate-700 dark:text-slate-200 font-medium leading-relaxed whitespace-pre-wrap break-words">
                  {preview}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={busy || !dirty}
                className={`flex-1 py-3 px-4 font-black rounded-xl flex items-center justify-center gap-2 text-sm transition-colors ${
                  busy || !dirty
                    ? "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.99]"
                }`}
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{t("line_settings.paidnotify_save_btn")}</span>
              </button>

              {!status?.usingDefault && (
                <button
                  onClick={handleReset}
                  disabled={busy}
                  className="py-3 px-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 disabled:opacity-50 text-slate-500 dark:text-slate-400 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{t("line_settings.paidnotify_reset_btn")}</span>
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
        </>
      )}
    </div>
  )
}
