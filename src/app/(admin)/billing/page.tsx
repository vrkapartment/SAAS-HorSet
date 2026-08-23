"use client"

import { useState, useEffect, useMemo, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { createClient } from "@/lib/supabase/client"
import {
  Receipt,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  Plus,
  Send,
  X,
  CreditCard,
  UserCheck,
  Download,
  Gauge,
  Save,
  Sparkles,
  RefreshCw,
  Zap,
  Droplet,
  Home,
  ShieldAlert,
  Settings
} from "lucide-react"
import { createBill, updateBillStatus, getBillingPageData, saveAllBillsForCycle, type BulkBillItem } from "@/features/billing/actions"
import { buildInvoiceId } from "@/features/billing/utils"
import { getRooms } from "@/features/room/actions"
import { saveMeterRecord } from "@/features/meter/actions"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { getFinanceSettings, saveMeterEntryModeAction } from "@/features/finance/actions"
import { getRoomFloor, sortFloors, asRoomId, findDuplicateRoomNumbers, formatRoomLabel, type RoomId } from "@/features/room/utils"
import { getBuildings } from "@/features/building/actions"
import { getBuildingUtilityBillsForWorkspaceCycle, type BuildingUtilityBill } from "@/features/billing/building-utility-actions"

import { type StaffPermissions, DEFAULT_STAFF_PERMISSIONS, ADMIN_DEFAULT_PERMISSIONS } from "@/features/permissions/types"
import { useLanguage } from "@/lib/translations/LanguageProvider"

// Extracted Billing Sub-components
import BillingSummaryStats from "@/features/billing/components/BillingSummaryStats"
import SavingProgressOverlay from "@/features/billing/components/SavingProgressOverlay"
import SlipVerificationModal from "@/features/billing/components/SlipVerificationModal"
import CreateBillModal from "@/features/billing/components/CreateBillModal"
import MeterReadingTable from "@/features/billing/components/MeterReadingTable"
import BuildingUtilityBillPanel from "@/features/billing/components/BuildingUtilityBillPanel"



interface UnifiedRoomBillingItem {
  /**
   * ตัวระบุห้องที่แท้จริง (rooms.id) — ใช้จับคู่/เป็น key ทุกที่
   * roomNumber ด้านล่างเป็น "ข้อความที่แสดง" เท่านั้น ห้ามใช้เป็น key เพราะซ้ำกันได้ข้ามอาคาร
   */
  roomId: RoomId
  roomNumber: string
  tenantName: string | null
  baseRent: number
  status: "occupied" | "available"
  buildingId?: string | null
  
  // Meter Record fields for current cycle
  meterRecordId?: string
  elecPrev: string | number
  elecCurr: string | number
  waterPrev: string | number
  waterCurr: string | number
  isMeterSaved: boolean
  isElecPrevEditable: boolean
  isWaterPrevEditable: boolean
  
  // Bill fields for current cycle
  billId?: string
  billAmount: number
  billStatus: "unpaid" | "pending" | "paid" | "not_created"
  slipUrl: string | null
  electricUnits: number
  waterUnits: number
  penaltyAmount?: number
  lateDays?: number
  otherServiceAmount?: number

  isEdited?: boolean
  waiveElectricMin?: boolean
  waiveWaterMin?: boolean
  invoiceId?: string
  hasNotifiedCheckout?: boolean
  vatAmount?: number
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

function formatBillingCycle(cycleStr: string, locale: string = "th"): string {
  if (!cycleStr) return ""
  if (cycleStr.includes("-")) {
    const [year, month] = cycleStr.split("-")
    const monthIdx = parseInt(month, 10) - 1
    if (monthIdx >= 0 && monthIdx < 12) {
      if (locale === "en") {
        const monthsEng = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"
        ]
        return `${monthsEng[monthIdx]} ${year}`
      } else {
        const monthsThai = [
          "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
          "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
        ]
        return `${monthsThai[monthIdx]} ${year}`
      }
    }
  }
  return cycleStr
}

function getCurrentBillingCycle(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function getCycleFromTimestamp(timestampStr: string): string {
  try {
    const d = new Date(timestampStr)
    if (isNaN(d.getTime())) return ""
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    return `${y}-${m}`
  } catch {
    return ""
  }
}

function getBillingCycleOptions(t: any, locale: string = "th", registrationCycle?: string): { value: string; label: string }[] {
  const options = []
  const d = new Date()
  // เจนรอบบิลล่วงหน้า 1 เดือน, เดือนปัจจุบัน และย้อนหลัง 11 เดือน (รวม 13 ตัวเลือก)
  for (let i = -1; i < 12; i++) {
    const targetDate = new Date(d.getFullYear(), d.getMonth() - i, 1)
    const y = targetDate.getFullYear()
    const m = String(targetDate.getMonth() + 1).padStart(2, "0")
    const val = `${y}-${m}`
    
    // กรองไม่ให้แสดงรอบบิลก่อนเดือนที่สมัครใช้งาน
    if (registrationCycle && val < registrationCycle) {
      continue
    }

    options.push({
      value: val,
      label: t("billing.select_cycle_option").replace("{cycle}", formatBillingCycle(val, locale))
    })
  }
  return options
}

function UnifiedBillingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const verifyBillId = searchParams.get("verify_bill_id")
  const paramMonth = searchParams.get("month")
  const paramYear = searchParams.get("year")
  const targetCycle = searchParams.get("cycle") || (paramYear && paramMonth ? `${paramYear}-${paramMonth}` : null)

  const { t, locale } = useLanguage()
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [userPermissions, setUserPermissions] = useState<StaffPermissions>(ADMIN_DEFAULT_PERMISSIONS)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === "dark" : true

  const [billingCycle, setBillingCycle] = useState(getCurrentBillingCycle)
  const [pageActiveTab, setPageActiveTab] = useState<"meters" | "summary">("meters")
  const [registrationCycle, setRegistrationCycle] = useState<string>("")

  useEffect(() => {
    // หากมี targetCycle จาก URL อยู่แล้ว ให้ข้ามการโหลดจาก sessionStorage เพื่อให้เกียรติ URL
    if (targetCycle) {
      // ตรวจสอบความถูกต้องว่า targetCycle ต่ำกว่าเดือนที่ลงทะเบียนหรือไม่ หากต่ำกว่า ให้ดีดกลับมาลงทะเบียน
      if (registrationCycle && targetCycle < registrationCycle) {
        setBillingCycle(registrationCycle)
        const parts = registrationCycle.split('-')
        const params = new URLSearchParams(window.location.search)
        params.set("cycle", registrationCycle)
        if (parts.length === 2) {
          params.set("year", parts[0])
          params.set("month", parts[1])
        }
        router.replace(`?${params.toString()}`, { scroll: false })
      }
      return
    }

    if (typeof window !== "undefined") {
      const cachedMonth = sessionStorage.getItem("dashboard_month")
      const cachedYear = sessionStorage.getItem("dashboard_year")
      
      if (cachedMonth && cachedYear) {
        const cachedCycle = `${cachedYear}-${cachedMonth}`
        if (!registrationCycle || cachedCycle >= registrationCycle) {
          // ห้าม sync ค่านี้กลับลง URL (ห้าม router.replace ใส่ ?cycle=) เพราะถ้าใส่ไว้ การกด reload ครั้งถัดไป
          // จะโหลด URL เดิมที่มี ?cycle= ค้างอยู่ ทำให้ targetCycle ด้านบนเป็นจริงเสมอ ข้าม sessionStorage/
          // เดือนปัจจุบันไปตลอดกาล กลายเป็นค้างเดือนเก่าไม่มีวันรีเซ็ต
          setBillingCycle(cachedCycle)
          return
        }
      }
    }

    // ปรับรอบบิลตามเดือนปฏิทินปัจจุบันเมื่อเรนเดอร์ฝั่ง Client สำเร็จเพื่อความไหลลื่นและป้องกัน Hydration Mismatch
    const current = getCurrentBillingCycle()
    if (registrationCycle && current < registrationCycle) {
      setBillingCycle(registrationCycle)
    } else {
      setBillingCycle(current)
    }
  }, [registrationCycle, targetCycle, router])

  useEffect(() => {
    if (registrationCycle && billingCycle < registrationCycle) {
      setBillingCycle(registrationCycle)
    }
  }, [registrationCycle, billingCycle])
  const [unifiedItems, setUnifiedItems] = useState<UnifiedRoomBillingItem[]>([])
  const [roomsList, setRoomsList] = useState<any[]>([])
  const [usageAverages, setUsageAverages] = useState<Record<string, { avgElec: number; avgWater: number; sampleCount: number }>>({})
  const [loading, setLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)
  const [downloadingAllPdf, setDownloadingAllPdf] = useState(false)
  const [commonFee, setCommonFee] = useState<number>(50)
  const [elecRate, setElecRate] = useState<number>(7)
  const [waterRate, setWaterRate] = useState<number>(18)
  // VAT — ดูฟีเจอร์ VAT ใน src/features/tax/ (คิดเพิ่มจากยอดบิลเดิม ไม่ถอดจากยอดเดิม)
  const [vatRegistered, setVatRegistered] = useState(false)
  const [vatRegisteredFrom, setVatRegisteredFrom] = useState<string | null>(null)
  const [vatRate, setVatRate] = useState(0.07)
  const [electricBillingMode, setElectricBillingMode] = useState<"fixed_rate" | "building_total">("fixed_rate")
  const [waterBillingMode, setWaterBillingMode] = useState<"fixed_rate" | "building_total">("fixed_rate")
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([])
  const [buildingFilter, setBuildingFilter] = useState<string>("all")
  // รูปแบบการจดมิเตอร์ — 2 มิติอิสระต่อกัน จำค่าไว้ต่อ workspace (ดู database_patch_add_meter_entry_mode.sql)
  // "จดอะไร": electric/water = จดทีละสาธารณูปโภคทั้งหอ (เดิม) | both = จดไฟและน้ำพร้อมกันในแถวเดียว
  // "ชั้น": "all" = ทุกชั้น หรือชื่อชั้น — มีผลเฉพาะแท็บจดเลขมิเตอร์ ไม่กระทบแท็บสรุปบิล
  const [meterEntryUtility, setMeterEntryUtility] = useState<"electric" | "water" | "both">("electric")
  const [meterEntryFloor, setMeterEntryFloor] = useState<string>("all")
  const [meterEntrySettingsOpen, setMeterEntrySettingsOpen] = useState(false)
  const [buildingUtilityBills, setBuildingUtilityBills] = useState<BuildingUtilityBill[]>([])
  const [waterMinChecked, setWaterMinChecked] = useState<boolean>(true)
  const [waterMinUnit, setWaterMinUnit] = useState<number>(3)
  const [electricMinChecked, setElectricMinChecked] = useState<boolean>(true)
  const [electricMinUnit, setElectricMinUnit] = useState<number>(10)
  const [promptPayId, setPromptPayId] = useState<string>("0899999999")
  const [promptPayName, setPromptPayName] = useState<string>("สมเจตน์ แสนสุข")
  const [workspaceName, setWorkspaceName] = useState<string>("")
  const [workspaceAddress, setWorkspaceAddress] = useState<string>("")
  const [workspacePhone, setWorkspacePhone] = useState<string>("")
  const [workspaceTaxId, setWorkspaceTaxId] = useState<string>("")
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>("")
  const [latePenaltyRate, setLatePenaltyRate] = useState<number>(0)
  const [meterReplacements, setMeterReplacements] = useState<any[]>([])
  
  const [selectedBill, setSelectedBill] = useState<any | null>(null)
  const [slipModalOpen, setSlipModalOpen] = useState(false)
  const [createBillModalOpen, setCreateBillModalOpen] = useState(false)

  // ซิงค์รอบบิลตาม Query Parameter cycle อัตโนมัติ โดยระวังไม่ให้ต่ำกว่า registrationCycle เพื่อป้องกัน infinite loop ของการอัปเดต State
  useEffect(() => {
    if (targetCycle && targetCycle !== billingCycle) {
      if (registrationCycle && targetCycle < registrationCycle) {
        setBillingCycle(registrationCycle)
        const parts = registrationCycle.split('-')
        const params = new URLSearchParams(window.location.search)
        params.set("cycle", registrationCycle)
        if (parts.length === 2) {
          params.set("year", parts[0])
          params.set("month", parts[1])
        }
        router.replace(`?${params.toString()}`, { scroll: false })
      } else {
        setBillingCycle(targetCycle)
      }
    }
  }, [targetCycle, billingCycle, registrationCycle, router])

  // เคลียร์/เปิดโมดอลสลิปตาม Query Parameter verify_bill_id อัตโนมัติ
  useEffect(() => {
    if (verifyBillId && unifiedItems.length > 0 && !loading) {
      const targetItem = unifiedItems.find(item => item.billId === verifyBillId)
      if (targetItem) {
        setSelectedBill(targetItem)
        setSlipModalOpen(true)
      } else {
        console.warn(`[Deep-Link] ไม่พบบิลที่มีรหัส ${verifyBillId} ในรอบบิล ${billingCycle}`)
      }
    }
  }, [verifyBillId, unifiedItems, loading, billingCycle])

  // ข้อมูลสำหรับโมดอลสร้างบิลด้วยมือ (กรณีฉุกเฉิน)
  // เก็บ rooms.id ของห้องที่เลือกในโมดอลออกบิลเอง (ว่างไว้ก่อน แล้วตั้งค่าเมื่อโหลดรายการห้องเสร็จ)
  const [newRoomId, setNewRoomId] = useState("")
  const [elecUnitsManual, setElecUnitsManual] = useState(80)
  const [waterUnitsManual, setWaterUnitsManual] = useState(10)
  const [otherServiceAmountManual, setOtherServiceAmountManual] = useState(0)

  const [savingAll, setSavingAll] = useState(false)
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({})
  const [savingProgress, setSavingProgress] = useState({ current: 0, total: 0, currentRoom: "" })

  const selectedManualRoom = roomsList.find(r => r.id === newRoomId)
  const rentPrice = selectedManualRoom?.baseRent || 4500
  const isElecWaived = selectedManualRoom?.waiveElectricMin ?? false
  const isWaterWaived = selectedManualRoom?.waiveWaterMin ?? false

  // Resolve อัตราไฟฟ้า/น้ำที่จะใช้ "จริง" ตอนกดบันทึก — ถ้าเปิดโหมดหารตามสัดส่วนทั้งอาคาร ต้องใช้
  // rate_per_unit ที่กรอกไว้ของอาคารห้องนั้น ไม่ใช่อัตราคงที่ (elecRate/waterRate) เหมือนก่อนหน้านี้
  // เพื่อให้พรีวิวในหน้านี้ตรงกับยอดที่ createBill() จะคำนวณจริงฝั่ง server (ดู resolveUtilityRate ใน billing/actions.ts)
  const resolveManualRate = (
    mode: "fixed_rate" | "building_total",
    flatRate: number,
    utilityType: "electric" | "water"
  ): { rate: number; missing: boolean } => {
    if (mode !== "building_total") return { rate: flatRate, missing: false }
    const buildingId = selectedManualRoom?.buildingId
    if (!buildingId) return { rate: 0, missing: true }
    const row = buildingUtilityBills.find(b => b.buildingId === buildingId && b.utilityType === utilityType)
    if (!row) return { rate: 0, missing: true }
    return { rate: row.ratePerUnit, missing: false }
  }

  const electricRateResolved = resolveManualRate(electricBillingMode, elecRate, "electric")
  const waterRateResolved = resolveManualRate(waterBillingMode, waterRate, "water")
  const manualBillRateMissing = electricRateResolved.missing || waterRateResolved.missing

  const computedElecCost = !isElecWaived && electricMinChecked && elecUnitsManual <= electricMinUnit
    ? electricMinUnit * electricRateResolved.rate
    : elecUnitsManual * electricRateResolved.rate
  const computedWaterCost = !isWaterWaived && waterMinChecked && waterUnitsManual <= waterMinUnit
    ? waterMinUnit * waterRateResolved.rate
    : waterUnitsManual * waterRateResolved.rate

  const selectedManualRoomExtraExpensesSum = selectedManualRoom?.extraExpenses?.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

  // VAT บวกเพิ่มจากยอดเดิม เฉพาะเมื่อ workspace จด VAT แล้วและถึงเดือนที่มีผล (ไม่ถอดจากยอดเดิม)
  const isVatChargingForCycle = (cycle: string) =>
    vatRegistered && (!vatRegisteredFrom || cycle >= vatRegisteredFrom.slice(0, 7))
  const manualVatApplies = isVatChargingForCycle(billingCycle)
  const manualVatableBase = computedElecCost + computedWaterCost + commonFee + otherServiceAmountManual + selectedManualRoomExtraExpensesSum
  const computedVatAmount = manualVatApplies ? Math.round(manualVatableBase * vatRate * 100) / 100 : 0
  const computedTotal = rentPrice + computedElecCost + computedWaterCost + commonFee + otherServiceAmountManual + selectedManualRoomExtraExpensesSum + computedVatAmount

  const getPreviousCycle = (cycle: string) => {
    const [year, month] = cycle.split("-").map(Number)
    if (month === 1) {
      return `${year - 1}-12`
    } else {
      const prevMonth = month - 1
      return `${year}-${prevMonth.toString().padStart(2, "0")}`
    }
  }

  const getFallbackPrevReadings = (roomId: RoomId, cycle: string) => {
    return {
      elecPrev: 0,
      waterPrev: 0
    }
  }

  const calculateLateDays = (cycleStr: string): number => {
    if (!cycleStr || !cycleStr.includes("-")) return 0
    const [yearStr, monthStr] = cycleStr.split("-")
    const year = parseInt(yearStr, 10)
    const dueMonth = parseInt(monthStr, 10) // e.g. "06" -> 6 (July in 0-indexed Date)

    // Construct due date elements wrapping safely
    const tempDueDate = new Date(Date.UTC(year, dueMonth, 5))
    const dueYearWrapped = tempDueDate.getUTCFullYear()
    const dueMonthWrapped = tempDueDate.getUTCMonth()
    const dueDateWrapped = tempDueDate.getUTCDate()

    // 23:59:59.999 in Bangkok (UTC+7) is 16:59:59.999 UTC
    const dueTimeUTC = Date.UTC(dueYearWrapped, dueMonthWrapped, dueDateWrapped, 16, 59, 59, 999)
    const now = new Date()

    if (now.getTime() <= dueTimeUTC) return 0

    // Calculate local calendar day difference in Bangkok (UTC+7)
    const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
    const nowYear = bangkokNow.getUTCFullYear()
    const nowMonth = bangkokNow.getUTCMonth()
    const nowDate = bangkokNow.getUTCDate()

    const dueMidnightUTC = Date.UTC(dueYearWrapped, dueMonthWrapped, dueDateWrapped)
    const nowMidnightUTC = Date.UTC(nowYear, nowMonth, nowDate)

    const diffTime = nowMidnightUTC - dueMidnightUTC
    if (diffTime <= 0) return 0

    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }

  const isTenantActiveInCycle = (leaseStart: string | null | undefined, leaseEnd: string | null | undefined, cycle: string, isLatest = true): boolean => {
    if (!leaseStart) return false
    
    const [cYear, cMonth] = cycle.split("-").map(Number)
    const cycleStart = new Date(cYear, cMonth - 1, 1)
    const cycleEnd = new Date(cYear, cMonth, 0, 23, 59, 59, 999) // วันสุดท้ายของเดือนรอบบิล
    
    const start = new Date(leaseStart)
    start.setHours(0, 0, 0, 0)
    
    if (start > cycleEnd) return false // เริ่มสัญญาหลังสิ้นสุดเดือนรอบบิลนี้
    
    if (leaseEnd && !isLatest) {
      const end = new Date(leaseEnd)
      end.setHours(23, 59, 59, 999)
      if (end < cycleStart) return false // สัญญาสิ้นสุดลงก่อนเริ่มเดือนรอบบิลนี้
    }
    
    return true
  }

  // นับ loadData ที่กำลังทำงานอยู่ "ทุกรอบ" (รวม silent) — ใช้กัน refresh เบื้องหลังยิงซ้อนกันเอง
  const loadDataInFlightCountRef = useRef(0)
  // นับเฉพาะรอบที่โชว์ spinner — แยกจากตัวบนเพื่อไม่ให้ silent refresh ที่ค้างอยู่ไปกดให้ spinner ค้างไม่ยอมปิด
  const visibleLoadInFlightRef = useRef(0)
  // เวลาที่ระงับ refresh เบื้องหลังถึง (epoch ms) — ตั้งตอนที่เราเขียนข้อมูลเอง เพราะ realtime จะ echo
  // event กลับมาเป็นชุด ซึ่ง optimistic update จัดการ state/cache ครบแล้ว ไม่ต้อง refetch ทับ
  const suppressRefreshUntilRef = useRef(0)

  // หมายเหตุ: ถูกเรียกจาก handleSaveRow / handleSaveAll (async event handler) เท่านั้น
  // ไม่เคยถูกเรียกตอน render — ถ้าจะย้ายไปเรียกที่อื่น ต้องเช็คข้อนี้ก่อน (กฎ react-hooks/purity
  // พิสูจน์เองไม่ได้ และบางครั้งจะเตือน Date.now() บรรทัดล่างขึ้นมาแบบไม่คงเส้นคงวา)
  const suppressBackgroundRefresh = (ms = 5000) => {
    suppressRefreshUntilRef.current = Date.now() + ms
  }

  // ลำดับการเรียก loadData — ใช้ทิ้งผลลัพธ์ของรอบเก่าที่โหลดช้ากว่า ไม่ให้มาทับรอบใหม่ที่เสร็จก่อน
  // (เช่น silent refresh ของเดือนเดิมยังค้างอยู่ แล้วผู้ใช้สลับเดือน — คำตอบเดือนเดิมต้องถูกทิ้ง)
  const loadDataSeqRef = useRef(0)

  const loadData = async (cycle = billingCycle, forceRefresh = false, silent = false) => {
    const seq = ++loadDataSeqRef.current
    if (!silent) {
      setLoading(true)
      visibleLoadInFlightRef.current++
    }
    loadDataInFlightCountRef.current++

    try {
      // 0. ดึงและแคชข้อมูลโปรไฟล์ผู้ใช้เพื่อระบุ Workspace ปัจจุบันแบบไร้รอยต่อ
      // refresh เบื้องหลัง (silent) ไม่ต้องดึงโปรไฟล์ใหม่ — role/permissions/workspace ไม่เปลี่ยนกลางเซสชัน
      // เดิมดึงซ้ำทุกรอบ ซึ่งเป็น 3 query เรียงกัน (auth.getUser + profiles + workspaces) ต่อ 1 event
      let userProfile = getCachedData("global", "profile")
      if (!userProfile || (forceRefresh && !silent)) {
        const userRes = await getCurrentUserProfileAction()
        if (userRes.success && userRes.data) {
          userProfile = userRes.data
          setCachedData("global", "profile", userRes.data)
        }
      }

      // ถ้ามีการเรียก loadData รอบใหม่กว่าเริ่มไปแล้วระหว่างที่รอข้อมูลโปรไฟล์ ให้ทิ้งผลลัพธ์รอบนี้ทั้งหมด
      if (loadDataSeqRef.current !== seq) return

      let wsId = ""
      let regCycleVal = ""
      if (userProfile) {
        setCurrentUserRole(userProfile.role || "staff")
        
        let rawPerms = userProfile.permissions
        if (typeof rawPerms === "string") {
          try {
            rawPerms = JSON.parse(rawPerms)
          } catch {
            rawPerms = null
          }
        }

        if (userProfile.role === "admin" || userProfile.role === "super_admin") {
          setUserPermissions(ADMIN_DEFAULT_PERMISSIONS)
        } else {
          const activePerms = rawPerms || DEFAULT_STAFF_PERMISSIONS
          setUserPermissions({
            ...DEFAULT_STAFF_PERMISSIONS,
            ...activePerms
          })
        }

        const workspaceDate = userProfile.workspace_created_at || userProfile.created_at
        if (workspaceDate) {
          regCycleVal = getCycleFromTimestamp(workspaceDate)
          setRegistrationCycle(regCycleVal)
        }
        const isSuperAdmin = userProfile.role === "super_admin"
        if (!isSuperAdmin && userProfile.workspace_id) {
          wsId = userProfile.workspace_id
        } else {
          const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
          wsId = cookieWsId || userProfile.workspace_id || ""
        }
        setCurrentWorkspaceId(wsId)
      }

      // ถ้าเป็นการ Force Refresh ที่ผู้ใช้สั่งเอง (กดอัปเดต / เปลี่ยนมิเตอร์) ให้ล้างแคชเก่าออกทั้งก้อน
      // แต่ refresh เบื้องหลัง (silent) ห้ามล้าง — ข้อมูลที่เปลี่ยนคือบิล/มิเตอร์ของรอบนี้ ซึ่งถูกดึงสด
      // ทุกครั้งที่ forceRefresh อยู่แล้วด้านล่าง (ดู `!dbBills || forceRefresh`) ส่วน rooms/finance_settings
      // ไม่เปลี่ยนตอนจดมิเตอร์ ถ้าล้างทุก event จะถูกดึงซ้ำฟรี ๆ ทุกรอบ พร้อม join tenants/room_types ก้อนใหญ่
      if (forceRefresh && wsId && !silent) {
        clearWorkspaceCache(wsId)
      }

      // refresh เบื้องหลังยอมใช้ rooms/finance_settings ที่แคชไว้ได้ แต่จำกัดอายุสั้นกว่า TTL ปกติ (5 นาที)
      // เพื่อให้การเปลี่ยนผู้เช่า/อัตราค่าน้ำไฟจากเครื่องอื่นยังตามมาทันในระดับนาทีเหมือนเดิม
      const sharedCacheTtl = silent ? 60000 : undefined

      // ดึงข้อมูลทั้งหมดในคราวเดียวผ่าน Server Action แบบขนาน (หรือใช้ Cache ท้องถิ่นถ้ามีครบและไม่ใช่การ Force Refresh)
      let rooms = wsId ? getCachedData(wsId, "rooms", sharedCacheTtl) : null
      const prevCycle = getPreviousCycle(cycle)
      let dbBills = wsId ? getCachedData(wsId, `bills_${cycle}`) : null
      let dbMeters = wsId ? getCachedData(wsId, `meters_${cycle}`) : null
      let dbReplacements = wsId ? getCachedData(wsId, `replacements_${cycle}`) : null
      let dbPrevMeters = wsId ? getCachedData(wsId, `meters_${prevCycle}`) : null
      let financeData = wsId ? getCachedData(wsId, "finance_settings", sharedCacheTtl) : null
      let usageAveragesData = wsId ? getCachedData(wsId, `usage_avg_${cycle}`) : null

      const needsFetch = forceRefresh || !rooms || !dbBills || !dbMeters || !dbReplacements || !dbPrevMeters || !financeData || !usageAveragesData

      // rooms/finance_settings ที่ส่งเข้าไปเป็นค่าจากแคช เซิร์ฟเวอร์จะส่งกลับมาเหมือนเดิมโดยไม่ query ใหม่
      // จึงต้องจำไว้ว่าค่านี้มาจากแคช ห้ามเอาไป setCachedData ซ้ำ ไม่เช่นนั้น timestamp จะถูกรีเซ็ตทุกรอบ
      // แล้ว TTL จะไม่มีวันหมดอายุ = ข้อมูลห้อง/ค่าน้ำไฟค้างเก่าถาวรตราบใดที่ยังมี refresh เบื้องหลังวิ่งอยู่
      const roomsFromCache = !!rooms
      const financeFromCache = !!financeData

      if (needsFetch) {
        // ส่งข้อมูลที่ cache ไว้แล้ว (rooms/finance_settings ไม่เปลี่ยนตามเดือน) เพื่อไม่ให้ Server Action fetch ซ้ำตอนสลับเดือน
        const unifiedRes = await getBillingPageData(cycle, prevCycle, wsId || "", {
          rooms: rooms || undefined,
          financeSettings: financeData || undefined
        })
        if (unifiedRes.success && unifiedRes.data) {
          const fetched = unifiedRes.data

          if (!roomsFromCache) {
            rooms = fetched.rooms
            if (wsId) setCachedData(wsId, "rooms", rooms)
          }
          if (!dbBills || forceRefresh) {
            dbBills = fetched.bills
            if (wsId) setCachedData(wsId, `bills_${cycle}`, dbBills)
          }
          if (!dbMeters || forceRefresh) {
            dbMeters = fetched.meters
            if (wsId) setCachedData(wsId, `meters_${cycle}`, dbMeters)
          }
          if (!dbReplacements || forceRefresh) {
            dbReplacements = fetched.replacements
            if (wsId) setCachedData(wsId, `replacements_${cycle}`, dbReplacements)
          }
          if (!dbPrevMeters || forceRefresh) {
            dbPrevMeters = fetched.prevMeters
            if (wsId) setCachedData(wsId, `meters_${prevCycle}`, dbPrevMeters)
          }
          if (!financeFromCache) {
            financeData = fetched.financeSettings
            if (wsId && financeData) setCachedData(wsId, "finance_settings", financeData)
          }
          if (!usageAveragesData || forceRefresh) {
            usageAveragesData = fetched.usageAverages
            if (wsId) setCachedData(wsId, `usage_avg_${cycle}`, usageAveragesData)
          }
        } else {
          rooms = rooms || []
          dbBills = dbBills || []
          dbMeters = dbMeters || []
          dbReplacements = dbReplacements || []
          dbPrevMeters = dbPrevMeters || []
          usageAveragesData = usageAveragesData || {}
        }
      }

      // ถ้ามีการเรียก loadData รอบใหม่กว่าเริ่มไปแล้วระหว่างที่รอบนี้กำลังโหลดอยู่ ให้ทิ้งผลลัพธ์รอบนี้ทั้งหมด
      if (loadDataSeqRef.current !== seq) return

      setRoomsList(rooms)
      setUsageAverages(usageAveragesData || {})
      setMeterReplacements(dbReplacements)
      const currentPenaltyRate = financeData ? Number(financeData.late_penalty_rate || 0) : 0

      // โหมด Supabase ดั้งเดิมและถาวร (รวมทุกห้องแม้ไม่มีผู้เช่า)
      const activeRooms = rooms
      const compiled = activeRooms.map((r: any) => {
        // จับคู่ด้วย rooms.id — เลขห้องซ้ำกันได้ข้ามอาคาร ถ้าเทียบด้วยเลขห้อง ห้อง 101 ของสองอาคาร
        // จะได้บิล/เลขมิเตอร์ของห้องเดียวกันมาแสดงทั้งคู่ แล้วการกดบันทึกจะเขียนทับกันเอง
        const roomId = asRoomId(r.id)
        const roomBill = dbBills.find((b: any) => b.roomId === roomId)
        const roomMeter = dbMeters.find((m: any) => m.roomId === roomId)
        const prevMeter = dbPrevMeters.find((m: any) => m.roomId === roomId)
        
        // ค้นหาผู้เช่าที่ครอบคลุมในรอบบิลปัจจุบันตามประวัติสัญญาเช่า
        let resolvedTenantName: string | null = null
        const sortedTenants = [...(r.allTenants || [])].sort((a: any, b: any) => {
          const aTime = a.leaseStart ? new Date(a.leaseStart).getTime() : 0
          const bTime = b.leaseStart ? new Date(b.leaseStart).getTime() : 0
          return bTime - aTime
        })

        if (roomBill && roomBill.tenantName) {
          // 1. หากมีบิลถูกบันทึกไว้แล้วในฐานข้อมูล ให้ตรวจสอบว่าผู้เช่าชื่อนี้ยังมีอยู่และสัญญากลางปีนั้นถูกต้องหรือไม่
          const matchingTenant = (r.allTenants || []).find((t: any) => t.tenantName === roomBill.tenantName)
          if (matchingTenant) {
            // หากผู้เช่าชื่อนี้ยังมีตัวตนในตาราง tenants ให้ตรวจสอบความ Active ในรอบบิลนี้จริง ๆ
            const matchingTenantIsLatest = sortedTenants[0]?.id === matchingTenant.id
            const isActive = isTenantActiveInCycle(matchingTenant.leaseStart, matchingTenant.leaseEnd, cycle, matchingTenantIsLatest)
            if (isActive) {
              resolvedTenantName = roomBill.tenantName
            } else {
              // หากในรอบบิลนั้นเขายังไม่เข้าอยู่ แสดงว่าเป็นประวัติศาสตร์จากบั๊กเก่า ให้ค้นหาผู้เช่าที่ Active จริง ณ ตอนนั้นแทน
              const actualActiveTenant = (r.allTenants || []).find((t: any) => {
                const tIsLatest = sortedTenants[0]?.id === t.id
                return isTenantActiveInCycle(t.leaseStart, t.leaseEnd, cycle, tIsLatest)
              })
              resolvedTenantName = actualActiveTenant ? actualActiveTenant.tenantName : null
            }
          } else {
            // หากไม่พบชื่อผู้เช่านี้ในตาราง tenants แสดงว่าเป็นผู้เช่าเก่าที่ย้ายออกและถูกลบประวัติไปแล้ว ให้เชื่อประวัติศาสตร์ในบิล
            resolvedTenantName = roomBill.tenantName
          }
        } else {
          // 2. หากยังไม่มีบิลในฐานข้อมูล ให้ค้นหาผู้เช่าที่สัญญายังคงแอคทีฟในช่วงรอบเดือนนี้
          const activeTenant = (r.allTenants || []).find((t: any) => {
            const tIsLatest = sortedTenants[0]?.id === t.id
            return isTenantActiveInCycle(t.leaseStart, t.leaseEnd, cycle, tIsLatest)
          })
          resolvedTenantName = activeTenant ? activeTenant.tenantName : null
        }
        
        const isOccupiedInCycle = resolvedTenantName !== null

        const hasNotifiedCheckout = r.status === "Pending_Refund"

        // กำหนดเลขมิเตอร์ครั้งก่อนหน้าแบบไดนามิกและยืดหยุ่นสูง ปรับเปลี่ยนอัตโนมัติเมื่อเลือกเดือนย้อนหลัง
        const fallbacks = getFallbackPrevReadings(roomId, cycle)
        const hasPrevMeterElec = !!(prevMeter && prevMeter.elecCurr !== "" && prevMeter.elecCurr !== null && prevMeter.elecCurr !== undefined)
        const hasPrevMeterWater = !!(prevMeter && prevMeter.waterCurr !== "" && prevMeter.waterCurr !== null && prevMeter.waterCurr !== undefined)

        const elecPrev = hasPrevMeterElec
          ? Number(prevMeter.elecCurr)
          : (roomMeter ? Number(roomMeter.elecPrev) : (prevMeter ? Number(prevMeter.elecPrev) : fallbacks.elecPrev))
        const waterPrev = hasPrevMeterWater
          ? Number(prevMeter.waterCurr)
          : (roomMeter ? Number(roomMeter.waterPrev) : (prevMeter ? Number(prevMeter.waterPrev) : fallbacks.waterPrev))
        
        // กำหนดความสามารถในการแก้ไขเลขหน่วยครั้งก่อนหน้า (เฉพาะเดือนแรกที่สมัครใช้บริการเท่านั้น เดือนถัดไปจะถูกล็อกถาวร)
        const isFirstMonth = regCycleVal ? (cycle === regCycleVal) : true
        const isElecPrevEditable = isFirstMonth
        const isWaterPrevEditable = isFirstMonth

        // จัดการเรื่องวันจ่ายล่าช้าและคำนวณค่าปรับแบบเรียลไทม์ตามเวลาปัจจุบัน
        let finalLateDays = 0
        let finalPenaltyAmount = 0
        let finalBillAmount = 0
        
        if (roomBill) {
          const dbLateDays = roomBill.lateDays
          const dbPenaltyAmount = roomBill.penaltyAmount
          const dbBillAmount = Number(roomBill.amount || 0)
          const isUnpaidOrPending = roomBill.status === "unpaid" || roomBill.status === "pending"
          
          if (isUnpaidOrPending && dbLateDays === null) {
            // คำนวณวันปรับล่าช้าอัตโนมัติตามเวลาปัจจุบัน (เนื่องจากคอลัมน์ late_days เป็น null ยังไม่เคยคำนวณหรือบันทึกมาก่อน)
            const calculatedDays = calculateLateDays(cycle)
            if (calculatedDays > 0) {
              finalLateDays = calculatedDays
              finalPenaltyAmount = calculatedDays * currentPenaltyRate
              // ยอดเงินรวมจะถูกบวกเพิ่มด้วยค่าปรับที่คำนวณมาใหม่
              finalBillAmount = dbBillAmount + finalPenaltyAmount
            } else {
              finalLateDays = 0
              finalPenaltyAmount = 0
              finalBillAmount = dbBillAmount
            }
          } else {
            // ใช้ค่าจากตารางฐานข้อมูลโดยตรง (ไม่ว่าจะเป็น 0 หรือค่าที่แอดมินบันทึกไว้ และไม่ให้ทำการคำนวณซ้ำซ้อน)
            finalLateDays = dbLateDays !== null && dbLateDays !== undefined ? Number(dbLateDays) : 0
            finalPenaltyAmount = dbPenaltyAmount !== null && dbPenaltyAmount !== undefined ? Number(dbPenaltyAmount) : 0
            finalBillAmount = dbBillAmount
          }
        }

        return {
          roomId,
          roomNumber: r.roomNumber,
          tenantName: resolvedTenantName,
          baseRent: Number(r.baseRent) || 4500,
          status: isOccupiedInCycle ? "occupied" : "available",
          buildingId: r.buildingId ?? null,
          hasNotifiedCheckout: !!hasNotifiedCheckout,
          
          meterRecordId: roomMeter?.id || undefined,
          elecPrev,
          elecCurr: roomMeter ? (roomMeter.elecCurr === null || roomMeter.elecCurr === undefined ? "" : roomMeter.elecCurr) : "",
          waterPrev,
          waterCurr: roomMeter ? (roomMeter.waterCurr === null || roomMeter.waterCurr === undefined ? "" : roomMeter.waterCurr) : "",
          isMeterSaved: roomMeter ? true : false,
          isElecPrevEditable,
          isWaterPrevEditable,
          
          billId: roomBill?.id || undefined,
          billAmount: finalBillAmount,
          billStatus: roomBill ? (roomBill.status as "unpaid" | "pending" | "paid" | "not_created") : "not_created",
          slipUrl: roomBill ? roomBill.slipUrl : null,
          electricUnits: roomBill ? Number(roomBill.electricUnits) : 0,
          waterUnits: roomBill ? Number(roomBill.waterUnits) : 0,
          penaltyAmount: finalPenaltyAmount,
          lateDays: finalLateDays,
          otherServiceAmount: roomBill ? Number(roomBill.otherServiceAmount || 0) : 0,
          vatAmount: roomBill ? Number(roomBill.vatAmount || 0) : 0,
          waiveElectricMin: !!r.waive_electric_min || !!r.waiveElectricMin,
          waiveWaterMin: !!r.waive_water_min || !!r.waiveWaterMin,
          invoiceId: roomBill?.invoiceId || undefined
        }
      })
      // refresh เบื้องหลัง (silent) ห้ามเขียนทับแถวที่ผู้ใช้กำลังพิมพ์ค้างอยู่ — คำขอถูกยิงตอนที่ยังไม่มี
      // การแก้ไข แต่กว่าจะได้ผลลัพธ์กลับมาผู้ใช้อาจกรอกเลขมิเตอร์ไปแล้ว ถ้า set ทับทั้งก้อนเลขที่พิมพ์จะหาย
      // (แถวที่ไม่ได้แก้ยังรับข้อมูลใหม่ปกติ เช่น ผู้เช่าห้องอื่นอัปโหลดสลิปเข้ามาระหว่างนั้น)
      setUnifiedItems(prev => {
        if (!silent) return compiled
        const editedByRoom = new Map(prev.filter(i => i.isEdited).map(i => [i.roomId, i]))
        if (editedByRoom.size === 0) return compiled
        return compiled.map((fresh: UnifiedRoomBillingItem) => editedByRoom.get(fresh.roomId) ?? fresh)
      })
    } catch (err) {
      console.error("Failed to load billing unified items with cache:", err)
    } finally {
      loadDataInFlightCountRef.current--
      if (!silent) {
        visibleLoadInFlightRef.current--
        if (visibleLoadInFlightRef.current === 0) setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadData(billingCycle)
  }, [billingCycle])

  // เก็บค่าล่าสุดไว้ใน ref เพื่อให้ทั้ง Realtime handler และ fallback poll อ่านค่าปัจจุบันได้
  // โดยไม่ต้องผูก effect ไว้กับ unifiedItems (ซึ่งเปลี่ยนทุกครั้งที่แก้ไขข้อมูล จะทำให้ subscribe ซ้ำไม่จำเป็น)
  const guardStateRef = useRef({ unifiedItems, slipModalOpen, createBillModalOpen, billingCycle })
  useEffect(() => {
    guardStateRef.current = { unifiedItems, slipModalOpen, createBillModalOpen, billingCycle }
  }, [unifiedItems, slipModalOpen, createBillModalOpen, billingCycle])

  // ยุบ realtime event ที่มาเป็นชุดให้เหลือ refresh เดียว — bulk upsert 1 ครั้งทำให้ Postgres emit
  // change ทีละแถว (N ห้อง = N event) ถ้า refresh ทุก event จะกลายเป็น N คำขอหนักแย่งคิวกันเอง
  const REFRESH_DEBOUNCE_MS = 2000
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshIfSafe = () => {
    const {
      unifiedItems: items,
      slipModalOpen: slipOpen,
      createBillModalOpen: createOpen,
      billingCycle: currentCycle
    } = guardStateRef.current

    if (Date.now() < suppressRefreshUntilRef.current) return
    if (loadDataInFlightCountRef.current > 0) return

    const hasUnsaved = items.some(item => item.isEdited)
    if (hasUnsaved || slipOpen || createOpen) return

    loadData(currentCycle, true, true) // forceRefresh=true, silent=true
  }

  const scheduleRefresh = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      refreshIfSafe()
    }, REFRESH_DEBOUNCE_MS)
  }

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [])

  // อัปเดตข้อมูลบิลทันทีผ่าน Supabase Realtime เมื่อมีการเปลี่ยนแปลงจริง (เช่น ผู้เช่าอัปโหลดสลิป)
  // แทนการ poll ถามทุก ๆ ไม่กี่วินาทีโดยไม่รู้ว่ามีอะไรเปลี่ยนหรือไม่
  useEffect(() => {
    if (!currentWorkspaceId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`realtime_billing_${currentWorkspaceId}_${billingCycle}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bills", filter: `workspace_id=eq.${currentWorkspaceId}` },
        (payload) => {
          // Supabase realtime รับ filter ได้เงื่อนไขเดียว จึงต้องกรองรอบบิลฝั่ง client — บิลของเดือนอื่น
          // ไม่กระทบข้อมูลที่หน้านี้แสดง ไม่ควรเสีย refresh ทั้งก้อน
          // (event DELETE ส่ง old มาแค่ primary key ถ้าไม่ได้ตั้ง REPLICA IDENTITY FULL จึงอ่านรอบบิลไม่ได้
          //  กรณีนั้นปล่อยให้ refresh ตามปกติ ปลอดภัยกว่าเสี่ยงข้ามการอัปเดตจริง)
          const changedCycle =
            (payload.new as Record<string, unknown> | null)?.billing_cycle ??
            (payload.old as Record<string, unknown> | null)?.billing_cycle
          if (typeof changedCycle === "string" && changedCycle !== guardStateRef.current.billingCycle) return
          scheduleRefresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentWorkspaceId, billingCycle])

  useEffect(() => {
    // Poll เป็นแค่ fallback สำรอง เผื่อ Realtime channel ด้านบนหลุดการเชื่อมต่อ
    // หยุด poll เมื่อแท็บถูกซ่อน (ประหยัด CPU ฝั่งเซิร์ฟเวอร์) แล้ว refresh ทันทีเมื่อกลับมาเปิดดูอีกครั้ง
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        scheduleRefresh()
      }
    }, 60000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [billingCycle])

  useEffect(() => {
    const hasUnsaved = unifiedItems.some(item => item.isEdited)
    if (typeof window !== "undefined") {
      ;(window as any).__hasUnsavedChanges = hasUnsaved
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        e.preventDefault()
        e.returnValue = t("manage_bills.confirm_unsaved_leave")
        return e.returnValue
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      if (typeof window !== "undefined") {
        ;(window as any).__hasUnsavedChanges = false
      }
    }
  }, [unifiedItems, t])

  useEffect(() => {
    async function loadFinance(forceRefresh = false) {
      try {
        let userProfile = getCachedData("global", "profile")
        if (!userProfile || forceRefresh) {
          const userRes = await getCurrentUserProfileAction()
          if (userRes.success && userRes.data) {
            userProfile = userRes.data
            setCachedData("global", "profile", userRes.data)
          }
        }
        
        let wsId: string | undefined = undefined
        
        if (userProfile) {
          setCurrentUserRole(userProfile.role || "staff")
          const isSuperAdmin = userProfile.role === "super_admin"
          
          if (!isSuperAdmin && userProfile.workspace_id) {
            // สำหรับ Admin และ Staff ทั่วไป: ให้ใช้ workspace_id จาก Profile เสมอ
            wsId = userProfile.workspace_id
          } else {
            // สำหรับ Super Admin: ดึงจาก Cookie เพื่อรองรับการสลับ Workspace คอนโซลด้านบน
            const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
            wsId = cookieWsId || userProfile.workspace_id || undefined
          }
        }

        if (wsId) {
          setCurrentWorkspaceId(wsId)
          let financeData = getCachedData(wsId, "finance_settings")
          if (!financeData || forceRefresh) {
            const financeRes = await getFinanceSettings(wsId)
            if (financeRes.success && financeRes.data) {
              financeData = financeRes.data
              setCachedData(wsId, "finance_settings", financeData)
            }
          }

          if (financeData) {
            if (financeData.common_fee !== undefined) setCommonFee(financeData.common_fee)
            if (financeData.water_rate !== undefined) setWaterRate(financeData.water_rate)
            if (financeData.electric_rate !== undefined) setElecRate(financeData.electric_rate)
            setWaterMinChecked(!!financeData.water_min_checked)
            if (financeData.water_min_unit !== undefined) setWaterMinUnit(financeData.water_min_unit)
            setElectricMinChecked(!!financeData.electric_min_checked)
            if (financeData.electric_min_unit !== undefined) setElectricMinUnit(financeData.electric_min_unit)
            setElectricBillingMode(financeData.electric_billing_mode || "fixed_rate")
            setWaterBillingMode(financeData.water_billing_mode || "fixed_rate")
            setMeterEntryUtility(financeData.meter_entry_utility || "electric")
            setMeterEntryFloor(financeData.meter_entry_floor || "all")
            setVatRegistered(!!financeData.vat_registered)
            setVatRegisteredFrom(financeData.vat_registered_from || null)
            if (financeData.vat_rate !== undefined) setVatRate(financeData.vat_rate)
            if (financeData.late_penalty_rate !== undefined) setLatePenaltyRate(financeData.late_penalty_rate)
            if (financeData.promptpay_id) setPromptPayId(financeData.promptpay_id)
            if (financeData.promptpay_name) setPromptPayName(financeData.promptpay_name)
            if (financeData.name) setWorkspaceName(financeData.name)
            if (financeData.tax_address) setWorkspaceAddress(financeData.tax_address)
            if (financeData.tax_phone) setWorkspacePhone(financeData.tax_phone)
            if (financeData.tax_id) setWorkspaceTaxId(financeData.tax_id)
          }

          const buildingsRes = await getBuildings(wsId)
          if (buildingsRes.success && buildingsRes.data) {
            setBuildings(buildingsRes.data.map(b => ({ id: b.id, name: b.name })))
          }
        }
      } catch (err) {
        console.error("Failed to load finance settings with cache:", err)
      }
    }
    loadFinance()
  }, [])

  // ดึงยอดบิลรวมทั้งอาคารของรอบบิลนี้ (ใช้พรีวิวราคาที่ถูกต้องใน modal "สร้างบิลด้วยตนเอง"
  // เมื่อเปิดโหมดหารตามสัดส่วนทั้งอาคาร — เซิร์ฟเวอร์คำนวณยอดจริงตอนบันทึกอยู่แล้วไม่ว่ากรณีใด
  // แต่พรีวิวเดิมยังอิงอัตราคงที่เสมอทำให้ตัวเลขที่เห็นก่อนกดบันทึกไม่ตรงกับที่จะถูกเรียกเก็บจริง)
  useEffect(() => {
    let cancelled = false
    async function loadBuildingUtilityBills() {
      if (!currentWorkspaceId || !billingCycle) return
      if (electricBillingMode !== "building_total" && waterBillingMode !== "building_total") {
        setBuildingUtilityBills([])
        return
      }
      const res = await getBuildingUtilityBillsForWorkspaceCycle(currentWorkspaceId, billingCycle)
      if (cancelled) return
      if (res.success && res.data) {
        setBuildingUtilityBills(res.data)
      }
    }
    loadBuildingUtilityBills()
    return () => { cancelled = true }
  }, [currentWorkspaceId, billingCycle, electricBillingMode, waterBillingMode])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  // เปลี่ยนรูปแบบการจดมิเตอร์ แล้วจำไว้ต่อ workspace
  //
  // ⚠️ ห้ามเรียก loadData / clearWorkspaceCache ที่นี่เด็ดขาด — เลขมิเตอร์ที่ผู้ใช้พิมพ์ค้างไว้อยู่ใน
  // unifiedItems ถ้าโหลดใหม่จะถูกเขียนทับหายทั้งหมด (บั๊กเดิมที่แก้ไปแล้ว ห้ามเปิดช่องกลับมา)
  // จึงอัปเดต state + แคชในที่ แล้วยิง server action แบบไม่ block UI
  const applyMeterEntryMode = (
    utility: "electric" | "water" | "both",
    floor: string
  ) => {
    setMeterEntryUtility(utility)
    setMeterEntryFloor(floor)

    if (!currentWorkspaceId) return

    const cachedFinance = getCachedData(currentWorkspaceId, "finance_settings")
    if (cachedFinance) {
      setCachedData(currentWorkspaceId, "finance_settings", {
        ...cachedFinance,
        meter_entry_utility: utility,
        meter_entry_floor: floor
      })
    }

    void saveMeterEntryModeAction(currentWorkspaceId, utility, floor)
      .then(res => {
        if (!res.success) {
          console.error("Failed to persist meter entry mode:", res.error)
          showToast(t("billing.err_save_meter_entry_mode"))
        }
      })
      .catch(err => {
        console.error("Failed to persist meter entry mode:", err)
        showToast(t("billing.err_save_meter_entry_mode"))
      })
  }

  // อัปเดตช่องอินพุตเลขมิเตอร์ไฟฟ้าในหน้าจอ
  const handleElecChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomId === roomId ? { ...item, elecCurr: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  // อัปเดตช่องอินพุตเลขมิเตอร์น้ำในหน้าจอ
  const handleWaterChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomId === roomId ? { ...item, waterCurr: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  // อัปเดตช่องอินพุตเลขมิเตอร์ไฟฟ้าก่อนหน้าในหน้าจอ
  const handleElecPrevChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomId === roomId ? { ...item, elecPrev: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  // อัปเดตช่องอินพุตเลขมิเตอร์น้ำก่อนหน้าในหน้าจอ
  const handleWaterPrevChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomId === roomId ? { ...item, waterPrev: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  // อัปเดตและคำนวณวันปรับล่าช้าในหน้าจอแบบเรียลไทม์
  const handleLateDaysChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item => {
        if (item.roomId !== roomId) return item
        
        const days = value === "" ? 0 : Number(value)
        if (isNaN(days)) return item
        
        const newPenaltyAmount = days * latePenaltyRate
        
        // คำนวณความแตกต่างของค่าปรับเพื่อปรับเปลี่ยนยอดรวมรวม billAmount
        const prevPenalty = item.penaltyAmount || 0
        const penaltyDiff = newPenaltyAmount - prevPenalty
        const newBillAmount = item.billAmount + penaltyDiff
        
        return {
          ...item,
          lateDays: days,
          penaltyAmount: newPenaltyAmount,
          billAmount: newBillAmount,
          isEdited: true
        }
      })
    )
  }

  // อัปเดตและคำนวณยอดเงินรวมเมื่อเปลี่ยนค่าบริการอื่นๆ แบบเรียลไทม์
  const handleOtherServiceChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item => {
        if (item.roomId !== roomId) return item
        
        const otherVal = value === "" ? 0 : Number(value)
        if (isNaN(otherVal)) return item

        const prevOther = item.otherServiceAmount || 0
        const otherDiff = otherVal - prevOther
        const newBillAmount = item.billAmount + otherDiff

        return {
          ...item,
          otherServiceAmount: otherVal,
          billAmount: newBillAmount,
          isEdited: true
        }
      })
    )
  }


  // ตัวแปรและฟังก์ชันช่วยจัดรูปแบบข้อมูลและอัปเดตแคชเพื่อความเร็วสูงสุดแบบไม่ต้องโหลดข้อมูลใหม่ (Option 1 - Optimistic / Local State Update)
  const formatDbBillToCamelCase = (b: any) => ({
    id: b.id,
    roomNumber: b.room_number,
    roomId: b.room_id ?? null,
    tenantName: b.tenant_name,
    amount: Number(b.amount),
    status: b.status,
    billingCycle: b.billing_cycle,
    slipUrl: b.slip_url,
    electricUnits: Number(b.electric_units),
    waterUnits: Number(b.water_units),
    penaltyAmount: b.penalty_amount !== null && b.penalty_amount !== undefined ? Number(b.penalty_amount) : null,
    lateDays: b.late_days !== null && b.late_days !== undefined ? Number(b.late_days) : null,
    otherServiceAmount: b.other_service_amount !== null && b.other_service_amount !== undefined ? Number(b.other_service_amount) : 0,
    vatAmount: b.vat_amount !== null && b.vat_amount !== undefined ? Number(b.vat_amount) : 0
  })

  const formatDbMeterToCamelCase = (m: any) => ({
    id: m.id,
    roomNumber: m.room_number,
    roomId: m.room_id ?? null,
    billingCycle: m.billing_cycle,
    elecPrev: Number(m.elec_prev),
    elecCurr: m.elec_curr === null || m.elec_curr === undefined ? "" : Number(m.elec_curr),
    waterPrev: Number(m.water_prev),
    waterCurr: m.water_curr === null || m.water_curr === undefined ? "" : Number(m.water_curr)
  })

  const updateLocalStateAndCache = (
    roomId: RoomId,
    formattedMeter?: any,
    formattedBill?: any
  ) => {
    // 1. อัปเดต React State ทันทีเพื่อความลื่นไหลแบบ 0ms
    setUnifiedItems(prev => prev.map(i => {
      if (i.roomId === roomId) {
        return {
          ...i,
          ...(formattedMeter ? {
            meterRecordId: formattedMeter.id,
            elecPrev: formattedMeter.elecPrev,
            elecCurr: formattedMeter.elecCurr,
            waterPrev: formattedMeter.waterPrev,
            waterCurr: formattedMeter.waterCurr,
            isMeterSaved: true,
            isEdited: false
          } : {}),
          ...(formattedBill ? {
            billId: formattedBill.id,
            billAmount: formattedBill.amount,
            billStatus: formattedBill.status,
            slipUrl: formattedBill.slipUrl,
            electricUnits: formattedBill.electricUnits,
            waterUnits: formattedBill.waterUnits,
            penaltyAmount: formattedBill.penaltyAmount || 0,
            lateDays: formattedBill.lateDays || 0,
            otherServiceAmount: formattedBill.otherServiceAmount,
            invoiceId: formattedBill.invoiceId
          } : {})
        }
      }
      return i
    }))

    // 2. อัปเดตข้อมูลแคชของ Workspace เพื่อป้องกันปัญหาดึงแคชตัวเก่าเมื่อสลับหน้าไปมา
    if (currentWorkspaceId) {
      if (formattedMeter) {
        const cachedMeters = getCachedData(currentWorkspaceId, `meters_${billingCycle}`) || []
        const existingMeterIdx = cachedMeters.findIndex((m: any) => m.roomId === roomId)
        let updatedMeters = [...cachedMeters]
        if (existingMeterIdx >= 0) {
          updatedMeters[existingMeterIdx] = { ...updatedMeters[existingMeterIdx], ...formattedMeter }
        } else {
          updatedMeters.push(formattedMeter)
        }
        setCachedData(currentWorkspaceId, `meters_${billingCycle}`, updatedMeters)
      }

      if (formattedBill) {
        const cachedBills = getCachedData(currentWorkspaceId, `bills_${billingCycle}`) || []
        const existingBillIdx = cachedBills.findIndex((b: any) => b.roomId === roomId)
        let updatedBills = [...cachedBills]
        if (existingBillIdx >= 0) {
          updatedBills[existingBillIdx] = { ...updatedBills[existingBillIdx], ...formattedBill }
        } else {
          updatedBills.push(formattedBill)
        }
        setCachedData(currentWorkspaceId, `bills_${billingCycle}`, updatedBills)
      }
    }
  }

  // บันทึกวันปรับล่าช้าและคำนวณค่าปรับลง Supabase
  const handleSaveLateDays = async (roomId: RoomId) => {
    const item = unifiedItems.find(i => i.roomId === roomId)

    if (!item) {
      // roomId เป็น uuid ห้ามเอาไปโชว์ผู้ใช้ — เก็บไว้ใน log ให้ทีมดูแลไล่ต่อได้
      console.error("❌ [Client] Room item not found in unifiedItems for roomId:", roomId)
      alert(t("manage_bills.err_no_room_data").replace("{room}", "").trim())
      return
    }

    // เลขห้องสำหรับ "แสดงให้ผู้ใช้อ่าน" เท่านั้น — การจับคู่ทุกที่ใช้ roomId
    const roomLabel = item.roomNumber

    if (!item.billId) {
      console.error("❌ [Client] billId is missing for room:", roomLabel, "item:", item)
      alert(t("manage_bills.err_no_bill_id").replace("{room}", roomLabel))
      return
    }
    
    const sendLateDays = item.lateDays || 0
    const sendPenaltyAmount = item.penaltyAmount || 0
    const sendBillAmount = item.billAmount
    
    console.log("👉 [Client] Preparing to call updateBillPenalty:", {
      billId: item.billId,
      lateDays: sendLateDays,
      penaltyAmount: sendPenaltyAmount,
      billAmount: sendBillAmount
    })
    setSavingRows(prev => ({ ...prev, [roomId]: true }))
    
    try {
      const { updateBillPenalty } = await import("@/features/billing/actions")
      console.log("👉 [Client] Server Action updateBillPenalty imported successfully. Invoking...")
      
      const res = await updateBillPenalty(
        item.billId,
        sendLateDays,
        sendPenaltyAmount,
        sendBillAmount
      )
      
      console.log("✅ [Client] updateBillPenalty responded:", res)
      
      if (res.success) {
        showToast(t("manage_bills.saved_late_days").replace("{room}", roomLabel))
        const formatted = formatDbBillToCamelCase(res.data)
        updateLocalStateAndCache(roomId, undefined, formatted)
        setUnifiedItems(prev =>
          prev.map(i => i.roomId === roomId ? { ...i, isEdited: false } : i)
        )
        console.log("👉 [Client] Local state & cache updated successfully")
      } else {
        console.error("❌ [Client] Server Action returned success=false:", res.error)
        alert(`${t("manage_bills.err_save_failed_prefix")}${res.error || t("manage_bills.err_penalty_generic")}`)
      }
    } catch (err) {
      console.error("💥 [Client] Exception caught in handleSaveLateDays:", err)
      alert(`${t("manage_bills.err_penalty_fatal_prefix")}${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSavingRows(prev => ({ ...prev, [roomId]: false }))
      console.log("🏁 [Client] handleSaveLateDays finished execution flow")
    }
  }

  const closeSlipModal = () => {
    setSlipModalOpen(false)
    setSelectedBill(null)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      let urlChanged = false
      if (url.searchParams.has("verify_bill_id")) {
        url.searchParams.delete("verify_bill_id")
        urlChanged = true
      }
      if (url.searchParams.has("cycle")) {
        url.searchParams.delete("cycle")
        urlChanged = true
      }
      if (urlChanged) {
        window.history.replaceState(null, "", url.pathname + url.search)
      }
    }
  }

  // อนุมัติสลิปโอนเงิน
  const handleApproveSlip = async (id: string) => {
    if (currentUserRole === "staff") {
      alert(t("billing.err_admin_only_approve"))
      return
    }
    const res = await updateBillStatus(id, "paid")
    if (res.success) {
      showToast(t("manage_bills.approved_payment"))
      const formatted = formatDbBillToCamelCase(res.data)
      updateLocalStateAndCache(asRoomId(formatted.roomId), undefined, formatted)
    } else {
      alert(res.error || t("manage_bills.err_update_bill_status"))
      return
    }
    closeSlipModal()
  }

  // ปฏิเสธสลิปโอนเงิน
  const handleRejectSlip = async (id: string) => {
    if (currentUserRole === "staff") {
      alert(t("billing.err_admin_only_reject"))
      return
    }
    const res = await updateBillStatus(id, "unpaid", null)
    if (res.success) {
      showToast(t("manage_bills.rejected_slip"))
      const formatted = formatDbBillToCamelCase(res.data)
      updateLocalStateAndCache(asRoomId(formatted.roomId), undefined, formatted)
    } else {
      alert(res.error || t("manage_bills.err_update_bill_status"))
      return
    }
    closeSlipModal()
  }

  // เปลี่ยนสถานะเป็นชำระเงินแล้วโดยตรง (สำหรับกรณีแอดมินรับเงินสด/โอนตรง)
  const handleMarkAsPaid = async (billId: string, roomId: RoomId) => {
    if (currentUserRole === "staff") {
      alert(t("billing.err_admin_only_cash"))
      return
    }
    const roomLabel = unifiedItems.find(i => i.roomId === roomId)?.roomNumber ?? ""
    if (!confirm(t("manage_bills.confirm_mark_paid").replace("{room}", roomLabel))) return

    const res = await updateBillStatus(billId, "paid")
    if (res.success) {
      showToast(t("manage_bills.marked_paid").replace("{room}", roomLabel))
      const formatted = formatDbBillToCamelCase(res.data)
      updateLocalStateAndCache(roomId, undefined, formatted)
    } else {
      alert(res.error || t("manage_bills.err_update_bill_status"))
    }
  }

  // บันทึกเฉพาะห้องและสร้างบิล
  const handleSaveRow = async (roomId: RoomId, type: "electric" | "water" | "all" = "all") => {
    const item = unifiedItems.find(i => i.roomId === roomId)
    if (!item) return

    // เลขห้องสำหรับแสดงข้อความเท่านั้น — ทุก query/การจับคู่ใช้ roomId
    const roomLabel = item.roomNumber

    const elecVal = item.elecCurr === "" ? "" : Number(item.elecCurr)
    const waterVal = item.waterCurr === "" ? "" : Number(item.waterCurr)
    const elecPrevVal = item.elecPrev === "" ? 0 : Number(item.elecPrev)
    const waterPrevVal = item.waterPrev === "" ? 0 : Number(item.waterPrev)

    const repElec = meterReplacements?.find(r => r.roomId === roomId && r.meterType === "electric")
    const repWater = meterReplacements?.find(r => r.roomId === roomId && r.meterType === "water")

    const getUnits = (curr: number, prev: number) => {
      if (curr >= prev) return curr - prev
      return (10000 - prev) + curr
    }

    let eUnits = 0
    let wUnits = 0

    // ตรวจสอบเงื่อนไขตามประเภทปุ่มที่กดบันทึก
    if (type === "electric" || type === "all") {
      if (elecVal === "" || isNaN(elecVal as number)) {
        if (type === "electric") {
          alert(t("manage_bills.err_elec_required"))
          return
        }
      } else {
        if (isNaN(elecPrevVal)) {
          alert(t("manage_bills.err_prev_invalid"))
          return
        }
        if (repElec) {
          const oldUnits = getUnits(repElec.oldFinalReading, elecPrevVal)
          const newUnits = getUnits(Number(elecVal), repElec.newStartReading)
          eUnits = oldUnits + newUnits
        } else {
          eUnits = getUnits(Number(elecVal), elecPrevVal)
        }
        if (eUnits > 3000) {
          alert(t("manage_bills.err_units_exceed"))
          return
        }
      }
    }

    if (type === "water" || type === "all") {
      if (waterVal === "" || isNaN(waterVal as number)) {
        if (type === "water") {
          alert(t("manage_bills.err_water_required"))
          return
        }
      } else {
        if (isNaN(waterPrevVal)) {
          alert(t("manage_bills.err_prev_invalid"))
          return
        }
        if (repWater) {
          const oldUnits = getUnits(repWater.oldFinalReading, waterPrevVal)
          const newUnits = getUnits(Number(waterVal), repWater.newStartReading)
          wUnits = oldUnits + newUnits
        } else {
          wUnits = getUnits(Number(waterVal), waterPrevVal)
        }
        if (wUnits > 3000) {
          alert(t("manage_bills.err_units_exceed"))
          return
        }
      }
    }

    if (type === "all" && (elecVal === "" || waterVal === "")) {
      alert(t("manage_bills.err_both_required"))
      return
    }

    const elecCost = elecVal === "" 
      ? 0 
      : (!item.waiveElectricMin && electricMinChecked && eUnits <= electricMinUnit
          ? electricMinUnit * elecRate
          : eUnits * elecRate)

    const waterCost = waterVal === "" 
      ? 0 
      : (!item.waiveWaterMin && waterMinChecked && wUnits <= waterMinUnit
          ? waterMinUnit * waterRate
          : wUnits * waterRate)
          
    const roomInfo = roomsList?.find((r: any) => r.id === roomId)
    const extraExpenses = roomInfo?.extraExpenses || []
    const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

    const otherServiceVal = Number(item.otherServiceAmount || 0)
    const totalAmount = item.baseRent + elecCost + waterCost + commonFee + otherServiceVal + extraExpensesSum

    setSavingRows(prev => ({ ...prev, [roomId]: true }))
    // การบันทึกของเราเองจะทำให้ realtime ยิง event กลับมา แต่ updateLocalStateAndCache ด้านล่าง
    // อัปเดต state + cache ครบแล้ว ไม่ต้องเสีย refresh ทั้งก้อนมาทับ
    suppressBackgroundRefresh()

    try {
      // 1. บันทึกมิเตอร์ใน DB
      const meterRes = await saveMeterRecord(
        { roomId },
        billingCycle,
        elecPrevVal,
        elecVal,
        waterPrevVal,
        waterVal
      )
      if (!meterRes.success) {
        alert(meterRes.error || t("manage_bills.err_meter_save_failed"))
        setSavingRows(prev => ({ ...prev, [roomId]: false }))
        return
      }

      // 2. สร้าง/อัปเดตบิลใน DB (เฉพาะกรณีมีผู้เช่าเท่านั้น)
      if (!item.tenantName) {
        showToast(t("billing.toast_save_meter_no_tenant").replace("{room}", roomLabel))
        const formattedMeter = formatDbMeterToCamelCase(meterRes.data)
        updateLocalStateAndCache(roomId, formattedMeter, undefined)
        setSavingRows(prev => ({ ...prev, [roomId]: false }))
        return
      }

      const billRes = await createBill(
        { roomId },
        item.tenantName || "ผู้เช่า",
        totalAmount,
        item.billStatus === "not_created" ? "unpaid" : (item.billStatus as any),
        billingCycle,
        eUnits,
        wUnits,
        otherServiceVal
      )
      if (!billRes.success) {
        alert(billRes.error || t("manage_bills.err_bill_create_failed"))
        setSavingRows(prev => ({ ...prev, [roomId]: false }))
        return
      }

      showToast(t("manage_bills.saved_meter_bill").replace("{room}", roomLabel))
      const formattedMeter = formatDbMeterToCamelCase(meterRes.data)
      const formattedBill = formatDbBillToCamelCase(billRes.data)
      updateLocalStateAndCache(roomId, formattedMeter, formattedBill)
    } catch (err) {
      console.error(err)
      alert(t("manage_bills.err_unexpected"))
    } finally {
      setSavingRows(prev => ({ ...prev, [roomId]: false }))
      // ต่ออายุช่วงระงับนับจากตอนที่บันทึกเสร็จจริง เผื่อ event เดินทางมาช้ากว่าที่ตั้งไว้ตอนเริ่ม
      suppressBackgroundRefresh()
    }
  }

  // บันทึกและออกบิลให้ห้องที่กรอกครบ ในขอบเขตที่ระบุ
  //
  // roomIds = ขอบเขตที่ผู้ใช้เห็นอยู่จริง (ผ่านตัวกรองอาคารและชั้นแล้ว) — จำเป็นต้องส่งมา เพราะ
  // saveAllBillsForCycle ใช้ upsert ทับ "ทั้งแถว" ของ meter_records (เขียน elec_curr และ water_curr
  // พร้อมกันเสมอ) ถ้าส่งห้องที่อยู่นอกขอบเขตไปด้วย ค่าของห้องนั้นจะถูกเขียนตามสิ่งที่ค้างอยู่ใน state
  // เดิมส่ง unifiedItems ทั้งก้อนตลอด ทำให้กรองอาคาร A แล้วกดบันทึกไปโดนห้องอาคาร B ด้วย
  const handleSaveAll = async (type: "electric" | "water" | "both", roomIds?: RoomId[]) => {
    const getUnits = (curr: number, prev: number) => {
      if (curr >= prev) return curr - prev
      return (10000 - prev) + curr
    }

    const scopeSet = roomIds ? new Set<string>(roomIds) : null
    const scopedItems = scopeSet ? unifiedItems.filter(i => scopeSet.has(i.roomId)) : unifiedItems

    // ตรวจเลขมิเตอร์ของสาธารณูปโภคหนึ่งตัว
    // required = โหมดที่เลือกบังคับต้องกรอก | ถ้าไม่บังคับแต่มีค่าอยู่ ก็ยังต้องผ่าน validation
    // เพราะ upsert เขียนทั้งไฟและน้ำพร้อมกัน ค่าที่ผิดของอีกฝั่งจะถูกบันทึกลงไปเงียบ ๆ ถ้าไม่ตรวจ
    const isUtilityValid = (
      item: UnifiedRoomBillingItem,
      meterType: "electric" | "water",
      required: boolean
    ): boolean => {
      const curr = meterType === "electric" ? item.elecCurr : item.waterCurr
      const prev = meterType === "electric" ? item.elecPrev : item.waterPrev
      if (curr === "" || curr === null || curr === undefined) return !required

      const currNum = Number(curr)
      const prevNum = prev === "" ? 0 : Number(prev)
      if (isNaN(currNum) || isNaN(prevNum)) return false

      const rep = meterReplacements?.find(r => r.roomId === item.roomId && r.meterType === meterType)
      const units = rep
        ? getUnits(rep.oldFinalReading, prevNum) + getUnits(currNum, rep.newStartReading)
        : getUnits(currNum, prevNum)
      return units <= 3000
    }

    const eligible: UnifiedRoomBillingItem[] = []
    const skippedRooms: string[] = []

    for (const item of scopedItems) {
      // ห้องที่แจ้งย้ายออกแล้ว server ข้ามการออกบิลให้อยู่แล้ว ส่งไปได้ ไม่นับเป็นห้องที่กรอกไม่ครบ
      if (item.hasNotifiedCheckout) {
        eligible.push(item)
        continue
      }
      const elecOk = isUtilityValid(item, "electric", type === "electric" || type === "both")
      const waterOk = isUtilityValid(item, "water", type === "water" || type === "both")
      if (elecOk && waterOk) {
        eligible.push(item)
      } else {
        skippedRooms.push(roomLabelOf(item))
      }
    }

    if (eligible.length === 0) {
      alert(t("billing.err_bulk_save_none"))
      return
    }

    setSavingAll(true)
    setSavingProgress({ current: 0, total: eligible.length, currentRoom: t("billing.saving_all_progress") })
    // bulk upsert 1 ครั้ง = realtime event 1 ตัวต่อ 1 แถว (N ห้อง = N event) ทั้งหมดเป็น echo ของ
    // การบันทึกที่เรา optimistic update ครบอยู่แล้วด้านล่าง จึงระงับ refresh เบื้องหลังคลุมช่วงนี้ไว้
    // (ตั้งเผื่อยาวเพราะ saveAllBillsForCycle ใช้เวลาหลายวินาทีเมื่อห้องเยอะ แล้วต่ออายุอีกครั้งหลังอัปเดต state)
    suppressBackgroundRefresh(30000)

    try {
      const items: BulkBillItem[] = eligible.map(item => ({
        roomId: item.roomId,
        roomNumber: item.roomNumber,
        tenantName: item.tenantName || null,
        elecPrev: item.elecPrev === "" ? 0 : Number(item.elecPrev),
        elecCurr: item.elecCurr === "" ? "" : Number(item.elecCurr),
        waterPrev: item.waterPrev === "" ? 0 : Number(item.waterPrev),
        waterCurr: item.waterCurr === "" ? "" : Number(item.waterCurr),
        otherServiceAmount: Number(item.otherServiceAmount || 0),
        status: item.billStatus === "not_created" ? "unpaid" : item.billStatus as "unpaid" | "pending" | "paid",
        hasNotifiedCheckout: !!item.hasNotifiedCheckout
      }))

      const result = await saveAllBillsForCycle(billingCycle, items)

      if (!result.success) {
        alert(`${t("manage_bills.err_save_failed_prefix")}${result.error}`)
        setSavingAll(false)
        return
      }

      const updatedMetersList = (result.data?.meters || []).map((m: any) => formatDbMeterToCamelCase(m))
      const updatedBillsList = (result.data?.bills || []).map((b: any) => formatDbBillToCamelCase(b))

      const stateUpdates: { [roomId: string]: { formattedMeter: any; formattedBill?: any } } = {}

      updatedMetersList.forEach((m: any) => {
        stateUpdates[m.roomId] = { formattedMeter: m }
      })

      updatedBillsList.forEach((b: any) => {
        if (stateUpdates[b.roomId]) {
          stateUpdates[b.roomId].formattedBill = b
        } else {
          stateUpdates[b.roomId] = { formattedMeter: undefined, formattedBill: b }
        }
      })

      // ปลุกพลัง Optimistic UI: อัปเดต React State ทันทีแบบไม่ต้องพึ่งการโหลดเน็ตเวิร์ก
      setUnifiedItems(prev => prev.map(i => {
        const update = stateUpdates[i.roomId]
        if (update) {
          return {
            ...i,
            // ห้องที่ไม่มีผู้เช่าจะได้แถวมิเตอร์แต่ไม่มีบิล ส่วนทางกลับกันไม่ควรเกิด —
            // แต่ถ้าเกิด (เช่น upsert มิเตอร์คืนมาไม่ครบ) ต้องไม่ล้มทั้งหน้าเพราะอ่าน field ของ undefined
            ...(update.formattedMeter ? {
              meterRecordId: update.formattedMeter.id,
              elecPrev: update.formattedMeter.elecPrev,
              elecCurr: update.formattedMeter.elecCurr,
              waterPrev: update.formattedMeter.waterPrev,
              waterCurr: update.formattedMeter.waterCurr,
              isMeterSaved: true,
              isEdited: false
            } : {}),
            ...(update.formattedBill ? {
              billId: update.formattedBill.id,
              billAmount: update.formattedBill.amount,
              billStatus: update.formattedBill.status,
              slipUrl: update.formattedBill.slipUrl,
              electricUnits: update.formattedBill.electricUnits,
              waterUnits: update.formattedBill.waterUnits,
              penaltyAmount: update.formattedBill.penaltyAmount || 0,
              lateDays: update.formattedBill.lateDays || 0,
              otherServiceAmount: update.formattedBill.otherServiceAmount,
              invoiceId: update.formattedBill.invoiceId
            } : {})
          }
        }
        return i
      }))

      // อัปเดตข้อมูลแคชของ Workspace เพื่อให้สลับหน้าไปมาไม่เจอบั๊กข้อมูลค้าง
      if (currentWorkspaceId) {
        // จัดการมิเตอร์
        const cachedMeters = getCachedData(currentWorkspaceId, `meters_${billingCycle}`) || []
        let updatedMeters = [...cachedMeters]
        updatedMetersList.forEach(formattedMeter => {
          const idx = updatedMeters.findIndex((m: any) => m.roomId === formattedMeter.roomId)
          if (idx >= 0) {
            updatedMeters[idx] = { ...updatedMeters[idx], ...formattedMeter }
          } else {
            updatedMeters.push(formattedMeter)
          }
        })
        setCachedData(currentWorkspaceId, `meters_${billingCycle}`, updatedMeters)

        // จัดการบิล
        const cachedBills = getCachedData(currentWorkspaceId, `bills_${billingCycle}`) || []
        let updatedBills = [...cachedBills]
        updatedBillsList.forEach(formattedBill => {
          const idx = updatedBills.findIndex((b: any) => b.roomId === formattedBill.roomId)
          if (idx >= 0) {
            updatedBills[idx] = { ...updatedBills[idx], ...formattedBill }
          } else {
            updatedBills.push(formattedBill)
          }
        })
        setCachedData(currentWorkspaceId, `bills_${billingCycle}`, updatedBills)
      }

      const successText = type === "electric"
        ? t("billing.elec_meter")
        : type === "water"
          ? t("billing.water_meter")
          : t("billing.entry_mode_both")

      if (skippedRooms.length > 0) {
        // จำกัดความยาวรายชื่อห้อง ไม่ให้ toast ยาวจนอ่านไม่ได้เมื่อข้ามหลายสิบห้อง
        const preview = skippedRooms.slice(0, 5).join(", ")
        const roomsText = skippedRooms.length > 5
          ? t("billing.bulk_save_skipped_rooms_more")
              .replace("{rooms}", preview)
              .replace("{rest}", String(skippedRooms.length - 5))
          : preview
        showToast(
          t("billing.toast_bulk_save_partial")
            .replace("{type}", successText)
            .replace("{saved}", String(eligible.length))
            .replace("{skipped}", String(skippedRooms.length))
            .replace("{rooms}", roomsText)
        )
      } else {
        showToast(t("billing.toast_bulk_save_success").replace("{type}", successText))
      }
    } catch (err) {
      console.error(err)
      alert(t("manage_bills.err_unexpected"))
    } finally {
      setSavingAll(false)
      // ยุบช่วงระงับที่ตั้งเผื่อไว้ 30 วิ ให้เหลือแค่หางสั้น ๆ นับจากตอนนี้ — พอคลุม event ชุดสุดท้าย
      // ที่ยังเดินทางมา แต่ไม่กลืนการอัปเดตจริงจากผู้เช่านานเกินจำเป็น (และไม่ค้าง 30 วิ เมื่อบันทึกล้มเหลว)
      suppressBackgroundRefresh(5000)
    }
  }

  // ส่งข้อมูลเข้า LINE OA ของจริง
  const handleSendLine = async (roomId: RoomId) => {
    if (!userPermissions.billing_send_line) {
      alert(t("manage_bills.err_no_permission_line"))
      return
    }

    // 1. ค้นหาข้อมูลห้องพักจาก List เพื่อหยิบ lineUserId ของผู้เช่าจริงออกมา
    const roomInfo = roomsList.find((r: any) => r.id === roomId)
    const lineUserId = roomInfo?.lineUserId
    // เลขห้องสำหรับแสดงข้อความเท่านั้น (หาจาก roomsList เพราะยังไม่แน่ว่ามี item)
    const roomLabel = roomInfo?.roomNumber ?? ""

    if (!lineUserId) {
      showToast(t("manage_bills.err_line_not_linked").replace("{room}", roomLabel))
      return
    }

    // 2. ค้นหาบิลประจำงวดของห้องนั้นๆ
    const item = unifiedItems.find((x: any) => x.roomId === roomId)
    if (!item) {
      showToast(t("manage_bills.err_no_bill_data_room").replace("{room}", roomLabel))
      return
    }

    if (item.billStatus === "not_created") {
      showToast(t("manage_bills.err_calc_bill_first").replace("{room}", roomLabel))
      return
    }

    if (item.billStatus === "paid") {
      alert(t("manage_bills.info_already_paid").replace("{room}", roomLabel))
      return
    }

    try {
      const elecUnitsUsed = item.elecCurr !== "" ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr)) : 0
      const waterUnitsUsed = item.waterCurr !== "" ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr)) : 0

      const elecCost = !item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
      const waterCost = !item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate

      const { sendLineBillNotificationAction } = await import("@/features/notification/actions")
      const result = await sendLineBillNotificationAction({
        lineUserId,
        roomNumber: item.roomNumber,
        roomId: item.roomId,
        tenantName: item.tenantName || (locale === "en" ? "Tenant" : "ผู้เช่า"),
        billingCycle: formatBillingCycle(billingCycle, locale),
        baseRent: item.baseRent,
        electricUnits: elecUnitsUsed,
        electricAmount: elecCost,
        waterUnits: waterUnitsUsed,
        waterAmount: waterCost,
        commonFee: commonFee,
        totalAmount: item.billAmount,
        workspaceName: workspaceName || "หอพักของเรา",
        workspaceId: currentWorkspaceId,
      })

      if (result.success) {
        showToast(t("manage_bills.sent_line_success").replace("{room}", roomLabel))
      } else {
        showToast(`${t("manage_bills.err_line_send_failed_prefix")}${result.error}`)
      }
    } catch (err: any) {
      console.error(err)
      showToast(t("manage_bills.err_line_send_exception"))
    }
  }

  // หายอดบิลรวมทั้งอาคาร (ไฟฟ้า/น้ำ) ของห้องนี้ในรอบบิลปัจจุบัน — ใช้แสดง "รายละเอียดใบแจ้งหนี้จริงจากหน่วยงาน"
  // ในบิล PDF เฉพาะตอนเปิดโหมด building_total เท่านั้น (คืนค่า null ถ้าไม่เข้าเงื่อนไข ไม่ใช้ 0)
  const getBuildingTotalsForRoom = (roomId: RoomId) => {
    const roomBuildingId = roomsList?.find((r: any) => r.id === roomId)?.buildingId
    const electricRow = roomBuildingId && electricBillingMode === "building_total"
      ? buildingUtilityBills.find(b => b.buildingId === roomBuildingId && b.utilityType === "electric")
      : undefined
    const waterRow = roomBuildingId && waterBillingMode === "building_total"
      ? buildingUtilityBills.find(b => b.buildingId === roomBuildingId && b.utilityType === "water")
      : undefined
    return {
      electricBuildingTotalAmount: electricRow ? electricRow.totalAmount : null,
      electricBuildingTotalUnits: electricRow ? electricRow.totalUnits : null,
      waterBuildingTotalAmount: waterRow ? waterRow.totalAmount : null,
      waterBuildingTotalUnits: waterRow ? waterRow.totalUnits : null
    }
  }

  // ดาวน์โหลดบิล PDF
  const handleDownloadBillPdf = async (item: UnifiedRoomBillingItem) => {
    if (!userPermissions.billing_download_pdf) {
      alert(t("manage_bills.err_no_permission_pdf"))
      return
    }
    setDownloadingPdfId(item.roomId)
    try {
      const { generateBillPdf } = await import("@/lib/pdfHelper")
      const elecUnitsUsed = item.elecCurr !== "" ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr)) : 0
      const waterUnitsUsed = item.waterCurr !== "" ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr)) : 0

      const blob = await generateBillPdf({
        roomNumber: roomLabelOf(item),
        tenantName: item.tenantName || (locale === "en" ? "Tenant" : "ผู้เช่า"),
        billingCycle: formatBillingCycle(billingCycle, locale),
        baseRent: item.baseRent,
        electricUnits: elecUnitsUsed,
        electricRate: elecRate,
        waterUnits: waterUnitsUsed,
        waterRate: waterRate,
        commonFee,
        waterMinChecked,
        waterMinUnit,
        electricMinChecked,
        electricMinUnit,
        amount: item.billAmount || (() => {
          const elecCost = !item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
          const waterCost = !item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate
          const roomInfo = roomsList?.find((r: any) => r.id === item.roomId)
          const extraExpenses = roomInfo?.extraExpenses || []
          const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0
          return item.baseRent + elecCost + waterCost + commonFee + (item.otherServiceAmount || 0) + extraExpensesSum
        })(),
        extraExpenses: roomsList?.find((r: any) => r.id === item.roomId)?.extraExpenses || [],
        waiveElectricMin: item.waiveElectricMin,
        waiveWaterMin: item.waiveWaterMin,
        promptPayId,
        promptPayName,
        workspaceName,
        workspaceAddress,
        workspacePhone,
        workspaceTaxId,
        penaltyAmount: item.penaltyAmount || 0,
        lateDays: item.lateDays || 0,
        latePenaltyRate: latePenaltyRate,
        otherServiceAmount: item.otherServiceAmount || 0,
        vatAmount: item.vatAmount || 0,
        invoiceId: item.invoiceId || buildInvoiceId(billingCycle, item.roomNumber, findRoomRow(item.roomId)?.buildingCode),
        elecPrev: item.elecPrev === "" ? null : Number(item.elecPrev),
        elecCurr: item.elecCurr === "" ? null : Number(item.elecCurr),
        waterPrev: item.waterPrev === "" ? null : Number(item.waterPrev),
        waterCurr: item.waterCurr === "" ? null : Number(item.waterCurr),
        billingCycleRaw: billingCycle,
        ...getBuildingTotalsForRoom(item.roomId)
      })

      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `bill_room${pdfFileSafeRoom(item)}_${billingCycle}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToast(t("manage_bills.downloaded_pdf").replace("{room}", roomLabelOf(item)))
    } catch (e) {
      console.error(e)
      alert(t("manage_bills.err_pdf_generate"))
    } finally {
      setDownloadingPdfId(null)
    }
  }

  // ดาวน์โหลดบิล PDF ทุกห้องพร้อมกันเป็นไฟล์ ZIP
  const handleDownloadAllBillsPdf = async () => {
    if (!userPermissions.billing_download_pdf) {
      alert(t("manage_bills.err_no_permission_pdf"))
      return
    }

    if (unifiedItems.length === 0) {
      alert(t("manage_bills.err_no_bills_download"))
      return
    }

    setDownloadingAllPdf(true)
    try {
      const { generateBillPdf } = await import("@/lib/pdfHelper")
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      let addedCount = 0

      for (const item of unifiedItems) {
        // เฉพาะห้องที่มีผู้เช่าและข้อมูลครบถ้วนสำหรับการทำบิล
        if (!item.tenantName) continue

        const elecUnitsUsed = item.elecCurr !== "" ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr)) : 0
        const waterUnitsUsed = item.waterCurr !== "" ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr)) : 0

        const blob = await generateBillPdf({
          roomNumber: roomLabelOf(item),
          tenantName: item.tenantName || (locale === "en" ? "Tenant" : "ผู้เช่า"),
          billingCycle: formatBillingCycle(billingCycle, locale),
          baseRent: item.baseRent,
          electricUnits: elecUnitsUsed,
          electricRate: elecRate,
          waterUnits: waterUnitsUsed,
          waterRate: waterRate,
          commonFee,
          waterMinChecked,
          waterMinUnit,
          electricMinChecked,
          electricMinUnit,
          amount: item.billAmount || (() => {
            const elecCost = !item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
            const waterCost = !item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate
            const roomInfo = roomsList?.find((r: any) => r.id === item.roomId)
            const extraExpenses = roomInfo?.extraExpenses || []
            const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0
            return item.baseRent + elecCost + waterCost + commonFee + (item.otherServiceAmount || 0) + extraExpensesSum
          })(),
          extraExpenses: roomsList?.find((r: any) => r.id === item.roomId)?.extraExpenses || [],
          waiveElectricMin: item.waiveElectricMin,
          waiveWaterMin: item.waiveWaterMin,
          promptPayId,
          promptPayName,
          workspaceName,
          workspaceAddress,
          workspacePhone,
          workspaceTaxId,
          penaltyAmount: item.penaltyAmount || 0,
          lateDays: item.lateDays || 0,
          latePenaltyRate: latePenaltyRate,
          otherServiceAmount: item.otherServiceAmount || 0,
          vatAmount: item.vatAmount || 0,
          invoiceId: item.invoiceId || buildInvoiceId(billingCycle, item.roomNumber, findRoomRow(item.roomId)?.buildingCode),
          elecPrev: item.elecPrev === "" ? null : Number(item.elecPrev),
          elecCurr: item.elecCurr === "" ? null : Number(item.elecCurr),
          waterPrev: item.waterPrev === "" ? null : Number(item.waterPrev),
          waterCurr: item.waterCurr === "" ? null : Number(item.waterCurr),
          billingCycleRaw: billingCycle,
          ...getBuildingTotalsForRoom(item.roomId)
        })

        const fileName = `bill_room${pdfFileSafeRoom(item)}_${billingCycle}.pdf`
        zip.file(fileName, blob)
        addedCount++
      }

      if (addedCount === 0) {
        alert(t("manage_bills.err_no_tenant_bills"))
        setDownloadingAllPdf(false)
        return
      }

      // สร้างไฟล์ zip และทริกเกอร์ดาวน์โหลด
      const content = await zip.generateAsync({ type: "blob" })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(content)
      link.download = `bills_${workspaceName || "rooms"}_${billingCycle}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      showToast(t("manage_bills.downloaded_all_pdf").replace("{count}", String(addedCount)))
    } catch (e) {
      console.error(e)
      alert(t("manage_bills.err_download_all_failed"))
    } finally {
      setDownloadingAllPdf(false)
    }
  }

  // สร้างบิลด้วยตนเอง (สำหรับกรณีพิเศษ)
  const handleCreateBillManual = async (e: React.FormEvent) => {
    e.preventDefault()
    
    let targetTenant = ""
    const room = roomsList.find(r => r.id === newRoomId)
    if (!room) {
      alert(t("manage_bills.err_no_tenant_or_expired"))
      return
    }
    if (room) {
      const sortedTenants = [...(room.allTenants || [])].sort((a: any, b: any) => {
        const aTime = a.leaseStart ? new Date(a.leaseStart).getTime() : 0
        const bTime = b.leaseStart ? new Date(b.leaseStart).getTime() : 0
        return bTime - aTime
      })
      const activeTenant = (room.allTenants || []).find((t: any) => {
        const tIsLatest = sortedTenants[0]?.id === t.id
        return isTenantActiveInCycle(t.leaseStart, t.leaseEnd, billingCycle, tIsLatest)
      })
      if (activeTenant && activeTenant.tenantName) {
        targetTenant = activeTenant.tenantName
      }
    }

    if (!targetTenant) {
      alert(t("manage_bills.err_no_tenant_or_expired"))
      return
    }

    const res = await createBill(
      { roomId: newRoomId },
      targetTenant,
      computedTotal,
      "unpaid",
      billingCycle,
      elecUnitsManual,
      waterUnitsManual,
      otherServiceAmountManual
    )
    if (res.success) {
      showToast(t("manage_bills.created_manual_bill").replace("{room}", room.roomNumber))
      const formatted = formatDbBillToCamelCase(res.data)
      updateLocalStateAndCache(asRoomId(newRoomId), undefined, formatted)
    } else {
      alert(res.error || t("manage_bills.err_bill_create_failed"))
      return
    }

    setCreateBillModalOpen(false)
  }

  // รายการห้องที่กรองตามอาคารที่เลือก (ใช้แสดงผลในตารางเท่านั้น สถิติด้านบนยังคงนับรวมทั้งหมดของหอ)
  // เลขห้องที่ซ้ำกันในหอนี้ — คำนวณจาก unifiedItems ทั้งก้อน ไม่ใช่ชุดที่กรองแล้ว เพื่อให้ป้ายกำกับ
  // อาคารไม่หาย/ไม่โผล่สลับไปมาเวลาผู้ใช้เปลี่ยนตัวกรองอาคาร (ซึ่งจะทำให้สับสนกว่าเดิม)
  const duplicatedRoomNumbers = useMemo(() => findDuplicateRoomNumbers(unifiedItems), [unifiedItems])

  /** หาแถวห้องจาก rooms.id — ใช้ดึงรหัสอาคารไปประกอบป้ายกำกับเลขห้องและเลขใบกำกับ */
  const findRoomRow = (roomId: string): { buildingCode?: string | null; buildingName?: string | null } | undefined =>
    roomsList?.find((r: { id: string }) => r.id === roomId)

  // ข้อความเลขห้องที่แสดง — เติมรหัสอาคารต่อท้ายเฉพาะเลขห้องที่ซ้ำกัน
  // (หอที่ไม่มีเลขห้องซ้ำกันเลยจะได้ข้อความเหมือนเดิมทุกแถว)
  const roomLabelOf = (item: { roomId: RoomId; roomNumber: string }): string => {
    const row = findRoomRow(item.roomId)
    return formatRoomLabel(item.roomNumber, duplicatedRoomNumbers, { code: row?.buildingCode, name: row?.buildingName })
  }

  // ชื่อไฟล์ PDF — ต้องแยกกันด้วยเมื่อเลขห้องซ้ำ ไม่งั้นดาวน์โหลดทั้งอาคารเป็น zip แล้วไฟล์ทับกันหายไปใบหนึ่ง
  const pdfFileSafeRoom = (item: { roomId: RoomId; roomNumber: string }): string =>
    roomLabelOf(item).replace(/[^\p{L}\p{N}_-]+/gu, "")

  const filteredUnifiedItems = buildingFilter === "all"
    ? unifiedItems
    : unifiedItems.filter(item => item.buildingId === buildingFilter)

  // ชั้นที่มีอยู่จริงในอาคารที่เลือก (คิดจาก rooms.floor หรือเดาจากเลขห้องด้วย logic เดียวกับหน้าผู้เช่า)
  const availableFloors = useMemo(
    () => sortFloors([...new Set(filteredUnifiedItems.map(item => getRoomFloor(item, roomsList)))]),
    [filteredUnifiedItems, roomsList]
  )

  // ถ้าชั้นที่จำไว้ไม่มีอยู่ในอาคาร/รอบบิลที่เลือก (เช่น เพิ่งสลับอาคาร) ให้ถือว่าเป็น "ทุกชั้น"
  // เพื่อไม่ให้ตารางว่างเปล่าโดยไม่มีเหตุผล — แต่ไม่เขียนค่าลง DB เพราะผู้ใช้ไม่ได้สั่งเปลี่ยนเอง
  const effectiveMeterFloor =
    meterEntryFloor !== "all" && !availableFloors.includes(meterEntryFloor) ? "all" : meterEntryFloor

  // การตั้งค่า 2 อย่างในโมดอล เก็บลง 2 คอลัมน์เดิมที่มีอยู่แล้ว ไม่ต้องรัน SQL เพิ่ม:
  //   meter_entry_utility === "both" → จดพร้อมกัน | ค่าอื่น → จดแยกน้ำ-ไฟ (ไฟ/น้ำ เลือกที่แท็บในตาราง)
  //   meter_entry_floor === "all"    → แสดงทั้งหมด | ชื่อชั้น → แสดงแยกชั้น และกำลังดูชั้นนั้น
  const isRecordTogether = meterEntryUtility === "both"
  const isByFloor = effectiveMeterFloor !== "all"
  // แสดงแยกชั้นได้เฉพาะหอที่มีมากกว่า 1 ชั้น ไม่งั้นเป็นตัวเลือกที่ไม่มีความหมาย
  const canGroupByFloor = availableFloors.length > 1

  // รายการห้องของ "แท็บจดเลขมิเตอร์" — กรองชั้นเพิ่มจากตัวกรองอาคาร
  // แยกจาก filteredUnifiedItems เพื่อไม่ให้ตัวกรองชั้นรั่วไปแท็บสรุปบิล (ตามที่ตกลงไว้)
  const meterTabItems = useMemo(
    () => effectiveMeterFloor === "all"
      ? filteredUnifiedItems
      : filteredUnifiedItems.filter(item => getRoomFloor(item, roomsList) === effectiveMeterFloor),
    [filteredUnifiedItems, roomsList, effectiveMeterFloor]
  )

  // นับห้องที่กรอกเลขค้างไว้แต่ยังไม่บันทึก จาก "ทั้งหอ" ไม่ใช่แค่ชั้น/อาคารที่กำลังดูอยู่
  // เพื่อกันลืมข้ามชั้น (ตราบใดที่ยังค้าง refresh เบื้องหลังจะถูกบล็อกไว้อยู่แล้ว)
  const totalUnsavedCount = useMemo(
    () => unifiedItems.filter(item => item.isEdited).length,
    [unifiedItems]
  )

  // คำนวณสรุปสถิติด้านบนของแดชบอร์ด (ปรับเปลี่ยนให้เหมาะสมกับห้องว่าง/ไม่มีผู้เช่า)
  //
  // นับจาก filteredUnifiedItems (ผ่านตัวกรองอาคารแล้ว) ไม่ใช่ unifiedItems ทั้งก้อน — เดิมเลือกอาคาร A
  // แล้วตารางแสดง 20 ห้อง แต่การ์ดด้านบนยังนับทั้งหอ 40 ห้อง อ่านแล้วไม่รู้ว่า 40 มาจากไหน
  // (ไม่กรองตามชั้น เพราะตัวกรองชั้นมีผลแค่แท็บจดเลขมิเตอร์ แต่การ์ดนี้แสดงบนทั้งสองแท็บ)
  const totalOccupied = filteredUnifiedItems.filter(item => item.tenantName).length
  const billedCount = filteredUnifiedItems.filter(item => item.tenantName && item.isMeterSaved).length
  const paidCount = filteredUnifiedItems.filter(item => item.billStatus === "paid").length
  const pendingCount = filteredUnifiedItems.filter(item => item.billStatus === "pending").length
  const unpaidCount = filteredUnifiedItems.filter(item => item.tenantName && (item.billStatus === "unpaid" || item.billStatus === "not_created")).length

  return (
    <>
      {/* Toast แจ้งเตือน */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 glass-panel border border-teal-500/30 text-teal-400 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up text-xs font-semibold">
          <CheckCircle className="w-4 h-4 text-teal-400" /> {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <Gauge className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            {t("billing.title")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {t("billing.subtitle")}
          </p>
        </div>
        
        <div className="flex flex-col gap-3 w-full md:w-auto md:items-end">
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* แถบเลือกเดือนรอบบิล */}
          <select
            className={`w-full md:w-auto h-11 px-4 xl:h-12 xl:px-5 2xl:h-14 2xl:px-6 border rounded-xl focus:outline-none focus:border-blue-500 text-sm xl:text-base 2xl:text-lg font-bold transition-all cursor-pointer ${
              isDark ? "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-850" : "bg-white border-slate-300 text-slate-800 hover:bg-slate-50"
            }`}
            value={billingCycle}
            onChange={(e) => {
              const val = e.target.value
              
              const parts = val.split('-')
              if (parts.length === 2) {
                sessionStorage.setItem("dashboard_year", parts[0])
                sessionStorage.setItem("dashboard_month", parts[1])
              }
              
              const params = new URLSearchParams(window.location.search)
              params.set("cycle", val)
              if (parts.length === 2) {
                params.set("year", parts[0])
                params.set("month", parts[1])
              }
              router.replace(`?${params.toString()}`, { scroll: false })
            }}
          >
            {getBillingCycleOptions(t, locale, registrationCycle).map(opt => (
              <option key={opt.value} value={opt.value} className={isDark ? "bg-slate-900 text-slate-200" : "bg-white text-slate-800"}>{opt.label}</option>
            ))}
          </select>

          {/* ปุ่มตั้งค่ารูปแบบการจดมิเตอร์ — อยู่ติดตัวเลือกรอบบิล เปิดโมดอลตั้งค่า
              แสดงเฉพาะแท็บจดเลขมิเตอร์ เพราะการตั้งค่าไม่มีผลกับแท็บสรุปบิล
              และเฉพาะคนที่มีสิทธิ์แก้มิเตอร์/บิล เพราะเป็นค่าระดับ workspace ที่ทุกคนในหอเห็นเหมือนกัน */}
          {pageActiveTab === "meters" && userPermissions.manage_meters_bills_edit && (
            <button
              type="button"
              onClick={() => setMeterEntrySettingsOpen(true)}
              title={t("billing.entry_settings_title")}
              className={`w-full md:w-auto h-11 px-4 xl:h-12 xl:px-5 2xl:h-14 2xl:px-6 border rounded-xl text-sm xl:text-base 2xl:text-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap ${
                isDark ? "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-850" : "bg-white border-slate-300 text-slate-800 hover:bg-slate-50"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>{t("billing.entry_settings_button")}</span>
            </button>
          )}

          {/* ตัวกรองอาคาร — แสดงเฉพาะเมื่อหอมีมากกว่า 1 อาคาร */}
          {buildings.length > 1 && (
            <select
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
              className={`w-full md:w-auto h-11 px-4 xl:h-12 xl:px-5 2xl:h-14 2xl:px-6 border rounded-xl focus:outline-none focus:border-teal-500 text-sm xl:text-base 2xl:text-lg font-bold transition-all cursor-pointer ${
                isDark ? "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-850" : "bg-white border-slate-300 text-slate-800 hover:bg-slate-50"
              }`}
            >
              <option value="all">ทุกอาคาร</option>
              {buildings.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}

        </div>
        </div>
      </div>

      {/* สรุปสถิติด้านบนของแดชบอร์ด */}
      <BillingSummaryStats
        isDark={isDark}
        billedCount={billedCount}
        totalOccupied={totalOccupied}
        paidCount={paidCount}
        pendingCount={pendingCount}
        unpaidCount={unpaidCount}
        showOnlyMeterSaved={true}
      />

      {/* ยอดบิลรวมทั้งอาคาร (แสดงเฉพาะเมื่อเปิดโหมดหารตามสัดส่วนของไฟฟ้าและ/หรือน้ำประปา) */}
      <div className="mt-6">
        <BuildingUtilityBillPanel
          workspaceId={currentWorkspaceId}
          billingCycle={billingCycle}
          electricBillingMode={electricBillingMode}
          waterBillingMode={waterBillingMode}
          buildings={buildings}
          externalBuildingId={buildingFilter !== "all" ? buildingFilter : undefined}
          onSaved={(row) => {
            setBuildingUtilityBills(prev => [
              ...prev.filter(b => !(b.buildingId === row.buildingId && b.utilityType === row.utilityType)),
              row
            ])
          }}
        />
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mt-8 mb-8">
        <button
          onClick={() => setPageActiveTab("meters")}
          className={`px-6 py-3.5 xl:px-8 xl:py-4 2xl:px-10 2xl:py-5 font-bold text-sm md:text-base xl:text-lg 2xl:text-xl transition-all border-b-2 -mb-[2px] cursor-pointer flex items-center gap-2.5 ${
            pageActiveTab === "meters"
              ? "border-blue-500 text-blue-600 dark:text-blue-400 font-black"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Gauge className="w-5 h-5 xl:w-6 xl:h-6 2xl:w-7 2xl:h-7 text-blue-500" />
          <span>{t("billing.meters_tab")}</span>
        </button>
        <button
          onClick={() => setPageActiveTab("summary")}
          className={`px-6 py-3.5 xl:px-8 xl:py-4 2xl:px-10 2xl:py-5 font-bold text-sm md:text-base xl:text-lg 2xl:text-xl transition-all border-b-2 -mb-[2px] cursor-pointer flex items-center gap-2.5 ${
            pageActiveTab === "summary"
              ? "border-teal-500 text-teal-600 dark:text-teal-400 font-black"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="w-5 h-5 xl:w-6 xl:h-6 2xl:w-7 2xl:h-7 text-teal-500" />
          <span>{t("billing.summary_tab")}</span>
        </button>
      </div>

      {/* Render based on Page Tab */}
      {pageActiveTab === "meters" ? (
        <MeterReadingTable
          isDark={isDark}
          loading={loading}
          savingRows={savingRows}
          userPermissions={userPermissions}
          hasEditPermission={userPermissions.manage_meters_bills_edit}
          unifiedItems={meterTabItems}
          commonFee={commonFee}
          electricMinChecked={electricMinChecked}
          electricMinUnit={electricMinUnit}
          elecRate={elecRate}
          waterMinChecked={waterMinChecked}
          waterMinUnit={waterMinUnit}
          waterRate={waterRate}
          currentUserRole={currentUserRole}
          downloadingPdfId={downloadingPdfId}
          handleElecPrevChange={handleElecPrevChange}
          handleElecChange={handleElecChange}
          handleWaterPrevChange={handleWaterPrevChange}
          handleWaterChange={handleWaterChange}
          handleSaveRow={handleSaveRow}
          setSelectedBill={setSelectedBill}
          setSlipModalOpen={setSlipModalOpen}
          handleDownloadBillPdf={handleDownloadBillPdf}
          handleSendLine={handleSendLine}
          handleMarkAsPaid={handleMarkAsPaid}
          handleSaveAll={handleSaveAll}
          roomsList={roomsList}
          usageAverages={usageAverages}
          billingCycle={billingCycle}
          workspaceName={workspaceName}
          currentWorkspaceId={currentWorkspaceId}
          handleLateDaysChange={handleLateDaysChange}
          handleSaveLateDays={handleSaveLateDays}
          latePenaltyRate={latePenaltyRate}
          handleOtherServiceChange={handleOtherServiceChange}
          mode="meters"
          recordTogether={isRecordTogether}
          byFloor={isByFloor}
          floorOptions={availableFloors}
          selectedFloor={effectiveMeterFloor}
          onFloorChange={(floor) => applyMeterEntryMode(meterEntryUtility, floor)}
          totalUnsavedCount={totalUnsavedCount}
          meterReplacements={meterReplacements}
          onMeterReplacementsChange={async () => {
            await loadData(billingCycle, true)
          }}
        />
      ) : (
        <div className={`p-4 md:p-5 bg-transparent md:rounded-2xl md:shadow-sm ${
          isDark 
            ? "md:bg-slate-900/30 md:border md:border-slate-800/80" 
            : "md:bg-white md:border md:border-slate-200"
        }`}>
          {/* Desktop Summary Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm sm:text-base border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold bg-slate-50/50 dark:bg-slate-900/10 text-xs sm:text-sm xl:text-base 2xl:text-lg">
                  <th className="py-3.5 xl:py-4 2xl:py-5 pl-3 xl:pl-4 2xl:pl-5 w-20 xl:w-24 2xl:w-28">{t("billing.room_number")}</th>
                  <th className="py-3.5 xl:py-4 2xl:py-5 text-center w-28 xl:w-32 2xl:w-36">{t("billing.room_status")}</th>
                  <th className="py-3.5 xl:py-4 2xl:py-5 text-right w-28 xl:w-32 2xl:w-36">{t("billing.room_rent")}</th>
                  <th className="py-3.5 xl:py-4 2xl:py-5 text-center bg-blue-50/40 dark:bg-blue-500/5 rounded-t-xl w-44 xl:w-52 2xl:w-60 border-l border-slate-200 dark:border-slate-800/40 text-blue-600 dark:text-blue-400 font-bold">{t("billing.elec_meter")}</th>
                  <th className="py-3.5 xl:py-4 2xl:py-5 text-center bg-teal-50/40 dark:bg-teal-500/5 rounded-t-xl w-44 xl:w-52 2xl:w-60 border-l border-r border-slate-200 dark:border-slate-800/40 text-teal-600 dark:text-teal-400 font-bold">{t("billing.water_meter")}</th>
                  <th className="py-3.5 xl:py-4 2xl:py-5 text-right w-28 xl:w-32 2xl:w-36">{t("billing.common_fee")}</th>
                  <th className="py-3.5 xl:py-4 2xl:py-5 text-right pr-4 xl:pr-5 2xl:pr-6 w-44 xl:w-52 2xl:w-60 font-bold">{t("billing.total_bill")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-6 h-6 xl:w-7 xl:h-7 2xl:w-8 2xl:h-8 text-blue-500 animate-spin" />
                        <span className="text-xs sm:text-sm xl:text-base 2xl:text-lg">{t("billing.loading_summary")}</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredUnifiedItems.length > 0 ? (
                  filteredUnifiedItems.map((item) => {
                    const hasElecCurr = item.elecCurr !== "" && item.elecCurr !== null && item.elecCurr !== undefined
                    const elecUnitsUsed = hasElecCurr ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr)) : 0
                    const elecCost = hasElecCurr && elecUnitsUsed >= 0
                      ? (!item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? electricMinUnit * elecRate : elecUnitsUsed * elecRate)
                      : 0

                    const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
                    const waterUnitsUsed = hasWaterCurr ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr)) : 0
                    const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                      ? (!item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? waterMinUnit * waterRate : waterUnitsUsed * waterRate)
                      : 0

                    const simplifiedTotal = item.baseRent + elecCost + waterCost + commonFee

                    return (
                      <tr key={item.roomId} className={`transition-colors ${isDark ? "hover:bg-slate-900/15" : "hover:bg-slate-50/80"}`}>
                        <td className={`py-4 xl:py-5 2xl:py-6 pl-3 xl:pl-4 2xl:pl-5 font-black text-sm sm:text-base xl:text-lg 2xl:text-xl ${isDark ? "text-slate-100" : "text-slate-800"}`}>{roomLabelOf(item)}</td>
                        
                        {/* สถานะห้อง */}
                        <td className="py-4 xl:py-5 2xl:py-6 text-center">
                          {item.status === "occupied" ? (
                            <span className="inline-flex items-center px-2.5 py-1 xl:px-3.5 xl:py-1.5 2xl:px-4 2xl:py-2 rounded-full text-xs sm:text-sm xl:text-base 2xl:text-lg font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              {t("billing.occupied")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 xl:px-3.5 xl:py-1.5 2xl:px-4 2xl:py-2 rounded-full text-xs sm:text-sm xl:text-base 2xl:text-lg font-bold bg-slate-500/10 text-slate-500 dark:text-slate-400">
                              {t("billing.vacant")}
                            </span>
                          )}
                        </td>

                        {/* ค่าเช่าห้อง */}
                        <td className={`py-4 xl:py-5 2xl:py-6 text-right font-mono text-sm sm:text-base xl:text-lg 2xl:text-xl ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          {item.tenantName ? `${item.baseRent.toLocaleString()}.-` : "-"}
                        </td>

                        {/* มิเตอร์ไฟฟ้า */}
                        <td className="py-4 xl:py-5 2xl:py-6 text-center bg-blue-50/10 dark:bg-blue-500/5 border-l border-slate-200 dark:border-slate-800/40 px-3 xl:px-4 2xl:px-5">
                          {hasElecCurr ? (
                            <div className="flex flex-col items-center justify-center">
                              <div className="text-sm sm:text-base xl:text-lg 2xl:text-xl font-black text-blue-600 dark:text-blue-400 font-mono">
                                {elecCost.toLocaleString()}.-
                              </div>
                              <div className="text-xs sm:text-sm xl:text-base 2xl:text-lg text-slate-400 dark:text-slate-500 font-semibold mt-0.5 xl:mt-1">
                                {item.elecPrev} ➔ {item.elecCurr} ({t("billing.used_units").replace("{units}", String(elecUnitsUsed))})
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs sm:text-sm xl:text-base 2xl:text-lg text-slate-400 dark:text-slate-500 italic">{t("billing.no_meter_data")}</span>
                          )}
                        </td>

                        {/* มิเตอร์น้ำ */}
                        <td className="py-4 xl:py-5 2xl:py-6 text-center bg-teal-50/10 dark:bg-teal-500/5 border-l border-r border-slate-200 dark:border-slate-800/40 px-3 xl:px-4 2xl:px-5">
                          {hasWaterCurr ? (
                            <div className="flex flex-col items-center justify-center">
                              <div className="text-sm sm:text-base xl:text-lg 2xl:text-xl font-black text-teal-600 dark:text-teal-400 font-mono">
                                {waterCost.toLocaleString()}.-
                              </div>
                              <div className="text-xs sm:text-sm xl:text-base 2xl:text-lg text-slate-400 dark:text-slate-500 font-semibold mt-0.5 xl:mt-1">
                                {item.waterPrev} ➔ {item.waterCurr} ({t("billing.used_units").replace("{units}", String(waterUnitsUsed))})
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs sm:text-sm xl:text-base 2xl:text-lg text-slate-400 dark:text-slate-500 italic">{t("billing.no_meter_data")}</span>
                          )}
                        </td>

                        {/* ค่าส่วนกลาง */}
                        <td className={`py-4 xl:py-5 2xl:py-6 text-right font-mono text-sm sm:text-base xl:text-lg 2xl:text-xl ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          {item.tenantName ? `${commonFee.toLocaleString()}.-` : "-"}
                        </td>

                        {/* ยอดบิลรวม */}
                        <td className="py-4 xl:py-5 2xl:py-6 text-right pr-4 xl:pr-5 2xl:pr-6 font-mono">
                          {item.tenantName ? (
                            <div className="flex flex-col items-end">
                              <div className={`text-sm sm:text-base xl:text-lg 2xl:text-xl font-black ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                                {simplifiedTotal.toLocaleString()}.-
                              </div>
                              <div className="text-xs sm:text-sm xl:text-base 2xl:text-lg text-slate-400 dark:text-slate-500">
                                {`${item.baseRent.toLocaleString()} + ${elecCost.toLocaleString()} + ${waterCost.toLocaleString()} + ${commonFee.toLocaleString()}`}
                              </div>
                            </div>
                          ) : (
                            <div className={`text-sm sm:text-base xl:text-lg 2xl:text-xl font-bold ${isDark ? "text-slate-500" : "text-slate-400"}`}>-</div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      {t("billing.no_rooms")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Summary Cards */}
          <div className="block md:hidden space-y-4">
            {loading ? (
              <div className="py-12 text-center text-slate-500">
                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
                <span>{t("billing.loading")}</span>
              </div>
            ) : filteredUnifiedItems.length > 0 ? (
              filteredUnifiedItems.map((item) => {
                const hasElecCurr = item.elecCurr !== "" && item.elecCurr !== null && item.elecCurr !== undefined
                const elecUnitsUsed = hasElecCurr ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr)) : 0
                const elecCost = hasElecCurr && elecUnitsUsed >= 0
                  ? (!item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? electricMinUnit * elecRate : elecUnitsUsed * elecRate)
                  : 0

                const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
                const waterUnitsUsed = hasWaterCurr ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr)) : 0
                const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                  ? (!item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? waterMinUnit * waterRate : waterUnitsUsed * waterRate)
                  : 0

                const simplifiedTotal = item.baseRent + elecCost + waterCost + commonFee

                return (
                  <div key={item.roomId} className={`p-4 rounded-2xl border space-y-3 shadow-sm ${
                    isDark ? "bg-slate-950/35 border-slate-900/60" : "bg-white border-slate-200"
                  }`}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-black px-3 py-1 rounded-xl border ${
                          isDark ? "text-slate-100 bg-slate-900 border-slate-800" : "text-slate-800 bg-slate-100 border-slate-200"
                        }`}>
                          {roomLabelOf(item)}
                        </span>
                        {item.status === "occupied" ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            {t("billing.occupied")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/10 text-slate-500 dark:text-slate-400">
                            {t("billing.vacant")}
                          </span>
                        )}
                      </div>
                      
                      {item.tenantName && (
                        <div className="text-right">
                          <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("billing.total_breakdown_label")}</div>
                          <div className="text-base font-black text-teal-600 dark:text-teal-400 font-mono">
                            {simplifiedTotal.toLocaleString()}.-
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                            {`${item.baseRent.toLocaleString()} + ${elecCost.toLocaleString()} + ${waterCost.toLocaleString()} + ${commonFee.toLocaleString()}`}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`h-px ${isDark ? "bg-slate-900/60" : "bg-slate-200"}`} />

                    <div className="grid grid-cols-2 gap-3">
                      {/* ค่าเช่าห้อง */}
                      <div className={`rounded-xl p-3 border ${
                        isDark ? "bg-slate-900/40 border-slate-800/60" : "bg-slate-50/50 border-slate-100"
                      }`}>
                        <div className={`text-xs font-bold flex items-center gap-1 mb-1 ${isDark ? "text-slate-450" : "text-slate-500"}`}>
                          <Home className="w-3 h-3 text-amber-500" /> {t("billing.room_rent")}
                        </div>
                        <div className={`text-sm font-black font-mono ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                          {item.tenantName ? `${item.baseRent.toLocaleString()}.-` : "-"}
                        </div>
                      </div>

                      {/* ค่าส่วนกลาง */}
                      <div className={`rounded-xl p-3 border ${
                        isDark ? "bg-slate-900/40 border-slate-800/60" : "bg-slate-50/50 border-slate-100"
                      }`}>
                        <div className={`text-xs font-bold flex items-center gap-1 mb-1 ${isDark ? "text-slate-450" : "text-slate-500"}`}>
                          <ShieldAlert className="w-3 h-3 text-indigo-500" /> {t("billing.common_fee")}
                        </div>
                        <div className={`text-sm font-black font-mono ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                          {item.tenantName ? `${commonFee.toLocaleString()}.-` : "-"}
                        </div>
                      </div>

                      {/* ไฟฟ้า */}
                      <div className={`rounded-xl p-3 border ${
                        isDark ? "bg-blue-500/5 border-blue-500/10" : "bg-blue-50/30 border-blue-100"
                      }`}>
                        <div className={`text-xs font-bold flex items-center gap-1 mb-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                          <Zap className="w-3 h-3" /> {t("billing.elec_meter")}
                        </div>
                        {hasElecCurr ? (
                          <div>
                            <div className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">
                              {elecCost.toLocaleString()}.-
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                              {item.elecPrev} ➔ {item.elecCurr} ({t("billing.used_units").replace("{units}", String(elecUnitsUsed))})
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">{t("billing.no_meter_data")}</span>
                        )}
                      </div>

                      {/* น้ำประปา */}
                      <div className={`rounded-xl p-3 border ${
                        isDark ? "bg-teal-500/5 border-teal-500/10" : "bg-teal-50/30 border-teal-100"
                      }`}>
                        <div className={`text-xs font-bold flex items-center gap-1 mb-1 ${isDark ? "text-teal-400" : "text-teal-600"}`}>
                          <Droplet className="w-3 h-3" /> {t("billing.water_meter")}
                        </div>
                        {hasWaterCurr ? (
                          <div>
                            <div className="text-sm font-black text-teal-600 dark:text-teal-400 font-mono">
                              {waterCost.toLocaleString()}.-
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                              {item.waterPrev} ➔ {item.waterCurr} ({t("billing.used_units").replace("{units}", String(waterUnitsUsed))})
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">{t("billing.no_meter_data")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-8 text-center text-slate-500 bg-white dark:bg-slate-950/10 border border-slate-200 dark:border-slate-900/60 rounded-2xl">
                {t("billing.no_rooms")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal ตรวจสอบสลิปโอนเงินธนาคาร */}
      <SlipVerificationModal
        isDark={isDark}
        slipModalOpen={slipModalOpen}
        workspaceId={currentWorkspaceId}
        selectedBill={selectedBill}
        billingCycle={billingCycle}
        onClose={closeSlipModal}
        onApprove={handleApproveSlip}
        onReject={handleRejectSlip}
      />

      {/* Modal สร้างบิลพิเศษกำหนดเอง */}
      <CreateBillModal
        isDark={isDark}
        createBillModalOpen={createBillModalOpen}
        roomsList={roomsList}
        newRoomId={newRoomId}
        setNewRoomId={setNewRoomId}
        billingCycle={billingCycle}
        elecUnitsManual={elecUnitsManual}
        setElecUnitsManual={setElecUnitsManual}
        waterUnitsManual={waterUnitsManual}
        setWaterUnitsManual={setWaterUnitsManual}
        otherServiceAmountManual={otherServiceAmountManual}
        setOtherServiceAmountManual={setOtherServiceAmountManual}
        rentPrice={rentPrice}
        commonFee={commonFee}
        elecRate={electricRateResolved.rate}
        waterRate={waterRateResolved.rate}
        electricMinChecked={electricMinChecked}
        electricMinUnit={electricMinUnit}
        waterMinChecked={waterMinChecked}
        waterMinUnit={waterMinUnit}
        computedTotal={computedTotal}
        vatAmount={computedVatAmount}
        rateMissingWarning={manualBillRateMissing ? "ห้องนี้เปิดโหมด \"หารตามสัดส่วนทั้งอาคาร\" แต่ยังไม่ได้กรอกยอดบิลรวมทั้งอาคารของรอบนี้ (หรือห้องนี้ยังไม่ได้กำหนดอาคาร) กรุณากรอกที่หน้าออกบิลก่อน — ตัวเลขค่าไฟ/น้ำด้านล่างจะยังไม่ถูกต้องจนกว่าจะกรอก" : undefined}
        onClose={() => setCreateBillModalOpen(false)}
        onSubmit={handleCreateBillManual}
      />

      {/* หน้าต่างกำลังบันทึกข้อมูลและออกบิล (Full-Screen Saving Progress Overlay) */}
      <SavingProgressOverlay
        isDark={isDark}
        savingAll={savingAll}
        savingProgress={savingProgress}
      />

      {/* โมดอลตั้งค่ารูปแบบการจดมิเตอร์
          ค่าที่เลือกจำไว้ต่อ workspace และมีผลเฉพาะแท็บจดเลขมิเตอร์
          การกดเปลี่ยนไม่โหลดข้อมูลใหม่ ค่าที่กรอกค้างไว้จึงไม่หาย (ดู applyMeterEntryMode) */}
      {meterEntrySettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 sm:p-6 bg-black/70 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-3xl relative shadow-2xl border ${
            isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
          }`}>
            <button
              type="button"
              onClick={() => setMeterEntrySettingsOpen(false)}
              className={`absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"
              }`}
              aria-label={t("billing.close")}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-6 sm:p-7 space-y-6">
              <div className="pr-10">
                <h3 className={`text-lg sm:text-xl font-black tracking-tight flex items-center gap-2 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  <Settings className="w-5 h-5 text-blue-500 shrink-0" />
                  {t("billing.entry_settings_title")}
                </h3>
                <p className={`text-xs sm:text-sm mt-1.5 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {t("billing.entry_settings_desc")}
                </p>
              </div>

              {/* 1. รูปแบบการจด */}
              <div className="space-y-2.5">
                <div className={`text-xs sm:text-sm font-extrabold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {t("billing.entry_settings_mode_label")}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {([
                    { together: false, label: t("billing.entry_mode_separate"), desc: t("billing.entry_mode_separate_desc"), icon: Zap },
                    { together: true, label: t("billing.entry_mode_together"), desc: t("billing.entry_mode_together_desc"), icon: Gauge }
                  ] as const).map(opt => {
                    const isActive = isRecordTogether === opt.together
                    const Icon = opt.icon
                    return (
                      <button
                        key={String(opt.together)}
                        type="button"
                        onClick={() => applyMeterEntryMode(opt.together ? "both" : "electric", meterEntryFloor)}
                        className={`text-left p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                          isActive
                            ? "border-blue-500 bg-blue-50/60 dark:bg-blue-500/10"
                            : isDark
                              ? "border-slate-800 bg-slate-950/30 hover:border-slate-700"
                              : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className={`flex items-center gap-2 text-sm font-extrabold ${
                          isActive ? "text-blue-700 dark:text-blue-400" : isDark ? "text-slate-200" : "text-slate-800"
                        }`}>
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{opt.label}</span>
                        </div>
                        <p className={`text-[11px] sm:text-xs mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {opt.desc}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 2. การแสดงผล */}
              <div className="space-y-2.5">
                <div className={`text-xs sm:text-sm font-extrabold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {t("billing.entry_settings_display_label")}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {([
                    { byFloor: false, label: t("billing.display_all"), desc: t("billing.display_all_desc") },
                    { byFloor: true, label: t("billing.display_by_floor"), desc: t("billing.display_by_floor_desc") }
                  ] as const).map(opt => {
                    const isActive = isByFloor === opt.byFloor
                    // เลือก "แสดงแยกชั้น" ไม่ได้ถ้าหอมีชั้นเดียว เพราะผลลัพธ์จะเหมือนแสดงทั้งหมด
                    const isDisabled = opt.byFloor && !canGroupByFloor
                    return (
                      <button
                        key={String(opt.byFloor)}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => applyMeterEntryMode(
                          meterEntryUtility,
                          // เข้าโหมดแยกชั้น: ถ้าค้างชั้นไว้อยู่แล้วใช้ชั้นนั้น ไม่งั้นเริ่มที่ชั้นแรก
                          opt.byFloor ? (isByFloor ? effectiveMeterFloor : availableFloors[0]) : "all"
                        )}
                        className={`text-left p-3.5 rounded-2xl border-2 transition-all ${
                          isDisabled
                            ? "opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800"
                            : isActive
                              ? "border-blue-500 bg-blue-50/60 dark:bg-blue-500/10 cursor-pointer"
                              : isDark
                                ? "border-slate-800 bg-slate-950/30 hover:border-slate-700 cursor-pointer"
                                : "border-slate-200 bg-white hover:border-slate-300 cursor-pointer"
                        }`}
                      >
                        <div className={`text-sm font-extrabold ${
                          isActive && !isDisabled ? "text-blue-700 dark:text-blue-400" : isDark ? "text-slate-200" : "text-slate-800"
                        }`}>
                          {opt.label}
                        </div>
                        <p className={`text-[11px] sm:text-xs mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {isDisabled ? t("billing.display_by_floor_unavailable") : opt.desc}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMeterEntrySettingsOpen(false)}
                className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 text-sm font-black transition-colors cursor-pointer"
              >
                {t("billing.entry_settings_done")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function UnifiedBillingPage() {
  const { t } = useLanguage()
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span className="text-sm font-semibold text-slate-500">{t("billing.loading_billing_page")}</span>
      </div>
    }>
      <UnifiedBillingContent />
    </Suspense>
  )
}
