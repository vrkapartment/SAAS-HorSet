"use client"

import { useState, useEffect } from "react"
import { Landmark, Save, ShieldCheck, Check, CreditCard, User, AlertTriangle, Loader2, AlertCircle } from "lucide-react"
import { getFinanceSettings, saveFinanceSettings, FinanceSettings } from "@/features/finance/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { getRoomTypes, updateRoomTypeDeposit, migrateRoomTypeDeposits } from "@/features/room/actions"
import { DEFAULT_STAFF_PERMISSIONS } from "@/features/permissions/types"
import { parseAddress, formatAddress } from "@/lib/thaiAddress"
import { useLanguage } from "@/lib/translations/LanguageProvider"

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

export default function FinanceSettingsTab() {
  const { t } = useLanguage()
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [taxId, setTaxId] = useState("")
  const [addressBuilding, setAddressBuilding] = useState("")
  const [addressRoom, setAddressRoom] = useState("")
  const [addressFloor, setAddressFloor] = useState("")
  const [addressVillage, setAddressVillage] = useState("")
  const [addressNo, setAddressNo] = useState("")
  const [addressMoo, setAddressMoo] = useState("")
  const [addressSoi, setAddressSoi] = useState("")
  const [addressYaek, setAddressYaek] = useState("")
  const [addressRoad, setAddressRoad] = useState("")
  const [addressSubdistrict, setAddressSubdistrict] = useState("")
  const [addressDistrict, setAddressDistrict] = useState("")
  const [addressProvince, setAddressProvince] = useState("")
  const [addressZipcode, setAddressZipcode] = useState("")
  const [phone, setPhone] = useState("")
  const [taxpayerStatus, setTaxpayerStatus] = useState<"individual" | "partnership">("individual")
  const [partnerCount, setPartnerCount] = useState<number>(1)

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
  const [toastIsError, setToastIsError] = useState(false)
  const [hasEditPermission, setHasEditPermission] = useState(true)

  // โหลดค่าเริ่มต้นจาก Database (ผูกตาม Workspace ID ปัจจุบัน)
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
            setHasEditPermission(!!userPerms.manage_finance_settings_edit)
          }

          const isSuperAdmin = profile.role === "super_admin"
          
          if (!isSuperAdmin && profile.workspace_id) {
            currentWsId = profile.workspace_id
          } else {
            const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
            currentWsId = cookieWsId || profile.workspace_id || undefined
          }
        }

        // หมายเหตุ: ห้ามเดา workspace อื่นมาใช้แทนเด็ดขาดถ้าหา currentWsId ของผู้ใช้เองไม่เจอ (เช่น super_admin
        // ที่ยังไม่เคยเลือก workspace ผ่านเมนูสลับ workspace) — เดิมโค้ดตรงนี้เคย query workspace แรกที่เจอมาใช้
        // แทนแล้ว cache ไว้ใน cookie ทำให้เห็นข้อมูลการเงินจริงของ workspace อื่นโดยไม่ได้ตั้งใจ ตอนนี้ถ้าหาไม่เจอ
        // จะแสดง error ให้เลือก workspace ก่อนแทน

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
            setAddressBuilding(cached.tax_address_building || "")
            setAddressRoom(cached.tax_address_room || "")
            setAddressFloor(cached.tax_address_floor || "")
            setAddressVillage(cached.tax_address_village || "")
            setAddressMoo(cached.tax_address_moo || "")
            setAddressSoi(cached.tax_address_soi || "")
            setAddressYaek(cached.tax_address_yaek || "")
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
            setTaxpayerStatus(cached.taxpayer_status || "individual")
            setPartnerCount(cached.partner_count !== undefined ? cached.partner_count : 1)
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
              setAddressBuilding(res.data.tax_address_building || "")
              setAddressRoom(res.data.tax_address_room || "")
              setAddressFloor(res.data.tax_address_floor || "")
              setAddressVillage(res.data.tax_address_village || "")
              setAddressMoo(res.data.tax_address_moo || "")
              setAddressSoi(res.data.tax_address_soi || "")
              setAddressYaek(res.data.tax_address_yaek || "")
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
              setTaxpayerStatus(res.data.taxpayer_status || "individual")
              setPartnerCount(res.data.partner_count !== undefined ? res.data.partner_count : 1)
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
          setErrorMsg(t("finance_settings_tab.err_no_workspace"))
        }
      } catch (err) {
        console.error("Failed to load settings:", err)
        setErrorMsg(t("finance_settings_tab.err_load_finance"))
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasEditPermission) {
      showToast(t("daily_bills.no_permission_msg"), true)
      return
    }

    // ล้างข้อมูลและตรวจเช็คเบื้องต้น
    const cleanedPPId = promptPayId.replace(/[^0-9]/g, "")
    if (promptPayType === "phone" && cleanedPPId.length !== 10) {
      alert(t("finance_settings_tab.err_promptpay_phone_digits"))
      return
    }
    if (promptPayType === "national_id" && cleanedPPId.length !== 13) {
      alert(t("finance_settings_tab.err_promptpay_id_digits"))
      return
    }

    if (taxId.replace(/[^0-9]/g, "").length !== 13) {
      alert(t("finance_settings_tab.err_tax_id_digits"))
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
        slip_retention_months: slipRetentionMonths,
        taxpayer_status: taxpayerStatus,
        partner_count: partnerCount,
        tax_address_building: addressBuilding,
        tax_address_room: addressRoom,
        tax_address_floor: addressFloor,
        tax_address_village: addressVillage,
        tax_address_moo: addressMoo,
        tax_address_soi: addressSoi,
        tax_address_yaek: addressYaek
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
        showToast(t("finance_settings_tab.save_success"))
      } else {
        setErrorMsg(res.error || t("finance_settings_tab.err_save_generic"))
      }
    } catch (err) {
      setErrorMsg(t("finance_settings_tab.err_server_connection"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const showToast = (msg: string, isError = false) => {
    setToastMessage(msg)
    setToastIsError(isError)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  return (
    <>
      {/* Toast แจ้งเตือน */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 glass-panel border border-teal-500/30 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up text-xs font-semibold">
          {toastIsError ? (
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 font-sans">{t("finance_settings_tab.header_title")}</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5">
            {t("finance_settings_tab.header_desc")}
          </p>
        </div>
        
        {/* Badge แจ้งเตือนสถานะฐานข้อมูล */}
        {isDatabaseBacked ? (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-bold text-teal-400 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" /> Cloud Database Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-bold text-amber-400 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Local Storage Fallback Mode
          </span>
        )}
      </div>

      {loading ? (
        <div className="w-full min-h-[400px] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          <p className="text-sm text-slate-400">{t("finance_settings_tab.loading_finance")}</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* คอลัมน์ซ้าย: ข้อมูลผู้ยื่นเสียภาษี และ ค่าปรับล่าช้า */}
          <div className="flex flex-col gap-6">
            
            {/* กล่อง 1: ข้อมูลผู้ยื่นเสียภาษีเงินได้บุคคลธรรมดา */}
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <User className="w-5 h-5 text-blue-400" /> {t("finance_settings_tab.taxpayer_info_title")}
              </h3>

              {errorMsg && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs sm:text-sm text-red-400 flex items-start gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.first_name_label")}</label>
                  <input
                    type="text"
                    required
                    placeholder={t("finance_settings_tab.first_name_placeholder")}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.last_name_label")}</label>
                  <input
                    type="text"
                    placeholder={t("finance_settings_tab.last_name_placeholder")}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.tax_id_label")}</label>
                <input
                  type="text"
                  required
                  maxLength={13}
                  placeholder="1100100222333"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base font-bold tracking-wide transition-all"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.taxpayer_status_label")}</label>
                  <select
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                    value={taxpayerStatus}
                    onChange={(e) => setTaxpayerStatus(e.target.value as "individual" | "partnership")}
                  >
                    <option value="individual">{t("finance_settings_tab.status_individual")}</option>
                    <option value="partnership">{t("finance_settings_tab.status_partnership")}</option>
                  </select>
                  <p className="text-[11px] text-slate-450 dark:text-slate-500">
                    {t("finance_settings_tab.taxpayer_status_hint")}
                  </p>
                </div>
                {taxpayerStatus === "partnership" && (
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.partner_count_label")}</label>
                    <input
                      type="number"
                      min={1}
                      placeholder={t("finance_settings_tab.partner_count_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={partnerCount}
                      onChange={(e) => setPartnerCount(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.contact_phone_label")}</label>
                  <input
                    type="text"
                    required
                    placeholder="089-999-9999"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* ฟอร์มกรอกที่อยู่แบบแยกประเภท */}
              <div className="space-y-4 border-t border-slate-200 dark:border-slate-900/40 pt-4">
                <label className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-extrabold block uppercase tracking-wide">{t("finance_settings_tab.address_title")}</label>

                <p className="text-[11px] text-slate-450 dark:text-slate-500 -mt-2">
                  {t("finance_settings_tab.address_hint")}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.building_label")}</label>
                    <input
                      type="text"
                      placeholder={t("finance_settings_tab.building_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressBuilding}
                      onChange={(e) => setAddressBuilding(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.room_no_label")}</label>
                    <input
                      type="text"
                      placeholder={t("finance_settings_tab.room_no_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressRoom}
                      onChange={(e) => setAddressRoom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.floor_label")}</label>
                    <input
                      type="text"
                      placeholder={t("finance_settings_tab.floor_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressFloor}
                      onChange={(e) => setAddressFloor(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.village_label")}</label>
                    <input
                      type="text"
                      placeholder={t("finance_settings_tab.village_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressVillage}
                      onChange={(e) => setAddressVillage(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.house_no_label")}</label>
                    <input
                      type="text"
                      required
                      placeholder={t("finance_settings_tab.house_no_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressNo}
                      onChange={(e) => setAddressNo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.moo_label")}</label>
                    <input
                      type="text"
                      placeholder={t("finance_settings_tab.moo_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressMoo}
                      onChange={(e) => setAddressMoo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.soi_label")}</label>
                    <input
                      type="text"
                      placeholder={t("finance_settings_tab.soi_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressSoi}
                      onChange={(e) => setAddressSoi(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.yaek_label")}</label>
                    <input
                      type="text"
                      placeholder={t("finance_settings_tab.yaek_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressYaek}
                      onChange={(e) => setAddressYaek(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.road_label")}</label>
                    <input
                      type="text"
                      placeholder={t("finance_settings_tab.road_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressRoad}
                      onChange={(e) => setAddressRoad(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.subdistrict_label")}</label>
                    <input
                      type="text"
                      required
                      placeholder={t("finance_settings_tab.subdistrict_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressSubdistrict}
                      onChange={(e) => setAddressSubdistrict(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.district_label")}</label>
                    <input
                      type="text"
                      required
                      placeholder={t("finance_settings_tab.district_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressDistrict}
                      onChange={(e) => setAddressDistrict(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.province_label")}</label>
                    <input
                      type="text"
                      required
                      placeholder={t("finance_settings_tab.province_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                      value={addressProvince}
                      onChange={(e) => setAddressProvince(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.zipcode_label")}</label>
                    <input
                      type="text"
                      required
                      maxLength={5}
                      placeholder={t("finance_settings_tab.zipcode_placeholder")}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base font-bold tracking-wide transition-all"
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
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-6 shadow-xl">
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-200 dark:border-slate-900 pb-3">
                <CreditCard className="w-5 h-5 text-teal-400" /> {t("finance_settings_tab.promptpay_setup_title")}
              </h3>

              <div className="space-y-2.5">
                <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.promptpay_type_label")}</label>
                <div className="grid grid-cols-2 gap-3.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPromptPayType("phone")
                      if (promptPayId === "1100100222333") setPromptPayId("0899999999")
                    }}
                    className={`py-3 px-4 text-xs sm:text-sm font-bold rounded-xl transition-all border cursor-pointer ${
                      promptPayType === "phone"
                        ? "bg-teal-600/10 border-teal-500 text-teal-400"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700"
                    }`}
                  >
                    {t("finance_settings_tab.promptpay_type_phone")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPromptPayType("national_id")
                      if (promptPayId === "0899999999") setPromptPayId("1100100222333")
                    }}
                    className={`py-3 px-4 text-xs sm:text-sm font-bold rounded-xl transition-all border cursor-pointer ${
                      promptPayType === "national_id"
                        ? "bg-teal-600/10 border-teal-500 text-teal-400"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700"
                    }`}
                  >
                    {t("finance_settings_tab.promptpay_type_national_id")}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm text-slate-400 font-bold block">
                  {promptPayType === "phone" ? t("finance_settings_tab.promptpay_phone_label") : t("finance_settings_tab.promptpay_id_label")}
                </label>
                <input
                  type="text"
                  required
                  placeholder={promptPayType === "phone" ? "0899999999" : "1100100222333"}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 font-mono text-sm sm:text-base font-bold tracking-wide transition-all"
                  value={promptPayId}
                  onChange={(e) => setPromptPayId(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm text-slate-400 font-bold block">{t("finance_settings_tab.promptpay_account_name_label")}</label>
                <input
                  type="text"
                  required
                  placeholder={t("finance_settings_tab.promptpay_account_name_placeholder")}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 text-sm sm:text-base font-bold transition-all"
                  value={promptPayName}
                  onChange={(e) => setPromptPayName(e.target.value)}
                />
              </div>

              <div className="p-4 bg-teal-500/5 border border-teal-500/10 rounded-xl flex items-start gap-3">
                <ShieldCheck className="w-5.5 h-5.5 text-teal-400 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  <span className="font-bold text-slate-700 dark:text-slate-300">{t("finance_settings_tab.scan_note_prefix")}</span> {t("finance_settings_tab.scan_note_desc")}
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !hasEditPermission}
              className={`w-full glow-btn text-white font-extrabold py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base shadow-lg transition-all ${
                !hasEditPermission 
                  ? "bg-slate-300 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50 shadow-none" 
                  : "bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 shadow-blue-600/15 cursor-pointer"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                  {t("finance_settings_tab.saving_to_db_btn")}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" /> {t("finance_settings_tab.save_finance_settings_btn")}
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </>
  )
}
