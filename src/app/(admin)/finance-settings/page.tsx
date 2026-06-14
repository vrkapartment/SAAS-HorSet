"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
import { Landmark, Save, ShieldCheck, Check, CreditCard, User, AlertTriangle, Loader2 } from "lucide-react"
import { getFinanceSettings, saveFinanceSettings, FinanceSettings } from "@/features/finance/actions"

export default function FinanceSettingsPage() {
  const [firstName, setFirstName] = useState("สมเจตน์")
  const [lastName, setLastName] = useState("แสนสุข")
  const [taxId, setTaxId] = useState("1100100222333")
  const [address, setAddress] = useState("123/45 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310")
  const [phone, setPhone] = useState("089-999-9999")

  const [promptPayType, setPromptPayType] = useState<"phone" | "national_id">("phone")
  const [promptPayId, setPromptPayId] = useState("0899999999")
  const [promptPayName, setPromptPayName] = useState("สมเจตน์ แสนสุข")
  const [commonFee, setCommonFee] = useState<number>(50)

  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [isDatabaseBacked, setIsDatabaseBacked] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // โหลดค่าเริ่มต้นจาก Database (ผูกตาม Workspace ID ปัจจุบัน) หรือ fallback ไปยัง localStorage
  useEffect(() => {
    const currentWsId = localStorage.getItem("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
    setWorkspaceId(currentWsId)

    async function loadData() {
      setLoading(true)
      try {
        const res = await getFinanceSettings(currentWsId)
        if (res.success && res.data) {
          setFirstName(res.data.tax_firstname)
          setLastName(res.data.tax_lastname)
          setTaxId(res.data.tax_id)
          setAddress(res.data.tax_address)
          setPhone(res.data.tax_phone)
          setPromptPayType(res.data.promptpay_type)
          setPromptPayId(res.data.promptpay_id)
          setPromptPayName(res.data.promptpay_name)
          setCommonFee(res.data.common_fee)
          setIsDatabaseBacked(true)
        } else {
          // หากฐานข้อมูลไม่พบคอลัมน์ (fallback Mode) หรือล้มเหลว ให้ใช้ข้อมูลเก่าจาก localStorage
          if (res.fallback) {
            setIsDatabaseBacked(false)
          }
          const savedFirstName = localStorage.getItem("horset_tax_firstname")
          const savedLastName = localStorage.getItem("horset_tax_lastname")
          const savedTaxId = localStorage.getItem("horset_tax_id")
          const savedAddress = localStorage.getItem("horset_tax_address")
          const savedPhone = localStorage.getItem("horset_tax_phone")
          const savedPPType = localStorage.getItem("horset_promptpay_type") as "phone" | "national_id" | null
          const savedPPId = localStorage.getItem("horset_promptpay_id")
          const savedPPName = localStorage.getItem("horset_promptpay_name")
          const savedCommonFee = localStorage.getItem("horset_common_fee")

          if (savedFirstName) setFirstName(savedFirstName)
          if (savedLastName) setLastName(savedLastName)
          if (savedTaxId) setTaxId(savedTaxId)
          if (savedAddress) setAddress(savedAddress)
          if (savedPhone) setPhone(savedPhone)
          if (savedPPType) setPromptPayType(savedPPType)
          if (savedPPId) setPromptPayId(savedPPId)
          if (savedPPName) setPromptPayName(savedPPName)
          if (savedCommonFee) setCommonFee(Number(savedCommonFee))
        }
      } catch (err) {
        console.error("Failed to load settings:", err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    // ล้างข้อมูลและตรวจเช็คเบื้องต้น
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

    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const payload: FinanceSettings = {
        tax_firstname: firstName,
        tax_lastname: lastName,
        tax_id: taxId,
        tax_address: address,
        tax_phone: phone,
        promptpay_type: promptPayType,
        promptpay_id: cleanedPPId,
        promptpay_name: promptPayName,
        common_fee: commonFee
      }

      // บันทึกผ่าน Server Action ไปยังฐานข้อมูล โดยสิทธิ์ Admin ของ Workspace เท่านั้น
      const res = await saveFinanceSettings(workspaceId, payload)
      if (res.success) {
        // อัปเดตฝั่ง Local Storage ด้วยเพื่อความปลอดภัยและโหลดได้ไวขึ้นในจุดอื่น
        localStorage.setItem("horset_tax_firstname", firstName)
        localStorage.setItem("horset_tax_lastname", lastName)
        localStorage.setItem("horset_tax_id", taxId)
        localStorage.setItem("horset_tax_address", address)
        localStorage.setItem("horset_tax_phone", phone)
        localStorage.setItem("horset_promptpay_type", promptPayType)
        localStorage.setItem("horset_promptpay_id", cleanedPPId)
        localStorage.setItem("horset_promptpay_name", promptPayName)
        localStorage.setItem("horset_common_fee", commonFee.toString())

        showToast(res.fallback ? "บันทึกในอุปกรณ์นี้สำเร็จเรียบร้อยแล้ว!" : "บันทึกข้อมูลเข้าสู่เซิร์ฟเวอร์ระบบคลาวด์สำเร็จเรียบร้อย!")
      } else {
        setErrorMsg(res.error || "ไม่สามารถบันทึกข้อมูลได้ กรุณาตรวจสอบสิทธิ์ผู้ใช้งาน")
      }
    } catch (err) {
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์")
    } finally {
      setIsSubmitting(false)
    }
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
          <Check className="w-4 h-4 text-teal-400 animate-pulse" /> {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h2 className="text-xl font-bold text-slate-100 font-sans">ตั้งค่าการเงินและบัญชีรับเงิน</h2>
          <p className="text-xs text-slate-400 mt-1">
            ระบุข้อมูลผู้เสียภาษีและพร้อมเพย์เพื่อสร้างบิลสแกนจ่ายจริงและออกใบยื่นแบบภาษี ภ.ง.ด. รายหอพัก
          </p>
        </div>
        
        {/* Badge แจ้งเตือนสถานะฐานข้อมูล */}
        {isDatabaseBacked ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-[10px] font-bold text-teal-400 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" /> Cloud Database Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-400 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Local Storage Fallback Mode
          </span>
        )}
      </div>

      {loading ? (
        <div className="w-full min-h-[400px] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          <p className="text-xs text-slate-400">กำลังโหลดข้อมูลการตั้งค่าการเงินของหอพักนี้...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {/* คอลัมน์ซ้าย: ข้อมูลผู้เสียภาษี */}
          <div className="glass-card rounded-2xl border border-slate-900/60 p-6 space-y-6">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-900 pb-3">
              <User className="w-4 h-4 text-blue-400" /> ข้อมูลผู้ยื่นเสียภาษีเงินได้บุคคลธรรมดา
            </h3>

            {errorMsg && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-start gap-2 animate-shake">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">ชื่อจริง</label>
                <input
                  type="text"
                  required
                  placeholder="ชื่อจริง (เช่น สมเจตน์)"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm transition-all"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">นามสกุล</label>
                <input
                  type="text"
                  placeholder="นามสกุล (เช่น แสนสุข)"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm transition-all"
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
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 font-mono text-sm tracking-wide transition-all"
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
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm transition-all"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">ที่อยู่ตามทะเบียนบ้าน (เพื่อกรอกในแบบยื่นภาษีกรมสรรพากร)</label>
              <textarea
                rows={3}
                required
                placeholder="บ้านเลขที่, ถนน, ตำบล, อำเภอ, จังหวัด, รหัสไปรษณีย์"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm leading-relaxed transition-all resize-none"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          {/* คอลัมน์ขวา: พร้อมเพย์และอัตราส่วนกลาง */}
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
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
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
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
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
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-200 font-mono text-sm tracking-wide transition-all"
                  value={promptPayId}
                  onChange={(e) => setPromptPayId(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">ชื่อบัญชีรับเงินพร้อมเพย์ (ภาษาไทย/อังกฤษ)</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น นายสมเจตน์ แสนสุข"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-200 text-sm transition-all"
                  value={promptPayName}
                  onChange={(e) => setPromptPayName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 border-t border-slate-900/60 pt-4 mt-4">
                <label className="text-xs text-slate-300 font-bold block">ค่าบริการส่วนกลางรายเดือน (บาท / ห้อง)</label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min={0}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-200 font-mono text-sm tracking-wide transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={commonFee}
                    onChange={(e) => setCommonFee(Number(e.target.value))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">บาท</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  ค่าส่วนกลางคงที่รายเดือน สำหรับนำไปบวกเพิ่มในใบแจ้งหนี้ทุกห้องพักอัตโนมัติ
                </p>
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
              disabled={isSubmitting}
              className="w-full glow-btn bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/15 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                  กำลังบันทึกข้อมูลเข้าฐานข้อมูล...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> บันทึกข้อมูลการเงินทั้งหมด
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </DashboardLayout>
  )
}
