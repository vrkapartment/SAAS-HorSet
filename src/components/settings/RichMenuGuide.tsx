"use client"

import React, { useState } from "react"
import { AlertTriangle, ChevronDown, HelpCircle, RefreshCw, Users } from "lucide-react"
import { useLanguage } from "@/lib/translations/LanguageProvider"

/**
 * กล่อง "วิธีใช้หน้านี้" ในแท็บเมนูล่างในแชท LINE
 *
 * พับเก็บไว้เป็นค่าเริ่มต้น เพราะเจ้าหอที่เคยตั้งค่าแล้วไม่ต้องอ่านซ้ำทุกครั้งที่เข้ามา
 * แต่คนที่เข้ามาครั้งแรกยังเห็นว่ามีคำอธิบายให้กดอ่าน
 *
 * เนื้อหาโฟกัส 3 เรื่องที่พลาดแล้วเสียหายจริง ไม่ได้ยกเอกสารสำหรับนักพัฒนา
 * (docs/line-rich-menu/README.md) มาแปะ:
 *   1. เปลี่ยนภาพได้แต่ผังปุ่มเปลี่ยนไม่ได้ — ระบบตรวจแทนไม่ได้ เสียหายเงียบ
 *   2. ทำไมต้องกดติดตั้งซ้ำทุกครั้งที่แก้ (LINE ไม่มี API แก้เมนูเดิม)
 *   3. เมนู 2 ชุดแยกสวิตช์กัน ใครเห็นอะไร
 * ปิดท้ายด้วยตารางว่าปุ่มแต่ละอันกดแล้วได้อะไร
 */

/** แถวในตารางปุ่ม เก็บเป็น "ชื่อปุ่ม|คำอธิบาย" ในไฟล์แปลเพื่อให้แปลทั้งบรรทัดได้ทีเดียว */
function ButtonTable({ titleKey, rowKeys }: { titleKey: string; rowKeys: string[] }) {
  const { t } = useLanguage()

  return (
    <div className="space-y-2">
      <h6 className="text-[11px] font-black uppercase tracking-wider text-slate-400">{t(titleKey)}</h6>
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left">
          <thead className="bg-slate-100 dark:bg-slate-950">
            <tr>
              <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("line_settings.richmenu_guide_col_button")}
              </th>
              <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("line_settings.richmenu_guide_col_result")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rowKeys.map(key => {
              const raw = t(key)
              const dividerAt = raw.indexOf("|")
              const name = dividerAt >= 0 ? raw.slice(0, dividerAt) : raw
              const detail = dividerAt >= 0 ? raw.slice(dividerAt + 1) : ""
              return (
                <tr key={key} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-3 py-2 align-top text-[11px] font-black text-slate-700 dark:text-slate-200">
                    {name}
                  </td>
                  <td className="px-3 py-2 align-top text-[11px] font-bold leading-relaxed text-slate-500 dark:text-slate-400">
                    {detail}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function RichMenuGuide() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="shrink-0 rounded-xl bg-slate-500/10 p-2.5 text-slate-500">
            <HelpCircle className="h-5 w-5" />
          </span>
          <span className="text-sm font-black text-slate-800 dark:text-slate-100">
            {t("line_settings.richmenu_guide_toggle")}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-4 dark:border-slate-800">
          {/* เรื่องที่พลาดแล้วเสียหายเงียบ ๆ ต้องเด่นสุด */}
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-[11px] font-bold leading-relaxed text-amber-700/90 dark:text-amber-500/90">
              {t("line_settings.richmenu_guide_layout_warn")}
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-800/70 dark:bg-slate-950/50">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-[11px] font-bold leading-relaxed text-slate-500 dark:text-slate-400">
              {t("line_settings.richmenu_guide_reinstall_warn")}
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-800/70 dark:bg-slate-950/50">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-[11px] font-bold leading-relaxed text-slate-500 dark:text-slate-400">
              {t("line_settings.richmenu_guide_two_menus")}
            </p>
          </div>

          {/* ตารางกว้างเกินจอมือถือได้ ให้เลื่อนในกล่องตัวเอง ไม่ให้ทั้งหน้าเลื่อนขวา */}
          <div className="overflow-x-auto">
            <div className="min-w-[320px] space-y-4">
              <ButtonTable
                titleKey="line_settings.richmenu_guide_tenant_buttons_title"
                rowKeys={[
                  "line_settings.richmenu_guide_t1",
                  "line_settings.richmenu_guide_t2",
                  "line_settings.richmenu_guide_t3",
                  "line_settings.richmenu_guide_t4",
                  "line_settings.richmenu_guide_t5"
                ]}
              />
              <ButtonTable
                titleKey="line_settings.richmenu_guide_admin_buttons_title"
                rowKeys={[
                  "line_settings.richmenu_guide_a1",
                  "line_settings.richmenu_guide_a2",
                  "line_settings.richmenu_guide_a3",
                  "line_settings.richmenu_guide_a4"
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
