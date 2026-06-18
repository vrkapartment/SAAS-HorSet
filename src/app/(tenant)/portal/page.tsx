"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

function setCookie(name: string, value: string, days = 7) {
  if (typeof document === "undefined") return
  const date = new Date()
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
  document.cookie = `${name}=${value}; path=/; expires=${date.toUTCString()}`
}
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
  Image as ImageIcon,
  KeyRound,
  Lock,
  User,
  Check,
  AlertCircle,
  RefreshCw,
  X
} from "lucide-react"
import { generatePromptPayPayload } from "@/lib/promptpay"
import { getTenantPortalData, getTenantPortalDataNoLoginAction } from "@/features/tenant/actions"
import { updateBillStatus } from "@/features/billing/actions"
import { getCurrentUserProfileAction, updateUserProfileAction } from "@/features/auth/actions"

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
  const [promptPayName, setPromptPayName] = useState("สมเจตน์ แสนสุข")
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceAddress, setWorkspaceAddress] = useState("")
  const [workspacePhone, setWorkspacePhone] = useState("")
  const [workspaceTaxId, setWorkspaceTaxId] = useState("")
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [history, setHistory] = useState<BillHistoryItem[]>([])
  const [baseRent, setBaseRent] = useState(4500)

  // สถานะแก้ไขข้อมูลโปรไฟล์และเปลี่ยนรหัสผ่าน
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileName, setProfileName] = useState("")
  const [profilePhone, setProfilePhone] = useState("")
  const [profilePassword, setProfilePassword] = useState("")
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("")
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

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
    let wsId = ""
    let rNum = ""
    
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search)
      wsId = searchParams.get("workspace_id") || ""
      rNum = searchParams.get("room_number") || ""
    }

    let res
    if (wsId && rNum) {
      res = await getTenantPortalDataNoLoginAction(wsId, rNum)
    } else {
      res = await getTenantPortalData()
    }

    if (res.success && res.data) {
      setIsDemo(false)
      const data = res.data
      setRoomNumber(data.roomNumber || "ไม่มีห้อง")
      setTenantName(data.tenantName)
      setBaseRent(data.baseRent)
      if (data.promptPayId) {
        setPromptPayId(data.promptPayId)
      }
      if (data.promptPayName) {
        setPromptPayName(data.promptPayName)
      }
      if (data.workspaceName) {
        setWorkspaceName(data.workspaceName)
      }
      if (data.workspaceAddress) {
        setWorkspaceAddress(data.workspaceAddress)
      }
      if (data.workspacePhone) {
        setWorkspacePhone(data.workspacePhone)
      }
      if (data.workspaceTaxId) {
        setWorkspaceTaxId(data.workspaceTaxId)
      }

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
    } else if ((res as any).fallback) {
      setIsDemo(true)
      setRoomNumber("105")
      setTenantName("คุณณัฐพล ใจดี")
      setBillingCycle("มิถุนายน 2026")
      setBaseRent(4500)

      const loadMyBill = () => {
        const savedBills = getCookie("horset_bills")
        if (savedBills) {
          try {
            const bills = JSON.parse(decodeURIComponent(savedBills))
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

  // โหลดข้อมูลโปรไฟล์จริง (หรือโปรไฟล์จำลองสำหรับเดโม)
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!isDemo) {
        try {
          const res = await getCurrentUserProfileAction()
          if (res.success && res.data) {
            setProfileName(res.data.full_name || "")
            setProfilePhone(res.data.phone || "")
          }
        } catch (err) {
          console.error("Error loading user profile:", err)
        }
      } else {
        const savedName = getCookie("horset_demo_tenant_profile_name")
        const savedPhone = getCookie("horset_demo_tenant_profile_phone")
        
        setProfileName(savedName || "คุณณัฐพล ใจดี")
        setProfilePhone(savedPhone || "089-999-9999")
      }
    }
    loadUserProfile()
  }, [isDemo])

  // จัดการบันทึกโปรไฟล์ & รหัสผ่านใหม่ สำหรับผู้เช่า
  const handleUpdateProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileError(null)
    setProfileSuccess(null)

    if (profilePassword && profilePassword.length < 6) {
      setProfileError("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร")
      return
    }

    if (profilePassword !== profileConfirmPassword) {
      setProfileError("รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน")
      return
    }

    setProfileLoading(true)

    if (!isDemo) {
      try {
        const res = await updateUserProfileAction({
          fullName: profileName,
          phone: profilePhone,
          password: profilePassword || undefined
        })

        if (res.success) {
          setTenantName(profileName)
          setProfileSuccess("✓ บันทึกข้อมูลโปรไฟล์และเปลี่ยนรหัสผ่านสำเร็จ!")
          setProfilePassword("")
          setProfileConfirmPassword("")
          setTimeout(() => {
            setShowProfileModal(false)
            setProfileSuccess(null)
          }, 1500)
        } else {
          setProfileError(res.error || "เกิดข้อผิดพลาดในการอัปเดตข้อมูล")
        }
      } catch (err) {
        setProfileError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์")
      } finally {
        setProfileLoading(false)
      }
    } else {
      // โหมดเดโม
      setTimeout(() => {
        setCookie("horset_demo_tenant_profile_name", profileName)
        setCookie("horset_demo_tenant_profile_phone", profilePhone)
        setTenantName(profileName)
        setProfileSuccess("✓ [Demo Mode] อัปเดตข้อมูลและรหัสผ่านจำลองสำเร็จแล้ว!")
        setProfilePassword("")
        setProfileConfirmPassword("")
        setProfileLoading(false)
        setTimeout(() => {
          setShowProfileModal(false)
          setProfileSuccess(null)
        }, 1500)
      }, 1000)
    }
  }

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
        workspaceName,
        workspaceAddress,
        workspacePhone,
        workspaceTaxId
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

        const savedBills = getCookie("horset_bills")
        if (savedBills) {
          try {
            const bills = JSON.parse(decodeURIComponent(savedBills))
            const updatedBills = bills.map((b: any) => {
              if (b.roomNumber === "105" && b.billingCycle === "2026-06") {
                return { ...b, status: "pending", slipUrl: mockSlipUrl }
              }
              return b
            })
            setCookie("horset_bills", encodeURIComponent(JSON.stringify(updatedBills)))
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
            <p className="text-[9px] text-slate-400">{tenantName} • ผู้เช่า</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* ปุ่มแก้ไขรหัสผ่านและโปรไฟล์ */}
          <button
            onClick={() => {
              setProfileError(null)
              setProfileSuccess(null)
              setShowProfileModal(true)
            }}
            className="p-2 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-900/50 transition-colors"
            title="ตั้งค่าโปรไฟล์ & รหัสผ่าน"
          >
            <KeyRound className="w-4 h-4" />
          </button>

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
        </div>
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
                    const savedBills = getCookie("horset_bills")
                    if (savedBills) {
                      try {
                        const bills = JSON.parse(decodeURIComponent(savedBills))
                        const updatedBills = bills.map((b: any) => {
                          if (b.roomNumber === "105" && b.billingCycle === "2026-06") {
                            return { ...b, status: "unpaid", slipUrl: null }
                          }
                          return b
                        })
                        setCookie("horset_bills", encodeURIComponent(JSON.stringify(updatedBills)))
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

        {/* ตั้งค่าข้อมูลส่วนตัวและรหัสผ่าน */}
        <div className="glass-panel rounded-2xl border border-slate-900/60 p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-400" /> ตั้งค่ารหัสผ่าน & โปรไฟล์
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            คุณสามารถแก้ไขข้อมูลชื่อ-นามสกุล, เบอร์โทรศัพท์สำหรับติดต่อ และเปลี่ยนรหัสผ่านเพื่อความปลอดภัยในการเข้าใช้งานพอร์ทัลได้ที่นี่
          </p>
          <button
            onClick={() => {
              setProfileError(null)
              setProfileSuccess(null)
              setShowProfileModal(true)
            }}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-xs transition-all shadow-md shadow-blue-600/10"
          >
            <KeyRound className="w-4 h-4" />
            <span>แก้ไขข้อมูลส่วนตัว & เปลี่ยนรหัสผ่าน</span>
          </button>
        </div>

      </main>

      {/* ========================================== */}
      {/* POP-UP MODAL สำหรับแก้ไขโปรไฟล์และเปลี่ยนรหัสผ่าน ของผู้เช่า */}
      {/* ========================================== */}
      {/* ========================================== */}
      {/* POP-UP MODAL สำหรับแก้ไขโปรไฟล์และเปลี่ยนรหัสผ่าน ของผู้เช่า */}
      {/* ========================================== */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop ล้ำสมัย ละมุนหรูหรา */}
          <div 
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-md transition-all duration-300" 
            onClick={() => !profileLoading && setShowProfileModal(false)} 
          />
          
          <div className="relative glass-panel w-full max-w-md p-8 rounded-3xl border border-blue-500/20 shadow-2xl shadow-blue-500/5 animate-scale-up transition-colors duration-300">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-teal-500 rounded-t-3xl animate-gradient-flow" />
            
            {/* Close button */}
            <button
              disabled={profileLoading}
              onClick={() => setShowProfileModal(false)}
              className="absolute top-5 right-5 p-2 rounded-full transition-all duration-200 disabled:opacity-50 hover:scale-105 active:scale-95 cursor-pointer text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col space-y-6">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/25 text-blue-400 shadow-inner">
                  <User className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight text-white">
                    ตั้งค่าโปรไฟล์ & รหัสผ่าน
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">แก้ไขข้อมูลผู้เช่าและรหัสผ่านเพื่อความปลอดภัยของบัญชี</p>
                </div>
              </div>

              {profileError && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-xs text-red-400 animate-pulse shadow-sm">
                  <AlertCircle className="w-4.5 h-4.5 shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}

              {profileSuccess && (
                <div className="p-3.5 bg-teal-500/10 border border-teal-500/20 rounded-xl flex items-center gap-3 text-xs text-teal-400 font-bold shadow-sm">
                  <Check className="w-4.5 h-4.5 shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfileSubmit} className="space-y-4">
                {/* Full name input */}
                <div className="group relative flex flex-col space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 group-focus-within:text-blue-400 transition-colors">
                    ชื่อ-นามสกุลผู้เช่า
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      disabled={profileLoading}
                      placeholder="กรอกชื่อ-นามสกุลจริง"
                      className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 rounded-xl text-xs text-slate-100 outline-none transition-all disabled:opacity-50 font-semibold placeholder-slate-650"
                    />
                  </div>
                </div>

                {/* Phone number input */}
                <div className="group relative flex flex-col space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 group-focus-within:text-blue-400 transition-colors">
                    เบอร์โทรศัพท์
                  </label>
                  <div className="relative">
                    <AlertCircle className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <input
                      type="tel"
                      required
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      disabled={profileLoading}
                      placeholder="กรอกเบอร์โทรศัพท์มือถือ"
                      className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 rounded-xl text-xs text-slate-100 outline-none transition-all disabled:opacity-50 font-semibold placeholder-slate-650"
                    />
                  </div>
                </div>

                {/* Beautiful fading gradient divider */}
                <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800 to-transparent my-6" />

                {/* Interactive Premium Suggestion Card */}
                <div className="space-y-1.5 p-4 rounded-r-2xl border-l-4 border-blue-500/50 bg-blue-500/5 text-blue-400 transition-all duration-300 mb-2 shadow-sm shadow-blue-950/10">
                  <p className="text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wide">
                    <KeyRound className="w-3.5 h-3.5" /> แนะนำการเปลี่ยนรหัสผ่าน
                  </p>
                  <p className="text-[10px] leading-relaxed font-medium text-slate-400">
                    กรอกข้อมูลด้านล่างเฉพาะเมื่อต้องการแก้ไขรหัสผ่านใหม่เท่านั้น หากไม่ต้องการแก้ไข ให้ปล่อยว่างช่องรหัสผ่านไว้ได้เลยครับ
                  </p>
                </div>

                {/* New password input */}
                <div className="group relative flex flex-col space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 group-focus-within:text-blue-400 transition-colors">
                    รหัสผ่านใหม่ (ระบุอย่างน้อย 6 ตัวอักษร)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <input
                      type="password"
                      value={profilePassword}
                      onChange={(e) => setProfilePassword(e.target.value)}
                      disabled={profileLoading}
                      placeholder="ป้อนรหัสผ่านใหม่ หากต้องการเปลี่ยน"
                      className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 rounded-xl text-xs text-slate-100 outline-none transition-all disabled:opacity-50 font-semibold placeholder-slate-650"
                    />
                  </div>
                </div>

                {/* Confirm new password input */}
                <div className="group relative flex flex-col space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 group-focus-within:text-blue-400 transition-colors">
                    ยืนยันรหัสผ่านใหม่
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <input
                      type="password"
                      value={profileConfirmPassword}
                      onChange={(e) => setProfileConfirmPassword(e.target.value)}
                      disabled={profileLoading}
                      placeholder="ป้อนรหัสผ่านใหม่อีกครั้งเพื่อยืนยัน"
                      className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 rounded-xl text-xs text-slate-100 outline-none transition-all disabled:opacity-50 font-semibold placeholder-slate-650"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5 w-full pt-5">
                  <button
                    type="button"
                    disabled={profileLoading}
                    onClick={() => setShowProfileModal(false)}
                    className="py-3 px-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-extrabold rounded-xl text-xs transition-all duration-250 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={profileLoading}
                    className="py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black rounded-xl text-xs shadow-[0_6px_20px_rgba(37,99,235,0.22)] hover:shadow-[0_8px_25px_rgba(37,99,235,0.42)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {profileLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>กำลังบันทึก...</span>
                      </>
                    ) : (
                      <span>บันทึกข้อมูล</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
