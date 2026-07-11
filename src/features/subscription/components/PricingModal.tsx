"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Check, Minus, Loader2, AlertTriangle, Sparkles, HeartHandshake } from "lucide-react"
import { listSaasPlans, type SaasPlan } from "@/features/subscription/actions"
import { useWorkspaceSubscription } from "@/features/subscription/hooks/useWorkspaceSubscription"
import UploadSlipModal from "./UploadSlipModal"

interface PricingModalProps {
  isOpen: boolean
  workspaceId: string
  onClose: () => void
  /** เรียกอีกครั้งเมื่อชำระเงินสำเร็จ เพื่อให้หน้าที่เรียกใช้ (เช่น PackageSettingsTab) รีเฟรชสถานะแผน */
  onSuccess?: () => void
}

type FeatureKey = keyof NonNullable<SaasPlan["features"]>

const FEATURE_LABELS: Array<{ key: FeatureKey; label: string }> = [
  { key: "line_notify", label: "แจ้งเตือนบิลผ่าน LINE" },
  { key: "slipok_auto_verify", label: "ตรวจสอบสลิปอัตโนมัติด้วย SlipOK" },
  { key: "tax_export", label: "Export รายงานภาษี ภ.ง.ด. 90/94" }
]

function formatLimit(value: number | null): string {
  return value === null ? "ไม่จำกัด" : `สูงสุด ${value.toLocaleString("th-TH")} ห้อง`
}

function getDaysRemaining(dateStr: string | null, nowMs: number | null): number | null {
  if (!dateStr || nowMs === null) return null
  return Math.ceil((new Date(dateStr).getTime() - nowMs) / (24 * 60 * 60 * 1000))
}

/**
 * ป๊อปอัปเต็มจอสำหรับเลือก/อัปเกรดแพ็กเกจ HorSet
 * เปิดจากปุ่ม "อัพเกรดแพ็กเกจ" ในแท็บ "แพ็กเกจ" ของหน้าตั้งค่าระบบ
 */
export default function PricingModal({ isOpen, workspaceId, onClose, onSuccess }: PricingModalProps) {
  const { subscription, refetch } = useWorkspaceSubscription(workspaceId)

  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")

  const [payingPlan, setPayingPlan] = useState<SaasPlan | null>(null)

  // จับเวลา ณ ตอนเปิดป๊อปอัปไว้ใน state (แทนที่จะเรียก Date.now() ตรงๆ ระหว่าง render ซึ่งเป็น impure call)
  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => {
    if (isOpen) setNowMs(Date.now())
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setPlansLoading(true)
    setPlansError(null)

    listSaasPlans()
      .then((res) => {
        if (cancelled) return
        if (res.success) {
          setPlans(res.data || [])
        } else {
          setPlansError(res.error || "ไม่สามารถดึงข้อมูลแผนการใช้งานได้")
        }
      })
      .catch((err) => {
        if (!cancelled) setPlansError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูลแผนการใช้งาน")
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen])

  if (!isOpen) return null

  const roomsUsed = subscription?.usage.rooms ?? 0
  const isTrial = subscription?.status === "trial"
  const trialDaysRemaining = isTrial ? getDaysRemaining(subscription?.trialEndsAt ?? null, nowMs) : null

  const handleUploadSuccess = () => {
    refetch()
    onSuccess?.()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-16">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> ตั้งค่า
        </button>

        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            เลือกแพ็กเกจที่เหมาะกับคุณ
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mt-1.5">
            ยกระดับการจัดการหอพักด้วย HorSet
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                billingCycle === "monthly"
                  ? "bg-amber-500 text-slate-900 shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              รายเดือน
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                billingCycle === "yearly"
                  ? "bg-amber-500 text-slate-900 shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              รายปี
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                ประหยัด 2 เดือน
              </span>
            </button>
          </div>
        </div>

        {isTrial && trialDaysRemaining !== null && trialDaysRemaining >= 0 && (
          <div className="max-w-2xl mx-auto mb-8 p-4 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 space-y-1.5">
            <p className="text-xs sm:text-sm font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 shrink-0" /> คุณอยู่ในช่วงทดลองใช้ฟรี — เหลือ {trialDaysRemaining} วัน
            </p>
            <p className="text-[11px] sm:text-xs font-semibold text-emerald-700 dark:text-emerald-400 leading-relaxed">
              💚 วันทดลองที่เหลือจะไม่หาย! สมัครแพ็กเกจตอนนี้ — ระบบจะให้ใช้สิทธิ์ทดลองฟรีต่อ {trialDaysRemaining} วัน แล้วค่อยเริ่มนับแพ็กเกจที่เลือกหลังจากนั้น
            </p>
          </div>
        )}

        {plansLoading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm font-semibold">กำลังโหลดแพ็กเกจ...</span>
          </div>
        )}

        {plansError && (
          <div className="max-w-2xl mx-auto flex items-center gap-2 p-4 rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {plansError}
          </div>
        )}

        {!plansLoading && !plansError && plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 max-w-5xl mx-auto">
            {plans
              .filter((plan) => plan.code !== "trial")
              .map((plan) => {
                const isCurrent = subscription?.plan?.id === plan.id
                const isBusiness = plan.code === "business"
                const isPro = plan.code === "pro"
                const price = billingCycle === "yearly" ? plan.priceYearly ?? plan.priceMonthly * 12 : plan.priceMonthly
                const exceedsQuota = plan.maxRooms !== null && roomsUsed > plan.maxRooms

                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-3xl border-2 p-6 bg-white dark:bg-slate-900 transition-all ${
                      isCurrent
                        ? "border-amber-400 shadow-lg shadow-amber-500/10"
                        : isBusiness
                          ? "border-violet-300 dark:border-violet-800"
                          : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    {isCurrent && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-amber-500 text-slate-900 text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                        แพ็กเกจปัจจุบัน
                      </span>
                    )}
                    {!isCurrent && isBusiness && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-violet-600 text-white text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                        ครบสุด
                      </span>
                    )}

                    <h3 className="text-base font-black text-slate-800 dark:text-slate-100">{plan.name}</h3>

                    <div className="mt-2 mb-1">
                      <span className="text-3xl font-black text-slate-900 dark:text-white">
                        ฿{price.toLocaleString("th-TH")}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">
                        {" "}
                        /{billingCycle === "yearly" ? "ปี" : "เดือน"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-semibold mb-5">{formatLimit(plan.maxRooms)}</p>

                    <ul className="space-y-2.5 text-xs mb-6 flex-1">
                      <li className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {formatLimit(plan.maxRooms)}
                      </li>
                      <li className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> ออกบิล PDF + จดมิเตอร์น้ำ-ไฟ
                      </li>
                      {isPro && (
                        <li className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> ทุกอย่างในแผน Starter
                        </li>
                      )}
                      {isBusiness && (
                        <li className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> ทุกอย่างในแผน Pro
                        </li>
                      )}
                      {FEATURE_LABELS.map(({ key, label }) => {
                        const enabled = Boolean(plan.features?.[key])
                        return (
                          <li key={key} className="flex items-center gap-2">
                            {enabled ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <Minus className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 shrink-0" />
                            )}
                            <span className={enabled ? "text-slate-700 dark:text-slate-200 font-semibold" : "text-slate-400"}>
                              {label}
                            </span>
                          </li>
                        )
                      })}
                      <li className="flex items-center gap-2">
                        {plan.maxBuildings === null ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <Minus className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 shrink-0" />
                        )}
                        <span className={plan.maxBuildings === null ? "text-slate-700 dark:text-slate-200 font-semibold" : "text-slate-400"}>
                          Multi-property (หลายอาคารในบัญชีเดียว)
                        </span>
                      </li>
                    </ul>

                    {exceedsQuota && (
                      <div className="mb-4 p-3 rounded-2xl border border-rose-300 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 text-[11px] font-semibold text-rose-600 dark:text-rose-400 leading-relaxed">
                        ห้องของคุณ ({roomsUsed.toLocaleString("th-TH")} ห้อง) เกินจำนวนที่แพ็กเกจนี้รองรับ ({formatLimit(plan.maxRooms)}) — กรุณาลดจำนวนห้อง หรือขอให้ทีมงานติดต่อกลับผ่านช่องทาง &quot;เปิดสิทธิ์ให้ทีม Support เข้าดูชั่วคราว&quot; ในหน้าตั้งค่า
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={exceedsQuota}
                      onClick={() => setPayingPlan(plan)}
                      className={`w-full h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        exceedsQuota
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                          : isCurrent
                            ? "bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-md cursor-pointer"
                            : isBusiness
                              ? "bg-violet-600 hover:bg-violet-500 text-white shadow-md cursor-pointer"
                              : "bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white cursor-pointer"
                      }`}
                    >
                      {exceedsQuota ? (
                        <>
                          <HeartHandshake className="w-4 h-4" /> ห้องเกินโควตา
                        </>
                      ) : isCurrent ? (
                        `เลือกใช้ ${plan.name} ต่อ`
                      ) : (
                        `เลือกแพ็กเกจ ${plan.name}`
                      )}
                    </button>
                  </div>
                )
              })}
          </div>
        )}

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-600 font-semibold mt-10">
          รายเดือนยกเลิกได้ทันที · ต้องการหอ &gt; 500 ห้อง หรือใบเสนอราคาแบบ Business ติดต่อทีมงานผ่านช่องทางสนับสนุนในหน้าตั้งค่า
        </p>
      </div>

      <UploadSlipModal
        isOpen={!!payingPlan}
        workspaceId={workspaceId}
        plan={payingPlan}
        billingCycle={billingCycle}
        onClose={() => setPayingPlan(null)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  )
}