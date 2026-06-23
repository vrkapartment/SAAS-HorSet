"use client"

import { useState, useEffect } from "react"
import { Landmark, Save, ShieldCheck, Check, CreditCard, User, AlertTriangle, Loader2, Droplet, Zap, Building, Sliders, Clock } from "lucide-react"
import { getFinanceSettings, saveFinanceSettings, FinanceSettings } from "@/features/finance/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { createClient } from "@/lib/supabase/client"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { getRoomTypes, updateRoomTypeDeposit, migrateRoomTypeDeposits } from "@/features/room/actions"

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

function parseAddress(fullAddress: string) {
  const result = {
    no: "",
    road: "",
    subdistrict: "",
    district: "",
    province: "",
    zipcode: ""
  }
  
  if (!fullAddress) return result

  // Extract postal code (5 digits at the end)
  const zipMatch = fullAddress.match(/\b\d{5}\b/)
  if (zipMatch) {
    result.zipcode = zipMatch[0]
    fullAddress = fullAddress.replace(zipMatch[0], "").trim()
  }

  // Extract province: look for จังหวัด... or จ.... or กรุงเทพ...
  const provinceKeywords = ["จังหวัด", "จ.", "กรุงเทพมหานคร", "กรุงเทพฯ", "กรุงเทพ"]
  let foundProvince = ""
  for (const kw of provinceKeywords) {
    if (fullAddress.includes(kw)) {
      const idx = fullAddress.indexOf(kw)
      const after = fullAddress.substring(idx).trim()
      foundProvince = after
      fullAddress = fullAddress.substring(0, idx).trim()
      break
    }
  }
  if (foundProvince) {
    result.province = foundProvince.replace(/^(จังหวัด|จ\.)\s*/, "").trim()
  }

  // Extract district: look for อำเภอ... or อ.... or เขต...
  const districtKeywords = ["อำเภอ", "เขต", "อ."]
  let foundDistrict = ""
  for (const kw of districtKeywords) {
    if (fullAddress.includes(kw)) {
      const idx = fullAddress.indexOf(kw)
      const after = fullAddress.substring(idx).trim()
      foundDistrict = after
      fullAddress = fullAddress.substring(0, idx).trim()
      break
    }
  }
  if (foundDistrict) {
    result.district = foundDistrict.replace(/^(อำเภอ|เขต|อ\.)\s*/, "").trim()
  }

  // Extract subdistrict: look for ตำบล... or ต.... or แขวง...
  const subdistrictKeywords = ["ตำบล", "แขวง", "ต."]
  let foundSubdistrict = ""
  for (const kw of subdistrictKeywords) {
    if (fullAddress.includes(kw)) {
      const idx = fullAddress.indexOf(kw)
      const after = fullAddress.substring(idx).trim()
      foundSubdistrict = after
      fullAddress = fullAddress.substring(0, idx).trim()
      break
    }
  }
  if (foundSubdistrict) {
    result.subdistrict = foundSubdistrict.replace(/^(ตำบล|แขวง|ต\.)\s*/, "").trim()
  }

  // Extract road: look for ถนน... or ถ....
  const roadKeywords = ["ถนน", "ถ."]
  let foundRoad = ""
  for (const kw of roadKeywords) {
    if (fullAddress.includes(kw)) {
      const idx = fullAddress.indexOf(kw)
      const after = fullAddress.substring(idx).trim()
      foundRoad = after
      fullAddress = fullAddress.substring(0, idx).trim()
      break
    }
  }
  if (foundRoad) {
    result.road = foundRoad.replace(/^(ถนน|ถ\.)\s*/, "").trim()
  }

  // The rest is address No
  result.no = fullAddress.replace(/,$/, "").trim()

  return result
}

function formatAddress(no: string, road: string, subdistrict: string, district: string, province: string, zipcode: string): string {
  const parts: string[] = []
  if (no) parts.push(no)
  
  if (road && road !== "-") {
    if (road.startsWith("ถนน") || road.startsWith("ถ.")) {
      parts.push(road)
    } else {
      parts.push(`ถนน${road}`)
    }
  }
  
  if (subdistrict) {
    const isBkk = province.includes("กรุงเทพ") || province.includes("BKK") || province.includes("Bangkok")
    const prefix = isBkk ? "แขวง" : "ตำบล"
    if (subdistrict.startsWith(prefix) || subdistrict.startsWith("ต.") || subdistrict.startsWith("ต ")) {
      parts.push(subdistrict)
    } else {
      parts.push(`${prefix}${subdistrict}`)
    }
  }

  if (district) {
    const isBkk = province.includes("กรุงเทพ") || province.includes("BKK") || province.includes("Bangkok")
    const prefix = isBkk ? "เขต" : "อำเภอ"
    if (district.startsWith(prefix) || district.startsWith("อ.") || district.startsWith("อ ")) {
      parts.push(district)
    } else {
      parts.push(`${prefix}${district}`)
    }
  }

  if (province) {
    const isBkk = province.includes("กรุงเทพ") || province.includes("BKK") || province.includes("Bangkok")
    if (isBkk) {
      parts.push(province)
    } else {
      if (province.startsWith("จังหวัด") || province.startsWith("จ.")) {
        parts.push(province)
      } else {
        parts.push(`จังหวัด${province}`)
      }
    }
  }

  if (zipcode) parts.push(zipcode)

  return parts.join(" ")
}

export default function FinanceSettingsPage() {
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [taxId, setTaxId] = useState("")
  const [addressNo, setAddressNo] = useState("")
  const [addressRoad, setAddressRoad] = useState("")
  const [addressSubdistrict, setAddressSubdistrict] = useState("")
  const [addressDistrict, setAddressDistrict] = useState("")
  const [addressProvince, setAddressProvince] = useState("")
  const [addressZipcode, setAddressZipcode] = useState("")
  const [phone, setPhone] = useState("")

  const [promptPayType, setPromptPayType] = useState<"phone" | "national_id">("phone")
  const [promptPayId, setPromptPayId] = useState("")
  const [promptPayName, setPromptPayName] = useState("")
  const [commonFee, setCommonFee] = useState<number>(50)
  const [latePenaltyRate, setLatePenaltyRate] = useState<number>(0)
  const [depositAmount, setDepositAmount] = useState<number>(0)
  const [depositType, setDepositType] = useState<"months" | "fixed">("months")
  const [advanceRent, setAdvanceRent] = useState<number>(0)
  const [roomTypes, setRoomTypes] = useState<any[]>([])
  const [roomTypeDeposits, setRoomTypeDeposits] = useState<{ [roomTypeId: string]: number }>({})

  // สำหรับราคาหน่วย ค่าน้ำ ค่าไฟ และขั้นต่ำ
  const [waterRate, setWaterRate] = useState<number>(18)
  const [electricRate, setElectricRate] = useState<number>(7)
  const [waterMinChecked, setWaterMinChecked] = useState<boolean>(true)
  const [waterMinUnit, setWaterMinUnit] = useState<number>(3)
  const [electricMinChecked, setElectricMinChecked] = useState<boolean>(true)
  const [electricMinUnit, setElectricMinUnit] = useState<number>(10)

  // ป้องกันการทับซ้อนคอลัมน์เก็บไฟล์สลิปของหน้านี้
  const [slipRetentionMonths, setSlipRetentionMonths] = useState<number>(0)

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
        const userRes = await getCurrentUserProfileClient()
        
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

          // Load room types
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
            const parsed = parseAddress(cached.tax_address || "")
            setAddressNo(parsed.no)
            setAddressRoad(parsed.road)
            setAddressSubdistrict(parsed.subdistrict)
            setAddressDistrict(parsed.district)
            setAddressProvince(parsed.province)
            setAddressZipcode(parsed.zipcode)
            setPhone(cached.tax_phone || "")
            setPromptPayType(cached.promptpay_type || "phone")
            setPromptPayId(cached.promptpay_id || "")
            setPromptPayName(cached.promptpay_name || "")
            setCommonFee(cached.common_fee !== undefined ? cached.common_fee : 50)
            setLatePenaltyRate(cached.late_penalty_rate !== undefined ? cached.late_penalty_rate : 0)
            setDepositAmount(cached.deposit_amount !== undefined ? cached.deposit_amount : 0)
            setDepositType(cached.deposit_type || "months")
            currentDepositAmount = cached.deposit_amount !== undefined ? cached.deposit_amount : 0
            currentDepositType = cached.deposit_type || "months"
            setAdvanceRent(cached.advance_rent !== undefined ? cached.advance_rent : 0)
            setWaterRate(cached.water_rate !== undefined ? cached.water_rate : 18)
            setElectricRate(cached.electric_rate !== undefined ? cached.electric_rate : 7)
            setElectricMinChecked(cached.electric_min_checked !== undefined ? cached.electric_min_checked : true)
            setElectricMinUnit(cached.electric_min_unit !== undefined ? cached.electric_min_unit : 10)
            setSlipRetentionMonths(cached.slip_retention_months !== undefined ? cached.slip_retention_months : 0)
            setIsDatabaseBacked(true)
          } else {
            const res = await getFinanceSettings(currentWsId)
            if (res.success && res.data) {
              setFirstName(res.data.tax_firstname || "")
              setLastName(res.data.tax_lastname || "")
              setTaxId(res.data.tax_id || "")
              const parsed = parseAddress(res.data.tax_address || "")
              setAddressNo(parsed.no)
              setAddressRoad(parsed.road)
              setAddressSubdistrict(parsed.subdistrict)
              setAddressDistrict(parsed.district)
              setAddressProvince(parsed.province)
              setAddressZipcode(parsed.zipcode)
              setPhone(res.data.tax_phone || "")
              setPromptPayType(res.data.promptpay_type || "phone")
              setPromptPayId(res.data.promptpay_id || "")
              setPromptPayName(res.data.promptpay_name || "")
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
              setSlipRetentionMonths(res.data.slip_retention_months !== undefined ? res.data.slip_retention_months : 0)
              setIsDatabaseBacked(true)
              setCachedData(currentWsId, cacheKey, res.data)
            } else if (res.error) {
              setErrorMsg(res.error)
            }
          }

          // Build roomTypeDeposits map from DB fields and migrate from localStorage if present
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
      const fullAddress = formatAddress(addressNo, addressRoad, addressSubdistrict, addressDistrict, addressProvince, addressZipcode)
      const payload: FinanceSettings = {
        tax_firstname: firstName,
        tax_lastname: lastName,
        tax_id: taxId,
        tax_address: fullAddress,
        tax_phone: phone,
        promptpay_type: promptPayType,
        promptpay_id: cleanedPPId,
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
        slip_retention_months: slipRetentionMonths
      }

      // บันทึกผ่าน Server Action ไปยังฐานข้อมูล โดยสิทธิ์ Admin ของ Workspace เท่านั้น
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
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">ตั้งค่าการเงินและบัญชีรับเงิน</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
          {/* คอลัมน์ซ้าย: ข้อมูลผู้ยื่นเสียภาษี และ ค่าปรับล่าช้า */}
          <div className="flex flex-col gap-6">
            
            {/* กล่อง 1: ข้อมูลผู้ยื่นเสียภาษีเงินได้บุคคลธรรมดา */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm transition-all"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium">นามสกุล</label>
                  <input
                    type="text"
                    placeholder="นามสกุล (เช่น แสนสุข)"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm transition-all"
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
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm tracking-wide transition-all"
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm transition-all"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* ฟอร์มกรอกที่อยู่แบบแยกประเภท */}
              <div className="space-y-4 border-t border-slate-200 dark:border-slate-900/40 pt-4">
                <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block uppercase tracking-wider">ที่อยู่ตามทะเบียนบ้าน (เพื่อกรอกในแบบยื่นภาษีกรมสรรพากร)</label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">เลขที่ / ซอย / หมู่บ้าน / อาคาร</label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น 21 ซอยหงษ์อ่อน"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm transition-all"
                      value={addressNo}
                      onChange={(e) => setAddressNo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">ถนน (ถ้าไม่มีให้ใส่ -)</label>
                    <input
                      type="text"
                      placeholder="เช่น ประชาราษฎร์บำเพ็ญ"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm transition-all"
                      value={addressRoad}
                      onChange={(e) => setAddressRoad(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">ตำบล / แขวง</label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น ห้วยขวาง"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm transition-all"
                      value={addressSubdistrict}
                      onChange={(e) => setAddressSubdistrict(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">อำเภอ / เขต</label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น ห้วยขวาง"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm transition-all"
                      value={addressDistrict}
                      onChange={(e) => setAddressDistrict(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">จังหวัด</label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น กรุงเทพมหานคร"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm transition-all"
                      value={addressProvince}
                      onChange={(e) => setAddressProvince(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">รหัสไปรษณีย์</label>
                    <input
                      type="text"
                      required
                      maxLength={5}
                      placeholder="เช่น 10310"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm tracking-wide transition-all"
                      value={addressZipcode}
                      onChange={(e) => setAddressZipcode(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* คอลัมน์ขวา: พร้อมเพย์และอัตราค่าน้ำค่าไฟ */}
          <div className="flex flex-col gap-6">
            
            {/* กล่อง 3: พร้อมเพย์ */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
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
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700"
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
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700"
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
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-sm tracking-wide transition-all"
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
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 text-sm transition-all"
                  value={promptPayName}
                  onChange={(e) => setPromptPayName(e.target.value)}
                />
              </div>

              <div className="p-4 bg-teal-500/5 border border-teal-500/10 rounded-xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  <span className="font-bold text-slate-700 dark:text-slate-300">สแกนจ่ายได้จริง:</span> ข้อมูลนี้จะนำไปประกอบการสร้าง QR Code ด้วยรูปแบบมาตรฐาน EMVCo ของประเทศไทยโดยตรง เพื่อให้ผู้เช่าสามารถนำโทรศัพท์ไปสแกนและชำระค่าเช่าเข้าบัญชีคุณได้ทันทีในยอดสุทธิที่ถูกต้อง
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
                  <Save className="w-4 h-4" /> บันทึกข้อมูลตั้งค่าการเงิน
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </>
  )
}
