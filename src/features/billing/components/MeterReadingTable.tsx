import React, { useState } from "react"
import { Save, Eye, Download, Send, CheckCircle, RefreshCw, Zap, Droplet, Sparkles, FileText, X, Copy, Check, AlertCircle, MessageSquare, Edit3, Lock } from "lucide-react"
import { StaffPermissions, DEFAULT_STAFF_PERMISSIONS } from "@/features/permissions/types"
import { generateSecurePortalLinkAction } from "@/features/tenant/actions"

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
  handleSaveRow: (roomNumber: string, type?: "electric" | "water" | "all") => Promise<void>
  setSelectedBill: (item: any) => void
  setSlipModalOpen: (open: boolean) => void
  handleDownloadBillPdf: (item: any) => Promise<void>
  handleSendLine: (roomNumber: string) => void | Promise<void>
  handleMarkAsPaid: (billId: string, roomNumber: string) => Promise<void>
  handleSaveAll: (type: "electric" | "water") => Promise<void>
  // New props for bulk LINE OA feature
  roomsList: any[]
  billingCycle: string
  workspaceName: string
  currentWorkspaceId: string
  userPermissions?: StaffPermissions
  handleLateDaysChange?: (roomNumber: string, value: string) => void
  handleSaveLateDays?: (roomNumber: string) => Promise<void>
  latePenaltyRate?: number
  handleOtherServiceChange?: (roomNumber: string, value: string) => void
  handleBillAmountChange?: (roomNumber: string, value: string) => void
  mode?: "meters" | "billing"
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
  handleSaveAll,
  roomsList,
  billingCycle,
  workspaceName,
  currentWorkspaceId,
  userPermissions,
  handleLateDaysChange,
  handleSaveLateDays,
  latePenaltyRate = 0,
  handleOtherServiceChange,
  handleBillAmountChange,
  mode = "billing"
}: MeterReadingTableProps) {
  const permissions = userPermissions || DEFAULT_STAFF_PERMISSIONS
  const [activeTab, setActiveTab] = useState<"all" | "electric" | "water">(
    mode === "meters" ? "electric" : "all"
  )
  const colSpanVal = activeTab === "all" ? 9 : 6

  const [bulkSendModalOpen, setBulkSendModalOpen] = useState(false)
  const [modalActiveTab, setModalActiveTab] = useState<"connected" | "unconnected">("connected")
  const [bulkSendingStatus, setBulkSendingStatus] = useState<"idle" | "sending" | "completed">("idle")
  const [bulkSendingProgress, setBulkSendingProgress] = useState({ current: 0, total: 0, currentRoom: "" })
  const [bulkSendResults, setBulkSendResults] = useState<{ [room: string]: { success: boolean; error?: string } }>({})
  const [copiedRooms, setCopiedRooms] = useState<{ [room: string]: boolean }>({})
  const [unlockedPaidRooms, setUnlockedPaidRooms] = useState<Record<string, boolean>>({})

  // กรองห้องที่มีผู้เช่าและออกบิลประจำรอบนั้นแล้ว (ไม่รวมห้องว่าง หรือยังไม่ออกบิล)
  const activeRooms = unifiedItems.filter(item => item.tenantName && item.billStatus !== "not_created")

  const connectedRooms = activeRooms.filter(item => {
    const roomInfo = roomsList?.find((r: any) => r.roomNumber === item.roomNumber)
    return !!roomInfo?.lineUserId
  })

  const unconnectedRooms = activeRooms.filter(item => {
    const roomInfo = roomsList?.find((r: any) => r.roomNumber === item.roomNumber)
    return !roomInfo?.lineUserId
  })

  // ฟังก์ชันจัดรูปแบบภาษาไทยรอบบิลสำหรับใช้ในหน้านี้
  function formatBillingCycleThaiLocal(cycleStr: string): string {
    if (!cycleStr) return ""
    if (cycleStr.includes("-")) {
      const [year, month] = cycleStr.split("-")
      const monthsThai = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
      ]
      const monthIdx = parseInt(month, 10) - 1
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${monthsThai[monthIdx]} ${year}`
      }
    }
    return cycleStr
  }

  // ฟังก์ชันสำหรับคัดลอกข้อมูลใบแจ้งหนี้แบบสรุป เพื่ออำนวยความสะดวกในห้องที่ไม่ได้ผูก LINE UID
  const handleCopySummary = async (item: any) => {
    if (!permissions.billing_copy_summary) {
      alert("คุณไม่มีสิทธิ์ในการคัดลอกสรุปบิล กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การใช้งาน")
      return
    }
    const elecUnitsUsed = item.elecCurr !== "" ? Number(item.elecCurr) - Number(item.elecPrev) : 0
    const waterUnitsUsed = item.waterCurr !== "" ? Number(item.waterCurr) - Number(item.waterPrev) : 0

    const elecCost = electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
    const waterCost = waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate

    let portalLink = ""
    if (currentWorkspaceId) {
      const res = await generateSecurePortalLinkAction(currentWorkspaceId, item.roomNumber)
      if (res.success && res.link) {
        portalLink = res.link
      } else {
        const safeAppUrl = typeof window !== "undefined" ? window.location.origin : ""
        portalLink = `${safeAppUrl}/portal?workspace_id=${currentWorkspaceId}&room_number=${encodeURIComponent(item.roomNumber)}`
      }
    } else {
      const safeAppUrl = typeof window !== "undefined" ? window.location.origin : ""
      portalLink = `${safeAppUrl}/portal`
    }

    const thaiCycle = formatBillingCycleThaiLocal(billingCycle)
    const otherServiceAmt = Number(item.otherServiceAmount || 0)
    const penaltyAmt = Number(item.penaltyAmount || 0)
    const totalAmount = item.billAmount || (item.baseRent + elecCost + waterCost + commonFee + otherServiceAmt + penaltyAmt)

    const text = `🏠 ${workspaceName || "หอพัก"} - ใบแจ้งค่าใช้จ่ายประจำเดือน ${thaiCycle}
เลขห้อง: ${item.roomNumber}
ผู้เช่า: ${item.tenantName || "ผู้เช่า"}
----------------------------------
• ค่าเช่าห้อง: ${item.baseRent.toLocaleString()} บาท
• ค่าไฟฟ้า: ${elecCost.toLocaleString()} บาท (ใช้ไป ${elecUnitsUsed} หน่วย)
• ค่าน้ำประปา: ${waterCost.toLocaleString()} บาท (ใช้ไป ${waterUnitsUsed} หน่วย)
• ค่าส่วนกลาง: ${commonFee.toLocaleString()} บาท${otherServiceAmt > 0 ? `\n• ค่าบริการอื่น ๆ: ${otherServiceAmt.toLocaleString()} บาท` : ""}${penaltyAmt > 0 ? `\n• ค่าปรับจ่ายล่าช้า: ${penaltyAmt.toLocaleString()} บาท` : ""}
----------------------------------
💰 ยอดสุทธิที่ต้องชำระ: ${totalAmount.toLocaleString()} บาท

คุณสามารถดูบิลออนไลน์และแจ้งชำระเงินได้ที่ลิงก์นี้:
🔗 ${portalLink}

ขอบคุณค่ะ/ครับ 🙏`

    navigator.clipboard.writeText(text)
    setCopiedRooms(prev => ({ ...prev, [item.roomNumber]: true }))
    
    setTimeout(() => {
      setCopiedRooms(prev => ({ ...prev, [item.roomNumber]: false }))
    }, 3500)
  }

  // ฟังก์ชันเริ่มส่ง LINE OA แบบกลุ่มทีละห้อง
  const startBulkSend = async () => {
    if (!permissions.billing_send_line) {
      alert("คุณไม่มีสิทธิ์ในการส่งยอด LINE OA กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การใช้งาน")
      return
    }
    if (connectedRooms.length === 0) return
    
    setBulkSendingStatus("sending")
    setBulkSendingProgress({ current: 0, total: connectedRooms.length, currentRoom: "" })
    const results: { [room: string]: { success: boolean; error?: string } } = {}

    try {
      const { sendLineBillNotificationAction } = await import("@/features/notification/actions")

      for (let i = 0; i < connectedRooms.length; i++) {
        const item = connectedRooms[i]
        setBulkSendingProgress({ current: i + 1, total: connectedRooms.length, currentRoom: item.roomNumber })
        
        const roomInfo = roomsList?.find((r: any) => r.roomNumber === item.roomNumber)
        const lineUserId = roomInfo?.lineUserId

        if (!lineUserId) {
          results[item.roomNumber] = { success: false, error: "ไม่พบข้อมูลรหัส LINE User ID" }
          continue
        }

        try {
          const elecUnitsUsed = item.elecCurr !== "" ? Number(item.elecCurr) - Number(item.elecPrev) : 0
          const waterUnitsUsed = item.waterCurr !== "" ? Number(item.waterCurr) - Number(item.waterPrev) : 0

          const elecCost = electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
          const waterCost = waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate

          const result = await sendLineBillNotificationAction({
            lineUserId,
            roomNumber: item.roomNumber,
            tenantName: item.tenantName || "ผู้เช่า",
            billingCycle: formatBillingCycleThaiLocal(billingCycle),
            baseRent: item.baseRent,
            electricUnits: elecUnitsUsed,
            electricAmount: elecCost,
            waterUnits: waterUnitsUsed,
            waterAmount: waterCost,
            commonFee: commonFee,
            totalAmount: item.billAmount,
            workspaceName: workspaceName || "หอพักของเรา",
            workspaceId: currentWorkspaceId,
          })

          results[item.roomNumber] = { success: result.success, error: result.error }
        } catch (err: any) {
          console.error(`Error sending LINE to room ${item.roomNumber}:`, err)
          results[item.roomNumber] = { success: false, error: err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ" }
        }
      }

      setBulkSendResults(results)
      setBulkSendingStatus("completed")
    } catch (err: any) {
      console.error("Bulk Send Action failed:", err)
      setBulkSendingStatus("idle")
      alert("เกิดข้อผิดพลาดในการเรียกใช้ระบบส่งข้อความแจ้งเตือน LINE")
    }
  }

  return (
    <>
      {/* แจ้งเตือน */}
      <div className={`flex items-center gap-2.5 p-3.5 border rounded-xl text-xs font-medium ${
        isDark 
          ? "bg-blue-950/10 border-blue-500/20 text-blue-400/90" 
          : "bg-blue-50/60 border-blue-100 text-blue-700"
      }`}>
        <Sparkles className={`w-4 h-4 shrink-0 ${isDark ? "text-blue-400" : "text-blue-500"}`} />
        <span>
          {mode === "billing" 
            ? "ระบบจัดการบิลค่าเช่าหอพัก ใช้สำหรับตรวจสอบการชำระเงิน ตรวจสอบสลิป ส่งบิลเข้า LINE OA หรือปรับสถานะและบันทึกรายละเอียดค่าใช้จ่ายเพิ่มเติม"
            : "ระบบบันทึกจดเลขมิเตอร์ไฟฟ้าและมิเตอร์น้ำประปา กรุณาเลือกแถบมิเตอร์ไฟหรือมิเตอร์น้ำเพื่อระบุค่าปัจจุบันและคลิกบันทึก"}
        </span>
      </div>

      {/* ตารางควบคุมหลัก */}
      <div className={`p-4 md:p-5 bg-transparent md:rounded-2xl md:shadow-sm ${
        isDark 
          ? "md:bg-slate-900/30 md:border md:border-slate-800/80" 
          : "md:bg-white md:border md:border-slate-200"
      }`}>
        {/* แถบควบคุมหลัก (Tabs) */}
        <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
          {mode !== "billing" ? (
            <div className={`flex p-1 rounded-xl transition-all shadow-inner ${
              isDark ? "bg-slate-950/60 border border-slate-900/50" : "bg-slate-100 border border-slate-200"
            }`}>
              <button
                type="button"
                onClick={() => setActiveTab("electric")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "electric"
                    ? (isDark ? "bg-blue-950/30 text-blue-405 border border-blue-500/20 shadow-sm" : "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm")
                    : (isDark ? "text-slate-500 hover:text-slate-455" : "text-slate-500 hover:text-slate-700")
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-blue-500" />
                <span>มิเตอร์ไฟ</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("water")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "water"
                    ? (isDark ? "bg-teal-950/30 text-teal-405 border border-teal-500/20 shadow-sm" : "bg-teal-50 text-teal-700 border border-teal-200 shadow-sm")
                    : (isDark ? "text-slate-500 hover:text-slate-455" : "text-slate-500 hover:text-slate-700")
                }`}
              >
                <Droplet className="w-3.5 h-3.5 text-teal-500" />
                <span>มิเตอร์น้ำ</span>
              </button>
            </div>
          ) : (
            <div className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              รายการบิลค่าเช่าประจำรอบบิล
            </div>
          )}
          
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold border ${
              isDark ? "bg-slate-900/30 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-100 text-slate-500"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                activeTab === "all" ? "bg-teal-500" : activeTab === "electric" ? "bg-blue-500" : "bg-teal-500"
              }`} />
              <span>รอบบิล: {formatBillingCycleThaiLocal(billingCycle)}</span>
            </div>

            {activeTab === "all" && unifiedItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (!permissions.billing_send_line) {
                    alert("คุณไม่มีสิทธิ์ในการส่งยอด LINE OA กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การใช้งาน")
                    return
                  }
                  setBulkSendResults({})
                  setBulkSendingStatus("idle")
                  setBulkSendModalOpen(true)
                }}
                disabled={!permissions.billing_send_line}
                className={`w-full sm:w-auto h-9 px-5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                  !permissions.billing_send_line
                    ? "bg-slate-400 dark:bg-slate-850 border border-slate-300 dark:border-slate-700 text-slate-200 dark:text-slate-500 opacity-50 cursor-not-allowed"
                    : "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white cursor-pointer shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-[0.98]"
                }`}
                title={!permissions.billing_send_line ? "คุณไม่มีสิทธิ์ในการส่ง LINE OA" : undefined}
              >
                <Send className="w-3.5 h-3.5" />
                <span>ส่ง LINE OA ทุกห้องพร้อมกัน</span>
              </button>
            )}
          </div>
        </div>

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
              
              const calculatedAmount = item.baseRent + elecCost + waterCost + commonFee + Number(item.otherServiceAmount || 0)
              const displayedTotal = calculatedAmount + (item.penaltyAmount || 0)
              const isModified = item.billStatus !== "not_created" && item.billAmount !== displayedTotal
              const isSaveDisabled = item.tenantName
                ? (item.isMeterSaved && item.billStatus !== "not_created" && !isModified)
                : item.isMeterSaved

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
                        {mode === "meters" ? (
                          item.status === "occupied" ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              มีผู้เช่า
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-500/10 text-slate-500 dark:text-slate-400">
                              ว่าง
                            </span>
                          )
                        ) : activeTab === "all" && (
                          <span className={`inline-block text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                            !item.tenantName ? (isDark ? "bg-slate-800/40 text-slate-500 border border-slate-700/30" : "bg-slate-100 text-slate-450 border border-slate-200") :
                            item.billStatus === "paid" ? (isDark ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border border-emerald-200") :
                            item.billStatus === "pending" ? (isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse" : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse") :
                            item.billStatus === "unpaid" ? (isDark ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200") :
                            (isDark ? "bg-slate-900 text-slate-400 border border-slate-800" : "bg-slate-100 text-slate-500 border border-slate-250")
                          }`}>
                            {!item.tenantName ? "ห้องว่าง" :
                             item.billStatus === "paid" ? "ชำระเงินแล้ว" :
                             item.billStatus === "pending" ? "รอตรวจสลิป" :
                             item.billStatus === "unpaid" ? "ค้างชำระ" : "ยังไม่ออกบิล"}
                          </span>
                        )}
                      </div>
                      {mode !== "meters" && (
                        <div className={`font-bold mt-2 ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                          {item.tenantName || <span className={isDark ? "text-slate-600 italic" : "text-slate-400 italic"}>ไม่มีข้อมูลผู้เช่า</span>}
                        </div>
                      )}
                      {mode !== "meters" && activeTab === "all" && (
                        <div className={`text-[11px] font-mono mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {item.tenantName ? `ค่าเช่า ${item.baseRent.toLocaleString()}.- | ส่วนกลาง ${commonFee}.-` : "ห้องว่าง"}
                        </div>
                      )}
                    </div>
                    
                    {/* Total Display (Only in Manage Bills Tab) */}
                    {activeTab === "all" && (
                      <div className="text-right">
                        <div className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>ยอดรวมสุทธิ</div>
                        {item.tenantName ? (
                          item.billStatus !== "not_created" ? (
                            <div className="flex flex-col items-end mt-1">
                              <div className="flex items-center gap-1 justify-end">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  disabled={item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber]}
                                  className={`w-24 text-right pr-1.5 py-0.5 border rounded font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all font-bold disabled:opacity-60 disabled:cursor-not-allowed ${
                                    isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                                  }`}
                                  value={item.billAmount !== undefined ? item.billAmount : 0}
                                  onChange={(e) => handleBillAmountChange?.(item.roomNumber, e.target.value)}
                                />
                                <span className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>บาท</span>
                              </div>
                              {isModified && (
                                <span className={`inline-block text-[8px] bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded font-bold mt-1 ${
                                  isDark ? "text-amber-400" : "text-amber-600"
                                }`}>
                                  ยอดเงินเปลี่ยน
                                </span>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="text-lg font-black text-teal-600 dark:text-teal-400 font-mono">
                                {displayedTotal.toLocaleString()}.-
                              </div>
                              <span className={`inline-block text-[8px] bg-slate-500/10 border border-slate-500/20 px-1 py-0.2 rounded font-bold mt-1 ${
                                isDark ? "text-slate-450" : "text-slate-500"
                              }`}>
                                รอสร้างบิล
                              </span>
                            </>
                          )
                        ) : (
                          <div className={`text-sm font-bold ${isDark ? "text-slate-605" : "text-slate-400"}`}>-</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={`h-px ${isDark ? "bg-slate-900/60" : "bg-slate-200"}`} />

                  {/* 1. แถบจัดการบิล (อ่านอย่างเดียว ไม่มีแบบกรอก ไม่มีปุ่มเซฟ) */}
                  {activeTab === "all" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3.5">
                        {/* ไฟฟ้า Read-only */}
                        <div className={`rounded-xl p-3 border ${
                          isDark ? "bg-blue-950/15 border-blue-900/40" : "bg-blue-50/30 border-blue-100"
                        }`}>
                          <div className={`text-xs font-bold flex items-center gap-1 mb-1.5 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                            <Zap className="w-3.5 h-3.5" /> ไฟฟ้า (kWh)
                          </div>
                          <div className="font-mono text-xs">
                            <span className="text-slate-400">ก่อน: {item.elecPrev}</span>
                            <span className="mx-1 text-slate-400">➔</span>
                            <span className={`font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>รอบนี้: {item.elecCurr || "-"}</span>
                          </div>
                          {hasElecCurr && (
                            <div className="mt-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                              {elecUnitsUsed >= 0 ? `ใช้ไป ${elecUnitsUsed} หน่วย (${elecCost.toLocaleString()}.-)` : "ผิดพลาด"}
                            </div>
                          )}
                        </div>

                        {/* น้ำประปา Read-only */}
                        <div className={`rounded-xl p-3 border ${
                          isDark ? "bg-teal-950/15 border-teal-900/40" : "bg-teal-50/30 border-teal-100"
                        }`}>
                          <div className="text-xs font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1 mb-1.5">
                            <Droplet className="w-3.5 h-3.5" /> น้ำประปา (m³)
                          </div>
                          <div className="font-mono text-xs">
                            <span className="text-slate-400">ก่อน: {item.waterPrev}</span>
                            <span className="mx-1 text-slate-400">➔</span>
                            <span className={`font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>รอบนี้: {item.waterCurr || "-"}</span>
                          </div>
                          {hasWaterCurr && (
                            <div className="mt-1 text-[10px] font-bold text-teal-600 dark:text-teal-400">
                              {waterUnitsUsed >= 0 ? `ใช้ไป ${waterUnitsUsed} หน่วย (${waterCost.toLocaleString()}.-)` : "ผิดพลาด"}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* แก้ไขจำนวนวันปรับล่าช้าในโมบาย */}
                      {item.tenantName && item.billStatus !== "not_created" && (
                        <div className={`rounded-xl p-3 border flex items-center justify-between gap-3 ${
                          isDark ? "bg-rose-950/10 border-rose-950/45" : "bg-rose-50/20 border-rose-100/70"
                        }`}>
                          <div className="flex flex-col">
                            <div className="text-xs font-bold text-rose-500 dark:text-rose-400">
                              ปรับล่าช้า (วัน)
                            </div>
                            {latePenaltyRate > 0 && (
                              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                วันละ {latePenaltyRate}.-
                                <span className="ml-1.5 text-rose-500 font-extrabold">
                                  (+{((item.lateDays || 0) * latePenaltyRate).toLocaleString()}.-)
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              disabled={item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber]}
                              className={`w-12 text-center py-1 border rounded-lg font-mono text-xs focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15 transition-all font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${
                                isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                              }`}
                              value={item.lateDays !== undefined ? item.lateDays : 0}
                              onChange={(e) => handleLateDaysChange?.(item.roomNumber, e.target.value)}
                            />
                            <span className="text-xs font-bold text-slate-500">วัน</span>
                          </div>
                        </div>
                      )}

                      {/* แก้ไขค่าบริการอื่นๆในโมบาย */}
                      {item.tenantName && item.billStatus !== "not_created" && (
                        <div className={`rounded-xl p-3 border flex items-center justify-between gap-3 ${
                          isDark ? "bg-teal-950/10 border-teal-950/45" : "bg-teal-50/20 border-teal-100/70"
                        }`}>
                          <div className="flex flex-col">
                            <div className="text-xs font-bold text-teal-600 dark:text-teal-400">
                              ค่าบริการอื่น ๆ (บาท)
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              จะรวมอยู่ในยอดบิลสุทธิ
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              disabled={item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber]}
                              className={`w-20 text-right pr-2 py-1 border rounded-lg font-mono text-xs focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${
                                isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                              }`}
                              value={item.otherServiceAmount !== undefined ? item.otherServiceAmount : 0}
                              onChange={(e) => handleOtherServiceChange?.(item.roomNumber, e.target.value)}
                            />
                            <span className="text-xs font-bold text-slate-500">บาท</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. แถบมิเตอร์ไฟ (แก้ไขได้ & มีปุ่มเซฟมิเตอร์ไฟ) */}
                  {activeTab === "electric" && (
                    <div className="space-y-3">
                      <div className={`rounded-xl p-3.5 border space-y-3 ${
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
                            disabled={item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber]}
                            className={`w-full h-12 px-3 text-base border rounded-xl font-mono font-bold focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 transition-all placeholder:text-slate-400 disabled:opacity-60 disabled:cursor-not-allowed ${
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

                      <button
                        onClick={async () => {
                          await handleSaveRow(item.roomNumber, "electric");
                          if (item.billStatus === "paid") {
                            setUnlockedPaidRooms(prev => ({ ...prev, [item.roomNumber]: false }));
                          }
                        }}
                        disabled={isSaveDisabled}
                        className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          isSaveDisabled
                            ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-250 dark:border-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                            : "bg-blue-600 hover:bg-blue-500 border border-blue-500/30 text-white shadow-lg shadow-blue-600/10 active:scale-[0.98]"
                        }`}
                      >
                        <Save className="w-4 h-4" /> บันทึกมิเตอร์ไฟห้อง {item.roomNumber}
                      </button>
                    </div>
                  )}

                  {/* 3. แถบมิเตอร์น้ำ (แก้ไขได้ & มีปุ่มเซฟมิเตอร์น้ำ) */}
                  {activeTab === "water" && (
                    <div className="space-y-3">
                      <div className="bg-teal-50/50 dark:bg-teal-500/5 rounded-xl p-3.5 border border-teal-100 dark:border-teal-500/10 space-y-3">
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
                            disabled={item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber]}
                            className="w-full h-12 px-3 text-base bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none focus:border-teal-500/80 focus:ring-1 focus:ring-teal-500/30 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 disabled:opacity-60 disabled:cursor-not-allowed"
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

                      <button
                        onClick={async () => {
                          await handleSaveRow(item.roomNumber, "water");
                          if (item.billStatus === "paid") {
                            setUnlockedPaidRooms(prev => ({ ...prev, [item.roomNumber]: false }));
                          }
                        }}
                        disabled={isSaveDisabled}
                        className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          isSaveDisabled
                            ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-250 dark:border-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                            : "bg-teal-600 hover:bg-teal-500 border border-teal-500/30 text-white shadow-lg shadow-teal-600/10 active:scale-[0.98]"
                        }`}
                      >
                        <Save className="w-4 h-4" /> บันทึกมิเตอร์น้ำห้อง {item.roomNumber}
                      </button>
                    </div>
                  )}

                  {/* Action Buttons Section (เฉพาะแถบจัดการบิลเท่านั้น) */}
                  {activeTab === "all" && item.billStatus !== "not_created" && (
                    <div className="pt-2 space-y-2">
                      {item.isEdited ? (
                        <button
                          onClick={async () => {
                            await handleSaveLateDays?.(item.roomNumber);
                            if (item.billStatus === "paid") {
                              setUnlockedPaidRooms(prev => ({ ...prev, [item.roomNumber]: false }));
                            }
                          }}
                          className="w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 text-white shadow-lg shadow-emerald-600/10 active:scale-[0.98]"
                        >
                          <Save className="w-4 h-4" /> บันทึกบิล
                        </button>
                      ) : item.billStatus === "pending" ? (
                        <button
                          onClick={() => {
                            setSelectedBill(item)
                            setSlipModalOpen(true)
                          }}
                          className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/10 cursor-pointer"
                        >
                          <Eye className="w-4 h-4" /> ตรวจสอบสลิปโอนเงิน
                        </button>
                      ) : (
                        <div className="space-y-2">
                          {/* บันทึกชำระเงินค้างชำระ */}
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

                          {/* ปุ่มแก้ไขบิลสำหรับบิลที่ชำระเงินแล้ว */}
                          {item.billStatus === "paid" && (
                            <button
                              onClick={() => {
                                const isCurrentlyUnlocked = !!unlockedPaidRooms[item.roomNumber];
                                setUnlockedPaidRooms(prev => ({
                                  ...prev,
                                  [item.roomNumber]: !isCurrentlyUnlocked
                                }));
                              }}
                              className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                unlockedPaidRooms[item.roomNumber]
                                  ? "bg-rose-600 hover:bg-rose-500 border border-rose-500/30 text-white shadow-lg shadow-rose-600/10 active:scale-[0.98]"
                                  : "bg-blue-600 hover:bg-blue-500 border border-blue-500/30 text-white shadow-lg shadow-blue-600/10 active:scale-[0.98]"
                              }`}
                            >
                              {unlockedPaidRooms[item.roomNumber] ? (
                                <>
                                  <X className="w-4 h-4" />
                                  <span>ยกเลิกแก้ไข</span>
                                </>
                              ) : (
                                <>
                                  <Edit3 className="w-4 h-4" />
                                  <span>แก้ไขบิล</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
                {mode === "meters" ? (
                  <th className="pb-3 w-40">สถานะห้อง</th>
                ) : (
                  <th className="pb-3 w-40">ผู้เช่า / ค่าเช่า</th>
                )}
                
                {/* 1. แถบจัดการบิล */}
                {activeTab === "all" && (
                  <>
                    <th className="pb-3 text-center bg-blue-50/40 dark:bg-blue-500/5 rounded-t-xl w-44 border-l border-slate-200 dark:border-slate-800/40 text-blue-600 dark:text-blue-400 font-bold">มิเตอร์ไฟฟ้า (kWh)</th>
                    <th className="pb-3 text-center bg-teal-50/40 dark:bg-teal-500/5 rounded-t-xl w-44 border-l border-r border-slate-200 dark:border-slate-800/40 text-teal-600 dark:text-teal-400 font-bold">มิเตอร์น้ำ (m³)</th>
                    <th className="pb-3 text-center w-36 text-slate-500 dark:text-slate-450 font-bold border-r border-slate-200 dark:border-slate-800/40">ค่าบริการอื่น ๆ (บาท)</th>
                    <th className="pb-3 text-center w-36 text-slate-500 dark:text-slate-450 font-bold">ปรับล่าช้า (วัน)</th>
                    <th className="pb-3 text-right pr-4 w-32">ยอดรวมบิล</th>
                    <th className="pb-3 text-center w-28">สถานะ</th>
                    <th className="pb-3 text-center w-52 pr-2">การจัดการบิล</th>
                  </>
                )}

                {/* 2. แถบมิเตอร์ไฟ */}
                {activeTab === "electric" && (
                  <>
                    <th className="pb-3 text-center bg-blue-50/60 dark:bg-blue-500/5 rounded-t-xl w-32 border-l border-slate-200 dark:border-slate-800/40 text-blue-600 dark:text-blue-400 font-bold">ไฟก่อนหน้า</th>
                    <th className="pb-3 text-center bg-blue-50/60 dark:bg-blue-500/5 w-36 text-blue-600 dark:text-blue-400 font-bold">ไฟรอบนี้</th>
                    <th className="pb-3 text-center bg-blue-50/60 dark:bg-blue-500/5 w-28 rounded-t-xl border-r border-slate-200 dark:border-slate-800/40 text-blue-600 dark:text-blue-400 font-bold">หน่วย/ยอดไฟ</th>
                    <th className="pb-3 text-center w-40 pr-2">บันทึกข้อมูล</th>
                  </>
                )}

                {/* 3. แถบมิเตอร์น้ำ */}
                {activeTab === "water" && (
                  <>
                    <th className="pb-3 text-center bg-teal-50/60 dark:bg-teal-500/5 rounded-t-xl w-32 border-l border-slate-200 dark:border-slate-800/40 text-teal-600 dark:text-teal-400 font-bold">น้ำก่อนหน้า</th>
                    <th className="pb-3 text-center bg-teal-50/60 dark:bg-teal-500/5 w-36 text-teal-600 dark:text-teal-400 font-bold">น้ำรอบนี้</th>
                    <th className="pb-3 text-center bg-teal-50/60 dark:bg-teal-500/5 w-28 rounded-t-xl border-r border-slate-200 dark:border-slate-800/40 text-teal-600 dark:text-teal-400 font-bold">หน่วย/ยอดน้ำ</th>
                    <th className="pb-3 text-center w-40 pr-2">บันทึกข้อมูล</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={colSpanVal} className="py-12 text-center text-slate-500">
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
                  
                  const calculatedAmount = item.baseRent + elecCost + waterCost + commonFee + Number(item.otherServiceAmount || 0)
                  const displayedTotal = calculatedAmount + (item.penaltyAmount || 0)

                  const isModified = item.billStatus !== "not_created" && item.billAmount !== displayedTotal
                  const isSaveDisabled = item.tenantName
                    ? (item.isMeterSaved && item.billStatus !== "not_created" && !isModified)
                    : item.isMeterSaved

                  return (
                    <tr key={item.roomNumber} className={`transition-colors ${isDark ? "hover:bg-slate-900/15" : "hover:bg-slate-50/80"}`}>
                      {/* ห้อง */}
                      <td className={`py-4 pl-3 font-black text-sm ${isDark ? "text-slate-100" : "text-slate-800"}`}>{item.roomNumber}</td>
                      
                      {/* ผู้เช่า / ค่าเช่าห้อง หรือ สถานะห้อง */}
                      <td className="py-4">
                        {mode === "meters" ? (
                          item.status === "occupied" ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              มีผู้เช่า
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-500 dark:text-slate-400">
                              ว่าง
                            </span>
                          )
                        ) : (
                          <>
                            <div className={`font-bold truncate max-w-[140px] ${isDark ? "text-slate-300" : "text-slate-700"}`} title={item.tenantName || "ไม่มีผู้เช่า"}>
                              {item.tenantName || <span className={isDark ? "text-slate-600 italic" : "text-slate-400 italic"}>ไม่มีข้อมูลผู้เช่า</span>}
                            </div>
                            <div className={`text-[10px] font-mono mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              {item.tenantName ? `ค่าเช่า ${item.baseRent.toLocaleString()}.-` : "ห้องว่าง"}
                            </div>
                          </>
                        )}
                      </td>

                      {/* --- 1. แถบจัดการบิล (อ่านอย่างเดียว) --- */}
                      {activeTab === "all" && (
                        <>
                          {/* มิเตอร์ไฟฟ้า (kWh) - อ่านอย่างเดียว */}
                          <td className="py-4 text-center bg-blue-50/10 dark:bg-blue-500/5 border-l border-slate-200 dark:border-slate-800/40 px-3">
                            <div className="font-mono text-xs font-semibold">
                              <span className={isDark ? "text-slate-400" : "text-slate-500"}>{item.elecPrev}</span>
                              <span className="mx-1.5 text-slate-400">➔</span>
                              <span className={`font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{item.elecCurr || "-"}</span>
                            </div>
                            <div className="mt-1">
                              {hasElecCurr ? (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  elecUnitsUsed < 0 
                                    ? "bg-rose-500/10 text-rose-500" 
                                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                }`}>
                                  {elecUnitsUsed >= 0 ? `${elecUnitsUsed} หน่วย (${elecCost.toLocaleString()}.-)` : "ผิดพลาด"}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">รอจดในแถบไฟ</span>
                              )}
                            </div>
                          </td>

                          {/* มิเตอร์น้ำ (m³) - อ่านอย่างเดียว */}
                          <td className="py-4 text-center bg-teal-50/10 dark:bg-teal-500/5 border-l border-r border-slate-200 dark:border-slate-800/40 px-3">
                            <div className="font-mono text-xs font-semibold">
                              <span className={isDark ? "text-slate-400" : "text-slate-500"}>{item.waterPrev}</span>
                              <span className="mx-1.5 text-slate-400">➔</span>
                              <span className={`font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{item.waterCurr || "-"}</span>
                            </div>
                            <div className="mt-1">
                              {hasWaterCurr ? (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  waterUnitsUsed < 0 
                                    ? "bg-rose-500/10 text-rose-500" 
                                    : "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                }`}>
                                  {waterUnitsUsed >= 0 ? `${waterUnitsUsed} หน่วย (${waterCost.toLocaleString()}.-)` : "ผิดพลาด"}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">รอจดในแถบน้ำ</span>
                              )}
                            </div>
                          </td>

                          {/* ค่าบริการอื่น ๆ (บาท) */}
                          <td className="py-4 text-center px-2 border-r border-slate-150 dark:border-slate-800/40">
                            {item.tenantName && item.billStatus !== "not_created" ? (
                              <div className="flex items-center gap-1 justify-center">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="0"
                                  disabled={item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber]}
                                  className={`w-20 text-right pr-2 py-1 border rounded-lg font-mono text-xs focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${
                                    isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                                  }`}
                                  value={item.otherServiceAmount !== undefined ? item.otherServiceAmount : 0}
                                  onChange={(e) => handleOtherServiceChange?.(item.roomNumber, e.target.value)}
                                />
                                <span className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>บาท</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 dark:text-slate-600">-</span>
                            )}
                          </td>

                          {/* ปรับล่าช้า (วัน) */}
                          <td className="py-4 text-center px-2 border-r border-slate-100 dark:border-slate-800/40">
                            {item.tenantName && item.billStatus !== "not_created" ? (
                              <div className="flex flex-col items-center">
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    disabled={item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber]}
                                    className={`w-12 text-center py-1 border rounded-lg font-mono text-xs focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15 transition-all font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${
                                      isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                                    }`}
                                    value={item.lateDays !== undefined ? item.lateDays : 0}
                                    onChange={(e) => handleLateDaysChange?.(item.roomNumber, e.target.value)}
                                  />
                                  <span className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>วัน</span>
                                </div>
                                {latePenaltyRate > 0 && (
                                  <span className={`text-[9px] mt-1 font-bold ${isDark ? "text-rose-450" : "text-rose-500"}`} title={`ค่าปรับวันละ ${latePenaltyRate} บาท`}>
                                    ปรับ +{((item.lateDays || 0) * latePenaltyRate).toLocaleString()}.-
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 dark:text-slate-600">-</span>
                            )}
                          </td>

                          {/* ยอดบิลรวม */}
                          <td className="py-4 text-right pr-4 font-mono">
                            {item.tenantName ? (
                              item.billStatus !== "not_created" ? (
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center gap-1.5 justify-end">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      disabled={item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber]}
                                      className={`w-28 text-right pr-2 py-1 border rounded-lg font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all font-black disabled:opacity-60 disabled:cursor-not-allowed ${
                                        isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                                      }`}
                                      value={item.billAmount !== undefined ? item.billAmount : 0}
                                      onChange={(e) => handleBillAmountChange?.(item.roomNumber, e.target.value)}
                                    />
                                    <span className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>บาท</span>
                                  </div>
                                  {isModified && (
                                    <span className={`inline-block text-[8px] bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded font-bold mt-1 ${
                                      isDark ? "text-amber-400" : "text-amber-600"
                                    }`}>
                                      ยอดเงินเปลี่ยน
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <div className={`text-sm font-black ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                                    {displayedTotal.toLocaleString()}.-
                                  </div>
                                  <span className={`inline-block text-[8px] bg-slate-500/10 border border-slate-500/20 px-1 py-0.2 rounded font-bold mt-1 ${
                                    isDark ? "text-slate-450" : "text-slate-500"
                                  }`}>
                                    รอสร้างบิล
                                  </span>
                                </>
                              )
                            ) : (
                              <div className={`text-sm font-bold ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                                -
                              </div>
                            )}
                          </td>

                          {/* สถานะบิล */}
                          <td className="py-4 text-center">
                            <span className={`inline-block text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                              !item.tenantName ? (isDark ? "bg-slate-800/40 text-slate-500 border border-slate-700/30" : "bg-slate-100 text-slate-450 border border-slate-200") :
                              item.billStatus === "paid" ? (isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200") :
                              item.billStatus === "pending" ? (isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse" : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse") :
                              item.billStatus === "unpaid" ? (isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200") :
                              (isDark ? "bg-slate-900 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-500 border-slate-250")
                            }`}>
                              {!item.tenantName ? "ห้องว่าง" :
                               item.billStatus === "paid" ? "ชำระเงินแล้ว" :
                               item.billStatus === "pending" ? "รอตรวจสลิป" :
                               item.billStatus === "unpaid" ? "ค้างชำระ" : "ยังไม่ออกบิล"}
                            </span>
                          </td>

                          {/* แถบการจัดการบิล */}
                          <td className="py-4 text-center pr-2">
                            <div className="flex items-center justify-center gap-1.5">
                              {item.isEdited ? (
                                <button
                                  onClick={async () => {
                                    await handleSaveLateDays?.(item.roomNumber);
                                    if (item.billStatus === "paid") {
                                      setUnlockedPaidRooms(prev => ({ ...prev, [item.roomNumber]: false }));
                                    }
                                  }}
                                  className={`p-1.5 rounded-xl border transition-all font-semibold text-xs flex items-center gap-1 hover:scale-105 cursor-pointer ${
                                    isDark
                                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 hover:text-white"
                                      : "bg-emerald-50 text-emerald-700 border-emerald-250 hover:bg-emerald-500 hover:text-white"
                                  }`}
                                  title="บันทึกจำนวนวันปรับล่าช้าลงระบบ"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-bold">บันทึกบิล</span>
                                </button>
                              ) : item.billStatus === "pending" ? (
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
                                  {/* บันทึกชำระเงินค้างชำระ */}
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

                                  {/* ปุ่มแก้ไขบิลสำหรับบิลที่ชำระเงินแล้ว */}
                                  {item.billStatus === "paid" && (
                                    <button
                                      onClick={() => {
                                        const isCurrentlyUnlocked = !!unlockedPaidRooms[item.roomNumber];
                                        setUnlockedPaidRooms(prev => ({
                                          ...prev,
                                          [item.roomNumber]: !isCurrentlyUnlocked
                                        }));
                                      }}
                                      className={`p-1.5 rounded-xl border transition-all font-semibold text-xs flex items-center gap-1 hover:scale-105 cursor-pointer ${
                                        unlockedPaidRooms[item.roomNumber]
                                          ? isDark
                                            ? "bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500 hover:text-white"
                                            : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-500 hover:text-white"
                                          : isDark
                                            ? "bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500 hover:text-white"
                                            : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-500 hover:text-white"
                                      }`}
                                      title={unlockedPaidRooms[item.roomNumber] ? "ล็อกการแก้ไขบิล" : "ปลดล็อกเพื่อแก้ไขรายละเอียดบิล"}
                                    >
                                      {unlockedPaidRooms[item.roomNumber] ? (
                                        <>
                                          <X className="w-3.5 h-3.5" />
                                          <span className="text-[10px] font-bold">ยกเลิกแก้ไข</span>
                                        </>
                                      ) : (
                                        <>
                                          <Edit3 className="w-3.5 h-3.5" />
                                          <span className="text-[10px] font-bold">แก้ไขบิล</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">ยังไม่ออกบิล</span>
                              )}
                            </div>
                          </td>
                        </>
                      )}

                      {/* --- 2. แถบมิเตอร์ไฟ --- */}
                      {activeTab === "electric" && (
                        <>
                          {/* ไฟก่อนหน้า */}
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

                          {/* ไฟรอบนี้ (Input) */}
                          <td className="py-4 text-center bg-blue-50/20 dark:bg-blue-500/5 px-2">
                            <div className="relative inline-block">
                              <input
                                type="text"
                                placeholder="กรอกเลข"
                                disabled={item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber]}
                                className={`w-24 text-center py-1.5 border rounded-lg font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${
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

                          {/* หน่วย / ยอดไฟ */}
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

                          {/* บันทึก */}
                          <td className="py-4 text-center pr-2">
                            <button
                              onClick={async () => {
                                await handleSaveRow(item.roomNumber, "electric");
                                if (item.billStatus === "paid") {
                                  setUnlockedPaidRooms(prev => ({ ...prev, [item.roomNumber]: false }));
                                }
                              }}
                              disabled={isSaveDisabled}
                              className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all mx-auto cursor-pointer ${
                                isSaveDisabled
                                  ? (isDark ? "border-slate-800 bg-slate-950/20 text-slate-600 cursor-not-allowed" : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed")
                                  : (isDark ? "border-blue-500/30 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white hover:scale-105 shadow-sm" : "border-blue-200 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white hover:scale-105 shadow-sm")
                              }`}
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>บันทึกมิเตอร์ไฟ</span>
                            </button>
                          </td>
                        </>
                      )}

                      {/* --- 3. แถบมิเตอร์น้ำ --- */}
                      {activeTab === "water" && (
                        <>
                          {/* น้ำก่อนหน้า */}
                          <td className="py-4 text-center bg-teal-50/20 dark:bg-teal-500/5 border-l border-slate-200 dark:border-slate-800/40 px-2">
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

                          {/* น้ำรอบนี้ (Input) */}
                          <td className="py-4 text-center bg-teal-50/20 dark:bg-teal-500/5 px-2">
                            <div className="relative inline-block">
                              <input
                                type="text"
                                placeholder="กรอกเลข"
                                disabled={item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber]}
                                className={`w-24 text-center py-1.5 border rounded-lg font-mono text-xs focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${
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

                          {/* หน่วย / ยอดน้ำ */}
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

                          {/* บันทึก */}
                          <td className="py-4 text-center pr-2">
                            <button
                              onClick={async () => {
                                await handleSaveRow(item.roomNumber, "water");
                                if (item.billStatus === "paid") {
                                  setUnlockedPaidRooms(prev => ({ ...prev, [item.roomNumber]: false }));
                                }
                              }}
                              disabled={isSaveDisabled}
                              className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all mx-auto cursor-pointer ${
                                isSaveDisabled
                                  ? (isDark ? "border-slate-800 bg-slate-950/20 text-slate-600 cursor-not-allowed" : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed")
                                  : (isDark ? "border-teal-500/30 bg-teal-500/10 hover:bg-teal-500 text-teal-400 hover:text-white hover:scale-105 shadow-sm" : "border-teal-200 bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white hover:scale-105 shadow-sm")
                              }`}
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>บันทึกมิเตอร์น้ำ</span>
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={colSpanVal} className="py-12 text-center text-slate-500">
                    ไม่มีรายการห้องพักที่ใช้งานหรือจ้างเช่าอยู่ในขณะนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ปุ่มบันทึกข้อมูลมิเตอร์ทั้งหมด (Bulk Save - แสดงเฉพาะในแถบมิเตอร์ไฟ / มิเตอร์น้ำ) */}
        {!loading && unifiedItems.length > 0 && activeTab !== "all" && (
          <div className="mt-8 flex justify-center px-4 md:px-0 pb-4">
            <button
              onClick={async () => {
                await handleSaveAll(activeTab as "electric" | "water");
                setUnlockedPaidRooms({});
              }}
              className={`w-full md:w-auto min-w-[280px] h-14 md:h-12 bg-gradient-to-r text-white font-extrabold px-8 rounded-2xl flex items-center justify-center gap-2.5 text-sm md:text-xs shadow-lg transition-all cursor-pointer active:scale-[0.98] border animate-pulse hover:animate-none ${
                activeTab === "electric"
                  ? "from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/20 hover:shadow-blue-500/30 border-blue-500/30"
                  : "from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 shadow-teal-600/20 hover:shadow-teal-500/30 border-teal-500/30"
              }`}
            >
              <Save className="w-5 h-5 md:w-4.5 md:h-4.5 text-white/90" />
              <span>
                {activeTab === "electric"
                  ? `บันทึกมิเตอร์ไฟทุกห้อง (${unifiedItems.length} ห้อง)`
                  : `บันทึกมิเตอร์น้ำทุกห้อง (${unifiedItems.length} ห้อง)`}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* โมดอลสำหรับส่ง LINE OA แบบกลุ่ม */}
      {bulkSendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className={`w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 md:p-6 rounded-3xl relative shadow-2xl border flex flex-col ${
            isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
          }`}>
            {/* ปุ่มปิด */}
            <button
              onClick={() => {
                if (bulkSendingStatus !== "sending") {
                  setBulkSendModalOpen(false)
                }
              }}
              disabled={bulkSendingStatus === "sending"}
              className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all ${
                bulkSendingStatus === "sending" ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
              } ${
                isDark ? "text-slate-400 hover:text-white hover:bg-slate-900/50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            {/* ส่วนหัวโมดอล */}
            <div className="mb-4">
              <h3 className={`text-base font-black flex items-center gap-2 ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                <MessageSquare className={`w-5 h-5 ${isDark ? "text-emerald-400" : "text-emerald-500"}`} />
                <span>ส่ง LINE OA และบิลค่าเช่าประจำเดือน</span>
              </h3>
              <p className={`text-xs mt-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                ส่งแจ้งเตือนยอดบิลพรีเมียมและลิงก์ออนไลน์เข้าแชท LINE OA ของผู้เช่าทุกคนพร้อมกัน
              </p>
            </div>

            {/* การ์ดสรุปสถานะการผูก LINE */}
            <div className="grid grid-cols-3 gap-2.5 mb-5">
              <div className={`p-3 rounded-xl border text-center ${
                isDark ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-150"
              }`}>
                <div className={`text-[10px] font-bold ${isDark ? "text-slate-500" : "text-slate-400"}`}>ผู้เช่าที่มีบิล</div>
                <div className={`text-sm md:text-lg font-black mt-1 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  {activeRooms.length} <span className="text-xs font-medium">ห้อง</span>
                </div>
              </div>
              <div className={`p-3 rounded-xl border text-center bg-emerald-500/5 border-emerald-500/20`}>
                <div className="text-[10px] font-bold text-emerald-500">ผูก LINE แล้ว</div>
                <div className="text-sm md:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {connectedRooms.length} <span className="text-xs font-medium">ห้อง</span>
                </div>
              </div>
              <div className={`p-3 rounded-xl border text-center bg-amber-500/5 border-amber-500/20`}>
                <div className="text-[10px] font-bold text-amber-500">ยังไม่ผูก LINE</div>
                <div className="text-sm md:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
                  {unconnectedRooms.length} <span className="text-xs font-medium">ห้อง</span>
                </div>
              </div>
            </div>

            {/* แถบเลือกสลับกลุ่ม (พร้อมส่ง vs ไม่ได้ผูก) */}
            <div className={`flex p-1 rounded-xl mb-4 self-start shadow-inner border ${
              isDark ? "bg-slate-950/40 border-slate-850" : "bg-slate-100 border-slate-200"
            }`}>
              <button
                onClick={() => setModalActiveTab("connected")}
                className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  modalActiveTab === "connected"
                    ? (isDark ? "bg-slate-900 text-emerald-400 border border-slate-800" : "bg-white text-emerald-600 border border-slate-200 shadow-sm")
                    : (isDark ? "text-slate-500 hover:text-slate-400" : "text-slate-500 hover:text-slate-700")
                }`}
              >
                พร้อมส่งอัตโนมัติ ({connectedRooms.length})
              </button>
              <button
                onClick={() => setModalActiveTab("unconnected")}
                className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  modalActiveTab === "unconnected"
                    ? (isDark ? "bg-slate-900 text-amber-400 border border-slate-800" : "bg-white text-amber-600 border border-slate-200 shadow-sm")
                    : (isDark ? "text-slate-500 hover:text-slate-400" : "text-slate-500 hover:text-slate-700")
                }`}
              >
                ส่งบิล Manual ({unconnectedRooms.length})
              </button>
            </div>

            {/* เนื้อหาหลักในโมดอล */}
            <div className={`flex-1 border rounded-2xl p-4 overflow-y-auto min-h-[220px] max-h-[350px] mb-5 ${
              isDark ? "bg-slate-950/20 border-slate-850" : "bg-slate-50 border-slate-150"
            }`}>
              
              {/* แถบผู้ที่เชื่อมต่อ LINE แล้ว */}
              {modalActiveTab === "connected" && (
                <div className="space-y-2.5">
                  {connectedRooms.length > 0 ? (
                    connectedRooms.map(item => {
                      const result = bulkSendResults[item.roomNumber]
                      return (
                        <div key={item.roomNumber} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border text-xs gap-3 transition-all ${
                          isDark ? "bg-slate-900/60 border-slate-850" : "bg-white border-slate-200"
                        }`}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`font-black px-2 py-0.5 rounded-lg border shrink-0 ${
                              isDark ? "bg-slate-950 text-slate-200 border-slate-800" : "bg-slate-50 text-slate-700 border-slate-250"
                            }`}>
                              ห้อง {item.roomNumber}
                            </span>
                            <span className={`font-bold truncate max-w-[140px] sm:max-w-none ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                              {item.tenantName}
                            </span>
                            <span className={`text-[10px] font-mono font-semibold shrink-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              ({item.billAmount?.toLocaleString()}.-)
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                            {bulkSendingStatus === "idle" && (
                              <button
                                onClick={() => handleSendLine(item.roomNumber)}
                                disabled={!permissions.billing_send_line}
                                className={`h-7 px-2.5 rounded-lg text-[10px] font-black flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                                  !permissions.billing_send_line
                                    ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-250 dark:border-slate-900 text-slate-400 dark:text-slate-650 cursor-not-allowed opacity-50"
                                    : isDark 
                                      ? "bg-emerald-950/30 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-900/30 hover:text-emerald-300 cursor-pointer" 
                                      : "bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 hover:text-emerald-800 cursor-pointer"
                                }`}
                                title={!permissions.billing_send_line ? "คุณไม่มีสิทธิ์ในการส่ง LINE OA" : undefined}
                              >
                                <Send className="w-3 h-3" />
                                <span className="whitespace-nowrap">ส่ง LINE OA</span>
                              </button>
                            )}
                            {bulkSendingStatus === "sending" && bulkSendingProgress.currentRoom === item.roomNumber && (
                              <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20 animate-pulse whitespace-nowrap">
                                กำลังส่ง...
                              </span>
                            )}
                            {bulkSendingStatus === "sending" && !result && bulkSendingProgress.currentRoom !== item.roomNumber && (
                              <span className="text-[10px] font-semibold text-slate-450 dark:text-slate-500 whitespace-nowrap">
                                รอคิว...
                              </span>
                            )}
                            {result && (
                              result.success ? (
                                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 whitespace-nowrap">
                                  สำเร็จแล้ว ✅
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2.5 py-0.5 rounded-full border border-red-500/20 whitespace-nowrap" title={result.error}>
                                  ล้มเหลว ❌
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="py-12 text-center text-slate-500 text-xs">
                      ไม่มีห้องที่มีผู้เช่าและเชื่อมต่อ LINE ในรอบบิลนี้
                    </div>
                  )}
                </div>
              )}

              {/* แถบผู้ที่ยังไม่ได้เชื่อมต่อ LINE */}
              {modalActiveTab === "unconnected" && (
                <div className="space-y-3">
                  <div className={`p-3 rounded-xl border text-[11px] font-medium leading-relaxed mb-1 flex gap-2 ${
                    isDark ? "bg-amber-500/5 border-amber-500/10 text-amber-400" : "bg-amber-50/50 border-amber-100 text-amber-700"
                  }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>คำแนะนำ:</strong> เนื่องจากผู้เช่ายังไม่ได้ลงทะเบียนผูกบัญชี LINE OA คุณสามารถคลิกปุ่ม <strong>"คัดลอกสรุปบิล"</strong> หรือ <strong>"ดาวน์โหลด PDF"</strong> เพื่อนำสรุปยอดบิลและลิงก์ออนไลน์ หรือดาวน์โหลดไฟล์ PDF ไปส่งในแชทปกติ (เช่น LINE, Facebook, SMS) ได้ทันที
                    </span>
                  </div>

                  {unconnectedRooms.length > 0 ? (
                    unconnectedRooms.map(item => {
                      const isCopied = copiedRooms[item.roomNumber]
                      return (
                        <div key={item.roomNumber} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border text-xs gap-3 transition-all ${
                          isDark ? "bg-slate-900/60 border-slate-850" : "bg-white border-slate-200"
                        }`}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`font-black px-2 py-0.5 rounded-lg border shrink-0 ${
                              isDark ? "bg-slate-950 text-slate-200 border-slate-800" : "bg-slate-50 text-slate-700 border-slate-250"
                            }`}>
                              ห้อง {item.roomNumber}
                            </span>
                            <span className={`font-bold truncate max-w-[140px] sm:max-w-none ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                              {item.tenantName}
                            </span>
                            <span className={`text-[10px] font-mono font-semibold shrink-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              ({item.billAmount?.toLocaleString()}.-)
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                            {/* ดาวน์โหลด PDF */}
                            <button
                              onClick={() => handleDownloadBillPdf(item)}
                              disabled={downloadingPdfId !== null || !permissions.billing_download_pdf}
                              className={`h-8 px-3 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 ${
                                !permissions.billing_download_pdf
                                  ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-250 dark:border-slate-900 text-slate-400 dark:text-slate-650 cursor-not-allowed opacity-50"
                                  : downloadingPdfId !== null
                                    ? "opacity-45 cursor-not-allowed"
                                    : isDark 
                                      ? "bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-200 hover:text-blue-400 cursor-pointer" 
                                      : "bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-blue-600 cursor-pointer"
                              }`}
                              title={!permissions.billing_download_pdf ? "คุณไม่มีสิทธิ์ในการดาวน์โหลด PDF" : undefined}
                            >
                              {downloadingPdfId === item.roomNumber ? (
                                <div className="w-3.5 h-3.5 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                                  <span className="whitespace-nowrap">ดาวน์โหลด PDF</span>
                                </>
                              )}
                            </button>

                            {/* คัดลอกสรุปบิล */}
                            <button
                              onClick={() => handleCopySummary(item)}
                              disabled={!permissions.billing_copy_summary}
                              className={`h-8 px-3 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 ${
                                !permissions.billing_copy_summary
                                  ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-250 dark:border-slate-900 text-slate-400 dark:text-slate-650 cursor-not-allowed opacity-50"
                                  : isCopied
                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                    : isDark 
                                      ? "bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-200 cursor-pointer" 
                                      : "bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 cursor-pointer"
                              }`}
                              title={!permissions.billing_copy_summary ? "คุณไม่มีสิทธิ์ในการคัดลอกสรุปบิล" : undefined}
                            >
                              {isCopied ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="whitespace-nowrap">คัดลอกสรุปบิลแล้ว!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span className="whitespace-nowrap">คัดลอกสรุปบิล</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="py-12 text-center text-slate-500 text-xs">
                      ผู้เช่าทุกห้องผูก LINE OA ครบแล้ว ไม่มีห้องคงค้างในส่วนนี้
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* แถบแจ้งเตือนความคืบหน้าขณะกำลังส่ง (Progress bar) */}
            {bulkSendingStatus === "sending" && (
              <div className={`p-4 rounded-2xl border mb-5 space-y-2 ${
                isDark ? "bg-slate-950 border-slate-850" : "bg-blue-50/30 border-blue-100"
              }`}>
                <div className="flex justify-between text-xs font-bold font-mono">
                  <span className={isDark ? "text-slate-300" : "text-slate-700"}>
                    กำลังส่ง: ห้อง {bulkSendingProgress.currentRoom}
                  </span>
                  <span className="text-blue-500">
                    {bulkSendingProgress.current} / {bulkSendingProgress.total} ห้อง
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(bulkSendingProgress.current / bulkSendingProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 italic text-center animate-pulse">
                  กรุณาอย่าปิดหน้านี้ขณะที่กำลังดำเนินการส่งข้อมูล...
                </p>
              </div>
            )}

            {/* กล่องแสดงสรุปเมื่อส่งเสร็จสิ้น */}
            {bulkSendingStatus === "completed" && (
              <div className={`p-4 rounded-2xl border mb-5 text-center ${
                isDark ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
              }`}>
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-xs font-black">ส่งบิลเข้า LINE OA กลุ่มเรียบร้อย!</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  ส่งยอดค่าเช่าเข้าแชท LINE OA สำเร็จทั้งหมด{" "}
                  {Object.values(bulkSendResults).filter(r => r.success).length} ห้อง จากทั้งหมด {connectedRooms.length} ห้อง
                </p>
              </div>
            )}

            {/* ส่วนควบคุมท้ายสุด */}
            <div className="flex justify-end gap-2 text-xs font-bold pt-2 border-t dark:border-slate-800">
              <button
                onClick={() => setBulkSendModalOpen(false)}
                disabled={bulkSendingStatus === "sending"}
                className={`px-4 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  isDark ? "bg-slate-950 border-slate-850 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                } ${bulkSendingStatus === "sending" ? "opacity-30 cursor-not-allowed" : ""}`}
              >
                {bulkSendingStatus === "completed" ? "ปิดหน้าต่าง" : "ยกเลิก"}
              </button>

              {modalActiveTab === "connected" && bulkSendingStatus !== "completed" && connectedRooms.length > 0 && (
                <button
                  onClick={startBulkSend}
                  disabled={bulkSendingStatus === "sending" || !permissions.billing_send_line}
                  className={`px-6 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-[0.98] ${
                    !permissions.billing_send_line
                      ? "bg-slate-400 dark:bg-slate-850 border border-slate-300 dark:border-slate-800 text-slate-200 dark:text-slate-500 opacity-50 cursor-not-allowed shadow-none"
                      : bulkSendingStatus === "sending"
                        ? "opacity-30 cursor-not-allowed animate-pulse bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-emerald-500/10"
                        : "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white cursor-pointer shadow-emerald-500/10 hover:shadow-emerald-500/20"
                  }`}
                  title={!permissions.billing_send_line ? "คุณไม่มีสิทธิ์ในการส่ง LINE OA" : undefined}
                >
                  <Send className="w-4 h-4" />
                  <span>เริ่มส่งเข้า LINE OA ({connectedRooms.length} ห้อง)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
