"use client"

import { useRouter } from "next/navigation"
import { Gauge, Receipt, FileText, BellRing, ArrowRight, Sparkles } from "lucide-react"
import { ThemeToggle } from "@/components/ThemeToggle"
import { LanguageToggle } from "@/components/LanguageToggle"
import { useLanguage } from "@/lib/translations/LanguageProvider"

export default function LandingPage() {
  const router = useRouter()
  const { t } = useLanguage()

  return (
    <div className="relative min-h-screen bg-background text-foreground font-sans overflow-hidden transition-colors duration-300">
      {/* เอฟเฟกต์สีฟุ้งเรืองแสงแบบไดนามิก (Theme-Adaptive Glowing Ambient Orbs) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-blue-600/10 dark:bg-blue-600/20 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-[400px] h-[400px] bg-indigo-600/5 dark:bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Header ของ Landing Page */}
      <header className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-md w-9 h-9 flex items-center justify-center transition-transform duration-300 hover:scale-105">
            <img src="/icon-512x512.png" className="w-7 h-7 object-contain" alt="HorSet Logo" />
          </div>
          <span className="text-xl font-bold tracking-wide text-slate-900 dark:text-white">
            HorSet <span className="text-blue-600 dark:text-blue-500">หอเสร็จ</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <ThemeToggle />
          <button
            onClick={() => router.push("/login")}
            className="glow-btn bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 hover:border-blue-500 dark:hover:border-blue-400 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-white text-xs font-semibold py-2.5 px-5 rounded-full shadow-sm transition-all"
          >
            {t("common.login")}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-4xl mx-auto text-center px-6 pt-20 pb-16 relative z-10">
        {/* Hero Pill Badge: เปลี่ยนจากสั่นดุ๊กดิ๊กเป็นแอนิเมชันชีพจรนุ่มนวลระดับพรีเมียม (Pulse-Subtle) */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-500/10 dark:bg-blue-500/15 border border-blue-200/80 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 rounded-full text-xs font-semibold mb-6 animate-pulse-subtle">
          <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>{t("landing.hero_badge")}</span>
        </div>

        {/* Headline: แก้ไขปัญหาสีฟรุ้งฟริ้งขัดความน่าเชื่อถือทางบัญชี เป็นการใช้โทนสีแบรนด์ที่มั่นคง หรูหรา สะอาดตา */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight text-slate-900 dark:text-white">
          {t("landing.hero_title")}<br />
          {t("landing.hero_subtitle") === "with HorSet Platform" ? (
            <>with <span className="text-blue-600 dark:text-blue-500">HorSet Platform</span></>
          ) : (
            <>ด้วยระบบ <span className="text-blue-600 dark:text-blue-500">HorSet (หอเสร็จ)</span></>
          )}
        </h1>

        {/* Subtitle / Description: ปรับปรุง Contrast Ratio ในโหมดสว่างให้อ่านง่าย ชัดเจน 4.5:1+ */}
        <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-lg max-w-2xl mx-auto mt-6 leading-relaxed">
          {t("landing.hero_desc")}
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => router.push("/login")}
            className="glow-btn bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium py-3.5 px-8 rounded-full flex items-center justify-center gap-2 text-sm shadow-xl shadow-blue-600/15 dark:shadow-blue-500/10 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
          >
            {t("landing.get_started")} <ArrowRight className="w-4 h-4" />
          </button>
          <a
            href="#features"
            className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200 py-3.5 px-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors shadow-sm"
          >
            {t("landing.docs")}
          </a>
        </div>
      </section>

      {/* Section ฟีเจอร์หลัก (Features Showcase Grouped Layout) */}
      <section id="features" className="max-w-6xl mx-auto px-6 pb-28 relative z-10 scroll-mt-24">
        {/* Title Group: ลบหัวข้อตัวพิมพ์ใหญ่ตัวจิ๋วที่ดูเป็นเทมเพลต AI ทั่วไปออก เพื่อการจัดวางที่สวยงามและมีความเป็นมนุษย์ */}
        <div className="text-center max-w-2xl mx-auto mb-16 relative z-10">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            {t("landing.features_title")}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            {t("landing.features_subtitle")}
          </p>
        </div>

        {/* จัดกลุ่มเนื้อหาเป็นแบบอสมมาตร (Asymmetric & Grouped Layout) เพื่อทำลายความจำเจของเทมเพลต 4 คอลัมน์แบนๆ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ส่วนปฏิบัติการหอพักรายวัน (Daily Property Operations Column - 5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 rounded-lg text-xs font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
              Daily Property Operations
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              จัดการงานหอพักรายวันอย่างเป็นระบบ
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              สลายงานซับซ้อนให้จบได้ในไม่กี่วินาที ตั้งแต่พนักงานจดมิเตอร์ไปจนถึงการส่งบิลตรงเข้าสมาร์ทโฟนของผู้เช่าโดยตรง รวดเร็ว ถูกต้อง แม่นยำ
            </p>
            
            <div className="space-y-4 pt-2">
              {/* Card 1: Easy Mobile Metering */}
              <div className="glass-card p-6 rounded-2xl border border-slate-200/60 dark:border-slate-850 hover:border-blue-400/50 dark:hover:border-blue-500/50 transition-all group hover:scale-[1.01] shadow-sm hover:shadow-md">
                <div className="flex gap-4 items-start">
                  <div className="w-12 h-12 shrink-0 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Gauge className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      {t("landing.features_meter_title")}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t("landing.features_meter_desc")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: Direct LINE OA Delivery */}
              <div className="glass-card p-6 rounded-2xl border border-slate-200/60 dark:border-slate-850 hover:border-teal-400/50 dark:hover:border-teal-500/50 transition-all group hover:scale-[1.01] shadow-sm hover:shadow-md">
                <div className="flex gap-4 items-start">
                  <div className="w-12 h-12 shrink-0 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    <BellRing className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      {t("landing.features_line_title")}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t("landing.features_line_desc")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ส่วนการเงินและภาษีระดับพรีเมียม (Financial & Tax Compliance - 7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 rounded-lg text-xs font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse" />
              Financial & Tax Compliance
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              ระบบการเงินและภาษีครบถ้วนตามกฎหมาย
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              เหนือกว่าระบบทั่วไปด้วยโมดูลการเงินที่รองรับ QR พร้อมเพย์มาตรฐานสากล พร้อมเครื่องมือสรุปข้อมูลภาษีสรรพากร ภ.ง.ด. 90/94 มั่นใจ ตรวจสอบได้ โปร่งใส 100%
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              {/* Card 3: Invoices & PromptPay QR - Premium style with glowing border */}
              <div className="glass-card p-6 rounded-2xl border-2 border-indigo-500/15 dark:border-indigo-500/20 hover:border-indigo-500 transition-all group hover:scale-[1.02] shadow-[0_4px_20px_-3px_rgba(99,102,241,0.04)] hover:shadow-[0_8px_25px_-5px_rgba(99,102,241,0.12)] flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-bl-full pointer-events-none" />
                <div>
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors mb-5 shadow-sm">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                    {t("landing.features_qr_title")}
                    <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-medium">EMVCo</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t("landing.features_qr_desc")}
                  </p>
                </div>
                <div className="mt-8 pt-4 border-t border-slate-200/50 dark:border-slate-800/40 flex items-center justify-between text-indigo-600 dark:text-indigo-400 text-xs font-semibold group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                  <span>ระบบพร้อมเพย์อัจฉริยะ</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>

              {/* Card 4: Summarize Tax - Premium style with glowing border */}
              <div className="glass-card p-6 rounded-2xl border-2 border-violet-500/15 dark:border-violet-500/20 hover:border-violet-500 transition-all group hover:scale-[1.02] shadow-[0_4px_20px_-3px_rgba(139,92,246,0.04)] hover:shadow-[0_8px_25px_-5px_rgba(139,92,246,0.12)] flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 dark:bg-violet-500/10 rounded-bl-full pointer-events-none" />
                <div>
                  <div className="w-12 h-12 bg-violet-500/10 rounded-xl flex items-center justify-center text-violet-600 dark:text-violet-400 group-hover:bg-violet-600 group-hover:text-white transition-colors mb-5 shadow-sm">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                    {t("landing.features_tax_title")}
                    <span className="text-[10px] bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded font-medium">ภ.ง.ด. 90/94</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t("landing.features_tax_desc")}
                  </p>
                </div>
                <div className="mt-8 pt-4 border-t border-slate-200/50 dark:border-slate-800/40 flex items-center justify-between text-violet-600 dark:text-violet-400 text-xs font-semibold group-hover:text-violet-700 dark:group-hover:text-violet-300">
                  <span>ระบบสรุปแบบยื่นภาษี</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 py-12 text-center text-xs text-slate-500 dark:text-slate-600 relative z-10 bg-slate-50/50 dark:bg-transparent">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>{t("landing.footer_text")}</p>
          <div className="flex gap-4 text-slate-400 dark:text-slate-500">
            <a href="#" className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors">Privacy Policy</a>
            <span>•</span>
            <a href="#" className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
