"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  CreditCard,
  QrCode,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Edit,
  X,
  Landmark,
  ShieldAlert
} from "lucide-react"
import {
  getSystemSettingsAction,
  updateSystemSettingAction
} from "@/features/super-admin/actions"
import {
  listAllWorkspaceSubscriptions,
  listSaasPayments,
  listSaasPlans,
  superAdminOverrideSubscription,
  type SaasPlan
} from "@/features/subscription/actions"
import { getSuperAdminDataAction } from "@/features/super-admin/actions"

type SubscriptionStatus = "trial" | "active" | "past_due" | "read_only" | "cancelled"

interface Workspace {
  id: string
  name: string
}

interface SaasPlanJoin {
  id: string
  name: string
  code?: string
}

interface WorkspaceSubscriptionRow {
  id: string
  workspace_id: string
  plan_id: string
  status: SubscriptionStatus
  billing_cycle: "monthly" | "yearly"
  trial_ends_at: string | null
  current_period_end: string | null
  saas_plans?: SaasPlanJoin | SaasPlanJoin[] | null
}

interface SaasPaymentRow {
  id: string
  workspace_id: string
  plan_id: string
  billing_cycle: string
  amount: number
  slip_image_url: string | null
  status: "pending" | "verified" | "failed"
  payment_method: string
  verified_at: string | null
  created_at: string
  saas_plans?: { name: string } | { name: string }[] | null
}

function getJoinedPlan(row: { saas_plans?: SaasPlanJoin | SaasPlanJoin[] | null }): SaasPlanJoin | null {
  if (!row.saas_plans) return null
  return Array.isArray(row.saas_plans) ? row.saas_plans[0] || null : row.saas_plans
}

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: "ทดลองใช้",
  active: "ใช้งานอยู่",
  past_due: "ค้างชำระ",
  read_only: "ดูได้อย่างเดียว",
  cancelled: "ยกเลิกแล้ว"
}

function getSubscriptionStatusBadgeClass(status: SubscriptionStatus) {
  switch (status) {
    case "active":
      return "bg-teal-500/20 text-teal-400 border border-teal-500/10"
    case "trial":
      return "bg-blue-500/20 text-blue-400 border border-blue-500/10"
    case "past_due":
      return "bg-amber-500/20 text-amber-400 border border-amber-500/10"
    case "read_only":
      return "bg-orange-500/20 text-orange-400 border border-orange-500/10"
    case "cancelled":
    default:
      return "bg-red-500/20 text-red-400 border border-red-500/10"
  }
}

function getPaymentStatusBadgeClass(status: SaasPaymentRow["status"]) {
  switch (status) {
    case "verified":
      return "bg-teal-500/20 text-teal-400 border border-teal-500/10"
    case "pending":
      return "bg-amber-500/20 text-amber-400 border border-amber-500/10"
    case "failed":
    default:
      return "bg-red-500/20 text-red-400 border border-red-500/10"
  }
}

export default function SuperAdminPlansPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setResultSuccess] = useState<string | null>(null)

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  // การตั้งค่า SlipOK/PromptPay ของ HorSet เอง (สำหรับรับชำระค่า subscription จากเจ้าของหอพัก)
  const [horsetSlipOkBranchId, setHorsetSlipOkBranchId] = useState("")
  const [horsetSlipOkApiKey, setHorsetSlipOkApiKey] = useState("")
  const [horsetPromptpayId, setHorsetPromptpayId] = useState("")
  const [horsetPromptpayType, setHorsetPromptpayType] = useState<"phone" | "national_id">("phone")
  const [horsetPromptpayName, setHorsetPromptpayName] = useState("")
  const [horsetBankName, setHorsetBankName] = useState("")
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false)

  // แผนการใช้งานของแต่ละ workspace
  const [subscriptions, setSubscriptions] = useState<WorkspaceSubscriptionRow[]>([])
  const [saasPayments, setSaasPayments] = useState<SaasPaymentRow[]>([])
  const [saasPlans, setSaasPlans] = useState<SaasPlan[]>([])
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false)
  const [editingSubscription, setEditingSubscription] = useState<WorkspaceSubscriptionRow | null>(null)
  const [editingSubPlanId, setEditingSubPlanId] = useState("")
  const [editingSubStatus, setEditingSubStatus] = useState<SubscriptionStatus>("trial")
  const [editingSubPeriodEnd, setEditingSubPeriodEnd] = useState("")
  const [updatingSubscription, setUpdatingSubscription] = useState(false)

  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  const loadSubscriptionsData = async () => {
    setLoadingSubscriptions(true)
    try {
      const [subsRes, paymentsRes, plansRes] = await Promise.all([
        listAllWorkspaceSubscriptions(),
        listSaasPayments(),
        listSaasPlans()
      ])

      if (subsRes.success && subsRes.data) {
        setSubscriptions(subsRes.data as unknown as WorkspaceSubscriptionRow[])
      }
      if (paymentsRes.success && paymentsRes.data) {
        setSaasPayments(paymentsRes.data as unknown as SaasPaymentRow[])
      }
      if (plansRes.success && plansRes.data) {
        setSaasPlans(plansRes.data as SaasPlan[])
      }
    } finally {
      setLoadingSubscriptions(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    setResultSuccess(null)

    if (isDemo) {
      setLoading(false)
      return
    }

    try {
      const wsRes = await getSuperAdminDataAction()
      if (wsRes.success && wsRes.data) {
        setWorkspaces(wsRes.data.workspaces || [])
      }

      const settingsRes = await getSystemSettingsAction()
      if (settingsRes.success && settingsRes.data) {
        const branchIdSetting = settingsRes.data.find((s) => s.key === "HORSET_SLIPOK_BRANCH_ID")
        const apiKeySetting = settingsRes.data.find((s) => s.key === "HORSET_SLIPOK_API_KEY")
        const promptpayIdSetting = settingsRes.data.find((s) => s.key === "HORSET_PROMPTPAY_ID")
        const promptpayTypeSetting = settingsRes.data.find((s) => s.key === "HORSET_PROMPTPAY_TYPE")
        const promptpayNameSetting = settingsRes.data.find((s) => s.key === "HORSET_PROMPTPAY_NAME")
        const bankNameSetting = settingsRes.data.find((s) => s.key === "HORSET_BANK_NAME")

        if (branchIdSetting) setHorsetSlipOkBranchId(branchIdSetting.value)
        if (apiKeySetting && apiKeySetting.value) {
          setHorsetSlipOkApiKey("••••••••••••••••••••••••••••••••••••")
        }
        if (promptpayIdSetting) setHorsetPromptpayId(promptpayIdSetting.value)
        if (promptpayTypeSetting && (promptpayTypeSetting.value === "phone" || promptpayTypeSetting.value === "national_id")) {
          setHorsetPromptpayType(promptpayTypeSetting.value)
        }
        if (promptpayNameSetting) setHorsetPromptpayName(promptpayNameSetting.value)
        if (bankNameSetting) setHorsetBankName(bankNameSetting.value)
      }

      await loadSubscriptionsData()
    } catch (err) {
      console.error(err)
      setError("ไม่สามารถโหลดข้อมูลจาก Supabase ได้: " + (err instanceof Error ? err.message : ""))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSaveHorSetSettings = async () => {
    setIsUpdatingSettings(true)
    setError(null)
    setResultSuccess(null)
    try {
      if (horsetSlipOkBranchId) {
        const resBranch = await updateSystemSettingAction("HORSET_SLIPOK_BRANCH_ID", horsetSlipOkBranchId)
        if (!resBranch.success) throw new Error(resBranch.error)
      }
      if (horsetSlipOkApiKey && horsetSlipOkApiKey !== "••••••••••••••••••••••••••••••••••••") {
        const resApiKey = await updateSystemSettingAction("HORSET_SLIPOK_API_KEY", horsetSlipOkApiKey)
        if (!resApiKey.success) throw new Error(resApiKey.error)
      }
      if (horsetPromptpayId) {
        const resPpId = await updateSystemSettingAction("HORSET_PROMPTPAY_ID", horsetPromptpayId)
        if (!resPpId.success) throw new Error(resPpId.error)
      }
      if (horsetPromptpayType) {
        const resPpType = await updateSystemSettingAction("HORSET_PROMPTPAY_TYPE", horsetPromptpayType)
        if (!resPpType.success) throw new Error(resPpType.error)
      }
      if (horsetPromptpayName) {
        const resPpName = await updateSystemSettingAction("HORSET_PROMPTPAY_NAME", horsetPromptpayName)
        if (!resPpName.success) throw new Error(resPpName.error)
      }
      if (horsetBankName) {
        const resBankName = await updateSystemSettingAction("HORSET_BANK_NAME", horsetBankName)
        if (!resBankName.success) throw new Error(resBankName.error)
      }

      setResultSuccess("บันทึกการตั้งค่าบัญชีรับเงินของ HorSet เรียบร้อยแล้ว")
      if (horsetSlipOkApiKey && horsetSlipOkApiKey !== "••••••••••••••••••••••••••••••••••••") {
        setHorsetSlipOkApiKey("••••••••••••••••••••••••••••••••••••")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึกการตั้งค่า")
    } finally {
      setIsUpdatingSettings(false)
    }
  }

  const handleUpdateSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSubscription || !editingSubPlanId) return

    setUpdatingSubscription(true)
    setError(null)
    setResultSuccess(null)

    try {
      const periodEndIso = editingSubPeriodEnd ? new Date(editingSubPeriodEnd).toISOString() : null
      const res = await superAdminOverrideSubscription(
        editingSubscription.workspace_id,
        editingSubPlanId,
        editingSubStatus,
        periodEndIso
      )
      if (!res.success) throw new Error(res.error)

      setResultSuccess("✓ ปรับแผน/สถานะการใช้งานของ workspace สำเร็จ")
      setEditingSubscription(null)
      await loadSubscriptionsData()
    } catch (err) {
      setError("ไม่สามารถปรับแผน/สถานะ subscription ได้: " + (err instanceof Error ? err.message : ""))
    } finally {
      setUpdatingSubscription(false)
    }
  }

  return (
    <>
      <div className="space-y-8 pb-12">
        {/* หัวข้อ */}
        <div className="relative p-8 rounded-3xl overflow-hidden glass-panel border border-emerald-500/10 shadow-2xl">
          <div className="absolute top-0 right-0 w-[400px] h-[200px] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => router.push("/super-admin")}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer mb-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Super Admin Console
              </button>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold rounded-full text-xs uppercase tracking-wider">
                <CreditCard className="w-3.5 h-3.5" /> จัดการแผนการใช้งาน
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
                แผนการใช้งาน & บัญชีรับเงินของ HorSet
              </h1>
              <p className="text-slate-400 text-sm max-w-xl">
                ตั้งค่าบัญชี SlipOK/PromptPay ที่ HorSet ใช้รับชำระค่า subscription จากเจ้าของหอพัก พร้อมดูแผน สถานะ และประวัติการชำระเงินของทุก workspace
              </p>
            </div>

            <button
              onClick={loadData}
              className="px-5 py-3 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-2 shadow-lg shrink-0 self-start md:self-center"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`} />
              รีเฟรชข้อมูล
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/25 text-red-400 rounded-2xl text-sm md:text-xs flex items-center gap-3 shadow-lg">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-4 bg-teal-500/10 border border-teal-500/25 text-teal-400 rounded-2xl text-sm md:text-xs flex items-center gap-3 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* กล่องตั้งค่า SlipOK/PromptPay ของ HorSet เอง */}
        <div className="bg-slate-900/50 backdrop-blur-md rounded-3xl border border-slate-800 p-6 md:p-8 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-100">SlipOK & PromptPay ของ HorSet</h3>
                <p className="text-sm text-slate-400 mt-1">ตั้งค่าบัญชีรับชำระเงินค่าบริการ subscription จากเจ้าของหอพัก (ไม่เกี่ยวกับบัญชี PromptPay ของแต่ละหอพัก)</p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-300">SlipOK Branch ID</label>
                  <input
                    type="text"
                    value={horsetSlipOkBranchId}
                    onChange={(e) => setHorsetSlipOkBranchId(e.target.value)}
                    placeholder="เช่น 12345"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-300 flex justify-between">
                    <span>SlipOK API Key</span>
                    <span className="text-xs text-emerald-400">ถูกเข้ารหัส (AES-256) ก่อนบันทึกลงฐานข้อมูล</span>
                  </label>
                  <input
                    type="password"
                    value={horsetSlipOkApiKey}
                    onChange={(e) => setHorsetSlipOkApiKey(e.target.value)}
                    placeholder="วาง API Key จาก SlipOK ที่นี่"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500">
                    * หากมีคีย์เดิมบันทึกไว้อยู่แล้ว จะแสดงเป็น ••••••• เพื่อความปลอดภัย หากต้องการเปลี่ยนให้ลบแล้ววางคีย์ใหม่
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-300 flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5" /> ชื่อธนาคาร
                  </label>
                  <input
                    type="text"
                    value={horsetBankName}
                    onChange={(e) => setHorsetBankName(e.target.value)}
                    placeholder="เช่น ธนาคารกรุงเทพ"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500">แสดงเป็นข้อมูลอ้างอิงในหน้าชำระเงินของลูกค้า (ไม่ใช้ในการสร้าง QR)</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-300">ชื่อบัญชี PromptPay</label>
                  <input
                    type="text"
                    value={horsetPromptpayName}
                    onChange={(e) => setHorsetPromptpayName(e.target.value)}
                    placeholder="เช่น บริษัท หอเสร็จ จำกัด"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-300">หมายเลข PromptPay</label>
                  <input
                    type="text"
                    value={horsetPromptpayId}
                    onChange={(e) => setHorsetPromptpayId(e.target.value)}
                    placeholder="เบอร์โทร หรือ เลขบัตรประชาชน"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-300">ประเภทหมายเลข PromptPay</label>
                  <select
                    value={horsetPromptpayType}
                    onChange={(e) => setHorsetPromptpayType(e.target.value as "phone" | "national_id")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all text-sm"
                  >
                    <option value="phone">เบอร์โทรศัพท์</option>
                    <option value="national_id">เลขบัตรประชาชน</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/50 flex justify-end">
                <button
                  onClick={handleSaveHorSetSettings}
                  disabled={isUpdatingSettings}
                  className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all ${
                    isUpdatingSettings
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20"
                  }`}
                >
                  {isUpdatingSettings ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      กำลังบันทึก...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      บันทึกการตั้งค่า
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ตารางแผนการใช้งานของแต่ละ workspace */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-emerald-600/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-200">แผนการใช้งานของแต่ละหอพัก (Workspace Subscriptions)</h2>
                <p className="text-[11px] text-slate-500">ตรวจสอบแผน สถานะการใช้งาน และวันหมดอายุของแต่ละ workspace</p>
              </div>
            </div>
            <button
              onClick={loadSubscriptionsData}
              className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-2 shrink-0 self-start md:self-center"
            >
              <RefreshCw className={`w-4 h-4 ${loadingSubscriptions ? "animate-spin text-emerald-400" : ""}`} />
              รีเฟรชข้อมูล
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-900">
            <table className="w-full text-left text-sm md:text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-900">
                  <th className="p-4">หอพัก (Workspace)</th>
                  <th className="p-4">แผนปัจจุบัน</th>
                  <th className="p-4">สถานะ</th>
                  <th className="p-4">วันหมดอายุ</th>
                  <th className="p-4 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 bg-slate-950/20">
                {subscriptions.map((sub) => {
                  const wsName = workspaces.find((w) => w.id === sub.workspace_id)?.name || "ไม่พบชื่อหอพัก"
                  const plan = getJoinedPlan(sub)
                  const expiryDate = sub.status === "trial" ? sub.trial_ends_at : sub.current_period_end
                  return (
                    <tr key={sub.id} className="hover:bg-slate-900/25 transition-colors">
                      <td className="p-4 font-semibold text-slate-200">{wsName}</td>
                      <td className="p-4 text-slate-300">{plan?.name || "-"}</td>
                      <td className="p-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getSubscriptionStatusBadgeClass(sub.status)}`}>
                          {SUBSCRIPTION_STATUS_LABELS[sub.status]}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400 font-mono">
                        {expiryDate ? new Date(expiryDate).toLocaleDateString("th-TH") : "-"}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => {
                            setEditingSubscription(sub)
                            setEditingSubPlanId(sub.plan_id)
                            setEditingSubStatus(sub.status)
                            setEditingSubPeriodEnd(sub.current_period_end ? sub.current_period_end.slice(0, 10) : "")
                          }}
                          className="p-3 md:p-1.5 text-emerald-400 hover:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/15 rounded-xl md:rounded-lg border border-emerald-500/10 transition-colors inline-flex items-center gap-1.5"
                          title="แก้ไขแผน/สถานะ"
                        >
                          <Edit className="w-4 h-4" /> แก้ไข
                        </button>
                      </td>
                    </tr>
                  )
                })}

                {subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center p-8 text-slate-500 text-sm md:text-xs">
                      {loadingSubscriptions ? "กำลังโหลดข้อมูล..." : "ยังไม่มีข้อมูล subscription ในระบบ (อาจยังไม่ได้รัน database_patch_saas_subscription.sql)"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ประวัติการจ่ายเงินล่าสุด */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-6">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-600/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-200">ประวัติการจ่ายเงินค่า Subscription</h2>
              <p className="text-[11px] text-slate-500">รายการชำระเงินจากเจ้าของหอพักทั้งหมด เรียงจากล่าสุด</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-900">
            <table className="w-full text-left text-sm md:text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-900">
                  <th className="p-4">หอพัก (Workspace)</th>
                  <th className="p-4">แผน</th>
                  <th className="p-4">จำนวนเงิน</th>
                  <th className="p-4">สถานะ</th>
                  <th className="p-4">วันที่</th>
                  <th className="p-4 text-center">สลิป</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 bg-slate-950/20">
                {saasPayments.map((payment) => {
                  const wsName = workspaces.find((w) => w.id === payment.workspace_id)?.name || "ไม่พบชื่อหอพัก"
                  const plan = Array.isArray(payment.saas_plans) ? payment.saas_plans[0] : payment.saas_plans
                  return (
                    <tr key={payment.id} className="hover:bg-slate-900/25 transition-colors">
                      <td className="p-4 font-semibold text-slate-200">{wsName}</td>
                      <td className="p-4 text-slate-300">{plan?.name || "-"}</td>
                      <td className="p-4 text-slate-300 font-mono">
                        {Number(payment.amount).toLocaleString("th-TH")} บาท
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getPaymentStatusBadgeClass(payment.status)}`}>
                          {payment.status === "verified" ? "ยืนยันแล้ว" : payment.status === "pending" ? "รอตรวจสอบ" : "ล้มเหลว"}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400 font-mono">
                        {new Date(payment.created_at).toLocaleDateString("th-TH")}
                      </td>
                      <td className="p-4 text-center">
                        {payment.slip_image_url ? (
                          <a
                            href={payment.slip_image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs font-semibold"
                          >
                            ดูสลิป <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  )
                })}

                {saasPayments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-slate-500 text-sm md:text-xs">
                      ยังไม่มีประวัติการชำระเงินในระบบ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editingSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-300">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl relative space-y-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-emerald-600/10 rounded-full blur-[50px] pointer-events-none" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-600/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-200">แก้ไขแผน/สถานะการใช้งาน</h3>
                  <p className="text-[10px] text-slate-500">
                    {workspaces.find((w) => w.id === editingSubscription.workspace_id)?.name || "ไม่พบชื่อหอพัก"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSubscription(null)}
                className="p-2 md:p-1.5 hover:bg-slate-900 text-slate-400 hover:text-slate-200 rounded-xl border border-slate-800/80 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubscription} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400 font-medium block">แผนการใช้งาน (Plan)</label>
                <select
                  className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl focus:outline-none focus:border-emerald-500 text-sm md:text-xs transition-colors"
                  value={editingSubPlanId}
                  onChange={(e) => setEditingSubPlanId(e.target.value)}
                >
                  {saasPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400 font-medium block">สถานะ (Status)</label>
                <select
                  className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl focus:outline-none focus:border-emerald-500 text-sm md:text-xs transition-colors"
                  value={editingSubStatus}
                  onChange={(e) => setEditingSubStatus(e.target.value as SubscriptionStatus)}
                >
                  <option value="trial">ทดลองใช้ (trial)</option>
                  <option value="active">ใช้งานอยู่ (active)</option>
                  <option value="past_due">ค้างชำระ (past_due)</option>
                  <option value="read_only">ดูได้อย่างเดียว (read_only)</option>
                  <option value="cancelled">ยกเลิกแล้ว (cancelled)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400 font-medium block">วันหมดอายุรอบบิลปัจจุบัน</label>
                <input
                  type="date"
                  className="w-full px-4 py-3.5 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-200 text-sm md:text-xs transition-colors"
                  value={editingSubPeriodEnd}
                  onChange={(e) => setEditingSubPeriodEnd(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSubscription(null)}
                  className="flex-1 py-3 md:py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-sm md:text-xs font-bold md:font-semibold transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={updatingSubscription}
                  className="flex-1 py-3 md:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm md:text-xs font-bold md:font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-600/10"
                >
                  {updatingSubscription ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "บันทึกการเปลี่ยนแปลง"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
