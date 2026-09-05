"use client"

import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  ChevronDown,
  Droplet,
  History,
  Receipt,
  ShieldCheck,
  Zap
} from "lucide-react"
import { resolveBillLines, type BillLineInput } from "@/lib/billLines"
import { formatSegmentRoomLabel } from "@/lib/billSegments"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { DynamicText } from "@/lib/translations/DynamicText"
import { LanguageToggle } from "@/components/LanguageToggle"
import { ThemeToggle } from "@/components/ThemeToggle"
import { usePortalData } from "../PortalDataProvider"

/**
 * ประวัติบิลย้อนหลังพร้อมรายละเอียดการใช้มิเตอร์
 *
 * ข้อมูลมาจาก PortalDataProvider ที่ layout — ไม่ยิง server action ซ้ำเวลาสลับมาจากหน้า /portal
 * (บิลทุกใบพร้อมเลขมิเตอร์และ snapshot ถูกส่งมาตั้งแต่การโหลดครั้งแรกอยู่แล้ว)
 *
 * ตัวเลขทุกบรรทัดตัดสินด้วย resolveBillLines() ตัวเดียวกับที่ใช้พิมพ์ PDF เพื่อให้บิลเก่าแสดง
 * "เรตของเดือนนั้น" ไม่ใช่เรตปัจจุบัน — หอขึ้นค่าไฟแล้วประวัติย้อนหลังต้องไม่เปลี่ยนตาม
 */

/** เท่าที่หน้านี้ใช้จากบิลหนึ่งใบ (รูปแบบเดียวกับที่ getTenantPortalData* ส่งกลับมา) */
type PortalBill = {
  id?: string
  billingCycle?: string
  amount?: number
  status?: string
  invoiceId?: string
  billKind?: string
  electricUnits?: number
  waterUnits?: number
  elecPrev?: number | null
  elecCurr?: number | null
  waterPrev?: number | null
  waterCurr?: number | null
  hasSnapshot?: boolean
  baseRent?: number
  electricAmount?: number
  waterAmount?: number
  electricRate?: number
  waterRate?: number
  commonFee?: number
  penaltyAmount?: number
  lateDays?: number
  otherServiceAmount?: number
  vatAmount?: number
  extraExpenses?: { name?: string; amount?: number }[]
  elecMinApplied?: boolean
  waterMinApplied?: boolean
  electricMinUnitSnapshot?: number
  waterMinUnitSnapshot?: number
  utilitySegments?: unknown
}

/** ค่าตั้งค่าปัจจุบันของหอ ใช้กับบิลเก่าที่ยังไม่มี snapshot */
type PortalDefaults = {
  electricRate?: number
  waterRate?: number
  commonFee?: number
  waterMinChecked?: boolean
  waterMinUnit?: number
  electricMinChecked?: boolean
  electricMinUnit?: number
  waiveElectricMin?: boolean
  waiveWaterMin?: boolean
  roomNumber?: string
  tenantName?: string
  bills?: PortalBill[]
}

function PortalHistoryContent() {
  const { t } = useLanguage()
  const { result, loading } = usePortalData()
  const searchParams = useSearchParams()
  const [openBillId, setOpenBillId] = useState<string | null>(null)

  const data = (result?.success ? result.data : null) as PortalDefaults | null
  const bills = useMemo(() => (data?.bills ?? []) as PortalBill[], [data])

  /**
   * โหลดข้อมูลไม่สำเร็จ (ลิงก์หมดอายุ / token ไม่ถูกต้อง / ห้องถูกลบ)
   *
   * ต้องแยกจากเคส "ยังไม่มีบิล" ให้ชัด ไม่งั้นผู้เช่าที่ถือลิงก์เสียจะเห็นข้อความว่า
   * หอยังไม่ออกบิล แล้วนั่งรอเก้อทั้งที่ปัญหาอยู่ที่ลิงก์
   */
  const loadError = useMemo(() => {
    if (!result || result.success) return ""
    const withError = result as { error?: string }
    return withError.error || t("tenant_portal.history_error_desc")
  }, [result, t])

  const formatCycle = (cycleStr: string) => {
    if (!cycleStr || !cycleStr.includes("-")) return cycleStr || "-"
    const [year, month] = cycleStr.split("-")
    const monthIdx = parseInt(month, 10) - 1
    if (monthIdx < 0 || monthIdx > 11) return cycleStr
    return `${t("dashboard.month_" + month)} ${year}`
  }

  const buildLines = (bill: PortalBill) => {
    const input: BillLineInput = {
      hasSnapshot: bill.hasSnapshot,
      amount: Number(bill.amount ?? 0),
      baseRent: Number(bill.baseRent ?? 0),
      electricUnits: Number(bill.electricUnits ?? 0),
      electricRate: Number(bill.electricRate ?? data?.electricRate ?? 0),
      waterUnits: Number(bill.waterUnits ?? 0),
      waterRate: Number(bill.waterRate ?? data?.waterRate ?? 0),
      commonFee: Number(bill.commonFee ?? data?.commonFee ?? 0),
      penaltyAmount: Number(bill.penaltyAmount ?? 0),
      otherServiceAmount: Number(bill.otherServiceAmount ?? 0),
      vatAmount: Number(bill.vatAmount ?? 0),
      extraExpenses: bill.extraExpenses ?? [],
      electricAmount: bill.electricAmount,
      waterAmount: bill.waterAmount,
      elecMinApplied: bill.elecMinApplied,
      waterMinApplied: bill.waterMinApplied,
      waterMinChecked: data?.waterMinChecked,
      waterMinUnit: bill.waterMinUnitSnapshot ?? data?.waterMinUnit,
      electricMinChecked: data?.electricMinChecked,
      electricMinUnit: bill.electricMinUnitSnapshot ?? data?.electricMinUnit,
      waiveElectricMin: data?.waiveElectricMin,
      waiveWaterMin: data?.waiveWaterMin,
      utilitySegments: bill.utilitySegments
    }
    return resolveBillLines(input)
  }

  const statusBadge = (status?: string) => {
    if (status === "paid") {
      return { label: t("tenant_portal.status_paid_history"), className: "bg-teal-500/10 text-teal-500" }
    }
    if (status === "pending") {
      return { label: t("tenant_portal.status_pending_history"), className: "bg-amber-500/10 text-amber-500" }
    }
    return { label: t("dashboard.status_overdue"), className: "bg-red-500/10 text-red-500" }
  }

  /**
   * ลิงก์กลับหน้าบิล โดยพา workspace_id/room_id/token เดิมไปด้วย ไม่งั้นหน้านั้นจะหาห้องไม่เจอ
   *
   * อ่านผ่าน useSearchParams ไม่ใช่ window.location เพราะ window ไม่มีตอน SSR
   * ถ้าแยกสองทางจะได้ href คนละค่าระหว่างฝั่ง server กับ client แล้ว hydration ไม่ตรงกัน
   */
  const backHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("action")
    const qs = params.toString()
    return qs ? `/portal?${qs}` : "/portal"
  }, [searchParams])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 font-sans pb-12">
      <header className="glass-panel border-b border-slate-200/60 dark:border-slate-900/60 px-4 py-4 sticky top-0 z-20 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={backHref}
            className="p-2 -ml-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors shrink-0"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-bold flex items-center gap-1.5 min-w-0">
              <History className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="truncate">{t("tenant_portal.history_title")}</span>
            </h1>
            {data?.roomNumber && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {t("tenant_portal.room_prefix_label").replace("{room}", data.roomNumber)}
                {data.tenantName ? <> · <DynamicText>{data.tenantName}</DynamicText></> : null}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* คุมความกว้างที่ div ข้างใน ไม่ใช่ที่ <main> เพราะ globals.css มีกฎ
          main { max-width: 100% !important } ที่ทับคลาส max-w-* ของ Tailwind ทิ้ง */}
      <main>
        <div className="max-w-md mx-auto px-4 pt-6 space-y-3">
        {loading && bills.length === 0 && (
          <div className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-8 text-center">
            <div className="w-10 h-10 mx-auto rounded-full border-4 border-slate-300 dark:border-slate-900 border-t-indigo-500 animate-spin" />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">{t("tenant_portal.loading_bill")}</p>
          </div>
        )}

        {!loading && loadError && (
          <div className="glass-card rounded-2xl border border-rose-500/25 bg-rose-500/5 p-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold">{t("tenant_portal.history_error_title")}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
              {loadError}
            </p>
          </div>
        )}

        {!loading && !loadError && bills.length === 0 && (
          <div className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
              <Receipt className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold">{t("tenant_portal.history_empty_title")}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
              {t("tenant_portal.history_empty_desc")}
            </p>
          </div>
        )}

        {bills.map((bill, idx) => {
          const key = bill.id || `${bill.billingCycle}-${idx}`
          const isOpen = openBillId === key
          const lines = buildLines(bill)
          const badge = statusBadge(bill.status)
          const elecUnits = Number(bill.electricUnits ?? 0)
          const waterUnits = Number(bill.waterUnits ?? 0)
          const hasElecRange = bill.elecPrev !== null && bill.elecPrev !== undefined
            && bill.elecCurr !== null && bill.elecCurr !== undefined
          const hasWaterRange = bill.waterPrev !== null && bill.waterPrev !== undefined
            && bill.waterCurr !== null && bill.waterCurr !== undefined

          return (
            <div
              key={key}
              className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 overflow-hidden"
            >
              {/* แถวสรุป — กดเพื่อกางรายละเอียด */}
              <button
                onClick={() => setOpenBillId(isOpen ? null : key)}
                className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-100/50 dark:hover:bg-slate-900/40 transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-sm font-bold truncate">{formatCycle(bill.billingCycle || "")}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    <Zap className="w-3 h-3 inline text-amber-500" /> {elecUnits} {t("tenant_portal.unit_short")}
                    {"  ·  "}
                    <Droplet className="w-3 h-3 inline text-teal-500" /> {waterUnits} {t("tenant_portal.unit_short")}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right space-y-1">
                    <p className="text-sm font-bold">
                      {Number(bill.amount ?? 0).toLocaleString()} {t("daily_bills.baht_unit")}
                    </p>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {/* รายละเอียดบิลใบนั้น */}
              {isOpen && (
                <div className="px-4 pb-4 space-y-2.5 text-xs border-t border-slate-200/70 dark:border-slate-900/70 pt-3.5">
                  {bill.invoiceId && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-slate-400">{t("tenant_portal.invoice_id_label")}</span>
                      <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 rounded">
                        {bill.invoiceId}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/70 dark:border-slate-900/70">
                    <span className="text-slate-500 dark:text-slate-400">{t("tenant_portal.item_rent")}</span>
                    <span className="font-semibold">{lines.rent.toLocaleString()} {t("daily_bills.baht_unit")}</span>
                  </div>

                  {/* ค่าไฟ + เลขมิเตอร์ */}
                  <div className="flex justify-between items-start pb-2 border-b border-slate-200/70 dark:border-slate-900/70">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <span>{t("tenant_portal.item_electric")}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 pl-5">
                        {hasElecRange
                          ? t("tenant_portal.electric_meter_reading")
                              .replace("{prev}", String(bill.elecPrev))
                              .replace("{curr}", String(bill.elecCurr))
                              .replace("{units}", String(elecUnits))
                          : t("tenant_portal.electric_units_used").replace("{units}", String(elecUnits))}
                      </p>
                      <p className="text-[10px] text-slate-400 pl-5">
                        {lines.elecIsMin
                          ? t("tenant_portal.min_charge_note").replace("{units}", String(lines.elecMinUnit))
                          : `${lines.elecRateDisplay} ${t("tenant_portal.per_unit_short")}`}
                      </p>
                    </div>
                    <span className="font-semibold shrink-0">{lines.elecAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
                  </div>

                  {/* ค่าน้ำ + เลขมิเตอร์ */}
                  <div className="flex justify-between items-start pb-2 border-b border-slate-200/70 dark:border-slate-900/70">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Droplet className="w-3.5 h-3.5 text-teal-500" />
                        <span>{t("tenant_portal.item_water")}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 pl-5">
                        {hasWaterRange
                          ? t("tenant_portal.water_meter_reading")
                              .replace("{prev}", String(bill.waterPrev))
                              .replace("{curr}", String(bill.waterCurr))
                              .replace("{units}", String(waterUnits))
                          : t("tenant_portal.water_units_used").replace("{units}", String(waterUnits))}
                      </p>
                      <p className="text-[10px] text-slate-400 pl-5">
                        {lines.waterIsMin
                          ? t("tenant_portal.min_charge_note").replace("{units}", String(lines.waterMinUnit))
                          : `${lines.waterRateDisplay} ${t("tenant_portal.per_unit_short")}`}
                      </p>
                    </div>
                    <span className="font-semibold shrink-0">{lines.waterAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
                  </div>

                  {lines.commonFee > 0 && (
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200/70 dark:border-slate-900/70">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{t("tenant_portal.item_common_fee")}</span>
                      </div>
                      <span className="font-semibold">{lines.commonFee.toLocaleString()} {t("daily_bills.baht_unit")}</span>
                    </div>
                  )}

                  {/* ค่าใช้จ่ายอื่นที่บันทึกไว้ในบิลใบนั้น */}
                  {(bill.extraExpenses ?? []).map((item, i) => (
                    <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-200/70 dark:border-slate-900/70">
                      <span className="text-slate-500 dark:text-slate-400 truncate pr-2">
                        <DynamicText>{item.name || "-"}</DynamicText>
                      </span>
                      <span className="font-semibold shrink-0">
                        {Number(item.amount ?? 0).toLocaleString()} {t("daily_bills.baht_unit")}
                      </span>
                    </div>
                  ))}

                  {/* รายการของห้องเดิมที่ยกมารวม (เฉพาะบิลรอบที่ย้ายห้องกลางเดือน) */}
                  {lines.segments.map((seg, i) => (
                    <div key={`seg-${i}`} className="flex justify-between items-center pb-2 border-b border-slate-200/70 dark:border-slate-900/70">
                      <span className="text-slate-500 dark:text-slate-400 truncate pr-2">
                        {formatSegmentRoomLabel(seg)}
                      </span>
                      <span className="font-semibold shrink-0">
                        {(seg.rentAmount + seg.elecAmount + seg.waterAmount).toLocaleString()}{" "}
                        {t("daily_bills.baht_unit")}
                      </span>
                    </div>
                  ))}

                  {lines.penaltyAmount > 0 && (
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200/70 dark:border-slate-900/70">
                      <span className="text-red-500">
                        {t("tenant_portal.penalty_label")}
                        {bill.lateDays ? ` (${bill.lateDays} ${t("tenant_portal.day_short")})` : ""}
                      </span>
                      <span className="font-semibold text-red-500">
                        {lines.penaltyAmount.toLocaleString()} {t("daily_bills.baht_unit")}
                      </span>
                    </div>
                  )}

                  {lines.vatAmount > 0 && (
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200/70 dark:border-slate-900/70">
                      <span className="text-slate-500 dark:text-slate-400">{t("tenant_portal.vat_label")}</span>
                      <span className="font-semibold">{lines.vatAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-1">
                    <span className="font-bold">{t("tenant_portal.total_label")}</span>
                    <span className="text-base font-bold text-blue-600 dark:text-blue-400">
                      {Number(bill.amount ?? 0).toLocaleString()} {t("daily_bills.baht_unit")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        </div>
      </main>
    </div>
  )
}


/** useSearchParams ต้องอยู่ใต้ Suspense ไม่งั้น Next บังคับให้ทั้งหน้าเป็น dynamic */
export default function PortalHistoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-[#070b14]" />}>
      <PortalHistoryContent />
    </Suspense>
  )
}
