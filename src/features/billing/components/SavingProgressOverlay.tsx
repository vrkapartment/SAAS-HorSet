import React from "react"
import { Save, RefreshCw } from "lucide-react"

interface SavingProgressOverlayProps {
  isDark: boolean
  savingAll: boolean
  savingProgress: {
    current: number
    total: number
    currentRoom: string
  }
}

export default function SavingProgressOverlay({
  isDark,
  savingAll,
  savingProgress
}: SavingProgressOverlayProps) {
  if (!savingAll) return null

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md transition-all duration-300 ${
      isDark ? "bg-black/80" : "bg-slate-900/40"
    }`}>
      <div className={`p-8 rounded-3xl border max-w-md w-full mx-4 text-center space-y-6 shadow-2xl relative overflow-hidden ${
        isDark ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-200"
      }`}>
        {/* Glow Effects */}
        <div className={`absolute -top-12 -left-12 w-32 h-32 rounded-full blur-2xl ${isDark ? "bg-teal-500/10" : "bg-teal-500/5"}`} />
        <div className={`absolute -bottom-12 -right-12 w-32 h-32 rounded-full blur-2xl ${isDark ? "bg-emerald-500/10" : "bg-emerald-500/5"}`} />
        
        {/* Large Beautiful Spinner */}
        <div className="relative flex justify-center">
          <div className={`w-20 h-20 rounded-full border-4 border-t-transparent animate-spin ${
            isDark ? "border-teal-500/5 border-t-teal-400" : "border-teal-500/10 border-t-teal-500"
          }`} />
          <div className="absolute inset-0 flex items-center justify-center">
            <Save className={`w-8 h-8 animate-bounce ${isDark ? "text-teal-400" : "text-teal-600"}`} />
          </div>
        </div>
        
        {/* Title */}
        <div className="space-y-2">
          <h3 className={`text-lg font-black tracking-wide animate-pulse ${isDark ? "text-slate-100" : "text-slate-800"}`}>กำลังบันทึกข้อมูลและออกบิล</h3>
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>ระบบกำลังประมวลผลข้อมูลและสร้างบิลไปยังฐานข้อมูล กรุณาอย่าปิดหน้านี้...</p>
        </div>

        {/* Progress Bar */}
        {savingProgress.total > 0 && (
          <div className="space-y-2.5">
            <div className={`flex justify-between items-center text-xs font-bold px-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              <span className={`flex items-center gap-1.5 font-extrabold ${isDark ? "text-teal-400" : "text-teal-600"}`}>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ห้อง {savingProgress.currentRoom}
              </span>
              <span className="font-mono">{savingProgress.current} / {savingProgress.total} ห้อง</span>
            </div>
            
            {/* Progress track */}
            <div className={`h-2.5 rounded-full overflow-hidden border p-[1px] ${
              isDark ? "bg-slate-950 border-slate-800/60" : "bg-slate-100 border-slate-200"
            }`}>
              <div 
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300 shadow-md shadow-teal-500/20"
                style={{ width: `${(savingProgress.current / savingProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
