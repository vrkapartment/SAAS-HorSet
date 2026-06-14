"use client"

import { useRouter } from "next/navigation"
import { Building, Shield, Gauge, Receipt, FileText, BellRing, ArrowRight, Sparkles } from "lucide-react"
import { ThemeToggle } from "@/components/ThemeToggle"
import { LanguageToggle } from "@/components/LanguageToggle"
import { useLanguage } from "@/lib/translations/LanguageProvider"

export default function LandingPage() {
  const router = useRouter()
  const { t } = useLanguage()

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* เอฟเฟกต์สีฟุ้งเรืองแสง */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-blue-600/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-[400px] h-[400px] bg-indigo-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Header ของ Landing Page */}
      <header className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-600 rounded-xl">
            <Building className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-wide">HorSet <span className="text-blue-500">หอเสร็จ</span></span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <ThemeToggle />
          <button
            onClick={() => router.push("/login")}
            className="glow-btn bg-slate-900 border border-slate-800 hover:border-blue-500 text-blue-400 hover:text-white text-xs font-semibold py-2.5 px-5 rounded-full transition-all"
          >
            {t("common.login")}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-4xl mx-auto text-center px-6 pt-20 pb-16 relative z-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full text-xs font-semibold mb-6 animate-bounce">
          <Sparkles className="w-3.5 h-3.5" /> {t("common.profile_settings") ? "บริหารจัดการหอพักสำหรับคนไทยอย่างมืออาชีพ" : "Professional Thai Apartment Management"}
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight bg-clip-text text-transparent bg-gradient-to-b from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-400">
          {t("landing.hero_title")}<br />
          {t("landing.hero_subtitle") === "with HorSet Platform" ? (
            <>with <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 dark:from-blue-500 dark:via-indigo-400 dark:to-violet-400">HorSet Platform</span></>
          ) : (
            <>ด้วยระบบ <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 dark:from-blue-500 dark:via-indigo-400 dark:to-violet-400">HorSet (หอเสร็จ)</span></>
          )}
        </h1>
        <p className="text-slate-400 text-sm sm:text-lg max-w-2xl mx-auto mt-6 leading-relaxed">
          {t("landing.hero_desc")}
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => router.push("/login")}
            className="glow-btn bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium py-3.5 px-8 rounded-full flex items-center justify-center gap-2 text-sm shadow-xl shadow-blue-600/20 hover:scale-105 transition-transform"
          >
            {t("landing.get_started")} <ArrowRight className="w-4 h-4" />
          </button>
          <a
            href="https://github.com"
            target="_blank"
            className="bg-slate-900/60 border border-slate-800 hover:bg-slate-800/60 py-3.5 px-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors"
          >
            {t("landing.docs")}
          </a>
        </div>
      </section>

      {/* Grid ฟีเจอร์หลัก (Features Showcases) */}
      <section className="max-w-6xl mx-auto px-6 pb-28 relative z-10">
        <h2 className="text-center text-xs text-slate-500 font-bold uppercase tracking-widest mb-12">ความสามารถหลักของระบบ</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-900/80 hover:border-slate-800 transition-all group hover:scale-[1.02]">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 mb-5 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Gauge className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold mb-2">จดมิเตอร์ง่ายบนมือถือ</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              พนักงานจดน้ำ/ไฟในโทรศัพท์ขณะเดินตรวจหน้าห้องพัก ป้องกันการลืมหรือจดเลขซ้ำ พร้อมระบบประวัติย้อนหลัง
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-900/80 hover:border-slate-800 transition-all group hover:scale-[1.02]">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 mb-5 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Receipt className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold mb-2">คำนวณบิล & พร้อมเพย์ QR</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              ออกใบแจ้งหนี้เป็น PDF สวยงาม พร้อมแนบ EMVCo QR Code สแกนผ่านแอปธนาคารมีราคาระบุยอดโอนให้อัตโนมัติ
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-900/80 hover:border-slate-800 transition-all group hover:scale-[1.02]">
            <div className="w-12 h-12 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-400 mb-5 group-hover:bg-teal-600 group-hover:text-white transition-colors">
              <BellRing className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold mb-2">บิลส่งตรงเข้า LINE OA</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              ส่งลิงก์ดูใบแจ้งหนี้และข้อมูลอัปโหลดสลิปตรงไปยังแอปพลิเคชัน LINE ของผู้เช่าทันที รวดเร็ว สะดวก ไม่กลัวสูญหาย
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-900/80 hover:border-slate-800 transition-all group hover:scale-[1.02]">
            <div className="w-12 h-12 bg-violet-500/10 rounded-xl flex items-center justify-center text-violet-400 mb-5 group-hover:bg-violet-600 group-hover:text-white transition-colors">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold mb-2">คำนวณและสรุปข้อมูลภาษี</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              รวบรวมรายได้และค่าใช้จ่ายของหอพัก คัดแยกประเภทรายได้ ม. 40(5) และ ม. 40(8) สำหรับยื่น ภ.ง.ด. 90/94 สรรพากร
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8 text-center text-xs text-slate-600">
        <p>© 2026 HorSet. All rights reserved. พัฒนาขึ้นสำหรับระบบหอพัก/อพาร์ทเมนท์ในไทย</p>
      </footer>
    </div>
  )
}
