"use client"

import { useState, useEffect } from "react"
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
  Droplet
} from "lucide-react"
import { getBills, createBill, updateBillStatus } from "@/features/billing/actions"
import { getRooms } from "@/features/room/actions"
import { getMeterRecords, saveMeterRecord } from "@/features/meter/actions"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { getFinanceSettings } from "@/features/finance/actions"

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

  isEdited?: boolean
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

export default function UnifiedBillingPage() {
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === "dark" : true

  const [billingCycle, setBillingCycle] = useState("2026-06")
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
  
  const [selectedBill, setSelectedBill] = useState<any | null>(null)
  const [slipModalOpen, setSlipModalOpen] = useState(false)
  const [createBillModalOpen, setCreateBillModalOpen] = useState(false)

  // ข้อมูลสำหรับโมดอลสร้างบิลด้วยมือ (กรณีฉุกเฉิน)
  const [newRoomNumber, setNewRoomNumber] = useState("105")
  const [elecUnitsManual, setElecUnitsManual] = useState(80)
  const [waterUnitsManual, setWaterUnitsManual] = useState(10)

  const [savingAll, setSavingAll] = useState(false)
  const [savingProgress, setSavingProgress] = useState({ current: 0, total: 0, currentRoom: "" })

  const rentPrice = roomsList.find(r => r.roomNumber === newRoomNumber)?.baseRent || 4500
  const computedElecCost = electricMinChecked && elecUnitsManual <= electricMinUnit
    ? electricMinUnit * elecRate
    : elecUnitsManual * elecRate
  const computedWaterCost = waterMinChecked && waterUnitsManual <= waterMinUnit
    ? waterMinUnit * waterRate
    : waterUnitsManual * waterRate
  const computedTotal = rentPrice + computedElecCost + computedWaterCost + commonFee

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

  const loadData = async (cycle = billingCycle, forceRefresh = false) => {
    setLoading(true)
    
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

      // 1. ดึงข้อมูลห้องพักทั้งหมด
      let rooms = wsId ? getCachedData(wsId, "rooms") : null
      if (!rooms || forceRefresh) {
        const roomsRes = await getRooms()
        rooms = roomsRes.success && roomsRes.data ? roomsRes.data : []
        if (wsId) setCachedData(wsId, "rooms", rooms)
      }
      setRoomsList(rooms)
      
      // 2. ดึงข้อมูลบิลทั้งหมดประจำรอบบิลนี้
      let dbBills = wsId ? getCachedData(wsId, `bills_${cycle}`) : null
      if (!dbBills || forceRefresh) {
        const billsRes = await getBills(cycle)
        dbBills = billsRes.success && billsRes.data ? billsRes.data : []
        if (wsId) setCachedData(wsId, `bills_${cycle}`, dbBills)
      }
      
      // 3. ดึงข้อมูลมิเตอร์น้ำไฟรอบนี้
      let dbMeters = wsId ? getCachedData(wsId, `meters_${cycle}`) : null
      if (!dbMeters || forceRefresh) {
        const meterRes = await getMeterRecords(cycle)
        dbMeters = meterRes.success && meterRes.data ? meterRes.data : []
        if (wsId) setCachedData(wsId, `meters_${cycle}`, dbMeters)
      }
      
      // 4. ดึงข้อมูลมิเตอร์น้ำไฟรอบก่อน เพื่อใช้อ้างอิงเป็นเลขมิเตอร์ครั้งก่อนหน้า
      const prevCycle = getPreviousCycle(cycle)
      let dbPrevMeters = wsId ? getCachedData(wsId, `meters_${prevCycle}`) : null
      if (!dbPrevMeters || forceRefresh) {
        const prevMeterRes = await getMeterRecords(prevCycle)
        dbPrevMeters = prevMeterRes.success && prevMeterRes.data ? prevMeterRes.data : []
        if (wsId) setCachedData(wsId, `meters_${prevCycle}`, dbPrevMeters)
      }
      
      // โหมด Supabase ดั้งเดิมและถาวร
      const activeRooms = rooms.filter((r: any) => r.status === "occupied" || dbBills.some((b: any) => b.roomNumber === r.roomNumber))
      const compiled = activeRooms.map((r: any) => {
        const roomBill = dbBills.find((b: any) => b.roomNumber === r.roomNumber)
        const roomMeter = dbMeters.find((m: any) => m.roomNumber === r.roomNumber)
        const prevMeter = dbPrevMeters.find((m: any) => m.roomNumber === r.roomNumber)
        
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

        return {
          roomNumber: r.roomNumber,
          tenantName: r.tenantName,
          baseRent: Number(r.baseRent) || 4500,
          status: r.status,
          
          meterRecordId: roomMeter?.id || undefined,
          elecPrev,
          elecCurr: roomMeter ? (roomMeter.elecCurr === null || roomMeter.elecCurr === undefined ? "" : roomMeter.elecCurr) : "",
          waterPrev,
          waterCurr: roomMeter ? (roomMeter.waterCurr === null || roomMeter.waterCurr === undefined ? "" : roomMeter.waterCurr) : "",
          isMeterSaved: roomMeter ? true : false,
          isElecPrevEditable,
          isWaterPrevEditable,
          
          billId: roomBill?.id || undefined,
          billAmount: roomBill ? Number(roomBill.amount) : 0,
          billStatus: roomBill ? (roomBill.status as "unpaid" | "pending" | "paid" | "not_created") : "not_created",
          slipUrl: roomBill ? roomBill.slipUrl : null,
          electricUnits: roomBill ? Number(roomBill.electricUnits) : 0,
          waterUnits: roomBill ? Number(roomBill.waterUnits) : 0
        }
      })
      setUnifiedItems(compiled)
    } catch (err) {
      console.error("Failed to load billing unified items with cache:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(billingCycle)
  }, [billingCycle])

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

  // อนุมัติสลิปโอนเงิน
  const handleApproveSlip = async (id: string) => {
    if (currentUserRole === "staff") {
      alert("⚠️ ขออภัย เฉพาะ Admin เท่านั้นที่มีสิทธิ์อนุมัติสลิปโอนเงิน")
      return
    }
    const res = await updateBillStatus(id, "paid")
    if (res.success) {
      showToast("อนุมัติรายการชำระเงินเรียบร้อยแล้ว!")
      await loadData(billingCycle, true)
    } else {
      alert(res.error || "เกิดข้อผิดพลาดในการอัปเดตสถานะบิล")
      return
    }
    setSlipModalOpen(false)
    setSelectedBill(null)
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
      await loadData(billingCycle, true)
    } else {
      alert(res.error || "เกิดข้อผิดพลาดในการอัปเดตสถานะบิล")
      return
    }
    setSlipModalOpen(false)
    setSelectedBill(null)
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
      await loadData(billingCycle, true)
    } else {
      alert(res.error || "เกิดข้อผิดพลาดในการอัปเดตสถานะบิล")
    }
  }

  // บันทึกเฉพาะห้องและสร้างบิล
  const handleSaveRow = async (roomNumber: string) => {
    const item = unifiedItems.find(i => i.roomNumber === roomNumber)
    if (!item) return

    const elecVal = item.elecCurr === "" ? "" : Number(item.elecCurr)
    const waterVal = item.waterCurr === "" ? "" : Number(item.waterCurr)
    const elecPrevVal = item.elecPrev === "" ? 0 : Number(item.elecPrev)
    const waterPrevVal = item.waterPrev === "" ? 0 : Number(item.waterPrev)

    if (elecVal === "" || waterVal === "" || isNaN(elecVal as number) || isNaN(waterVal as number)) {
      alert("กรุณากรอกตัวเลขมิเตอร์ไฟฟ้าและค่าน้ำประปาให้ครบถ้วน")
      return
    }

    if (isNaN(elecPrevVal) || isNaN(waterPrevVal)) {
      alert("กรุณากรอกตัวเลขมิเตอร์ก่อนหน้าให้เป็นตัวเลขที่ถูกต้อง")
      return
    }

    if ((elecVal as number) < elecPrevVal || (waterVal as number) < waterPrevVal) {
      alert("⚠️ ตัวเลขมิเตอร์ปัจจุบันต้องไม่น้อยกว่ามิเตอร์ครั้งก่อนหน้า")
      return
    }

    const eUnits = (elecVal as number) - elecPrevVal
    const wUnits = (waterVal as number) - waterPrevVal
    const elecCost = electricMinChecked && eUnits <= electricMinUnit
      ? electricMinUnit * elecRate
      : eUnits * elecRate
    const waterCost = waterMinChecked && wUnits <= waterMinUnit
      ? waterMinUnit * waterRate
      : wUnits * waterRate
    const totalAmount = item.baseRent + elecCost + waterCost + commonFee

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

      // 2. สร้าง/อัปเดตบิลใน DB
      const billRes = await createBill(
        roomNumber,
        item.tenantName || "ผู้เช่า",
        totalAmount,
        item.billStatus === "not_created" ? "unpaid" : (item.billStatus as any),
        billingCycle,
        eUnits,
        wUnits
      )
      if (!billRes.success) {
        alert(billRes.error || "เกิดข้อผิดพลาดในการออกใบแจ้งหนี้")
        setSavingAll(false)
        return
      }

      showToast(`บันทึกมิเตอร์และประมวลผลบิลห้อง ${roomNumber} สำเร็จ!`)
      await loadData(billingCycle, true)
    } catch (err) {
      console.error(err)
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล")
    } finally {
      setSavingAll(false)
    }
  }

  // บันทึกและออกบิลให้ทุกห้องที่ข้อมูลสมบูรณ์
  const handleSaveAll = async () => {
    // กรองหาห้องที่กรอกไม่ครบหรือผิดพลาด
    const invalidItems = unifiedItems.filter(item => {
      const elecVal = item.elecCurr === "" ? "" : Number(item.elecCurr)
      const waterVal = item.waterCurr === "" ? "" : Number(item.waterCurr)
      const elecPrevVal = item.elecPrev === "" ? 0 : Number(item.elecPrev)
      const waterPrevVal = item.waterPrev === "" ? 0 : Number(item.waterPrev)
      return (
        elecVal === "" ||
        waterVal === "" ||
        isNaN(elecVal as number) ||
        isNaN(waterVal as number) ||
        isNaN(elecPrevVal) ||
        isNaN(waterPrevVal) ||
        (elecVal as number) < elecPrevVal ||
        (waterVal as number) < waterPrevVal
      )
    })

    if (invalidItems.length > 0) {
      alert(`ไม่สามารถประมวลผลทั้งหมดได้ เนื่องจากมี ${invalidItems.length} ห้องพักที่ข้อมูลเลขมิเตอร์ไม่ครบถ้วน หรือค่าปัจจุบันน้อยกว่าครั้งก่อนหน้า`)
      return
    }

    setSavingAll(true)
    setSavingProgress({ current: 0, total: unifiedItems.length, currentRoom: "" })

    try {
      let currentIdx = 0
      // โหมด Supabase
      for (const item of unifiedItems) {
        currentIdx++
        setSavingProgress({ current: currentIdx, total: unifiedItems.length, currentRoom: item.roomNumber })

        const elecVal = Number(item.elecCurr)
        const waterVal = Number(item.waterCurr)
        const elecPrevVal = item.elecPrev === "" ? 0 : Number(item.elecPrev)
        const waterPrevVal = item.waterPrev === "" ? 0 : Number(item.waterPrev)

        const eUnits = elecVal - elecPrevVal
        const wUnits = waterVal - waterPrevVal
        const elecCost = electricMinChecked && eUnits <= electricMinUnit
          ? electricMinUnit * elecRate
          : eUnits * elecRate
        const waterCost = waterMinChecked && wUnits <= waterMinUnit
          ? waterMinUnit * waterRate
          : wUnits * waterRate
        const totalAmount = item.baseRent + elecCost + waterCost + commonFee

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

        // 2. บันทึกและออกบิล
        const billRes = await createBill(
          item.roomNumber,
          item.tenantName || "ผู้เช่า",
          totalAmount,
          item.billStatus === "not_created" ? "unpaid" : (item.billStatus as any),
          billingCycle,
          eUnits,
          wUnits
        )
        if (!billRes.success) {
          alert(`เกิดข้อผิดพลาดในการสร้างบิลห้อง ${item.roomNumber}: ${billRes.error}`)
          setSavingAll(false)
          return
        }
      }

      showToast("บันทึกเลขมิเตอร์และคำนวณบิลให้ทุกห้องสำเร็จ!")
      await loadData(billingCycle, true)
    } catch (err) {
      console.error(err)
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล")
    } finally {
      setSavingAll(false)
    }
  }

  // ส่งข้อมูลเข้า LINE OA ของจริง
  const handleSendLine = async (roomNumber: string) => {
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
      const elecUnitsUsed = item.elecCurr !== "" ? Number(item.elecCurr) - Number(item.elecPrev) : 0
      const waterUnitsUsed = item.waterCurr !== "" ? Number(item.waterCurr) - Number(item.waterPrev) : 0

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
    setDownloadingPdfId(item.roomNumber)
    try {
      const { generateBillPdf } = await import("@/lib/pdfHelper")
      const elecUnitsUsed = item.elecCurr !== "" ? Number(item.elecCurr) - Number(item.elecPrev) : 0
      const waterUnitsUsed = item.waterCurr !== "" ? Number(item.waterCurr) - Number(item.waterPrev) : 0

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
          const elecCost = electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
          const waterCost = waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate
          return item.baseRent + elecCost + waterCost + commonFee
        })(),
        promptPayId,
        promptPayName,
        workspaceName,
        workspaceAddress,
        workspacePhone,
        workspaceTaxId
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

        const elecUnitsUsed = item.elecCurr !== "" ? Number(item.elecCurr) - Number(item.elecPrev) : 0
        const waterUnitsUsed = item.waterCurr !== "" ? Number(item.waterCurr) - Number(item.waterPrev) : 0

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
            const elecCost = electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
            const waterCost = waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate
            return item.baseRent + elecCost + waterCost + commonFee
          })(),
          promptPayId,
          promptPayName,
          workspaceName,
          workspaceAddress,
          workspacePhone,
          workspaceTaxId
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
    if (room && room.tenantName) {
      targetTenant = room.tenantName
    } else {
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
      waterUnitsManual
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

  // คำนวณสรุปสถิติด้านบนของแดชบอร์ด
  const totalOccupied = unifiedItems.length
  const billedCount = unifiedItems.filter(item => item.billStatus !== "not_created").length
  const paidCount = unifiedItems.filter(item => item.billStatus === "paid").length
  const pendingCount = unifiedItems.filter(item => item.billStatus === "pending").length
  const unpaidCount = unifiedItems.filter(item => item.billStatus === "unpaid" || item.billStatus === "not_created").length

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
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-blue-500" />
            <h2 className={`text-xl font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>จดเลขมิเตอร์ & จัดการบิลค่าเช่า</h2>
          </div>
          <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            หน้าจอแบบบูรณาการ: บันทึกหน่วยมิเตอร์ไฟ/น้ำ พร้อมประมวลผลคำนวณออกใบแจ้งหนี้ให้ผู้เช่าได้ทันทีในคลิกเดียว
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto">
          {/* แถบเลือกเดือนรอบบิล */}
          <select
            className={`w-full md:w-auto h-12 md:h-9 px-3.5 border rounded-xl focus:outline-none focus:border-blue-500 text-sm md:text-xs font-semibold transition-all cursor-pointer ${
              isDark ? "bg-slate-900 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
            }`}
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value)}
          >
            {getBillingCycleOptions(registrationCycle).map(opt => (
              <option key={opt.value} value={opt.value} className={isDark ? "bg-slate-900 text-slate-200" : "bg-white text-slate-800"}>{opt.label}</option>
            ))}
          </select>

          {/* ดาวน์โหลด PDF ทั้งหมด */}
          <button
            onClick={handleDownloadAllBillsPdf}
            disabled={downloadingAllPdf}
            className={`w-full md:w-auto h-12 md:h-9 text-white font-semibold px-4 rounded-xl flex items-center justify-center md:justify-start gap-1.5 text-sm md:text-xs transition-all cursor-pointer ${
              downloadingAllPdf
                ? (isDark ? "bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed" : "bg-slate-200 border border-slate-300 text-slate-400 cursor-not-allowed")
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-600/20 active:scale-95"
            }`}
          >
            {downloadingAllPdf ? (
              <>
                <RefreshCw className="w-4 h-4 md:w-3.5 md:h-3.5 animate-spin text-blue-300" /> กำลังสร้าง PDF...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 md:w-3.5 md:h-3.5" /> เซฟบิล PDF ทั้งหมด
              </>
            )}
          </button>

          {/* ปุ่มบิลกำหนดเอง (สำหรับแอดมินหรือกรณีฉุกเฉิน) */}
          <button
            onClick={() => setCreateBillModalOpen(true)}
            className={`w-full md:w-auto h-12 md:h-9 px-3.5 rounded-xl flex items-center justify-center md:justify-start gap-1.5 text-sm md:text-xs font-semibold transition-all cursor-pointer shadow-sm ${
              isDark
                ? "bg-slate-900 hover:bg-slate-850 border-slate-800 hover:border-slate-700 text-slate-300"
                : "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700"
            }`}
          >
            <Plus className={`w-4 h-4 md:w-3.5 md:h-3.5 ${isDark ? "text-blue-400" : "text-blue-500"}`} /> บิลจำลองพิเศษ
          </button>
        </div>
      </div>

      {/* แดชบอร์ดสรุปสถิติประจำรอบเดือน */}
      <BillingSummaryStats
        isDark={isDark}
        billedCount={billedCount}
        totalOccupied={totalOccupied}
        paidCount={paidCount}
        pendingCount={pendingCount}
        unpaidCount={unpaidCount}
      />

      <MeterReadingTable
        isDark={isDark}
        loading={loading}
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
      />

      {/* Modal ตรวจสอบสลิปโอนเงินธนาคาร */}
      <SlipVerificationModal
        isDark={isDark}
        slipModalOpen={slipModalOpen}
        selectedBill={selectedBill}
        billingCycle={billingCycle}
        onClose={() => {
          setSlipModalOpen(false)
          setSelectedBill(null)
        }}
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
