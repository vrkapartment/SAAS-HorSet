import React from "react"
import { Gauge, CheckCircle, Clock, AlertCircle } from "lucide-react"

interface BillingSummaryStatsProps {
  isDark: boolean
  billedCount: number
  totalOccupied: number
  paidCount: number
  pendingCount: number
  unpaidCount: number
}

export default function BillingSummaryStats({
  isDark,
  billedCount,
  totalOccupied,
  paidCount,
  pendingCount,
  unpaidCount
}: BillingSummaryStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* การจดมิเตอร์ */}
      <div className={`p-4 rounded-2xl border flex items-center gap-3 shadow-sm ${
        isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200"
      }`}>
        <div className={`p-2.5 rounded-xl ${isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-500/10 text-blue-500"}`}>
          <Gauge className="w-5 h-5" />
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>บันทึกมิเตอร์แล้ว</p>
          <p className={`text-base font-extrabold ${isDark ? "text-slate-100" : "text-slate-800"}`}>{billedCount} / {totalOccupied} ห้อง</p>
        </div>
      </div>

      {/* ชำระเงินเรียบร้อย */}
      <div className={`p-4 rounded-2xl border flex items-center gap-3 shadow-sm ${
        isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200"
      }`}>
        <div className={`p-2.5 rounded-xl ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-500/10 text-emerald-500"}`}>
          <CheckCircle className="w-5 h-5" />
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>ชำระเงินเรียบร้อย</p>
          <p className={`text-base font-extrabold ${isDark ? "text-slate-100" : "text-slate-800"}`}>{paidCount} ห้อง</p>
        </div>
      </div>

      {/* รอตรวจสอบสลิป */}
      <div className={`p-4 rounded-2xl border flex items-center gap-3 relative overflow-hidden shadow-sm ${
        isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200"
      }`}>
        {pendingCount > 0 && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />}
        <div className={`p-2.5 rounded-xl ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-500/10 text-amber-500"}`}>
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>รอตรวจสอบสลิป</p>
          <p className={`text-base font-extrabold ${
            pendingCount > 0 
              ? `font-black animate-pulse ${isDark ? "text-amber-400" : "text-amber-600"}` 
              : (isDark ? "text-slate-400" : "text-slate-500")
          }`}>
            {pendingCount} ห้อง
          </p>
        </div>
      </div>

      {/* ค้างชำระ */}
      <div className={`p-4 rounded-2xl border flex items-center gap-3 shadow-sm ${
        isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200"
      }`}>
        <div className={`p-2.5 rounded-xl ${isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-500/10 text-rose-500"}`}>
          <AlertCircle className="w-5 h-5" />
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>ค้างชำระเงิน</p>
          <p className={`text-base font-extrabold ${isDark ? "text-rose-400" : "text-rose-600"}`}>{unpaidCount} ห้อง</p>
        </div>
      </div>
    </div>
  )
}
