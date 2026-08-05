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
  Sparkles,
  Phone,
  MessageCircleMore
} from "lucide-react"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { useWorkspaceSubscription } from "@/features/subscription/hooks/useWorkspaceSubscription"
import { cancelWorkspaceSubscription, type SaasPlan } from "@/features/subscription/actions"
import { useSupportAccessContext } from "@/context/SupportAccessContext"
import PricingModal from "@/features/subscription/components/PricingModal"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { getContactChannelsAction, type ContactChannels } from "@/features/contact/actions"
import { FacebookIcon, InstagramIcon, YoutubeIcon } from "@/components/ui/BrandIcons"

type FeatureKey = keyof NonNullable<SaasPlan["features"]>

const STATUS_BADGE_CLASSES: Record<string, string> = {
  trial: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25",
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25",
  past_due: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/25",
  read_only: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25",
  cancelled: "bg-slate-500/15 text-slate-500 dark:text-slate-400 border border-slate-500/25"
}

function formatThaiDate(dateStr: string | null, locale: string): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString(locale === "th" ? "th-TH" : "en-US", { year: "numeric", month: "long", day: "numeric" })
}

export default function PackageSettingsTab() {
  const { t, locale } = useLanguage()
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  const [workspaceId, setWorkspaceId] = useState("")
  const [userRole, setUserRole] = useState<"admin" | "staff" | "super_admin">("admin")
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [showPricingModal, setShowPricingModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelSuccess, setCancelSuccess] = useState(false)

  // ช่องทางการติดต่อ — โชว์ในการ์ด "ให้ทีม support เข้าดูช่วยแก้ปัญหา" เพื่อให้ admin รู้ว่าจะติดต่อ support ทางไหนได้บ้าง
  // ก่อนกดเปิดสิทธิ์ (ดู src/features/contact/actions.ts — action นี้ public ไม่เช็คสิทธิ์)
  const [contactChannels, setContactChannels] = useState<ContactChannels | null>(null)
  useEffect(() => {
    getContactChannelsAction().then((res) => {
      if (res.success && res.data) setContactChannels(res.data)
    })
  }, [])

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
          setProfileError(t("package_settings.err_workspace"))
          return
        }
        setWorkspaceId(res.data.workspace_id)
        setUserRole(res.data.role === "super_admin" ? "super_admin" : "admin")
      } catch (err) {
        console.error("Error loading profile in PackageSettingsTab:", err)
        setProfileError(t("package_settings.err_profile"))
      } finally {
        setProfileLoading(false)
      }
    }
    loadProfile()
  }, [isDemo])

  const { subscription, loading: subLoading, error: subError, refetch } = useWorkspaceSubscription(workspaceId)
  const { supportStatus, handleRequestSupport, handleDecideSupport } = useSupportAccessContext()

  const handleCancelAccount = async () => {
    if (!confirm(t("package_settings.confirm_cancel"))) {
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
        setCancelError(res.error || t("package_settings.err_cancel_failed"))
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : t("package_settings.err_cancel_generic"))
    } finally {
      setCancelling(false)
    }
  }

  if (profileLoading || subLoading) {
    return (
      <div className="py-24 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[40vh]">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <span>{t("package_settings.loading")}</span>
      </div>
    )
  }

  if (profileError || subError || !subscription) {
    return (
      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 text-rose-500 text-sm font-bold">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <span>{profileError || subError || t("package_settings.err_load_failed")}</span>
      </div>
    )
  }

  const plan = subscription.plan
  const status = subscription.status
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

  const FEATURE_LABELS: Array<{ key: FeatureKey; label: string }> = [
    { key: "line_notify", label: t("package_settings.feature_line") },
    { key: "tax_export", label: t("package_settings.feature_tax") },
    { key: "slipok_auto_verify", label: t("package_settings.feature_slipok") }
  ]

  const statusLabel = t(`package_settings.${status}`)

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Package className="w-7 h-7 text-blue-500" />
          {t("package_settings.title")}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-bold mt-1">
          {t("package_settings.subtitle")}
        </p>
      </div>

      {/* Card: สถานะแพ็กเกจปัจจุบัน */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">{t("package_settings.current_plan")}</p>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">{plan?.name || "-"}</h3>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${STATUS_BADGE_CLASSES[status] || ""}`}>
                {statusLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed max-w-md">
              {isTrial
                ? t("package_settings.desc_trial", { plan: plan?.name || "Starter" })
                : status === "read_only"
                  ? t("package_settings.desc_read_only")
                  : status === "cancelled"
                    ? t("package_settings.desc_cancelled")
                    : t("package_settings.desc_active")}
            </p>
          </div>

          {daysRemaining !== null && (
            <div className="text-right shrink-0">
              <p className={`text-3xl font-black ${daysRemaining <= 3 ? "text-rose-500" : "text-slate-800 dark:text-slate-100"}`}>
                {Math.max(0, daysRemaining)}
              </p>
              <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" /> {t("package_settings.days_remaining")}
              </p>
            </div>
          )}
        </div>

        {roomsMax !== null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <DoorOpen className="w-3.5 h-3.5" /> {t("package_settings.rooms_used_label")}
              </span>
              <span className={roomsOverQuota ? "text-rose-500" : "text-slate-700 dark:text-slate-200"}>
                {roomsUsed.toLocaleString(locale === "th" ? "th-TH" : "en-US")} / {roomsMax.toLocaleString(locale === "th" ? "th-TH" : "en-US")} {t("package_settings.rooms_unit")}
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
          <p className="text-xs text-slate-400 font-bold">{t("package_settings.expiry_label")}: {formatThaiDate(expiryDate, locale)}</p>
        )}
      </div>

      {/* Card: สิ่งที่รวมอยู่ในแพ็กเกจ */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-4 shadow-xl">
        <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
          <Sparkles className="w-5 h-5 text-blue-500" /> {t("package_settings.features_header")}
        </h3>

        <div className="flex items-center justify-between text-xs sm:text-sm py-1">
          <span className="text-slate-500 dark:text-slate-400 font-bold">{t("package_settings.rooms_limit_label")}</span>
          <span className="font-black text-emerald-600 dark:text-emerald-400">
            {roomsMax === null ? t("package_settings.unlimited") : t("package_settings.max_rooms", { count: roomsMax.toLocaleString(locale === "th" ? "th-TH" : "en-US") })}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs sm:text-sm py-1">
          <span className="text-slate-500 dark:text-slate-400 font-bold">{t("package_settings.feature_pdf")}</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="flex items-center justify-between text-xs sm:text-sm py-1">
          <span className="text-slate-500 dark:text-slate-400 font-bold">{t("package_settings.feature_meter")}</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        {FEATURE_LABELS.map(({ key, label }) => {
          const isEnabled = Boolean(plan?.features?.[key])
          return (
            <div key={key} className="flex items-center justify-between text-xs sm:text-sm py-1">
              <span className={isEnabled ? "text-slate-500 dark:text-slate-400 font-bold" : "text-slate-300 dark:text-slate-700 font-bold"}>
                {label}
              </span>
              {isEnabled ? (
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
            {t("package_settings.upgrade_btn")} <span aria-hidden>→</span>
          </button>
        )}
      </div>

      {/* Card: เปิดสิทธิ์ให้ support เข้าดูชั่วคราว */}
      {userRole === "admin" && (
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-3 shadow-xl">
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500" /> {t("package_settings.support_header")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
            {t("package_settings.support_desc")}
          </p>
          {contactChannels && (
            (() => {
              const links = [
                { key: "facebook", url: contactChannels.facebookUrl, icon: FacebookIcon, label: "Facebook" },
                { key: "line", url: contactChannels.lineUrl, icon: MessageCircleMore, label: "LINE" },
                {
                  key: "phone",
                  url: contactChannels.phone ? `tel:${contactChannels.phone.replace(/[^0-9+]/g, "")}` : "",
                  icon: Phone,
                  label: contactChannels.phone,
                },
                { key: "instagram", url: contactChannels.instagramUrl, icon: InstagramIcon, label: "Instagram" },
                { key: "youtube", url: contactChannels.youtubeUrl, icon: YoutubeIcon, label: "YouTube" },
              ].filter((c) => c.url)
              if (links.length === 0) return null
              return (
                <div className="flex flex-wrap gap-2 pt-1">
                  {links.map((c) => (
                    <a
                      key={c.key}
                      href={c.url}
                      target={c.key === "phone" ? undefined : "_blank"}
                      rel={c.key === "phone" ? undefined : "noopener noreferrer"}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <c.icon className="w-3.5 h-3.5" /> {c.label}
                    </a>
                  ))}
                </div>
              )
            })()
          )}
          {supportStatus === "approved" ? (
            <button
              type="button"
              onClick={() => handleDecideSupport(false)}
              className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-black transition-colors cursor-pointer"
            >
              {t("package_settings.support_revoke")}
            </button>
          ) : supportStatus === "pending" ? (
            <span className="inline-block px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-black">
              {t("package_settings.support_pending")}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleRequestSupport}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black transition-colors cursor-pointer"
            >
              {t("package_settings.support_grant")}
            </button>
          )}
        </div>
      )}

      {/* Danger zone: ยกเลิกบัญชี */}
      {userRole === "admin" && status !== "cancelled" && (
        <div className="rounded-2xl border-2 border-rose-300 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/10 p-6 space-y-3">
          <h3 className="text-sm font-black text-rose-600 dark:text-rose-400">{t("package_settings.danger_header")}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
            {t("package_settings.danger_desc")}
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
              <span>{t("package_settings.success_cancel")}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleCancelAccount}
            disabled={cancelling}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-black flex items-center gap-2 transition-all cursor-pointer"
          >
            {cancelling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {t("package_settings.cancel_btn")}
          </button>
        </div>
      )}

      {showPricingModal && (
        <PricingModal
          isOpen={showPricingModal}
          workspaceId={workspaceId}
          onClose={() => setShowPricingModal(false)}
          onSuccess={refetch}
        />
      )}
    </div>
  )
}
