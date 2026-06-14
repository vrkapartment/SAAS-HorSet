"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Building,
  Calendar,
  Zap,
  Droplet,
  Download,
  Upload,
  CheckCircle2,
  Clock,
  LogOut,
  History,
  QrCode,
  Image as ImageIcon
} from "lucide-react"
import { generatePromptPayPayload } from "@/lib/promptpay"
import { getTenantPortalData } from "@/features/tenant/actions"
import { updateBillStatus } from "@/features/billing/actions"

interface BillHistoryItem {
  cycle: string
  amount: number
  status: "paid" | "unpaid"
}

export default function TenantPortal() {
  const router = useRouter()
  
  const [isDemo, setIsDemo] = useState(false)
  const [roomNumber, setRoomNumber] = useState("")
  const [tenantName, setTenantName] = useState("")
  const [billingCycle, setBillingCycle] = useState("")
  
  const [bill, setBill] = useState<any>(null)
  const [billStatus, setBillStatus] = useState<"unpaid" | "pending" | "paid">("unpaid")
  const [uploadedSlip, setUploadedSlip] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [promptPayId, setPromptPayId] = useState("0899999999")
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [history, setHistory] = useState<BillHistoryItem[]>([])
  const [baseRent, setBaseRent] = useState(4500)

  const formatCycle = (cycleStr: string) => {
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

  const loadPortalData = async () => {
    const res = await getTenantPortalData()
    
    // Save promptpay configs
    const savedPPId = localStorage.getItem("horset_promptpay_id")
    if (savedPPId) {
      setPromptPayId(savedPPId)
    }

    if (res.success && res.data) {
      setIsDemo(false)
      const data = res.data
      setRoomNumber(data.roomNumber || "ไม่มีห้อง")
      setTenantName(data.tenantName)
      setBaseRent(data.baseRent)

      const activeBills = data.bills as any[]
      if (activeBills && activeBills.length > 0) {
        // Latest bill is current bill
        const latest = activeBills[0]
        setBill(latest)
        setBillStatus(latest.status)
        setUploadedSlip(latest.slipUrl)
        setBillingCycle(formatCycle(latest.billingCycle))

        // Rest are history
        const hist: BillHistoryItem[] = activeBills.slice(1).map(b => ({
          cycle: formatCycle(b.billingCycle),
          amount: b.amount,
          status: b.status === "paid" ? "paid" : "unpaid"
        }))
        setHistory(hist)
      } else {
        setBill(null)
        setBillStatus("paid") // default to clean state if no bills
        setUploadedSlip(null)
        setBillingCycle("ยังไม่มีรอบบิล")
        setHistory([])
      }
    } else if (res.fallback) {
      setIsDemo(true)
      setRoomNumber("105")
      setTenantName("คุณณัฐพล ใจดี")
      setBillingCycle("มิถุนายน 2026")
      setBaseRent(4500)

      const loadMyBill = () => {
        const savedBills = localStorage.getItem("horset_bills")
        if (savedBills) {
          try {
            const bills = JSON.parse(savedBills)
            const myBill = bills.find((b: any) => b.roomNumber === "105" && b.billingCycle === "2026-06")
            if (myBill) {
              setBill(myBill)
              setBillStatus(myBill.status)
              setUploadedSlip(myBill.slipUrl)
            }
          } catch (e) {
            console.error(e)
          }
        }
      }
      loadMyBill()

      const demoHistory: BillHistoryItem[] = [
        { cycle: "พฤษภาคม 2026", amount: 5120, status: "paid" },
        { cycle: "เมษายน 2026", amount: 4950, status: "paid" },
        { cycle: "มีนาคม 2026", amount: 5310, status: "paid" }
      ]
      setHistory(demoHistory)
    }
  }

  useEffect(() => {
    loadPortalData()
    // Poll updates every 5s if logged in to auto-reflect approval
    const timer = setInterval(loadPortalData, 5000)
    return () => clearInterval(timer)
  }, [])

  // ค่าใช้จ่ายต่างๆ (ใช้ค่าของบิลจริง หรือค่าจำลองหากยังไม่มีบิลในระบบ)
  const rentPrice = bill ? (bill.amount - (bill.electricUnits * 7) - (bill.waterUnits * 18)) : baseRent
  const elecUnits = bill ? bill.electricUnits : 0
  const elecAmount = elecUnits * 7
  const waterUnits = bill ? bill.waterUnits : 0
  const waterAmount = waterUnits * 18
  const totalAmount = bill ? bill.amount : rentPrice

  const handleDownloadBillPdf = async () => {
    setDownloadingPdf(true)
    try {
      const { generateBillPdf } = await import("@/lib/pdfHelper")
      const promptPayName = localStorage.getItem("horset_promptpay_name") || "สมเจตน์ แสนสุข"
      
      const blob = await generateBillPdf({
        roomNumber,
        tenantName,
        billingCycle,
        baseRent: rentPrice,
        electricUnits: elecUnits,
        electricRate: 7,
        waterUnits: waterUnits,
        waterRate: 18,
        amount: totalAmount,
        promptPayId,
        promptPayName,
      })

      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `bill_room${roomNumber}_${bill ? bill.billingCycle : "invoice"}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      console.error(e)
      alert("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF ใบแจ้งหนี้")
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleUploadSlip = async () => {
    setUploading(true)
    const mockSlipUrl = "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=300"
    
    if (isDemo) {
      setTimeout(() => {
        setUploading(false)
        setUploadedSlip(mockSlipUrl)
        setBillStatus("pending")

        const savedBills = localStorage.getItem("horset_bills")
        if (savedBills) {
          try {
            const bills = JSON.parse(savedBills)
            const updatedBills = bills.map((b: any) => {
              if (b.roomNumber === "105" && b.billingCycle === "2026-06") {
                return { ...b, status: "pending", slipUrl: mockSlipUrl }
              }
              return b
            })
            localStorage.setItem("horset_bills", JSON.stringify(updatedBills))
          } catch (e) {
            console.error(e)
          }
        }
        alert("อัปโหลดสลิปของคุณเรียบร้อยแล้ว! ระบบกำลังส่งข้อมูลไปยังผู้ดูแลเพื่อตรวจสอบและปรับสถานะบิลของคุณ")
      }, 1500)
    } else {
      if (!bill) {
        setUploading(false)
        alert("ไม่พบบิลของท่านในเดือนนี้")
        return
      }
      
      const res = await updateBillStatus(bill.id, "pending", mockSlipUrl)
      setUploading(false)
      if (res.success) {
        setUploadedSlip(mockSlipUrl)
        setBillStatus("pending")
        alert("อัปโหลดสลิปของคุณเรียบร้อยแล้ว! ระบบกำลังส่งข้อมูลไปยังผู้ดูแลเพื่อตรวจสอบและปรับสถานะบิลของคุณ")
        loadPortalData()
      } else {
        alert(res.error || "เกิดข้อผิดพลาดในการส่งสลิป")
      }
    }
  }


  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 font-sans pb-12">
      {/* Header สไตล์ Mobile Portal */}
      <header className="glass-panel border-b border-slate-900/60 px-6 py-4 sticky top-0 z-20 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Building className="w-5 h-5 text-blue-500" />
          <div>
            <h1 className="text-sm font-bold">ห้องพัก {roomNumber}</h1>
            <p className="text-[9px] text-slate-400">แสนสุข แมนชั่น • ผู้เช่า</p>
          </div>
        </div>
        <button
          onClick={() => {
            document.cookie = "horset_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
            router.push("/login")
          }}
          className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-900/50"
          title="ออกจากระบบ"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* กล่องเนื้อหาแบบโมบาย (Mobile Layout Wrapper) */}
      <main className="max-w-md mx-auto px-4 pt-6 space-y-6">
        
        {/* บิลหลักประจำเดือน */}
        <div className="glass-panel rounded-2xl border border-slate-900/60 p-6 space-y-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/5 rounded-full blur-xl pointer-events-none" />
          
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase">ใบแจ้งหนี้รอบประจำเดือน</span>
              <h2 className="text-lg font-bold text-slate-200 mt-0.5">{billingCycle}</h2>
            </div>
            
            <span className={`inline-block text-[10px] font-bold px-3 py-1 rounded-full ${
              billStatus === "paid" ? "bg-teal-500/10 text-teal-400" :
              billStatus === "pending" ? "bg-amber-500/10 text-amber-400 animate-pulse" :
              "bg-red-500/10 text-red-400"
            }`}>
              {billStatus === "paid" ? "ชำระเงินแล้ว" : billStatus === "pending" ? "รอยืนยันสลิป" : "ค้างชำระ"}
            </span>
          </div>

          {/* รายละเอียดค่าใช้จ่าย */}
          <div className="space-y-3 pt-2 text-xs">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-900">
              <span className="text-slate-400">ค่าเช่าห้องพักปกติ</span>
              <span className="font-semibold text-slate-200">{rentPrice.toLocaleString()} บาท</span>
            </div>

            {/* ค่าไฟ */}
            <div className="flex justify-between items-start pb-2.5 border-b border-slate-900">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Zap className="w-3.5 h-3.5 text-blue-400" />
                  <span>ค่ากระแสไฟฟ้า</span>
                </div>
                <p className="text-[10px] text-slate-500 pl-5">ปริมาณไฟสะสมที่ใช้: {elecUnits} หน่วย</p>
              </div>
              <span className="font-semibold text-slate-200">{elecAmount.toLocaleString()} บาท</span>
            </div>

            {/* ค่าน้ำ */}
            <div className="flex justify-between items-start pb-2.5 border-b border-slate-900">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Droplet className="w-3.5 h-3.5 text-teal-400" />
                  <span>ค่าน้ำประปา</span>
                </div>
                <p className="text-[10px] text-slate-500 pl-5">ปริมาณน้ำสะสมที่ใช้: {waterUnits} หน่วย</p>
              </div>
              <span className="font-semibold text-slate-200">{waterAmount.toLocaleString()} บาท</span>
            </div>

            {/* ยอดเงินรวมสุทธิ */}
            <div className="flex justify-between items-center pt-2">
              <span className="font-bold text-slate-300">ยอดชำระเงินสุทธิ</span>
              <span className="text-lg font-bold text-blue-400">{totalAmount.toLocaleString()} บาท</span>
            </div>

            {/* ปุ่มดาวน์โหลดบิล PDF */}
            <button
              onClick={handleDownloadBillPdf}
              disabled={downloadingPdf}
              className="w-full mt-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:border-slate-800 disabled:text-slate-600 text-slate-300 font-semibold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors"
            >
              {downloadingPdf ? (
                <div className="w-4 h-4 border-2 border-slate-500 border-t-slate-300 rounded-full animate-spin" />
              ) : (
                <>
                  <Download className="w-4 h-4 text-blue-400" />
                  <span>ดาวน์โหลดใบแจ้งหนี้แบบ PDF</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* หน้าจอโอนเงินสแกน QR พร้อมเพย์ (แสดงเฉพาะเมื่อยังไม่จ่าย หรือรอยืนยัน) */}
        {billStatus !== "paid" && (
          <div className="glass-card rounded-2xl border border-slate-900/60 p-6 space-y-5">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-400" /> สแกนจ่ายด้วยพร้อมเพย์ QR
            </h3>

            {/* ดีไซน์การ์ด พร้อมเพย์สไตล์หรูหรา */}
            <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-xl flex flex-col items-center gap-4 relative overflow-hidden">
              <div className="absolute top-2 left-2 flex items-center gap-1 text-[9px] text-slate-500 font-bold">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                PromptPay EMVCo
              </div>
              
              {/* รูป QR code ที่สามารถสแกนได้จริง */}
              <div className="w-44 h-44 bg-white p-2 rounded-lg flex flex-col justify-center items-center relative shadow-lg">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(generatePromptPayPayload(promptPayId, totalAmount))}&size=200x200`}
                  alt="PromptPay QR Code"
                  className="w-40 h-40 object-contain"
                />
              </div>

              <div className="text-center space-y-1">
                <p className="text-[10px] text-slate-400">
                  บัญชีพร้อมเพย์หอพัก: <span className="font-bold text-slate-200">
                    {promptPayId.length === 10
                      ? promptPayId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
                      : promptPayId.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, "$1-$2-$3-$4-$5")}
                  </span>
                </p>
                <p className="text-sm font-bold text-slate-200">ยอดชำระ: {totalAmount.toLocaleString()} บาท</p>
                <p className="text-[9px] text-slate-500 font-medium">(มีจำนวนระบุยอดโอนให้อัตโนมัติ ไม่ต้องกรอกราคาเอง)</p>
              </div>

              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(generatePromptPayPayload(promptPayId, totalAmount))}&size=500x500`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> บันทึกรูปภาพ QR ขนาดใหญ่
              </a>
            </div>

            {/* ฟอร์มอัปโหลดส่งสลิป */}
            {billStatus === "unpaid" ? (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-400">อัปโหลดภาพใบสลิปโอนเงิน</h4>
                
                <button
                  onClick={handleUploadSlip}
                  disabled={uploading}
                  className="w-full py-6 bg-slate-900/40 border border-dashed border-slate-800 hover:border-blue-500 rounded-xl flex flex-col items-center justify-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-all"
                >
                  {uploading ? (
                    <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-blue-400" />
                      <span>กดเลือกไฟล์สลิป หรือลากไฟล์มาวางที่นี่</span>
                      <span className="text-[9px] text-slate-600">(จำลองการทดสอบ: กดปุ่มเพื่อแนบสลิปทดลอง)</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3 text-xs text-amber-400">
                <Clock className="w-5 h-5 shrink-0 animate-spin" />
                <div className="space-y-0.5">
                  <p className="font-bold">สลิปของคุณอยู่ระหว่างการตรวจสอบ</p>
                  <p className="text-[10px] text-slate-400">เจ้าหน้าที่หอพักจะทำการยืนยันยอดเงินและปรับสถานะบิลให้เร็วที่สุดครับ</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* กรณีจ่ายบิลสำเร็จแล้ว */}
        {billStatus === "paid" && (
          <div className="glass-card rounded-2xl border border-slate-900/60 p-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-teal-400 mx-auto animate-bounce" />
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-100">ยอดชำระของคุณเสร็จเรียบร้อย!</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                ขอบคุณสำหรับการชำระเงินรอบเดือนนี้อย่างตรงเวลา ทางแสนสุขแมนชั่นได้รับเงินโอนและบันทึกสิทธิ์เรียบร้อยแล้ว
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={async () => {
                  if (isDemo) {
                    setBillStatus("unpaid")
                    setUploadedSlip(null)
                    const savedBills = localStorage.getItem("horset_bills")
                    if (savedBills) {
                      try {
                        const bills = JSON.parse(savedBills)
                        const updatedBills = bills.map((b: any) => {
                          if (b.roomNumber === "105" && b.billingCycle === "2026-06") {
                            return { ...b, status: "unpaid", slipUrl: null }
                          }
                          return b
                        })
                        localStorage.setItem("horset_bills", JSON.stringify(updatedBills))
                      } catch (e) {
                        console.error(e)
                      }
                    }
                  } else {
                    if (!bill) return
                    const res = await updateBillStatus(bill.id, "unpaid", null)
                    if (res.success) {
                      setBillStatus("unpaid")
                      setUploadedSlip(null)
                      loadPortalData()
                    }
                  }
                }}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline"
              >
                (คลิกทดสอบ: สลับกลับไปเป็นยังไม่ได้ชำระอีกครั้ง)
              </button>
            </div>
          </div>
        )}

        {/* ประวัติการรับบิลย้อนหลัง */}
        <div className="glass-card rounded-2xl border border-slate-900/60 p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" /> ประวัติการรับบิลย้อนหลัง
          </h3>

          <div className="space-y-3 text-xs">
            {history.map((h, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-slate-900/40 border border-slate-900/80 rounded-xl">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span className="font-medium text-slate-300">{h.cycle}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-300">{h.amount.toLocaleString()} บาท</span>
                  <span className="inline-block text-[8px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400">
                    ชำระแล้ว
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}
