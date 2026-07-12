"use client"

import { useEffect, useState } from "react"
import {
  ShieldCheck,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Key,
  Hash,
  Gauge,
  CalendarClock,
  Eye,
  EyeOff,
  ListChecks,
  ExternalLink,
  Landmark,
  Smartphone,
  CreditCard,
  ShieldAlert,
  Package,
  HelpCircle,
  ChevronDown,
  BookOpen
} from "lucide-react"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { getSlipOkSettings, saveSlipOkSettings, getSlipOkQuota, type SlipOkQuota } from "@/features/slipok/actions"
import { getFinanceSettings } from "@/features/finance/actions"
import { useLanguage } from "@/lib/translations/LanguageProvider"

export default function SlipOkSettingsTab() {
  const { t, locale } = useLanguage()
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [branchId, setBranchId] = useState("")
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [apiKeyPreview, setApiKeyPreview] = useState("")
  const [hasApiKey, setHasApiKey] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [checkAmount, setCheckAmount] = useState(true)
  const [checkReceiver, setCheckReceiver] = useState(true)
  const [autoDisableOnQuotaExceeded, setAutoDisableOnQuotaExceeded] = useState(true)
  const [monthlyPackageQuota, setMonthlyPackageQuota] = useState<number>(0)
  const [showApiKey, setShowApiKey] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [quota, setQuota] = useState<SlipOkQuota | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(false)
  const [quotaError, setQuotaError] = useState<string | null>(null)

  // ข้อมูลบัญชีรับเงินของหอพักนี้ (จากตั้งค่าการเงิน) โชว์คู่กับโควต้าเพื่อให้เช็คง่ายว่าตรงกับที่ตั้งไว้บน SlipOK ไหม
  const [accountName, setAccountName] = useState("")
  const [accountId, setAccountId] = useState("")
  const [accountType, setAccountType] = useState<"phone" | "national_id">("phone")

  const [showManual, setShowManual] = useState(false)
  const [openStep1, setOpenStep1] = useState(true)
  const [openStep2, setOpenStep2] = useState(true)
  const [openStep3, setOpenStep3] = useState(true)
  const [openStep4, setOpenStep4] = useState(true)

  // ดึงโควต้าล่าสุดจาก SlipOK — เรียกได้ทั้งแบบอัตโนมัติตอนโหลดหน้า/บันทึกเสร็จ และแบบกดรีเฟรชเองด้วยปุ่ม
  const handleCheckQuota = async (targetWorkspaceId?: string) => {
    const wsId = targetWorkspaceId || workspaceId
    setQuotaLoading(true)
    setQuotaError(null)
    try {
      if (isDemo) {
        await new Promise((r) => setTimeout(r, 500))
        setQuota({ quota: 87, overQuota: 0, specialQuota: 0, endDate: "2026-12-31", specialEndDate: null })
        return
      }

      if (!wsId) {
        setQuotaError(t("slipok_settings.err_no_workspace"))
        return
      }

      const res = await getSlipOkQuota(wsId)
      if (res.success && res.data) {
        setQuota(res.data)
      } else {
        setQuota(null)
        setQuotaError(res.error || t("slipok_settings.err_quota_fetch"))
      }
    } catch (err) {
      console.error("Error checking SlipOK quota:", err)
      setQuotaError(t("slipok_settings.err_quota_exception"))
    } finally {
      setQuotaLoading(false)
    }
  }

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)
      setLoadError(null)
      try {
        if (isDemo) {
          setBranchId("123456")
          setApiKeyPreview("••••demo")
          setHasApiKey(true)
          setEnabled(true)
          setMonthlyPackageQuota(100)
          setAccountName("สุรีย์ สัทธาวรกุล")
          setAccountId("0818369763")
          setAccountType("phone")
          setLoading(false)
          setTimeout(() => handleCheckQuota(), 100)
          return
        }

        const profileRes = await getCurrentUserProfileClient()
        if (!profileRes.success || !profileRes.data?.workspace_id) {
          setLoadError(t("slipok_settings.err_no_workspace"))
          setLoading(false)
          return
        }
        const wsId = profileRes.data.workspace_id
        setWorkspaceId(wsId)

        const [res, financeRes] = await Promise.all([
          getSlipOkSettings(wsId),
          getFinanceSettings(wsId)
        ])

        if (res.success && res.data) {
          setBranchId(res.data.branchId)
          setApiKeyPreview(res.data.apiKeyPreview)
          setHasApiKey(res.data.hasApiKey)
          setEnabled(res.data.enabled)
          setCheckAmount(res.data.checkAmount)
          setCheckReceiver(res.data.checkReceiver)
          setAutoDisableOnQuotaExceeded(res.data.autoDisableOnQuotaExceeded)
          setMonthlyPackageQuota(res.data.monthlyPackageQuota)

          // ถ้าเชื่อมต่อ SlipOK ไว้แล้ว ดึงโควต้าล่าสุดให้อัตโนมัติทันที ไม่ต้องรอผู้ใช้กดปุ่มเอง
          if (res.data.hasApiKey && res.data.enabled) {
            setTimeout(() => handleCheckQuota(wsId), 100)
          }
        } else {
          setLoadError(res.error || t("slipok_settings.err_load_settings"))
        }

        if (financeRes.success && financeRes.data) {
          setAccountName(financeRes.data.promptpay_name || "")
          setAccountId(financeRes.data.promptpay_id || "")
          setAccountType(financeRes.data.promptpay_type || "phone")
        }
      } catch (err) {
        console.error("Error loading SlipOK settings:", err)
        setLoadError(t("slipok_settings.err_load_finance"))
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo])

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      if (isDemo) {
        await new Promise((r) => setTimeout(r, 500))
        setSaveSuccess(true)
        setApiKeyInput("")
        return
      }

      if (!workspaceId) {
        setSaveError(t("slipok_settings.err_no_workspace"))
        return
      }
      if (!hasApiKey && !apiKeyInput.trim()) {
        setSaveError(t("slipok_settings.err_api_key_missing"))
        return
      }

      const res = await saveSlipOkSettings(
        workspaceId,
        branchId,
        apiKeyInput.trim() || null,
        enabled,
        checkAmount,
        checkReceiver,
        autoDisableOnQuotaExceeded,
        monthlyPackageQuota
      )
      if (res.success) {
        setSaveSuccess(true)
        if (apiKeyInput.trim()) {
          setHasApiKey(true)
          setApiKeyPreview(`••••${apiKeyInput.trim().slice(-4)}`)
        }
        setApiKeyInput("")
        // บันทึกเสร็จแล้วรีเฟรชโควต้าให้สดใหม่ทันที (เผื่อเปลี่ยน Branch ID/API Key มา)
        handleCheckQuota(workspaceId)
      } else {
        setSaveError(res.error || t("slipok_settings.err_save_settings"))
      }
    } catch (err) {
      console.error("Error saving SlipOK settings:", err)
      setSaveError(t("slipok_settings.err_save_exception"))
    } finally {
      setSaving(false)
    }
  }

  // % โควต้าที่ใช้ไปแล้ว คำนวณจากเพดานแพ็กเกจ/เดือนที่กรอกเอง เทียบกับโควต้าคงเหลือที่ได้จาก SlipOK
  // (SlipOK API ไม่ได้ส่งค่าเพดานทั้งหมดมาให้ ต้องให้แอดมินกรอกเองตามแพ็กเกจที่สมัครไว้)
  const percentageUsed = quota && monthlyPackageQuota > 0
    ? Math.min(100, Math.max(0, Math.round(((monthlyPackageQuota - quota.quota) / monthlyPackageQuota) * 100)))
    : null

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[40vh]">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <span>{t("slipok_settings.loading")}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 font-sans">
      
      {/* 1. Page Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 p-6 rounded-3xl border border-blue-500/20 shadow-sm backdrop-blur-md">
        <div className="flex-1">
          <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <span>{t("slipok_settings.title")}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-semibold">
            {t("slipok_settings.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {enabled && hasApiKey && (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-xs font-bold text-teal-600 dark:text-teal-400 shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t("slipok_settings.connected")}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowManual(!showManual)}
            className="px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-2xl text-xs sm:text-sm font-black flex items-center gap-2 transition-all cursor-pointer shadow-sm"
          >
            {showManual ? (
              <>
                <EyeOff className="w-4 h-4" />
                <span>{t("slipok_settings.hide_manual")}</span>
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                <span>{t("slipok_settings.show_manual")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Main Content Grid */}
      <div className={`grid grid-cols-1 ${showManual ? "lg:grid-cols-2" : "max-w-3xl mx-auto"} gap-6`}>
        
        {/* Left Column: Configuration Column */}
        <div className="space-y-6">
          
          {loadError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 text-rose-500 text-sm font-bold">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}

          {/* Card: Quota */}
          <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-900 pb-3">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Gauge className="w-5 h-5 text-blue-500" /> {t("slipok_settings.quota_title")}
              </h3>
              <button
                type="button"
                onClick={() => handleCheckQuota()}
                disabled={quotaLoading}
                className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${quotaLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* บัญชีรับเงินของหอพักนี้ (จากตั้งค่าการเงิน) */}
            {accountName && (
              <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3 shadow-sm">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
                  <Landmark className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100 truncate">{accountName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {accountType === "phone" ? (
                      <Smartphone className="w-3 h-3 text-slate-400" />
                    ) : (
                      <CreditCard className="w-3 h-3 text-slate-400" />
                    )}
                    <span className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold">
                      {t("slipok_settings.promptpay_format")
                        .replace("{type}", accountType === "phone" ? t("slipok_settings.type_phone") : t("slipok_settings.type_national_id"))
                        .replace("{id}", accountId)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {quotaError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-rose-500 text-xs sm:text-sm font-bold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{quotaError}</span>
              </div>
            )}

            {quota ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
                    <p className="text-[10px] sm:text-xs text-slate-400 font-bold mb-1">{t("slipok_settings.quota_remaining")}</p>
                    <p className="text-lg sm:text-xl font-black text-emerald-500">{quota.quota.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
                    <p className="text-[10px] sm:text-xs text-slate-400 font-bold mb-1">{t("slipok_settings.quota_exceeded")}</p>
                    <p className="text-lg sm:text-xl font-black text-rose-500">{quota.overQuota.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
                    <p className="text-[10px] sm:text-xs text-slate-400 font-bold mb-1">{t("slipok_settings.quota_special")}</p>
                    <p className="text-lg sm:text-xl font-black text-blue-500">{quota.specialQuota.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
                    <p className="text-[10px] sm:text-xs text-slate-400 font-bold mb-1 flex items-center justify-center gap-1">
                      <CalendarClock className="w-3 h-3" /> {t("slipok_settings.quota_expiry")}
                    </p>
                    <p className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-200">{quota.endDate}</p>
                  </div>
                </div>

                {percentageUsed !== null ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs sm:text-sm font-extrabold text-slate-500 dark:text-slate-400">
                      <span>{t("slipok_settings.quota_percent_used")}</span>
                      <span className={`${percentageUsed >= 85 ? "text-rose-500 animate-pulse" : "text-blue-500"} font-black`}>{percentageUsed}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-800/35">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          percentageUsed >= 90 ? "bg-rose-500" : percentageUsed >= 75 ? "bg-amber-500" : "bg-blue-600"
                        }`}
                        style={{ width: `${Math.min(100, percentageUsed)}%` }}
                      />
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold">
                      {t("slipok_settings.quota_usage_summary")
                        .replace("{used}", (monthlyPackageQuota - quota.quota).toLocaleString())
                        .replace("{total}", monthlyPackageQuota.toLocaleString())}
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] sm:text-xs text-amber-500 font-bold text-center py-1">
                    {t("slipok_settings.quota_setup_hint")}
                  </p>
                )}
              </div>
            ) : (
              !quotaError && (
                <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold text-center py-4">
                  {hasApiKey && enabled ? t("slipok_settings.quota_loading") : t("slipok_settings.quota_setup_first")}
                </p>
              )
            )}

            {/* เพดานแพ็กเกจ/เดือน */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-900 space-y-2">
              <label className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> {t("slipok_settings.package_limit_label")}
              </label>
              <input
                type="number"
                min={0}
                value={monthlyPackageQuota || ""}
                onChange={(e) => setMonthlyPackageQuota(Number(e.target.value) || 0)}
                placeholder={t("slipok_settings.package_limit_placeholder")}
                className="w-full sm:w-56 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base font-bold tracking-wide transition-all"
              />
              <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold">
                {t("slipok_settings.package_limit_desc")}
              </p>
            </div>
          </div>

          {/* Card: Branch ID + API Key */}
          <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
            <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
              <Key className="w-5 h-5 text-blue-500" /> {t("slipok_settings.api_header")}
            </h3>

            {/* Enable toggle */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm transition-all">
              <div className="space-y-0.5">
                <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">{t("slipok_settings.api_enable_label")}</h5>
                <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold leading-normal">
                  {enabled ? t("slipok_settings.api_enabled_desc") : t("slipok_settings.api_disabled_desc")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnabled((prev) => !prev)}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none ${
                  enabled ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
                } ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
                    enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" /> {t("slipok_settings.branch_id_label")}
              </label>
              <input
                type="text"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                placeholder={t("slipok_settings.branch_id_placeholder")}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base font-bold tracking-wide transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" /> {t("slipok_settings.api_key_label")}
              </label>
              {hasApiKey && !apiKeyInput && (
                <p className="text-xs text-slate-400 dark:text-slate-500 font-bold">
                  {t("slipok_settings.api_key_current_prefix")} <span className="font-mono">{apiKeyPreview}</span> {t("slipok_settings.api_key_current_suffix")}
                </p>
              )}
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={hasApiKey ? t("slipok_settings.api_key_placeholder_exists") : t("slipok_settings.api_key_placeholder_empty")}
                  className="w-full px-3.5 py-2.5 pr-11 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base font-bold tracking-wide transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* เลือกรายการที่จะให้ SlipOK ตรวจสอบ */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-900">
              <h4 className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5" /> {t("slipok_settings.verify_options_header")}
              </h4>

              <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
                <div className="space-y-0.5">
                  <h5 className="text-xs font-black text-slate-800 dark:text-slate-100">{t("slipok_settings.verify_amount_label")}</h5>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                    {t("slipok_settings.verify_amount_desc")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCheckAmount((prev) => !prev)}
                  disabled={saving}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none ${
                    checkAmount ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
                  } ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
                      checkAmount ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
                <div className="space-y-0.5">
                  <h5 className="text-xs font-black text-slate-800 dark:text-slate-100">{t("slipok_settings.verify_receiver_label")}</h5>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                    {t("slipok_settings.verify_receiver_desc")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCheckReceiver((prev) => !prev)}
                  disabled={saving}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none ${
                    checkReceiver ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
                  } ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
                      checkReceiver ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {checkReceiver && (
                <a
                  href="https://portal.slipok.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] font-bold text-blue-500 hover:text-blue-400 transition-colors pl-1"
                >
                  <ExternalLink className="w-3 h-3" /> {t("slipok_settings.verify_link_portal")}
                </a>
              )}
            </div>

            {/* ป้องกันค่าใช้จ่ายส่วนเกินโควต้า */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-900">
              <h4 className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> {t("slipok_settings.prevent_header")}
              </h4>

              <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
                <div className="space-y-0.5">
                  <h5 className="text-xs font-black text-slate-800 dark:text-slate-100">{t("slipok_settings.prevent_overrun_label")}</h5>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                    {autoDisableOnQuotaExceeded
                      ? t("slipok_settings.prevent_overrun_enabled")
                      : t("slipok_settings.prevent_overrun_disabled")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoDisableOnQuotaExceeded((prev) => !prev)}
                  disabled={saving}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none ${
                    autoDisableOnQuotaExceeded ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
                  } ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
                      autoDisableOnQuotaExceeded ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {saveError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-rose-500 text-xs sm:text-sm font-bold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{saveError}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5 text-emerald-500 text-xs sm:text-sm font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t("slipok_settings.save_success")}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-md"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? t("slipok_settings.saving") : t("slipok_settings.save_btn")}
            </button>
          </div>
        </div>

        {/* Right Column: Setup Manual Guide */}
        {showManual && (
          <div className="space-y-6">
            {/* Card: คู่มือการเชื่อมต่อ SlipOK */}
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">
                      {t("slipok_settings.guide_header")}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold mt-1">
                      {t("slipok_settings.guide_subtitle")}
                    </p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    const allOpen = openStep1 && openStep2 && openStep3 && openStep4;
                    setOpenStep1(!allOpen);
                    setOpenStep2(!allOpen);
                    setOpenStep3(!allOpen);
                    setOpenStep4(!allOpen);
                  }}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center shrink-0"
                >
                  {openStep1 && openStep2 && openStep3 && openStep4 ? t("slipok_settings.guide_collapse") : t("slipok_settings.guide_expand")}
                </button>
              </div>

              {/* Steps Accordions */}
              <div className="space-y-4 text-sm font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
                
                {/* Step 1 */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenStep1(!openStep1)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-black border border-blue-500/20">
                        1
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("slipok_settings.guide_step1_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openStep1 ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openStep1 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3 animate-fadeIn">
                      <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-300 font-semibold">
                        <li>
                          {t("slipok_settings.guide_step1_line1")} <a href="https://line.me/R/ti/p/%40slipok" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 font-black underline inline-flex items-center gap-1">@slipok <ExternalLink className="w-3.5 h-3.5 inline" /></a>
                        </li>
                        <li>{t("slipok_settings.guide_step1_line2")}</li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Step 2 */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenStep2(!openStep2)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-black border border-blue-500/20">
                        2
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("slipok_settings.guide_step2_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openStep2 ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openStep2 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-2.5 leading-relaxed animate-fadeIn">
                      <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-300 font-semibold">
                        <li>{t("slipok_settings.guide_step2_line1")}</li>
                        <li>{t("slipok_settings.guide_step2_line2")}</li>
                      </ul>
                      <p className="bg-slate-100 dark:bg-slate-950 p-3 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 mt-2.5">
                        📌 {t("slipok_settings.guide_step2_note")}
                      </p>
                    </div>
                  )}
                </div>

                {/* Step 3 */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenStep3(!openStep3)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-black border border-blue-500/20">
                        3
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("slipok_settings.guide_step3_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openStep3 ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openStep3 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3 leading-relaxed animate-fadeIn">
                      <p className="mb-2 font-semibold">{t("slipok_settings.guide_step3_desc")}</p>
                      <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-300 font-semibold">
                        <li>{t("slipok_settings.guide_step3_item1")}</li>
                        <li>{t("slipok_settings.guide_step3_item2")}</li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Step 4 */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenStep4(!openStep4)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-black border border-blue-500/20">
                        4
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("slipok_settings.guide_step4_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openStep4 ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openStep4 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3 leading-relaxed animate-fadeIn">
                      <p className="font-semibold">{t("slipok_settings.guide_step4_desc")}</p>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
