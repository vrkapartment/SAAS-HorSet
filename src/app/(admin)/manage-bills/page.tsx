"use client"

import { useState, useEffect, useMemo, useRef, Suspense } from "react"
import { useTheme } from "next-themes"
import { useRouter, useSearchParams } from "next/navigation"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { useLanguage } from "@/lib/translations/LanguageProvider"
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
  Droplet
} from "lucide-react"
import { getBills, createBill, updateBillStatus, getBillingPageData } from "@/features/billing/actions"
import { buildInvoiceId } from "@/features/billing/utils"
import { asRoomId, findDuplicateRoomNumbers, formatRoomLabel, type RoomId } from "@/features/room/utils"
import { getRooms } from "@/features/room/actions"
import { getBuildings } from "@/features/building/actions"
import { getMeterRecords, saveMeterRecord, getMeterReplacements } from "@/features/meter/actions"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { getFinanceSettings } from "@/features/finance/actions"
import { getBuildingUtilityBillsForWorkspaceCycle, type BuildingUtilityBill } from "@/features/billing/building-utility-actions"
import { calculateLateDays } from "@/features/billing/utils"
import { calculateBillTotal, calculateLatePenalty } from "@/features/billing/bill-calculator"

import { type StaffPermissions, DEFAULT_STAFF_PERMISSIONS, ADMIN_DEFAULT_PERMISSIONS } from "@/features/permissions/types"

// Extracted Billing Sub-components
import BillingSummaryStats from "@/features/billing/components/BillingSummaryStats"
import SlipVerificationModal from "@/features/billing/components/SlipVerificationModal"
import CreateBillModal from "@/features/billing/components/CreateBillModal"
import MeterReadingTable from "@/features/billing/components/MeterReadingTable"

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

function formatBillingCycleThai(cycleStr: string): string {
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

function getBillingCycleOptions(registrationCycle: string | undefined, t: (key: string) => string): { value: string; label: string }[] {
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
      label: `${t("manage_bills.cycle_prefix")} ${t("dashboard.month_" + m)} ${y}`
    })
  }
  return options
}

function ManageBillsFallback() {
  const { t } = useLanguage()
  return (
    <div className="py-32 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[60vh]">
      <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
      <span>{t("manage_bills.loading_page")}</span>
    </div>
  )
}

export default function ManageBillsPage() {
  return (
    <Suspense fallback={<ManageBillsFallback />}>
      <ManageBillsContent />
    </Suspense>
  )
}

function ManageBillsContent() {
  const { t } = useLanguage()
  const router = useRouter()
  const loadDataSeqRef = useRef(0)
  // true ระหว่างที่ผู้ใช้เพิ่งเปลี่ยนเดือนจาก dropdown เอง แต่ URL (router.replace) ยังไล่ตามไม่ทัน
  // ป้องกัน effect ที่ sync จาก URL ดึงค่า billingCycle กลับไปเป็นเดือนเดิมก่อนที่ URL จะอัปเดตทัน
  const localCycleChangeRef = useRef(false)
  // นับจำนวน loadData ที่กำลังทำงานอยู่พร้อมกัน (ไม่ว่ารอบไหน) กันไม่ให้ตัว poll พื้นหลังยิงคำขอใหม่ทับ
  // คำขอที่ยังไม่เสร็จ ซึ่งทำให้คำขอ (network+DB) พะรุงพะรังแข่งกันเองจนทุกคำขอช้าลงเรื่อยๆ
  const loadDataInFlightCountRef = useRef(0)
  // นับเฉพาะรอบที่โชว์ spinner แยกจากตัวบน — เดิมใช้ตัวนับรวมคุม setLoading ทำให้ถ้า silent refresh
  // ค้างอยู่ตอนที่รอบที่โชว์ spinner เสร็จ ตัวนับจะยังไม่เป็น 0 จึงไม่มีใครปิด loading เลย (spinner ค้างถาวร)
  const visibleLoadInFlightRef = useRef(0)
  // เวลาที่ระงับ refresh เบื้องหลังถึง (epoch ms) — ตั้งตอนที่เราเขียนข้อมูลเอง เพราะ realtime จะ echo
  // event กลับมาเป็นชุด ซึ่ง optimistic update จัดการ state/cache ครบแล้ว ไม่ต้อง refetch ทับ
  const suppressRefreshUntilRef = useRef(0)

  const suppressBackgroundRefresh = (ms = 5000) => {
    suppressRefreshUntilRef.current = Date.now() + ms
  }

  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const { resolvedTheme } = useTheme()
  const searchParams = useSearchParams()
  const verifyBillId = searchParams.get("verify_bill_id")
  const paramMonth = searchParams.get("month")
  const paramYear = searchParams.get("year")
  const targetCycle = searchParams.get("cycle") || (paramYear && paramMonth ? `${paramYear}-${paramMonth}` : null)
  const initialFilter = searchParams.get("filter")
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "pending" | "paid">(
    initialFilter === "unpaid" || initialFilter === "pending" || initialFilter === "paid"
      ? initialFilter
      : "all"
  )
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([])
  const [buildingFilter, setBuildingFilter] = useState<string>("all")

  useEffect(() => {
    const f = searchParams.get("filter")
    if (f === "unpaid" || f === "pending" || f === "paid") {
      setStatusFilter(f)
    } else if (f === "all") {
      setStatusFilter("all")
    }
  }, [searchParams])

  const [mounted, setMounted] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [userPermissions, setUserPermissions] = useState<StaffPermissions>(ADMIN_DEFAULT_PERMISSIONS)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === "dark" : true

  const [billingCycle, setBillingCycle] = useState(getCurrentBillingCycle)
  // ค่าที่ดีเลย์ไว้ ~300ms ก่อนสั่ง loadData จริง กันการยิง request รัวๆ ตอนผู้ใช้สลับ dropdown เดือน/ปีเร็วๆ
  // (dropdown เองยังผูกกับ billingCycle ตรงๆ ทำให้ UI ตอบสนองทันทีเหมือนเดิม)
  const [debouncedBillingCycle, setDebouncedBillingCycle] = useState(getCurrentBillingCycle)
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
      } else {
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
  const [waterMinChecked, setWaterMinChecked] = useState<boolean>(true)
  const [waterMinUnit, setWaterMinUnit] = useState<number>(3)
  const [electricMinChecked, setElectricMinChecked] = useState<boolean>(true)
  const [electricMinUnit, setElectricMinUnit] = useState<number>(10)
  const [electricBillingMode, setElectricBillingMode] = useState<"fixed_rate" | "building_total">("fixed_rate")
  const [waterBillingMode, setWaterBillingMode] = useState<"fixed_rate" | "building_total">("fixed_rate")
  const [buildingUtilityBills, setBuildingUtilityBills] = useState<BuildingUtilityBill[]>([])
  // VAT — ดูฟีเจอร์ VAT ใน src/features/tax/ (คิดเพิ่มจากยอดบิลเดิม ไม่ถอดจากยอดเดิม)
  const [vatRegistered, setVatRegistered] = useState(false)
  const [vatRegisteredFrom, setVatRegisteredFrom] = useState<string | null>(null)
  const [vatRate, setVatRate] = useState(0.07)
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
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({})

  // ซิงค์รอบบิลตาม Query Parameter cycle อัตโนมัติ โดยระวังไม่ให้ต่ำกว่า registrationCycle เพื่อป้องกัน infinite loop ของการอัปเดต State
  useEffect(() => {
    // ถ้าความไม่ตรงกันนี้เกิดจากผู้ใช้เพิ่งเลือกเดือนใหม่จาก dropdown เอง (URL ยังไล่ตามไม่ทัน)
    // ห้ามดึง billingCycle กลับไปตาม URL เก่า ให้รอจน URL sync ทันแล้วค่อยเคลียร์ flag นี้
    if (localCycleChangeRef.current) {
      if (targetCycle === billingCycle) {
        localCycleChangeRef.current = false
      }
      return
    }

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

  const selectedManualRoom = roomsList.find(r => r.id === newRoomId)
  const rentPrice = selectedManualRoom?.baseRent || 4500
  const isElecWaived = selectedManualRoom?.waiveElectricMin ?? false
  const isWaterWaived = selectedManualRoom?.waiveWaterMin ?? false

  // Resolve อัตราไฟฟ้า/น้ำที่จะใช้ "จริง" ตอนกดบันทึก — ถ้าเปิดโหมดหารตามสัดส่วนทั้งอาคาร ต้องใช้
  // rate_per_unit ที่กรอกไว้ของอาคารห้องนั้น ไม่ใช่อัตราคงที่ (elecRate/waterRate) — มิเช่นนั้นพรีวิวในหน้านี้
  // จะไม่ตรงกับยอดที่ createBill() คำนวณจริงฝั่ง server (ดู resolveUtilityRate ใน billing/actions.ts)
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

  const selectedManualRoomExtraExpensesSum = selectedManualRoom?.extraExpenses?.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

  // VAT บวกเพิ่มจากยอดเดิม เฉพาะเมื่อ workspace จด VAT แล้วและถึงเดือนที่มีผล (ไม่ถอดจากยอดเดิม)
  const isVatChargingForCycle = (cycle: string) =>
    vatRegistered && (!vatRegisteredFrom || cycle >= vatRegisteredFrom.slice(0, 7))
  const manualVatResolved = isVatChargingForCycle(billingCycle)

  const { elecCost: computedElecCost, waterCost: computedWaterCost, vatAmount: computedVatAmount, total: computedTotal } = calculateBillTotal({
    baseRent: rentPrice,
    electricUnitsUsed: elecUnitsManual,
    waterUnitsUsed: waterUnitsManual,
    electricRate: electricRateResolved.rate,
    waterRate: waterRateResolved.rate,
    commonFee: commonFee,
    otherServiceAmount: otherServiceAmountManual,
    extraExpensesSum: selectedManualRoomExtraExpensesSum,
    waiveWaterMin: isWaterWaived,
    waterMinChecked,
    waterMinUnit,
    waiveElectricMin: isElecWaived,
    electricMinChecked,
    electricMinUnit,
    vatRate,
    vatApplies: manualVatResolved
  })

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


  const isTenantActiveInCycle = (leaseStart: string | null | undefined, leaseEnd: string | null | undefined, cycle: string, isLatest = true): boolean => {
    if (!leaseStart) return false
    
    const [cYear, cMonth] = cycle.split("-").map(Number)
    const cycleStart = new Date(cYear, cMonth - 1, 1)
    const cycleEnd = new Date(cYear, cMonth, 0, 23, 59, 59, 999)
    
    const start = new Date(leaseStart)
    start.setHours(0, 0, 0, 0)
    
    if (start > cycleEnd) return false
    
    if (leaseEnd && !isLatest) {
      const end = new Date(leaseEnd)
      end.setHours(23, 59, 59, 999)
      if (end < cycleStart) return false
    }
    
    return true
  }

  const loadData = async (cycle = billingCycle, forceRefresh = false, silent = false) => {
    // กันไม่ให้คำตอบของรอบบิลเก่าที่โหลดช้ากว่ามาทับข้อมูลของรอบบิลใหม่ที่โหลดเสร็จก่อน
    // (เช่น สลับ dropdown เดือนเร็วๆ ติดกัน) โดยยึดเฉพาะคำตอบของการเรียกครั้งล่าสุดเท่านั้น
    const seq = ++loadDataSeqRef.current
    loadDataInFlightCountRef.current++
    if (!silent) {
      setLoading(true)
      visibleLoadInFlightRef.current++
    }

    try {
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

      // ถ้ามีการเรียก loadData รอบใหม่กว่าเริ่มไปแล้วระหว่างที่รอฟังข้อมูลโปรไฟล์อยู่ ให้เลิกเรียกใช้ state ทั้งหมดของรอบนี้
      if (loadDataSeqRef.current !== seq) {
        return
      }

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

      // Force Refresh ที่ผู้ใช้สั่งเองล้างแคชทั้งก้อนได้ แต่ refresh เบื้องหลัง (silent) ห้ามล้าง —
      // ข้อมูลที่เปลี่ยนคือบิล/มิเตอร์ของรอบนี้ ซึ่งถูกดึงสดทุกครั้งที่ forceRefresh อยู่แล้วด้านล่าง
      // (ดู `!dbBills || forceRefresh`) ส่วน rooms/finance_settings ไม่เปลี่ยนตอนแก้บิล ถ้าล้างทุก event
      // จะถูกดึงซ้ำฟรี ๆ ทุกรอบ พร้อม join tenants/room_types ก้อนใหญ่
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
      if (loadDataSeqRef.current !== seq) {
        return
      }


      setRoomsList(rooms)
      setMeterReplacements(dbReplacements)
      setUsageAverages(usageAveragesData || {})
      const currentPenaltyRate = financeData ? Number(financeData.late_penalty_rate || 0) : 0

      const activeRooms = rooms
      const compiled = activeRooms.map((r: any) => {
        // จับคู่ด้วย rooms.id — เลขห้องซ้ำกันได้ข้ามอาคาร ถ้าเทียบด้วยเลขห้อง ห้อง 101 ของสองอาคาร
        // จะได้บิล/เลขมิเตอร์ของห้องเดียวกันมาแสดงทั้งคู่ แล้วการกดบันทึกจะเขียนทับกันเอง
        const roomId = asRoomId(r.id)
        const roomBill = dbBills.find((b: any) => b.roomId === roomId)
        const roomMeter = dbMeters.find((m: any) => m.roomId === roomId)
        const prevMeter = dbPrevMeters.find((m: any) => m.roomId === roomId)
        
        let resolvedTenantName: string | null = null
        const sortedTenants = [...(r.allTenants || [])].sort((a: any, b: any) => {
          const aTime = a.leaseStart ? new Date(a.leaseStart).getTime() : 0
          const bTime = b.leaseStart ? new Date(b.leaseStart).getTime() : 0
          return bTime - aTime
        })

        if (roomBill && roomBill.tenantName) {
          const matchingTenant = (r.allTenants || []).find((t: any) => t.tenantName === roomBill.tenantName)
          if (matchingTenant) {
            const matchingTenantIsLatest = sortedTenants[0]?.id === matchingTenant.id
            const isActive = isTenantActiveInCycle(matchingTenant.leaseStart, matchingTenant.leaseEnd, cycle, matchingTenantIsLatest)
            if (isActive) {
              resolvedTenantName = roomBill.tenantName
            } else {
              const actualActiveTenant = (r.allTenants || []).find((t: any) => {
                const tIsLatest = sortedTenants[0]?.id === t.id
                return isTenantActiveInCycle(t.leaseStart, t.leaseEnd, cycle, tIsLatest)
              })
              resolvedTenantName = actualActiveTenant ? actualActiveTenant.tenantName : null
            }
          } else {
            resolvedTenantName = roomBill.tenantName
          }
        } else {
          const activeTenant = (r.allTenants || []).find((t: any) => {
            const tIsLatest = sortedTenants[0]?.id === t.id
            return isTenantActiveInCycle(t.leaseStart, t.leaseEnd, cycle, tIsLatest)
          })
          resolvedTenantName = activeTenant ? activeTenant.tenantName : null
        }
        
        const isOccupiedInCycle = resolvedTenantName !== null

        const hasNotifiedCheckout = r.status === "Pending_Refund"

        const fallbacks = getFallbackPrevReadings(roomId, cycle)
        const hasPrevMeterElec = !!(prevMeter && prevMeter.elecCurr !== "" && prevMeter.elecCurr !== null && prevMeter.elecCurr !== undefined)
        const hasPrevMeterWater = !!(prevMeter && prevMeter.waterCurr !== "" && prevMeter.waterCurr !== null && prevMeter.waterCurr !== undefined)

        const elecPrev = hasPrevMeterElec
          ? Number(prevMeter.elecCurr)
          : (roomMeter ? Number(roomMeter.elecPrev) : (prevMeter ? Number(prevMeter.elecPrev) : fallbacks.elecPrev))
        const waterPrev = hasPrevMeterWater
          ? Number(prevMeter.waterCurr)
          : (roomMeter ? Number(roomMeter.waterPrev) : (prevMeter ? Number(prevMeter.waterPrev) : fallbacks.waterPrev))
        
        const isFirstMonth = regCycleVal ? (cycle === regCycleVal) : true
        const isElecPrevEditable = isFirstMonth
        const isWaterPrevEditable = isFirstMonth

        let finalLateDays = 0
        let finalPenaltyAmount = 0
        let finalBillAmount = 0
        
        if (roomBill) {
          const dbLateDays = roomBill.lateDays
          const dbPenaltyAmount = roomBill.penaltyAmount
          const dbBillAmount = Number(roomBill.amount || 0)
          const isUnpaidOrPending = roomBill.status === "unpaid" || roomBill.status === "pending"
          
          if (isUnpaidOrPending && dbLateDays === null) {
            const calculatedDays = calculateLateDays(cycle)
            if (calculatedDays > 0) {
              finalLateDays = calculatedDays
              finalPenaltyAmount = calculatedDays * currentPenaltyRate
              finalBillAmount = dbBillAmount + finalPenaltyAmount
            } else {
              finalLateDays = 0
              finalPenaltyAmount = 0
              finalBillAmount = dbBillAmount
            }
          } else {
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
      // การแก้ไข แต่กว่าจะได้ผลลัพธ์กลับมาผู้ใช้อาจกรอกข้อมูลไปแล้ว ถ้า set ทับทั้งก้อนค่าที่พิมพ์จะหาย
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
      // ปิด loading เฉพาะเมื่อไม่มีรอบที่โชว์ spinner ค้างอยู่แล้วเท่านั้น ไม่เช่นนั้นรอบที่ถูกทิ้ง (stale)
      // จะไปปิด loading ก่อนที่รอบล่าสุดซึ่งยังไม่เสร็จจะโหลดจริง ทำให้ขึ้นข้อความ "ไม่มีห้องพัก" หลอกๆ ระหว่างรอ
      if (!silent) {
        visibleLoadInFlightRef.current--
        if (visibleLoadInFlightRef.current === 0) setLoading(false)
      }
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBillingCycle(billingCycle), 300)
    return () => clearTimeout(timer)
  }, [billingCycle])

  useEffect(() => {
    loadData(debouncedBillingCycle)
  }, [debouncedBillingCycle])

  // เก็บค่าล่าสุดไว้ใน ref เพื่อให้ Realtime handler และ fallback poll อ่านค่าปัจจุบันได้
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
    // ห้ามยิงซ้อนทับถ้ามี loadData รอบอื่นกำลังทำงานอยู่แล้ว ไม่เช่นนั้นคำขอจะพะรุงพะรังแข่งกันเองจนทุกคำขอช้าลงเรื่อยๆ
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
      .channel(`realtime_manage_bills_${currentWorkspaceId}_${billingCycle}`)
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
  }, [unifiedItems])

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
            wsId = userProfile.workspace_id
          } else {
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
            setElectricBillingMode(financeData.electric_billing_mode === "building_total" ? "building_total" : "fixed_rate")
            setWaterBillingMode(financeData.water_billing_mode === "building_total" ? "building_total" : "fixed_rate")
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

  // ดึงยอดบิลรวมทั้งอาคารของรอบบิลนี้ (ใช้แสดง "รายละเอียดใบแจ้งหนี้จริงจากหน่วยงาน" ในบิล PDF
  // เมื่อเปิดโหมด building_total — ไม่ query ถ้าไม่มี utility ไหนเปิดโหมดนี้)
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

  const handleElecChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomId === roomId ? { ...item, elecCurr: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  const handleWaterChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomId === roomId ? { ...item, waterCurr: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  const handleElecPrevChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomId === roomId ? { ...item, elecPrev: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  const handleWaterPrevChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomId === roomId ? { ...item, waterPrev: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  const handleLateDaysChange = (roomId: RoomId, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item => {
        if (item.roomId !== roomId) return item
        
        const days = value === "" ? 0 : Number(value)
        if (isNaN(days)) return item
        
        const newPenaltyAmount = days * latePenaltyRate
        
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
    if (!userPermissions.manage_bills_edit) {
      showToast(t("daily_bills.no_permission_msg"))
      return
    }
    const item = unifiedItems.find(i => i.roomId === roomId)

    if (!item) {
      console.error("❌ [Client] Room item not found in unifiedItems for roomId:", roomId)
      alert(t("manage_bills.err_no_room_data").replace("{room}", roomId))
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
      billAmount: sendBillAmount,
      otherServiceAmount: item.otherServiceAmount || 0
    })
    
    setSavingRows(prev => ({ ...prev, [roomId]: true }))
    
    try {
      const { updateBillPenalty } = await import("@/features/billing/actions")
      console.log("👉 [Client] Server Action updateBillPenalty imported successfully. Invoking...")
      
      const res = await updateBillPenalty(
        item.billId,
        sendLateDays,
        sendPenaltyAmount,
        sendBillAmount,
        item.otherServiceAmount || 0
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
        alert(t("manage_bills.err_save_failed_prefix") + (res.error || t("manage_bills.err_penalty_generic")))
      }
    } catch (err) {
      console.error("💥 [Client] Exception caught in handleSaveLateDays:", err)
      alert(t("manage_bills.err_penalty_fatal_prefix") + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSavingRows(prev => ({ ...prev, [roomId]: false }))
      // การบันทึกของเราเองจะทำให้ realtime ยิง event กลับมา แต่ optimistic update จัดการ state + cache
      // ครบแล้ว ไม่ต้องเสีย refresh ทั้งก้อนมาทับ
      suppressBackgroundRefresh()
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

  const handleApproveSlip = async (id: string) => {
    if (!userPermissions.manage_bills_edit) {
      showToast(t("daily_bills.no_permission_msg"))
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

  const handleRejectSlip = async (id: string) => {
    if (!userPermissions.manage_bills_edit) {
      showToast(t("daily_bills.no_permission_msg"))
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

  const handleMarkAsPaid = async (billId: string, roomId: RoomId) => {
    if (!userPermissions.manage_bills_edit) {
      showToast(t("daily_bills.no_permission_msg"))
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

  const handleSaveRow = async (roomId: RoomId, type: "electric" | "water" | "all" = "all") => {
    if (!userPermissions.manage_bills_edit) {
      showToast(t("daily_bills.no_permission_msg"))
      return
    }
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

    // เริ่มต้นด้วยหน่วยที่บันทึกไว้เดิมในบิล (ถ้ามี) ไม่ใช่ 0 เสมอ
    // เพราะถ้ากดบันทึกแค่ไฟหรือแค่น้ำอย่างเดียว จะได้ไม่ไปเขียนทับอีกค่าที่เคยบันทึกไว้แล้วให้กลายเป็น 0
    let eUnits = Number(item.electricUnits) || 0
    let wUnits = Number(item.waterUnits) || 0

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

    setSavingRows(prev => ({ ...prev, [roomId]: true }))
    try {
      const activeElecCurr = elecVal === "" ? 0 : Number(elecVal)
      const activeWaterCurr = waterVal === "" ? 0 : Number(waterVal)
      const activeElecPrev = elecPrevVal
      const activeWaterPrev = waterPrevVal

      const meterResult = await saveMeterRecord(
        { roomId },
        billingCycle,
        activeElecPrev,
        activeElecCurr,
        activeWaterPrev,
        activeWaterCurr
      )

      if (!meterResult.success) {
        alert(meterResult.error || t("manage_bills.err_meter_save_failed"))
        setSavingRows(prev => ({ ...prev, [roomId]: false }))
        return
      }

      let createdBillObj = undefined;
      if (item.tenantName) {
        const roomInfo = roomsList?.find((r: any) => r.id === roomId)
        const extraExpenses = roomInfo?.extraExpenses || []
        const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

        const { elecCost, waterCost, total: billTotalAmount } = calculateBillTotal({
          baseRent: item.baseRent,
          electricUnitsUsed: eUnits,
          waterUnitsUsed: wUnits,
          electricRate: elecRate,
          waterRate: waterRate,
          commonFee: commonFee,
          otherServiceAmount: item.otherServiceAmount || 0,
          extraExpensesSum: extraExpensesSum,
          waiveWaterMin: !!item.waiveWaterMin,
          waterMinChecked,
          waterMinUnit,
          waiveElectricMin: !!item.waiveElectricMin,
          electricMinChecked,
          electricMinUnit,
          penaltyAmount: item.penaltyAmount || 0
        })

        const billResult = await createBill(
          { roomId },
          item.tenantName,
          billTotalAmount,
          item.billStatus === "not_created" ? "unpaid" : item.billStatus,
          billingCycle,
          eUnits,
          wUnits,
          item.otherServiceAmount || 0
        )

        if (!billResult.success) {
          alert(billResult.error || t("manage_bills.err_bill_create_failed_meter_ok"))
          setSavingRows(prev => ({ ...prev, [roomId]: false }))
          return
        }
        createdBillObj = billResult.data
      }

      showToast(t("manage_bills.saved_meter_bill").replace("{room}", roomLabel))
      const formattedMeter = formatDbMeterToCamelCase(meterResult.data)
      const formattedBill = createdBillObj ? formatDbBillToCamelCase(createdBillObj) : undefined
      updateLocalStateAndCache(roomId, formattedMeter, formattedBill)
    } catch (e) {
      console.error(e)
      alert(t("manage_bills.err_unexpected"))
    } finally {
      setSavingRows(prev => ({ ...prev, [roomId]: false }))
      // การบันทึกของเราเองจะทำให้ realtime ยิง event กลับมา แต่ updateLocalStateAndCache ด้านบน
      // อัปเดต state + cache ครบแล้ว ไม่ต้องเสีย refresh ทั้งก้อนมาทับ
      suppressBackgroundRefresh()
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
      const elecUnitsUsed = item.elecCurr !== ""
        ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr))
        : 0
      const waterUnitsUsed = item.waterCurr !== ""
        ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr))
        : 0

      const roomInfoForSum = roomsList?.find((r: any) => r.id === item.roomId)
      const extraExpenses = roomInfoForSum?.extraExpenses || []
      const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

      const { elecCost, waterCost } = calculateBillTotal({
        baseRent: item.baseRent,
        electricUnitsUsed: elecUnitsUsed,
        waterUnitsUsed: waterUnitsUsed,
        electricRate: elecRate,
        waterRate: waterRate,
        commonFee: commonFee,
        otherServiceAmount: item.otherServiceAmount || 0,
        extraExpensesSum,
        waiveWaterMin: !!item.waiveWaterMin,
        waterMinChecked,
        waterMinUnit,
        waiveElectricMin: !!item.waiveElectricMin,
        electricMinChecked,
        electricMinUnit,
        penaltyAmount: item.penaltyAmount || 0
      })

      const { sendLineBillNotificationAction } = await import("@/features/notification/actions")
      const result = await sendLineBillNotificationAction({
        lineUserId,
        roomNumber: roomLabelOf(item),
        roomId: item.roomId,
        tenantName: item.tenantName || "ผู้เช่า",
        billingCycle: formatBillingCycleThai(billingCycle),
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
        showToast(t("manage_bills.err_line_send_failed_prefix") + result.error)
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

  const handleDownloadBillPdf = async (item: UnifiedRoomBillingItem) => {
    if (!userPermissions.billing_download_pdf) {
      alert(t("manage_bills.err_no_permission_pdf"))
      return
    }
    setDownloadingPdfId(item.roomId)
    try {
      const { generateBillPdf } = await import("@/lib/pdfHelper")
      const elecUnitsUsed = item.elecCurr !== ""
        ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr))
        : 0
      const waterUnitsUsed = item.waterCurr !== ""
        ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr))
        : 0

      const blob = await generateBillPdf({
        roomNumber: roomLabelOf(item),
        tenantName: item.tenantName || "ผู้เช่า",
        billingCycle: formatBillingCycleThai(billingCycle),
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
          const roomInfo = roomsList?.find((r: any) => r.id === item.roomId)
          const extraExpenses = roomInfo?.extraExpenses || []
          const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0
          const { total } = calculateBillTotal({
            baseRent: item.baseRent,
            electricUnitsUsed: elecUnitsUsed,
            waterUnitsUsed: waterUnitsUsed,
            electricRate: elecRate,
            waterRate: waterRate,
            commonFee,
            otherServiceAmount: item.otherServiceAmount || 0,
            extraExpensesSum,
            waiveWaterMin: !!item.waiveWaterMin,
            waterMinChecked,
            waterMinUnit,
            waiveElectricMin: !!item.waiveElectricMin,
            electricMinChecked,
            electricMinUnit,
            penaltyAmount: item.penaltyAmount || 0,
            vatRate,
            vatApplies: isVatChargingForCycle(billingCycle)
          })
          return total
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
        if (!item.tenantName) continue

        const elecUnitsUsed = item.elecCurr !== ""
          ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr))
          : 0
        const waterUnitsUsed = item.waterCurr !== ""
          ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr))
          : 0

        const blob = await generateBillPdf({
          roomNumber: roomLabelOf(item),
          tenantName: item.tenantName || "ผู้เช่า",
          billingCycle: formatBillingCycleThai(billingCycle),
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
            const roomInfo = roomsList?.find((r: any) => r.id === item.roomId)
            const extraExpenses = roomInfo?.extraExpenses || []
            const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0
            const { total } = calculateBillTotal({
              baseRent: item.baseRent,
              electricUnitsUsed: elecUnitsUsed,
              waterUnitsUsed: waterUnitsUsed,
              electricRate: elecRate,
              waterRate: waterRate,
              commonFee,
              otherServiceAmount: item.otherServiceAmount || 0,
              extraExpensesSum,
              waiveWaterMin: !!item.waiveWaterMin,
              waterMinChecked,
              waterMinUnit,
              waiveElectricMin: !!item.waiveElectricMin,
              electricMinChecked,
              electricMinUnit,
              penaltyAmount: item.penaltyAmount || 0,
              vatRate,
              vatApplies: isVatChargingForCycle(billingCycle)
            })
            return total
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

  const handleCreateBillManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userPermissions.manage_bills_edit) {
      showToast(t("daily_bills.no_permission_msg"))
      return
    }
    
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
      await loadData(billingCycle, true)
    } else {
      alert(res.error || t("manage_bills.err_bill_create_failed"))
      return
    }

    setCreateBillModalOpen(false)
  }

  const totalOccupied = unifiedItems.filter(item => item.tenantName).length
  const billedCount = unifiedItems.filter(item => item.tenantName && item.isMeterSaved).length
  const paidCount = unifiedItems.filter(item => item.billStatus === "paid").length
  const pendingCount = unifiedItems.filter(item => item.billStatus === "pending").length
  const unpaidCount = unifiedItems.filter(item => item.tenantName && (item.billStatus === "unpaid" || item.billStatus === "not_created")).length

  // เลขห้องที่ซ้ำกันในหอนี้ — คำนวณจาก unifiedItems ทั้งก้อน ไม่ใช่ชุดที่กรองแล้ว เพื่อให้ป้ายกำกับ
  // อาคารไม่หาย/ไม่โผล่สลับไปมาเวลาผู้ใช้เปลี่ยนตัวกรองอาคาร
  const duplicatedRoomNumbers = useMemo(() => findDuplicateRoomNumbers(unifiedItems), [unifiedItems])

  /** หาแถวห้องจาก rooms.id — ใช้ดึงรหัสอาคารไปประกอบป้ายกำกับเลขห้องและเลขใบกำกับ */
  const findRoomRow = (roomId: string): { code?: string | null; name?: string | null; buildingCode?: string | null } | undefined =>
    roomsList?.find((r: { id: string }) => r.id === roomId)

  // ข้อความเลขห้องที่แสดง — เติมรหัสอาคารต่อท้ายเฉพาะเลขห้องที่ซ้ำกัน
  const roomLabelOf = (item: { roomId: RoomId; roomNumber: string }): string => {
    const row = findRoomRow(item.roomId)
    return formatRoomLabel(item.roomNumber, duplicatedRoomNumbers, { code: row?.buildingCode, name: row?.name })
  }

  // ชื่อไฟล์ PDF — ต้องแยกกันด้วยเมื่อเลขห้องซ้ำ ไม่งั้นดาวน์โหลดทั้งอาคารเป็น zip แล้วไฟล์ทับกันหายไปใบหนึ่ง
  const pdfFileSafeRoom = (item: { roomId: RoomId; roomNumber: string }): string =>
    roomLabelOf(item).replace(/[^\p{L}\p{N}_-]+/gu, "")

  const filteredUnifiedItems = unifiedItems.filter(item => {
    if (buildingFilter !== "all" && item.buildingId !== buildingFilter) return false

    if (statusFilter === "all") return true
    if (statusFilter === "unpaid") {
      return item.tenantName && (item.billStatus === "unpaid" || item.billStatus === "not_created")
    }
    if (statusFilter === "pending") {
      return item.billStatus === "pending"
    }
    if (statusFilter === "paid") {
      return item.billStatus === "paid"
    }
    return true
  })

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
            <Receipt className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            {t("manage_bills.header_title")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {t("manage_bills.header_desc")}
          </p>
        </div>
        
        <div className="flex gap-3 w-full md:w-auto justify-end">
          {/* ปุ่มสร้างบิลพิเศษกำหนดเอง */}
          {(currentUserRole === "admin" || currentUserRole === "super_admin") && (
            <button
              onClick={() => {
                // เลือกห้องที่มีผู้เช่าห้องแรกในอาคารเป็นค่าตั้งต้นในโมดอล (เก็บเป็น rooms.id)
                const occupiedRoomIds = unifiedItems.filter(i => i.tenantName).map(i => i.roomId)
                if (occupiedRoomIds.length > 0) {
                  setNewRoomId(occupiedRoomIds[0])
                }
                setCreateBillModalOpen(true)
              }}
              className="h-11 px-3 sm:px-5 xl:h-12 xl:px-6 2xl:h-14 2xl:px-8 rounded-xl bg-slate-850 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 border border-slate-700/30 dark:border-slate-300 shadow-md text-xs sm:text-sm xl:text-base 2xl:text-lg font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 xl:w-5 xl:h-5 2xl:w-6 2xl:h-6 shrink-0" />
              <span className="truncate">
                <span className="hidden sm:inline">{t("manage_bills.create_bill_btn_full")}</span>
                <span className="inline sm:hidden">{t("manage_bills.create_bill_btn_short")}</span>
              </span>
            </button>
          )}

          {/* แถบเลือกเดือนรอบบิล */}
          <select
            className={`w-full md:w-auto h-11 px-4 xl:h-12 xl:px-5 2xl:h-14 2xl:px-6 border rounded-xl focus:outline-none focus:border-blue-500 text-sm xl:text-base 2xl:text-lg font-bold transition-all cursor-pointer ${
              isDark ? "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-850" : "bg-white border-slate-300 text-slate-800 hover:bg-slate-50"
            }`}
            value={billingCycle}
            onChange={(e) => {
              const val = e.target.value

              // อัปเดต billingCycle ทันทีตรงๆ ไม่รอให้ URL sync ย้อนกลับมาอัปเดตให้
              // และตั้ง flag ไว้กันไม่ให้ effect ที่ sync จาก URL ดึงค่ากลับไปเป็นเดือนเดิม
              // ระหว่างที่ router.replace() ด้านล่างยังไล่อัปเดต URL ไม่ทัน
              localCycleChangeRef.current = true
              setBillingCycle(val)

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
            {getBillingCycleOptions(registrationCycle, t).map(opt => (
              <option key={opt.value} value={opt.value} className={isDark ? "bg-slate-900 text-slate-200" : "bg-white text-slate-800"}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Dashboard */}
      <BillingSummaryStats
        isDark={isDark}
        billedCount={billedCount}
        totalOccupied={totalOccupied}
        paidCount={paidCount}
        pendingCount={pendingCount}
        unpaidCount={unpaidCount}
      />

      {/* Filter Tabs Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-6 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs xl:text-xs 2xl:text-sm font-bold uppercase tracking-wider mr-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {t("manage_bills.filter_label")}
          </span>
          {[
            { id: "all", label: t("daily_bills.filter_all"), count: unifiedItems.length },
            { id: "unpaid", label: t("manage_bills.filter_unpaid"), count: unpaidCount },
            { id: "pending", label: t("manage_bills.filter_pending"), count: pendingCount },
            { id: "paid", label: t("manage_bills.filter_paid"), count: paidCount }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3.5 py-1.5 xl:px-4 xl:py-2 2xl:px-4.5 2xl:py-2 rounded-xl text-xs xl:text-xs 2xl:text-sm font-extrabold transition-all duration-200 cursor-pointer flex items-center gap-1.5 xl:gap-2 shadow-sm ${
                statusFilter === tab.id
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 font-black scale-102"
                  : isDark
                    ? "bg-slate-900/30 border border-slate-800/80 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                    : "bg-white border border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] xl:text-[10px] 2xl:text-xs px-1.5 py-0.5 xl:px-1.5 xl:py-0.5 2xl:px-2 2xl:py-1 rounded-md font-mono ${
                statusFilter === tab.id
                  ? "bg-white/20 text-white dark:bg-black/10 dark:text-slate-900"
                  : isDark ? "bg-slate-800 text-slate-350" : "bg-slate-100 text-slate-600"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ตัวกรองอาคาร — แสดงเฉพาะเมื่อหอมีมากกว่า 1 อาคาร */}
        {buildings.length > 1 && (
          <select
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
            className={`h-9 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 ${
              isDark ? "bg-slate-900/30 border border-slate-800/80 text-slate-300" : "bg-white border border-slate-200 text-slate-650"
            }`}
          >
            <option value="all">ทุกอาคาร</option>
            {buildings.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Main Billing Table */}
      <MeterReadingTable
        isDark={isDark}
        loading={loading}
        userPermissions={userPermissions}
        hasEditPermission={userPermissions.manage_bills_edit}
        unifiedItems={filteredUnifiedItems}
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
        roomsList={roomsList}
        usageAverages={usageAverages}
        billingCycle={billingCycle}
        workspaceName={workspaceName}
        currentWorkspaceId={currentWorkspaceId}
        handleLateDaysChange={handleLateDaysChange}
        handleSaveLateDays={handleSaveLateDays}
        latePenaltyRate={latePenaltyRate}
        handleOtherServiceChange={handleOtherServiceChange}
        mode="billing"
        meterReplacements={meterReplacements}
        onMeterReplacementsChange={async () => {
          await loadData(billingCycle, true)
        }}
        handleDownloadAllBillsPdf={handleDownloadAllBillsPdf}
        downloadingAllPdf={downloadingAllPdf}
        savingRows={savingRows}
      />

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

      {/* Saving Overlay */}
      {/* Removed dead SavingProgressOverlay because handleSaveAll is unreachable in billing mode */}
    </>
  )
}
