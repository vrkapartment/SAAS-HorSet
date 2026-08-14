"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
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
  ShieldAlert,
  ShieldCheck,
  Wallet,
  Gauge,
  CalendarClock,
  Package,
  Plus,
  ToggleLeft,
  ToggleRight
} from "lucide-react"
import {
  getSystemSettingsAction,
  updateSystemSettingAction,
  getHorsetSlipOkQuotaAction
} from "@/features/super-admin/actions"
import {
  listAllWorkspaceSubscriptions,
  listSaasPayments,
  listSaasPlans,
  listAllSaasPlansForAdmin,
  createSaasPlan,
  updateSaasPlan,
  toggleSaasPlanActive,
  superAdminOverrideSubscription,
  type SaasPlan,
  type SaasPlanInput
} from "@/features/subscription/actions"
import { getSuperAdminDataAction } from "@/features/super-admin/actions"
import SaasPaymentReviewModal, { type SaasPaymentForReview } from "@/features/subscription/components/SaasPaymentReviewModal"

type SubscriptionStatus = "trial" | "active" | "past_due" | "read_only" | "cancelled"
type PlansTab = "subscription" | "catalog" | "slipok" | "finance"

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
  archived_drive_url?: string | null
  status: "pending" | "verified" | "failed"
  payment_method: string
  verified_at: string | null
  created_at: string
  slipok_response?: unknown
  manual_review_note?: string | null
  reviewed_at?: string | null
  retry_queue_status?: {
    status: string
    attempt_count: number
    max_attempts: number
    last_error_code: number | null
    last_error_message: string | null
    next_retry_at: string
  } | null
  saas_plans?: { name: string } | { name: string }[] | null
}

interface HorsetSlipOkQuota {
  quota: number
  overQuota: number
  specialQuota: number
  endDate: string
  specialEndDate: string | null
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

  const [activeTab, setActiveTab] = useState<PlansTab>("subscription")

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

  // โควต้า SlipOK คงเหลือเดือนนี้ของบัญชี HorSet เอง
  const [horsetQuota, setHorsetQuota] = useState<HorsetSlipOkQuota | null>(null)
  const [horsetQuotaLoading, setHorsetQuotaLoading] = useState(false)
  const [horsetQuotaError, setHorsetQuotaError] = useState<string | null>(null)

  // แผนการใช้งานของแต่ละ workspace
  const [subscriptions, setSubscriptions] = useState<WorkspaceSubscriptionRow[]>([])
  const [saasPayments, setSaasPayments] = useState<SaasPaymentRow[]>([])
  const [saasPlans, setSaasPlans] = useState<SaasPlan[]>([])
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false)
  const [searchSubscription, setSearchSubscription] = useState("")
  const [searchPayment, setSearchPayment] = useState("")
  const [editingSubscription, setEditingSubscription] = useState<WorkspaceSubscriptionRow | null>(null)
  const [editingSubPlanId, setEditingSubPlanId] = useState("")
  const [editingSubStatus, setEditingSubStatus] = useState<SubscriptionStatus>("trial")
  const [editingSubPeriodEnd, setEditingSubPeriodEnd] = useState("")
  const [updatingSubscription, setUpdatingSubscription] = useState(false)
  const [reviewingPayment, setReviewingPayment] = useState<SaasPaymentRow | null>(null)

  // แผนราคา (saas_plans) — หน้าจัดการแผนของ Super Admin
  const [catalogPlans, setCatalogPlans] = useState<SaasPlan[]>([])
  const [loadingCatalogPlans, setLoadingCatalogPlans] = useState(false)
  const [planFormMode, setPlanFormMode] = useState<"closed" | "create" | "edit">("closed")
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [planFormCode, setPlanFormCode] = useState<SaasPlan["code"]>("starter")
  const [planFormName, setPlanFormName] = useState("")
  const [planFormPriceMonthly, setPlanFormPriceMonthly] = useState("")
  const [planFormPriceYearly, setPlanFormPriceYearly] = useState("")
  const [planFormMaxRooms, setPlanFormMaxRooms] = useState("")
  const [planFormMaxStaff, setPlanFormMaxStaff] = useState("")
  const [planFormMaxBuildings, setPlanFormMaxBuildings] = useState("")
  const [planFormLineNotify, setPlanFormLineNotify] = useState(false)
  const [planFormTaxExport, setPlanFormTaxExport] = useState(false)
  const [planFormSlipokAutoVerify, setPlanFormSlipokAutoVerify] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [togglingPlanId, setTogglingPlanId] = useState<string | null>(null)

  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  const loadHorsetQuota = async () => {
    setHorsetQuotaLoading(true)
    setHorsetQuotaError(null)
    try {
      const res = await getHorsetSlipOkQuotaAction()
      if (res.success && res.data) {
        setHorsetQuota(res.data)
      } else {
        setHorsetQuota(null)
        setHorsetQuotaError(res.error || "ไม่สามารถตรวจสอบโควต้าได้")
      }
    } catch (err) {
      console.error("Error checking HorSet SlipOK quota:", err)
      setHorsetQuotaError("เกิดข้อผิดพลาดในการตรวจสอบโควต้า")
    } finally {
      setHorsetQuotaLoading(false)
    }
  }

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

  const loadCatalogPlans = async () => {
    setLoadingCatalogPlans(true)
    try {
      const res = await listAllSaasPlansForAdmin()
      if (res.success && res.data) {
        setCatalogPlans(res.data as SaasPlan[])
      }
    } finally {
      setLoadingCatalogPlans(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    setResultSuccess(null)

    if (isDemo) {
      setLoading(false)
      loadHorsetQuota()
      return
    }

    try {
      // ยิงทั้ง 4 คำขอพร้อมกัน (เดิม await ทีละตัวก่อนค่อย Promise.all อีก 2 ตัวที่เหลือ) — ลด wall-clock
      // ของการโหลดหน้าแรกลงเหลือเท่าคำขอที่ช้าที่สุดตัวเดียว ไม่ใช่ผลรวมของคำขอที่ทำสำเร็จก่อน
      const [wsRes, settingsRes] = await Promise.all([
        getSuperAdminDataAction(),
        getSystemSettingsAction(),
        loadSubscriptionsData(),
        loadCatalogPlans()
      ])

      if (wsRes.success && wsRes.data) {
        setWorkspaces(wsRes.data.workspaces || [])
      }

      let hasSlipOkConfigured = false
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

        hasSlipOkConfigured = !!(branchIdSetting?.value && apiKeySetting?.value)
      }

      // ถ้าเชื่อมต่อ SlipOK ของ HorSet ไว้แล้ว ดึงโควต้าล่าสุดให้อัตโนมัติทันที ไม่ต้องรอกดปุ่มเอง
      if (hasSlipOkConfigured) {
        loadHorsetQuota()
      }
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
      // บันทึกเสร็จแล้วรีเฟรชโควต้าให้สดใหม่ทันที (เผื่อเปลี่ยน Branch ID/API Key มา)
      loadHorsetQuota()
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

  const openCreatePlanForm = () => {
    setPlanFormMode("create")
    setEditingPlanId(null)
    setPlanFormCode("starter")
    setPlanFormName("")
    setPlanFormPriceMonthly("")
    setPlanFormPriceYearly("")
    setPlanFormMaxRooms("")
    setPlanFormMaxStaff("")
    setPlanFormMaxBuildings("")
    setPlanFormLineNotify(false)
    setPlanFormTaxExport(false)
    setPlanFormSlipokAutoVerify(false)
  }

  const openEditPlanForm = (plan: SaasPlan) => {
    setPlanFormMode("edit")
    setEditingPlanId(plan.id)
    setPlanFormCode(plan.code)
    setPlanFormName(plan.name)
    setPlanFormPriceMonthly(String(plan.priceMonthly))
    setPlanFormPriceYearly(plan.priceYearly === null ? "" : String(plan.priceYearly))
    setPlanFormMaxRooms(plan.maxRooms === null ? "" : String(plan.maxRooms))
    setPlanFormMaxStaff(plan.maxStaff === null ? "" : String(plan.maxStaff))
    setPlanFormMaxBuildings(plan.maxBuildings === null ? "" : String(plan.maxBuildings))
    setPlanFormLineNotify(!!plan.features?.line_notify)
    setPlanFormTaxExport(!!plan.features?.tax_export)
    setPlanFormSlipokAutoVerify(!!plan.features?.slipok_auto_verify)
  }

  const handleSubmitPlanForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPlan(true)
    setError(null)
    setResultSuccess(null)
    try {
      const input: SaasPlanInput = {
        code: planFormCode,
        name: planFormName,
        priceMonthly: Number(planFormPriceMonthly) || 0,
        priceYearly: planFormPriceYearly.trim() === "" ? null : Number(planFormPriceYearly),
        maxRooms: planFormMaxRooms.trim() === "" ? null : Number(planFormMaxRooms),
        maxStaff: planFormMaxStaff.trim() === "" ? null : Number(planFormMaxStaff),
        maxBuildings: planFormMaxBuildings.trim() === "" ? null : Number(planFormMaxBuildings),
        features: {
          line_notify: planFormLineNotify,
          tax_export: planFormTaxExport,
          slipok_auto_verify: planFormSlipokAutoVerify
        }
      }

      const res = planFormMode === "create"
        ? await createSaasPlan(input)
        : await updateSaasPlan(editingPlanId as string, input)

      if (!res.success) throw new Error(res.error)

      setResultSuccess(planFormMode === "create" ? "✓ สร้างแผนการใช้งานใหม่สำเร็จ" : "✓ แก้ไขแผนการใช้งานสำเร็จ")
      setPlanFormMode("closed")
      await loadCatalogPlans()
    } catch (err) {
      setError("ไม่สามารถบันทึกแผนการใช้งานได้: " + (err instanceof Error ? err.message : ""))
    } finally {
      setSavingPlan(false)
    }
  }

  const handleTogglePlanActive = async (plan: SaasPlan) => {
    setTogglingPlanId(plan.id)
    setError(null)
    setResultSuccess(null)
    try {
      const res = await toggleSaasPlanActive(plan.id, !plan.isActive)
      if (!res.success) throw new Error(res.error)
      setResultSuccess(plan.isActive ? "✓ ปิดการขายแผนแล้ว" : "✓ เปิดการขายแผนแล้ว")
      await loadCatalogPlans()
    } catch (err) {
      setError("ไม่สามารถเปลี่ยนสถานะแผนได้: " + (err instanceof Error ? err.message : ""))
    } finally {
      setTogglingPlanId(null)
    }
  }

  const filteredSubscriptions = subscriptions.filter((sub) => {
    if (!searchSubscription.trim()) return true
    const wsName = workspaces.find((w) => w.id === sub.workspace_id)?.name || ""
    const plan = getJoinedPlan(sub)
    const q = searchSubscription.toLowerCase()
    return wsName.toLowerCase().includes(q) || (plan?.name || "").toLowerCase().includes(q)
  })

  const filteredSaasPayments = saasPayments.filter((payment) => {
    if (!searchPayment.trim()) return true
    const wsName = workspaces.find((w) => w.id === payment.workspace_id)?.name || ""
    const plan = Array.isArray(payment.saas_plans) ? payment.saas_plans[0] : payment.saas_plans
    const q = searchPayment.toLowerCase()
    return wsName.toLowerCase().includes(q) || (plan?.name || "").toLowerCase().includes(q)
  })

  const PLANS_TABS: Array<{ id: PlansTab; label: string; icon: typeof CreditCard }> = [
    { id: "subscription", label: "Subscription Detail", icon: CreditCard },
    { id: "catalog", label: "แผนราคา", icon: Package },
    { id: "slipok", label: "เชื่อมต่อ SlipOK", icon: ShieldCheck },
    { id: "finance", label: "ตั้งค่าการเงินและบัญชีรับเงิน", icon: Wallet }
  ]

  return (
    <>
      <div className="space-y-8 pb-12">
        {/* หัวข้อ */}
        <div className="relative p-8 rounded-3xl overflow-hidden glass-panel border border-blue-500/10 shadow-2xl">
          <div className="absolute top-0 right-0 w-[400px] h-[200px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => router.push("/super-admin")}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer mb-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Super Admin Console
              </button>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 font-bold rounded-full text-xs uppercase tracking-wider">
                <CreditCard className="w-3.5 h-3.5" /> จัดการแผนการใช้งาน
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                แผนการใช้งาน & บัญชีรับเงินของ HorSet
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-sm max-w-xl">
                ตั้งค่าบัญชี SlipOK/PromptPay ที่ HorSet ใช้รับชำระค่า subscription จากเจ้าของหอพัก พร้อมดูแผน สถานะ และประวัติการชำระเงินของทุก workspace
              </p>
            </div>

            <button
              onClick={loadData}
              className="px-5 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all text-xs font-semibold flex items-center gap-2 shadow-lg shrink-0 self-start md:self-center"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
              รีเฟรชข้อมูล
            </button>
          </div>
        </div>

        {/* แถบเลือกแท็บ */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-lg overflow-x-auto">
          {PLANS_TABS.map((tab) => {
            const TabIcon = tab.icon
            const isTabActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 md:py-2.5 px-3 rounded-xl text-sm md:text-xs font-bold transition-all duration-300 relative cursor-pointer whitespace-nowrap ${
                  isTabActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 scale-100"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <TabIcon className="w-4.5 h-4.5 md:w-4 md:h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-400 rounded-2xl text-sm md:text-xs flex items-center gap-3 shadow-lg">
            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-4 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/25 text-teal-700 dark:text-teal-400 rounded-2xl text-sm md:text-xs flex items-center gap-3 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Tab: Subscription Detail */}
        {activeTab === "subscription" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* ตารางแผนการใช้งานของแต่ละ workspace */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200">แผนการใช้งานของแต่ละหอพัก (Workspace Subscriptions)</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-500">ตรวจสอบแผน สถานะการใช้งาน และวันหมดอายุของแต่ละ workspace</p>
                  </div>
                </div>
                <button
                  onClick={loadSubscriptionsData}
                  className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all text-xs font-semibold flex items-center gap-2 shrink-0 self-start md:self-center"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingSubscriptions ? "animate-spin text-blue-400" : ""}`} />
                  รีเฟรชข้อมูล
                </button>
              </div>

              <input
                type="text"
                placeholder="ค้นหาด้วยชื่อหอพักหรือชื่อแผน..."
                className="w-full px-4 py-3 md:py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 text-sm md:text-xs transition-colors"
                value={searchSubscription}
                onChange={(e) => setSearchSubscription(e.target.value)}
              />

              {loadingSubscriptions && subscriptions.length === 0 ? (
                <div className="space-y-2.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-2xl" />
                  ))}
                </div>
              ) : (
                <>
                  {/* รายการแผนแบบการ์ด (มือถือ) */}
                  <div className="md:hidden space-y-2.5">
                    {filteredSubscriptions.map((sub) => {
                      const wsName = workspaces.find((w) => w.id === sub.workspace_id)?.name || "ไม่พบชื่อหอพัก"
                      const plan = getJoinedPlan(sub)
                      const expiryDate = sub.status === "trial" ? sub.trial_ends_at : sub.current_period_end
                      return (
                        <div key={sub.id} className="p-4 rounded-2xl bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/60 space-y-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-slate-200 text-sm truncate">{wsName}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{plan?.name || "-"}</p>
                            </div>
                            <span className={`shrink-0 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getSubscriptionStatusBadgeClass(sub.status)}`}>
                              {SUBSCRIPTION_STATUS_LABELS[sub.status]}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 dark:text-slate-500 font-mono">
                              {expiryDate ? new Date(expiryDate).toLocaleDateString("th-TH") : "-"}
                            </span>
                            <button
                              onClick={() => {
                                setEditingSubscription(sub)
                                setEditingSubPlanId(sub.plan_id)
                                setEditingSubStatus(sub.status)
                                setEditingSubPeriodEnd(sub.current_period_end ? sub.current_period_end.slice(0, 10) : "")
                              }}
                              className="p-2.5 text-blue-600 dark:text-blue-400 bg-blue-500/5 rounded-xl border border-blue-500/10 inline-flex items-center gap-1.5"
                              aria-label="แก้ไขแผน/สถานะ" title="แก้ไขแผน/สถานะ"
                            >
                              <Edit className="w-4 h-4" /> แก้ไข
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {filteredSubscriptions.length === 0 && (
                      <div className="text-center p-8 text-slate-500 dark:text-slate-500 text-sm rounded-2xl border border-slate-200 dark:border-slate-900 bg-slate-50 dark:bg-slate-950/20">
                        {searchSubscription ? "ไม่พบผลลัพธ์ที่ค้นหา" : "ยังไม่มีข้อมูล subscription ในระบบ (อาจยังไม่ได้รัน schema_multi_workspace.sql)"}
                      </div>
                    )}
                  </div>

                  {/* ตารางแผน (เดสก์ท็อป) */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-900">
                <table className="w-full text-left text-sm md:text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-900">
                      <th className="p-4">หอพัก (Workspace)</th>
                      <th className="p-4">แผนปัจจุบัน</th>
                      <th className="p-4">สถานะ</th>
                      <th className="p-4">วันหมดอายุ</th>
                      <th className="p-4 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-900/60 bg-white dark:bg-slate-950/20">
                    {filteredSubscriptions.map((sub) => {
                      const wsName = workspaces.find((w) => w.id === sub.workspace_id)?.name || "ไม่พบชื่อหอพัก"
                      const plan = getJoinedPlan(sub)
                      const expiryDate = sub.status === "trial" ? sub.trial_ends_at : sub.current_period_end
                      return (
                        <tr key={sub.id} className="hover:bg-slate-100 dark:hover:bg-slate-900/25 transition-colors">
                          <td className="p-4 font-semibold text-slate-900 dark:text-slate-200">{wsName}</td>
                          <td className="p-4 text-slate-600 dark:text-slate-300">{plan?.name || "-"}</td>
                          <td className="p-4">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getSubscriptionStatusBadgeClass(sub.status)}`}>
                              {SUBSCRIPTION_STATUS_LABELS[sub.status]}
                            </span>
                          </td>
                          <td className="p-4 text-slate-500 dark:text-slate-400 font-mono">
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
                              className="p-3 md:p-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 bg-blue-500/5 hover:bg-blue-500/15 rounded-xl md:rounded-lg border border-blue-500/10 transition-colors inline-flex items-center gap-1.5"
                              aria-label="แก้ไขแผน/สถานะ" title="แก้ไขแผน/สถานะ"
                            >
                              <Edit className="w-4 h-4" /> แก้ไข
                            </button>
                          </td>
                        </tr>
                      )
                    })}

                    {filteredSubscriptions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center p-8 text-slate-500 dark:text-slate-500 text-sm md:text-xs">
                          {searchSubscription ? "ไม่พบผลลัพธ์ที่ค้นหา" : "ยังไม่มีข้อมูล subscription ในระบบ (อาจยังไม่ได้รัน schema_multi_workspace.sql)"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
                </>
              )}
              </div>

            {/* ประวัติการจ่ายเงินล่าสุด */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xl space-y-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200">ประวัติการจ่ายเงินค่า Subscription</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-500">รายการชำระเงินจากเจ้าของหอพักทั้งหมด เรียงจากล่าสุด</p>
                </div>
              </div>

              <input
                type="text"
                placeholder="ค้นหาด้วยชื่อหอพักหรือชื่อแผน..."
                className="w-full px-4 py-3 md:py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 text-sm md:text-xs transition-colors"
                value={searchPayment}
                onChange={(e) => setSearchPayment(e.target.value)}
              />

              {loadingSubscriptions && saasPayments.length === 0 ? (
                <div className="space-y-2.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-2xl" />
                  ))}
                </div>
              ) : (
                <>
                  {/* รายการสลิปแบบการ์ด (มือถือ) */}
                  <div className="md:hidden space-y-2.5">
                    {filteredSaasPayments.map((payment) => {
                      const wsName = workspaces.find((w) => w.id === payment.workspace_id)?.name || "ไม่พบชื่อหอพัก"
                      const plan = Array.isArray(payment.saas_plans) ? payment.saas_plans[0] : payment.saas_plans
                      const retryStatus = payment.retry_queue_status
                      const rawSlipOk = payment.slipok_response as { error?: string; code?: number } | null
                      const shortReason =
                        payment.status === "pending" && retryStatus
                          ? `รอ retry ครั้งที่ ${retryStatus.attempt_count}/${retryStatus.max_attempts}`
                          : payment.status === "failed" && rawSlipOk?.error
                            ? rawSlipOk.error
                            : null
                      return (
                        <div key={payment.id} className="p-4 rounded-2xl bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/60 space-y-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-slate-200 text-sm truncate">{wsName}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{plan?.name || "-"} · {Number(payment.amount).toLocaleString("th-TH")} บาท</p>
                            </div>
                            <span className={`shrink-0 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getPaymentStatusBadgeClass(payment.status)}`}>
                              {payment.status === "verified" ? "ยืนยันแล้ว" : payment.status === "pending" ? "รอตรวจสอบ" : "ล้มเหลว"}
                            </span>
                          </div>
                          {shortReason && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400/80 truncate" title={shortReason}>{shortReason}</p>
                          )}
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 dark:text-slate-500 font-mono">
                              {new Date(payment.created_at).toLocaleDateString("th-TH")}
                            </span>
                            <button
                              onClick={() => setReviewingPayment(payment)}
                              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs font-semibold"
                            >
                              ตรวจสอบสลิป <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {filteredSaasPayments.length === 0 && (
                      <div className="text-center p-8 text-slate-500 dark:text-slate-500 text-sm rounded-2xl border border-slate-200 dark:border-slate-900 bg-slate-50 dark:bg-slate-950/20">
                        {searchPayment ? "ไม่พบผลลัพธ์ที่ค้นหา" : "ยังไม่มีประวัติการชำระเงินในระบบ"}
                      </div>
                    )}
                  </div>

                  {/* ตารางสลิป (เดสก์ท็อป) */}
                  <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-900">
                    <table className="w-full text-left text-sm md:text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-900">
                          <th className="p-4">หอพัก (Workspace)</th>
                          <th className="p-4">แผน</th>
                          <th className="p-4">จำนวนเงิน</th>
                          <th className="p-4">สถานะ</th>
                          <th className="p-4">วันที่</th>
                          <th className="p-4 text-center">สลิป / ตรวจสอบ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-900/60 bg-white dark:bg-slate-950/20">
                        {filteredSaasPayments.map((payment) => {
                          const wsName = workspaces.find((w) => w.id === payment.workspace_id)?.name || "ไม่พบชื่อหอพัก"
                          const plan = Array.isArray(payment.saas_plans) ? payment.saas_plans[0] : payment.saas_plans
                          const retryStatus = payment.retry_queue_status
                          const rawSlipOk = payment.slipok_response as { error?: string; code?: number } | null
                          const shortReason =
                            payment.status === "pending" && retryStatus
                              ? `รอ retry ครั้งที่ ${retryStatus.attempt_count}/${retryStatus.max_attempts}`
                              : payment.status === "failed" && rawSlipOk?.error
                                ? rawSlipOk.error
                                : null
                          return (
                            <tr key={payment.id} className="hover:bg-slate-100 dark:hover:bg-slate-900/25 transition-colors">
                              <td className="p-4 font-semibold text-slate-900 dark:text-slate-200">{wsName}</td>
                              <td className="p-4 text-slate-600 dark:text-slate-300">{plan?.name || "-"}</td>
                              <td className="p-4 text-slate-600 dark:text-slate-300 font-mono">
                                {Number(payment.amount).toLocaleString("th-TH")} บาท
                              </td>
                              <td className="p-4">
                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getPaymentStatusBadgeClass(payment.status)}`}>
                                  {payment.status === "verified" ? "ยืนยันแล้ว" : payment.status === "pending" ? "รอตรวจสอบ" : "ล้มเหลว"}
                                </span>
                                {shortReason && (
                                  <p className="text-[10px] text-amber-600 dark:text-amber-400/80 mt-1 max-w-[220px] truncate" title={shortReason}>
                                    {shortReason}
                                  </p>
                                )}
                              </td>
                              <td className="p-4 text-slate-500 dark:text-slate-400 font-mono">
                                {new Date(payment.created_at).toLocaleDateString("th-TH")}
                              </td>
                              <td className="p-4 text-center space-y-1">
                                <button
                                  onClick={() => setReviewingPayment(payment)}
                                  className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 text-xs font-semibold"
                                >
                                  ตรวจสอบสลิป <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}

                        {filteredSaasPayments.length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center p-8 text-slate-500 dark:text-slate-500 text-sm md:text-xs">
                              {searchPayment ? "ไม่พบผลลัพธ์ที่ค้นหา" : "ยังไม่มีประวัติการชำระเงินในระบบ"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab: แผนราคา (saas_plans catalog) */}
        {activeTab === "catalog" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200">แผนราคา (saas_plans)</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-500">จัดการราคา โควตา และฟีเจอร์ของแต่ละแผน — รหัสแผน (code) ถูกจำกัดไว้แค่ 4 ค่าตามโครงสร้างฐานข้อมูล</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
                  <button
                    onClick={loadCatalogPlans}
                    className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all text-xs font-semibold flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingCatalogPlans ? "animate-spin text-blue-400" : ""}`} />
                    รีเฟรชข้อมูล
                  </button>
                  <button
                    onClick={openCreatePlanForm}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/10"
                  >
                    <Plus className="w-4 h-4" />
                    เพิ่มแผนใหม่
                  </button>
                </div>
              </div>

              {loadingCatalogPlans && catalogPlans.length === 0 ? (
                <div className="space-y-2.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-2xl" />
                  ))}
                </div>
              ) : (
                <>
                  {/* รายการแผนแบบการ์ด (มือถือ) */}
                  <div className="md:hidden space-y-2.5">
                    {catalogPlans.map((plan) => (
                      <div key={plan.id} className="p-4 rounded-2xl bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/60 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-slate-200 text-sm">{plan.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500 font-mono">{plan.code}</p>
                          </div>
                          <span
                            className={`shrink-0 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              plan.isActive
                                ? "bg-teal-500/20 text-teal-400 border border-teal-500/10"
                                : "bg-slate-200/60 dark:bg-slate-700/30 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600/20"
                            }`}
                          >
                            {plan.isActive ? "เปิดขาย" : "ปิดขาย"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">ราคา/เดือน</p>
                            <p className="text-slate-600 dark:text-slate-300 font-mono">{plan.priceMonthly.toLocaleString("th-TH")} บาท</p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">ราคา/ปี</p>
                            <p className="text-slate-600 dark:text-slate-300 font-mono">{plan.priceYearly === null ? "-" : `${plan.priceYearly.toLocaleString("th-TH")} บาท`}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-slate-500 dark:text-slate-500">โควตา (ห้อง/staff/อาคาร)</p>
                            <p className="text-slate-500 dark:text-slate-400 font-mono">{plan.maxRooms ?? "∞"} / {plan.maxStaff ?? "∞"} / {plan.maxBuildings ?? "∞"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => openEditPlanForm(plan)}
                            className="flex-1 p-2.5 text-blue-600 dark:text-blue-400 bg-blue-500/5 rounded-xl border border-blue-500/10 inline-flex items-center justify-center gap-1.5 text-xs font-bold"
                            aria-label="แก้ไขแผน" title="แก้ไขแผน"
                          >
                            <Edit className="w-4 h-4" /> แก้ไข
                          </button>
                          <button
                            onClick={() => handleTogglePlanActive(plan)}
                            disabled={togglingPlanId === plan.id}
                            className="flex-1 p-2.5 text-slate-600 dark:text-slate-300 bg-slate-200/60 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700/50 inline-flex items-center justify-center gap-1.5 text-xs font-bold"
                            aria-label={plan.isActive ? "ปิดการขายแผนนี้" : "เปิดการขายแผนนี้"} title={plan.isActive ? "ปิดการขายแผนนี้" : "เปิดการขายแผนนี้"}
                          >
                            {plan.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            {plan.isActive ? "ปิดขาย" : "เปิดขาย"}
                          </button>
                        </div>
                      </div>
                    ))}
                    {catalogPlans.length === 0 && (
                      <div className="text-center p-8 text-slate-500 dark:text-slate-500 text-sm rounded-2xl border border-slate-200 dark:border-slate-900 bg-slate-50 dark:bg-slate-950/20">
                        ยังไม่มีแผนการใช้งานในระบบ (อาจยังไม่ได้รัน schema_multi_workspace.sql)
                      </div>
                    )}
                  </div>

                  {/* ตารางแผน (เดสก์ท็อป) */}
                  <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-900">
                    <table className="w-full text-left text-sm md:text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-900">
                          <th className="p-4">รหัสแผน</th>
                          <th className="p-4">ชื่อแผน</th>
                          <th className="p-4">ราคา/เดือน</th>
                          <th className="p-4">ราคา/ปี</th>
                          <th className="p-4">โควตา (ห้อง/staff/อาคาร)</th>
                          <th className="p-4">สถานะขาย</th>
                          <th className="p-4 text-center">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-900/60 bg-white dark:bg-slate-950/20">
                        {catalogPlans.map((plan) => (
                          <tr key={plan.id} className="hover:bg-slate-100 dark:hover:bg-slate-900/25 transition-colors">
                            <td className="p-4 font-mono text-slate-500 dark:text-slate-400">{plan.code}</td>
                            <td className="p-4 font-semibold text-slate-900 dark:text-slate-200">{plan.name}</td>
                            <td className="p-4 text-slate-600 dark:text-slate-300 font-mono">{plan.priceMonthly.toLocaleString("th-TH")} บาท</td>
                            <td className="p-4 text-slate-600 dark:text-slate-300 font-mono">
                              {plan.priceYearly === null ? "-" : `${plan.priceYearly.toLocaleString("th-TH")} บาท`}
                            </td>
                            <td className="p-4 text-slate-500 dark:text-slate-400 font-mono">
                              {plan.maxRooms ?? "∞"} / {plan.maxStaff ?? "∞"} / {plan.maxBuildings ?? "∞"}
                            </td>
                            <td className="p-4">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  plan.isActive
                                    ? "bg-teal-500/20 text-teal-400 border border-teal-500/10"
                                    : "bg-slate-200/60 dark:bg-slate-700/30 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600/20"
                                }`}
                              >
                                {plan.isActive ? "เปิดขาย" : "ปิดขาย"}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => openEditPlanForm(plan)}
                                  className="p-3 md:p-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 bg-blue-500/5 hover:bg-blue-500/15 rounded-xl md:rounded-lg border border-blue-500/10 transition-colors inline-flex items-center gap-1.5"
                                  aria-label="แก้ไขแผน" title="แก้ไขแผน"
                                >
                                  <Edit className="w-4 h-4" /> แก้ไข
                                </button>
                                <button
                                  onClick={() => handleTogglePlanActive(plan)}
                                  disabled={togglingPlanId === plan.id}
                                  className="p-3 md:p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/60 dark:bg-slate-800/50 hover:bg-slate-300 dark:hover:bg-slate-800 rounded-xl md:rounded-lg border border-slate-300 dark:border-slate-700/50 transition-colors inline-flex items-center gap-1.5"
                                  aria-label={plan.isActive ? "ปิดการขายแผนนี้" : "เปิดการขายแผนนี้"} title={plan.isActive ? "ปิดการขายแผนนี้" : "เปิดการขายแผนนี้"}
                                >
                                  {plan.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {catalogPlans.length === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center p-8 text-slate-500 dark:text-slate-500 text-sm md:text-xs">
                              ยังไม่มีแผนการใช้งานในระบบ (อาจยังไม่ได้รัน schema_multi_workspace.sql)
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab: เชื่อมต่อ SlipOK */}
        {activeTab === "slipok" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* โควต้าคงเหลือเดือนนี้ */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xl space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <Gauge className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200">โควต้าคงเหลือเดือนนี้</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-500">โควต้าตรวจสอบสลิป SlipOK ของบัญชี HorSet เอง (ใช้ตอนตรวจสลิปค่า subscription)</p>
                  </div>
                </div>
                <button
                  onClick={loadHorsetQuota}
                  disabled={horsetQuotaLoading}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-4 h-4 ${horsetQuotaLoading ? "animate-spin text-blue-400" : ""}`} />
                </button>
              </div>

              {horsetQuotaError && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl flex items-start gap-2.5 text-rose-700 dark:text-rose-400 text-xs sm:text-sm font-bold">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{horsetQuotaError}</span>
                </div>
              )}

              {horsetQuota ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-500 font-bold mb-1">โควต้าคงเหลือ</p>
                    <p className="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400">{horsetQuota.quota.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-500 font-bold mb-1">ใช้เกินโควต้า</p>
                    <p className="text-lg sm:text-xl font-black text-rose-600 dark:text-rose-400">{horsetQuota.overQuota.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-500 font-bold mb-1">โควต้าพิเศษ</p>
                    <p className="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400">{horsetQuota.specialQuota.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl text-center">
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-500 font-bold mb-1 flex items-center justify-center gap-1">
                      <CalendarClock className="w-3 h-3" /> หมดอายุแพ็กเกจ
                    </p>
                    <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-200">{horsetQuota.endDate}</p>
                  </div>
                </div>
              ) : (
                !horsetQuotaError && (
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-500 font-bold text-center py-4">
                    {horsetSlipOkBranchId && horsetSlipOkApiKey ? "กำลังดึงข้อมูลโควต้าล่าสุดจาก SlipOK..." : "กรอก Branch ID/API Key ด้านล่างและบันทึกก่อน ระบบจะดึงโควต้าให้อัตโนมัติ"}
                  </p>
                )
              )}
            </div>

            {/* ตั้งค่า Branch ID / API Key */}
            <div className="bg-white dark:bg-slate-900/50 backdrop-blur-md rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 relative overflow-hidden group shadow-sm dark:shadow-none">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">เชื่อมต่อ SlipOK ของ HorSet</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">ใช้ตรวจสอบสลิปที่เจ้าของหอพักอัปโหลดตอนชำระค่า subscription (ไม่เกี่ยวกับ SlipOK ของแต่ละหอพัก)</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">SlipOK Branch ID</label>
                      <input
                        type="text"
                        value={horsetSlipOkBranchId}
                        onChange={(e) => setHorsetSlipOkBranchId(e.target.value)}
                        placeholder="เช่น 12345"
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex justify-between">
                        <span>SlipOK API Key</span>
                        <span className="text-xs text-blue-600 dark:text-blue-400">ถูกเข้ารหัส (AES-256) ก่อนบันทึกลงฐานข้อมูล</span>
                      </label>
                      <input
                        type="text"
                        value={horsetSlipOkApiKey}
                        onChange={(e) => setHorsetSlipOkApiKey(e.target.value)}
                        placeholder="วาง API Key จาก SlipOK ที่นี่"
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-500">
                        * หากมีคีย์เดิมบันทึกไว้อยู่แล้ว จะแสดงเป็น ••••••• เพื่อความปลอดภัย หากต้องการเปลี่ยนให้ลบแล้ววางคีย์ใหม่
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800/50 flex justify-end">
                    <button
                      onClick={handleSaveHorSetSettings}
                      disabled={isUpdatingSettings}
                      className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all ${
                        isUpdatingSettings
                          ? "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
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
          </div>
        )}

        {/* Tab: ตั้งค่าการเงินและบัญชีรับเงิน */}
        {activeTab === "finance" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white dark:bg-slate-900/50 backdrop-blur-md rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 relative overflow-hidden group shadow-sm dark:shadow-none">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                    <Wallet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">ตั้งค่าการเงินและบัญชีรับเงิน</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">บัญชี PromptPay ที่ HorSet ใช้รับชำระค่า subscription จากเจ้าของหอพัก (ไม่เกี่ยวกับบัญชี PromptPay ของแต่ละหอพัก)</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5" /> ชื่อธนาคาร
                      </label>
                      <input
                        type="text"
                        value={horsetBankName}
                        onChange={(e) => setHorsetBankName(e.target.value)}
                        placeholder="เช่น ธนาคารกรุงเทพ"
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-500">แสดงเป็นข้อมูลอ้างอิงในหน้าชำระเงินของลูกค้า (ไม่ใช้ในการสร้าง QR)</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">ชื่อบัญชี PromptPay</label>
                      <input
                        type="text"
                        value={horsetPromptpayName}
                        onChange={(e) => setHorsetPromptpayName(e.target.value)}
                        placeholder="เช่น บริษัท หอเสร็จ จำกัด"
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">หมายเลข PromptPay</label>
                      <input
                        type="text"
                        value={horsetPromptpayId}
                        onChange={(e) => setHorsetPromptpayId(e.target.value)}
                        placeholder="เบอร์โทร หรือ เลขบัตรประชาชน"
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">ประเภทหมายเลข PromptPay</label>
                      <select
                        value={horsetPromptpayType}
                        onChange={(e) => setHorsetPromptpayType(e.target.value as "phone" | "national_id")}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all text-sm"
                      >
                        <option value="phone">เบอร์โทรศัพท์</option>
                        <option value="national_id">เลขบัตรประชาชน</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800/50 flex justify-end">
                    <button
                      onClick={handleSaveHorSetSettings}
                      disabled={isUpdatingSettings}
                      className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all ${
                        isUpdatingSettings
                          ? "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
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
          </div>
        )}
      </div>

      {editingSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 dark:bg-slate-950/80 backdrop-blur-md transition-all duration-300">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl relative space-y-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-blue-600/10 rounded-full blur-[50px] pointer-events-none" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-200">แก้ไขแผน/สถานะการใช้งาน</h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-500">
                    {workspaces.find((w) => w.id === editingSubscription.workspace_id)?.name || "ไม่พบชื่อหอพัก"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSubscription(null)}
                className="p-2 md:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl border border-slate-200/80 dark:border-slate-800/80 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubscription} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">แผนการใช้งาน (Plan)</label>
                <select
                  className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-sm md:text-xs transition-colors"
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
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">สถานะ (Status)</label>
                <select
                  className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-sm md:text-xs transition-colors"
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
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">วันหมดอายุรอบบิลปัจจุบัน</label>
                <input
                  type="date"
                  className="w-full px-4 py-3.5 md:py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-200 text-sm md:text-xs transition-colors"
                  value={editingSubPeriodEnd}
                  onChange={(e) => setEditingSubPeriodEnd(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSubscription(null)}
                  className="flex-1 py-3 md:py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm md:text-xs font-bold md:font-semibold transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={updatingSubscription}
                  className="flex-1 py-3 md:py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm md:text-xs font-bold md:font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-blue-600/10"
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

      {planFormMode !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 dark:bg-slate-950/80 backdrop-blur-md transition-all duration-300">
          <div className="w-full max-w-lg glass-panel p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl relative space-y-6 overflow-hidden overflow-y-auto max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-blue-600/10 rounded-full blur-[50px] pointer-events-none" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-200">
                  {planFormMode === "create" ? "เพิ่มแผนการใช้งานใหม่" : "แก้ไขแผนการใช้งาน"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPlanFormMode("closed")}
                className="p-2 md:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl border border-slate-200/80 dark:border-slate-800/80 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitPlanForm} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">รหัสแผน (code)</label>
                  <select
                    className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-sm md:text-xs transition-colors"
                    value={planFormCode}
                    onChange={(e) => setPlanFormCode(e.target.value as SaasPlan["code"])}
                  >
                    <option value="trial">trial</option>
                    <option value="starter">starter</option>
                    <option value="pro">pro</option>
                    <option value="business">business</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">ชื่อแผนที่แสดงผล</label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-sm md:text-xs transition-colors"
                    value={planFormName}
                    onChange={(e) => setPlanFormName(e.target.value)}
                    placeholder="เช่น Starter"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">ราคา/เดือน (บาท)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-sm md:text-xs transition-colors"
                    value={planFormPriceMonthly}
                    onChange={(e) => setPlanFormPriceMonthly(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">ราคา/ปี (บาท, เว้นว่าง = ไม่ขายรายปี)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-sm md:text-xs transition-colors"
                    value={planFormPriceYearly}
                    onChange={(e) => setPlanFormPriceYearly(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">โควตาห้อง (เว้นว่าง = ∞)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-3.5 md:py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-sm md:text-xs transition-colors"
                    value={planFormMaxRooms}
                    onChange={(e) => setPlanFormMaxRooms(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">โควตา Staff (เว้นว่าง = ∞)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-3.5 md:py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-sm md:text-xs transition-colors"
                    value={planFormMaxStaff}
                    onChange={(e) => setPlanFormMaxStaff(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">โควตาอาคาร (เว้นว่าง = ∞)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-3.5 md:py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-sm md:text-xs transition-colors"
                    value={planFormMaxBuildings}
                    onChange={(e) => setPlanFormMaxBuildings(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800/50">
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">ฟีเจอร์ที่เปิดให้แผนนี้</label>
                <label className="flex items-center gap-2.5 text-sm md:text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planFormLineNotify}
                    onChange={(e) => setPlanFormLineNotify(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 accent-blue-500"
                  />
                  แจ้งเตือนผ่าน LINE (line_notify)
                </label>
                <label className="flex items-center gap-2.5 text-sm md:text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planFormTaxExport}
                    onChange={(e) => setPlanFormTaxExport(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 accent-blue-500"
                  />
                  Export รายงานภาษี (tax_export)
                </label>
                <label className="flex items-center gap-2.5 text-sm md:text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planFormSlipokAutoVerify}
                    onChange={(e) => setPlanFormSlipokAutoVerify(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 accent-blue-500"
                  />
                  ตรวจสอบสลิปอัตโนมัติ (slipok_auto_verify)
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPlanFormMode("closed")}
                  className="flex-1 py-3 md:py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm md:text-xs font-bold md:font-semibold transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingPlan}
                  className="flex-1 py-3 md:py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm md:text-xs font-bold md:font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-blue-600/10"
                >
                  {savingPlan ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "บันทึกแผนการใช้งาน"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reviewingPayment && (
        <SaasPaymentReviewModal
          payment={reviewingPayment as SaasPaymentForReview}
          workspaceName={workspaces.find((w) => w.id === reviewingPayment.workspace_id)?.name || "ไม่พบชื่อหอพัก"}
          planName={
            (Array.isArray(reviewingPayment.saas_plans) ? reviewingPayment.saas_plans[0] : reviewingPayment.saas_plans)?.name || "-"
          }
          onClose={() => setReviewingPayment(null)}
          onReviewed={loadSubscriptionsData}
        />
      )}
    </>
  )
}
