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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6 mt-6 mb-2">
      {/* การจดมิเตอร์ */}
      <div className={`group p-4 sm:p-5 lg:p-6 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center gap-3.5 sm:gap-5 shadow-sm hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer ${
        isDark 
          ? "bg-slate-900/40 border-slate-800/80 hover:border-blue-500/30 hover:bg-slate-900/60" 
          : "bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50/50"
      }`}>
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 ${
          isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600"
        }`}>
          <Gauge className="w-5 h-5 sm:w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate transition-colors duration-300 ${
            isDark ? "text-slate-400 group-hover:text-blue-400" : "text-slate-500 group-hover:text-blue-600"
          }`}>บันทึกมิเตอร์แล้ว</p>
          <p className={`text-base sm:text-lg lg:text-xl font-black mt-0.5 tracking-tight truncate ${isDark ? "text-slate-100" : "text-slate-850"}`}>
            {billedCount} <span className="text-xs sm:text-sm font-semibold text-slate-400 dark:text-slate-500">/ {totalOccupied} ห้อง</span>
          </p>
        </div>
      </div>

      {/* ชำระเงินเรียบร้อย */}
      <div className={`group p-4 sm:p-5 lg:p-6 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center gap-3.5 sm:gap-5 shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer ${
        isDark 
          ? "bg-slate-900/40 border-slate-800/80 hover:border-emerald-500/30 hover:bg-slate-900/60" 
          : "bg-white border-slate-100 hover:border-emerald-200 hover:bg-slate-50/50"
      }`}>
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 transition-all duration-305 group-hover:scale-110 ${
          isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
        }`}>
          <CheckCircle className="w-5 h-5 sm:w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate transition-colors duration-305 ${
            isDark ? "text-slate-400 group-hover:text-emerald-400" : "text-slate-500 group-hover:text-emerald-600"
          }`}>ชำระเงินเรียบร้อย</p>
          <p className={`text-base sm:text-lg lg:text-xl font-black mt-0.5 tracking-tight truncate ${isDark ? "text-slate-100" : "text-slate-850"}`}>
            {paidCount} <span className="text-xs sm:text-sm font-semibold text-slate-400 dark:text-slate-500">ห้อง</span>
          </p>
        </div>
      </div>

      {/* รอตรวจสอบสลิป */}
      <div className={`group p-4 sm:p-5 lg:p-6 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center gap-3.5 sm:gap-5 relative overflow-hidden shadow-sm hover:shadow-lg hover:shadow-amber-500/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer ${
        isDark 
          ? "bg-slate-900/40 border-slate-800/80 hover:border-amber-500/30 hover:bg-slate-900/60" 
          : "bg-white border-slate-100 hover:border-amber-200 hover:bg-slate-50/50"
      }`}>
        {pendingCount > 0 && <span className="absolute top-2.5 right-2.5 sm:top-3.5 sm:right-3.5 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />}
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 transition-all duration-305 group-hover:scale-110 ${
          isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"
        }`}>
          <Clock className="w-5 h-5 sm:w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate transition-colors duration-305 ${
            isDark ? "text-slate-400 group-hover:text-amber-400" : "text-slate-500 group-hover:text-amber-600"
          }`}>รอตรวจสอบสลิป</p>
          <p className={`text-base sm:text-lg lg:text-xl font-black mt-0.5 tracking-tight truncate ${
            pendingCount > 0 
              ? `animate-pulse ${isDark ? "text-amber-400" : "text-amber-600"}` 
              : (isDark ? "text-slate-450" : "text-slate-800")
          }`}>
            {pendingCount} <span className="text-xs sm:text-sm font-semibold text-slate-400 dark:text-slate-500">ห้อง</span>
          </p>
        </div>
      </div>

      {/* ค้างชำระ */}
      <div className={`group p-4 sm:p-5 lg:p-6 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center gap-3.5 sm:gap-5 shadow-sm hover:shadow-lg hover:shadow-rose-500/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer ${
        isDark 
          ? "bg-slate-900/40 border-slate-800/80 hover:border-rose-500/30 hover:bg-slate-900/60" 
          : "bg-white border-slate-100 hover:border-rose-200 hover:bg-slate-50/50"
      }`}>
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 transition-all duration-305 group-hover:scale-110 ${
          isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-50 text-rose-600"
        }`}>
          <AlertCircle className="w-5 h-5 sm:w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate transition-colors duration-305 ${
            isDark ? "text-slate-400 group-hover:text-rose-400" : "text-slate-500 group-hover:text-rose-600"
          }`}>ค้างชำระเงิน</p>
          <p className={`text-base sm:text-lg lg:text-xl font-black mt-0.5 tracking-tight truncate ${isDark ? "text-rose-400" : "text-rose-600"}`}>
            {unpaidCount} <span className="text-xs sm:text-sm font-semibold text-slate-400 dark:text-slate-500">ห้อง</span>
          </p>
        </div>
      </div>
    </div>
  )
}
