import React, { useState } from "react"
import { X, CreditCard, UserCheck, Eye, ZoomIn, ZoomOut } from "lucide-react"

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
  const [isZoomed, setIsZoomed] = useState(false)

  if (!slipModalOpen || !selectedBill) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <div className={`${
          isDark ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-200"
        } w-full max-w-3xl max-h-[90vh] overflow-y-auto p-4 md:p-6 rounded-3xl relative shadow-2xl animate-scale-up grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 border`}>
          
          {/* Close Button */}
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 p-1.5 rounded-lg transition-all cursor-pointer z-10 ${
              isDark ? "text-slate-400 hover:text-white hover:bg-slate-900/50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            }`}
          >
            <X className="w-4 h-4" />
          </button>
          
          {/* ฝั่งสลิปธนาคาร (ซ้าย) */}
          <div className="space-y-1.5 flex flex-col justify-center">
            <div className="flex justify-between items-center px-1">
              <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                หลักฐานการโอนเงิน
              </h4>
              {selectedBill.slipUrl && (
                <span className={`text-[10px] font-bold text-blue-500 dark:text-blue-400 flex items-center gap-1 animate-pulse`}>
                  <ZoomIn className="w-3 h-3" /> แตะเพื่อขยายรูป
                </span>
              )}
            </div>
            
            <div 
              onClick={() => selectedBill.slipUrl && setIsZoomed(true)}
              className={`w-full h-48 md:h-[350px] rounded-2xl overflow-hidden border relative flex items-center justify-center cursor-pointer group transition-all duration-300 ${
                isDark ? "bg-slate-950 border-slate-800 hover:border-blue-500/50" : "bg-slate-50 border-slate-200 hover:border-blue-500/50"
              }`}
            >
              {selectedBill.slipUrl ? (
                <>
                  <img
                    src={selectedBill.slipUrl}
                    alt="Slip Verification"
                    className="object-contain w-full h-full group-hover:scale-[1.01] transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5 backdrop-blur-[1px]">
                    <Eye className="w-4 h-4" /> ดูขนาดเต็ม
                  </div>
                </>
              ) : (
                <p className={`text-xs ${isDark ? "text-slate-600" : "text-slate-400"}`}>ไม่พบหลักฐานไฟล์แนบในระบบ</p>
              )}
            </div>
          </div>

          {/* ฝั่งรายละเอียดและการกดอนุมัติ (ขวา) */}
          <div className="flex flex-col justify-between pt-1 md:pt-3">
            <div className="space-y-3.5">
              <h3 className={`text-sm font-black flex items-center gap-2 ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                <CreditCard className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-500"}`} /> 
                ตรวจสอบยอดและปิดบิล
              </h3>

              <div className={`p-4 rounded-2xl space-y-3.5 border text-xs ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                {/* แถวแรก: ห้องพัก + รอบบิล */}
                <div className="grid grid-cols-2 gap-4 pb-3 border-b border-dashed border-slate-200 dark:border-slate-800">
                  <div>
                    <span className={`block text-[10px] font-bold ${isDark ? "text-slate-450" : "text-slate-400"} mb-0.5`}>
                      หมายเลขห้องพัก:
                    </span>
                    <span className={`font-black text-sm ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                      {selectedBill.roomNumber}
                    </span>
                  </div>
                  <div>
                    <span className={`block text-[10px] font-bold ${isDark ? "text-slate-450" : "text-slate-400"} mb-0.5`}>
                      รอบบิลประจำเดือน:
                    </span>
                    <span className={`font-mono font-bold text-sm ${isDark ? "text-slate-250" : "text-slate-700"}`}>
                      {billingCycle}
                    </span>
                  </div>
                </div>

                {/* ผู้จดเช่า */}
                <div>
                  <span className={`block text-[10px] font-bold ${isDark ? "text-slate-450" : "text-slate-400"} mb-0.5`}>
                    ผู้เช่าพัก:
                  </span>
                  <span className={`font-extrabold text-xs ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                    {selectedBill.tenantName || "ไม่มีผู้เช่า"}
                  </span>
                </div>

                {/* รายละเอียดค่าบริการอื่น ๆ และค่าปรับ (ถ้ามี) */}
                {((selectedBill.otherServiceAmount && selectedBill.otherServiceAmount > 0) || 
                  (selectedBill.penaltyAmount && selectedBill.penaltyAmount > 0)) && (
                  <div className="pt-2.5 pb-1 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <div className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-450"}`}>
                      ค่าบริการ/ค่าปรับเพิ่มเติม:
                    </div>
                    <div className="grid grid-cols-2 gap-3 pl-1">
                      {selectedBill.otherServiceAmount && selectedBill.otherServiceAmount > 0 ? (
                        <div className="flex flex-col">
                          <span className={`text-[10px] ${isDark ? "text-violet-400" : "text-violet-600"} font-bold flex items-center gap-1`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                            ค่าบริการอื่น ๆ
                          </span>
                          <span className={`font-extrabold text-xs pl-2.5 ${isDark ? "text-violet-300" : "text-violet-700"}`}>
                            +{selectedBill.otherServiceAmount.toLocaleString()} บาท
                          </span>
                        </div>
                      ) : null}
                      {selectedBill.penaltyAmount && selectedBill.penaltyAmount > 0 ? (
                        <div className="flex flex-col">
                          <span className={`text-[10px] ${isDark ? "text-rose-400" : "text-rose-600"} font-bold flex items-center gap-1`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            ค่าปรับล่าช้า
                          </span>
                          <span className={`font-extrabold text-xs pl-2.5 ${isDark ? "text-rose-300" : "text-rose-700"}`}>
                            +{selectedBill.penaltyAmount.toLocaleString()} บาท
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* ยอดรวมบิลทั้งหมด */}
                <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-800">
                  <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    ยอดรวมบิลทั้งหมด:
                  </span>
                  <span className={`font-black text-lg ${isDark ? "text-teal-400" : "text-teal-600"}`}>
                    {selectedBill.billAmount.toLocaleString()} บาท
                  </span>
                </div>
              </div>

              <div className={`p-3 border rounded-2xl text-[10.5px] leading-relaxed font-semibold ${
                isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-400/90" : "bg-amber-50 border-amber-200 text-amber-700"
              }`}>
                ⚠️ โปรดเช็กยอดเงินโอนและเวลารับเงินในแอปบัญชีธนาคารหอพักของคุณให้ตรงกับรูปสลิปก่อนกดยืนยัน
              </div>
            </div>

            {/* ปุ่มกดอนุมัติ/ปฏิเสธ */}
            <div className="space-y-2 pt-4 md:pt-6">
              <button
                onClick={() => selectedBill.billId && onApprove(selectedBill.billId)}
                className="w-full h-11 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg shadow-teal-600/10 transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <UserCheck className="w-4 h-4" /> อนุมัติยอดและปิดบัญชีบิล
              </button>
              <button
                onClick={() => selectedBill.billId && onReject(selectedBill.billId)}
                className={`w-full h-11 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
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

      {/* Lightbox / Zoom Overlay */}
      {isZoomed && selectedBill.slipUrl && (
        <div 
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-pointer animate-fade-in"
        >
          <button
            onClick={() => setIsZoomed(false)}
            className="absolute top-4 right-4 p-2 bg-slate-900/80 text-white hover:bg-slate-800 rounded-full transition-all border border-slate-800/80"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <div className="max-w-full max-h-[85vh] overflow-hidden rounded-2xl relative">
            <img
              src={selectedBill.slipUrl}
              alt="Slip Zoomed"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl animate-scale-up"
            />
          </div>
          <span className="text-white/60 text-xs font-bold mt-4 tracking-wider uppercase">
            คลิกที่ใดก็ได้เพื่อปิดหน้าซูม
          </span>
        </div>
      )}
    </>
  )
}
