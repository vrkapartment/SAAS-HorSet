"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
import { Landmark, Save, ShieldCheck, Check, CreditCard, User } from "lucide-react"

export default function FinanceSettingsPage() {
  const [firstName, setFirstName] = useState("สมเจตน์")
  const [lastName, setLastName] = useState("แสนสุข")
  const [taxId, setTaxId] = useState("1100100222333")
  const [address, setAddress] = useState("123/45 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310")
  const [phone, setPhone] = useState("089-999-9999")

  const [promptPayType, setPromptPayType] = useState<"phone" | "national_id">("phone")
  const [promptPayId, setPromptPayId] = useState("0899999999")
  const [promptPayName, setPromptPayName] = useState("สมเจตน์ แสนสุข")

  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // โหลดค่าเริ่มต้นจาก localStorage ถ้ามี
  useEffect(() => {
    const savedFirstName = localStorage.getItem("horset_tax_firstname")
    const savedLastName = localStorage.getItem("horset_tax_lastname")
    const savedTaxId = localStorage.getItem("horset_tax_id")
    const savedAddress = localStorage.getItem("horset_tax_address")
    const savedPhone = localStorage.getItem("horset_tax_phone")
    const savedPPType = localStorage.getItem("horset_promptpay_type") as "phone" | "national_id" | null
    const savedPPId = localStorage.getItem("horset_promptpay_id")
    const savedPPName = localStorage.getItem("horset_promptpay_name")

    if (savedFirstName) setFirstName(savedFirstName)
    if (savedLastName) setLastName(savedLastName)
    if (savedTaxId) setTaxId(savedTaxId)
    if (savedAddress) setAddress(savedAddress)
    if (savedPhone) setPhone(savedPhone)
    if (savedPPType) setPromptPayType(savedPPType)
    if (savedPPId) setPromptPayId(savedPPId)
    if (savedPPName) setPromptPayName(savedPPName)
  }, [])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()

    // ทำความสะอาดและตรวจสอบข้อมูลพร้อมเพย์เบื้องต้น
    const cleanedPPId = promptPayId.replace(/[^0-9]/g, "")
    if (promptPayType === "phone" && cleanedPPId.length !== 10) {
      alert("กรุณากรอกเบอร์มือถือพร้อมเพย์ให้ครบ 10 หลัก (เช่น 0899999999)")
      return
    }
    if (promptPayType === "national_id" && cleanedPPId.length !== 13) {
      alert("กรุณากรอกเลขบัตรประชาชนพร้อมเพย์ให้ครบ 13 หลัก (เช่น 1100100222333)")
      return
    }

    if (taxId.replace(/[^0-9]/g, "").length !== 13) {
      alert("กรุณากรอกเลขประจำตัวผู้เสียภาษีอากรให้ครบ 13 หลัก")
      return
    }

    // บันทึกค่าลง localStorage
    localStorage.setItem("horset_tax_firstname", firstName)
    localStorage.setItem("horset_tax_lastname", lastName)
    localStorage.setItem("horset_tax_id", taxId)
    localStorage.setItem("horset_tax_address", address)
    localStorage.setItem("horset_tax_phone", phone)
    localStorage.setItem("horset_promptpay_type", promptPayType)
    localStorage.setItem("horset_promptpay_id", cleanedPPId)
    localStorage.setItem("horset_promptpay_name", promptPayName)

    showToast("บันทึกการตั้งค่าการเงินและพร้อมเพย์เรียบร้อยแล้ว!")
  }

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  return (
    <DashboardLayout role="admin">
      {/* Toast แจ้งเตือน */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 glass-panel border border-teal-500/30 text-teal-400 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up text-xs font-semibold">
          <Check className="w-4 h-4 text-teal-400" /> {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-100 font-sans">ตั้งค่าการเงินและบัญชีรับเงิน</h2>
          <p className="text-xs text-slate-400 mt-1">
            ระบุข้อมูลผู้เสียภาษีและพร้อมเพย์เพื่อสร้างบิลสแกนจ่ายจริงและออกใบยื่นแบบภาษี ภ.ง.ด.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ข้อมูลผู้เสียภาษี */}
        <div className="glass-card rounded-2xl border border-slate-900/60 p-6 space-y-6">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-900 pb-3">
            <User className="w-4 h-4 text-blue-400" /> ข้อมูลผู้ยื่นเสียภาษีเงินได้บุคคลธรรมดา
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">ชื่อจริง</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">นามสกุล</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">เลขประจำตัวผู้เสียภาษีอากร / เลขบัตรประชาชน (13 หลัก)</label>
            <input
              type="text"
              required
              maxLength={13}
              placeholder="1100100222333"
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 font-mono text-sm tracking-wide"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">เบอร์โทรศัพท์ติดต่อ</label>
              <input
                type="text"
                required
                placeholder="089-999-9999"
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">ที่อยู่ตามทะเบียนบ้าน</label>
            <textarea
              rows={3}
              required
              className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm leading-relaxed"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        </div>

        {/* ข้อมูลพร้อมเพย์ (บัญชีรับเงิน) */}
        <div className="flex flex-col gap-6">
          <div className="glass-card rounded-2xl border border-slate-900/60 p-6 space-y-6 flex-1">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-900 pb-3">
              <CreditCard className="w-4 h-4 text-teal-400" /> ตั้งค่าระบบรับเงินพร้อมเพย์ (PromptPay QR)
            </h3>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium block">ประเภทพร้อมเพย์</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPromptPayType("phone")
                    if (promptPayId === "1100100222333") setPromptPayId("0899999999")
                  }}
                  className={`py-2.5 px-4 text-xs font-semibold rounded-xl transition-all border ${
                    promptPayType === "phone"
                      ? "bg-teal-600/10 border-teal-500 text-teal-400"
                      : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  เบอร์โทรศัพท์มือถือ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPromptPayType("national_id")
                    if (promptPayId === "0899999999") setPromptPayId("1100100222333")
                  }}
                  className={`py-2.5 px-4 text-xs font-semibold rounded-xl transition-all border ${
                    promptPayType === "national_id"
                      ? "bg-teal-600/10 border-teal-500 text-teal-400"
                      : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  เลขบัตรประชาชน (13 หลัก)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">
                {promptPayType === "phone" ? "หมายเลขโทรศัพท์พร้อมเพย์ (10 หลัก)" : "เลขประจำตัวบัตรประชาชนพร้อมเพย์ (13 หลัก)"}
              </label>
              <input
                type="text"
                required
                placeholder={promptPayType === "phone" ? "0899999999" : "1100100222333"}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-200 font-mono text-sm tracking-wide"
                value={promptPayId}
                onChange={(e) => setPromptPayId(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">ชื่อบัญชีรับเงินพร้อมเพย์ (ภาษาไทย/อังกฤษ)</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-200 text-sm"
                value={promptPayName}
                onChange={(e) => setPromptPayName(e.target.value)}
              />
            </div>

            <div className="p-4 bg-teal-500/5 border border-teal-500/10 rounded-xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
              <div className="text-[10px] text-slate-400 leading-relaxed">
                <span className="font-bold text-slate-300">สแกนจ่ายได้จริง:</span> ข้อมูลนี้จะนำไปประกอบการสร้าง QR Code ด้วยรูปแบบมาตรฐาน EMVCo ของประเทศไทยโดยตรง เพื่อให้ผู้เช่าสามารถนำโทรศัพท์ไปสแกนและชำระค่าเช่าเข้าบัญชีคุณได้ทันทีในยอดสุทธิที่ถูกต้อง
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full glow-btn bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/15"
          >
            <Save className="w-4 h-4" /> บันทึกข้อมูลการเงินทั้งหมด
          </button>
        </div>
      </form>
    </DashboardLayout>
  )
}
