"use client"

import { useState, useEffect, Suspense } from "react"
import { useTheme } from "next-themes"
import { useSearchParams } from "next/navigation"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
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
import { getRooms } from "@/features/room/actions"
import { getMeterRecords, saveMeterRecord, getMeterReplacements } from "@/features/meter/actions"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { getFinanceSettings } from "@/features/finance/actions"

import { type StaffPermissions, DEFAULT_STAFF_PERMISSIONS, ADMIN_DEFAULT_PERMISSIONS } from "@/features/permissions/types"

// Extracted Billing Sub-components
import BillingSummaryStats from "@/features/billing/components/BillingSummaryStats"
import SavingProgressOverlay from "@/features/billing/components/SavingProgressOverlay"
import SlipVerificationModal from "@/features/billing/components/SlipVerificationModal"
import CreateBillModal from "@/features/billing/components/CreateBillModal"
import MeterReadingTable from "@/features/billing/components/MeterReadingTable"

interface UnifiedRoomBillingItem {
  roomNumber: string
  tenantName: string | null
  baseRent: number
  status: "occupied" | "available"
  
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

function getBillingCycleOptions(registrationCycle?: string): { value: string; label: string }[] {
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
      label: `รอบบิล ${formatBillingCycleThai(val)}`
    })
  }
  return options
}

export default function ManageBillsPage() {
  return (
    <Suspense fallback={
      <div className="py-32 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <span>กำลังเปิดหน้าจัดการใบแจ้งหนี้...</span>
      </div>
    }>
      <ManageBillsContent />
    </Suspense>
  )
}

function ManageBillsContent() {
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const { resolvedTheme } = useTheme()
  const searchParams = useSearchParams()
  const verifyBillId = searchParams.get("verify_bill_id")
  const targetCycle = searchParams.get("cycle")
  const initialFilter = searchParams.get("filter")
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "pending" | "paid">(
    initialFilter === "unpaid" || initialFilter === "pending" || initialFilter === "paid"
      ? initialFilter
      : "all"
  )

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

  const [billingCycle, setBillingCycle] = useState("2026-06")
  const [registrationCycle, setRegistrationCycle] = useState<string>("")

  useEffect(() => {
    const current = getCurrentBillingCycle()
    if (registrationCycle && current < registrationCycle) {
      setBillingCycle(registrationCycle)
    } else {
      setBillingCycle(current)
    }
  }, [registrationCycle])

  useEffect(() => {
    if (registrationCycle && billingCycle < registrationCycle) {
      setBillingCycle(registrationCycle)
    }
  }, [registrationCycle, billingCycle])

  const [unifiedItems, setUnifiedItems] = useState<UnifiedRoomBillingItem[]>([])
  const [roomsList, setRoomsList] = useState<any[]>([])
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

  // ซิงค์รอบบิลตาม Query Parameter cycle อัตโนมัติ
  useEffect(() => {
    if (targetCycle && targetCycle !== billingCycle) {
      setBillingCycle(targetCycle)
    }
  }, [targetCycle, billingCycle])

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
  const [newRoomNumber, setNewRoomNumber] = useState("105")
  const [elecUnitsManual, setElecUnitsManual] = useState(80)
  const [waterUnitsManual, setWaterUnitsManual] = useState(10)
  const [otherServiceAmountManual, setOtherServiceAmountManual] = useState(0)

  const [savingAll, setSavingAll] = useState(false)
  const [savingProgress, setSavingProgress] = useState({ current: 0, total: 0, currentRoom: "" })

  const rentPrice = roomsList.find(r => r.roomNumber === newRoomNumber)?.baseRent || 4500
  const selectedManualRoom = roomsList.find(r => r.roomNumber === newRoomNumber)
  const isElecWaived = selectedManualRoom?.waiveElectricMin ?? false
  const isWaterWaived = selectedManualRoom?.waiveWaterMin ?? false

  const computedElecCost = !isElecWaived && electricMinChecked && elecUnitsManual <= electricMinUnit
    ? electricMinUnit * elecRate
    : elecUnitsManual * elecRate
  const computedWaterCost = !isWaterWaived && waterMinChecked && waterUnitsManual <= waterMinUnit
    ? waterMinUnit * waterRate
    : waterUnitsManual * waterRate
  const computedTotal = rentPrice + computedElecCost + computedWaterCost + commonFee + otherServiceAmountManual

  const getPreviousCycle = (cycle: string) => {
    const [year, month] = cycle.split("-").map(Number)
    if (month === 1) {
      return `${year - 1}-12`
    } else {
      const prevMonth = month - 1
      return `${year}-${prevMonth.toString().padStart(2, "0")}`
    }
  }

  const getFallbackPrevReadings = (roomNumber: string, cycle: string) => {
    return {
      elecPrev: 0,
      waterPrev: 0
    }
  }

  const calculateLateDays = (cycleStr: string): number => {
    if (!cycleStr || !cycleStr.includes("-")) return 0
    const [yearStr, monthStr] = cycleStr.split("-")
    const year = parseInt(yearStr, 10)
    
    // สำหรับบิลรอบเดือน มิถุนายน (06) กำหนดจ่ายคือวันที่ 5 ของเดือนถัดไป (กรกฎาคม)
    const dueMonth = parseInt(monthStr, 10) 
    const dueDate = new Date(year, dueMonth, 5, 23, 59, 59, 999)
    const now = new Date()
    
    if (now <= dueDate) return 0
    
    const dueMidnight = new Date(year, dueMonth, 5)
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    const diffTime = nowMidnight.getTime() - dueMidnight.getTime()
    if (diffTime <= 0) return 0
    
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
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
    if (!silent) setLoading(true)
    
    try {
      let userProfile = getCachedData("global", "profile")
      if (!userProfile || forceRefresh) {
        const userRes = await getCurrentUserProfileAction()
        if (userRes.success && userRes.data) {
          userProfile = userRes.data
          setCachedData("global", "profile", userRes.data)
        }
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

      if (forceRefresh && wsId) {
        clearWorkspaceCache(wsId)
      }

      // ดึงข้อมูลทั้งหมดในคราวเดียวผ่าน Server Action แบบขนาน (หรือใช้ Cache ท้องถิ่นถ้ามีครบและไม่ใช่การ Force Refresh)
      let rooms = wsId ? getCachedData(wsId, "rooms") : null
      const prevCycle = getPreviousCycle(cycle)
      let dbBills = wsId ? getCachedData(wsId, `bills_${cycle}`) : null
      let dbMeters = wsId ? getCachedData(wsId, `meters_${cycle}`) : null
      let dbReplacements = wsId ? getCachedData(wsId, `replacements_${cycle}`) : null
      let dbPrevMeters = wsId ? getCachedData(wsId, `meters_${prevCycle}`) : null
      let financeData = wsId ? getCachedData(wsId, "finance_settings") : null

      const needsFetch = forceRefresh || !rooms || !dbBills || !dbMeters || !dbReplacements || !dbPrevMeters || !financeData

      if (needsFetch) {
        const unifiedRes = await getBillingPageData(cycle, prevCycle, wsId || "")
        if (unifiedRes.success && unifiedRes.data) {
          const fetched = unifiedRes.data
          
          if (!rooms || forceRefresh) {
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
          if (!financeData || forceRefresh) {
            financeData = fetched.financeSettings
            if (wsId && financeData) setCachedData(wsId, "finance_settings", financeData)
          }
        } else {
          rooms = rooms || []
          dbBills = dbBills || []
          dbMeters = dbMeters || []
          dbReplacements = dbReplacements || []
          dbPrevMeters = dbPrevMeters || []
        }
      }

      setRoomsList(rooms)
      setMeterReplacements(dbReplacements)
      const currentPenaltyRate = financeData ? Number(financeData.late_penalty_rate || 0) : 0

      const activeRooms = rooms
      const compiled = activeRooms.map((r: any) => {
        const roomBill = dbBills.find((b: any) => b.roomNumber === r.roomNumber)
        const roomMeter = dbMeters.find((m: any) => m.roomNumber === r.roomNumber)
        const prevMeter = dbPrevMeters.find((m: any) => m.roomNumber === r.roomNumber)
        
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

        const fallbacks = getFallbackPrevReadings(r.roomNumber, cycle)
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
          roomNumber: r.roomNumber,
          tenantName: resolvedTenantName,
          baseRent: Number(r.baseRent) || 4500,
          status: isOccupiedInCycle ? "occupied" : "available",
          
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
          waiveElectricMin: !!r.waive_electric_min || !!r.waiveElectricMin,
          waiveWaterMin: !!r.waive_water_min || !!r.waiveWaterMin,
          invoiceId: roomBill?.invoiceId || undefined
        }
      })
      setUnifiedItems(compiled)
    } catch (err) {
      console.error("Failed to load billing unified items with cache:", err)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadData(billingCycle)
  }, [billingCycle])

  useEffect(() => {
    // Poll billing data every 8 seconds to automatically update when tenants upload slips
    const interval = setInterval(() => {
      const hasUnsaved = unifiedItems.some(item => item.isEdited)
      if (!hasUnsaved && !slipModalOpen && !createBillModalOpen) {
        loadData(billingCycle, true, true) // forceRefresh=true, silent=true
      }
    }, 8000)

    return () => clearInterval(interval)
  }, [billingCycle, unifiedItems, slipModalOpen, createBillModalOpen])

  useEffect(() => {
    const hasUnsaved = unifiedItems.some(item => item.isEdited)
    if (typeof window !== "undefined") {
      ;(window as any).__hasUnsavedChanges = hasUnsaved
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        e.preventDefault()
        e.returnValue = "คุณยังมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?"
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
            if (financeData.late_penalty_rate !== undefined) setLatePenaltyRate(financeData.late_penalty_rate)
            if (financeData.promptpay_id) setPromptPayId(financeData.promptpay_id)
            if (financeData.promptpay_name) setPromptPayName(financeData.promptpay_name)
            if (financeData.name) setWorkspaceName(financeData.name)
            if (financeData.tax_address) setWorkspaceAddress(financeData.tax_address)
            if (financeData.tax_phone) setWorkspacePhone(financeData.tax_phone)
            if (financeData.tax_id) setWorkspaceTaxId(financeData.tax_id)
          }
        }
      } catch (err) {
        console.error("Failed to load finance settings with cache:", err)
      }
    }
    loadFinance()
  }, [])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  const handleElecChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomNumber === roomNumber ? { ...item, elecCurr: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  const handleWaterChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomNumber === roomNumber ? { ...item, waterCurr: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  const handleElecPrevChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomNumber === roomNumber ? { ...item, elecPrev: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  const handleWaterPrevChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomNumber === roomNumber ? { ...item, waterPrev: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  const handleLateDaysChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item => {
        if (item.roomNumber !== roomNumber) return item
        
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

  const handleOtherServiceChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item => {
        if (item.roomNumber !== roomNumber) return item
        
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
    tenantName: b.tenant_name,
    amount: Number(b.amount),
    status: b.status,
    billingCycle: b.billing_cycle,
    slipUrl: b.slip_url,
    electricUnits: Number(b.electric_units),
    waterUnits: Number(b.water_units),
    penaltyAmount: b.penalty_amount !== null && b.penalty_amount !== undefined ? Number(b.penalty_amount) : null,
    lateDays: b.late_days !== null && b.late_days !== undefined ? Number(b.late_days) : null,
    otherServiceAmount: b.other_service_amount !== null && b.other_service_amount !== undefined ? Number(b.other_service_amount) : 0
  })

  const formatDbMeterToCamelCase = (m: any) => ({
    id: m.id,
    roomNumber: m.room_number,
    billingCycle: m.billing_cycle,
    elecPrev: Number(m.elec_prev),
    elecCurr: m.elec_curr === null || m.elec_curr === undefined ? "" : Number(m.elec_curr),
    waterPrev: Number(m.water_prev),
    waterCurr: m.water_curr === null || m.water_curr === undefined ? "" : Number(m.water_curr)
  })

  const updateLocalStateAndCache = (
    roomNumber: string,
    formattedMeter?: any,
    formattedBill?: any
  ) => {
    // 1. อัปเดต React State ทันทีเพื่อความลื่นไหลแบบ 0ms
    setUnifiedItems(prev => prev.map(i => {
      if (i.roomNumber === roomNumber) {
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
        const existingMeterIdx = cachedMeters.findIndex((m: any) => m.roomNumber === roomNumber)
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
        const existingBillIdx = cachedBills.findIndex((b: any) => b.roomNumber === roomNumber)
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
  const handleSaveLateDays = async (roomNumber: string) => {
    if (!userPermissions.manage_bills_edit) {
      showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล")
      return
    }
    console.log("🚀 [Client] handleSaveLateDays started for room:", roomNumber)
    const item = unifiedItems.find(i => i.roomNumber === roomNumber)
    
    if (!item) {
      console.error("❌ [Client] Room item not found in unifiedItems for room:", roomNumber)
      alert(`⚠️ ไม่พบข้อมูลสำหรับห้อง ${roomNumber} กรุณาลองใหม่อีกครั้ง`)
      return
    }
    
    if (!item.billId) {
      console.error("❌ [Client] billId is missing for room:", roomNumber, "item:", item)
      alert(`⚠️ ห้อง ${roomNumber} ไม่มีรหัสบิล (Bill ID) บนระบบ กรุณาลองรีเฟรชหน้าเว็บ หรือกดสร้างบิลก่อนทำการบันทึกค่าปรับ`)
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
    
    setSavingAll(true)
    setSavingProgress({ current: 1, total: 1, currentRoom: roomNumber })
    
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
        showToast(`บันทึกจำนวนวันปรับล่าช้าห้อง ${roomNumber} สำเร็จ!`)
        const formatted = formatDbBillToCamelCase(res.data)
        updateLocalStateAndCache(roomNumber, undefined, formatted)
        setUnifiedItems(prev =>
          prev.map(i => i.roomNumber === roomNumber ? { ...i, isEdited: false } : i)
        )
        console.log("👉 [Client] Local state & cache updated successfully")
      } else {
        console.error("❌ [Client] Server Action returned success=false:", res.error)
        alert(`❌ บันทึกไม่สำเร็จ: ${res.error || "เกิดข้อผิดพลาดในการบันทึกค่าปรับ"}`)
      }
    } catch (err) {
      console.error("💥 [Client] Exception caught in handleSaveLateDays:", err)
      alert(`💥 เกิดข้อผิดพลาดร้ายแรงในการบันทึกค่าปรับ:\n${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSavingAll(false)
      console.log("🏁 [Client] handleSaveLateDays finished execution flow")
    }
  }

  const closeSlipModal = () => {
    setSlipModalOpen(false)
    setSelectedBill(null)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      if (url.searchParams.has("verify_bill_id")) {
        url.searchParams.delete("verify_bill_id")
        window.history.replaceState(null, "", url.pathname + url.search)
      }
    }
  }

  const handleApproveSlip = async (id: string) => {
    if (!userPermissions.manage_bills_edit) {
      showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล")
      return
    }
    const res = await updateBillStatus(id, "paid")
    if (res.success) {
      showToast("อนุมัติรายการชำระเงินเรียบร้อยแล้ว!")
      const formatted = formatDbBillToCamelCase(res.data)
      updateLocalStateAndCache(formatted.roomNumber, undefined, formatted)
    } else {
      alert(res.error || "เกิดข้อผิดพลาดในการอัปเดตสถานะบิล")
      return
    }
    closeSlipModal()
  }

  const handleRejectSlip = async (id: string) => {
    if (!userPermissions.manage_bills_edit) {
      showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล")
      return
    }
    const res = await updateBillStatus(id, "unpaid", null)
    if (res.success) {
      showToast("ปฏิเสธสลิปแล้ว บิลจะกลับเป็นสถานะค้างชำระ")
      const formatted = formatDbBillToCamelCase(res.data)
      updateLocalStateAndCache(formatted.roomNumber, undefined, formatted)
    } else {
      alert(res.error || "เกิดข้อผิดพลาดในการอัปเดตสถานะบิล")
      return
    }
    closeSlipModal()
  }

  const handleMarkAsPaid = async (billId: string, roomNumber: string) => {
    if (!userPermissions.manage_bills_edit) {
      showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล")
      return
    }
    if (!confirm(`คุณต้องการเปลี่ยนสถานะบิลของห้อง ${roomNumber} เป็น "ชำระเงินแล้ว" ใช่หรือไม่? (โปรดยืนยันหากได้รับเงินแล้ว)`)) return

    const res = await updateBillStatus(billId, "paid")
    if (res.success) {
      showToast(`เปลี่ยนสถานะห้อง ${roomNumber} เป็นชำระเงินแล้ว!`)
      const formatted = formatDbBillToCamelCase(res.data)
      updateLocalStateAndCache(roomNumber, undefined, formatted)
    } else {
      alert(res.error || "เกิดข้อผิดพลาดในการอัปเดตสถานะบิล")
    }
  }

  const handleSaveRow = async (roomNumber: string, type: "electric" | "water" | "all" = "all") => {
    if (!userPermissions.manage_bills_edit) {
      showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล")
      return
    }
    const item = unifiedItems.find(i => i.roomNumber === roomNumber)
    if (!item) return

    const elecVal = item.elecCurr === "" ? "" : Number(item.elecCurr)
    const waterVal = item.waterCurr === "" ? "" : Number(item.waterCurr)
    const elecPrevVal = item.elecPrev === "" ? 0 : Number(item.elecPrev)
    const waterPrevVal = item.waterPrev === "" ? 0 : Number(item.waterPrev)

    const repElec = meterReplacements?.find(r => r.roomNumber === roomNumber && r.meterType === "electric")
    const repWater = meterReplacements?.find(r => r.roomNumber === roomNumber && r.meterType === "water")

    const getUnits = (curr: number, prev: number) => {
      if (curr >= prev) return curr - prev
      return (10000 - prev) + curr
    }

    let eUnits = 0
    let wUnits = 0

    if (type === "electric" || type === "all") {
      if (elecVal === "" || isNaN(elecVal as number)) {
        if (type === "electric") {
          alert("กรุณากรอกตัวเลขมิเตอร์ไฟฟ้าให้ครบถ้วน")
          return
        }
      } else {
        if (isNaN(elecPrevVal)) {
          alert("กรุณากรอกตัวเลขมิเตอร์ก่อนหน้าให้เป็นตัวเลขที่ถูกต้อง")
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
          alert("ข้อมูลผิดพลาด กรอกเลขมิเตอร์ไม่ถูกต้อง (คำนวณแล้วเกิน 3,000 หน่วย)")
          return
        }
      }
    }

    if (type === "water" || type === "all") {
      if (waterVal === "" || isNaN(waterVal as number)) {
        if (type === "water") {
          alert("กรุณากรอกตัวเลขมิเตอร์น้ำประปาให้ครบถ้วน")
          return
        }
      } else {
        if (isNaN(waterPrevVal)) {
          alert("กรุณากรอกตัวเลขมิเตอร์ก่อนหน้าให้เป็นตัวเลขที่ถูกต้อง")
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
          alert("ข้อมูลผิดพลาด กรอกเลขมิเตอร์ไม่ถูกต้อง (คำนวณแล้วเกิน 3,000 หน่วย)")
          return
        }
      }
    }

    if (type === "all" && (elecVal === "" || waterVal === "")) {
      alert("กรุณากรอกตัวเลขมิเตอร์ไฟฟ้าและค่าน้ำประปาให้ครบถ้วน")
      return
    }

    setSavingAll(true)
    try {
      const activeElecCurr = elecVal === "" ? 0 : Number(elecVal)
      const activeWaterCurr = waterVal === "" ? 0 : Number(waterVal)
      const activeElecPrev = elecPrevVal
      const activeWaterPrev = waterPrevVal

      const meterResult = await saveMeterRecord(
        roomNumber,
        billingCycle,
        activeElecPrev,
        activeElecCurr,
        activeWaterPrev,
        activeWaterCurr
      )

      if (!meterResult.success) {
        alert(meterResult.error || "บันทึกข้อมูลมิเตอร์ไม่สำเร็จ")
        setSavingAll(false)
        return
      }

      let createdBillObj = undefined;
      if (item.tenantName) {
        const finalElecUnits = !item.waiveElectricMin && electricMinChecked && eUnits <= electricMinUnit ? electricMinUnit : eUnits
        const finalWaterUnits = !item.waiveWaterMin && waterMinChecked && wUnits <= waterMinUnit ? waterMinUnit : wUnits

        const elecCost = finalElecUnits * elecRate
        const waterCost = finalWaterUnits * waterRate

        const billTotalAmount = item.baseRent + elecCost + waterCost + commonFee + (item.otherServiceAmount || 0) + (item.penaltyAmount || 0)

        const billResult = await createBill(
          roomNumber,
          item.tenantName,
          billTotalAmount,
          item.billStatus === "not_created" ? "unpaid" : item.billStatus,
          billingCycle,
          eUnits,
          wUnits,
          item.otherServiceAmount || 0
        )

        if (!billResult.success) {
          alert(billResult.error || "สร้างบิลไม่สำเร็จ แต่บันทึกมิเตอร์สำเร็จแล้ว")
          setSavingAll(false)
          return
        }
        createdBillObj = billResult.data
      }

      showToast(`บันทึกมิเตอร์และใบแจ้งยอดห้อง ${roomNumber} สำเร็จ!`)
      const formattedMeter = formatDbMeterToCamelCase(meterResult.data)
      const formattedBill = createdBillObj ? formatDbBillToCamelCase(createdBillObj) : undefined
      updateLocalStateAndCache(roomNumber, formattedMeter, formattedBill)
    } catch (e) {
      console.error(e)
      alert("เกิดข้อผิดพลาดไม่คาดคิด")
    } finally {
      setSavingAll(false)
    }
  }

  const handleSaveAll = async (type?: "electric" | "water") => {
    if (!userPermissions.manage_bills_edit) {
      showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล")
      return
    }
    const editedItems = unifiedItems.filter(item => {
      if (item.isMeterSaved) return false;
      if (type === "electric") {
        return item.elecCurr !== "";
      } else if (type === "water") {
        return item.waterCurr !== "";
      } else {
        return item.elecCurr !== "" && item.waterCurr !== "";
      }
    })

    if (editedItems.length === 0) {
      const typeText = type === "electric" ? "ไฟฟ้า" : type === "water" ? "ประปา" : "ไฟฟ้าและประปา"
      alert(`ไม่มีห้องที่ต้องการบันทึก (กรุณากรอกตัวเลขมิเตอร์${typeText}ให้ครบถ้วนในแถวที่แก้ไข)`)
      return
    }

    setSavingAll(true)
    setSavingProgress({ current: 0, total: editedItems.length, currentRoom: "" })

    const getUnits = (curr: number, prev: number) => {
      if (curr >= prev) return curr - prev
      return (10000 - prev) + curr
    }

    try {
      for (let i = 0; i < editedItems.length; i++) {
        const item = editedItems[i]
        setSavingProgress({ current: i + 1, total: editedItems.length, currentRoom: item.roomNumber })

        const elecVal = item.elecCurr === "" ? "" : Number(item.elecCurr)
        const waterVal = item.waterCurr === "" ? "" : Number(item.waterCurr)
        const elecPrevVal = item.elecPrev === "" ? 0 : Number(item.elecPrev)
        const waterPrevVal = item.waterPrev === "" ? 0 : Number(item.waterPrev)

        const repElec = meterReplacements?.find(r => r.roomNumber === item.roomNumber && r.meterType === "electric")
        const repWater = meterReplacements?.find(r => r.roomNumber === item.roomNumber && r.meterType === "water")

        let eUnits = 0
        if (elecVal !== "") {
          if (repElec) {
            const oldUnits = getUnits(repElec.oldFinalReading, elecPrevVal)
            const newUnits = getUnits(Number(elecVal), repElec.newStartReading)
            eUnits = oldUnits + newUnits
          } else {
            eUnits = getUnits(Number(elecVal), elecPrevVal)
          }
        }

        let wUnits = 0
        if (waterVal !== "") {
          if (repWater) {
            const oldUnits = getUnits(repWater.oldFinalReading, waterPrevVal)
            const newUnits = getUnits(Number(waterVal), repWater.newStartReading)
            wUnits = oldUnits + newUnits
          } else {
            wUnits = getUnits(Number(waterVal), waterPrevVal)
          }
        }

        if (eUnits > 3000 || wUnits > 3000) {
          continue
        }

        const activeElecCurr = elecVal === "" ? 0 : Number(elecVal)
        const activeWaterCurr = waterVal === "" ? 0 : Number(waterVal)
        const activeElecPrev = elecPrevVal
        const activeWaterPrev = waterPrevVal

        const meterResult = await saveMeterRecord(
          item.roomNumber,
          billingCycle,
          activeElecPrev,
          activeElecCurr,
          activeWaterPrev,
          activeWaterCurr
        )

        if (!meterResult.success) {
          continue
        }

        if (item.tenantName) {
          const finalElecUnits = !item.waiveElectricMin && electricMinChecked && eUnits <= electricMinUnit ? electricMinUnit : eUnits
          const finalWaterUnits = !item.waiveWaterMin && waterMinChecked && wUnits <= waterMinUnit ? waterMinUnit : wUnits

          const elecCost = finalElecUnits * elecRate
          const waterCost = finalWaterUnits * waterRate

          const billTotalAmount = item.baseRent + elecCost + waterCost + commonFee + (item.otherServiceAmount || 0) + (item.penaltyAmount || 0)

          await createBill(
            item.roomNumber,
            item.tenantName,
            billTotalAmount,
            item.billStatus === "not_created" ? "unpaid" : item.billStatus,
            billingCycle,
            eUnits,
            wUnits,
            item.otherServiceAmount || 0
          )
        }
      }

      const successText = type === "electric" ? "มิเตอร์ไฟ" : type === "water" ? "มิเตอร์น้ำ" : "มิเตอร์น้ำไฟ"
      showToast(`บันทึก${successText}และสร้างบิลสำเร็จทั้งหมด ${editedItems.length} ห้อง!`)
      await loadData(billingCycle, true)
    } catch (e) {
      console.error(e)
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูลทั้งหมด")
    } finally {
      setSavingAll(false)
    }
  }

  // ส่งข้อมูลเข้า LINE OA ของจริง
  const handleSendLine = async (roomNumber: string) => {
    if (!userPermissions.billing_send_line) {
      alert("คุณไม่มีสิทธิ์ในการส่งยอด LINE OA กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การใช้งาน")
      return
    }

    // 1. ค้นหาข้อมูลห้องพักจาก List เพื่อหยิบ lineUserId ของผู้เช่าจริงออกมา
    const roomInfo = roomsList.find((r: any) => r.roomNumber === roomNumber)
    const lineUserId = roomInfo?.lineUserId

    if (!lineUserId) {
      showToast(`ไม่สามารถส่ง LINE ได้ เนื่องจากผู้เช่าห้อง ${roomNumber} ยังไม่ได้ลงทะเบียนผูก LINE ID`)
      return
    }

    // 2. ค้นหาบิลประจำงวดของห้องนั้นๆ
    const item = unifiedItems.find((x: any) => x.roomNumber === roomNumber)
    if (!item) {
      showToast(`ไม่พบข้อมูลค่าใช้จ่ายของห้อง ${roomNumber}`)
      return
    }

    if (item.billStatus === "not_created") {
      showToast(`กรุณากดคำนวณบิลห้อง ${roomNumber} ให้เสร็จสิ้นก่อนส่งข้อความ`)
      return
    }

    try {
      const elecUnitsUsed = item.elecCurr !== ""
        ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr))
        : 0
      const waterUnitsUsed = item.waterCurr !== ""
        ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr))
        : 0

      const elecCost = electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
      const waterCost = waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate

      const { sendLineBillNotificationAction } = await import("@/features/notification/actions")
      const result = await sendLineBillNotificationAction({
        lineUserId,
        roomNumber: item.roomNumber,
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
        showToast(`ส่งยอดบิล และลิงก์ชำระเงินไปยัง LINE ผู้เช่าห้อง ${roomNumber} สำเร็จแล้ว!`)
      } else {
        showToast(`ส่ง LINE ล้มเหลว: ${result.error}`)
      }
    } catch (err: any) {
      console.error(err)
      showToast("เกิดข้อผิดพลาดในการเรียกส่งข้อมูลผ่าน LINE")
    }
  }

  const handleDownloadBillPdf = async (item: UnifiedRoomBillingItem) => {
    if (!userPermissions.billing_download_pdf) {
      alert("คุณไม่มีสิทธิ์ในการดาวน์โหลด PDF กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การใช้งาน")
      return
    }
    setDownloadingPdfId(item.roomNumber)
    try {
      const { generateBillPdf } = await import("@/lib/pdfHelper")
      const elecUnitsUsed = item.elecCurr !== ""
        ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr))
        : 0
      const waterUnitsUsed = item.waterCurr !== ""
        ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr))
        : 0

      const blob = await generateBillPdf({
        roomNumber: item.roomNumber,
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
          const elecCost = !item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
          const waterCost = !item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate
          return item.baseRent + elecCost + waterCost + commonFee + (item.otherServiceAmount || 0)
        })(),
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
        invoiceId: item.invoiceId || `INV-${billingCycle.replace('-', '')}-${item.roomNumber}`
      })

      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `bill_room${item.roomNumber}_${billingCycle}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToast(`ดาวน์โหลดบิล PDF ห้อง ${item.roomNumber} เรียบร้อย!`)
    } catch (e) {
      console.error(e)
      alert("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF บิลค่าเช่า")
    } finally {
      setDownloadingPdfId(null)
    }
  }

  const handleDownloadAllBillsPdf = async () => {
    if (!userPermissions.billing_download_pdf) {
      alert("คุณไม่มีสิทธิ์ในการดาวน์โหลด PDF กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การใช้งาน")
      return
    }

    if (unifiedItems.length === 0) {
      alert("ไม่มีรายการบิลที่จะดาวน์โหลด")
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
          roomNumber: item.roomNumber,
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
            const elecCost = !item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
            const waterCost = !item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate
            return item.baseRent + elecCost + waterCost + commonFee + (item.otherServiceAmount || 0)
          })(),
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
          invoiceId: item.invoiceId || `INV-${billingCycle.replace('-', '')}-${item.roomNumber}`
        })

        const fileName = `bill_room${item.roomNumber}_${billingCycle}.pdf`
        zip.file(fileName, blob)
        addedCount++
      }

      if (addedCount === 0) {
        alert("ไม่มีข้อมูลบิลสำหรับผู้เช่าห้องใดๆ")
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

      showToast(`ดาวน์โหลดบิล PDF ครบทุกห้องเรียบร้อยแล้ว (${addedCount} บิล)!`)
    } catch (e) {
      console.error(e)
      alert("เกิดข้อผิดพลาดในการดาวน์โหลดบิลทั้งหมด")
    } finally {
      setDownloadingAllPdf(false)
    }
  }

  const handleCreateBillManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userPermissions.manage_bills_edit) {
      showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล")
      return
    }
    
    let targetTenant = ""
    const room = roomsList.find(r => r.roomNumber === newRoomNumber)
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
      alert("ห้องพักนี้ยังไม่มีผู้เช่า หรือสัญญาหมดอายุ ไม่สามารถออกบิลได้")
      return
    }

    const res = await createBill(
      newRoomNumber,
      targetTenant,
      computedTotal,
      "unpaid",
      billingCycle,
      elecUnitsManual,
      waterUnitsManual,
      otherServiceAmountManual
    )
    if (res.success) {
      showToast(`สร้างบิลแบบกำหนดเองห้อง ${newRoomNumber} สำเร็จ!`)
      await loadData(billingCycle, true)
    } else {
      alert(res.error || "ออกใบแจ้งยอดไม่สำเร็จ")
      return
    }

    setCreateBillModalOpen(false)
  }

  const totalOccupied = unifiedItems.filter(item => item.tenantName).length
  const billedCount = unifiedItems.filter(item => item.tenantName && item.isMeterSaved).length
  const paidCount = unifiedItems.filter(item => item.billStatus === "paid").length
  const pendingCount = unifiedItems.filter(item => item.billStatus === "pending").length
  const unpaidCount = unifiedItems.filter(item => item.tenantName && (item.billStatus === "unpaid" || item.billStatus === "not_created")).length

  const filteredUnifiedItems = unifiedItems.filter(item => {
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-indigo-500" />
            <h2 className={`text-2xl font-black ${isDark ? "text-slate-100" : "text-slate-900"}`}>จัดการใบแจ้งหนี้</h2>
          </div>
          <p className={`text-sm mt-1.5 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            ระบบจัดการใบแจ้งหนี้ค่าเช่าหอพัก ตรวจสอบสลิปโอนเงิน ส่งบิลเข้า LINE OA หรือปรับสถานะและบันทึกรายละเอียดเพิ่มเติม
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* ปุ่มดาวน์โหลด PDF บิลรวมทุกห้อง */}
          {userPermissions.billing_download_pdf && (
            <button
              onClick={handleDownloadAllBillsPdf}
              disabled={downloadingAllPdf}
              className={`h-11 px-5 rounded-xl flex items-center justify-center gap-2 text-sm font-extrabold transition-all shadow-md active:scale-95 cursor-pointer ${
                downloadingAllPdf
                  ? "bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20"
              }`}
            >
              {downloadingAllPdf ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>กำลังบีบอัด ZIP...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>ดาวน์โหลด PDF ทั้งหมด (.ZIP)</span>
                </>
              )}
            </button>
          )}

          {/* ปุ่มสร้างบิลพิเศษกำหนดเอง */}
          {(currentUserRole === "admin" || currentUserRole === "super_admin") && (
            <button
              onClick={() => {
                // เลือกห้องว่างห้องแรกในอาคารเป็นค่าตั้งต้นในโมดอล
                const occupiedRooms = unifiedItems.filter(i => i.tenantName).map(i => i.roomNumber)
                if (occupiedRooms.length > 0) {
                  setNewRoomNumber(occupiedRooms[0])
                }
                setCreateBillModalOpen(true)
              }}
              className="h-11 px-5 rounded-xl bg-slate-850 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 border border-slate-700/30 dark:border-slate-300 shadow-md text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>สร้างบิลด้วยตนเอง</span>
            </button>
          )}

          {/* แถบเลือกเดือนรอบบิล */}
          <select
            className={`w-full md:w-auto h-11 px-4 border rounded-xl focus:outline-none focus:border-blue-500 text-sm font-bold transition-all cursor-pointer ${
              isDark ? "bg-slate-900 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
            }`}
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value)}
          >
            {getBillingCycleOptions(registrationCycle).map(opt => (
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
          <span className={`text-xs font-bold uppercase tracking-wider mr-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            ตัวกรองบิล:
          </span>
          {[
            { id: "all", label: "ทั้งหมด", count: unifiedItems.length },
            { id: "unpaid", label: "ค้างชำระเงิน", count: unpaidCount },
            { id: "pending", label: "รอตรวจสอบสลิป", count: pendingCount },
            { id: "paid", label: "ชำระเงินแล้ว", count: paidCount }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-sm ${
                statusFilter === tab.id
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 font-black scale-102"
                  : isDark
                    ? "bg-slate-900/30 border border-slate-800/80 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                    : "bg-white border border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                statusFilter === tab.id
                  ? "bg-white/20 text-white dark:bg-black/10 dark:text-slate-900"
                  : isDark ? "bg-slate-800 text-slate-350" : "bg-slate-100 text-slate-600"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
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
        handleSaveAll={handleSaveAll}
        roomsList={roomsList}
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
      />

      {/* Modal ตรวจสอบสลิปโอนเงินธนาคาร */}
      <SlipVerificationModal
        isDark={isDark}
        slipModalOpen={slipModalOpen}
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
        newRoomNumber={newRoomNumber}
        setNewRoomNumber={setNewRoomNumber}
        billingCycle={billingCycle}
        elecUnitsManual={elecUnitsManual}
        setElecUnitsManual={setElecUnitsManual}
        waterUnitsManual={waterUnitsManual}
        setWaterUnitsManual={setWaterUnitsManual}
        otherServiceAmountManual={otherServiceAmountManual}
        setOtherServiceAmountManual={setOtherServiceAmountManual}
        rentPrice={rentPrice}
        commonFee={commonFee}
        elecRate={elecRate}
        waterRate={waterRate}
        electricMinChecked={electricMinChecked}
        electricMinUnit={electricMinUnit}
        waterMinChecked={waterMinChecked}
        waterMinUnit={waterMinUnit}
        computedTotal={computedTotal}
        onClose={() => setCreateBillModalOpen(false)}
        onSubmit={handleCreateBillManual}
      />

      {/* Saving Overlay */}
      <SavingProgressOverlay
        isDark={isDark}
        savingAll={savingAll}
        savingProgress={savingProgress}
      />
    </>
  )
}
