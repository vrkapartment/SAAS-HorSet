"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Building,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Check,
  DoorOpen,
  Download,
  Edit,
  ExternalLink,
  KeyRound,
  Mail,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X
} from "lucide-react"
import Skeleton from "@/components/ui/Skeleton"
import {
  getWorkspaceDetailAction,
  updateWorkspaceNameAdminAction,
  createWorkspaceUserAction,
  updateUserProfileAdminAction,
  updateUserEmailAdminAction,
  resetUserPasswordAdminAction,
  deleteUserProfileAdminAction,
  exportWorkspaceDataToDriveAction,
  purgeWorkspaceAction
} from "@/features/super-admin/actions"
import {
  listAllSaasPlansForAdmin,
  superAdminOverrideSubscription,
  type SaasPlan
} from "@/features/subscription/actions"

type SubscriptionStatus = "trial" | "active" | "past_due" | "read_only" | "cancelled"

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: "ทดลองใช้",
  active: "ใช้งานอยู่",
  past_due: "ค้างชำระ",
  read_only: "ดูได้อย่างเดียว",
  cancelled: "ยกเลิกแล้ว"
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin (เจ้าของหอ)",
  staff: "Staff (พนักงาน)",
  tenant: "Tenant (ผู้เช่า)"
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

type WorkspaceRow = {
  id: string
  name: string
  created_at: string
  tax_firstname: string | null
  tax_lastname: string | null
  tax_id: string | null
  tax_phone: string | null
  tax_address: string | null
  promptpay_type: string | null
  promptpay_id: string | null
  promptpay_name: string | null
}

type PlanRow = {
  id: string
  code: string
  name: string
  price_monthly: number
  price_yearly: number | null
  max_rooms: number | null
  max_staff: number | null
  max_buildings: number | null
}

type SubscriptionRow = {
  id: string
  workspace_id: string
  plan_id: string
  status: SubscriptionStatus
  billing_cycle: "monthly" | "yearly"
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  saas_plans: PlanRow | null
}

type PaymentRow = {
  id: string
  amount: number
  billing_cycle: string
  status: string
  payment_method: string
  created_at: string
  verified_at: string | null
  saas_plans: { name: string } | null
}

type MemberRow = {
  id: string
  email: string
  role: "super_admin" | "admin" | "staff" | "tenant"
  full_name: string | null
  phone: string | null
  tfa_enabled: boolean
  created_at: string
  email_confirmed_at: string | null
  last_sign_in_at: string | null
}

type WorkspaceDetail = {
  workspace: WorkspaceRow
  members: MemberRow[]
  subscription: SubscriptionRow | null
  payments: PaymentRow[]
  usage: {
    rooms: number | null
    buildings: number | null
    tenants: number | null
    bills: number | null
    expenses: number | null
  }
  supportStatus: string
}

type ExportSummary = {
  fileName: string
  folderName: string
  webViewLink: string
  totalRows: number
}

const formatThaiDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }) : "-"

const formatThaiDateTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "-"

const formatQuota = (used: number | null, limit: number | null | undefined) => {
  const usedText = used === null ? "-" : used.toLocaleString("th-TH")
  if (limit === null || limit === undefined) return `${usedText} / ไม่จำกัด`
  return `${usedText} / ${limit.toLocaleString("th-TH")}`
}

export default function WorkspaceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const workspaceId = String(params?.id || "")

  const [detail, setDetail] = useState<WorkspaceDetail | null>(null)
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // แก้ชื่อหอ
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [savingName, setSavingName] = useState(false)

  // แก้ subscription
  const [subModalOpen, setSubModalOpen] = useState(false)
  const [subPlanId, setSubPlanId] = useState("")
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>("trial")
  const [subPeriodEnd, setSubPeriodEnd] = useState("")
  const [savingSub, setSavingSub] = useState(false)

  // แก้ผู้ใช้
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null)
  const [memberFullName, setMemberFullName] = useState("")
  const [memberPhone, setMemberPhone] = useState("")
  const [memberEmail, setMemberEmail] = useState("")
  const [memberRole, setMemberRole] = useState<"admin" | "staff" | "tenant">("staff")
  const [savingMember, setSavingMember] = useState(false)

  // ตั้งรหัสผ่านใหม่
  const [resetTarget, setResetTarget] = useState<MemberRow | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resettingPassword, setResettingPassword] = useState(false)
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)

  // เพิ่มผู้ใช้ใหม่
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserName, setNewUserName] = useState("")
  const [newUserPhone, setNewUserPhone] = useState("")
  const [newUserRole, setNewUserRole] = useState<"admin" | "staff" | "tenant">("staff")
  const [creatingUser, setCreatingUser] = useState(false)

  // Export / ลบหอ
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<ExportSummary | null>(null)
  const [purgeModalOpen, setPurgeModalOpen] = useState(false)
  const [purgePassword, setPurgePassword] = useState("")
  const [purgeName, setPurgeName] = useState("")
  const [purging, setPurging] = useState(false)

  const loadData = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)

    const [detailRes, planRes] = await Promise.all([
      getWorkspaceDetailAction(workspaceId),
      listAllSaasPlansForAdmin()
    ])

    if (!detailRes.success || !detailRes.data) {
      setError(detailRes.error || "โหลดข้อมูลหอพักไม่สำเร็จ")
      setDetail(null)
    } else {
      setDetail(detailRes.data as WorkspaceDetail)
      setNameDraft((detailRes.data as WorkspaceDetail).workspace.name)
    }

    if (planRes.success && planRes.data) {
      setPlans(planRes.data)
    }

    setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ซ่อนข้อความสำเร็จอัตโนมัติ เพื่อไม่ให้ค้างคาหน้าจอจนสับสนกับผลลัพธ์ของรายการถัดไป
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => setSuccess(null), 6000)
    return () => clearTimeout(timer)
  }, [success])

  const admins = useMemo(() => detail?.members.filter((m) => m.role === "admin") || [], [detail])
  const staffs = useMemo(() => detail?.members.filter((m) => m.role === "staff") || [], [detail])
  const tenants = useMemo(() => detail?.members.filter((m) => m.role === "tenant") || [], [detail])
  const plan = detail?.subscription?.saas_plans || null

  const handleSaveName = async () => {
    if (!detail || !nameDraft.trim()) return
    setSavingName(true)
    setError(null)
    const res = await updateWorkspaceNameAdminAction(workspaceId, nameDraft.trim())
    setSavingName(false)
    if (!res.success) {
      setError(res.error || "แก้ไขชื่อหอไม่สำเร็จ")
      return
    }
    setEditingName(false)
    setSuccess("✓ แก้ไขชื่อหอเรียบร้อยแล้ว")
    loadData()
  }

  const openSubModal = () => {
    if (!detail) return
    setSubPlanId(detail.subscription?.plan_id || plans[0]?.id || "")
    setSubStatus(detail.subscription?.status || "trial")
    setSubPeriodEnd(detail.subscription?.current_period_end ? detail.subscription.current_period_end.slice(0, 10) : "")
    setSubModalOpen(true)
  }

  const handleSaveSubscription = async () => {
    if (!subPlanId) {
      setError("กรุณาเลือกแผนการใช้งาน")
      return
    }
    setSavingSub(true)
    setError(null)
    const res = await superAdminOverrideSubscription(
      workspaceId,
      subPlanId,
      subStatus,
      subPeriodEnd ? new Date(subPeriodEnd).toISOString() : null
    )
    setSavingSub(false)
    if (!res.success) {
      setError(res.error || "ปรับแผนการใช้งานไม่สำเร็จ")
      return
    }
    setSubModalOpen(false)
    setSuccess("✓ ปรับแผน/สถานะการใช้งานเรียบร้อยแล้ว")
    loadData()
  }

  const openMemberModal = (member: MemberRow) => {
    setEditingMember(member)
    setMemberFullName(member.full_name || "")
    setMemberPhone(member.phone || "")
    setMemberEmail(member.email)
    setMemberRole(member.role === "super_admin" ? "admin" : member.role)
  }

  const handleSaveMember = async () => {
    if (!editingMember) return
    setSavingMember(true)
    setError(null)

    // อีเมลเปลี่ยนต้องยิงคนละ action เพราะกระทบ credential ที่ใช้ล็อกอิน (แก้ทั้ง auth.users และ profiles)
    if (memberEmail.trim().toLowerCase() !== editingMember.email.toLowerCase()) {
      const emailRes = await updateUserEmailAdminAction(editingMember.id, memberEmail)
      if (!emailRes.success) {
        setSavingMember(false)
        setError(emailRes.error || "เปลี่ยนอีเมลไม่สำเร็จ")
        return
      }
    }

    const res = await updateUserProfileAdminAction(editingMember.id, {
      role: memberRole,
      workspaceId,
      fullName: memberFullName.trim() || null,
      phone: memberPhone.trim() || null
    })
    setSavingMember(false)
    if (!res.success) {
      setError(res.error || "แก้ไขข้อมูลผู้ใช้ไม่สำเร็จ")
      return
    }
    setEditingMember(null)
    setSuccess("✓ แก้ไขข้อมูลผู้ใช้เรียบร้อยแล้ว")
    loadData()
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    setResettingPassword(true)
    setError(null)
    const res = await resetUserPasswordAdminAction(resetTarget.id, resetPassword.trim() || undefined)
    setResettingPassword(false)
    if (!res.success || !res.data) {
      setError(res.error || "ตั้งรหัสผ่านใหม่ไม่สำเร็จ")
      return
    }
    setIssuedPassword(res.data.password)
    setCopiedPassword(false)
  }

  const handleDeleteMember = async (member: MemberRow) => {
    const confirmed = window.confirm(
      `ลบบัญชี "${member.email}" ออกจากระบบถาวรใช่หรือไม่?\nบัญชีนี้จะเข้าสู่ระบบไม่ได้อีก และกู้คืนไม่ได้`
    )
    if (!confirmed) return

    setError(null)
    const res = await deleteUserProfileAdminAction(member.id)
    if (!res.success) {
      setError(res.error || "ลบบัญชีผู้ใช้ไม่สำเร็จ")
      return
    }
    setSuccess(`✓ ลบบัญชี "${member.email}" เรียบร้อยแล้ว`)
    loadData()
  }

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault()
    setCreatingUser(true)
    setError(null)

    const res = await createWorkspaceUserAction({
      email: newUserEmail.trim(),
      fullName: newUserName.trim(),
      phone: newUserPhone.trim(),
      role: newUserRole,
      workspaceId
    })
    setCreatingUser(false)

    if (!res.success || !res.data) {
      setError(res.error || "สร้างบัญชีผู้ใช้ไม่สำเร็จ")
      return
    }

    setIssuedPassword(res.data.password)
    setCopiedPassword(false)
    setAddUserOpen(false)
    setNewUserEmail("")
    setNewUserName("")
    setNewUserPhone("")
    setSuccess(`✓ สร้างบัญชี "${res.data.email}" เรียบร้อยแล้ว`)
    loadData()
  }

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    const res = await exportWorkspaceDataToDriveAction(workspaceId)
    setExporting(false)
    if (!res.success || !res.data) {
      setError(res.error || "Export ข้อมูลไม่สำเร็จ")
      return
    }
    setExportResult({
      fileName: res.data.fileName,
      folderName: res.data.folderName,
      webViewLink: res.data.webViewLink,
      totalRows: res.data.totalRows
    })
    setSuccess(`✓ สำรองข้อมูล ${res.data.totalRows.toLocaleString("th-TH")} แถว ขึ้น Google Drive เรียบร้อยแล้ว`)
  }

  const handlePurge = async () => {
    if (!detail) return
    setPurging(true)
    setError(null)

    const res = await purgeWorkspaceAction({
      workspaceId,
      password: purgePassword,
      confirmName: purgeName
    })
    setPurging(false)

    if (!res.success || !res.data) {
      setError(res.error || "ลบหอไม่สำเร็จ")
      return
    }

    const warningText = res.data.warnings.length > 0 ? `\n\n⚠️ คำเตือน:\n- ${res.data.warnings.join("\n- ")}` : ""
    window.alert(
      `✓ ลบหอ "${res.data.workspaceName}" ถาวรเรียบร้อยแล้ว\n\n` +
        `ไฟล์สำรอง: ${res.data.backupFileName}\n` +
        `โฟลเดอร์ Google Drive: ${res.data.backupFolderName}\n` +
        `ข้อมูลที่สำรองไว้: ${res.data.backupTotalRows.toLocaleString("th-TH")} แถว\n` +
        `บัญชีผู้ใช้ที่ลบ: ${res.data.deletedUsers} บัญชี\n` +
        `ไฟล์ใน Storage ที่ลบ: ${res.data.deletedFiles} ไฟล์` +
        warningText
    )

    // ถ้ากำลังสวมสิทธิ์ดูหอที่เพิ่งลบไป ต้องเคลียร์คุกกี้ทิ้ง ไม่งั้นหน้าอื่นจะ query หา workspace ที่ไม่มีอยู่แล้ว
    document.cookie = "horset_current_workspace_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
    router.push("/super-admin")
  }

  if (!loading && !detail) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-4">
        <Link
          href="/super-admin"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> กลับไปหน้าแผงควบคุม Super Admin
        </Link>
        <div className="p-4 bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-400 rounded-2xl text-sm flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{error || "ไม่พบข้อมูลหอพักนี้"}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-7xl mx-auto">
      {/* ส่วนหัว */}
      <div className="space-y-4">
        <Link
          href="/super-admin"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> กลับไปหน้าแผงควบคุม Super Admin
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold rounded-full text-xs uppercase tracking-wider">
              <Building className="w-3.5 h-3.5" /> จัดการรายหอแบบรวดเร็ว
            </div>

            {editingName ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-lg font-bold w-full sm:w-96"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                  >
                    {savingName ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                    บันทึก
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(false)
                      setNameDraft(detail?.workspace.name || "")
                    }}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                  {loading ? "กำลังโหลด..." : detail?.workspace.name}
                </h1>
                {detail && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-blue-600 dark:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0"
                    aria-label="แก้ไขชื่อหอ"
                    title="แก้ไขชื่อหอ"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            <p className="text-slate-500 dark:text-slate-400 text-xs font-mono">
              ID: {workspaceId} · สร้างเมื่อ {formatThaiDate(detail?.workspace.created_at)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={loadData}
              className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all text-xs font-semibold flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} /> รีเฟรช
            </button>
            <Link
              href="/super-admin/plans"
              className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all text-xs font-semibold flex items-center gap-2"
            >
              <CreditCard className="w-4 h-4" /> จัดการแผนราคา
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-400 rounded-2xl text-sm md:text-xs flex items-start gap-3 shadow-lg">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 bg-teal-500/10 border border-teal-500/25 text-teal-600 dark:text-teal-400 rounded-2xl text-sm md:text-xs flex items-center gap-3 shadow-lg">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading && !detail && (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      )}

      {detail && (
        <>
          {/* การ์ดสรุปตัวเลข */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Admin", value: admins.length, icon: ShieldCheck, tone: "text-blue-500" },
              { label: "Staff", value: staffs.length, icon: UserCog, tone: "text-indigo-500" },
              { label: "ผู้เช่า (บัญชี)", value: tenants.length, icon: Users, tone: "text-teal-500" },
              { label: "ห้องพัก", value: detail.usage.rooms, icon: DoorOpen, tone: "text-amber-500" },
              { label: "ตึก", value: detail.usage.buildings, icon: Building, tone: "text-purple-500" },
              { label: "บิลทั้งหมด", value: detail.usage.bills, icon: Receipt, tone: "text-slate-500" }
            ].map((card) => {
              const CardIcon = card.icon
              return (
                <div
                  key={card.label}
                  className="glass-panel p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-lg space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <CardIcon className={`w-4 h-4 ${card.tone}`} />
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{card.label}</span>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    {card.value === null ? "-" : card.value.toLocaleString("th-TH")}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Subscription */}
            <div className="lg:col-span-7 glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xl space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200">รายละเอียดการใช้บริการ</h2>
                    <p className="text-[11px] text-slate-500">แผน สถานะ วันหมดอายุ และโควตาที่ใช้ไปจริง</p>
                  </div>
                </div>
                <button
                  onClick={openSubModal}
                  className="px-3.5 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl flex items-center gap-1.5 shrink-0"
                >
                  <Edit className="w-3.5 h-3.5" /> แก้ไข
                </button>
              </div>

              {detail.subscription ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60">
                      <p className="text-[10px] text-slate-500 font-semibold mb-1">แผนปัจจุบัน</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-200">{plan?.name || "-"}</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60">
                      <p className="text-[10px] text-slate-500 font-semibold mb-1">สถานะ</p>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getSubscriptionStatusBadgeClass(detail.subscription.status)}`}>
                        {SUBSCRIPTION_STATUS_LABELS[detail.subscription.status]}
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60">
                      <p className="text-[10px] text-slate-500 font-semibold mb-1">รอบชำระ</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-200">
                        {detail.subscription.billing_cycle === "yearly" ? "รายปี" : "รายเดือน"}
                      </p>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60">
                      <p className="text-[10px] text-slate-500 font-semibold mb-1">
                        {detail.subscription.status === "trial" ? "หมดช่วงทดลอง" : "หมดอายุ"}
                      </p>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-200 font-mono">
                        {formatThaiDate(
                          detail.subscription.status === "trial"
                            ? detail.subscription.trial_ends_at
                            : detail.subscription.current_period_end
                        )}
                      </p>
                    </div>
                  </div>

                  {/* โควตาที่ใช้จริงเทียบกับเพดานของแผน */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: "ห้องพัก", used: detail.usage.rooms, limit: plan?.max_rooms },
                      { label: "บัญชี Staff", used: staffs.length, limit: plan?.max_staff },
                      { label: "ตึก", used: detail.usage.buildings, limit: plan?.max_buildings }
                    ].map((quota) => (
                      <div
                        key={quota.label}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between"
                      >
                        <span className="text-[11px] text-slate-500 font-semibold">{quota.label}</span>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-200 font-mono">
                          {formatQuota(quota.used, quota.limit)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
                  หอนี้ยังไม่มีข้อมูล subscription ในระบบ — กด &quot;แก้ไข&quot; เพื่อกำหนดแผนและสถานะให้ได้เลย
                </div>
              )}

              {/* ประวัติการชำระเงินค่าบริการ */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300">ประวัติการชำระค่าบริการ (10 รายการล่าสุด)</h3>
                {detail.payments.length === 0 ? (
                  <p className="text-[11px] text-slate-500 py-3">ยังไม่มีประวัติการชำระเงิน</p>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-900">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 font-semibold">
                          <th className="p-3">วันที่</th>
                          <th className="p-3">แผน</th>
                          <th className="p-3 text-right">จำนวนเงิน</th>
                          <th className="p-3">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-900/60">
                        {detail.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="p-3 font-mono text-slate-500">{formatThaiDate(payment.created_at)}</td>
                            <td className="p-3 text-slate-700 dark:text-slate-300">{payment.saas_plans?.name || "-"}</td>
                            <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-200 font-mono">
                              {Number(payment.amount).toLocaleString("th-TH")}
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  payment.status === "verified"
                                    ? "bg-teal-500/20 text-teal-400"
                                    : payment.status === "pending"
                                      ? "bg-amber-500/20 text-amber-400"
                                      : "bg-red-500/20 text-red-400"
                                }`}
                              >
                                {payment.status === "verified" ? "ยืนยันแล้ว" : payment.status === "pending" ? "รอตรวจสอบ" : "ไม่สำเร็จ"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* ข้อมูลติดต่อ */}
            <div className="lg:col-span-5 glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xl space-y-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-teal-600/10 text-teal-400 rounded-xl border border-teal-500/20">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200">ข้อมูลติดต่อเจ้าของหอ</h2>
                  <p className="text-[11px] text-slate-500">บัญชี Admin ของหอนี้ และข้อมูลผู้เสียภาษี/รับเงิน</p>
                </div>
              </div>

              {admins.length === 0 ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
                  ⚠️ หอนี้ยังไม่มีบัญชี Admin — เจ้าของหอจะเข้าใช้งานไม่ได้
                </div>
              ) : (
                <div className="space-y-2.5">
                  {admins.map((admin) => (
                    <div
                      key={admin.id}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-200 truncate">
                          {admin.full_name || "(ไม่ได้ระบุชื่อ)"}
                        </p>
                        {admin.email_confirmed_at ? (
                          <span className="shrink-0 text-[10px] bg-teal-500/10 border border-teal-500/25 text-teal-400 font-semibold px-2 py-0.5 rounded-lg">
                            ยืนยันอีเมลแล้ว
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] bg-amber-500/10 border border-amber-500/25 text-amber-400 font-semibold px-2 py-0.5 rounded-lg">
                            รอยืนยันอีเมล
                          </span>
                        )}
                      </div>
                      <a
                        href={`mailto:${admin.email}`}
                        className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors break-all"
                      >
                        <Mail className="w-3.5 h-3.5 shrink-0" /> {admin.email}
                      </a>
                      {admin.phone ? (
                        <a
                          href={`tel:${admin.phone}`}
                          className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0" /> {admin.phone}
                        </a>
                      ) : (
                        <p className="flex items-center gap-2 text-xs text-slate-400">
                          <Phone className="w-3.5 h-3.5 shrink-0" /> ยังไม่ได้ระบุเบอร์โทร
                        </p>
                      )}
                      <p className="flex items-center gap-2 text-[11px] text-slate-500">
                        <Clock className="w-3.5 h-3.5 shrink-0" /> เข้าระบบล่าสุด {formatThaiDateTime(admin.last_sign_in_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300">ข้อมูลผู้เสียภาษี / รับเงิน</h3>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0">ชื่อผู้เสียภาษี</dt>
                    <dd className="text-slate-800 dark:text-slate-200 text-right">
                      {[detail.workspace.tax_firstname, detail.workspace.tax_lastname].filter(Boolean).join(" ") || "-"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0">เลขประจำตัวผู้เสียภาษี</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono text-right">{detail.workspace.tax_id || "-"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0">เบอร์ติดต่อ (ภาษี)</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono text-right">{detail.workspace.tax_phone || "-"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 shrink-0 flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5" /> พร้อมเพย์
                    </dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono text-right break-all">
                      {detail.workspace.promptpay_id || "-"}
                      {detail.workspace.promptpay_name ? ` (${detail.workspace.promptpay_name})` : ""}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* รายชื่อผู้ใช้ทั้งหมด */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-600/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200">
                    ผู้ใช้งานในหอนี้ ({detail.members.length} บัญชี)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Admin {admins.length} คน · Staff {staffs.length} คน · ผู้เช่า {tenants.length} บัญชี
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAddUserOpen(true)}
                className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/10 shrink-0"
              >
                <Plus className="w-4 h-4" /> เพิ่มผู้ใช้ในหอนี้
              </button>
            </div>

            {detail.members.length === 0 ? (
              <p className="text-center py-8 text-slate-500 text-sm">ยังไม่มีผู้ใช้งานในหอนี้</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-900">
                <table className="w-full text-left text-xs border-collapse min-w-[720px]">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 font-semibold">
                      <th className="p-3">ชื่อ</th>
                      <th className="p-3">อีเมล</th>
                      <th className="p-3">เบอร์โทร</th>
                      <th className="p-3">บทบาท</th>
                      <th className="p-3">เข้าระบบล่าสุด</th>
                      <th className="p-3 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-900/60">
                    {detail.members.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-100 dark:hover:bg-slate-900/25 transition-colors">
                        <td className="p-3 font-semibold text-slate-900 dark:text-slate-200">
                          {member.full_name || "-"}
                          {!member.email_confirmed_at && (
                            <span className="ml-2 text-[10px] bg-amber-500/10 border border-amber-500/25 text-amber-400 font-semibold px-1.5 py-0.5 rounded">
                              รอยืนยันอีเมล
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300 break-all">{member.email}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-300 font-mono">{member.phone || "-"}</td>
                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              member.role === "admin"
                                ? "bg-blue-500/20 text-blue-400"
                                : member.role === "staff"
                                  ? "bg-indigo-500/20 text-indigo-400"
                                  : member.role === "super_admin"
                                    ? "bg-purple-500/20 text-purple-400"
                                    : "bg-slate-500/20 text-slate-400"
                            }`}
                          >
                            {ROLE_LABELS[member.role] || member.role}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500 font-mono">{formatThaiDateTime(member.last_sign_in_at)}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openMemberModal(member)}
                              className="p-2 text-blue-600 dark:text-blue-400 bg-blue-500/5 hover:bg-blue-500/15 rounded-lg border border-blue-500/10 transition-colors"
                              aria-label="แก้ไขข้อมูลผู้ใช้"
                              title="แก้ไขข้อมูลผู้ใช้"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setResetTarget(member)
                                setResetPassword("")
                                setIssuedPassword(null)
                              }}
                              className="p-2 text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/15 rounded-lg border border-amber-500/10 transition-colors"
                              aria-label="ตั้งรหัสผ่านใหม่"
                              title="ตั้งรหัสผ่านใหม่"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteMember(member)}
                              className="p-2 text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/15 rounded-lg border border-red-500/10 transition-colors"
                              aria-label="ลบบัญชีผู้ใช้"
                              title="ลบบัญชีผู้ใช้"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* โซนอันตราย: Export + ลบหอถาวร */}
          <div className="glass-panel p-6 rounded-3xl border border-red-500/25 shadow-xl space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-red-600/10 text-red-400 rounded-xl border border-red-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200">โซนอันตราย</h2>
                <p className="text-[11px] text-slate-500">สำรองข้อมูลขึ้น Google Drive และลบหอนี้ออกจากระบบถาวร</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                  <Download className="w-4 h-4 text-blue-500" /> สำรองข้อมูลขึ้น Google Drive
                </h3>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  รวมข้อมูลทุกตารางของหอนี้เป็นไฟล์ ZIP (CSV + JSON) แล้วอัปโหลดเข้าโฟลเดอร์ชื่อเดียวกับหอ
                  บน Google Drive กลางของ HorSet — ค่าที่เป็นความลับ (token/secret/API key) จะถูกปิดบังไว้
                </p>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  {exporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังสำรองข้อมูล...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" /> Export ข้อมูลตอนนี้
                    </>
                  )}
                </button>
                {exportResult && (
                  <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 space-y-1.5 text-[11px]">
                    <p className="font-semibold text-teal-600 dark:text-teal-400 break-all">{exportResult.fileName}</p>
                    <p className="text-slate-500">
                      โฟลเดอร์: {exportResult.folderName} · {exportResult.totalRows.toLocaleString("th-TH")} แถว
                    </p>
                    <a
                      href={exportResult.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                    >
                      เปิดไฟล์ใน Google Drive <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-3">
                <h3 className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> ลบหอนี้ถาวร
                </h3>
                <ul className="text-[11px] text-slate-500 leading-relaxed space-y-1 list-disc list-inside">
                  <li>ลบข้อมูลทุกตารางใน DB (ห้อง ผู้เช่า มิเตอร์ บิล รายจ่าย ภาษี ฯลฯ)</li>
                  <li>ลบบัญชีผู้ใช้ทั้งหมดของหอ ({detail.members.filter((m) => m.role !== "super_admin").length} บัญชี) ออกจากระบบ Auth</li>
                  <li>ลบไฟล์สลิปและโลโก้ทั้งหมดใน Storage</li>
                  <li className="text-teal-600 dark:text-teal-400">ระบบจะสำรองข้อมูลขึ้น Google Drive ให้อัตโนมัติก่อนลบเสมอ — ถ้าสำรองไม่สำเร็จจะไม่ลบอะไรเลย</li>
                </ul>
                <button
                  onClick={() => {
                    setPurgeModalOpen(true)
                    setPurgePassword("")
                    setPurgeName("")
                  }}
                  className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> ลบหอนี้ถาวร
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===================== Modal: แก้ไข subscription ===================== */}
      {subModalOpen && (
        <ModalShell title="แก้ไขแผนการใช้งาน" onClose={() => setSubModalOpen(false)}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">แผนการใช้งาน</label>
              <select
                value={subPlanId}
                onChange={(e) => setSubPlanId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              >
                <option value="">— เลือกแผน —</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.priceMonthly.toLocaleString("th-TH")} บาท/เดือน)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">สถานะ</label>
              <select
                value={subStatus}
                onChange={(e) => setSubStatus(e.target.value as SubscriptionStatus)}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              >
                {(Object.keys(SUBSCRIPTION_STATUS_LABELS) as SubscriptionStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {SUBSCRIPTION_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">วันหมดอายุรอบปัจจุบัน</label>
              <input
                type="date"
                value={subPeriodEnd}
                onChange={(e) => setSubPeriodEnd(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              />
              <p className="text-[10px] text-slate-500">เว้นว่างไว้ได้ถ้าไม่ต้องการกำหนดวันหมดอายุ</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveSubscription}
                disabled={savingSub}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
              >
                {savingSub ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                บันทึก
              </button>
              <button
                onClick={() => setSubModalOpen(false)}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ===================== Modal: แก้ไขผู้ใช้ ===================== */}
      {editingMember && (
        <ModalShell title={`แก้ไขข้อมูลผู้ใช้`} onClose={() => setEditingMember(null)}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">ชื่อ-นามสกุล</label>
              <input
                type="text"
                value={memberFullName}
                onChange={(e) => setMemberFullName(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">อีเมล (ใช้ล็อกอิน)</label>
              <input
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">เบอร์โทร</label>
              <input
                type="tel"
                value={memberPhone}
                onChange={(e) => setMemberPhone(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">บทบาท</label>
              <select
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value as "admin" | "staff" | "tenant")}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              >
                <option value="admin">Admin (เจ้าของหอ)</option>
                <option value="staff">Staff (พนักงาน)</option>
                <option value="tenant">Tenant (ผู้เช่า)</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveMember}
                disabled={savingMember}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
              >
                {savingMember ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                บันทึก
              </button>
              <button
                onClick={() => setEditingMember(null)}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ===================== Modal: ตั้งรหัสผ่านใหม่ ===================== */}
      {resetTarget && (
        <ModalShell
          title="ตั้งรหัสผ่านใหม่"
          onClose={() => {
            setResetTarget(null)
            setIssuedPassword(null)
          }}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500 break-all">
              บัญชี: <span className="font-semibold text-slate-700 dark:text-slate-300">{resetTarget.email}</span>
            </p>

            {issuedPassword ? (
              <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 space-y-3">
                <p className="text-xs text-teal-600 dark:text-teal-400 font-semibold">
                  ✓ ตั้งรหัสผ่านใหม่เรียบร้อย — คัดลอกส่งให้ผู้ใช้ทันที (จะไม่แสดงอีก)
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-slate-100 break-all">
                    {issuedPassword}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(issuedPassword)
                      setCopiedPassword(true)
                    }}
                    className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-300 shrink-0"
                    aria-label="คัดลอกรหัสผ่าน"
                    title="คัดลอกรหัสผ่าน"
                  >
                    {copiedPassword ? <Check className="w-4 h-4 text-teal-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={() => {
                    setResetTarget(null)
                    setIssuedPassword(null)
                  }}
                  className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
                >
                  ปิด
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">รหัสผ่านใหม่</label>
                  <input
                    type="text"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="เว้นว่างไว้เพื่อให้ระบบสุ่มรหัสผ่านที่ปลอดภัยให้"
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
                  />
                  <p className="text-[10px] text-slate-500">ต้องยาวอย่างน้อย 8 ตัวอักษร</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleResetPassword}
                    disabled={resettingPassword}
                    className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
                  >
                    {resettingPassword ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    ตั้งรหัสผ่านใหม่
                  </button>
                  <button
                    onClick={() => setResetTarget(null)}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
                  >
                    ยกเลิก
                  </button>
                </div>
              </>
            )}
          </div>
        </ModalShell>
      )}

      {/* ===================== Modal: เพิ่มผู้ใช้ใหม่ ===================== */}
      {addUserOpen && (
        <ModalShell title="เพิ่มผู้ใช้ในหอนี้" onClose={() => setAddUserOpen(false)}>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">อีเมล *</label>
              <input
                type="email"
                required
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">ชื่อ-นามสกุล *</label>
              <input
                type="text"
                required
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">เบอร์โทร</label>
              <input
                type="tel"
                value={newUserPhone}
                onChange={(e) => setNewUserPhone(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">บทบาท</label>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as "admin" | "staff" | "tenant")}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-slate-100 text-sm"
              >
                <option value="admin">Admin (เจ้าของหอ)</option>
                <option value="staff">Staff (พนักงาน)</option>
                <option value="tenant">Tenant (ผู้เช่า)</option>
              </select>
              <p className="text-[10px] text-slate-500">
                ระบบจะสุ่มรหัสผ่านให้อัตโนมัติและยืนยันอีเมลให้ทันที — คัดลอกรหัสผ่านส่งให้ผู้ใช้หลังกดสร้าง
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={creatingUser}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
              >
                {creatingUser ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                สร้างบัญชี
              </button>
              <button
                type="button"
                onClick={() => setAddUserOpen(false)}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* แสดงรหัสผ่านที่ระบบสุ่มให้ตอนสร้างบัญชีใหม่ (นอก modal สร้าง เพราะ modal ถูกปิดไปแล้ว) */}
      {issuedPassword && !resetTarget && (
        <ModalShell title="รหัสผ่านของบัญชีใหม่" onClose={() => setIssuedPassword(null)}>
          <div className="space-y-3">
            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
              ⚠️ คัดลอกส่งให้ผู้ใช้ทันที — รหัสผ่านนี้จะไม่แสดงอีก
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-slate-100 break-all">
                {issuedPassword}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(issuedPassword)
                  setCopiedPassword(true)
                }}
                className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-300 shrink-0"
                aria-label="คัดลอกรหัสผ่าน"
                title="คัดลอกรหัสผ่าน"
              >
                {copiedPassword ? <Check className="w-4 h-4 text-teal-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={() => setIssuedPassword(null)}
              className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
            >
              ปิด
            </button>
          </div>
        </ModalShell>
      )}

      {/* ===================== Modal: ยืนยันลบหอถาวร ===================== */}
      {purgeModalOpen && detail && (
        <ModalShell title="ยืนยันการลบหอถาวร" tone="danger" onClose={() => !purging && setPurgeModalOpen(false)}>
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-600 dark:text-red-400 leading-relaxed">
              การลบนี้ <strong>กู้คืนไม่ได้</strong> — ข้อมูลทั้งหมดของหอ &quot;{detail.workspace.name}&quot; จะถูกลบออกจาก
              ฐานข้อมูล บัญชีผู้ใช้ทุกคน และไฟล์ทั้งหมดใน Storage
              <br />
              ระบบจะสำรองข้อมูลขึ้น Google Drive ให้ก่อนอัตโนมัติ ขั้นตอนนี้อาจใช้เวลาสักครู่
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                1. พิมพ์ชื่อหอให้ตรงเป๊ะ: <span className="font-mono text-red-500">{detail.workspace.name}</span>
              </label>
              <input
                type="text"
                value={purgeName}
                onChange={(e) => setPurgeName(e.target.value)}
                placeholder="พิมพ์ชื่อหอที่ต้องการลบ"
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-red-500/30 focus:outline-none focus:border-red-500 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                2. รหัสผ่านบัญชี Super Admin ของคุณ
              </label>
              <input
                type="password"
                value={purgePassword}
                onChange={(e) => setPurgePassword(e.target.value)}
                autoComplete="current-password"
                placeholder="กรอกรหัสผ่านเพื่อยืนยันตัวตน"
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-red-500/30 focus:outline-none focus:border-red-500 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handlePurge}
                disabled={purging || purgeName.trim() !== detail.workspace.name.trim() || !purgePassword}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {purging ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังสำรองข้อมูลและลบ...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> สำรองข้อมูลแล้วลบถาวร
                  </>
                )}
              </button>
              <button
                onClick={() => setPurgeModalOpen(false)}
                disabled={purging}
                className="px-4 py-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl disabled:opacity-40"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

/**
 * กรอบ Modal กลางจอที่ใช้ซ้ำในหน้านี้ — แยกเป็น component เล็กๆ เพื่อไม่ให้ markup ซ้ำ 6 รอบ
 */
function ModalShell({
  title,
  tone = "default",
  onClose,
  children
}: {
  title: string
  tone?: "default" | "danger"
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-950 border shadow-2xl p-6 space-y-4 ${
          tone === "danger" ? "border-red-500/30" : "border-slate-200 dark:border-slate-800"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <h3
            className={`text-base font-bold ${
              tone === "danger" ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            aria-label="ปิด"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
