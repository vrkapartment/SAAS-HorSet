"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Check, Loader2, Minus } from "lucide-react"
import { listSaasPlans, type SaasPlan } from "@/features/subscription/actions"

interface PricingTableProps {
  /** ถ้าไม่ส่งมา component จะดึงข้อมูลแผนเองผ่าน listSaasPlans() */
  plans?: SaasPlan[]
  onSelectPlan: (planId: string, billingCycle: "monthly" | "yearly") => void
  selectedPlanId?: string
}

type FeatureKey = keyof NonNullable<SaasPlan["features"]>

const FEATURE_LABELS: Array<{ key: FeatureKey; label: string }> = [
  { key: "line_notify", label: "แจ้งเตือนบิลผ่าน LINE" },
  { key: "tax_export", label: "Export รายงานภาษี ภ.ง.ด. 94/90" },
  { key: "slipok_auto_verify", label: "ตรวจสอบสลิปอัตโนมัติด้วย SlipOK" }
]

function formatLimit(value: number | null): string {
  return value === null ? "ไม่จำกัด" : value.toLocaleString("th-TH")
}

export default function PricingTable({ plans: plansProp, onSelectPlan, selectedPlanId }: PricingTableProps) {
  const [plans, setPlans] = useState<SaasPlan[] | null>(plansProp ?? null)
  const [loading, setLoading] = useState(!plansProp)
  const [error, setError] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")

  useEffect(() => {
    if (plansProp) {
      setPlans(plansProp)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    listSaasPlans()
      .then((res) => {
        if (cancelled) return
        if (res.success) {
          setPlans(res.data || [])
        } else {
          setError(res.error || "ไม่สามารถดึงข้อมูลแผนการใช้งานได้")
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูลแผนการใช้งาน")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [plansProp])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm font-semibold">กำลังโหลดแผนการใช้งาน...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-sm font-semibold">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {error}
      </div>
    )
  }

  if (!plans || plans.length === 0) {
    return <div className="p-6 text-center text-sm text-slate-400">ยังไม่มีแผนการใช้งานที่เปิดขายในขณะนี้</div>
  }

  return (
    <div className="w-full space-y-6">
      {/* สลับ รายเดือน / รายปี */}
      <div className="flex justify-center">
        <div className="inline-flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              billingCycle === "monthly"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            รายเดือน
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              billingCycle === "yearly"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            รายปี <span className="text-emerald-500 ml-1">ประหยัดกว่า</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {plans.map((plan) => {
          const price = billingCycle === "yearly" ? plan.priceYearly ?? plan.priceMonthly * 12 : plan.priceMonthly
          const isSelected = selectedPlanId === plan.id
          const isPro = plan.code === "pro"

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border p-5 transition-all ${
                isPro
                  ? "border-blue-500 shadow-lg shadow-blue-500/10 bg-white dark:bg-slate-900"
                  : "border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60"
              } ${isSelected ? "ring-2 ring-blue-500" : ""}`}
            >
              {isPro && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider">
                  แนะนำ
                </span>
              )}

              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">{plan.name}</h3>

              <div className="mt-3 mb-4">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {price === 0 ? "ฟรี" : price.toLocaleString("th-TH")}
                </span>
                {price > 0 && (
                  <span className="text-xs text-slate-400 font-semibold">
                    {" "}
                    บาท/{billingCycle === "yearly" ? "ปี" : "เดือน"}
                  </span>
                )}
              </div>

              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 mb-5">
                <li>
                  ห้องพักสูงสุด: <span className="font-bold">{formatLimit(plan.maxRooms)}</span>
                </li>
                <li>
                  บัญชี Staff สูงสุด: <span className="font-bold">{formatLimit(plan.maxStaff)}</span>
                </li>
                <li>
                  อาคารสูงสุด: <span className="font-bold">{formatLimit(plan.maxBuildings)}</span>
                </li>
              </ul>

              <div className="border-t border-dashed border-slate-200 dark:border-slate-800 pt-3 mb-5 space-y-2">
                {FEATURE_LABELS.map(({ key, label }) => {
                  const enabled = Boolean(plan.features?.[key])
                  return (
                    <div key={key} className="flex items-center gap-2 text-[11px]">
                      {enabled ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 shrink-0" />
                      )}
                      <span className={enabled ? "text-slate-700 dark:text-slate-200 font-semibold" : "text-slate-400"}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => onSelectPlan(plan.id, billingCycle)}
                className={`mt-auto w-full h-10 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isPro
                    ? "bg-blue-600 hover:bg-blue-500 text-white shadow-md"
                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                }`}
              >
                เลือกแผนนี้
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
