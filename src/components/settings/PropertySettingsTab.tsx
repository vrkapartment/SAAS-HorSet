"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Building, Save, ShieldCheck, Check, AlertTriangle, AlertCircle, Loader2, Droplet, Zap, Sliders, Clock, FileText, UploadCloud, Trash2, Image } from "lucide-react"
import { getFinanceSettings, saveFinanceSettings, FinanceSettings, cleanupExpiredSlipsAction, savePropertyLogoUrl } from "@/features/finance/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { createClient } from "@/lib/supabase/client"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { getRoomTypes, updateRoomTypeDeposit, migrateRoomTypeDeposits } from "@/features/room/actions"
import { DEFAULT_STAFF_PERMISSIONS } from "@/features/permissions/types"
import { useLanguage } from "@/lib/translations/LanguageProvider"

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

export default function PropertySettingsTab() {
  const { t } = useLanguage()
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

  // ตั้งค่าระยะเวลาการเก็บไฟล์สลิปโอนเงิน (เดือน) -> บังคับเป็นค่าจำกัดเสมอ (1-12) ไม่มี "เก็บไว้ตลอดไป" อีกต่อไป
  const [slipRetentionMonths, setSlipRetentionMonths] = useState<number>(12)
  const [checkoutPolicy, setCheckoutPolicy] = useState<"DAILY_PRORATE" | "FULL_MONTH">("DAILY_PRORATE")
  const [isCleaning, setIsCleaning] = useState(false)

  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string>("")
  const [isDatabaseBacked, setIsDatabaseBacked] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [hasEditPermission, setHasEditPermission] = useState(true)

  const [logoUrl, setLogoUrl] = useState<string>("")
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

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
            setLogoUrl(cached.logo_url || "")

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
            setSlipRetentionMonths(cached.slip_retention_months ? cached.slip_retention_months : 12)
            setCheckoutPolicy(cached.checkout_policy || "DAILY_PRORATE")
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
              setLogoUrl(res.data.logo_url || "")

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
              setSlipRetentionMonths(res.data.slip_retention_months ? res.data.slip_retention_months : 12)
              setCheckoutPolicy(res.data.checkout_policy || "DAILY_PRORATE")
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
          setErrorMsg(t("property_settings.workspace_load_error"))
        }
      } catch (err) {
        console.error("Failed to load property settings:", err)
        setErrorMsg(t("property_settings.load_error"))
      } finally {
        setLoading(false)
      }
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleManualCleanup = async () => {
    if (!hasEditPermission) {
      showToast(t("property_settings.permission_error"))
      return
    }
    if (!workspaceId) {
      alert(t("property_settings.err_no_workspace"))
      return
    }
    if (slipRetentionMonths <= 0) {
      alert(t("property_settings.err_retention_limit_warning"))
      return
    }
    
    if (!confirm(t("property_settings.cleanup_confirm"))) {
      return
    }

    setIsCleaning(true)
    try {
      const res = await cleanupExpiredSlipsAction(workspaceId)
      if (res.success) {
        alert(t("property_settings.cleanup_success"))
      } else {
        alert(res.error || t("property_settings.cleanup_error"))
      }
    } catch (err: any) {
      console.error(err)
      alert(err?.message || t("property_settings.cleanup_request_error"))
    } finally {
      setIsCleaning(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasEditPermission) {
      showToast(t("property_settings.permission_error"))
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
        slip_retention_months: slipRetentionMonths,
        checkout_policy: checkoutPolicy,
        logo_url: logoUrl
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
              console.error(`Could not save security deposit for room type ${rt.name}:`, err)
            }
          }
        }
        clearWorkspaceCache(workspaceId)
        setCachedData(workspaceId, "finance_settings", payload)
        showToast(t("property_settings.save_success"))
      } else {
        setErrorMsg(res.error || t("property_settings.save_error"))
      }
    } catch (err) {
      setErrorMsg(t("property_settings.connection_error"))
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // ตรวจสอบขนาดไม่เกิน 1MB
    if (file.size > 1024 * 1024) {
      showToast(t("property_settings.logo_size_error"))
      return
    }

    setIsUploadingLogo(true)
    try {
      const supabase = createClient()
      
      const fileExt = file.name.split('.').pop() || 'png'
      const fileName = `logos/workspace_${workspaceId}_logo_${Date.now()}.${fileExt}`

      // อัปโหลดขึ้น bucket payment-slips ที่เปิด public อยู่แล้ว
      const { data, error: uploadError } = await supabase.storage
         .from("payment-slips")
         .upload(fileName, file, {
           contentType: file.type,
           cacheControl: "3600",
           upsert: true,
         })

      if (uploadError) {
        throw uploadError
      }

      // ขอ URL สาธารณะ
      const { data: { publicUrl } } = supabase.storage
         .from("payment-slips")
         .getPublicUrl(fileName)

      // บันทึก URL ลงในระบบ database workspaces
      const dbRes = await savePropertyLogoUrl(workspaceId, publicUrl)
      if (dbRes.success) {
        setLogoUrl(publicUrl)
        
        // อัปเดต Cache
        const cacheKey = "finance_settings"
        const cached = getCachedData<FinanceSettings>(workspaceId, cacheKey)
        if (cached) {
          setCachedData(workspaceId, cacheKey, {
            ...cached,
            logo_url: publicUrl
          })
        }
        
        showToast(t("property_settings.logo_upload_success"))
      } else {
        showToast(dbRes.error || t("property_settings.logo_save_error"))
      }
    } catch (err: any) {
      console.error("Logo upload error:", err)
      showToast(err?.message || t("property_settings.connection_error"))
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!confirm(t("property_settings.logo_remove_confirm"))) return
    
    setIsUploadingLogo(true)
    try {
      const dbRes = await savePropertyLogoUrl(workspaceId, "")
      if (dbRes.success) {
        setLogoUrl("")
        
        // อัปเดต Cache
        const cacheKey = "finance_settings"
        const cached = getCachedData<FinanceSettings>(workspaceId, cacheKey)
        if (cached) {
          setCachedData(workspaceId, cacheKey, {
            ...cached,
            logo_url: ""
          })
        }
        
        showToast(t("property_settings.logo_remove_success"))
      } else {
        showToast(dbRes.error || t("property_settings.logo_remove_error"))
      }
    } catch (err: any) {
      console.error("Remove logo error:", err)
      showToast(err?.message || t("property_settings.connection_error"))
    } finally {
      setIsUploadingLogo(false)
    }
  }

  return (
    <div className="font-sans">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 glass-panel border border-teal-500/30 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up text-xs font-semibold">
          {toastMessage.includes("ไม่มีสิทธิ์") || toastMessage.includes("permission") ? (
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
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">{t("property_settings.title")}</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {t("property_settings.subtitle")}
          </p>
        </div>
        
        {/* Badge แจ้งเตือนสถานะฐานข้อมูล */}
        {isDatabaseBacked ? (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-extrabold text-teal-400 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" /> {t("property_settings.db_connected")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-extrabold text-amber-400 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> {t("property_settings.db_fallback")}
          </span>
        )}
      </div>

      {loading ? (
        <div className="w-full min-h-[400px] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          <p className="text-xs text-slate-400">{t("property_settings.loading")}</p>
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
                <Building className="w-5 h-5 text-teal-500" /> {t("property_settings.sec_common_late")}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("property_settings.common_fee_label")}</label>
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
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">{t("property_settings.unit_baht")}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("property_settings.late_penalty_label")}</label>
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
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">{t("property_settings.unit_baht_day")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* กล่อง 2: เงินประกันหอพักและเงินล่วงหน้า (Security Deposit) */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-900 pb-3">
                <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" /> {t("property_settings.sec_deposit")}
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
                    {t("property_settings.deposit_type_months")}
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
                    {t("property_settings.deposit_type_fixed")}
                  </button>
                </div>
              </div>

              {/* เงินประกันพื้นฐาน */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">
                    {depositType === "months" ? t("property_settings.deposit_amount_months") : t("property_settings.deposit_amount_fixed")}
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
                      {depositType === "months" ? t("property_settings.times_of_rent") : t("property_settings.unit_baht")}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("property_settings.advance_rent_label")}</label>
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
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">{t("property_settings.unit_months")}</span>
                  </div>
                </div>
              </div>

              {/* ตารางจัดกลุ่มเงินประกันแยกตามประเภทห้องพัก */}
              {roomTypes.length > 0 && (
                <div className="space-y-3.5 border-t border-slate-200 dark:border-slate-900/40 pt-4.5">
                  <label className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-emerald-500" /> {t("property_settings.room_type_deposit_label")}
                  </label>
                  
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-900">
                    <table className="w-full text-xs sm:text-sm text-left">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-400 font-bold border-b border-slate-200 dark:border-slate-900/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold">{t("property_settings.room_type_name_col")}</th>
                          <th className="px-4 py-3 font-semibold text-right">{t("property_settings.room_type_deposit_col")}</th>
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
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">{t("property_settings.currency_suffix_baht")}</span>
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
                  <Check className="w-4 h-4" /> {t("property_settings.legal_advice_title")}
                </div>
                <div className="text-[11px] sm:text-xs leading-relaxed text-slate-500 dark:text-slate-400 font-medium space-y-1">
                  <p dangerouslySetInnerHTML={{ __html: t("property_settings.legal_deposit_text") }} />
                  <p dangerouslySetInnerHTML={{ __html: t("property_settings.legal_advance_text") }} />
                </div>
                <p className="text-xs sm:text-sm text-slate-450 dark:text-slate-500 mt-1 leading-normal">
                  {t("property_settings.legal_subtext")}
                </p>
              </div>
            </div>

            {/* กล่องใหม่: การหักเงินประกันห้องพัก กรณีย้ายออกกลางเดือน */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <div className="border-b border-slate-200 dark:border-slate-900 pb-3">
                <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-500" /> {t("property_settings.sec_checkout")}
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-semibold leading-relaxed">
                  {t("property_settings.sec_checkout_subtitle")}
                </p>
              </div>

              {/* ปุ่มเลือกนโยบาย */}
              <div className="grid grid-cols-1 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    if (hasEditPermission) setCheckoutPolicy("DAILY_PRORATE")
                  }}
                  disabled={!hasEditPermission}
                  className={`flex flex-col text-left p-4.5 rounded-2xl border-2 transition-all duration-200 cursor-pointer relative overflow-hidden ${
                    checkoutPolicy === "DAILY_PRORATE"
                      ? "bg-indigo-500/[0.03] border-indigo-500 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "bg-transparent border-slate-150 dark:border-slate-850 text-slate-500 hover:border-slate-300 dark:hover:border-slate-850"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      checkoutPolicy === "DAILY_PRORATE" ? "border-indigo-500" : "border-slate-300 dark:border-slate-700"
                    }`}>
                      {checkoutPolicy === "DAILY_PRORATE" && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                    </div>
                    <span className="text-xs sm:text-sm font-black">{t("property_settings.checkout_policy_daily")}</span>
                  </div>
                  <span className="text-[11px] sm:text-xs leading-relaxed opacity-85 font-medium text-slate-500 dark:text-slate-400">
                    {t("property_settings.checkout_policy_daily_desc")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (hasEditPermission) setCheckoutPolicy("FULL_MONTH")
                  }}
                  disabled={!hasEditPermission}
                  className={`flex flex-col text-left p-4.5 rounded-2xl border-2 transition-all duration-200 cursor-pointer relative overflow-hidden ${
                    checkoutPolicy === "FULL_MONTH"
                      ? "bg-indigo-500/[0.03] border-indigo-500 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "bg-transparent border-slate-150 dark:border-slate-850 text-slate-500 hover:border-slate-300 dark:hover:border-slate-850"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      checkoutPolicy === "FULL_MONTH" ? "border-indigo-500" : "border-slate-300 dark:border-slate-700"
                    }`}>
                      {checkoutPolicy === "FULL_MONTH" && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                    </div>
                    <span className="text-xs sm:text-sm font-black">{t("property_settings.checkout_policy_full")}</span>
                  </div>
                  <span className="text-[11px] sm:text-xs leading-relaxed opacity-85 font-medium text-slate-500 dark:text-slate-400">
                    {t("property_settings.checkout_policy_full_desc")}
                  </span>
                </button>
              </div>

              {/* Interactive Real-time Preview */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-900/80 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-900 pb-2.5">
                  <div className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    {t("property_settings.preview_title")}
                  </div>
                  <span className="text-[10px] bg-slate-200 dark:bg-slate-850 px-2 py-0.5 rounded-md font-bold text-slate-500 dark:text-slate-400">
                    {t("property_settings.preview_mock_badge")}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-y-2 text-xs text-slate-500 dark:text-slate-400 font-bold">
                  <div>{t("property_settings.preview_base_rent")}</div>
                  <div className="text-right font-mono text-slate-700 dark:text-slate-300">3,000.00 {t("property_settings.preview_unit_baht")}</div>

                  <div>{t("property_settings.preview_deposit")}</div>
                  <div className="text-right font-mono text-slate-700 dark:text-slate-300">4,000.00 {t("property_settings.preview_unit_baht")}</div>

                  <div>{t("property_settings.preview_checkout_date")}</div>
                  <div className="text-right font-mono text-slate-700 dark:text-slate-300">{t("property_settings.preview_checkout_mid")}</div>

                  <div>{t("property_settings.preview_actual_proportion")}</div>
                  <div className="text-right font-mono text-slate-700 dark:text-slate-300">{t("property_settings.preview_days_occupied")}</div>

                  <div>{t("property_settings.preview_clean_fee")}</div>
                  <div className="text-right font-mono text-slate-700 dark:text-slate-300">500.00 {t("property_settings.preview_unit_baht")}</div>
                </div>

                {/* ผลลัพธ์การคำนวณตามนโยบาย */}
                <div className="pt-3.5 border-t border-slate-200 dark:border-slate-900 border-dashed space-y-3">
                  <div className="flex justify-between items-center text-xs font-black">
                    <span className="text-slate-600 dark:text-slate-400">{t("property_settings.preview_net_room_charge")}</span>
                    <span className="font-mono text-indigo-500 dark:text-indigo-400">
                      {checkoutPolicy === "DAILY_PRORATE" 
                        ? `1,500.00 ${t("property_settings.preview_unit_baht")} (3,000 / 30 * 15)` 
                        : `3,000.00 ${t("property_settings.preview_unit_baht")} (${t("property_settings.checkout_policy_full")})`}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs font-black">
                    <span className="text-slate-600 dark:text-slate-400">{t("property_settings.preview_total_deductions")}</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {checkoutPolicy === "DAILY_PRORATE" 
                        ? `2,000.00 ${t("property_settings.preview_unit_baht")} (1,500 + 500)` 
                        : `3,500.00 ${t("property_settings.preview_unit_baht")} (3,000 + 500)`}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs font-black border-t border-slate-200 dark:border-slate-900 pt-3">
                    <span className="text-slate-700 dark:text-slate-200 text-sm">{t("property_settings.preview_total_deductions")}</span>
                    <span className="font-mono text-rose-500 text-sm">
                      {checkoutPolicy === "DAILY_PRORATE" ? `2,000.00 ${t("property_settings.preview_unit_baht")}` : `3,500.00 ${t("property_settings.preview_unit_baht")}`}
                    </span>
                  </div>

                  {checkoutPolicy === "DAILY_PRORATE" ? (
                    <div className="p-3 bg-emerald-500/[0.05] border border-emerald-500/10 rounded-xl flex items-center justify-between">
                      <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">{t("property_settings.preview_net_refund")}</span>
                      <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">2,000.00 {t("property_settings.preview_unit_baht")}</span>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-500/[0.05] border border-emerald-500/10 rounded-xl flex items-center justify-between">
                      <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">{t("property_settings.preview_net_refund")}</span>
                      <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">500.00 {t("property_settings.preview_unit_baht")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* คอลัมน์ขวา: อัตราค่าสาธารณูปโภค */}
          <div className="flex flex-col gap-6">
            
            {/* กล่องโลโก้หอพัก (Property Logo) */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-5 shadow-xl">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <Image className="w-5 h-5 text-teal-500" /> {t("property_settings.logo_sec_title")}
              </h3>
              
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Logo Preview Container */}
                <div className="relative w-28 h-28 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950 border-2 border-dashed border-slate-200 dark:border-slate-800/80 flex items-center justify-center group shrink-0 shadow-inner">
                  {logoUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logoUrl} alt="Property Logo" className="w-full h-full object-contain p-2" />
                      {hasEditPermission && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            disabled={isUploadingLogo}
                            className="p-2 bg-rose-600 hover:bg-rose-500 rounded-full text-white transition-transform duration-200 hover:scale-110 cursor-pointer shadow-md"
                            title={t("property_settings.logo_remove_btn")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                      <Building className="w-8 h-8 text-slate-300 dark:text-slate-850" />
                      <span className="text-[10px] mt-1.5 text-slate-400 font-bold">{t("property_settings.logo_no_logo")}</span>
                    </div>
                  )}
                  {isUploadingLogo && (
                    <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Upload Action Description */}
                <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                  <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-black leading-normal">
                    {t("property_settings.logo_upload_title")}
                  </p>
                  <p className="text-[11px] leading-relaxed text-slate-450 dark:text-slate-500">
                    {t("property_settings.logo_upload_desc")}
                  </p>
                  
                  {hasEditPermission && (
                    <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-1.5">
                      <label className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 transition-all cursor-pointer shadow-sm active:scale-95 ${isUploadingLogo ? 'opacity-50 pointer-events-none' : ''}`}>
                        <UploadCloud className="w-4 h-4 text-teal-500" />
                        <span>{logoUrl ? t("property_settings.logo_change_btn") : t("property_settings.logo_upload_btn")}</span>
                        <input
                          type="file"
                          accept="image/jpeg, image/png, image/webp"
                          className="hidden"
                          onChange={handleLogoUpload}
                          disabled={isUploadingLogo}
                        />
                      </label>
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          disabled={isUploadingLogo}
                          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold rounded-xl border border-rose-500/20 transition-all cursor-pointer shadow-sm active:scale-95"
                        >
                          <Trash2 className="w-4 h-4" />
                          {t("property_settings.logo_remove_btn")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* กล่อง 3: อัตราค่าสาธารณูปโภค (ค่าน้ำประปาและค่าไฟฟ้า) */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <Sliders className="w-5 h-5 text-blue-400" /> {t("property_settings.util_sec_title")}
              </h3>

              {/* ค่าน้ำประปา */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">
                  <Droplet className="w-4.5 h-4.5 text-blue-400" /> {t("property_settings.util_water_title")}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("property_settings.util_rate_label")}</label>
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
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">{t("property_settings.unit_baht")}</span>
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
                      <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-bold">{t("property_settings.util_min_check")}</span>
                    </label>
                  </div>
                </div>

                {waterMinChecked && (
                  <div className="p-3.5 bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/10 rounded-xl space-y-2 animate-fade-in">
                    <label className="text-xs sm:text-sm text-slate-550 dark:text-slate-400 font-bold block">{t("property_settings.util_water_min_label")}</label>
                    <div className="relative max-w-[200px]">
                      <input
                        type="number"
                        required
                        min={1}
                        className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm transition-all"
                        value={waterMinUnit}
                        onChange={(e) => setWaterMinUnit(Number(e.target.value))}
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">{t("property_settings.currency_suffix_baht")}</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-450 mt-1">
                      {t("property_settings.util_water_min_desc")
                        .replace("{unit}", waterMinUnit.toString())
                        .replace("{cost}", (waterMinUnit * waterRate).toLocaleString())}
                    </p>
                  </div>
                )}
              </div>

              {/* ค่าไฟฟ้า */}
              <div className="space-y-4 border-t border-slate-200 dark:border-slate-900/40 pt-4">
                <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">
                  <Zap className="w-4.5 h-4.5 text-amber-400" /> {t("property_settings.util_electric_title")}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("property_settings.util_rate_label")}</label>
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
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">{t("property_settings.unit_baht")}</span>
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
                      <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-bold">{t("property_settings.util_min_check")}</span>
                    </label>
                  </div>
                </div>

                {electricMinChecked && (
                  <div className="p-3.5 bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/10 rounded-xl space-y-2 animate-fade-in">
                    <label className="text-xs sm:text-sm text-slate-550 dark:text-slate-400 font-bold block">{t("property_settings.util_electric_min_label")}</label>
                    <div className="relative max-w-[200px]">
                      <input
                        type="number"
                        required
                        min={1}
                        className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-800 dark:text-slate-200 font-mono text-sm transition-all"
                        value={electricMinUnit}
                        onChange={(e) => setElectricMinUnit(Number(e.target.value))}
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">{t("property_settings.currency_suffix_baht")}</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-450 mt-1">
                      {t("property_settings.util_electric_min_desc")
                        .replace("{unit}", electricMinUnit.toString())
                        .replace("{cost}", (electricMinUnit * electricRate).toLocaleString())}
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* กล่อง 4: ตั้งค่าสัญญาเช่าเริ่มต้น (Default Lease Settings) */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <FileText className="w-5 h-5 text-emerald-400" /> {t("property_settings.lease_sec_title")}
              </h3>

              {/* ระยะเวลาสัญญาเช่า */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">
                  <Clock className="w-4.5 h-4.5 text-teal-400" /> {t("property_settings.lease_duration_title")}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("property_settings.lease_duration_label")}</label>
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
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm text-slate-500 font-semibold">{t("property_settings.unit_months")}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-450 dark:text-slate-500 mt-1 leading-normal">
                    {t("property_settings.lease_duration_desc")}
                  </p>
                </div>
              </div>

              {/* รูปแบบการหมดสัญญา */}
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-900/40 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">
                    {t("property_settings.lease_expiry_label")}
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
                      {t("property_settings.lease_expiry_renew")}
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
                      {t("property_settings.lease_expiry_original")}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-teal-500/5 dark:bg-teal-950/20 border border-teal-500/10 rounded-xl space-y-2 animate-fade-in">
                  <h4 className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-bold">
                    {t("property_settings.lease_logic_title")}
                  </h4>
                  <ul className="list-disc list-inside text-xs sm:text-sm text-slate-500 space-y-1 leading-normal">
                    {leaseExpiryAction === "renew" ? (
                      <>
                        <li className="text-amber-500 font-medium dark:text-amber-400">
                          {t("property_settings.lease_logic_renew_warning")}
                        </li>
                        <li className="text-rose-550 font-medium dark:text-rose-400">
                          {t("property_settings.lease_logic_renew_over")}
                        </li>
                      </>
                    ) : (
                      <li className="text-emerald-500 font-medium dark:text-emerald-400">
                        {t("property_settings.lease_logic_original_completed")}
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            {/* กล่อง 5: ตั้งค่าระยะเวลาการเก็บไฟล์สลิปโอนเงิน (Slip Retention Settings) */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <Clock className="w-5 h-5 text-rose-500" /> {t("property_settings.retention_sec_title")}
              </h3>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">
                    {t("property_settings.retention_label")}
                  </label>
                  <select
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-rose-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base transition-all font-bold cursor-pointer"
                    value={slipRetentionMonths}
                    onChange={(e) => setSlipRetentionMonths(Number(e.target.value))}
                  >
                    <option value={1}>{t("property_settings.retention_1_month")}</option>
                    <option value={3}>{t("property_settings.retention_3_months")}</option>
                    <option value={6}>{t("property_settings.retention_6_months")}</option>
                    <option value={12}>{t("property_settings.retention_12_months")}</option>
                  </select>
                  <p className="text-xs sm:text-sm text-slate-450 dark:text-slate-500 mt-1 leading-normal">
                    {t("property_settings.retention_desc")}
                  </p>
                  <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-500 leading-normal">
                    {t("property_settings.retention_gdrive_prefix")}{" "}
                    <Link
                      href="/settings?tab=google_drive"
                      className="underline font-bold hover:text-amber-500 dark:hover:text-amber-400"
                    >
                      {t("property_settings.retention_gdrive_link")}
                    </Link>{" "}
                    {t("property_settings.retention_gdrive_suffix")}
                  </p>
                </div>

                <div className="p-3.5 bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/10 rounded-xl space-y-3 animate-fade-in">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <span className="text-xs sm:text-sm text-rose-700 dark:text-rose-400 font-bold">
                      {t("property_settings.retention_cleanup_title")}
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-xs sm:text-sm text-slate-500 space-y-1.5 leading-normal">
                    <li>
                      {t("property_settings.retention_cleanup_item1").replace("{months}", slipRetentionMonths.toString())}
                    </li>
                    <li>
                      {t("property_settings.retention_cleanup_item2")}
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
                        {t("property_settings.retention_cleaning")}
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4" />
                        {t("property_settings.retention_manual_btn")}
                      </>
                    )}
                  </button>
                </div>
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
                  {t("property_settings.saving_settings")}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" /> {t("property_settings.save_all_settings_btn")}
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
