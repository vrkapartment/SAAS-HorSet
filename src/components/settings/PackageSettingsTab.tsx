"use client"

import { useEffect, useState } from "react"
import {
  Package,
  Clock,
  DoorOpen,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Sparkles
} from "lucide-react"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { useWorkspaceSubscription } from "@/features/subscription/hooks/useWorkspaceSubscription"
import { cancelWorkspaceSubscription, type SaasPlan } from "@/features/subscription/actions"
import { useSupportAccessContext } from "@/context/SupportAccessContext"
import PricingModal from "@/features/subscription/components/PricingModal"

type FeatureKey = keyof NonNullable<SaasPlan["features"]>

const FEATURE_LABELS: Array<{ key: FeatureKey; label: string }> = [
  { key: "line_notify", label: "แจ้งเตือนบิลอัตโนมัติผ่าน LINE" },
  { key: "tax_export", label: "Export รายงานภาษี ภ.ง.ด. 90/94" },
  { key: "slipok_auto_verify", label: "ตรวจสอบสลิปโอนเงินอัตโนมัติด้วย SlipOK" }
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  trial: { label: "ทดลองใช้", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25" },
  active: { label: "ใช้งานอยู่", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25" },
  past_due: { label: "ค้างชำระ", className: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/25" },
  read_only: { label: "ดูข้อมูลได้อย่างเดียว", className: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25" },
  cancelled: { label: "ยกเลิกแล้ว", className: "bg-slate-500/15 text-slate-500 dark:text-slate-400 border border-slate-500/25" }
}

function formatThaiDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
}

export default function PackageSettingsTab() {
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  const [workspaceId, setWorkspaceId] = useState("")
  const [userRole, setUserRole] = useState<"admin" | "staff" | "super_admin">("admin")
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [showPricingModal, setShowPricingModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelSuccess, setCancelSuccess] = useState(false)

  // จับเวลา ณ ตอนเปิดหน้าไว้ใน state (แทนที่จะเรียก Date.now() ตรงๆ ระหว่าง render ซึ่งเป็น impure call)
  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => {
    setNowMs(Date.now())
  }, [])

  useEffect(() => {
    async function loadProfile() {
      setProfileLoading(true)
      setProfileError(null)
      try {
        if (isDemo) {
          setWorkspaceId("demo-workspace")
          setUserRole("admin")
          return
        }
        const res = await getCurrentUserProfileClient()
        if (!res.success || !res.data?.workspace_id) {
          setProfileError("ไม่สามารถระบุหอพัก (workspace) ของท่านได้ กรุณาล็อกอินใหม่อีกครั้ง")
          return
        }
        setWorkspaceId(res.data.workspace_id)
        setUserRole(res.data.role === "super_admin" ? "super_admin" : "admin")
      } catch (err) {
        console.error("Error loading profile in PackageSettingsTab:", err)
        setProfileError("เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้งาน")
      } finally {
        setProfileLoading(false)
      }
    }
    loadProfile()
  }, [isDemo])

  const { subscription, loading: subLoading, error: subError, refetch } = useWorkspaceSubscription(workspaceId)
  const { supportStatus, handleRequestSupport, handleDecideSupport } = useSupportAccessContext()

  const handleCancelAccount = async () => {
    if (
      !confirm(
        "คุณต้องการยกเลิกการใช้งานบัญชีหอพักนี้ใช่หรือไม่? บัญชีจะยังใช้งานได้ตามปกติจนถึงวันหมดอายุปัจจุบัน จากนั้นจะถูกจำกัดสิทธิ์เป็นแบบดูข้อมูลอย่างเดียว"
      )
    ) {
      return
    }
    setCancelling(true)
    setCancelError(null)
    setCancelSuccess(false)
    try {
      const res = await cancelWorkspaceSubscription(workspaceId)
      if (res.success) {
        setCancelSuccess(true)
        refetch()
      } else {
        setCancelError(res.error || "ไม่สามารถยกเลิกบัญชีได้")
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการยกเลิกบัญชี")
    } finally {
      setCancelling(false)
    }
  }

  if (profileLoading || subLoading) {
    return (
      <div className="py-24 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[40vh]">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <span>กำลังโหลดข้อมูลแพ็กเกจของคุณ...</span>
      </div>
    )
  }

  if (profileError || subError || !subscription) {
    return (
      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 text-rose-500 text-sm font-bold">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <span>{profileError || subError || "ไม่สามารถโหลดข้อมูลแพ็กเกจได้"}</span>
      </div>
    )
  }

  const plan = subscription.plan
  const status = subscription.status
  const statusBadge = STATUS_BADGE[status]
  const isTrial = status === "trial"
  const expiryDate = isTrial ? subscription.trialEndsAt : subscription.currentPeriodEnd
  const daysRemaining = expiryDate && nowMs !== null
    ? Math.ceil((new Date(expiryDate).getTime() - nowMs) / (24 * 60 * 60 * 1000))
    : null

  const roomsUsed = subscription.usage.rooms
  const roomsMax = plan?.maxRooms ?? null
  const roomsPct = roomsMax ? Math.min(100, Math.round((roomsUsed / roomsMax) * 100)) : 0
  const roomsOverQuota = roomsMax !== null && roomsUsed > roomsMax

  const canManageBilling = userRole === "admin" || userRole === "super_admin"

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 font-sans flex items-center gap-2">
          <Package className="w-7 h-7 text-blue-500" />
          แพ็กเกจการใช้งาน
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-bold mt-1">
          ดูสถานะแพ็กเกจปัจจุบัน อัปเกรด หรือจัดการบัญชีการใช้งานของหอพักนี้
        </p>
      </div>

      {/* Card: สถานะแพ็กเกจปัจจุบัน */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">แพ็กเกจปัจจุบัน</p>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">{plan?.name || "-"}</h3>
              {statusBadge && (
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${statusBadge.className}`}>
                  {statusBadge.label}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed max-w-md">
              {isTrial
                ? "ทดลองใช้ Pro features ฟรี — สมัครแพ็กเกจก่อนหมดอายุเพื่อใช้งานต่อ"
                : status === "read_only"
                  ? "บัญชีถูกจำกัดสิทธิ์เป็นแบบดูข้อมูลได้อย่างเดียว กรุณาชำระเงินเพื่อใช้งานต่อ"
                  : status === "cancelled"
                    ? "บัญชีนี้ตั้งไว้ให้ยกเลิกเมื่อครบกำหนด ยังใช้งานได้ตามปกติจนถึงวันหมดอายุ"
                    : "ขอบคุณที่ใช้งาน HorSet ต่อเนื่อง"}
            </p>
          </div>

          {daysRemaining !== null && (
            <div className="text-right shrink-0">
              <p className={`text-3xl font-black ${daysRemaining <= 3 ? "text-rose-500" : "text-slate-800 dark:text-slate-100"}`}>
                {Math.max(0, daysRemaining)}
              </p>
              <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" /> วันที่เหลือ
              </p>
            </div>
          )}
        </div>

        {roomsMax !== null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <DoorOpen className="w-3.5 h-3.5" /> ห้องที่ใช้งาน
              </span>
              <span className={roomsOverQuota ? "text-rose-500" : "text-slate-700 dark:text-slate-200"}>
                {roomsUsed.toLocaleString("th-TH")} / {roomsMax.toLocaleString("th-TH")} ห้อง
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${roomsOverQuota ? "bg-rose-500" : "bg-amber-500"}`}
                style={{ width: `${roomsPct}%` }}
              />
            </div>
          </div>
        )}

        {expiryDate && (
          <p className="text-xs text-slate-400 font-bold">หมดอายุ: {formatThaiDate(expiryDate)}</p>
        )}
      </div>

      {/* Card: สิ่งที่รวมอยู่ในแพ็กเกจ */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-4 shadow-xl">
        <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
          <Sparkles className="w-5 h-5 text-blue-500" /> สิ่งที่รวมอยู่ในแพ็กเกจของคุณ
        </h3>

        <div className="flex items-center justify-between text-xs sm:text-sm py-1">
          <span className="text-slate-500 dark:text-slate-400 font-bold">ห้องพัก</span>
          <span className="font-black text-emerald-600 dark:text-emerald-400">
            {roomsMax === null ? "ไม่จำกัด" : `สูงสุด ${roomsMax.toLocaleString("th-TH")} ห้อง`}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs sm:text-sm py-1">
          <span className="text-slate-500 dark:text-slate-400 font-bold">ออกใบแจ้งหนี้ / บิล PDF</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="flex items-center justify-between text-xs sm:text-sm py-1">
          <span className="text-slate-500 dark:text-slate-400 font-bold">บันทึกมิเตอร์น้ำ-ไฟ</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        {FEATURE_LABELS.map(({ key, label }) => {
          const enabled = Boolean(plan?.features?.[key])
          return (
            <div key={key} className="flex items-center justify-between text-xs sm:text-sm py-1">
              <span className={enabled ? "text-slate-500 dark:text-slate-400 font-bold" : "text-slate-300 dark:text-slate-700 font-bold"}>
                {label}
              </span>
              {enabled ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <span className="text-slate-300 dark:text-slate-700 text-lg leading-none">—</span>
              )}
            </div>
          )
        })}

        {canManageBilling && (
          <button
            type="button"
            onClick={() => setShowPricingModal(true)}
            className="w-full h-12 mt-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-black flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
          >
            อัพเกรดแพ็กเกจ <span aria-hidden>→</span>
          </button>
        )}
      </div>

      {/* Card: เปิดสิทธิ์ให้ support เข้าดูชั่วคราว */}
      {userRole === "admin" && (
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-3 shadow-xl">
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500" /> ให้ทีม support เข้าดูช่วยแก้ปัญหา
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
            ติดต่อ support แล้ว? เปิดสิทธิ์ให้ admin เข้าดูข้อมูลของคุณชั่วคราวเพื่อช่วยตรวจสอบ — admin จะแก้ไขข้อมูลไม่ได้ มีเพียงสิทธิ์ดูเท่านั้น และจะหมดอายุอัตโนมัติภายใน 24 ชั่วโมง
          </p>
          {supportStatus === "approved" ? (
            <button
              type="button"
              onClick={() => handleDecideSupport(false)}
              className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-black transition-colors cursor-pointer"
            >
              ระงับสิทธิ์เข้าดูทันที
            </button>
          ) : supportStatus === "pending" ? (
            <span className="inline-block px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-black">
              ⏳ รอการอนุมัติ
            </span>
          ) : (
            <button
              type="button"
              onClick={handleRequestSupport}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black transition-colors cursor-pointer"
            >
              เปิดสิทธิ์ให้ admin เข้าดูชั่วคราว
            </button>
          )}
        </div>
      )}

      {/* Danger zone: ยกเลิกบัญชี */}
      {userRole === "admin" && status !== "cancelled" && (
        <div className="rounded-2xl border-2 border-rose-300 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/10 p-6 space-y-3">
          <h3 className="text-sm font-black text-rose-600 dark:text-rose-400">ยกเลิกบัญชี</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
            บัญชีจะใช้งานได้จนถึงวันหมดอายุ จากนั้นจะมีช่วงเก็บข้อมูล 90 วันก่อนลบถาวร
          </p>
          {cancelError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2 text-rose-500 text-xs font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{cancelError}</span>
            </div>
          )}
          {cancelSuccess && (
            <div className="p-3 bg-slate-500/10 border border-slate-500/20 rounded-xl flex items-start gap-2 text-slate-600 dark:text-slate-300 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>ตั้งค่ายกเลิกบัญชีเรียบร้อยแล้ว บัญชีจะยังใช้งานได้จนถึงวันหมดอายุปัจจุบัน</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleCancelAccount}
            disabled={cancelling}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-black flex items-center gap-2 transition-all cursor-pointer"
          >
            {cancelling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            ยกเลิกบัญชี
          </button>
        </div>
      )}

      <PricingModal
        isOpen={showPricingModal}
        workspaceId={workspaceId}
        onClose={() => setShowPricingModal(false)}
        onSuccess={refetch}
      />
    </div>
  )
}