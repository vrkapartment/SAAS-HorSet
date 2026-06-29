"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
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
  Droplet,
  Home,
  ShieldAlert
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

function UnifiedBillingContent() {
  const searchParams = useSearchParams()
  const verifyBillId = searchParams.get("verify_bill_id")
  const targetCycle = searchParams.get("cycle")

  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [userPermissions, setUserPermissions] = useState<StaffPermissions>(ADMIN_DEFAULT_PERMISSIONS)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === "dark" : true

  const [billingCycle, setBillingCycle] = useState("2026-06")
  const [pageActiveTab, setPageActiveTab] = useState<"meters" | "summary">("meters")
  const [registrationCycle, setRegistrationCycle] = useState<string>("")

  useEffect(() => {
    // ปรับรอบบิลตามเดือนปฏิทินปัจจุบันเมื่อเรนเดอร์ฝั่ง Client สำเร็จเพื่อความไหลลื่นและป้องกัน Hydration Mismatch
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
    
    // สำหรับบิลรอบเดือน มิถุนายน (06) กำหนดจ่ายคือวันที่ 5 ของเดือนถัดไป (กรกฎาคม / index 6)
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

  const loadData = async (cycle = billingCycle, forceRefresh = false, silent = false) => {
    if (!silent) setLoading(true)
    
    try {
      // 0. ดึงและแคชข้อมูลโปรไฟล์ผู้ใช้เพื่อระบุ Workspace ปัจจุบันแบบไร้รอยต่อ
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

      // ถ้าเป็นการ Force Refresh (เช่น มีการบันทึกมิเตอร์สำเร็จ หรือกดปุ่มอัปเดต) ให้ล้างแคชเก่าออก
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

      // โหมด Supabase ดั้งเดิมและถาวร (รวมทุกห้องแม้ไม่มีผู้เช่า)
      const activeRooms = rooms
      const compiled = activeRooms.map((r: any) => {
        const roomBill = dbBills.find((b: any) => b.roomNumber === r.roomNumber)
        const roomMeter = dbMeters.find((m: any) => m.roomNumber === r.roomNumber)
        const prevMeter = dbPrevMeters.find((m: any) => m.roomNumber === r.roomNumber)
        
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

        // กำหนดเลขมิเตอร์ครั้งก่อนหน้าแบบไดนามิกและยืดหยุ่นสูง ปรับเปลี่ยนอัตโนมัติเมื่อเลือกเดือนย้อนหลัง
        const fallbacks = getFallbackPrevReadings(r.roomNumber, cycle)
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

  // อัปเดตช่องอินพุตเลขมิเตอร์ไฟฟ้าในหน้าจอ
  const handleElecChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomNumber === roomNumber ? { ...item, elecCurr: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  // อัปเดตช่องอินพุตเลขมิเตอร์น้ำในหน้าจอ
  const handleWaterChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomNumber === roomNumber ? { ...item, waterCurr: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  // อัปเดตช่องอินพุตเลขมิเตอร์ไฟฟ้าก่อนหน้าในหน้าจอ
  const handleElecPrevChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomNumber === roomNumber ? { ...item, elecPrev: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  // อัปเดตช่องอินพุตเลขมิเตอร์น้ำก่อนหน้าในหน้าจอ
  const handleWaterPrevChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomNumber === roomNumber ? { ...item, waterPrev: value, isMeterSaved: false, isEdited: true } : item
      )
    )
  }

  // อัปเดตและคำนวณวันปรับล่าช้าในหน้าจอแบบเรียลไทม์
  const handleLateDaysChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item => {
        if (item.roomNumber !== roomNumber) return item
        
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

  // อัปเดตยอดเงินรวมเมื่อผู้ใช้แก้ไขตัวเลข ยอดบิลรวม โดยตรง
  const handleBillAmountChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item => {
        if (item.roomNumber !== roomNumber) return item
        
        const amountVal = value === "" ? 0 : Number(value)
        if (isNaN(amountVal)) return item

        return {
          ...item,
          billAmount: amountVal,
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
      billAmount: sendBillAmount
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
        sendBillAmount
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

  // อนุมัติสลิปโอนเงิน
  const handleApproveSlip = async (id: string) => {
    if (currentUserRole === "staff") {
      alert("⚠️ ขออภัย เฉพาะ Admin เท่านั้นที่มีสิทธิ์อนุมัติสลิปโอนเงิน")
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

  // ปฏิเสธสลิปโอนเงิน
  const handleRejectSlip = async (id: string) => {
    if (currentUserRole === "staff") {
      alert("⚠️ ขออภัย เฉพาะ Admin เท่านั้นที่มีสิทธิ์ปฏิเสธสลิปโอนเงิน")
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

  // เปลี่ยนสถานะเป็นชำระเงินแล้วโดยตรง (สำหรับกรณีแอดมินรับเงินสด/โอนตรง)
  const handleMarkAsPaid = async (billId: string, roomNumber: string) => {
    if (currentUserRole === "staff") {
      alert("⚠️ ขออภัย เฉพาะ Admin เท่านั้นที่มีสิทธิ์กดรับเงินและบันทึกการชำระเงินโดยตรง")
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

  // บันทึกเฉพาะห้องและสร้างบิล
  const handleSaveRow = async (roomNumber: string, type: "electric" | "water" | "all" = "all") => {
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

    // ตรวจสอบเงื่อนไขตามประเภทปุ่มที่กดบันทึก
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
          
    const otherServiceVal = Number(item.otherServiceAmount || 0)
    const totalAmount = item.baseRent + elecCost + waterCost + commonFee + otherServiceVal

    setSavingAll(true)
    setSavingProgress({ current: 1, total: 1, currentRoom: roomNumber })

    try {
      // 1. บันทึกมิเตอร์ใน DB
      const meterRes = await saveMeterRecord(
        roomNumber,
        billingCycle,
        elecPrevVal,
        elecVal,
        waterPrevVal,
        waterVal
      )
      if (!meterRes.success) {
        alert(meterRes.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูลมิเตอร์")
        setSavingAll(false)
        return
      }

      // 2. สร้าง/อัปเดตบิลใน DB (เฉพาะกรณีมีผู้เช่าเท่านั้น)
      if (!item.tenantName) {
        showToast(`บันทึกข้อมูลมิเตอร์ห้อง ${roomNumber} สำเร็จ! (ไม่มีผู้เช่า จึงไม่ได้ออกบิล)`)
        const formattedMeter = formatDbMeterToCamelCase(meterRes.data)
        updateLocalStateAndCache(roomNumber, formattedMeter, undefined)
        setSavingAll(false)
        return
      }

      const billRes = await createBill(
        roomNumber,
        item.tenantName || "ผู้เช่า",
        totalAmount,
        item.billStatus === "not_created" ? "unpaid" : (item.billStatus as any),
        billingCycle,
        eUnits,
        wUnits,
        otherServiceVal
      )
      if (!billRes.success) {
        alert(billRes.error || "เกิดข้อผิดพลาดในการออกใบแจ้งหนี้")
        setSavingAll(false)
        return
      }

      showToast(`บันทึกมิเตอร์และประมวลผลบิลห้อง ${roomNumber} สำเร็จ!`)
      const formattedMeter = formatDbMeterToCamelCase(meterRes.data)
      const formattedBill = formatDbBillToCamelCase(billRes.data)
      updateLocalStateAndCache(roomNumber, formattedMeter, formattedBill)
    } catch (err) {
      console.error(err)
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล")
    } finally {
      setSavingAll(false)
    }
  }

  // บันทึกและออกบิลให้ทุกห้องที่ข้อมูลสมบูรณ์ (แยกตามประเภท ไฟฟ้า หรือ น้ำประปา)
  const handleSaveAll = async (type: "electric" | "water") => {
    const getUnits = (curr: number, prev: number) => {
      if (curr >= prev) return curr - prev
      return (10000 - prev) + curr
    }

    // กรองหาห้องที่กรอกไม่ครบหรือผิดพลาดตามประเภท
    const invalidItems = unifiedItems.filter(item => {
      const elecVal = item.elecCurr === "" ? "" : Number(item.elecCurr)
      const waterVal = item.waterCurr === "" ? "" : Number(item.waterCurr)
      const elecPrevVal = item.elecPrev === "" ? 0 : Number(item.elecPrev)
      const waterPrevVal = item.waterPrev === "" ? 0 : Number(item.waterPrev)

      const repElec = meterReplacements?.find(r => r.roomNumber === item.roomNumber && r.meterType === "electric")
      const repWater = meterReplacements?.find(r => r.roomNumber === item.roomNumber && r.meterType === "water")
      
      if (type === "electric") {
        if (elecVal === "" || isNaN(elecVal as number) || isNaN(elecPrevVal)) {
          return true;
        }
        let eUnits = 0
        if (repElec) {
          const oldUnits = getUnits(repElec.oldFinalReading, elecPrevVal)
          const newUnits = getUnits(Number(elecVal), repElec.newStartReading)
          eUnits = oldUnits + newUnits
        } else {
          eUnits = getUnits(Number(elecVal), elecPrevVal)
        }
        return eUnits > 3000;
      } else {
        if (waterVal === "" || isNaN(waterVal as number) || isNaN(waterPrevVal)) {
          return true;
        }
        let wUnits = 0
        if (repWater) {
          const oldUnits = getUnits(repWater.oldFinalReading, waterPrevVal)
          const newUnits = getUnits(Number(waterVal), repWater.newStartReading)
          wUnits = oldUnits + newUnits
        } else {
          wUnits = getUnits(Number(waterVal), waterPrevVal)
        }
        return wUnits > 3000;
      }
    })

    if (invalidItems.length > 0) {
      const typeText = type === "electric" ? "ไฟฟ้า" : "น้ำประปา"
      alert(`ไม่สามารถประมวลผลทั้งหมดได้ เนื่องจากมี ${invalidItems.length} ห้องพักที่ข้อมูลเลขมิเตอร์${typeText}ไม่ครบถ้วน หรือคำนวณแล้วมีปริมาณหน่วยเกิน 3,000 หน่วย`)
      return
    }

    setSavingAll(true)
    setSavingProgress({ current: 0, total: unifiedItems.length, currentRoom: "" })

    try {
      let currentIdx = 0
      const updatedMetersList: any[] = []
      const updatedBillsList: any[] = []
      const stateUpdates: { [roomNumber: string]: { formattedMeter: any; formattedBill?: any } } = {}

      // โหมด Supabase
      for (const item of unifiedItems) {
        currentIdx++
        setSavingProgress({ current: currentIdx, total: unifiedItems.length, currentRoom: item.roomNumber })

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
              
        const otherServiceVal = Number(item.otherServiceAmount || 0)
        const totalAmount = item.baseRent + elecCost + waterCost + commonFee + otherServiceVal

        // 1. บันทึกเลขมิเตอร์
        const meterRes = await saveMeterRecord(
          item.roomNumber,
          billingCycle,
          elecPrevVal,
          elecVal,
          waterPrevVal,
          waterVal
        )
        if (!meterRes.success) {
          alert(`เกิดข้อผิดพลาดในการบันทึกมิเตอร์ห้อง ${item.roomNumber}: ${meterRes.error}`)
          setSavingAll(false)
          return
        }

        const formattedMeter = formatDbMeterToCamelCase(meterRes.data)
        updatedMetersList.push(formattedMeter)
        stateUpdates[item.roomNumber] = { formattedMeter }

        // 2. บันทึกและออกบิล (เฉพาะกรณีมีผู้เช่าเท่านั้น)
        if (!item.tenantName) {
          continue
        }

        const billRes = await createBill(
          item.roomNumber,
          item.tenantName || "ผู้เช่า",
          totalAmount,
          item.billStatus === "not_created" ? "unpaid" : (item.billStatus as any),
          billingCycle,
          eUnits,
          wUnits,
          otherServiceVal
        )
        if (!billRes.success) {
          alert(`เกิดข้อผิดพลาดในการสร้างบิลห้อง ${item.roomNumber}: ${billRes.error}`)
          setSavingAll(false)
          return
        }

        const formattedBill = formatDbBillToCamelCase(billRes.data)
        updatedBillsList.push(formattedBill)
        stateUpdates[item.roomNumber].formattedBill = formattedBill
      }

      // ปลุกพลัง Optimistic UI: อัปเดต React State ทันทีแบบไม่ต้องพึ่งการโหลดเน็ตเวิร์ก
      setUnifiedItems(prev => prev.map(i => {
        const update = stateUpdates[i.roomNumber]
        if (update) {
          return {
            ...i,
            meterRecordId: update.formattedMeter.id,
            elecPrev: update.formattedMeter.elecPrev,
            elecCurr: update.formattedMeter.elecCurr,
            waterPrev: update.formattedMeter.waterPrev,
            waterCurr: update.formattedMeter.waterCurr,
            isMeterSaved: true,
            isEdited: false,
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
          const idx = updatedMeters.findIndex((m: any) => m.roomNumber === formattedMeter.roomNumber)
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
          const idx = updatedBills.findIndex((b: any) => b.roomNumber === formattedBill.roomNumber)
          if (idx >= 0) {
            updatedBills[idx] = { ...updatedBills[idx], ...formattedBill }
          } else {
            updatedBills.push(formattedBill)
          }
        })
        setCachedData(currentWorkspaceId, `bills_${billingCycle}`, updatedBills)
      }

      const successText = type === "electric" ? "มิเตอร์ไฟ" : "มิเตอร์น้ำ"
      showToast(`บันทึกข้อมูล${successText}และคำนวณบิลสำเร็จเรียบร้อย!`)
    } catch (err) {
      console.error(err)
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล")
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
      const elecUnitsUsed = item.elecCurr !== "" ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr)) : 0
      const waterUnitsUsed = item.waterCurr !== "" ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr)) : 0

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

  // ดาวน์โหลดบิล PDF
  const handleDownloadBillPdf = async (item: UnifiedRoomBillingItem) => {
    if (!userPermissions.billing_download_pdf) {
      alert("คุณไม่มีสิทธิ์ในการดาวน์โหลด PDF กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การใช้งาน")
      return
    }
    setDownloadingPdfId(item.roomNumber)
    try {
      const { generateBillPdf } = await import("@/lib/pdfHelper")
      const elecUnitsUsed = item.elecCurr !== "" ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr)) : 0
      const waterUnitsUsed = item.waterCurr !== "" ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr)) : 0

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

  // ดาวน์โหลดบิล PDF ทุกห้องพร้อมกันเป็นไฟล์ ZIP
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
        // เฉพาะห้องที่มีผู้เช่าและข้อมูลครบถ้วนสำหรับการทำบิล
        if (!item.tenantName) continue

        const elecUnitsUsed = item.elecCurr !== "" ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr)) : 0
        const waterUnitsUsed = item.waterCurr !== "" ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr)) : 0

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

      // สร้างไฟล์ zip และทริกเกอร์ดาวน์โหลด
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

  // สร้างบิลด้วยตนเอง (สำหรับกรณีพิเศษ)
  const handleCreateBillManual = async (e: React.FormEvent) => {
    e.preventDefault()
    
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
      const formatted = formatDbBillToCamelCase(res.data)
      updateLocalStateAndCache(newRoomNumber, undefined, formatted)
    } else {
      alert(res.error || "ออกใบแจ้งยอดไม่สำเร็จ")
      return
    }

    setCreateBillModalOpen(false)
  }

  // คำนวณสรุปสถิติด้านบนของแดชบอร์ด (ปรับเปลี่ยนให้เหมาะสมกับห้องว่าง/ไม่มีผู้เช่า)
  const totalOccupied = unifiedItems.filter(item => item.tenantName).length
  const billedCount = unifiedItems.filter(item => item.tenantName && item.isMeterSaved).length
  const paidCount = unifiedItems.filter(item => item.billStatus === "paid").length
  const pendingCount = unifiedItems.filter(item => item.billStatus === "pending").length
  const unpaidCount = unifiedItems.filter(item => item.tenantName && (item.billStatus === "unpaid" || item.billStatus === "not_created")).length

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
            <Gauge className="w-6 h-6 text-blue-500" />
            <h2 className={`text-2xl font-black ${isDark ? "text-slate-100" : "text-slate-900"}`}>จดมิเตอร์ และดูบิล</h2>
          </div>
          <p className={`text-sm mt-1.5 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            ระบบบันทึกจดเลขมิเตอร์ไฟฟ้า มิเตอร์น้ำประปา และตรวจสอบสรุปยอดบิลอย่างง่ายประจำหอพัก
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
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

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mt-8 mb-8">
        <button
          onClick={() => setPageActiveTab("meters")}
          className={`px-6 py-3.5 font-bold text-sm md:text-base transition-all border-b-2 -mb-[2px] cursor-pointer flex items-center gap-2.5 ${
            pageActiveTab === "meters"
              ? "border-blue-500 text-blue-600 dark:text-blue-400 font-black"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Gauge className="w-5 h-5 text-blue-500" />
          <span>จดเลขมิเตอร์</span>
        </button>
        <button
          onClick={() => setPageActiveTab("summary")}
          className={`px-6 py-3.5 font-bold text-sm md:text-base transition-all border-b-2 -mb-[2px] cursor-pointer flex items-center gap-2.5 ${
            pageActiveTab === "summary"
              ? "border-teal-500 text-teal-600 dark:text-teal-400 font-black"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="w-5 h-5 text-teal-500" />
          <span>สรุปบิล</span>
        </button>
      </div>

      {/* Render based on Page Tab */}
      {pageActiveTab === "meters" ? (
        <MeterReadingTable
          isDark={isDark}
          loading={loading}
          userPermissions={userPermissions}
          hasEditPermission={userPermissions.manage_meters_bills_edit}
          unifiedItems={unifiedItems}
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
          handleBillAmountChange={handleBillAmountChange}
          mode="meters"
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
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold bg-slate-50/50 dark:bg-slate-900/10 text-xs sm:text-sm">
                  <th className="py-3.5 pl-3 w-20">เลขห้อง</th>
                  <th className="py-3.5 text-center w-28">สถานะห้อง</th>
                  <th className="py-3.5 text-right w-28">ค่าเช่าห้อง</th>
                  <th className="py-3.5 text-center bg-blue-50/40 dark:bg-blue-500/5 rounded-t-xl w-44 border-l border-slate-200 dark:border-slate-800/40 text-blue-600 dark:text-blue-400 font-bold">มิเตอร์ไฟฟ้า</th>
                  <th className="py-3.5 text-center bg-teal-50/40 dark:bg-teal-500/5 rounded-t-xl w-44 border-l border-r border-slate-200 dark:border-slate-800/40 text-teal-600 dark:text-teal-400 font-bold">มิเตอร์น้ำ</th>
                  <th className="py-3.5 text-right w-28">ค่าส่วนกลาง</th>
                  <th className="py-3.5 text-right pr-4 w-44 font-bold">ยอดบิลรวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                        <span>กำลังโหลดข้อมูลรวม...</span>
                      </div>
                    </td>
                  </tr>
                ) : unifiedItems.length > 0 ? (
                  unifiedItems.map((item) => {
                    const hasElecCurr = item.elecCurr !== "" && item.elecCurr !== null && item.elecCurr !== undefined
                    const elecUnitsUsed = hasElecCurr ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr)) : 0
                    const elecCost = hasElecCurr && elecUnitsUsed >= 0
                      ? (electricMinChecked && elecUnitsUsed <= electricMinUnit ? electricMinUnit * elecRate : elecUnitsUsed * elecRate)
                      : 0

                    const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
                    const waterUnitsUsed = hasWaterCurr ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr)) : 0
                    const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                      ? (waterMinChecked && waterUnitsUsed <= waterMinUnit ? waterMinUnit * waterRate : waterUnitsUsed * waterRate)
                      : 0

                    const simplifiedTotal = item.baseRent + elecCost + waterCost + commonFee

                    return (
                      <tr key={item.roomNumber} className={`transition-colors ${isDark ? "hover:bg-slate-900/15" : "hover:bg-slate-50/80"}`}>
                        <td className={`py-4 pl-3 font-black text-sm sm:text-base ${isDark ? "text-slate-100" : "text-slate-800"}`}>{item.roomNumber}</td>
                        
                        {/* สถานะห้อง */}
                        <td className="py-4 text-center">
                          {item.status === "occupied" ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs sm:text-sm font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              มีผู้เช่า
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs sm:text-sm font-bold bg-slate-500/10 text-slate-500 dark:text-slate-400">
                              ว่าง
                            </span>
                          )}
                        </td>

                        {/* ค่าเช่าห้อง */}
                        <td className={`py-4 text-right font-mono text-sm sm:text-base ${isDark ? "text-slate-350" : "text-slate-600"}`}>
                          {item.tenantName ? `${item.baseRent.toLocaleString()}.-` : "-"}
                        </td>

                        {/* มิเตอร์ไฟฟ้า */}
                        <td className="py-4 text-center bg-blue-50/10 dark:bg-blue-500/5 border-l border-slate-200 dark:border-slate-800/40 px-3">
                          {hasElecCurr ? (
                            <div className="flex flex-col items-center justify-center">
                              <div className="text-sm sm:text-base font-black text-blue-600 dark:text-blue-400 font-mono">
                                {elecCost.toLocaleString()}.-
                              </div>
                              <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                                {item.elecPrev} ➔ {item.elecCurr} (ใช้ไป {elecUnitsUsed} หน่วย)
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 italic">ยังไม่มีข้อมูลจดเลข</span>
                          )}
                        </td>

                        {/* มิเตอร์น้ำ */}
                        <td className="py-4 text-center bg-teal-50/10 dark:bg-teal-500/5 border-l border-r border-slate-200 dark:border-slate-800/40 px-3">
                          {hasWaterCurr ? (
                            <div className="flex flex-col items-center justify-center">
                              <div className="text-sm sm:text-base font-black text-teal-600 dark:text-teal-400 font-mono">
                                {waterCost.toLocaleString()}.-
                              </div>
                              <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                                {item.waterPrev} ➔ {item.waterCurr} (ใช้ไป {waterUnitsUsed} หน่วย)
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 italic">ยังไม่มีข้อมูลจดเลข</span>
                          )}
                        </td>

                        {/* ค่าส่วนกลาง */}
                        <td className={`py-4 text-right font-mono text-sm sm:text-base ${isDark ? "text-slate-350" : "text-slate-600"}`}>
                          {item.tenantName ? `${commonFee.toLocaleString()}.-` : "-"}
                        </td>

                        {/* ยอดบิลรวม */}
                        <td className="py-4 text-right pr-4 font-mono">
                          {item.tenantName ? (
                            <div className="flex flex-col items-end">
                              <div className={`text-sm sm:text-base font-black ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                                {simplifiedTotal.toLocaleString()}.-
                              </div>
                              <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">
                                {`${item.baseRent.toLocaleString()} + ${elecCost.toLocaleString()} + ${waterCost.toLocaleString()} + ${commonFee.toLocaleString()}`}
                              </div>
                            </div>
                          ) : (
                            <div className={`text-sm sm:text-base font-bold ${isDark ? "text-slate-650" : "text-slate-400"}`}>-</div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      ไม่มีรายการห้องพัก
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
                <span>กำลังโหลดข้อมูล...</span>
              </div>
            ) : unifiedItems.length > 0 ? (
              unifiedItems.map((item) => {
                const hasElecCurr = item.elecCurr !== "" && item.elecCurr !== null && item.elecCurr !== undefined
                const elecUnitsUsed = hasElecCurr ? (Number(item.elecCurr) >= Number(item.elecPrev) ? Number(item.elecCurr) - Number(item.elecPrev) : (10000 - Number(item.elecPrev)) + Number(item.elecCurr)) : 0
                const elecCost = hasElecCurr && elecUnitsUsed >= 0
                  ? (electricMinChecked && elecUnitsUsed <= electricMinUnit ? electricMinUnit * elecRate : elecUnitsUsed * elecRate)
                  : 0

                const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
                const waterUnitsUsed = hasWaterCurr ? (Number(item.waterCurr) >= Number(item.waterPrev) ? Number(item.waterCurr) - Number(item.waterPrev) : (10000 - Number(item.waterPrev)) + Number(item.waterCurr)) : 0
                const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                  ? (waterMinChecked && waterUnitsUsed <= waterMinUnit ? waterMinUnit * waterRate : waterUnitsUsed * waterRate)
                  : 0

                const simplifiedTotal = item.baseRent + elecCost + waterCost + commonFee

                return (
                  <div key={item.roomNumber} className={`p-4 rounded-2xl border space-y-3 shadow-sm ${
                    isDark ? "bg-slate-950/35 border-slate-900/60" : "bg-white border-slate-200"
                  }`}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-black px-3 py-1 rounded-xl border ${
                          isDark ? "text-slate-100 bg-slate-900 border-slate-800" : "text-slate-800 bg-slate-100 border-slate-200"
                        }`}>
                          {item.roomNumber}
                        </span>
                        {item.status === "occupied" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            มีผู้เช่า
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-500 dark:text-slate-400">
                            ว่าง
                          </span>
                        )}
                      </div>
                      
                      {item.tenantName && (
                        <div className="text-right">
                          <div className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>ยอดรวม (เช่า+ไฟ+น้ำ+ส่วนกลาง)</div>
                          <div className="text-base font-black text-teal-600 dark:text-teal-400 font-mono">
                            {simplifiedTotal.toLocaleString()}.-
                          </div>
                          <div className="text-[9px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
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
                        <div className={`text-[10px] font-bold flex items-center gap-1 mb-1 ${isDark ? "text-slate-450" : "text-slate-500"}`}>
                          <Home className="w-3 h-3 text-amber-500" /> ค่าเช่าห้อง
                        </div>
                        <div className={`text-sm font-black font-mono ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                          {item.tenantName ? `${item.baseRent.toLocaleString()}.-` : "-"}
                        </div>
                      </div>

                      {/* ค่าส่วนกลาง */}
                      <div className={`rounded-xl p-3 border ${
                        isDark ? "bg-slate-900/40 border-slate-800/60" : "bg-slate-50/50 border-slate-100"
                      }`}>
                        <div className={`text-[10px] font-bold flex items-center gap-1 mb-1 ${isDark ? "text-slate-450" : "text-slate-500"}`}>
                          <ShieldAlert className="w-3 h-3 text-indigo-500" /> ค่าส่วนกลาง
                        </div>
                        <div className={`text-sm font-black font-mono ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                          {item.tenantName ? `${commonFee.toLocaleString()}.-` : "-"}
                        </div>
                      </div>

                      {/* ไฟฟ้า */}
                      <div className={`rounded-xl p-3 border ${
                        isDark ? "bg-blue-500/5 border-blue-500/10" : "bg-blue-50/30 border-blue-100"
                      }`}>
                        <div className={`text-[10px] font-bold flex items-center gap-1 mb-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                          <Zap className="w-3 h-3" /> ไฟฟ้า (kWh)
                        </div>
                        {hasElecCurr ? (
                          <div>
                            <div className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">
                              {elecCost.toLocaleString()}.-
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                              {item.elecPrev} ➔ {item.elecCurr} ({elecUnitsUsed} หน่วย)
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">ไม่มีข้อมูล</span>
                        )}
                      </div>

                      {/* น้ำประปา */}
                      <div className={`rounded-xl p-3 border ${
                        isDark ? "bg-teal-500/5 border-teal-500/10" : "bg-teal-50/30 border-teal-100"
                      }`}>
                        <div className={`text-[10px] font-bold flex items-center gap-1 mb-1 ${isDark ? "text-teal-400" : "text-teal-655"}`}>
                          <Droplet className="w-3 h-3" /> น้ำประปา (m³)
                        </div>
                        {hasWaterCurr ? (
                          <div>
                            <div className="text-sm font-black text-teal-600 dark:text-teal-400 font-mono">
                              {waterCost.toLocaleString()}.-
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                              {item.waterPrev} ➔ {item.waterCurr} ({waterUnitsUsed} หน่วย)
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">ไม่มีข้อมูล</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-8 text-center text-slate-500 bg-white dark:bg-slate-950/10 border border-slate-200 dark:border-slate-900/60 rounded-2xl">
                ไม่มีรายการห้องพัก
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* หน้าต่างกำลังบันทึกข้อมูลและออกบิล (Full-Screen Saving Progress Overlay) */}
      <SavingProgressOverlay
        isDark={isDark}
        savingAll={savingAll}
        savingProgress={savingProgress}
      />
    </>
  )
}

export default function UnifiedBillingPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span className="text-sm font-semibold text-slate-500">กำลังเปิดหน้าจดมิเตอร์และบิล...</span>
      </div>
    }>
      <UnifiedBillingContent />
    </Suspense>
  )
}
