import React from "react"
import { X, Receipt, AlertTriangle } from "lucide-react"
import { useLanguage } from "@/lib/translations/LanguageProvider"

interface CreateBillModalProps {
  isDark: boolean
  createBillModalOpen: boolean
  roomsList: any[]
  newRoomNumber: string
  setNewRoomNumber: (val: string) => void
  billingCycle: string
  elecUnitsManual: number
  setElecUnitsManual: (val: number) => void
  waterUnitsManual: number
  setWaterUnitsManual: (val: number) => void
  otherServiceAmountManual: number
  setOtherServiceAmountManual: (val: number) => void
  rentPrice: number
  commonFee: number
  elecRate: number
  waterRate: number
  electricMinChecked: boolean
  electricMinUnit: number
  waterMinChecked: boolean
  waterMinUnit: number
  computedTotal: number
  rateMissingWarning?: string
  onClose: () => void
  onSubmit: (e: React.FormEvent) => Promise<void>
}

export default function CreateBillModal({
  isDark,
  createBillModalOpen,
  roomsList,
  newRoomNumber,
  setNewRoomNumber,
  billingCycle,
  elecUnitsManual,
  setElecUnitsManual,
  waterUnitsManual,
  setWaterUnitsManual,
  otherServiceAmountManual,
  setOtherServiceAmountManual,
  rentPrice,
  commonFee,
  elecRate,
  waterRate,
  electricMinChecked,
  electricMinUnit,
  waterMinChecked,
  waterMinUnit,
  computedTotal,
  rateMissingWarning,
  onClose,
  onSubmit
}: CreateBillModalProps) {
  const { t } = useLanguage()
  if (!createBillModalOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div
        className={`w-full max-w-md max-h-[90vh] p-5 md:p-6 rounded-3xl relative shadow-2xl animate-scale-up border ${
          isDark ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-200"
        }`}
        style={{ overflowY: "auto" }}
      >
        <button
          onClick={onClose}
          className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
            isDark ? "text-slate-400 hover:text-white hover:bg-slate-900/50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
          <Receipt className={`w-5 h-5 ${isDark ? "text-blue-400" : "text-blue-500"}`} /> {t("manage_bills.cbm_title")}
        </h3>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("dashboard.col_room")}</label>
              <select
                className={`w-full h-11 md:h-10 px-3 border rounded-xl focus:outline-none focus:border-blue-500 text-sm md:text-xs font-semibold cursor-pointer ${
                  isDark ? "bg-slate-950 text-slate-100 border-slate-800" : "bg-white text-slate-800 border-slate-300"
                }`}
                value={newRoomNumber}
                onChange={(e) => setNewRoomNumber(e.target.value)}
              >
                {roomsList.map(r => (
                  <option key={r.roomNumber} value={r.roomNumber} className={isDark ? "bg-slate-900 text-slate-200" : "bg-white text-slate-800"}>{t("billing.room_label").replace("{roomNumber}", r.roomNumber)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("manage_bills.cycle_prefix")}</label>
              <input
                type="text"
                disabled
                className={`w-full h-11 md:h-10 px-3 border rounded-xl text-sm md:text-xs font-mono font-bold ${
                  isDark ? "bg-slate-950/40 border-slate-800/60 text-slate-500" : "bg-slate-100 border-slate-200 text-slate-400"
                }`}
                value={billingCycle}
              />
            </div>
          </div>

          {/* มิเตอร์ปัจจุบัน */}
          <div className={`grid grid-cols-2 gap-3 p-4 rounded-xl border space-y-0.5 ${
            isDark ? "bg-slate-900/40 border-slate-800/60" : "bg-slate-50 border-slate-200"
          }`}>
            <div className="space-y-1">
              <label className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("manage_bills.cbm_elec_units_label")}</label>
              <div className="relative">
                <input
                  type="number"
                  className={`w-full h-11 md:h-10 px-3 border rounded-xl text-sm md:text-xs font-mono font-bold focus:outline-none focus:border-blue-500 ${
                    isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
                  }`}
                  value={elecUnitsManual}
                  onChange={(e) => setElecUnitsManual(Number(e.target.value))}
                />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"}`}>{t("manage_bills.cbm_unit_suffix")}</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("manage_bills.cbm_water_units_label")}</label>
              <div className="relative">
                <input
                  type="number"
                  className={`w-full h-11 md:h-10 px-3 border rounded-xl text-sm md:text-xs font-mono font-bold focus:outline-none focus:border-teal-500 ${
                    isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
                  }`}
                  value={waterUnitsManual}
                  onChange={(e) => setWaterUnitsManual(Number(e.target.value))}
                />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"}`}>{t("manage_bills.cbm_unit_suffix")}</span>
              </div>
            </div>
          </div>

          {rateMissingWarning && (
            <div className={`p-3 rounded-xl border flex items-start gap-2 text-xs font-semibold ${
              isDark ? "bg-amber-950/30 border-amber-900/50 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{rateMissingWarning}</span>
            </div>
          )}

          {/* ค่าบริการอื่น ๆ */}
          <div className="space-y-1">
            <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("manage_bills.cbm_other_service_label")}</label>
            <div className="relative">
              <input
                type="number"
                className={`w-full h-11 md:h-10 px-3 border rounded-xl text-sm md:text-xs font-mono font-bold focus:outline-none focus:border-violet-500 ${
                  isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
                }`}
                placeholder="0"
                value={otherServiceAmountManual || ""}
                onChange={(e) => setOtherServiceAmountManual(Number(e.target.value))}
              />
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"}`}>{t("daily_bills.baht_unit")}</span>
            </div>
          </div>

          {/* สรุปยอดราคาจำลอง */}
          <div className={`p-4 rounded-xl border text-xs space-y-2 font-medium ${
            isDark ? "bg-blue-950/20 border-blue-900/40" : "bg-blue-50/50 border-blue-100"
          }`}>
            <div className="flex justify-between">
              <span className={isDark ? "text-slate-400" : "text-slate-500"}>{t("manage_bills.cbm_rent_label")}</span>
              <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>{rentPrice.toLocaleString()} {t("daily_bills.baht_unit")}</span>
            </div>
            <div className="flex justify-between">
              <span className={isDark ? "text-slate-400" : "text-slate-500"}>{t("manage_bills.cbm_common_fee_label")}</span>
              <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>{commonFee.toLocaleString()} {t("daily_bills.baht_unit")}</span>
            </div>
            <div className="flex justify-between">
              <span className={isDark ? "text-slate-400" : "text-slate-500"}>{t("manage_bills.cbm_elec_cost_label").replace("{units}", String(elecUnitsManual))}</span>
              <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                {electricMinChecked && elecUnitsManual <= electricMinUnit
                  ? t("manage_bills.cbm_min_note").replace("{amount}", (electricMinUnit * elecRate).toLocaleString()).replace("{min}", String(electricMinUnit))
                  : t("manage_bills.cbm_rate_note").replace("{amount}", (elecUnitsManual * elecRate).toLocaleString()).replace("{rate}", String(elecRate))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={isDark ? "text-slate-400" : "text-slate-500"}>{t("manage_bills.cbm_water_cost_label").replace("{units}", String(waterUnitsManual))}</span>
              <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                {waterMinChecked && waterUnitsManual <= waterMinUnit
                  ? t("manage_bills.cbm_min_note").replace("{amount}", (waterMinUnit * waterRate).toLocaleString()).replace("{min}", String(waterMinUnit))
                  : t("manage_bills.cbm_rate_note").replace("{amount}", (waterUnitsManual * waterRate).toLocaleString()).replace("{rate}", String(waterRate))}
              </span>
            </div>
            {otherServiceAmountManual > 0 && (
              <div className="flex justify-between">
                <span className={isDark ? "text-slate-400" : "text-slate-500"}>{t("manage_bills.cbm_other_service_summary_label")}</span>
                <span className={`font-semibold ${isDark ? "text-violet-400" : "text-violet-600"}`}>
                  {otherServiceAmountManual.toLocaleString()} {t("daily_bills.baht_unit")}
                </span>
              </div>
            )}
            <div className={`h-px my-1.5 ${isDark ? "bg-slate-800/80" : "bg-slate-200"}`} />
            <div className={`flex justify-between font-extrabold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
              <span>{t("manage_bills.cbm_net_total_label")}</span>
              <span className={`text-sm font-black ${isDark ? "text-blue-400" : "text-blue-600"}`}>{computedTotal.toLocaleString()} {t("daily_bills.baht_unit")}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!!rateMissingWarning}
            className="w-full h-12 md:h-10 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm md:text-xs font-bold shadow-lg shadow-blue-600/15 active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer"
          >
            {t("manage_bills.cbm_submit_btn")}
          </button>
        </form>
      </div>
    </div>
  )
}
