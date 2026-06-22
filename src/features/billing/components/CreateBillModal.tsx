import React from "react"
import { X, Receipt } from "lucide-react"

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
  onClose,
  onSubmit
}: CreateBillModalProps) {
  if (!createBillModalOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className={`w-full max-w-md max-h-[90vh] overflow-y-auto p-5 md:p-6 rounded-3xl relative shadow-2xl animate-scale-up border ${
        isDark ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-200"
      }`}>
        <button
          onClick={onClose}
          className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
            isDark ? "text-slate-400 hover:text-white hover:bg-slate-900/50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
          <Receipt className={`w-5 h-5 ${isDark ? "text-blue-400" : "text-blue-500"}`} /> สร้างใบแจ้งหนี้จำลองพิเศษ
        </h3>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>ห้องพัก</label>
              <select
                className={`w-full h-11 md:h-10 px-3 border rounded-xl focus:outline-none focus:border-blue-500 text-sm md:text-xs font-semibold cursor-pointer ${
                  isDark ? "bg-slate-950 text-slate-100 border-slate-800" : "bg-white text-slate-800 border-slate-300"
                }`}
                value={newRoomNumber}
                onChange={(e) => setNewRoomNumber(e.target.value)}
              >
                {roomsList.map(r => (
                  <option key={r.roomNumber} value={r.roomNumber} className={isDark ? "bg-slate-900 text-slate-200" : "bg-white text-slate-800"}>ห้อง {r.roomNumber}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>รอบบิล</label>
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
              <label className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>หน่วยไฟที่ใช้</label>
              <div className="relative">
                <input
                  type="number"
                  className={`w-full h-11 md:h-10 px-3 border rounded-xl text-sm md:text-xs font-mono font-bold focus:outline-none focus:border-blue-500 ${
                    isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
                  }`}
                  value={elecUnitsManual}
                  onChange={(e) => setElecUnitsManual(Number(e.target.value))}
                />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"}`}>หน่วย</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>หน่วยน้ำที่ใช้</label>
              <div className="relative">
                <input
                  type="number"
                  className={`w-full h-11 md:h-10 px-3 border rounded-xl text-sm md:text-xs font-mono font-bold focus:outline-none focus:border-teal-500 ${
                    isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
                  }`}
                  value={waterUnitsManual}
                  onChange={(e) => setWaterUnitsManual(Number(e.target.value))}
                />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"}`}>หน่วย</span>
              </div>
            </div>
          </div>

          {/* ค่าบริการอื่น ๆ */}
          <div className="space-y-1">
            <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>ค่าบริการอื่น ๆ (บาท)</label>
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
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"}`}>บาท</span>
            </div>
          </div>

          {/* สรุปยอดราคาจำลอง */}
          <div className={`p-4 rounded-xl border text-xs space-y-2 font-medium ${
            isDark ? "bg-blue-950/20 border-blue-900/40" : "bg-blue-50/50 border-blue-100"
          }`}>
            <div className="flex justify-between">
              <span className={isDark ? "text-slate-400" : "text-slate-500"}>ค่าห้องแอร์/พัดลมปกติ:</span>
              <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>{rentPrice.toLocaleString()} บาท</span>
            </div>
            <div className="flex justify-between">
              <span className={isDark ? "text-slate-400" : "text-slate-500"}>ค่าส่วนกลาง (Fixed Common Fee):</span>
              <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>{commonFee.toLocaleString()} บาท</span>
            </div>
            <div className="flex justify-between">
              <span className={isDark ? "text-slate-400" : "text-slate-500"}>ค่าไฟฟ้า ({elecUnitsManual} หน่วย):</span>
              <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                {electricMinChecked && elecUnitsManual <= electricMinUnit
                  ? `${(electricMinUnit * elecRate).toLocaleString()} บาท (ขั้นต่ำ ${electricMinUnit} หน่วย)`
                  : `${(elecUnitsManual * elecRate).toLocaleString()} บาท (หน่วยละ ${elecRate}.-)`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={isDark ? "text-slate-400" : "text-slate-500"}>ค่าน้ำประปา ({waterUnitsManual} หน่วย):</span>
              <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                {waterMinChecked && waterUnitsManual <= waterMinUnit
                  ? `${(waterMinUnit * waterRate).toLocaleString()} บาท (ขั้นต่ำ ${waterMinUnit} หน่วย)`
                  : `${(waterUnitsManual * waterRate).toLocaleString()} บาท (หน่วยละ ${waterRate}.-)`}
              </span>
            </div>
            {otherServiceAmountManual > 0 && (
              <div className="flex justify-between">
                <span className={isDark ? "text-slate-400" : "text-slate-500"}>ค่าบริการอื่น ๆ:</span>
                <span className={`font-semibold ${isDark ? "text-violet-400" : "text-violet-600"}`}>
                  {otherServiceAmountManual.toLocaleString()} บาท
                </span>
              </div>
            )}
            <div className={`h-px my-1.5 ${isDark ? "bg-slate-800/80" : "bg-slate-200"}`} />
            <div className={`flex justify-between font-extrabold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
              <span>ยอดสุทธิที่ต้องชำระ:</span>
              <span className={`text-sm font-black ${isDark ? "text-blue-400" : "text-blue-600"}`}>{computedTotal.toLocaleString()} บาท</span>
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-12 md:h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm md:text-xs font-bold shadow-lg shadow-blue-600/15 active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer"
          >
            คำนวณเงินและออกบิลค้างชำระ
          </button>
        </form>
      </div>
    </div>
  )
}
