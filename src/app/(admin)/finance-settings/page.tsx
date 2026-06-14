"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
import { Landmark, Save, ShieldCheck, Check, CreditCard, User, AlertTriangle, Loader2, Droplet, Zap, Building, Sliders } from "lucide-react"
import { getFinanceSettings, saveFinanceSettings, FinanceSettings } from "@/features/finance/actions"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { createClient } from "@/lib/supabase/client"

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
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:"
  document.cookie = `${name}=${value}; path=/; expires=${date.toUTCString()}${isSecure ? "; Secure" : ""}; SameSite=Lax`
}

export default function FinanceSettingsPage() {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [taxId, setTaxId] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")

  const [promptPayType, setPromptPayType] = useState<"phone" | "national_id">("phone")
  const [promptPayId, setPromptPayId] = useState("")
  const [promptPayName, setPromptPayName] = useState("")
  const [commonFee, setCommonFee] = useState<number>(50)

  // สำหรับราคาหน่วย ค่าน้ำ ค่าไฟ และขั้นต่ำ
  const [waterRate, setWaterRate] = useState<number>(18)
  const [electricRate, setElectricRate] = useState<number>(7)
  const [waterMinChecked, setWaterMinChecked] = useState<boolean>(true)
  const [waterMinUnit, setWaterMinUnit] = useState<number>(3)
  const [electricMinChecked, setElectricMinChecked] = useState<boolean>(true)
  const [electricMinUnit, setElectricMinUnit] = useState<number>(10)

  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [isDatabaseBacked, setIsDatabaseBacked] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // โหลดค่าเริ่มต้นจาก Database (ผูกตาม Workspace ID ปัจจุบัน)
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setErrorMsg(null)
      try {
        const userRes = await getCurrentUserProfileAction()
        
        let currentWsId: string | undefined = undefined
        
        if (userRes.success && userRes.data) {
          const isSuperAdmin = userRes.data.role === "super_admin"
          
          if (!isSuperAdmin && userRes.data.workspace_id) {
            // สำหรับ Admin และ Staff ทั่วไป: ให้ใช้ workspace_id จาก Profile เสมอ
            currentWsId = userRes.data.workspace_id
          } else {
            // สำหรับ Super Admin: ดึงจาก Cookie เพื่อรองรับการสลับ Workspace คอนโซลด้านบน
            const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
            currentWsId = cookieWsId || userRes.data.workspace_id || undefined
          }
        }

        // --- แก้ไขปัญหา Race Condition ตอน Mount เมื่อ Cookie ยังเป็น Mock ID ---
        const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
        if (!isDemo && (!currentWsId || currentWsId === "d290f1ee-6c54-4b01-90e6-d701748f0851")) {
          try {
            const supabase = createClient()
            const { data: wsData } = await supabase.from("workspaces").select("id").limit(1)
            if (wsData && wsData.length > 0) {
              const fallbackId = wsData[0].id
              currentWsId = fallbackId
              setCookie("horset_current_workspace_id", fallbackId)
            }
          } catch (wsErr) {
            console.error("Failed to fallback real workspace ID:", wsErr)
          }
        }
        // -------------------------------------------------------------------

        if (currentWsId) {
          setWorkspaceId(currentWsId)

          const res = await getFinanceSettings(currentWsId)
          if (res.success && res.data) {
            setFirstName(res.data.tax_firstname || "")
            setLastName(res.data.tax_lastname || "")
            setTaxId(res.data.tax_id || "")
            setAddress(res.data.tax_address || "")
            setPhone(res.data.tax_phone || "")
            setPromptPayType(res.data.promptpay_type || "phone")
            setPromptPayId(res.data.promptpay_id || "")
            setPromptPayName(res.data.promptpay_name || "")
            setCommonFee(res.data.common_fee !== undefined ? res.data.common_fee : 50)
            setWaterRate(res.data.water_rate !== undefined ? res.data.water_rate : 18)
            setElectricRate(res.data.electric_rate !== undefined ? res.data.electric_rate : 7)
            setWaterMinChecked(res.data.water_min_checked !== undefined ? res.data.water_min_checked : true)
            setWaterMinUnit(res.data.water_min_unit !== undefined ? res.data.water_min_unit : 3)
            setElectricMinChecked(res.data.electric_min_checked !== undefined ? res.data.electric_min_checked : true)
            setElectricMinUnit(res.data.electric_min_unit !== undefined ? res.data.electric_min_unit : 10)
            setIsDatabaseBacked(true)
          } else if (res.error) {
            setErrorMsg(res.error)
          }
        } else {
          setErrorMsg("ไม่พบข้อมูล Workspace ID ของบัญชีผู้ใช้งานนี้")
        }
      } catch (err) {
        console.error("Failed to load settings:", err)
        setErrorMsg("เกิดข้อผิดพลาดในการโหลดข้อมูลการเงิน")
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
        common_fee: commonFee,
        water_rate: waterRate,
        electric_rate: electricRate,
        water_min_checked: waterMinChecked,
        water_min_unit: waterMinUnit,
        electric_min_checked: electricMinChecked,
        electric_min_unit: electricMinUnit
      }

      // บันทึกผ่าน Server Action ไปยังฐานข้อมูล โดยสิทธิ์ Admin ของ Workspace เท่านั้น
      const res = await saveFinanceSettings(workspaceId, payload)
      if (res.success) {
        showToast("บันทึกข้อมูลเข้าสู่เซิร์ฟเวอร์ระบบคลาวด์สำเร็จเรียบร้อย!")
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
            <div className="glass-card rounded-2xl border border-slate-900/60 p-6 space-y-6">
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

              <div className="p-4 bg-teal-500/5 border border-teal-500/10 rounded-xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <div className="text-[10px] text-slate-400 leading-relaxed">
                  <span className="font-bold text-slate-300">สแกนจ่ายได้จริง:</span> ข้อมูลนี้จะนำไปประกอบการสร้าง QR Code ด้วยรูปแบบมาตรฐาน EMVCo ของประเทศไทยโดยตรง เพื่อให้ผู้เช่าสามารถนำโทรศัพท์ไปสแกนและชำระค่าเช่าเข้าบัญชีคุณได้ทันทีในยอดสุทธิที่ถูกต้อง
                </div>
              </div>
            </div>

            {/* กล่องอัตราค่าสาธารณูปโภคและค่าบริการส่วนกลาง */}
            <div className="glass-card rounded-2xl border border-slate-900/60 p-6 space-y-6">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-900 pb-3">
                <Sliders className="w-4 h-4 text-blue-400" /> อัตราสาธารณูปโภคและค่าบริการส่วนกลาง
              </h3>

              {/* ค่าน้ำประปา */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Droplet className="w-4 h-4 text-blue-400" /> ค่าน้ำประปา (Water Utility)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">ราคาต่อหน่วย (บาท / หน่วย)</label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min={0}
                        step="0.01"
                        placeholder="18"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 font-mono text-sm transition-all"
                        value={waterRate}
                        onChange={(e) => setWaterRate(Number(e.target.value))}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">บาท</span>
                    </div>
                  </div>

                  <div className="flex flex-col justify-end space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none py-1">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-blue-500 focus:ring-0 focus:ring-offset-0 focus:outline-none"
                        checked={waterMinChecked}
                        onChange={(e) => setWaterMinChecked(e.target.checked)}
                      />
                      <span className="text-xs text-slate-300 font-medium">กำหนดจำนวนหน่วยขั้นต่ำ</span>
                    </label>
                  </div>
                </div>

                {waterMinChecked && (
                  <div className="p-3 bg-blue-950/20 border border-blue-500/10 rounded-xl space-y-2 animate-fade-in">
                    <label className="text-[11px] text-slate-400 font-medium block">จำนวนหน่วยขั้นต่ำค่าน้ำประปา</label>
                    <div className="relative max-w-[200px]">
                      <input
                        type="number"
                        required
                        min={1}
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 font-mono text-sm transition-all"
                        value={waterMinUnit}
                        onChange={(e) => setWaterMinUnit(Number(e.target.value))}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-semibold">หน่วย</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      * หากใช้น้ำประปาไม่ถึง {waterMinUnit} หน่วย ระบบจะคิดเหมาจ่ายเทียบเท่า {waterMinUnit} หน่วย ({waterMinUnit * waterRate} บาท)
                    </p>
                  </div>
                )}
              </div>

              {/* ค่าไฟฟ้า */}
              <div className="space-y-4 border-t border-slate-900/40 pt-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Zap className="w-4 h-4 text-amber-400" /> ค่ากระแสไฟฟ้า (Electricity Utility)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">ราคาต่อหน่วย (บาท / หน่วย)</label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min={0}
                        step="0.01"
                        placeholder="7"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-200 font-mono text-sm transition-all"
                        value={electricRate}
                        onChange={(e) => setElectricRate(Number(e.target.value))}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">บาท</span>
                    </div>
                  </div>

                  <div className="flex flex-col justify-end space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none py-1">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-amber-500 focus:ring-0 focus:ring-offset-0 focus:outline-none"
                        checked={electricMinChecked}
                        onChange={(e) => setElectricMinChecked(e.target.checked)}
                      />
                      <span className="text-xs text-slate-300 font-medium">กำหนดจำนวนหน่วยขั้นต่ำ</span>
                    </label>
                  </div>
                </div>

                {electricMinChecked && (
                  <div className="p-3 bg-amber-950/20 border border-amber-500/10 rounded-xl space-y-2 animate-fade-in">
                    <label className="text-[11px] text-slate-400 font-medium block">จำนวนหน่วยขั้นต่ำค่ากระแสไฟฟ้า</label>
                    <div className="relative max-w-[200px]">
                      <input
                        type="number"
                        required
                        min={1}
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-200 font-mono text-sm transition-all"
                        value={electricMinUnit}
                        onChange={(e) => setElectricMinUnit(Number(e.target.value))}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-semibold">หน่วย</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      * หากใช้ไฟฟ้าไม่ถึง {electricMinUnit} หน่วย ระบบจะคิดเหมาจ่ายเทียบเท่า {electricMinUnit} หน่วย ({electricMinUnit * electricRate} บาท)
                    </p>
                  </div>
                )}
              </div>

              {/* ค่าบริการส่วนกลาง */}
              <div className="space-y-2 border-t border-slate-900/40 pt-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Building className="w-4 h-4 text-teal-400" /> ค่าบริการส่วนกลางคงที่
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium">ค่าบริการส่วนกลางรายเดือน (บาท / ห้อง)</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={0}
                      placeholder="50"
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
