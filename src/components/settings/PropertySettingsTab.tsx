"use client"

import { useState, useEffect } from "react"
import { Building, Save, ShieldCheck, Check, AlertTriangle, AlertCircle, Loader2, Droplet, Zap, Sliders, Clock, FileText } from "lucide-react"
import { getFinanceSettings, saveFinanceSettings, FinanceSettings, cleanupExpiredSlipsAction } from "@/features/finance/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { createClient } from "@/lib/supabase/client"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { getRoomTypes, updateRoomTypeDeposit, migrateRoomTypeDeposits } from "@/features/room/actions"
import { DEFAULT_STAFF_PERMISSIONS } from "@/features/permissions/types"

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

export default function PropertySettingsTab() {
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
  
  // ตั้งค่าระยะเวลาสัญญาเช่าเริ่มต้นและประเภทสัญญา
  const [leaseDuration, setLeaseDuration] = useState<number>(6)
  const [leaseExpiryAction, setLeaseExpiryAction] = useState<"renew" | "original">("renew")

  // ตั้งค่าระยะเวลาการเก็บไฟล์สลิปโอนเงิน (เดือน) -> 0 หมายถึง ไม่จำกัด / ตลอดไป
  const [slipRetentionMonths, setSlipRetentionMonths] = useState<number>(0)
  const [isCleaning, setIsCleaning] = useState(false)

  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [isDatabaseBacked, setIsDatabaseBacked] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [hasEditPermission, setHasEditPermission] = useState(true)

  // โหลดค่าเริ่มต้นจาก Database
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setErrorMsg(null)
      try {
        const userRes = await getCurrentUserProfileClient()
        let currentWsId: string | undefined = undefined
        
        if (userRes.success && userRes.data) {
          const profile = userRes.data
          const isUserAdminOrSuper = profile.role === "admin" || profile.role === "super_admin"
          if (isUserAdminOrSuper) {
            setHasEditPermission(true)
          } else {
            let perms = profile.permissions
            if (typeof perms === "string") {
              try { perms = JSON.parse(perms) } catch { perms = null }
            }
            const defaultPerms = DEFAULT_STAFF_PERMISSIONS
            const userPerms = { ...defaultPerms, ...perms }
            setHasEditPermission(!!userPerms.manage_property_settings_edit)
          }

          const isSuperAdmin = profile.role === "super_admin"
          if (!isSuperAdmin && profile.workspace_id) {
            currentWsId = profile.workspace_id
          } else {
            const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
            currentWsId = cookieWsId || profile.workspace_id || undefined
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
            setLeaseDuration(cached.lease_duration !== undefined ? cached.lease_duration : 6)
            setLeaseExpiryAction(cached.lease_expiry_action || "renew")
            setSlipRetentionMonths(cached.slip_retention_months !== undefined ? cached.slip_retention_months : 0)
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
              setLeaseDuration(res.data.lease_duration !== undefined ? res.data.lease_duration : 6)
              setLeaseExpiryAction(res.data.lease_expiry_action || "renew")
              setSlipRetentionMonths(res.data.slip_retention_months !== undefined ? res.data.slip_retention_months : 0)
              setIsDatabaseBacked(true)
              setCachedData(currentWsId, cacheKey, res.data)
            } else if (res.error) {
              setErrorMsg(res.error)
            }
          }

          // โหลดค่าเงินประกันแยกตามประเภทห้องพักจากฐานข้อมูล และย้ายค่าจาก localStorage หากมีอยู่
          let rtDeposits: { [key: string]: number } = {}
          let hasLocalSaved = false
          if (typeof window !== "undefined") {
            try {
              const localSaved = localStorage.getItem(`room_type_deposits_${currentWsId}`)
              if (localSaved) {
                rtDeposits = JSON.parse(localSaved)
                hasLocalSaved = true
              }
            } catch (err) {
              console.error("Failed to parse local room type deposits", err)
            }
          }

          if (hasLocalSaved && Object.keys(rtDeposits).length > 0) {
            // Migrate to database
            migrateRoomTypeDeposits(currentWsId, rtDeposits).then(migrated => {
              if (migrated.success) {
                localStorage.removeItem(`room_type_deposits_${currentWsId}`)
                console.log("Successfully migrated room type deposits to Supabase and deleted local storage cache")
              }
            })
          }

          fetchedRoomTypes.forEach((rt: any) => {
            if (rt.deposit_amount !== undefined && rt.deposit_amount !== null) {
              rtDeposits[rt.id] = rt.deposit_amount
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

  const handleManualCleanup = async () => {
    if (!hasEditPermission) {
      showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล")
      return
    }
    if (!workspaceId) {
      alert("ไม่สามารถดำเนินการได้เนื่องจากไม่พบรหัสหอพัก")
      return
    }
    if (slipRetentionMonths <= 0) {
      alert("กรุณาเลือกตั้งค่าเก็บไฟล์สลิปเป็นแบบจำกัดเวลา (เช่น 1, 3, 6, 12 เดือน) ก่อนสั่งทำความสะอาด")
      return
    }
    
    if (!confirm("คุณแน่ใจหรือไม่ที่จะทำการลบรูปภาพสลิปโอนเงินที่หมดอายุทั้งหมดในขณะนี้? (การลบนี้จะลบไฟล์รูปอย่างถาวรออกจาก Supabase Storage และลบ URL สลิปออกจากตารางบิลเพื่อประหยัดพื้นที่)")) {
      return
    }

    setIsCleaning(true)
    try {
      const res = await cleanupExpiredSlipsAction(workspaceId)
      if (res.success) {
        alert(res.message || "ล้างข้อมูลรูปสลิปหมดอายุสำเร็จ!")
      } else {
        alert(res.error || "เกิดข้อผิดพลาดในการล้างสลิป")
      }
    } catch (err: any) {
      console.error(err)
      alert(err?.message || "เกิดข้อผิดพลาดในการส่งคำขอระบบทำความสะอาด")
    } finally {
      setIsCleaning(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasEditPermission) {
      showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล")
      return
    }
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
        advance_rent: advanceRent,
        lease_duration: leaseDuration,
        lease_expiry_action: leaseExpiryAction,
        slip_retention_months: slipRetentionMonths
      }

      const res = await saveFinanceSettings(workspaceId, payload)
      if (res.success) {
        // บันทึกเงินประกันแยกตามประเภทห้องพัก
        if (roomTypes.length > 0) {
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
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 glass-panel border border-teal-500/30 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up text-xs font-semibold">
          {toastMessage.includes("ไม่มีสิทธิ์") ? (
            <>
              <AlertCircle className="w-4 h-4 text-rose-400 animate-pulse" />
              <span className="text-rose-400">{toastMessage}</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4 text-teal-400 animate-pulse" />
              <span className="text-teal-400">{toastMessage}</span>
            </>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 font-sans">ตั้งค่าหอพัก</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            ระบุอัตราส่วนกลาง ค่าปรับจ่ายล่าช้า อัตราค่าน้ำค่าไฟ และเงินประกันแยกตามประเภทห้องพัก
          </p>
        </div>
        
        {/* Badge แจ้งเตือนสถานะฐานข้อมูล */}
        {isDatabaseBacked ? (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-extrabold text-teal-400 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" /> Cloud Database Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-extrabold text-amber-400 shadow-sm">
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
          {/* คอลัมน์ซ้าย: สัญญา & ค่าส่วนกลาง & เงินประกัน */}
          <div className="space-y-6">
            {errorMsg && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-xs sm:text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 animate-pulse" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* กล่อง 1: ค่าส่วนกลางและค่าปรับล่าช้า */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-5 shadow-xl">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <Building className="w-5 h-5 text-teal-500" /> ค่าส่วนกลาง & ค่าปรับชำระล่าช้า
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">ค่าบริการส่วนกลางรายเดือน (บาท / ห้อง)</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={0}
                      placeholder="50"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base transition-all"
                      value={commonFee}
                      onChange={(e) => setCommonFee(Number(e.target.value))}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">บาท</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">เบี้ยปรับชำระล่าช้า (บาท / วัน)</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={0}
                      placeholder="0"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base transition-all"
                      value={latePenaltyRate}
                      onChange={(e) => setLatePenaltyRate(Number(e.target.value))}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">บาท / วัน</span>
                  </div>
                </div>
              </div>
            </div>

            {/* กล่อง 2: เงินประกันหอพักและเงินล่วงหน้า (Security Deposit) */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-900 pb-3">
                <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" /> นโยบายเงินประกันและมัดจำ
                </h3>
                
                {/* ปุ่มสลับประเภทเงินประกัน */}
                <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850">
                  <button
                    type="button"
                    onClick={() => setDepositType("months")}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      depositType === "months" 
                        ? "bg-white dark:bg-slate-900 text-teal-500 shadow-sm border border-slate-200/50 dark:border-slate-800" 
                        : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                    }`}
                  >
                    เทียบเท่าค่าเช่า (เดือน)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositType("fixed")}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      depositType === "fixed" 
                        ? "bg-white dark:bg-slate-900 text-teal-500 shadow-sm border border-slate-200/50 dark:border-slate-800" 
                        : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                    }`}
                  >
                    จำนวนเงินคงที่ (บาท)
                  </button>
                </div>
              </div>

              {/* เงินประกันพื้นฐาน */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">
                    {depositType === "months" ? "เงินประกันห้องพักเริ่มต้น (จำนวนเดือน)" : "เงินประกันห้องพักคงที่ (บาท)"}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={0}
                      step={depositType === "months" ? "0.1" : "1"}
                      placeholder={depositType === "months" ? "1" : "5000"}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base transition-all"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(Number(e.target.value))}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">
                      {depositType === "months" ? "เท่าของค่าเช่า" : "บาท"}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">ค่าเช่าล่วงหน้าตอนทำสัญญา (เดือน)</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={0}
                      step="0.5"
                      placeholder="1"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base transition-all"
                      value={advanceRent}
                      onChange={(e) => setAdvanceRent(Number(e.target.value))}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">เดือน</span>
                  </div>
                </div>
              </div>

              {/* ตารางจัดกลุ่มเงินประกันแยกตามประเภทห้องพัก */}
              {roomTypes.length > 0 && (
                <div className="space-y-3.5 border-t border-slate-200 dark:border-slate-900/40 pt-4.5">
                  <label className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-emerald-500" /> กำหนดเงินประกันเฉพาะเจาะจง ตามประเภทห้อง (Room Types)
                  </label>
                  
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-900">
                    <table className="w-full text-xs sm:text-sm text-left">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-400 font-bold border-b border-slate-200 dark:border-slate-900/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold">ชื่อประเภทห้องพัก</th>
                          <th className="px-4 py-3 font-semibold text-right">เงินประกัน (บาท)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-900/40">
                        {roomTypes.map((rt) => (
                          <tr key={rt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">{rt.name}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="relative inline-block w-[140px]">
                                <input
                                  type="number"
                                  required
                                  min={0}
                                  className="w-full pl-3.5 pr-8 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-right font-mono text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                                  value={roomTypeDeposits[rt.id] !== undefined ? roomTypeDeposits[rt.id] : (depositType === "fixed" ? depositAmount : 5000)}
                                  onChange={(e) => {
                                    setRoomTypeDeposits({
                                      ...roomTypeDeposits,
                                      [rt.id]: Number(e.target.value)
                                    })
                                  }}
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">บ.</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ข้อความแจ้งเตือนความปลอดภัยสรรพากร */}
              <div className="p-4 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/10 rounded-2xl space-y-2">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  <Check className="w-4 h-4" /> แนะนำเพื่อความถูกต้องทางกฎหมายภาษี
                </div>
                <div className="text-[11px] sm:text-xs leading-relaxed text-slate-500 dark:text-slate-400 font-medium space-y-1">
                  <p>
                    • <strong>เงินประกัน (Security Deposit):</strong> ได้รับการยกเว้นไม่ต้องนำไปรวมคำนวณเสียภาษีมูลค่าเพิ่มหรือภาษีเงินได้ เนื่องจากมีภาระผูกพันที่ต้องจ่ายคืนแก่ผู้เช่าเมื่อสัญญาเช่าสิ้นสุดและไม่มีความเสียหายเกิดขึ้น
                  </p>
                  <p>
                    • <strong>ค่าเช่าล่วงหน้า (Advance Rental):</strong> ตามหลักเกณฑ์ประมวลรัษฎากร ถือเป็นรายได้พึงประเมินที่ต้องนำไปรวมเสียภาษีเงินได้ในปีภาษีที่ได้รับเงินนั้นทันที
                  </p>
                </div>
                <p className="text-xs sm:text-sm text-slate-450 dark:text-slate-500 mt-1 leading-normal">
                  ระบุจำนวนเดือนของค่าเช่าล่วงหน้า (เช่น 1 เดือน) ระบบจะนำไปคูณกับราคาค่าเช่าห้องพักหลักของห้องนั้นๆ เพื่อบันทึกเป็นรายได้กลุ่มมาตรา 40(5) (ค่าเช่าทรัพย์สิน) ประจำปีภาษีที่สัญญาเริ่มเช่าทันที
                </p>
              </div>
            </div>
          </div>

          {/* คอลัมน์ขวา: อัตราค่าสาธารณูปโภค */}
          <div className="flex flex-col gap-6">
            
            {/* กล่อง 3: อัตราค่าสาธารณูปโภค (ค่าน้ำประปาและค่าไฟฟ้า) */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <Sliders className="w-5 h-5 text-blue-400" /> อัตราค่าสาธารณูปโภค (น้ำ / ไฟ)
              </h3>

              {/* ค่าน้ำประปา */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">
                  <Droplet className="w-4.5 h-4.5 text-blue-400" /> ค่าน้ำประปา (Water Utility)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">ราคาต่อหน่วย (บาท / หน่วย)</label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min={0}
                        step="0.01"
                        placeholder="18"
                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base transition-all"
                        value={waterRate}
                        onChange={(e) => setWaterRate(Number(e.target.value))}
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">บาท</span>
                    </div>
                  </div>

                  <div className="flex flex-col justify-end space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
                      <input
                        type="checkbox"
                        className="w-4.5 h-4.5 rounded border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-blue-500 focus:ring-0 focus:ring-offset-0 focus:outline-none"
                        checked={waterMinChecked}
                        onChange={(e) => setWaterMinChecked(e.target.checked)}
                      />
                      <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-bold">กำหนดจำนวนหน่วยขั้นต่ำ</span>
                    </label>
                  </div>
                </div>

                {waterMinChecked && (
                  <div className="p-3.5 bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/10 rounded-xl space-y-2 animate-fade-in">
                    <label className="text-xs sm:text-sm text-slate-550 dark:text-slate-400 font-bold block">จำนวนหน่วยขั้นต่ำค่าน้ำประปา</label>
                    <div className="relative max-w-[200px]">
                      <input
                        type="number"
                        required
                        min={1}
                        className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm transition-all"
                        value={waterMinUnit}
                        onChange={(e) => setWaterMinUnit(Number(e.target.value))}
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">หน่วย</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-450 mt-1">
                      * หากใช้น้ำประปาไม่ถึง {waterMinUnit} หน่วย ระบบจะคิดเหมาจ่ายเทียบเท่า {waterMinUnit} หน่วย ({waterMinUnit * waterRate} บาท)
                    </p>
                  </div>
                )}
              </div>

              {/* ค่าไฟฟ้า */}
              <div className="space-y-4 border-t border-slate-200 dark:border-slate-900/40 pt-4">
                <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">
                  <Zap className="w-4.5 h-4.5 text-amber-400" /> ค่ากระแสไฟฟ้า (Electricity Utility)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">ราคาต่อหน่วย (บาท / หน่วย)</label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min={0}
                        step="0.01"
                        placeholder="7"
                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base transition-all"
                        value={electricRate}
                        onChange={(e) => setElectricRate(Number(e.target.value))}
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">บาท</span>
                    </div>
                  </div>

                  <div className="flex flex-col justify-end space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
                      <input
                        type="checkbox"
                        className="w-4.5 h-4.5 rounded border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-amber-500 focus:ring-0 focus:ring-offset-0 focus:outline-none"
                        checked={electricMinChecked}
                        onChange={(e) => setElectricMinChecked(e.target.checked)}
                      />
                      <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-bold">กำหนดจำนวนหน่วยขั้นต่ำ</span>
                    </label>
                  </div>
                </div>

                {electricMinChecked && (
                  <div className="p-3.5 bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/10 rounded-xl space-y-2 animate-fade-in">
                    <label className="text-xs sm:text-sm text-slate-550 dark:text-slate-400 font-bold block">จำนวนหน่วยขั้นต่ำค่ากระแสไฟฟ้า</label>
                    <div className="relative max-w-[200px]">
                      <input
                        type="number"
                        required
                        min={1}
                        className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-800 dark:text-slate-200 font-mono text-sm transition-all"
                        value={electricMinUnit}
                        onChange={(e) => setElectricMinUnit(Number(e.target.value))}
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">หน่วย</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-450 mt-1">
                      * หากใช้ไฟฟ้าไม่ถึง {electricMinUnit} หน่วย ระบบจะคิดเหมาจ่ายเทียบเท่า {electricMinUnit} หน่วย ({electricMinUnit * electricRate} บาท)
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* กล่อง 4: ตั้งค่าสัญญาเช่าเริ่มต้น (Default Lease Settings) */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3 font-sans">
                <FileText className="w-5 h-5 text-emerald-400" /> ตั้งค่าสัญญาเช่าเริ่มต้น
              </h3>

              {/* ระยะเวลาสัญญาเช่า */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">
                  <Clock className="w-4.5 h-4.5 text-teal-400" /> ระยะเวลาสัญญาเช่าเริ่มต้น
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">ระยะเวลาสัญญาเริ่มต้น (เดือน)</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={1}
                      placeholder="6"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base tracking-wide transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={leaseDuration}
                      onChange={(e) => setLeaseDuration(Number(e.target.value))}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">เดือน</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-450 dark:text-slate-500 mt-1 leading-normal">
                    เมื่อเพิ่มผู้เช่าใหม่ ระบบจะคำนวณวันสิ้นสุดสัญญาอัตโนมัติจาก วันเริ่มสัญญา + ระยะเวลาสัญญานี้
                  </p>
                </div>
              </div>

              {/* รูปแบบการหมดสัญญา */}
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-900/40 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">
                    รูปแบบสัญญาเมื่อครบกำหนด
                  </label>
                  
                  {/* Toggle Mode */}
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850/80">
                    <button
                      type="button"
                      onClick={() => setLeaseExpiryAction("renew")}
                      className={`px-3.5 py-1.5 text-xs font-extrabold rounded-md transition-all cursor-pointer ${
                        leaseExpiryAction === "renew"
                          ? "bg-white dark:bg-slate-900 text-teal-500 shadow-sm border border-slate-200/50 dark:border-slate-800"
                          : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                      }`}
                    >
                      ต่อสัญญาใหม่
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaseExpiryAction("original")}
                      className={`px-3.5 py-1.5 text-xs font-extrabold rounded-md transition-all cursor-pointer ${
                        leaseExpiryAction === "original"
                          ? "bg-white dark:bg-slate-900 text-teal-500 shadow-sm border border-slate-200/50 dark:border-slate-800"
                          : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                      }`}
                    >
                      ฉบับเดิม
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-teal-500/5 dark:bg-teal-950/20 border border-teal-500/10 rounded-xl space-y-2 animate-fade-in">
                  <h4 className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-bold">
                    คำอธิบาย Logic สัญญาเช่า:
                  </h4>
                  <ul className="list-disc list-inside text-xs sm:text-sm text-slate-500 space-y-1 leading-normal">
                    {leaseExpiryAction === "renew" ? (
                      <>
                        <li className="text-amber-500 font-medium dark:text-amber-400">
                          ช่วง 2 เดือนสุดท้ายก่อนหมดสัญญา: แสดงสถานะ <strong className="font-semibold">&quot;เหลืออายุสัญญาอีก X เดือน&quot;</strong>
                        </li>
                        <li className="text-red-500 font-medium dark:text-red-400">
                          เมื่อเลยกำหนดวันสิ้นสุดสัญญา: แสดงสถานะ <strong className="font-semibold">&quot;เกินกำหนดระยะสัญญาเดิม&quot;</strong>
                        </li>
                      </>
                    ) : (
                      <li className="text-emerald-500 font-medium dark:text-emerald-400">
                        เมื่อเลยกำหนดวันสิ้นสุดสัญญา: แสดงสถานะ <strong className="font-semibold">&quot;อยู่ครบตามอายุสัญญา&quot;</strong>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            {/* กล่อง 5: ตั้งค่าระยะเวลาการเก็บไฟล์สลิปโอนเงิน (Slip Retention Settings) */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <Clock className="w-5 h-5 text-rose-500" /> ระยะเวลาการเก็บไฟล์สลิปโอนเงิน (Slip)
              </h3>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">
                    ระยะเวลาเก็บไฟล์สลิป (สลิปโอนเงินในตารางบิล)
                  </label>
                  <select
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-rose-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base transition-all font-bold"
                    value={slipRetentionMonths}
                    onChange={(e) => setSlipRetentionMonths(Number(e.target.value))}
                  >
                    <option value={0}>เก็บไว้ตลอดไป (ไม่ลบอัตโนมัติ)</option>
                    <option value={1}>เก็บไว้ 1 เดือน (ลบไฟล์สลิปที่อายุเกิน 1 เดือน)</option>
                    <option value={3}>เก็บไว้ 3 เดือน (ลบไฟล์สลิปที่อายุเกิน 3 เดือน)</option>
                    <option value={6}>เก็บไว้ 6 เดือน (ลบไฟล์สลิปที่อายุเกิน 6 เดือน)</option>
                    <option value={12}>เก็บไว้ 12 เดือน / 1 ปี (ลบไฟล์สลิปที่อายุเกิน 1 ปี)</option>
                  </select>
                  <p className="text-xs sm:text-sm text-slate-450 dark:text-slate-500 mt-1 leading-normal">
                    ระบบจะลบรูปภาพสลิปที่อายุเกินระยะเวลาที่กำหนดออกจาก Supabase Storage และลบที่อยู่ไฟล์ (URL) ออกจากตารางบิลโดยอัตโนมัติทุกๆ สิ้นเดือนเพื่อช่วยประหยัดพื้นที่จัดเก็บข้อมูล แต่ยังคงเก็บข้อมูลบิลและยอดเงินเดิมไว้ทั้งหมดเพื่อความโปร่งใสและการบัญชี
                  </p>
                </div>

                {slipRetentionMonths > 0 && (
                  <div className="p-3.5 bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/10 rounded-xl space-y-3 animate-fade-in">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      <span className="text-xs sm:text-sm text-rose-700 dark:text-rose-400 font-bold">
                        ระบบทำความสะอาดไฟล์สลิป:
                      </span>
                    </div>
                    <ul className="list-disc list-inside text-xs sm:text-sm text-slate-500 space-y-1.5 leading-normal">
                      <li>
                        ภาพสลิปที่มีอายุเกินกว่า <strong className="font-semibold text-rose-500">{slipRetentionMonths} เดือน</strong> จะถูกเคลียร์อัตโนมัติเพื่อประหยัดพื้นที่คลาวด์
                      </li>
                      <li>
                        ข้อมูลรายการเดินบัญชีและสถิติยอดเงินทั้งหมดจะไม่ถูกกระทบกระเทือน
                      </li>
                    </ul>

                    {/* ปุ่มสั่งงานแบบแมนนวล */}
                    <button
                      type="button"
                      disabled={isCleaning || !hasEditPermission}
                      onClick={handleManualCleanup}
                      className={`w-full text-xs sm:text-sm font-bold text-center py-2.5 text-white rounded-lg shadow-md transition-all flex items-center justify-center gap-1.5 ${
                        !hasEditPermission
                          ? "bg-slate-300 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50 shadow-none"
                          : "bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 cursor-pointer"
                      }`}
                    >
                      {isCleaning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          กำลังเคลียร์สลิปหมดอายุ...
                        </>
                      ) : (
                        <>
                          <Clock className="w-4 h-4" />
                          ล้างไฟล์สลิปหมดอายุทันที (Manual Run)
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !hasEditPermission}
              className={`w-full glow-btn text-white font-extrabold py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base shadow-lg transition-all ${
                !hasEditPermission 
                  ? "bg-slate-300 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50 shadow-none" 
                  : "bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 shadow-teal-600/15 cursor-pointer"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                  กำลังบันทึกข้อมูลหอพัก...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" /> บันทึกข้อมูลตั้งค่าหอพักทั้งหมด
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </>
  )
}
