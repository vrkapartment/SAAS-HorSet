"use client"

import { useState, useEffect } from "react"
import { Building, Save, ShieldCheck, Check, AlertTriangle, Loader2, Droplet, Zap, Sliders, Clock } from "lucide-react"
import { getFinanceSettings, saveFinanceSettings, FinanceSettings } from "@/features/finance/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { createClient } from "@/lib/supabase/client"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { getRoomTypes, updateRoomTypeDeposit } from "@/features/room/actions"

function setCookie(name: string, value: string, days = 7) {
  if (typeof document === "undefined") return
  const date = new Date()
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:"
  document.cookie = `${name}=${value}; path=/; expires=${date.toUTCString()}${isSecure ? "; Secure" : ""}; SameSite=Lax`
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

export default function PropertySettingsPage() {
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()

  // ฟิลด์ส่วนตัวผู้ยื่นภาษี (ดึงมาพักไว้เพื่อบันทึกคืนอย่างปลอดภัย)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [taxId, setTaxId] = useState("")
  const [taxAddress, setTaxAddress] = useState("")
  const [phone, setPhone] = useState("")

  // ฟิลด์พร้อมเพย์ (ดึงมาพักไว้เพื่อบันทึกคืนอย่างปลอดภัย)
  const [promptPayType, setPromptPayType] = useState<"phone" | "national_id">("phone")
  const [promptPayId, setPromptPayId] = useState("")
  const [promptPayName, setPromptPayName] = useState("")

  // ฟิลด์ตั้งค่าหอพัก (ที่จะแสดงผลและให้แก้ไขในหน้านี้)
  const [commonFee, setCommonFee] = useState<number>(50)
  const [latePenaltyRate, setLatePenaltyRate] = useState<number>(0)
  const [depositAmount, setDepositAmount] = useState<number>(0)
  const [depositType, setDepositType] = useState<"months" | "fixed">("months")
  const [advanceRent, setAdvanceRent] = useState<number>(0)
  const [roomTypes, setRoomTypes] = useState<any[]>([])
  const [roomTypeDeposits, setRoomTypeDeposits] = useState<{ [roomTypeId: string]: number }>({})

  // ค่าน้ำ ค่าไฟ และขั้นต่ำ
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

  // โหลดค่าเริ่มต้นจาก Database
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setErrorMsg(null)
      try {
        const userRes = await getCurrentUserProfileClient()
        let currentWsId: string | undefined = undefined
        
        if (userRes.success && userRes.data) {
          const isSuperAdmin = userRes.data.role === "super_admin"
          if (!isSuperAdmin && userRes.data.workspace_id) {
            currentWsId = userRes.data.workspace_id
          } else {
            const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
            currentWsId = cookieWsId || userRes.data.workspace_id || undefined
          }
        }

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
            console.error("Failed to fallback real workspace ID in property settings:", wsErr)
          }
        }

        if (currentWsId) {
          setWorkspaceId(currentWsId)

          // โหลดประเภทห้องพัก
          const typesRes = await getRoomTypes()
          let fetchedRoomTypes: any[] = []
          if (typesRes.success && typesRes.data) {
            fetchedRoomTypes = typesRes.data
            setRoomTypes(fetchedRoomTypes)
          }

          const cacheKey = "finance_settings"
          const cached = getCachedData<FinanceSettings>(currentWsId, cacheKey)
          let currentDepositAmount = 0
          let currentDepositType: "months" | "fixed" = "months"
          
          if (cached) {
            setFirstName(cached.tax_firstname || "")
            setLastName(cached.tax_lastname || "")
            setTaxId(cached.tax_id || "")
            setTaxAddress(cached.tax_address || "")
            setPhone(cached.tax_phone || "")
            setPromptPayType(cached.promptpay_type || "phone")
            setPromptPayId(cached.promptpay_id || "")
            setPromptPayName(cached.promptpay_name || "")

            // ตั้งค่าฟิลด์หอพัก
            setCommonFee(cached.common_fee !== undefined ? cached.common_fee : 50)
            setLatePenaltyRate(cached.late_penalty_rate !== undefined ? cached.late_penalty_rate : 0)
            setDepositAmount(cached.deposit_amount !== undefined ? cached.deposit_amount : 0)
            setDepositType(cached.deposit_type || "months")
            currentDepositAmount = cached.deposit_amount !== undefined ? cached.deposit_amount : 0
            currentDepositType = cached.deposit_type || "months"
            setAdvanceRent(cached.advance_rent !== undefined ? cached.advance_rent : 0)
            setWaterRate(cached.water_rate !== undefined ? cached.water_rate : 18)
            setElectricRate(cached.electric_rate !== undefined ? cached.electric_rate : 7)
            setWaterMinChecked(cached.water_min_checked !== undefined ? cached.water_min_checked : true)
            setWaterMinUnit(cached.water_min_unit !== undefined ? cached.water_min_unit : 3)
            setElectricMinChecked(cached.electric_min_checked !== undefined ? cached.electric_min_checked : true)
            setElectricMinUnit(cached.electric_min_unit !== undefined ? cached.electric_min_unit : 10)
            setIsDatabaseBacked(true)
          } else {
            const res = await getFinanceSettings(currentWsId)
            if (res.success && res.data) {
              setFirstName(res.data.tax_firstname || "")
              setLastName(res.data.tax_lastname || "")
              setTaxId(res.data.tax_id || "")
              setTaxAddress(res.data.tax_address || "")
              setPhone(res.data.tax_phone || "")
              setPromptPayType(res.data.promptpay_type || "phone")
              setPromptPayId(res.data.promptpay_id || "")
              setPromptPayName(res.data.promptpay_name || "")

              // ตั้งค่าฟิลด์หอพัก
              setCommonFee(res.data.common_fee !== undefined ? res.data.common_fee : 50)
              setLatePenaltyRate(res.data.late_penalty_rate !== undefined ? res.data.late_penalty_rate : 0)
              setDepositAmount(res.data.deposit_amount !== undefined ? res.data.deposit_amount : 0)
              setDepositType(res.data.deposit_type || "months")
              currentDepositAmount = res.data.deposit_amount !== undefined ? res.data.deposit_amount : 0
              currentDepositType = res.data.deposit_type || "months"
              setAdvanceRent(res.data.advance_rent !== undefined ? res.data.advance_rent : 0)
              setWaterRate(res.data.water_rate !== undefined ? res.data.water_rate : 18)
              setElectricRate(res.data.electric_rate !== undefined ? res.data.electric_rate : 7)
              setWaterMinChecked(res.data.water_min_checked !== undefined ? res.data.water_min_checked : true)
              setWaterMinUnit(res.data.water_min_unit !== undefined ? res.data.water_min_unit : 3)
              setElectricMinChecked(res.data.electric_min_checked !== undefined ? res.data.electric_min_checked : true)
              setElectricMinUnit(res.data.electric_min_unit !== undefined ? res.data.electric_min_unit : 10)
              setIsDatabaseBacked(true)
              setCachedData(currentWsId, cacheKey, res.data)
            } else if (res.error) {
              setErrorMsg(res.error)
            }
          }

          // โหลดค่าเงินประกันแยกตามประเภทห้องพัก
          let rtDeposits: { [key: string]: number } = {}
          if (typeof window !== "undefined") {
            try {
              const localSaved = localStorage.getItem(`room_type_deposits_${currentWsId}`)
              if (localSaved) {
                rtDeposits = JSON.parse(localSaved)
              }
            } catch (err) {
              console.error("Failed to parse local room type deposits", err)
            }
          }
          fetchedRoomTypes.forEach((rt: any) => {
            if (rt.deposit_amount !== undefined && rt.deposit_amount !== null) {
              if (rtDeposits[rt.id] === undefined) {
                rtDeposits[rt.id] = rt.deposit_amount
              }
            } else {
              if (rtDeposits[rt.id] === undefined) {
                rtDeposits[rt.id] = currentDepositType === "fixed" ? currentDepositAmount : 5000
              }
            }
          })
          setRoomTypeDeposits(rtDeposits)
        } else {
          setErrorMsg("ไม่พบข้อมูล Workspace ID ของบัญชีผู้ใช้งานนี้")
        }
      } catch (err) {
        console.error("Failed to load property settings:", err)
        setErrorMsg("เกิดข้อผิดพลาดในการโหลดข้อมูลการตั้งค่าหอพัก")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const payload: FinanceSettings = {
        tax_firstname: firstName,
        tax_lastname: lastName,
        tax_id: taxId,
        tax_address: taxAddress,
        tax_phone: phone,
        promptpay_type: promptPayType,
        promptpay_id: promptPayId,
        promptpay_name: promptPayName,
        common_fee: commonFee,
        late_penalty_rate: latePenaltyRate,
        water_rate: waterRate,
        electric_rate: electricRate,
        water_min_checked: waterMinChecked,
        water_min_unit: waterMinUnit,
        electric_min_checked: electricMinChecked,
        electric_min_unit: electricMinUnit,
        deposit_amount: depositAmount,
        deposit_type: depositType,
        advance_rent: advanceRent
      }

      const res = await saveFinanceSettings(workspaceId, payload)
      if (res.success) {
        // บันทึกเงินประกันแยกตามประเภทห้องพัก
        if (roomTypes.length > 0) {
          if (typeof window !== "undefined") {
            localStorage.setItem(`room_type_deposits_${workspaceId}`, JSON.stringify(roomTypeDeposits))
          }
          for (const rt of roomTypes) {
            const amt = roomTypeDeposits[rt.id] !== undefined ? roomTypeDeposits[rt.id] : depositAmount
            try {
              await updateRoomTypeDeposit(rt.id, amt)
            } catch (err) {
              console.error(`ไม่สามารถบันทึกเงินประกันของประเภทห้อง ${rt.name} ได้:`, err)
            }
          }
        }
        clearWorkspaceCache(workspaceId)
        setCachedData(workspaceId, "finance_settings", payload)
        showToast("บันทึกการตั้งค่าหอพักสำเร็จเรียบร้อย!")
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
    <>
      {/* Toast แจ้งเตือน */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 glass-panel border border-teal-500/30 text-teal-400 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up text-xs font-semibold">
          <Check className="w-4 h-4 text-teal-400 animate-pulse" /> {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">ตั้งค่าหอพัก</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            ระบุอัตราส่วนกลาง ค่าปรับจ่ายล่าช้า อัตราค่าน้ำค่าไฟ และเงินประกันแยกตามประเภทห้องพัก
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
          <p className="text-xs text-slate-400">กำลังโหลดข้อมูลการตั้งค่าหอพัก...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          
          {/* คอลัมน์ซ้าย: ค่าบริการส่วนกลาง ค่าปรับ และเงินประกัน */}
          <div className="flex flex-col gap-6">
            
            {/* กล่อง 1: ค่าบริการส่วนกลางและค่าปรับล่าช้า */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <Sliders className="w-4 h-4 text-blue-400" /> ค่าบริการส่วนกลางและค่าปรับล่าช้า
              </h3>

              {errorMsg && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-start gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* ค่าบริการส่วนกลาง */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
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
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-sm tracking-wide transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

              {/* ค่าปรับจ่ายล่าช้าสะสมรายวัน */}
              <div className="space-y-2 border-t border-slate-200 dark:border-slate-900/40 pt-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Clock className="w-4 h-4 text-amber-500 animate-pulse" /> ค่าปรับจ่ายบิลล่าช้า (สะสมต่อวัน)
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium">อัตราค่าปรับล่าช้าต่อวัน (บาท / วัน)</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={0}
                      placeholder="50"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-800 dark:text-slate-200 font-mono text-sm tracking-wide transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={latePenaltyRate}
                      onChange={(e) => setLatePenaltyRate(Number(e.target.value))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">บาท</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    สะสมค่าปรับเพิ่มขึ้นอัตโนมัติทุกวันเมื่อพ้นกำหนดส่งเงิน (ตั้งแต่วันที่ 6 ของรอบบิลเป็นต้นไป)
                  </p>
                </div>
              </div>
            </div>

            {/* กล่อง 2: เงินประกันและค่าเช่าล่วงหน้า */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <ShieldCheck className="w-4 h-4 text-teal-400" /> เงินประกันและค่าเช่าล่วงหน้า
              </h3>

              {/* เงินประกัน (เงินมัดจำ) */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs text-slate-400 font-medium">
                    เงินประกัน (เงินมัดจำ) {depositType === "months" ? "(จำนวนเดือน)" : "(จำนวนเงินบาท)"}
                  </label>
                  
                  {/* Toggle Mode */}
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850/80">
                    <button
                      type="button"
                      onClick={() => {
                        setDepositType("months")
                        if (depositAmount > 12) {
                          setDepositAmount(1)
                        }
                      }}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                        depositType === "months"
                          ? "bg-white dark:bg-slate-900 text-teal-500 shadow-sm border border-slate-200/50 dark:border-slate-800"
                          : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                      }`}
                    >
                      คิดตามจำนวนเดือน
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDepositType("fixed")
                        if (depositAmount <= 12) {
                          setDepositAmount(5000)
                        }
                      }}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                        depositType === "fixed"
                          ? "bg-white dark:bg-slate-900 text-teal-500 shadow-sm border border-slate-200/50 dark:border-slate-800"
                          : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                      }`}
                    >
                      ระบุตัวเลขเงินคงที่
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    required
                    min={0}
                    step={depositType === "months" ? 0.5 : 100}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-sm tracking-wide transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">
                    {depositType === "months" ? "เดือน" : "บาท"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                  {depositType === "months" 
                    ? "ระบุจำนวนเดือนของเงินประกัน (เช่น 2 เดือน) ระบบจะนำไปคูณกับราคาค่าเช่าห้องพักหลักของห้องนั้นๆ เพื่อพักยอดเงินประกันไว้ในสถานะหนี้สิน และคำนวณหักกลบลบด้วยยอดคืนเงินจริงเมื่อยกเลิกสัญญาเพื่อส่งเป็นรายได้ 40(8)"
                    : "ระบุจำนวนเงินประกันเริ่มต้น (เช่น 5,000 บาท) สำหรับห้องพักทั่วไปหรือใช้เป็นค่าเริ่มต้นหากประเภทห้องพักนั้นๆ ไม่ได้ระบุแยกเอาไว้ด้านล่าง"
                  }
                </p>

                {/* แยกตามประเภทห้องพัก */}
                {depositType === "fixed" && roomTypes.length > 0 && (
                  <div className="space-y-4 border-t border-slate-100 dark:border-slate-900/40 pt-4 mt-2 animate-fade-in">
                    <div className="flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-teal-400" />
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        ระบุเงินประกันแยกตามประเภทห้องพัก
                      </h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {roomTypes.map((rt) => {
                        const val = roomTypeDeposits[rt.id] !== undefined ? roomTypeDeposits[rt.id] : depositAmount;
                        return (
                          <div key={rt.id} className="relative group/input flex flex-col gap-1 bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-xl border border-slate-200/60 dark:border-slate-850/60 hover:border-teal-500/30 transition-all duration-300">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 group-hover/input:text-teal-400 transition-colors">
                              ประเภท: {rt.name}
                            </span>
                            <div className="relative">
                              <input
                                type="number"
                                required
                                min={0}
                                step={100}
                                placeholder={depositAmount.toString()}
                                className="w-full pr-12 pl-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-xs tracking-wide transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={val}
                                onChange={(e) => {
                                  const updated = { ...roomTypeDeposits, [rt.id]: Number(e.target.value) }
                                  setRoomTypeDeposits(updated)
                                }}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                                บาท
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ค่าเช่าล่วงหน้า */}
              <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-900/40 pt-4">
                <label className="text-xs text-slate-400 font-medium">ค่าเช่าล่วงหน้า (จำนวนเดือน)</label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min={0}
                    step={0.5}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-sm tracking-wide transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={advanceRent}
                    onChange={(e) => setAdvanceRent(Number(e.target.value))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">เดือน</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                  ระบุจำนวนเดือนของค่าเช่าล่วงหน้า (เช่น 1 เดือน) ระบบจะนำไปคูณกับราคาค่าเช่าห้องพักหลักของห้องนั้นๆ เพื่อบันทึกเป็นรายได้กลุ่มมาตรา 40(5) (ค่าเช่าทรัพย์สิน) ประจำปีภาษีที่สัญญาเริ่มเช่าทันที
                </p>
              </div>
            </div>
          </div>

          {/* คอลัมน์ขวา: อัตราค่าสาธารณูปโภค */}
          <div className="flex flex-col gap-6">
            
            {/* กล่อง 3: อัตราค่าสาธารณูปโภค (ค่าน้ำประปาและค่าไฟฟ้า) */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <Sliders className="w-4 h-4 text-blue-400" /> อัตราค่าสาธารณูปโภค (น้ำ / ไฟ)
              </h3>

              {/* ค่าน้ำประปา */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
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
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm transition-all"
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
                        className="w-4 h-4 rounded border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-blue-500 focus:ring-0 focus:ring-offset-0 focus:outline-none"
                        checked={waterMinChecked}
                        onChange={(e) => setWaterMinChecked(e.target.checked)}
                      />
                      <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">กำหนดจำนวนหน่วยขั้นต่ำ</span>
                    </label>
                  </div>
                </div>

                {waterMinChecked && (
                  <div className="p-3 bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/10 rounded-xl space-y-2 animate-fade-in">
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">จำนวนหน่วยขั้นต่ำค่าน้ำประปา</label>
                    <div className="relative max-w-[200px]">
                      <input
                        type="number"
                        required
                        min={1}
                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm transition-all"
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
              <div className="space-y-4 border-t border-slate-200 dark:border-slate-900/40 pt-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
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
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-800 dark:text-slate-200 font-mono text-sm transition-all"
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
                        className="w-4 h-4 rounded border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-amber-500 focus:ring-0 focus:ring-offset-0 focus:outline-none"
                        checked={electricMinChecked}
                        onChange={(e) => setElectricMinChecked(e.target.checked)}
                      />
                      <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">กำหนดจำนวนหน่วยขั้นต่ำ</span>
                    </label>
                  </div>
                </div>

                {electricMinChecked && (
                  <div className="p-3 bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/10 rounded-xl space-y-2 animate-fade-in">
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">จำนวนหน่วยขั้นต่ำค่ากระแสไฟฟ้า</label>
                    <div className="relative max-w-[200px]">
                      <input
                        type="number"
                        required
                        min={1}
                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-800 dark:text-slate-200 font-mono text-sm transition-all"
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
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full glow-btn bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-teal-600/15 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                  กำลังบันทึกข้อมูลหอพัก...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> บันทึกข้อมูลตั้งค่าหอพักทั้งหมด
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </>
  )
}
