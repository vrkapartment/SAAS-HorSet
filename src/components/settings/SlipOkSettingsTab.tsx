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
  ExternalLink
} from "lucide-react"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { getSlipOkSettings, saveSlipOkSettings, getSlipOkQuota, type SlipOkQuota } from "@/features/slipok/actions"

export default function SlipOkSettingsTab() {
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
  const [showApiKey, setShowApiKey] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [quota, setQuota] = useState<SlipOkQuota | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(false)
  const [quotaError, setQuotaError] = useState<string | null>(null)

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
          setLoading(false)
          return
        }

        const profileRes = await getCurrentUserProfileClient()
        if (!profileRes.success || !profileRes.data?.workspace_id) {
          setLoadError("ไม่สามารถระบุหอพัก (workspace) ของท่านได้ กรุณาล็อกอินใหม่อีกครั้ง")
          setLoading(false)
          return
        }
        const wsId = profileRes.data.workspace_id
        setWorkspaceId(wsId)

        const res = await getSlipOkSettings(wsId)
        if (res.success && res.data) {
          setBranchId(res.data.branchId)
          setApiKeyPreview(res.data.apiKeyPreview)
          setHasApiKey(res.data.hasApiKey)
          setEnabled(res.data.enabled)
          setCheckAmount(res.data.checkAmount)
          setCheckReceiver(res.data.checkReceiver)
        } else {
          setLoadError(res.error || "ไม่สามารถโหลดการตั้งค่า SlipOK ได้")
        }
      } catch (err) {
        console.error("Error loading SlipOK settings:", err)
        setLoadError("เกิดข้อผิดพลาดในการโหลดการตั้งค่า SlipOK")
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
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
        setSaveError("ไม่พบรหัสหอพัก (workspace)")
        return
      }
      if (!hasApiKey && !apiKeyInput.trim()) {
        setSaveError("กรุณากรอก API Key ของ SlipOK ก่อนบันทึก")
        return
      }

      const res = await saveSlipOkSettings(workspaceId, branchId, apiKeyInput.trim() || null, enabled, checkAmount, checkReceiver)
      if (res.success) {
        setSaveSuccess(true)
        if (apiKeyInput.trim()) {
          setHasApiKey(true)
          setApiKeyPreview(`••••${apiKeyInput.trim().slice(-4)}`)
        }
        setApiKeyInput("")
      } else {
        setSaveError(res.error || "ไม่สามารถบันทึกการตั้งค่าได้")
      }
    } catch (err) {
      console.error("Error saving SlipOK settings:", err)
      setSaveError("เกิดข้อผิดพลาดในการบันทึกการตั้งค่า")
    } finally {
      setSaving(false)
    }
  }

  const handleCheckQuota = async () => {
    setQuotaLoading(true)
    setQuotaError(null)
    try {
      if (isDemo) {
        await new Promise((r) => setTimeout(r, 500))
        setQuota({ quota: 87, overQuota: 0, specialQuota: 0, endDate: "2026-12-31", specialEndDate: null })
        return
      }

      if (!workspaceId) {
        setQuotaError("ไม่พบรหัสหอพัก (workspace)")
        return
      }

      const res = await getSlipOkQuota(workspaceId)
      if (res.success && res.data) {
        setQuota(res.data)
      } else {
        setQuota(null)
        setQuotaError(res.error || "ไม่สามารถตรวจสอบโควต้าได้")
      }
    } catch (err) {
      console.error("Error checking SlipOK quota:", err)
      setQuotaError("เกิดข้อผิดพลาดในการตรวจสอบโควต้า")
    } finally {
      setQuotaLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[40vh]">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <span>กำลังโหลดการตั้งค่า SlipOK...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 font-sans flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-blue-500" />
            เชื่อมต่อ SlipOK (ตรวจสอบสลิปอัตโนมัติ)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-bold mt-1">
            ใส่ Branch ID และ API Key ของ SlipOK เฉพาะหอพักนี้ เพื่อให้ระบบตรวจสอบสลิปที่ผู้เช่าอัปโหลดโดยอัตโนมัติ
          </p>
        </div>
        {enabled && hasApiKey && (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-bold text-teal-400 shadow-sm shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" /> เชื่อมต่อแล้ว
          </span>
        )}
      </div>

      {loadError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 text-rose-500 text-sm font-bold">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Card: Branch ID + API Key */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
        <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
          <Key className="w-5 h-5 text-blue-500" /> ข้อมูล API ของ SlipOK
        </h3>

        {/* Enable toggle */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm transition-all">
          <div className="space-y-0.5">
            <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">เปิดใช้งานการตรวจสอบสลิปอัตโนมัติ</h5>
            <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold leading-normal">
              {enabled ? "🟢 เปิดใช้งาน: ระบบจะเรียก SlipOK ตรวจสอบทุกสลิปที่ผู้เช่าอัปโหลด" : "🔴 ปิดใช้งาน: จะข้ามการตรวจสอบอัตโนมัติ (staff ยังตรวจสลิปเองได้ตามปกติ)"}
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
            <Hash className="w-3.5 h-3.5" /> Branch ID
          </label>
          <input
            type="text"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            placeholder="เช่น 123456"
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base font-bold tracking-wide transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" /> API Key
          </label>
          {hasApiKey && !apiKeyInput && (
            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold">
              คีย์ปัจจุบัน: <span className="font-mono">{apiKeyPreview}</span> — กรอกช่องด้านล่างเฉพาะเมื่อต้องการเปลี่ยนคีย์ใหม่
            </p>
          )}
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={hasApiKey ? "กรอกเฉพาะถ้าต้องการเปลี่ยนคีย์ใหม่" : "กรอก API Key จาก SlipOK"}
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
            <ListChecks className="w-3.5 h-3.5" /> เลือกรายการที่จะให้ตรวจสอบ
          </h4>

          <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
            <div className="space-y-0.5">
              <h5 className="text-xs font-black text-slate-800 dark:text-slate-100">เช็คยอดเงินให้ตรงกับสลิป</h5>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                ถ้าเปิดไว้ ยอดเงินในบิลต้องตรงกับยอดในสลิปเป๊ะ ไม่ตรง = ตรวจไม่ผ่าน
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
              <h5 className="text-xs font-black text-slate-800 dark:text-slate-100">เช็คบัญชีผู้รับ + กันสลิปซ้ำ</h5>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                ต้องไปตั้งค่าบัญชีรับเงินของสาขานี้ไว้ในหน้าเว็บ SlipOK ก่อน ไม่งั้นจะตรวจไม่ผ่านทุกครั้ง
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
              <ExternalLink className="w-3 h-3" /> ไปตั้งค่าบัญชีรับเงินที่หน้าเว็บ SlipOK
            </a>
          )}
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
            <span>บันทึกการตั้งค่า SlipOK สำเร็จแล้ว</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
      </div>

      {/* Card: Quota */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-900 pb-3">
          <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-blue-500" /> โควต้าคงเหลือเดือนนี้
          </h3>
          <button
            type="button"
            onClick={handleCheckQuota}
            disabled={quotaLoading}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-black flex items-center gap-2 transition-all disabled:opacity-60"
          >
            {quotaLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            ตรวจสอบโควต้า
          </button>
        </div>

        {quotaError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-rose-500 text-xs sm:text-sm font-bold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{quotaError}</span>
          </div>
        )}

        {quota ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
              <p className="text-[10px] sm:text-xs text-slate-400 font-bold mb-1">โควต้าคงเหลือ</p>
              <p className="text-lg sm:text-xl font-black text-emerald-500">{quota.quota.toLocaleString()}</p>
            </div>
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
              <p className="text-[10px] sm:text-xs text-slate-400 font-bold mb-1">ใช้เกินโควต้า</p>
              <p className="text-lg sm:text-xl font-black text-rose-500">{quota.overQuota.toLocaleString()}</p>
            </div>
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
              <p className="text-[10px] sm:text-xs text-slate-400 font-bold mb-1">โควต้าพิเศษ</p>
              <p className="text-lg sm:text-xl font-black text-blue-500">{quota.specialQuota.toLocaleString()}</p>
            </div>
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
              <p className="text-[10px] sm:text-xs text-slate-400 font-bold mb-1 flex items-center justify-center gap-1">
                <CalendarClock className="w-3 h-3" /> หมดอายุแพ็กเกจ
              </p>
              <p className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-200">{quota.endDate}</p>
            </div>
          </div>
        ) : (
          !quotaError && (
            <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold text-center py-4">
              กดปุ่ม &ldquo;ตรวจสอบโควต้า&rdquo; เพื่อดึงข้อมูลโควต้าล่าสุดจาก SlipOK
            </p>
          )
        )}
      </div>
    </div>
  )
}
