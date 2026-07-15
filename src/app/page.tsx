"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Gauge,
  Receipt,
  FileText,
  BellRing,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Lock,
  KeyRound,
  FileCheck2,
  ScrollText,
  Smartphone,
  Monitor,
  QrCode,
  MessageCircleMore,
  ChevronDown,
  Users,
  Home,
  Clock,
  Coins,
  Plus,
  Star,
  Check,
  X
} from "lucide-react"
import { ThemeToggle } from "@/components/ThemeToggle"
import { LanguageToggle } from "@/components/LanguageToggle"
import { useLanguage } from "@/lib/translations/LanguageProvider"

type BillingCycle = "monthly" | "yearly"

type PricingPlan = {
  code: "starter" | "pro" | "business"
  name: string
  priceMonthly: number
  priceYearly: number | null
  maxRooms: number | null
  maxStaff: number | null
  maxBuildings: number | null
  lineNotify: boolean
  taxExport: boolean
  slipokAutoVerify: boolean
  popular?: boolean
}

// สะท้อนข้อมูลจริงจากตาราง public.saas_plans — แก้ราคาที่นี่ให้ตรงกับ Supabase เสมอถ้ามีการปรับแพ็กเกจ
const PRICING_PLANS: PricingPlan[] = [
  {
    code: "starter",
    name: "Starter",
    priceMonthly: 279,
    priceYearly: 2790,
    maxRooms: 30,
    maxStaff: 1,
    maxBuildings: 1,
    lineNotify: true,
    taxExport: false,
    slipokAutoVerify: false
  },
  {
    code: "pro",
    name: "Pro",
    priceMonthly: 579,
    priceYearly: 5790,
    maxRooms: 100,
    maxStaff: 5,
    maxBuildings: 1,
    lineNotify: true,
    taxExport: true,
    slipokAutoVerify: true,
    popular: true
  },
  {
    code: "business",
    name: "Business",
    priceMonthly: 1479,
    priceYearly: null,
    maxRooms: 500,
    maxStaff: null,
    maxBuildings: null,
    lineNotify: true,
    taxExport: true,
    slipokAutoVerify: true
  }
]

const FAQ_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6"]

// กรอบอุปกรณ์จำลอง (Desktop/Tablet/Mobile) ใช้แสดงว่า UI จริงปรับ layout ตามอุปกรณ์ได้ ไม่ใช่แค่การ์ดเฉย ๆ
function DesktopFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full">
      <div className="rounded-t-xl border-[6px] border-b-0 border-slate-800 dark:border-slate-700 bg-slate-800 dark:bg-slate-700 overflow-hidden shadow-xl">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-850">
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
        <div className="bg-white dark:bg-slate-900">{children}</div>
      </div>
      <div className="mx-auto h-3 w-10 bg-slate-800 dark:bg-slate-700" />
      <div className="mx-auto h-1.5 w-28 bg-slate-700 dark:bg-slate-600 rounded-full" />
    </div>
  )
}

function TabletFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full rounded-[1.5rem] border-[10px] border-slate-800 dark:border-slate-700 bg-slate-800 dark:bg-slate-700 shadow-xl relative">
      <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-slate-500" />
      <div className="rounded-[0.5rem] bg-white dark:bg-slate-900 overflow-hidden">{children}</div>
    </div>
  )
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[220px] rounded-[2.25rem] border-[8px] border-slate-800 dark:border-slate-700 bg-slate-800 dark:bg-slate-700 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 bg-slate-800 dark:bg-slate-700 rounded-b-lg z-10" />
      <div className="rounded-[1.6rem] bg-white dark:bg-slate-900 overflow-hidden">
        {children}
        <div className="flex justify-center py-2">
          <span className="w-14 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly")
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const goToRegister = () => router.push("/register")

  const navLinks = [
    { key: "nav_features", href: "#features" },
    { key: "nav_devices", href: "#devices" },
    { key: "nav_pricing", href: "#pricing" },
    { key: "nav_security", href: "#security" },
    { key: "nav_faq", href: "#faq" }
  ]

  return (
    <div className="relative min-h-screen bg-background text-foreground font-sans overflow-hidden transition-colors duration-300">
      {/* เอฟเฟกต์สีฟุ้งเรืองแสงแบบไดนามิก (Theme-Adaptive Glowing Ambient Orbs) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-blue-600/10 dark:bg-blue-600/20 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-[400px] h-[400px] bg-indigo-600/5 dark:bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Header ของ Landing Page */}
      <header className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2 shrink-0">
          <div className="p-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-md w-9 h-9 flex items-center justify-center transition-transform duration-300 hover:scale-105">
            <img src="/icon-512x512.png" className="w-7 h-7 object-contain" alt="HorSet Logo" />
          </div>
          <span className="text-xl font-bold tracking-wide text-slate-900 dark:text-white">
            HorSet <span className="text-blue-600 dark:text-blue-500">หอเสร็จ</span>
          </span>
        </div>

        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
          {navLinks.map((link) => (
            <a key={link.key} href={link.href} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t(`landing.${link.key}`)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <LanguageToggle />
          <ThemeToggle />
          <button
            onClick={() => router.push("/login")}
            className="hidden sm:inline-flex glow-btn bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 hover:border-blue-500 dark:hover:border-blue-400 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-white text-xs font-semibold py-2.5 px-5 rounded-full shadow-sm transition-all"
          >
            {t("common.login")}
          </button>
          <button
            onClick={goToRegister}
            className="glow-btn bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-xs font-semibold py-2.5 px-5 rounded-full shadow-md transition-all"
          >
            {t("landing.get_started")}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-4xl mx-auto text-center px-6 pt-16 pb-10 relative z-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-500/10 dark:bg-blue-500/15 border border-blue-200/80 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 rounded-full text-xs font-semibold mb-6 animate-pulse-subtle">
          <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>{t("landing.hero_badge")}</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight text-slate-900 dark:text-white">
          {t("landing.hero_title")}<br />
          {t("landing.hero_subtitle") === "with HorSet Platform" ? (
            <>with <span className="text-blue-600 dark:text-blue-500">HorSet Platform</span></>
          ) : (
            <>ด้วยระบบ <span className="text-blue-600 dark:text-blue-500">HorSet (หอเสร็จ)</span></>
          )}
        </h1>

        <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-lg max-w-2xl mx-auto mt-6 leading-relaxed">
          {t("landing.hero_desc")}
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={goToRegister}
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

      {/* Hero UI Mockup: recreated 1:1 from the real /dashboard component (same stat cards, colors, quick actions) */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24 relative z-10">
        <div className="rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl shadow-slate-900/10 dark:shadow-black/40 overflow-hidden">
          {/* Fake browser chrome bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-3 text-[11px] font-mono text-slate-400 dark:text-slate-500">app.horset.co/dashboard</span>
          </div>

          <div className="p-4 sm:p-8">
            {/* Header แดชบอร์ดจำลอง */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  {t("dashboard.welcome_back").replace("{name}", "แอดมินสมชาย")}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {t("dashboard.overview_desc").replace("{workspace}", "แสนสุข แมนชั่น")}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                {t("dashboard.secure_cloud_connected")}
              </div>
            </div>

            {/* 4 stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
              {[
                { title: t("dashboard.stat_all_rooms_title"), value: "24 ห้อง", icon: Home, color: "text-blue-500 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40" },
                { title: t("dashboard.stat_vacant_title"), value: "2 ห้อง", icon: Home, color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
                { title: t("dashboard.stat_occupied_title"), value: "22 ห้อง", icon: Users, color: "text-teal-500 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/40" },
                { title: t("dashboard.stat_unpaid_title"), value: "3 บิล", icon: Clock, color: "text-rose-500 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/40" }
              ].map((stat) => {
                const Icon = stat.icon
                return (
                  <div key={stat.title} className="bg-white dark:bg-slate-850 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">{stat.title}</span>
                        <h4 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tracking-tight">{stat.value}</h4>
                      </div>
                      <div className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl shrink-0 ${stat.bg} ${stat.color}`}>
                        <Icon className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* รายรับ / ค้างชำระ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-3 sm:mt-4">
              <div className="bg-emerald-50/30 dark:bg-emerald-950/10 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-emerald-100 dark:border-emerald-900/20">
                <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider block">{t("dashboard.revenue_title")}</span>
                <h4 className="text-xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight mt-1">
                  118,250 <span className="text-[10px] sm:text-xs font-bold text-emerald-500/80">{t("daily_bills.baht_unit")}</span>
                </h4>
                <div className="w-full bg-emerald-200/40 dark:bg-emerald-900/30 rounded-full h-1.5 mt-2.5 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: "87.5%" }} />
                </div>
              </div>
              <div className="bg-rose-50/30 dark:bg-rose-950/10 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-rose-100 dark:border-rose-900/20">
                <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider block">{t("dashboard.unpaid_title")}</span>
                <h4 className="text-xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 font-mono tracking-tight mt-1">
                  16,800 <span className="text-[10px] sm:text-xs font-bold text-rose-500/80">{t("daily_bills.baht_unit")}</span>
                </h4>
                <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs text-rose-600 dark:text-rose-400 font-bold mt-2.5">
                  <Clock className="w-3 h-3" /> 3 {t("dashboard.stat_unpaid_title")}
                </span>
              </div>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mt-3 sm:mt-4">
              {[
                { label: t("dashboard.action_meter"), icon: Receipt, bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
                { label: t("dashboard.action_bill"), icon: Plus, bg: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
                { label: t("dashboard.action_tenants"), icon: Users, bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
                { label: t("dashboard.action_expense"), icon: Coins, bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
              ].map((act) => {
                const Icon = act.icon
                return (
                  <div key={act.label} className={`rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 text-center ${act.bg}`}>
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px] font-bold leading-tight text-slate-700 dark:text-slate-200">{act.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Section ฟีเจอร์หลัก (Features Showcase Grouped Layout) */}
      <section id="features" className="max-w-6xl mx-auto px-6 pb-24 relative z-10 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto mb-16 relative z-10">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            {t("landing.features_title")}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            {t("landing.features_subtitle")}
          </p>
        </div>

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

            {/* แถวเสริม: RBAC/2FA + พอร์ทัลผู้เช่า */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div className="glass-card p-6 rounded-2xl border border-slate-200/60 dark:border-slate-850 hover:border-emerald-400/50 dark:hover:border-emerald-500/50 transition-all group hover:scale-[1.01] shadow-sm hover:shadow-md">
                <div className="flex gap-4 items-start">
                  <div className="w-12 h-12 shrink-0 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      {t("landing.features_security_title")}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t("landing.features_security_desc")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="glass-card p-6 rounded-2xl border border-slate-200/60 dark:border-slate-850 hover:border-amber-400/50 dark:hover:border-amber-500/50 transition-all group hover:scale-[1.01] shadow-sm hover:shadow-md">
                <div className="flex gap-4 items-start">
                  <div className="w-12 h-12 shrink-0 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      {t("landing.features_portal_title")}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t("landing.features_portal_desc")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section: ใช้งานได้ทุกอุปกรณ์ */}
      <section id="devices" className="max-w-6xl mx-auto px-6 pb-24 relative z-10 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            {t("landing.devices_title")}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            {t("landing.devices_subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6 items-end">
          {/* Desktop: Data Table View */}
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Monitor className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-wide">{t("landing.devices_desktop_label")}</span>
            </div>
            <DesktopFrame>
              <div className="p-3">
                <div className="grid grid-cols-4 gap-2 text-[8px] font-bold text-slate-400 dark:text-slate-500 px-1.5 pb-1.5 mb-1 border-b border-slate-100 dark:border-slate-800 uppercase tracking-wide">
                  <span>ห้อง</span>
                  <span>ผู้เช่า</span>
                  <span className="text-right">ยอดบิล</span>
                  <span className="text-right">สถานะ</span>
                </div>
                {[
                  { room: "101", tenant: "คุณวิภาวี", amount: "5,400", status: "ชำระแล้ว", color: "text-emerald-600 dark:text-emerald-400" },
                  { room: "105", tenant: "คุณณัฐพล", amount: "5,800", status: "รอตรวจสอบ", color: "text-amber-600 dark:text-amber-400" },
                  { room: "302", tenant: "คุณรภัสสร", amount: "5,600", status: "ค้างชำระ", color: "text-rose-600 dark:text-rose-400" }
                ].map((row) => (
                  <div key={row.room} className="grid grid-cols-4 gap-2 text-[9px] px-1.5 py-1.5 items-center odd:bg-slate-50/70 dark:odd:bg-slate-850/60 rounded-md">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{row.room}</span>
                    <span className="text-slate-500 dark:text-slate-400 truncate">{row.tenant}</span>
                    <span className="text-right font-mono text-slate-600 dark:text-slate-300">{row.amount}</span>
                    <span className={`text-right font-bold ${row.color}`}>{row.status}</span>
                  </div>
                ))}
              </div>
            </DesktopFrame>
          </div>

          {/* Staff: on-site metering, landscape tablet */}
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Gauge className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-wide">{t("landing.devices_staff_label")}</span>
            </div>
            <TabletFrame>
              <div className="p-4">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-2.5">ห้อง 203 · มิเตอร์ไฟฟ้า</div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-850 px-3 py-2">
                    <span className="text-[8px] text-slate-400 block">เลขก่อนหน้า</span>
                    <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">1,204</span>
                  </div>
                  <div className="rounded-lg bg-teal-50 dark:bg-teal-950/40 px-3 py-2 border border-teal-200/60 dark:border-teal-900/40">
                    <span className="text-[8px] text-teal-500 block">เลขปัจจุบัน</span>
                    <span className="text-sm font-mono font-bold text-teal-700 dark:text-teal-400">1,257</span>
                  </div>
                </div>
                <div className="mt-2.5 text-center bg-teal-600 text-white text-[11px] font-bold py-1.5 rounded-lg">บันทึกมิเตอร์</div>
              </div>
            </TabletFrame>
          </div>

          {/* Tenant: mobile portal */}
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Smartphone className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-wide">{t("landing.devices_mobile_label")}</span>
            </div>
            <PhoneFrame>
              <div className="p-4 pt-6 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-200">บิลเดือน มิ.ย. 69</span>
                  <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">5,800 ฿</span>
                </div>
                <div className="mx-auto w-20 h-20 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center">
                  <QrCode className="w-12 h-12 text-white dark:text-slate-900" />
                </div>
                <div className="w-full text-center bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg">แนบสลิปโอนเงิน</div>
              </div>
            </PhoneFrame>
          </div>
        </div>

        {/* Highlight: LINE payment flow */}
        <div className="mt-14 glass-card rounded-3xl border border-slate-200/60 dark:border-slate-850 p-6 sm:p-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
              {t("landing.devices_highlight_title")}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
              {t("landing.devices_highlight_desc")}
            </p>
            <ul className="space-y-2.5">
              {[t("landing.devices_bullet_1"), t("landing.devices_bullet_2"), t("landing.devices_bullet_3")].map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                  <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <PhoneFrame>
            <div className="p-4 pt-6 space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <MessageCircleMore className="w-4 h-4 text-emerald-500" /> HorSet LINE OA
              </div>
              <div className="bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-200/60 dark:border-emerald-900/40 rounded-2xl rounded-tl-sm p-3 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                บิลค่าเช่าห้อง 101 เดือน มิ.ย. 2569 พร้อมชำระแล้ว ยอด 5,400 บาท สแกน QR ด้านล่างเพื่อโอนได้ทันที
              </div>
              <div className="mx-auto w-24 h-24 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center">
                <QrCode className="w-16 h-16 text-white dark:text-slate-900" />
              </div>
              <div className="w-full text-center bg-emerald-600 text-white text-xs font-bold py-2 rounded-lg">แนบสลิปการโอนเงิน</div>
            </div>
          </PhoneFrame>
        </div>
      </section>

      {/* Section: 3-Step Onboarding */}
      <section className="max-w-5xl mx-auto px-6 pb-24 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            {t("landing.process_title")}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            {t("landing.process_subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">
          <div className="hidden sm:block absolute top-6 left-[16.6%] right-[16.6%] h-px bg-slate-200 dark:bg-slate-800" />
          {[
            { title: t("landing.process_step1_title"), desc: t("landing.process_step1_desc") },
            { title: t("landing.process_step2_title"), desc: t("landing.process_step2_desc") },
            { title: t("landing.process_step3_title"), desc: t("landing.process_step3_desc") }
          ].map((step, idx) => (
            <div key={step.title} className="relative text-center sm:text-left">
              <div className="relative z-10 w-12 h-12 rounded-full bg-blue-600 text-white font-black text-lg flex items-center justify-center mx-auto sm:mx-0 shadow-md shadow-blue-600/20">
                {idx + 1}
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mt-4">{step.title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section: Trust & Security (แทนที่ Testimonials) */}
      <section id="security" className="max-w-6xl mx-auto px-6 pb-24 relative z-10 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            {t("landing.trust_title")}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            {t("landing.trust_subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {[
            { icon: Lock, title: t("landing.trust_rls_title"), desc: t("landing.trust_rls_desc"), color: "text-blue-600 dark:text-blue-400 bg-blue-500/10" },
            { icon: KeyRound, title: t("landing.trust_2fa_title"), desc: t("landing.trust_2fa_desc"), color: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10" },
            { icon: FileCheck2, title: t("landing.trust_pdpa_title"), desc: t("landing.trust_pdpa_desc"), color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" },
            { icon: ScrollText, title: t("landing.trust_tax_title"), desc: t("landing.trust_tax_desc"), color: "text-violet-600 dark:text-violet-400 bg-violet-500/10" }
          ].map((badge) => {
            const Icon = badge.icon
            return (
              <div key={badge.title} className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-850 rounded-2xl p-5 sm:p-6 shadow-sm">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${badge.color}`}>
                  <Icon className="w-5.5 h-5.5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1.5">{badge.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{badge.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Section: Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 pb-24 relative z-10 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            {t("landing.pricing_title")}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            {t("landing.pricing_subtitle")}
          </p>
        </div>

        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-slate-100 dark:bg-slate-850 p-1 rounded-full">
            {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => (
              <button
                key={cycle}
                onClick={() => setBillingCycle(cycle)}
                className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                  billingCycle === cycle
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {cycle === "monthly" ? t("landing.pricing_toggle_monthly") : t("landing.pricing_toggle_yearly")}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PRICING_PLANS.map((plan) => {
            const showYearly = billingCycle === "yearly" && plan.priceYearly !== null
            const price = showYearly ? plan.priceYearly! : plan.priceMonthly
            const saveAmount = plan.priceYearly !== null ? plan.priceMonthly * 12 - plan.priceYearly : 0

            const featureRows: { label: string; included: boolean }[] = [
              {
                label: plan.maxRooms !== null ? t("landing.pricing_feature_rooms").replace("{n}", String(plan.maxRooms)) : t("landing.pricing_feature_rooms_unlimited"),
                included: true
              },
              {
                label: plan.maxStaff !== null ? t("landing.pricing_feature_staff").replace("{n}", String(plan.maxStaff)) : t("landing.pricing_feature_staff_unlimited"),
                included: true
              },
              {
                label: plan.maxBuildings !== null ? t("landing.pricing_feature_buildings").replace("{n}", String(plan.maxBuildings)) : t("landing.pricing_feature_buildings_unlimited"),
                included: true
              },
              { label: plan.lineNotify ? t("landing.pricing_feature_line") : t("landing.pricing_feature_line_no"), included: plan.lineNotify },
              { label: plan.taxExport ? t("landing.pricing_feature_tax") : t("landing.pricing_feature_tax_no"), included: plan.taxExport },
              { label: plan.slipokAutoVerify ? t("landing.pricing_feature_slipok") : t("landing.pricing_feature_slipok_no"), included: plan.slipokAutoVerify }
            ]

            return (
              <div
                key={plan.code}
                className={`relative rounded-2xl p-6 sm:p-7 bg-white dark:bg-slate-900 border shadow-sm flex flex-col h-full ${
                  plan.popular
                    ? "border-2 border-blue-500 shadow-lg shadow-blue-600/10 md:-translate-y-2"
                    : "border-slate-200/60 dark:border-slate-850"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md">
                    <Star className="w-3 h-3 fill-current" /> {t("landing.pricing_most_popular")}
                  </span>
                )}

                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5 leading-relaxed">
                  {t(`landing.pricing_${plan.code}_desc`)}
                </p>

                <div className="mb-2">
                  <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white font-mono">
                    {price.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1.5">
                    {showYearly ? t("landing.pricing_per_year") : t("landing.pricing_per_month")}
                  </span>
                </div>

                <div className="h-5 mb-5">
                  {billingCycle === "yearly" && (
                    plan.priceYearly !== null ? (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        {t("landing.pricing_yearly_save")} {saveAmount.toLocaleString()} {t("daily_bills.baht_unit")}/ปี
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">{t("landing.pricing_yearly_unavailable")}</span>
                    )
                  )}
                </div>

                <button
                  onClick={goToRegister}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all mb-6 ${
                    plan.popular
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                      : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {t("landing.pricing_cta")}
                </button>

                <ul className="space-y-3 mt-auto">
                  {featureRows.map((row) => (
                    <li key={row.label} className="flex items-start gap-2.5 text-xs">
                      {row.included ? (
                        <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-slate-300 dark:text-slate-700 mt-0.5 shrink-0" />
                      )}
                      <span className={row.included ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-600"}>
                        {row.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* Section: FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 pb-24 relative z-10 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            {t("landing.faq_title")}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            {t("landing.faq_subtitle")}
          </p>
        </div>

        <div className="space-y-3">
          {FAQ_KEYS.map((key, idx) => {
            const isOpen = openFaq === idx
            return (
              <div key={key} className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-850 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
                >
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{t(`landing.faq_${key}`)}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t(`landing.faq_a${key.replace("q", "")}`)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-5xl mx-auto px-6 pb-24 relative z-10">
        <div className="rounded-3xl bg-blue-600 dark:bg-blue-600/90 px-6 sm:px-12 py-12 sm:py-16 text-center shadow-xl shadow-blue-600/20 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-56 h-56 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-14 -left-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight relative z-10">
            {t("landing.final_cta_title")}
          </h2>
          <p className="text-sm sm:text-base text-blue-100 max-w-xl mx-auto mt-4 relative z-10">
            {t("landing.final_cta_desc")}
          </p>
          <button
            onClick={goToRegister}
            className="mt-8 inline-flex items-center gap-2 bg-white hover:bg-blue-50 text-blue-700 font-bold py-3.5 px-8 rounded-full text-sm shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative z-10"
          >
            {t("landing.final_cta_button")} <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-[11px] text-blue-100/80 mt-4 relative z-10">{t("landing.final_cta_note")}</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 py-12 text-center text-xs text-slate-500 dark:text-slate-600 relative z-10 bg-slate-50/50 dark:bg-transparent">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>{t("landing.footer_text")}</p>
          <div className="flex gap-4 text-slate-400 dark:text-slate-500">
            <a href="#" className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors">{t("landing.footer_privacy")}</a>
            <span>•</span>
            <a href="#" className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors">{t("landing.footer_terms")}</a>
            <span>•</span>
            <a href="#" className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors">{t("landing.footer_contact")}</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
