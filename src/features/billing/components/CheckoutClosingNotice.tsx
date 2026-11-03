"use client"

import { LogOut } from "lucide-react"
import type { CheckoutClosing } from "@/features/tenant/actions"

/**
 * เลขมิเตอร์ช่วงที่ผู้เช่าย้ายออกใช้ ในรอบที่ย้ายออก — แสดงอย่างเดียว ไม่มีช่องกรอก ไม่มีปุ่มบันทึก/ออกบิล
 *
 * feature: billing · role ที่เห็น: ทุกคนที่เข้าหน้าจดมิเตอร์/ดูบิลได้
 *
 * แถว meter_records ของรอบที่ย้ายออกถูกตั้งให้เริ่มนับใหม่ที่เลขปิดห้อง (กันผู้เช่าใหม่ถูกคิดหน่วยซ้ำ)
 * ช่วงของผู้เช่าเดิมจึงมาจากประวัติสัญญายกเลิก และค่าน้ำ-ไฟช่วงนี้หักจากเงินประกันไปแล้ว ห้ามออกบิลซ้ำ
 */
export default function CheckoutClosingNotice({
  closing,
  isDark,
  layout
}: {
  closing: CheckoutClosing
  isDark: boolean
  layout: "row" | "card"
}) {
  const elecUnits = Math.max(0, closing.elecCurr - closing.elecPrev)
  const waterUnits = Math.max(0, closing.waterCurr - closing.waterPrev)
  const dateLabel = closing.cancellationDate
    ? new Date(closing.cancellationDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })
    : "-"

  const box = isDark
    ? "bg-slate-900/40 border-slate-700/60 text-slate-300"
    : "bg-slate-50 border-slate-200 text-slate-700"
  const muted = isDark ? "text-slate-400" : "text-slate-500"

  const reading = (label: string, prev: number, curr: number, units: number) => (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={`text-[11px] xl:text-xs font-bold ${muted}`}>{label}</span>
      <span className="font-mono font-extrabold text-sm xl:text-base">{prev.toLocaleString()}</span>
      <span className={muted}>→</span>
      <span className="font-mono font-extrabold text-sm xl:text-base">{curr.toLocaleString()}</span>
      <span className="text-[11px] xl:text-xs font-bold text-indigo-500 dark:text-indigo-400">{units.toLocaleString()} หน่วย</span>
    </div>
  )

  return (
    <div className={`rounded-xl border px-4 py-3 ${box} ${layout === "card" ? "space-y-2" : "flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-6"}`}>
      <div className="flex items-center gap-2 shrink-0">
        <LogOut className="w-4 h-4 text-slate-400" />
        <span className="font-extrabold text-xs xl:text-sm">ย้ายออก {dateLabel}</span>
        <span className={`text-[11px] xl:text-xs font-semibold ${muted}`}>{closing.tenantName}</span>
      </div>
      {reading("ไฟ", closing.elecPrev, closing.elecCurr, elecUnits)}
      {reading("น้ำ", closing.waterPrev, closing.waterCurr, waterUnits)}
      <span className={`text-[11px] xl:text-xs font-semibold ${muted}`}>หักจากเงินประกันแล้ว (ไม่ต้องออกบิล)</span>
    </div>
  )
}
