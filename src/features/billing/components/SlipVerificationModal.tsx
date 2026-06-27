import React from "react"
import { X, CreditCard, UserCheck } from "lucide-react"

interface SlipVerificationModalProps {
  isDark: boolean
  slipModalOpen: boolean
  selectedBill: {
    billId?: string
    roomNumber: string
    tenantName: string | null
    billAmount: number
    slipUrl: string | null
    otherServiceAmount?: number
    penaltyAmount?: number
  } | null
  billingCycle: string
  onClose: () => void
  onApprove: (billId: string) => Promise<void>
  onReject: (billId: string) => Promise<void>
}

export default function SlipVerificationModal({
  isDark,
  slipModalOpen,
  selectedBill,
  billingCycle,
  onClose,
  onApprove,
  onReject
}: SlipVerificationModalProps) {
  if (!slipModalOpen || !selectedBill) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className={`${
        isDark ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-200"
      } w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6 rounded-3xl relative shadow-2xl animate-scale-up grid grid-cols-1 md:grid-cols-2 gap-6 border`}>
        <button
          onClick={onClose}
          className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
            isDark ? "text-slate-400 hover:text-white hover:bg-slate-900/50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          }`}
        >
          <X className="w-5 h-5" />
        </button>
        
        {/* ฝั่งสลิปธนาคาร */}
        <div className="space-y-2">
          <h4 className={`text-xs font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>รูปภาพหลักฐานการโอนเงิน</h4>
          <div className={`w-full aspect-[3/4] rounded-2xl overflow-hidden border relative flex items-center justify-center ${
            isDark ? "bg-slate-950 border-slate-900/60" : "bg-slate-50 border-slate-200"
          }`}>
            {selectedBill.slipUrl ? (
              <img
                src={selectedBill.slipUrl}
                alt="Slip Verification"
                className="object-contain w-full h-full"
              />
            ) : (
              <p className={`text-xs ${isDark ? "text-slate-600" : "text-slate-400"}`}>ไม่พบหลักฐานไฟล์แนบในระบบ</p>
            )}
          </div>
        </div>

        {/* ฝั่งรายละเอียดและการกดอนุมัติ */}
        <div className="flex flex-col justify-between pt-3">
          <div className="space-y-4">
            <h3 className={`text-sm font-black flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
              <CreditCard className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-500"}`} /> อนุมัติสลิปโอนและปิดบิล
            </h3>

            <div className={`p-4 rounded-xl space-y-3 border text-xs ${
              isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}>
              <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200 dark:border-slate-800">
                <span className={isDark ? "text-slate-400" : "text-slate-500"}>หมายเลขห้องพัก:</span>
                <span className={`font-extrabold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}>{selectedBill.roomNumber}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200 dark:border-slate-800">
                <span className={isDark ? "text-slate-400" : "text-slate-500"}>ผู้จดเช่า:</span>
                <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selectedBill.tenantName || "ไม่มีผู้เช่า"}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200 dark:border-slate-800">
                <span className={isDark ? "text-slate-400" : "text-slate-500"}>รอบเดือนประจำบิล:</span>
                <span className={`font-mono font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>{billingCycle}</span>
              </div>

              {/* รายละเอียดค่าใช้จ่ายเพิ่มเติม (ถ้ามี) */}
              {((selectedBill.otherServiceAmount && selectedBill.otherServiceAmount > 0) || 
                (selectedBill.penaltyAmount && selectedBill.penaltyAmount > 0)) && (
                <div className="pt-1 pb-2 space-y-2">
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    ค่าบริการ/ค่าปรับเพิ่มเติม
                  </div>
                  {selectedBill.otherServiceAmount && selectedBill.otherServiceAmount > 0 ? (
                    <div className="flex justify-between items-center pl-2">
                      <span className={`flex items-center gap-1.5 ${isDark ? "text-violet-400" : "text-violet-600"} font-medium`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                        ค่าบริการอื่น ๆ:
                      </span>
                      <span className={`font-bold ${isDark ? "text-violet-300" : "text-violet-700"}`}>
                        +{selectedBill.otherServiceAmount.toLocaleString()} บาท
                      </span>
                    </div>
                  ) : null}
                  {selectedBill.penaltyAmount && selectedBill.penaltyAmount > 0 ? (
                    <div className="flex justify-between items-center pl-2">
                      <span className={`flex items-center gap-1.5 ${isDark ? "text-rose-400" : "text-rose-600"} font-medium`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        ค่าปรับล่าช้า:
                      </span>
                      <span className={`font-bold ${isDark ? "text-rose-300" : "text-rose-700"}`}>
                        +{selectedBill.penaltyAmount.toLocaleString()} บาท
                      </span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* ยอดรวมบิลทั้งหมด */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>ยอดรวมบิลทั้งหมด:</span>
                <span className={`font-black text-base ${isDark ? "text-teal-400" : "text-teal-600"}`}>
                  {selectedBill.billAmount.toLocaleString()} บาท
                </span>
              </div>
            </div>

            <div className={`p-3 border rounded-xl text-[11px] leading-relaxed font-medium ${
              isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-400/90" : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>
              โปรดเช็กยอดเงินโอนและเวลารับเงินในแอปบัญชีธนาคารหอพักของคุณให้ตรงกับรูปสลิป
            </div>
          </div>

          <div className="space-y-2 pt-6">
            <button
              onClick={() => selectedBill.billId && onApprove(selectedBill.billId)}
              className="w-full h-12 md:h-10 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg shadow-teal-600/10 transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              <UserCheck className="w-4 h-4" /> อนุมัติยอดและปิดบัญชีบิล
            </button>
            <button
              onClick={() => selectedBill.billId && onReject(selectedBill.billId)}
              className={`w-full h-12 md:h-10 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                isDark 
                  ? "bg-rose-950/20 hover:bg-rose-600 text-rose-400 hover:text-white border-rose-900/40 hover:border-rose-600" 
                  : "bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border-rose-200 hover:border-rose-600"
              }`}
            >
              ปฏิเสธสลิป / ข้อมูลการโอนผิดพลาด
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
