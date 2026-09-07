"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, ArrowRight, LayoutGrid, RefreshCw } from "lucide-react"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { getLineSettingsAction } from "@/features/notification/actions"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import RichMenuPanel from "@/components/settings/RichMenuPanel"

/**
 * แท็บ "เมนูล่างในแชท LINE" (settings?tab=rich-menu)
 *
 * แยกออกมาจากแท็บ LINE OA เพราะแท็บนั้นยาวมากอยู่แล้ว (การเชื่อมต่อ token, ผูกแอดมิน,
 * โควตา, การแจ้งเตือน) และเรื่องเมนูล่างเป็นงานที่เจ้าหอเข้ามาทำเป็นครั้ง ๆ ไม่ได้ทำพร้อมกัน
 *
 * แท็บนี้ทำหน้าที่แค่หา workspaceId กับดูว่าเชื่อมต่อ LINE OA แล้วหรือยัง แล้วส่งต่อให้
 * RichMenuPanel — ตัว panel ยังเป็นเจ้าของ state ทั้งหมดของตัวเองเหมือนเดิม ไม่ได้แก้อะไร
 */

export default function RichMenuSettingsTab() {
  const { t } = useLanguage()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [channelConfigured, setChannelConfigured] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const profile = await getCurrentUserProfileClient()
        if (cancelled) return

        // ห้าม fallback ไป workspace ตัวอย่าง — จะไปติดตั้งเมนูลง LINE OA ของหอพักอื่นได้
        const wsId = profile.success && profile.data ? profile.data.workspace_id || "" : ""
        if (!wsId) {
          setError(t("line_settings.err_no_workspace"))
          return
        }
        setWorkspaceId(wsId)

        const settings = await getLineSettingsAction(wsId)
        if (cancelled) return

        const token = settings.success && settings.data ? settings.data.channel_access_token || "" : ""
        setChannelConfigured(!!token.trim() && token !== "placeholder")
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("line_settings.richmenu_err_load"))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    // เรียกใน callback ของ timer เพื่อไม่ให้ setState เกิดในจังหวะเดียวกับ render รอบแรก
    const timer = setTimeout(() => { load() }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [t])

  if (loading) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm">
        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-400 py-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>{t("line_settings.richmenu_tab_loading")}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm">
        <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-700 dark:text-rose-400 font-bold leading-relaxed">{error}</p>
        </div>
      </div>
    )
  }

  // ยังไม่ได้เชื่อมต่อ LINE OA — บอกเหตุผลและพาไปแท็บที่ทำได้ ดีกว่าโชว์หน้าว่างหรือปุ่มที่กดไม่ได้
  if (!channelConfigured) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl shrink-0">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">
              {t("line_settings.richmenu_tab_need_channel_title")}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold mt-1.5 leading-relaxed">
              {t("line_settings.richmenu_tab_need_channel_desc")}
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push("/settings?tab=line-oa")}
          className="w-full sm:w-auto py-3 px-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl flex items-center justify-center gap-2 text-sm transition-colors active:scale-[0.99]"
        >
          <span>{t("line_settings.richmenu_tab_need_channel_cta")}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return <RichMenuPanel workspaceId={workspaceId} channelConfigured={channelConfigured} />
}
