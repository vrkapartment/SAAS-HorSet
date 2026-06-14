"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
import {
  Receipt,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  Plus,
  Send,
  X,
  CreditCard,
  UserCheck,
  Download
} from "lucide-react"

interface BillItem {
  id: string
  roomNumber: string
  tenantName: string
  amount: number
  status: "unpaid" | "pending" | "paid"
  billingCycle: string
  slipUrl: string | null
  electricUnits: number
  waterUnits: number
}

export default function BillingPage() {
  const [billingCycle, setBillingCycle] = useState("2026-06")
  
  const initialBills: BillItem[] = [
    { id: "1", roomNumber: "101", tenantName: "คุณวิภาวี สมบูรณ์", amount: 5400, status: "paid", billingCycle: "2026-06", slipUrl: "/slip-mock.jpg", electricUnits: 60, waterUnits: 9 },
    { id: "2", roomNumber: "102", tenantName: "คุณนพดล สุขศรี", amount: 6200, status: "paid", billingCycle: "2026-06", slipUrl: "/slip-mock.jpg", electricUnits: 96, waterUnits: 12 },
    { id: "3", roomNumber: "103", tenantName: "คุณวรรณภา ใสดี", amount: 5850, status: "unpaid", billingCycle: "2026-06", slipUrl: null, electricUnits: 85, waterUnits: 12 },
    { id: "4", roomNumber: "105", tenantName: "คุณณัฐพล ใจดี", amount: 5760, status: "pending", billingCycle: "2026-06", slipUrl: "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=300", electricUnits: 84, waterUnits: 12 },
    { id: "5", roomNumber: "201", tenantName: "คุณอรทัย มั่นคง", amount: 6100, status: "unpaid", billingCycle: "2026-06", slipUrl: null, electricUnits: 90, waterUnits: 10 },
    { id: "6", roomNumber: "202", tenantName: "คุณสุชาติ เลิศรส", amount: 5310, status: "paid", billingCycle: "2026-06", slipUrl: "/slip-mock.jpg", electricUnits: 67, waterUnits: 9 }
  ]

  // สเตตจำลองรายการบิลในระบบ
  const [bills, setBills] = useState<BillItem[]>(initialBills)

  // โหลดและบันทึกข้อมูลบิลจาก localStorage
  useEffect(() => {
    const savedBills = localStorage.getItem("horset_bills")
    if (savedBills) {
      try {
        setBills(JSON.parse(savedBills))
      } catch (e) {
        console.error("Failed to parse bills from localStorage", e)
      }
    } else {
      localStorage.setItem("horset_bills", JSON.stringify(initialBills))
    }
  }, [])

  const updateBills = (newBills: BillItem[]) => {
    setBills(newBills)
    localStorage.setItem("horset_bills", JSON.stringify(newBills))
  }

  // ดึงข้อมูลค่าเช่าห้องพักปกติจากรายการห้องพักใน localStorage
  const getRoomRentPrice = (roomNum: string): number => {
    if (typeof window === "undefined") return 4500
    const savedRooms = localStorage.getItem("horset_rooms")
    if (savedRooms) {
      try {
        const rooms = JSON.parse(savedRooms)
        const room = rooms.find((r: any) => r.roomNumber === roomNum)
        if (room) return room.baseRent
      } catch (e) {
        console.error(e)
      }
    }
    return 4500 // ค่าเริ่มต้นหากหาไม่เจอ
  }

  const [selectedBill, setSelectedBill] = useState<BillItem | null>(null)
  const [slipModalOpen, setSlipModalOpen] = useState(false)
  const [createBillModalOpen, setCreateBillModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)

  // ข้อมูลสำหรับโมดอลสร้างบิลใหม่
  const [newRoomNumber, setNewRoomNumber] = useState("105")
  const [elecUnits, setElecUnits] = useState(80)
  const [waterUnits, setWaterUnits] = useState(10)

  // คำนวณราคาจำลองตามห้องที่เลือก
  const rentPrice = getRoomRentPrice(newRoomNumber)
  const elecRate = 7 // 7 บาทต่อหน่วย
  const waterRate = 18 // 18 บาทต่อหน่วย
  const computedTotal = rentPrice + (elecUnits * elecRate) + (waterUnits * waterRate)

  // ดึงค่ามิเตอร์ที่เคยบันทึกไว้สำหรับห้องที่เลือกแบบอัตโนมัติ
  useEffect(() => {
    const key = `horset_meter_records_${billingCycle}`
    const savedRecords = localStorage.getItem(key)
    if (savedRecords) {
      try {
        const records = JSON.parse(savedRecords)
        const record = records.find((r: any) => r.roomNumber === newRoomNumber)
        if (record) {
          const prevE = Number(record.elecPrev)
          const currE = Number(record.elecCurr)
          const prevW = Number(record.waterPrev)
          const currW = Number(record.waterCurr)
          
          if (!isNaN(currE) && currE > prevE) {
            setElecUnits(currE - prevE)
          } else {
            setElecUnits(80)
          }

          if (!isNaN(currW) && currW > prevW) {
            setWaterUnits(currW - prevW)
          } else {
            setWaterUnits(10)
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
  }, [newRoomNumber, billingCycle])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  // อนุมัติสลิปโอนเงิน
  const handleApproveSlip = (id: string) => {
    const updated = bills.map(b => b.id === id ? { ...b, status: "paid" as const } : b)
    updateBills(updated)
    setSlipModalOpen(false)
    setSelectedBill(null)
    showToast("อนุมัติรายการโอนเงินเสร็จเรียบร้อยแล้ว!")
  }

  // ปฏิเสธสลิปโอนเงิน
  const handleRejectSlip = (id: string) => {
    const updated = bills.map(b => b.id === id ? { ...b, status: "unpaid" as const, slipUrl: null } : b)
    updateBills(updated)
    setSlipModalOpen(false)
    setSelectedBill(null)
    showToast("ปฏิเสธสลิปแล้ว บิลจะกลับไปเป็นสถานะยังไม่จ่าย")
  }

  // จำลองการส่ง LINE OA แจ้งผู้เช่า
  const handleSendLine = (room: string) => {
    showToast(`ส่งไฟล์บิล PDF และพร้อมเพย์ QR ไปยัง LINE ผู้เช่าห้อง ${room} สำเร็จ!`)
  }

  const handleDownloadBillPdf = async (bill: BillItem) => {
    setDownloadingPdfId(bill.id)
    try {
      const { generateBillPdf } = await import("@/lib/pdfHelper")
      const promptPayId = localStorage.getItem("horset_promptpay_id") || "0899999999"
      const promptPayName = localStorage.getItem("horset_promptpay_name") || "สมเจตน์ แสนสุข"
      
      const blob = await generateBillPdf({
        roomNumber: bill.roomNumber,
        tenantName: bill.tenantName,
        billingCycle: bill.billingCycle === "2026-06" ? "มิถุนายน 2026" : "พฤษภาคม 2026",
        baseRent: getRoomRentPrice(bill.roomNumber),
        electricUnits: bill.electricUnits,
        electricRate: 7,
        waterUnits: bill.waterUnits,
        waterRate: 18,
        amount: bill.amount,
        promptPayId,
        promptPayName,
      })

      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `bill_room${bill.roomNumber}_${bill.billingCycle}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToast(`ดาวน์โหลดบิล PDF ห้อง ${bill.roomNumber} เรียบร้อย!`)
    } catch (e) {
      console.error(e)
      alert("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF บิลค่าเช่า")
    } finally {
      setDownloadingPdfId(null)
    }
  }

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault()
    
    // ค้นหาชื่อผู้เช่าปัจจุบันของห้องนั้นๆ
    let targetTenant = "ผู้เช่าจำลอง"
    const savedRooms = localStorage.getItem("horset_rooms")
    if (savedRooms) {
      try {
        const rooms = JSON.parse(savedRooms)
        const room = rooms.find((r: any) => r.roomNumber === newRoomNumber)
        if (room && room.tenantName) {
          targetTenant = room.tenantName
        }
      } catch (e) {}
    }

    const newBill: BillItem = {
      id: Date.now().toString(),
      roomNumber: newRoomNumber,
      tenantName: targetTenant,
      amount: computedTotal,
      status: "unpaid",
      billingCycle,
      slipUrl: null,
      electricUnits: elecUnits,
      waterUnits: waterUnits
    }

    // กรองบิลห้องนั้นในรอบบิลนั้นออกก่อน (เขียนทับ)
    const filtered = bills.filter(b => !(b.roomNumber === newRoomNumber && b.billingCycle === billingCycle))
    updateBills([newBill, ...filtered])
    setCreateBillModalOpen(false)
    showToast(`สร้างบิลและคำนวณเงินห้อง ${newRoomNumber} ยอดรวม ${computedTotal.toLocaleString()} บาท สำเร็จ!`)
  }

  // กรองบิลตามรอบบิลที่เลือก
  const currentBills = bills.filter(b => b.billingCycle === billingCycle)

  return (
    <DashboardLayout role="staff">
      {/* Toast แจ้งเตือน */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 glass-panel border border-teal-500/30 text-teal-400 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up text-xs font-semibold">
          <CheckCircle className="w-4 h-4 text-teal-400" /> {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">ใบแจ้งหนี้และการชำระเงิน</h2>
          <p className="text-xs text-slate-400 mt-1">ออกใบแจ้งยอดชำระรายเดือน ตรวจสลิปโอนเงินธนาคาร และแจ้งเตือนผ่าน LINE OA</p>
        </div>
        
        <div className="flex gap-3">
          <select
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none text-slate-200 text-xs font-semibold"
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value)}
          >
            <option value="2026-06">รอบบิล มิถุนายน 2026</option>
            <option value="2026-05">รอบบิล พฤษภาคม 2026</option>
          </select>
          
          <button
            onClick={() => setCreateBillModalOpen(true)}
            className="glow-btn bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs shadow-lg shadow-blue-600/10"
          >
            <Plus className="w-4 h-4" /> สร้างบิลค่าเช่า
          </button>
        </div>
      </div>

      {/* สรุปบิลคร่าวๆ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="glass-card p-4 rounded-xl border border-slate-900/50 flex items-center gap-3">
          <div className="p-2.5 bg-teal-500/10 text-teal-400 rounded-lg"><CheckCircle className="w-5 h-5" /></div>
          <div>
            <p className="text-[10px] text-slate-400">ชำระเงินเรียบร้อย</p>
            <p className="text-sm font-bold">{currentBills.filter(b => b.status === "paid").length} ห้อง</p>
          </div>
        </div>
        <div className="glass-card p-4 rounded-xl border border-slate-900/50 flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-lg"><Clock className="w-5 h-5" /></div>
          <div>
            <p className="text-[10px] text-slate-400">รอตรวจสอบสลิป</p>
            <p className="text-sm font-bold text-amber-400">{currentBills.filter(b => b.status === "pending").length} ห้อง</p>
          </div>
        </div>
        <div className="glass-card p-4 rounded-xl border border-slate-900/50 flex items-center gap-3">
          <div className="p-2.5 bg-red-500/10 text-red-400 rounded-lg"><AlertCircle className="w-5 h-5" /></div>
          <div>
            <p className="text-[10px] text-slate-400">ค้างชำระเงิน</p>
            <p className="text-sm font-bold text-red-400">{currentBills.filter(b => b.status === "unpaid").length} ห้อง</p>
          </div>
        </div>
      </div>

      {/* ตารางแสดงรายการบิล */}
      <div className="glass-card rounded-2xl border border-slate-900/60 p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-900 text-slate-500 font-semibold">
                <th className="pb-3 pl-2">ห้อง</th>
                <th className="pb-3">ผู้เช่า</th>
                <th className="pb-3 text-center">หน่วยไฟ/น้ำ</th>
                <th className="pb-3 text-right">ยอดรวมบิล</th>
                <th className="pb-3 text-center">สถานะชำระ</th>
                <th className="pb-3 text-center">ตรวจสอบ</th>
                <th className="pb-3 text-center">จัดการบิล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/40">
              {currentBills.length > 0 ? (
                currentBills.map(bill => (
                <tr key={bill.id} className="hover:bg-slate-900/10">
                  <td className="py-4 pl-2 font-bold text-slate-200 text-sm">{bill.roomNumber}</td>
                  <td className="py-4 text-slate-300 font-medium">{bill.tenantName}</td>
                  <td className="py-4 text-center text-slate-400">
                    ไฟ {bill.electricUnits} u. / น้ำ {bill.waterUnits} u.
                  </td>
                  <td className="py-4 text-right font-bold text-slate-200 text-sm">{bill.amount.toLocaleString()} บาท</td>
                  <td className="py-4 text-center">
                    <span className={`inline-block text-[9px] font-bold px-2.5 py-0.5 rounded-full ${
                      bill.status === "paid" ? "bg-teal-500/10 text-teal-400" :
                      bill.status === "pending" ? "bg-amber-500/10 text-amber-400 animate-pulse" :
                      "bg-red-500/10 text-red-400"
                    }`}>
                      {bill.status === "paid" ? "ชำระแล้ว" : bill.status === "pending" ? "ตรวจสอบ" : "ค้างจ่าย"}
                    </span>
                  </td>
                  <td className="py-4 text-center">
                    {bill.status === "pending" ? (
                      <button
                        onClick={() => {
                          setSelectedBill(bill)
                          setSlipModalOpen(true)
                        }}
                        className="py-1 px-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500 hover:text-white font-semibold transition-colors flex items-center gap-1 mx-auto"
                      >
                        <Eye className="w-3.5 h-3.5" /> ตรวจสลิป
                      </button>
                    ) : bill.status === "paid" ? (
                      <span className="text-[10px] text-slate-500 font-semibold flex items-center justify-center gap-1">
                        <CheckCircle className="w-3 h-3 text-teal-500" /> ตรวจสอบแล้ว
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="py-4 text-center">
                    <button
                      onClick={() => handleDownloadBillPdf(bill)}
                      disabled={downloadingPdfId !== null}
                      className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-blue-400 hover:border-blue-500/40 rounded-xl transition-all inline-flex mr-2"
                      title="ดาวน์โหลดบิล PDF"
                    >
                      {downloadingPdfId === bill.id ? (
                        <div className="w-3.5 h-3.5 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleSendLine(bill.roomNumber)}
                      className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-teal-400 hover:border-teal-500/40 rounded-xl transition-all inline-flex"
                      title="ส่งบิลเข้า LINE OA"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    ไม่มีรายการบิลในรอบบิลนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal ตรวจสอบสลิปโอนเงิน */}
      {slipModalOpen && selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 rounded-2xl relative shadow-2xl animate-scale-up grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={() => {
                setSlipModalOpen(false)
                setSelectedBill(null)
              }}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* ซีกภาพสลิป */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-400">รูปภาพสลิปที่แนบมา</h4>
              <div className="w-full aspect-[3/4] bg-slate-950 rounded-xl overflow-hidden border border-slate-900 relative flex items-center justify-center">
                {selectedBill.slipUrl ? (
                  <img
                    src={selectedBill.slipUrl}
                    alt="Slip Upload"
                    className="object-contain w-full h-full"
                  />
                ) : (
                  <p className="text-[10px] text-slate-600">ไม่มีไฟล์สลิป</p>
                )}
              </div>
            </div>

            {/* ซีกรายละเอียดและปุ่มตัดสินใจ */}
            <div className="flex flex-col justify-between pt-4">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-400" /> ตรวจสอบยอดเงินโอน
                </h3>

                <div className="bg-slate-900/60 p-4 rounded-xl space-y-2 border border-slate-900 text-xs">
                  <div className="flex justify-between"><span className="text-slate-500">ห้องพัก:</span><span className="font-bold">{selectedBill.roomNumber}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">ชื่อผู้เช่า:</span><span className="font-semibold">{selectedBill.tenantName}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">ยอดบิลทั้งหมด:</span><span className="font-bold text-teal-400">{selectedBill.amount.toLocaleString()} บาท</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">รอบบิล:</span><span className="font-mono">{selectedBill.billingCycle}</span></div>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-400">
                  โปรดเช็กยอดเงินโอนและเวลารับเงินในแอปบัญชีธนาคารหอพักของคุณให้ตรงกับรูปสลิป
                </div>
              </div>

              <div className="space-y-2 pt-6">
                <button
                  onClick={() => handleApproveSlip(selectedBill.id)}
                  className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-teal-600/10"
                >
                  <UserCheck className="w-4 h-4" /> อนุมัติการชำระเงิน
                </button>
                <button
                  onClick={() => handleRejectSlip(selectedBill.id)}
                  className="w-full py-2.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-xl text-xs font-semibold border border-red-500/30 transition-colors"
                >
                  ปฏิเสธสลิป / ข้อมูลผิดพลาด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal สร้างบิลค่าเช่าใหม่ */}
      {createBillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl relative shadow-2xl animate-scale-up">
            <button
              onClick={() => setCreateBillModalOpen(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-md font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-400" /> สร้างใบแจ้งหนี้ประจำเดือน
            </h3>

            <form onSubmit={handleCreateBill} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">หมายเลขห้อง</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none text-slate-200 text-xs"
                    value={newRoomNumber}
                    onChange={(e) => setNewRoomNumber(e.target.value)}
                  >
                    <option value="101">ห้อง 101</option>
                    <option value="102">ห้อง 102</option>
                    <option value="103">ห้อง 103</option>
                    <option value="105">ห้อง 105</option>
                    <option value="201">ห้อง 201</option>
                    <option value="202">ห้อง 202</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">รอบบิล</label>
                  <input
                    type="text"
                    disabled
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-500 text-xs font-mono"
                    value={billingCycle}
                  />
                </div>
              </div>

              {/* มิเตอร์ปัจจุบัน */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-900/40 rounded-xl border border-slate-900">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">หน่วยไฟที่ใช้ (รอบนี้)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs font-mono focus:outline-none"
                    value={elecUnits}
                    onChange={(e) => setElecUnits(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">หน่วยน้ำที่ใช้ (รอบนี้)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs font-mono focus:outline-none"
                    value={waterUnits}
                    onChange={(e) => setWaterUnits(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* พรีวิวยอดเงินสรุป */}
              <div className="p-4 bg-blue-600/5 rounded-xl border border-blue-500/10 text-xs space-y-2">
                <div className="flex justify-between text-slate-400"><span>ค่าเช่าห้องพื้นฐาน:</span><span>{rentPrice.toLocaleString()} บาท</span></div>
                <div className="flex justify-between text-slate-400"><span>ค่ากระแสไฟฟ้า ({elecUnits} u. * 7.-):</span><span>{(elecUnits * elecRate).toLocaleString()} บาท</span></div>
                <div className="flex justify-between text-slate-400"><span>ค่าน้ำประปา ({waterUnits} u. * 18.-):</span><span>{(waterUnits * waterRate).toLocaleString()} บาท</span></div>
                <div className="h-px bg-slate-800 my-1" />
                <div className="flex justify-between font-bold text-slate-200"><span>ยอดเงินสุทธิรวม:</span><span className="text-blue-400">{computedTotal.toLocaleString()} บาท</span></div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
              >
                คำนวณเงินและสร้างใบแจ้งหนี้
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
