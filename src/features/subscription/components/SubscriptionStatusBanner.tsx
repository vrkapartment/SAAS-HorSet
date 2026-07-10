"use client"

import { AlertTriangle, Clock, Lock } from "lucide-react"
import { useWorkspaceSubscription } from "@/features/subscription/hooks/useWorkspaceSubscription"

interface SubscriptionStatusBannerProps {
  workspaceId: string
  onUpgradeClick?: () => void
}

function getDaysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diffMs = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
}

/**
 * Banner แจ้งสถานะ subscription ของ workspace ปัจจุบัน
 * แสดงเฉพาะเมื่อจำเป็น (trial ใกล้หมด / past_due / read_only) เพื่อกระตุ้นให้อัปเกรดแผน
 * ไม่บล็อก UI อื่น — ถ้าโหลดไม่สำเร็จหรือกำลังโหลดอยู่ จะไม่แสดงอะไรเลย (fail silently)
 */
export default function SubscriptionStatusBanner({ workspaceId, onUpgradeClick }: SubscriptionStatusBannerProps) {
  const { subscription, loading, error } = useWorkspaceSubscription(workspaceId)

  if (loading || error || !subscription) return null

  // สถานะปกติ ไม่ต้องแจ้งอะไร
  if (subscription.status === "active") return null

  if (subscription.status === "cancelled") {
    return (
      <div className="w-full mb-4 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400">
        หอพักนี้ยกเลิกการใช้งานระบบแล้ว กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดใช้งานอีกครั้ง
      </div>
    )
  }

  if (subscription.status === "trial") {
    const remaining = getDaysRemaining(subscription.trialEndsAt)
    return (
      <div className="w-full mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-xs sm:text-sm font-bold text-blue-900 dark:text-blue-200 leading-relaxed">
            {remaining !== null && remaining >= 0
              ? `คุณกำลังทดลองใช้งานฟรี เหลืออีก ${remaining} วัน`
              : "ระยะเวลาทดลองใช้งานฟรีของคุณใกล้สิ้นสุดแล้ว"}
            <span className="block sm:inline font-medium text-blue-700/80 dark:text-blue-300/70 sm:ml-1">
              อัปเกรดแผนตอนนี้เพื่อใช้งานต่อเนื่องไม่มีสะดุด
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onUpgradeClick}
          className="shrink-0 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer whitespace-nowrap"
        >
          อัปเกรดแผน
        </button>
      </div>
    )
  }

  if (subscription.status === "past_due") {
    return (
      <div className="w-full mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-amber-300 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200 leading-relaxed">
            ยังไม่ได้รับการชำระเงินค่าบริการรอบล่าสุด
            <span className="block sm:inline font-medium text-amber-700/80 dark:text-amber-300/70 sm:ml-1">
              กรุณาชำระเงินก่อนถูกจำกัดสิทธิ์การใช้งานเป็นแบบดูข้อมูลได้อย่างเดียว
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onUpgradeClick}
          className="shrink-0 h-9 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer whitespace-nowrap"
        >
          ชำระเงิน / อัปเกรดแผน
        </button>
      </div>
    )
  }

  if (subscription.status === "read_only") {
    return (
      <div className="w-full mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border-2 border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 shadow-md shadow-rose-500/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-600/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 animate-pulse">
            <Lock className="w-4 h-4" />
          </div>
          <p className="text-xs sm:text-sm font-black text-rose-900 dark:text-rose-200 leading-relaxed">
            บัญชีของคุณถูกจำกัดสิทธิ์เป็นโหมด &quot;ดูข้อมูลได้อย่างเดียว&quot;
            <span className="block sm:inline font-bold text-rose-700 dark:text-rose-300 sm:ml-1">
              กรุณาชำระค่าบริการเพื่อกลับมาใช้งานได้ตามปกติ
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onUpgradeClick}
          className="shrink-0 h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer whitespace-nowrap"
        >
          ชำระเงินตอนนี้
        </button>
      </div>
    )
  }

  return null
}