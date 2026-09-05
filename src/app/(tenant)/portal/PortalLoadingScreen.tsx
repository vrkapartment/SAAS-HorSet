"use client"

import { Building } from "lucide-react"
import { useLanguage } from "@/lib/translations/LanguageProvider"

/**
 * จอโหลดของพอร์ทัลผู้เช่า
 *
 * แยกเป็นคอมโพเนนต์เพราะถูกใช้สองที่: ระหว่างรอข้อมูลจาก PortalDataProvider และเป็น fallback
 * ของ Suspense (หน้าใช้ useSearchParams จึงต้องมี boundary) — ถ้า fallback ไม่เหมือนกัน
 * ผู้เช่าจะเห็นจอเปล่าแวบหนึ่งตอน SSR ก่อนจะเปลี่ยนเป็นจอโหลดจริง
 *
 * จัดทรงให้ตรงกับจอโหลดของหน้า /tenant-register ที่พาผู้เช่ามาที่นี่ตอนกดปุ่มใน rich menu
 * (กรอบไอคอน + หัวข้อ + คำอธิบาย ตำแหน่งเดียวกัน) เพื่อให้สองจอต่อกันแล้วไม่กระตุก
 */
export default function PortalLoadingScreen() {
  const { t } = useLanguage()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 font-sans flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[260px] h-[260px] bg-blue-500/10 rounded-full blur-[90px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <div className="glass-panel border border-slate-200/60 dark:border-slate-900/60 rounded-3xl p-8 flex flex-col items-center gap-6 text-center">
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-slate-300 dark:border-slate-900 border-t-emerald-500 animate-spin" />
            <Building className="absolute w-6 h-6 text-emerald-500" />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold tracking-wide text-slate-900 dark:text-slate-100">
              {t("tenant_portal.loading_bill")}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t("tenant_portal.loading_wait")}
            </p>
          </div>

          <div className="text-[10px] text-slate-500 tracking-wider uppercase border border-slate-300/60 dark:border-slate-900/60 rounded-full px-3 py-1 bg-slate-100/40 dark:bg-slate-950/40">
            Secure Connection • SAAS HorSet
          </div>
        </div>
      </div>
    </div>
  )
}
