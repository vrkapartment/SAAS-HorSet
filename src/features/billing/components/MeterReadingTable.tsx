import React from "react"
import { Save, Eye, Download, Send, CheckCircle, RefreshCw, Zap, Droplet, Sparkles } from "lucide-react"

interface MeterReadingTableProps {
  isDark: boolean
  loading: boolean
  unifiedItems: any[]
  commonFee: number
  electricMinChecked: boolean
  electricMinUnit: number
  elecRate: number
  waterMinChecked: boolean
  waterMinUnit: number
  waterRate: number
  currentUserRole: string | null
  downloadingPdfId: string | null
  handleElecPrevChange: (roomNumber: string, value: string) => void
  handleElecChange: (roomNumber: string, value: string) => void
  handleWaterPrevChange: (roomNumber: string, value: string) => void
  handleWaterChange: (roomNumber: string, value: string) => void
  handleSaveRow: (roomNumber: string) => Promise<void>
  setSelectedBill: (item: any) => void
  setSlipModalOpen: (open: boolean) => void
  handleDownloadBillPdf: (item: any) => Promise<void>
  handleSendLine: (roomNumber: string) => void | Promise<void>
  handleMarkAsPaid: (billId: string, roomNumber: string) => Promise<void>
  handleSaveAll: () => Promise<void>
}

export default function MeterReadingTable({
  isDark,
  loading,
  unifiedItems,
  commonFee,
  electricMinChecked,
  electricMinUnit,
  elecRate,
  waterMinChecked,
  waterMinUnit,
  waterRate,
  currentUserRole,
  downloadingPdfId,
  handleElecPrevChange,
  handleElecChange,
  handleWaterPrevChange,
  handleWaterChange,
  handleSaveRow,
  setSelectedBill,
  setSlipModalOpen,
  handleDownloadBillPdf,
  handleSendLine,
  handleMarkAsPaid,
  handleSaveAll
}: MeterReadingTableProps) {
  return (
    <>
      {/* แจ้งเตือน */}
      <div className={`flex items-center gap-2.5 p-3.5 border rounded-xl text-xs font-medium ${
        isDark 
          ? "bg-blue-950/10 border-blue-500/20 text-blue-400/90" 
          : "bg-blue-50/60 border-blue-100 text-blue-700"
      }`}>
        <Sparkles className={`w-4 h-4 shrink-0 ${isDark ? "text-blue-400" : "text-blue-500"}`} />
        <span>ระบบจำลองการประมวลผลดึงค่ามิเตอร์ครั้งก่อนหน้าและราคาค่าเช่าอิงตาม Room Type โดยอัตโนมัติ กรอกเพียงเลขมิเตอร์ปัจจุบันเพื่อสร้างบิล</span>
      </div>

      {/* ตารางควบคุมหลัก */}
      <div className={`p-0 md:p-5 bg-transparent md:rounded-2xl md:shadow-sm ${
        isDark 
          ? "md:bg-slate-900/30 md:border md:border-slate-800/80" 
          : "md:bg-white md:border md:border-slate-200"
      }`}>
        {/* Mobile View: Card List (< 768px) */}
        <div className="block md:hidden space-y-4">
          {loading ? (
            <div className="py-12 text-center text-slate-500 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/60 rounded-2xl shadow-sm">
              <div className="flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                <span>กำลังโหลดข้อมูลรวม...</span>
              </div>
            </div>
          ) : unifiedItems.length > 0 ? (
            unifiedItems.map((item) => {
              const hasElecCurr = item.elecCurr !== "" && item.elecCurr !== null && item.elecCurr !== undefined
              const elecUnitsUsed = hasElecCurr ? Number(item.elecCurr) - Number(item.elecPrev) : 0
              const elecCost = hasElecCurr && elecUnitsUsed >= 0
                ? (electricMinChecked && elecUnitsUsed <= electricMinUnit ? electricMinUnit * elecRate : elecUnitsUsed * elecRate)
                : 0

              const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
              const waterUnitsUsed = hasWaterCurr ? Number(item.waterCurr) - Number(item.waterPrev) : 0
              const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                ? (waterMinChecked && waterUnitsUsed <= waterMinUnit ? waterMinUnit * waterRate : waterUnitsUsed * waterRate)
                : 0
              
              const calculatedAmount = item.baseRent + elecCost + waterCost + commonFee
              const isModified = item.billStatus !== "not_created" && item.billAmount !== calculatedAmount

              return (
                <div key={item.roomNumber} className={`p-4 rounded-2xl border space-y-4 shadow-sm ${
                  isDark ? "bg-slate-950/35 border-slate-900/60" : "bg-white border-slate-200"
                }`}>
                  {/* Card Header: Room, Tenant, Status */}
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-black px-3 py-1 rounded-xl border ${
                          isDark ? "text-slate-100 bg-slate-900 border-slate-800" : "text-slate-800 bg-slate-100 border-slate-200"
                        }`}>
                          {item.roomNumber}
                        </span>
                        <span className={`inline-block text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                          item.billStatus === "paid" ? (isDark ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border border-emerald-200") :
                          item.billStatus === "pending" ? (isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse" : "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse") :
                          item.billStatus === "unpaid" ? (isDark ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-rose-50 text-rose-600 border border-rose-200") :
                          (isDark ? "bg-slate-900 text-slate-400 border border-slate-800" : "bg-slate-100 text-slate-500 border border-slate-250")
                        }`}>
                          {item.billStatus === "paid" ? "ชำระเงินแล้ว" :
                           item.billStatus === "pending" ? "รอตรวจสลิป" :
                           item.billStatus === "unpaid" ? "ค้างชำระ" : "ยังไม่ออกบิล"}
                        </span>
                      </div>
                      <div className={`font-bold mt-2 ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                        {item.tenantName || <span className={isDark ? "text-slate-600 italic" : "text-slate-400 italic"}>ไม่มีข้อมูลผู้เช่า</span>}
                      </div>
                      <div className={`text-[11px] font-mono mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        ค่าเช่า {item.baseRent.toLocaleString()}.- | ส่วนกลาง {commonFee}.-
                      </div>
                    </div>
                    
                    {/* Total Display */}
                    <div className="text-right">
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>ยอดรวมสุทธิ</div>
                      <div className="text-lg font-black text-teal-600 dark:text-teal-400 font-mono">
                        {calculatedAmount.toLocaleString()}.-
                      </div>
                      {isModified && (
                        <span className={`inline-block text-[9px] bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold mt-1 ${
                          isDark ? "text-amber-400" : "text-amber-600"
                        }`}>
                          ยอดเงินเปลี่ยน
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={`h-px ${isDark ? "bg-slate-900/60" : "bg-slate-200"}`} />

                  {/* Meter Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Electricity Meter Card Section */}
                    <div className={`rounded-xl p-3 border space-y-3 ${
                      isDark ? "bg-blue-500/5 border-blue-500/10" : "bg-blue-50/50 border-blue-100"
                    }`}>
                      <div className="flex justify-between items-center gap-2">
                        <span className={`text-xs font-bold flex items-center gap-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                          <Zap className="w-3.5 h-3.5" /> ไฟฟ้า (kWh)
                        </span>
                        {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isElecPrevEditable ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>ก่อนหน้า:</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="กรอก"
                              className={`w-16 h-6.5 text-center border rounded font-mono text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all ${
                                isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-200 text-slate-800"
                              }`}
                              value={item.elecPrev}
                              onChange={(e) => handleElecPrevChange(item.roomNumber, e.target.value)}
                            />
                          </div>
                        ) : (
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                            isDark ? "bg-slate-950 border-slate-900 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"
                          }`}>
                            ก่อนหน้า: <strong className={isDark ? "text-slate-200" : "text-slate-800"}>{item.elecPrev}</strong>
                          </span>
                        )}
                      </div>
                      
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="จดเลขมิเตอร์ไฟฟ้า..."
                          className={`w-full h-12 px-3 text-base border rounded-xl font-mono font-bold focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 transition-all placeholder:text-slate-400 ${
                            isDark ? "bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600" : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400"
                          }`}
                          value={item.elecCurr}
                          onChange={(e) => handleElecChange(item.roomNumber, e.target.value)}
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-black pointer-events-none">
                          kWh
                        </span>
                      </div>

                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-500 dark:text-slate-400">หน่วยไฟที่ใช้:</span>
                        <span className={`font-bold ${!hasElecCurr ? "text-slate-500 dark:text-slate-400" : elecUnitsUsed < 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                          {hasElecCurr ? (elecUnitsUsed >= 0 ? `${elecUnitsUsed} หน่วย` : "ผิดพลาด") : "รอจด"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-500 dark:text-slate-400">รวมเงินค่าไฟ:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {hasElecCurr && elecUnitsUsed >= 0 
                            ? `${elecCost.toLocaleString()}.- ${electricMinChecked && elecUnitsUsed <= electricMinUnit ? "(ขั้นต่ำ)" : ""}` 
                            : "-"}
                        </span>
                      </div>
                    </div>

                    {/* Water Meter Card Section */}
                    <div className="bg-teal-50/50 dark:bg-teal-500/5 rounded-xl p-3 border border-teal-100 dark:border-teal-500/10 space-y-3">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-xs font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1">
                          <Droplet className="w-3.5 h-3.5" /> น้ำประปา (m³)
                        </span>
                        {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isWaterPrevEditable ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">ก่อนหน้า:</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="กรอก"
                              className="w-16 h-6.5 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-800 dark:text-slate-200 font-mono text-[10px] font-bold focus:outline-none focus:border-teal-500 transition-all"
                              value={item.waterPrev}
                              onChange={(e) => handleWaterPrevChange(item.roomNumber, e.target.value)}
                            />
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-900">
                            ก่อนหน้า: <strong className="text-slate-800 dark:text-slate-200">{item.waterPrev}</strong>
                          </span>
                        )}
                      </div>
                      
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="จดเลขมิเตอร์น้ำประปา..."
                          className="w-full h-12 px-3 text-base bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none focus:border-teal-500/80 focus:ring-1 focus:ring-teal-500/30 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                          value={item.waterCurr}
                          onChange={(e) => handleWaterChange(item.roomNumber, e.target.value)}
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-black pointer-events-none">
                          m³
                        </span>
                      </div>

                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-500 dark:text-slate-400">หน่วยน้ำที่ใช้:</span>
                        <span className={`font-bold ${!hasWaterCurr ? "text-slate-500 dark:text-slate-400" : waterUnitsUsed < 0 ? "text-red-600 dark:text-red-400" : "text-teal-600 dark:text-teal-400"}`}>
                          {hasWaterCurr ? (waterUnitsUsed >= 0 ? `${waterUnitsUsed} หน่วย` : "ผิดพลาด") : "รอจด"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-500 dark:text-slate-400">รวมเงินค่าน้ำ:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {hasWaterCurr && waterUnitsUsed >= 0 
                            ? `${waterCost.toLocaleString()}.- ${waterMinChecked && waterUnitsUsed <= waterMinUnit ? "(ขั้นต่ำ)" : ""}` 
                            : "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons Section */}
                  <div className="pt-2 space-y-2">
                    {/* Save Button (Primary Action) */}
                    <button
                      onClick={() => handleSaveRow(item.roomNumber)}
                      disabled={item.isMeterSaved && item.billStatus !== "not_created" && !isModified}
                      className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        item.isMeterSaved && item.billStatus !== "not_created" && !isModified
                          ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-250 dark:border-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                          : "bg-teal-600 hover:bg-teal-500 border border-teal-500/30 text-white shadow-lg shadow-teal-600/10 active:scale-[0.98]"
                      }`}
                    >
                      <Save className="w-4 h-4" /> บันทึกและออกบิลห้อง {item.roomNumber}
                    </button>

                    {/* Sub/Secondary Actions Grid */}
                    {item.billStatus === "pending" ? (
                      <button
                        onClick={() => {
                          setSelectedBill(item)
                          setSlipModalOpen(true)
                        }}
                        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/10 cursor-pointer"
                      >
                        <Eye className="w-4 h-4" /> ตรวจสอบสลิปโอนเงิน
                      </button>
                    ) : item.billStatus !== "not_created" ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {/* Download PDF */}
                          <button
                            onClick={() => handleDownloadBillPdf(item)}
                            disabled={downloadingPdfId !== null}
                            className="h-12 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                          >
                            {downloadingPdfId === item.roomNumber ? (
                              <div className="w-4 h-4 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <Download className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                                <span>ดาวน์โหลด PDF</span>
                              </>
                            )}
                          </button>

                          {/* Send Line OA */}
                          <button
                            onClick={() => handleSendLine(item.roomNumber)}
                            className="h-12 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                          >
                            <Send className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                            <span>ส่ง LINE OA</span>
                          </button>
                        </div>

                        {/* If unpaid, direct payment record (Cash/Manual) */}
                        {item.billStatus === "unpaid" && (
                          <button
                            onClick={() => handleMarkAsPaid(item.billId!, item.roomNumber)}
                            disabled={currentUserRole === "staff"}
                            className={`w-full h-12 border rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm ${
                              currentUserRole === "staff"
                                ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-400 dark:text-slate-600"
                                : "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-600/10 dark:hover:bg-emerald-600/20 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 cursor-pointer"
                            }`}
                            title={currentUserRole === "staff" ? "เฉพาะแอดมินเท่านั้นที่มีสิทธิ์รับเงิน" : "รับเงินสด / บันทึกชำระเงินตรง"}
                          >
                            <CheckCircle className={`w-4 h-4 ${currentUserRole === "staff" ? "text-slate-400 dark:text-slate-600" : "text-emerald-500"}`} />
                            <span>รับเงินสด / บันทึกชำระเงินตรง</span>
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-slate-500 bg-white dark:bg-slate-950/10 border border-slate-200 dark:border-slate-900/60 rounded-2xl shadow-sm">
              ไม่มีรายการห้องพักที่ใช้งานหรือจ้างเช่าอยู่ในขณะนี้
            </div>
          )}
        </div>

        {/* Desktop View: Standard Dense Table (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-900/10">
                <th className="pb-3 pl-3 w-16">ห้อง</th>
                <th className="pb-3 w-40">ผู้เช่า / ค่าเช่า</th>
                
                {/* กลุ่มไฟฟ้า */}
                <th className="pb-3 text-center bg-blue-50/60 dark:bg-blue-500/5 rounded-t-xl w-32 border-l border-slate-200 dark:border-slate-800/40 text-blue-600 dark:text-blue-400 font-bold">ไฟก่อนหน้า</th>
                <th className="pb-3 text-center bg-blue-50/60 dark:bg-blue-500/5 w-36 text-blue-600 dark:text-blue-400 font-bold">ไฟรอบนี้</th>
                <th className="pb-3 text-center bg-blue-50/60 dark:bg-blue-500/5 w-28 rounded-t-xl border-r border-slate-200 dark:border-slate-800/40 text-blue-600 dark:text-blue-400 font-bold">หน่วย/ยอด</th>
                
                {/* กลุ่มน้ำ */}
                <th className="pb-3 text-center bg-teal-50/60 dark:bg-teal-500/5 rounded-t-xl w-32 text-teal-600 dark:text-teal-400 font-bold font-bold">น้ำก่อนหน้า</th>
                <th className="pb-3 text-center bg-teal-50/60 dark:bg-teal-500/5 w-36 text-teal-600 dark:text-teal-400 font-bold font-bold font-bold">น้ำรอบนี้</th>
                <th className="pb-3 text-center bg-teal-50/60 dark:bg-teal-500/5 w-28 rounded-t-xl border-r border-slate-200 dark:border-slate-800/40 text-teal-600 dark:text-teal-400 font-bold">หน่วย/ยอด</th>
                
                <th className="pb-3 text-right pr-4 w-32">ยอดรวมบิล</th>
                <th className="pb-3 text-center w-28">สถานะ</th>
                <th className="pb-3 text-center w-40 pr-2">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                      <span>กำลังโหลดข้อมูลรวม...</span>
                    </div>
                  </td>
                </tr>
              ) : unifiedItems.length > 0 ? (
                unifiedItems.map((item) => {
                  const hasElecCurr = item.elecCurr !== "" && item.elecCurr !== null && item.elecCurr !== undefined
                  const elecUnitsUsed = hasElecCurr ? Number(item.elecCurr) - Number(item.elecPrev) : 0
                  const elecCost = hasElecCurr && elecUnitsUsed >= 0
                    ? (electricMinChecked && elecUnitsUsed <= electricMinUnit ? electricMinUnit * elecRate : elecUnitsUsed * elecRate)
                    : 0

                  const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
                  const waterUnitsUsed = hasWaterCurr ? Number(item.waterCurr) - Number(item.waterPrev) : 0
                  const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                    ? (waterMinChecked && waterUnitsUsed <= waterMinUnit ? waterMinUnit * waterRate : waterUnitsUsed * waterRate)
                    : 0
                  
                  // คำนวณยอดเงินเรียลไทม์
                  const calculatedAmount = item.baseRent + elecCost + waterCost + commonFee

                  const isModified = item.billStatus !== "not_created" && item.billAmount !== calculatedAmount

                  return (
                    <tr key={item.roomNumber} className={`transition-colors ${isDark ? "hover:bg-slate-900/15" : "hover:bg-slate-50/80"}`}>
                      {/* ห้อง */}
                      <td className={`py-4 pl-3 font-black text-sm ${isDark ? "text-slate-100" : "text-slate-800"}`}>{item.roomNumber}</td>
                      
                      {/* ผู้เช่า / ค่าเช่าห้อง */}
                      <td className="py-4">
                        <div className={`font-bold truncate max-w-[140px] ${isDark ? "text-slate-300" : "text-slate-700"}`} title={item.tenantName || "ไม่มีผู้เช่า"}>
                          {item.tenantName || <span className={isDark ? "text-slate-600 italic" : "text-slate-400 italic"}>ไม่มีข้อมูลผู้เช่า</span>}
                        </div>
                        <div className={`text-[10px] font-mono mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          ค่าเช่า {item.baseRent.toLocaleString()}.- + ส่วนกลาง {commonFee}.-
                        </div>
                      </td>
                      
                      {/* ไฟฟ้า - ก่อนหน้า */}
                      <td className="py-4 text-center bg-blue-50/20 dark:bg-blue-500/5 border-l border-slate-200 dark:border-slate-800/40 px-2">
                        {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isElecPrevEditable ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="กรอกเลข"
                            className={`w-20 text-center py-1.5 border rounded-lg font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all font-semibold ${
                              isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                            }`}
                            value={item.elecPrev}
                            onChange={(e) => handleElecPrevChange(item.roomNumber, e.target.value)}
                          />
                        ) : (
                          <span className={`font-mono font-semibold px-2.5 py-1 rounded-lg border ${
                            isDark ? "text-slate-400 bg-slate-900/50 border-slate-800/40" : "text-slate-600 bg-slate-100 border-slate-200"
                          }`}>
                            {item.elecPrev}
                          </span>
                        )}
                      </td>

                      {/* ไฟฟ้า - อินพุตปัจจุบัน */}
                      <td className="py-4 text-center bg-blue-50/20 dark:bg-blue-500/5 px-2">
                        <div className="relative inline-block">
                          <input
                            type="text"
                            placeholder="กรอกเลข"
                            className={`w-24 text-center py-1.5 border rounded-lg font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all font-semibold ${
                              isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                            }`}
                            value={item.elecCurr}
                            onChange={(e) => handleElecChange(item.roomNumber, e.target.value)}
                          />
                          <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold pointer-events-none ${
                            isDark ? "text-slate-600" : "text-slate-400"
                          }`}>
                            kWh
                          </span>
                        </div>
                      </td>

                      {/* ไฟฟ้า - สรุปหน่วยที่ใช้ / ค่าใช้จ่าย */}
                      <td className="py-4 text-center bg-blue-50/20 dark:bg-blue-500/5 border-r border-slate-200 dark:border-slate-800/40 font-mono">
                        <div className={`font-black text-xs ${!hasElecCurr ? "text-slate-400 dark:text-slate-500" : elecUnitsUsed < 0 ? "text-red-500 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                          {hasElecCurr ? (elecUnitsUsed >= 0 ? `${elecUnitsUsed} หน่วย` : "ผิดพลาด") : "รอจด"}
                        </div>
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                          {hasElecCurr && elecUnitsUsed >= 0 
                            ? `${elecCost.toLocaleString()}.- ${electricMinChecked && elecUnitsUsed <= electricMinUnit ? "(ขั้นต่ำ)" : ""}` 
                            : "-"}
                        </div>
                      </td>

                      {/* น้ำประปา - ก่อนหน้า */}
                      <td className="py-4 text-center bg-teal-50/20 dark:bg-teal-500/5 px-2">
                        {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isWaterPrevEditable ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="กรอกเลข"
                            className={`w-20 text-center py-1.5 border rounded-lg font-mono text-xs focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all font-semibold ${
                              isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                            }`}
                            value={item.waterPrev}
                            onChange={(e) => handleWaterPrevChange(item.roomNumber, e.target.value)}
                          />
                        ) : (
                          <span className={`font-mono font-semibold px-2.5 py-1 rounded-lg border ${
                            isDark ? "text-slate-400 bg-slate-900/50 border-slate-800/40" : "text-slate-600 bg-slate-100 border-slate-200"
                          }`}>
                            {item.waterPrev}
                          </span>
                        )}
                      </td>

                      {/* น้ำประปา - อินพุตปัจจุบัน */}
                      <td className="py-4 text-center bg-teal-50/20 dark:bg-teal-500/5 px-2">
                        <div className="relative inline-block">
                          <input
                            type="text"
                            placeholder="กรอกเลข"
                            className={`w-24 text-center py-1.5 border rounded-lg font-mono text-xs focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all font-semibold ${
                              isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                            }`}
                            value={item.waterCurr}
                            onChange={(e) => handleWaterChange(item.roomNumber, e.target.value)}
                          />
                          <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold pointer-events-none ${
                            isDark ? "text-slate-600" : "text-slate-400"
                          }`}>
                            m³
                          </span>
                        </div>
                      </td>

                      {/* น้ำประปา - สรุปหน่วยที่ใช้ / ค่าใช้จ่าย */}
                      <td className="py-4 text-center bg-teal-50/20 dark:bg-teal-500/5 border-r border-slate-200 dark:border-slate-800/40 font-mono">
                        <div className={`font-black text-xs ${!hasWaterCurr ? "text-slate-400 dark:text-slate-500" : waterUnitsUsed < 0 ? "text-red-500 dark:text-red-400" : "text-teal-600 dark:text-teal-400"}`}>
                          {hasWaterCurr ? (waterUnitsUsed >= 0 ? `${waterUnitsUsed} หน่วย` : "ผิดพลาด") : "รอจด"}
                        </div>
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                          {hasWaterCurr && waterUnitsUsed >= 0 
                            ? `${waterCost.toLocaleString()}.- ${waterMinChecked && waterUnitsUsed <= waterMinUnit ? "(ขั้นต่ำ)" : ""}` 
                            : "-"}
                        </div>
                      </td>

                      {/* ยอดบิลรวม */}
                      <td className="py-4 text-right pr-4 font-mono">
                        <div className={`text-sm font-black ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                          {calculatedAmount.toLocaleString()}.-
                        </div>
                        {isModified && (
                          <span className={`inline-block text-[8px] bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded font-bold ${
                            isDark ? "text-amber-400" : "text-amber-600"
                          }`}>
                            ยอดเงินเปลี่ยน
                          </span>
                        )}
                      </td>

                      {/* สถานะบิล */}
                      <td className="py-4 text-center">
                        <span className={`inline-block text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                          item.billStatus === "paid" ? (isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200") :
                          item.billStatus === "pending" ? (isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse" : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse") :
                          item.billStatus === "unpaid" ? (isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200") :
                          (isDark ? "bg-slate-900 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-500 border-slate-250")
                        }`}>
                          {item.billStatus === "paid" ? "ชำระเงินแล้ว" :
                           item.billStatus === "pending" ? "รอตรวจสลิป" :
                           item.billStatus === "unpaid" ? "ค้างชำระ" : "ยังไม่ออกบิล"}
                        </span>
                      </td>

                      {/* แถบการจัดการบิล */}
                      <td className="py-4 text-center pr-2">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* ปุ่มเซฟและออกบิล */}
                          <button
                            onClick={() => handleSaveRow(item.roomNumber)}
                            disabled={item.isMeterSaved && item.billStatus !== "not_created" && !isModified}
                            className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                              item.isMeterSaved && item.billStatus !== "not_created" && !isModified
                                ? (isDark ? "border-slate-800/40 bg-slate-950/20 text-slate-600 cursor-not-allowed" : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed")
                                : (isDark ? "border-teal-500/30 bg-teal-500/10 hover:bg-teal-500 text-teal-400 hover:text-white hover:scale-105 shadow-sm" : "border-teal-250 bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white hover:scale-105 shadow-sm")
                            }`}
                            title="บันทึกมิเตอร์และออกบิล"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span className="text-[10px]">บันทึกบิล</span>
                          </button>

                          {/* ปุ่มตรวจสลิป กรณีชำระเงินเข้ามา */}
                          {item.billStatus === "pending" ? (
                            <button
                              onClick={() => {
                                setSelectedBill(item)
                                setSlipModalOpen(true)
                              }}
                              className={`p-1.5 rounded-xl border transition-all font-semibold text-xs flex items-center gap-1 hover:scale-105 cursor-pointer ${
                                isDark ? "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500 hover:text-white" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-500 hover:text-white"
                              }`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span className="text-[10px]">ตรวจสลิป</span>
                            </button>
                          ) : item.billStatus !== "not_created" ? (
                            <>
                              {/* ดาวน์โหลด PDF */}
                              <button
                                onClick={() => handleDownloadBillPdf(item)}
                                disabled={downloadingPdfId !== null}
                                className={`p-1.5 border rounded-xl transition-all cursor-pointer ${
                                  isDark ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-blue-400 hover:border-blue-500/40" : "bg-white border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-500/40"
                                }`}
                                title="ดาวน์โหลดบิล PDF"
                              >
                                {downloadingPdfId === item.roomNumber ? (
                                  <div className="w-3.5 h-3.5 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {/* ส่ง LINE OA */}
                              <button
                                onClick={() => handleSendLine(item.roomNumber)}
                                className={`p-1.5 border rounded-xl transition-all cursor-pointer ${
                                  isDark ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-teal-400 hover:border-teal-500/40" : "bg-white border-slate-200 text-slate-600 hover:text-teal-600 hover:border-teal-500/40"
                                }`}
                                title="ส่งเข้า LINE OA"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>

                              {/* บันทึกรับเงินโดยตรง (สำหรับค้างชำระ) */}
                              {item.billStatus === "unpaid" && (
                                <button
                                  onClick={() => handleMarkAsPaid(item.billId!, item.roomNumber)}
                                  disabled={currentUserRole === "staff"}
                                  className={`p-1.5 border rounded-xl transition-all flex items-center gap-1 shadow-sm ${
                                    currentUserRole === "staff"
                                      ? "opacity-40 cursor-not-allowed"
                                      : "hover:scale-105 cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400"
                                  } ${
                                    isDark ? "bg-slate-900 border-slate-800 text-slate-500" : "bg-white border-slate-200 text-slate-400"
                                  }`}
                                  title={currentUserRole === "staff" ? "เฉพาะแอดมินเท่านั้นที่มีสิทธิ์รับเงิน" : "รับเงินสด/บันทึกชำระเงินตรง"}
                                >
                                  <CheckCircle className={`w-3.5 h-3.5 ${currentUserRole === "staff" ? "text-slate-400 dark:text-slate-600" : "text-emerald-500"}`} />
                                  <span className={`text-[10px] hidden xl:inline font-bold ${
                                    currentUserRole === "staff"
                                      ? "text-slate-400 dark:text-slate-600"
                                      : isDark ? "text-slate-400 hover:text-emerald-300" : "text-slate-500 hover:text-emerald-600"
                                  }`}>
                                    รับเงินแล้ว
                                  </span>
                                </button>
                              )}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    ไม่มีรายการห้องพักที่ใช้งานหรือจ้างเช่าอยู่ในขณะนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ปุ่มบันทึกบิลทั้งหมด (Save All Bills Button at the bottom of the last room) */}
        {!loading && unifiedItems.length > 0 && (
          <div className="mt-8 flex justify-center px-4 md:px-0 pb-4">
            <button
              onClick={handleSaveAll}
              className="w-full md:w-auto min-w-[280px] h-14 md:h-12 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-extrabold px-8 rounded-2xl flex items-center justify-center gap-2.5 text-sm md:text-xs shadow-lg shadow-teal-600/20 hover:shadow-teal-500/30 transition-all cursor-pointer active:scale-[0.98] border border-teal-500/30 animate-pulse hover:animate-none"
            >
              <Save className="w-5 h-5 md:w-4.5 md:h-4.5 text-teal-100" />
              <span>บันทึกและออกบิลทุกห้อง ({unifiedItems.length} ห้อง)</span>
            </button>
          </div>
        )}
      </div>
    </>
  )
}
