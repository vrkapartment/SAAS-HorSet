"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import DashboardLayout from "@/components/DashboardLayout"
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

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === "dark" : false

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

  // ส่งข้อมูลเข้า LINE OA
  const handleSendLine = (room: string) => {
    showToast(`ส่งไฟล์บิล PDF และพร้อมเพย์ QR ไปยัง LINE ผู้เช่าห้อง ${room} สำเร็จ!`)
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
    <DashboardLayout role="staff">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* การจดมิเตอร์ */}
        <div className={`p-4 rounded-2xl border flex items-center gap-3 shadow-sm ${
          isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200"
        }`}>
          <div className={`p-2.5 rounded-xl ${isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-500/10 text-blue-500"}`}>
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>บันทึกมิเตอร์แล้ว</p>
            <p className={`text-base font-extrabold ${isDark ? "text-slate-100" : "text-slate-800"}`}>{billedCount} / {totalOccupied} ห้อง</p>
          </div>
        </div>

        {/* ชำระเงินเรียบร้อย */}
        <div className={`p-4 rounded-2xl border flex items-center gap-3 shadow-sm ${
          isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200"
        }`}>
          <div className={`p-2.5 rounded-xl ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-500/10 text-emerald-500"}`}>
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>ชำระเงินเรียบร้อย</p>
            <p className={`text-base font-extrabold ${isDark ? "text-slate-100" : "text-slate-800"}`}>{paidCount} ห้อง</p>
          </div>
        </div>

        {/* รอตรวจสอบสลิป */}
        <div className={`p-4 rounded-2xl border flex items-center gap-3 relative overflow-hidden shadow-sm ${
          isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200"
        }`}>
          {pendingCount > 0 && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />}
          <div className={`p-2.5 rounded-xl ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-500/10 text-amber-500"}`}>
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>รอตรวจสอบสลิป</p>
            <p className={`text-base font-extrabold ${
              pendingCount > 0 
                ? `font-black animate-pulse ${isDark ? "text-amber-400" : "text-amber-600"}` 
                : (isDark ? "text-slate-400" : "text-slate-500")
            }`}>
              {pendingCount} ห้อง
            </p>
          </div>
        </div>

        {/* ค้างชำระ */}
        <div className={`p-4 rounded-2xl border flex items-center gap-3 shadow-sm ${
          isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-white border-slate-200"
        }`}>
          <div className={`p-2.5 rounded-xl ${isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-500/10 text-rose-500"}`}>
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>ค้างชำระเงิน</p>
            <p className={`text-base font-extrabold ${isDark ? "text-rose-400" : "text-rose-600"}`}>{unpaidCount} ห้อง</p>
          </div>
        </div>
      </div>

      {/* แจ้งเตือน */}
      <div className={`flex items-center gap-2.5 p-3.5 border rounded-xl text-xs font-medium ${
        isDark 
          ? "bg-blue-950/10 border-blue-500/20 text-blue-400/90" 
          : "bg-blue-50/60 border-blue-100 text-blue-700"
      }`}>
        <Sparkles className={`w-4 h-4 shrink-0 ${isDark ? "text-blue-400" : "text-blue-500"}`} />
        <span>ระบบจำลองการประมวลผลดึงค่ามิเตอร์ครั้งก่อนหน้าและราคาค่าเช่าอิงตาม Room Type โดยอัตโนมัติ กรอกเพียงเลขมิเตอร์ปัจจุบันเพื่อสร้างบิล</span>
      </div>

      {/* ตารางควบคุมหลัก */}
      <div className={`p-0 md:p-5 bg-transparent md:rounded-2xl md:shadow-sm ${
        isDark 
          ? "md:bg-slate-900/30 md:border md:border-slate-800/80" 
          : "md:bg-white md:border md:border-slate-200"
      }`}>
        {/* Mobile View: Card List (< 768px) */}
        <div className="block md:hidden space-y-4">
          {loading ? (
            <div className="py-12 text-center text-slate-500 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/60 rounded-2xl shadow-sm">
              <div className="flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                <span>กำลังโหลดข้อมูลรวม...</span>
              </div>
            </div>
          ) : unifiedItems.length > 0 ? (
            unifiedItems.map((item) => {
              const hasElecCurr = item.elecCurr !== "" && item.elecCurr !== null && item.elecCurr !== undefined
              const elecUnitsUsed = hasElecCurr ? Number(item.elecCurr) - Number(item.elecPrev) : 0
              const elecCost = hasElecCurr && elecUnitsUsed >= 0
                ? (electricMinChecked && elecUnitsUsed <= electricMinUnit ? electricMinUnit * elecRate : elecUnitsUsed * elecRate)
                : 0

              const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
              const waterUnitsUsed = hasWaterCurr ? Number(item.waterCurr) - Number(item.waterPrev) : 0
              const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                ? (waterMinChecked && waterUnitsUsed <= waterMinUnit ? waterMinUnit * waterRate : waterUnitsUsed * waterRate)
                : 0
              
              const calculatedAmount = item.baseRent + elecCost + waterCost + commonFee
              const isModified = item.billStatus !== "not_created" && item.billAmount !== calculatedAmount

              return (
                <div key={item.roomNumber} className={`p-4 rounded-2xl border space-y-4 shadow-sm ${
                  isDark ? "bg-slate-950/35 border-slate-900/60" : "bg-white border-slate-200"
                }`}>
                  {/* Card Header: Room, Tenant, Status */}
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-black px-3 py-1 rounded-xl border ${
                          isDark ? "text-slate-100 bg-slate-900 border-slate-800" : "text-slate-800 bg-slate-100 border-slate-200"
                        }`}>
                          {item.roomNumber}
                        </span>
                        <span className={`inline-block text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                          item.billStatus === "paid" ? (isDark ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border border-emerald-200") :
                          item.billStatus === "pending" ? (isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse" : "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse") :
                          item.billStatus === "unpaid" ? (isDark ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-rose-50 text-rose-600 border border-rose-200") :
                          (isDark ? "bg-slate-900 text-slate-400 border border-slate-800" : "bg-slate-100 text-slate-500 border border-slate-250")
                        }`}>
                          {item.billStatus === "paid" ? "ชำระเงินแล้ว" :
                           item.billStatus === "pending" ? "รอตรวจสลิป" :
                           item.billStatus === "unpaid" ? "ค้างชำระ" : "ยังไม่ออกบิล"}
                        </span>
                      </div>
                      <div className={`font-bold mt-2 ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                        {item.tenantName || <span className={isDark ? "text-slate-600 italic" : "text-slate-400 italic"}>ไม่มีข้อมูลผู้เช่า</span>}
                      </div>
                      <div className={`text-[11px] font-mono mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        ค่าเช่า {item.baseRent.toLocaleString()}.- | ส่วนกลาง {commonFee}.-
                      </div>
                    </div>
                    
                    {/* Total Display */}
                    <div className="text-right">
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>ยอดรวมสุทธิ</div>
                      <div className="text-lg font-black text-teal-600 dark:text-teal-400 font-mono">
                        {calculatedAmount.toLocaleString()}.-
                      </div>
                      {isModified && (
                        <span className={`inline-block text-[9px] bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold mt-1 ${
                          isDark ? "text-amber-400" : "text-amber-600"
                        }`}>
                          ยอดเงินเปลี่ยน
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={`h-px ${isDark ? "bg-slate-900/60" : "bg-slate-200"}`} />

                  {/* Meter Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Electricity Meter Card Section */}
                    <div className={`rounded-xl p-3 border space-y-3 ${
                      isDark ? "bg-blue-500/5 border-blue-500/10" : "bg-blue-50/50 border-blue-100"
                    }`}>
                      <div className="flex justify-between items-center gap-2">
                        <span className={`text-xs font-bold flex items-center gap-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                          <Zap className="w-3.5 h-3.5" /> ไฟฟ้า (kWh)
                        </span>
                        {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isElecPrevEditable ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>ก่อนหน้า:</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="กรอก"
                              className={`w-16 h-6.5 text-center border rounded font-mono text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all ${
                                isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-200 text-slate-800"
                              }`}
                              value={item.elecPrev}
                              onChange={(e) => handleElecPrevChange(item.roomNumber, e.target.value)}
                            />
                          </div>
                        ) : (
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                            isDark ? "bg-slate-950 border-slate-900 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"
                          }`}>
                            ก่อนหน้า: <strong className={isDark ? "text-slate-200" : "text-slate-800"}>{item.elecPrev}</strong>
                          </span>
                        )}
                      </div>
                      
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="จดเลขมิเตอร์ไฟฟ้า..."
                          className={`w-full h-12 px-3 text-base border rounded-xl font-mono font-bold focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 transition-all placeholder:text-slate-400 ${
                            isDark ? "bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600" : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400"
                          }`}
                          value={item.elecCurr}
                          onChange={(e) => handleElecChange(item.roomNumber, e.target.value)}
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-black pointer-events-none">
                          kWh
                        </span>
                      </div>

                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-500 dark:text-slate-400">หน่วยไฟที่ใช้:</span>
                        <span className={`font-bold ${!hasElecCurr ? "text-slate-500 dark:text-slate-400" : elecUnitsUsed < 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                          {hasElecCurr ? (elecUnitsUsed >= 0 ? `${elecUnitsUsed} หน่วย` : "ผิดพลาด") : "รอจด"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-500 dark:text-slate-400">รวมเงินค่าไฟ:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {hasElecCurr && elecUnitsUsed >= 0 
                            ? `${elecCost.toLocaleString()}.- ${electricMinChecked && elecUnitsUsed <= electricMinUnit ? "(ขั้นต่ำ)" : ""}` 
                            : "-"}
                        </span>
                      </div>
                    </div>

                    {/* Water Meter Card Section */}
                    <div className="bg-teal-50/50 dark:bg-teal-500/5 rounded-xl p-3 border border-teal-100 dark:border-teal-500/10 space-y-3">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-xs font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1">
                          <Droplet className="w-3.5 h-3.5" /> น้ำประปา (m³)
                        </span>
                        {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isWaterPrevEditable ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">ก่อนหน้า:</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="กรอก"
                              className="w-16 h-6.5 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-800 dark:text-slate-200 font-mono text-[10px] font-bold focus:outline-none focus:border-teal-500 transition-all"
                              value={item.waterPrev}
                              onChange={(e) => handleWaterPrevChange(item.roomNumber, e.target.value)}
                            />
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-900">
                            ก่อนหน้า: <strong className="text-slate-800 dark:text-slate-200">{item.waterPrev}</strong>
                          </span>
                        )}
                      </div>
                      
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="จดเลขมิเตอร์น้ำประปา..."
                          className="w-full h-12 px-3 text-base bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none focus:border-teal-500/80 focus:ring-1 focus:ring-teal-500/30 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                          value={item.waterCurr}
                          onChange={(e) => handleWaterChange(item.roomNumber, e.target.value)}
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-black pointer-events-none">
                          m³
                        </span>
                      </div>

                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-500 dark:text-slate-400">หน่วยน้ำที่ใช้:</span>
                        <span className={`font-bold ${!hasWaterCurr ? "text-slate-500 dark:text-slate-400" : waterUnitsUsed < 0 ? "text-red-600 dark:text-red-400" : "text-teal-600 dark:text-teal-400"}`}>
                          {hasWaterCurr ? (waterUnitsUsed >= 0 ? `${waterUnitsUsed} หน่วย` : "ผิดพลาด") : "รอจด"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-500 dark:text-slate-400">รวมเงินค่าน้ำ:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {hasWaterCurr && waterUnitsUsed >= 0 
                            ? `${waterCost.toLocaleString()}.- ${waterMinChecked && waterUnitsUsed <= waterMinUnit ? "(ขั้นต่ำ)" : ""}` 
                            : "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons Section */}
                  <div className="pt-2 space-y-2">
                    {/* Save Button (Primary Action) */}
                    <button
                      onClick={() => handleSaveRow(item.roomNumber)}
                      disabled={item.isMeterSaved && item.billStatus !== "not_created" && !isModified}
                      className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        item.isMeterSaved && item.billStatus !== "not_created" && !isModified
                          ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-250 dark:border-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                          : "bg-teal-600 hover:bg-teal-500 border border-teal-500/30 text-white shadow-lg shadow-teal-600/10 active:scale-[0.98]"
                      }`}
                    >
                      <Save className="w-4 h-4" /> บันทึกและออกบิลห้อง {item.roomNumber}
                    </button>

                    {/* Sub/Secondary Actions Grid */}
                    {item.billStatus === "pending" ? (
                      <button
                        onClick={() => {
                          setSelectedBill(item)
                          setSlipModalOpen(true)
                        }}
                        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/10 cursor-pointer"
                      >
                        <Eye className="w-4 h-4" /> ตรวจสอบสลิปโอนเงิน
                      </button>
                    ) : item.billStatus !== "not_created" ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {/* Download PDF */}
                          <button
                            onClick={() => handleDownloadBillPdf(item)}
                            disabled={downloadingPdfId !== null}
                            className="h-12 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                          >
                            {downloadingPdfId === item.roomNumber ? (
                              <div className="w-4 h-4 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <Download className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                                <span>ดาวน์โหลด PDF</span>
                              </>
                            )}
                          </button>

                          {/* Send Line OA */}
                          <button
                            onClick={() => handleSendLine(item.roomNumber)}
                            className="h-12 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                          >
                            <Send className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                            <span>ส่ง LINE OA</span>
                          </button>
                        </div>

                        {/* If unpaid, direct payment record (Cash/Manual) */}
                        {item.billStatus === "unpaid" && (
                          <button
                            onClick={() => handleMarkAsPaid(item.billId!, item.roomNumber)}
                            className="w-full h-12 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-600/10 dark:hover:bg-emerald-600/20 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                          >
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                            <span>รับเงินสด / บันทึกชำระเงินตรง</span>
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-slate-500 bg-white dark:bg-slate-950/10 border border-slate-200 dark:border-slate-900/60 rounded-2xl shadow-sm">
              ไม่มีรายการห้องพักที่ใช้งานหรือจ้างเช่าอยู่ในขณะนี้
            </div>
          )}
        </div>

        {/* Desktop View: Standard Dense Table (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-900/10">
                <th className="pb-3 pl-3 w-16">ห้อง</th>
                <th className="pb-3 w-40">ผู้เช่า / ค่าเช่า</th>
                
                {/* กลุ่มไฟฟ้า */}
                <th className="pb-3 text-center bg-blue-50/60 dark:bg-blue-500/5 rounded-t-xl w-32 border-l border-slate-200 dark:border-slate-800/40 text-blue-600 dark:text-blue-400 font-bold">ไฟก่อนหน้า</th>
                <th className="pb-3 text-center bg-blue-50/60 dark:bg-blue-500/5 w-36 text-blue-600 dark:text-blue-400 font-bold">ไฟรอบนี้</th>
                <th className="pb-3 text-center bg-blue-50/60 dark:bg-blue-500/5 w-28 rounded-t-xl border-r border-slate-200 dark:border-slate-800/40 text-blue-600 dark:text-blue-400 font-bold">หน่วย/ยอด</th>
                
                {/* กลุ่มน้ำ */}
                <th className="pb-3 text-center bg-teal-50/60 dark:bg-teal-500/5 rounded-t-xl w-32 text-teal-600 dark:text-teal-400 font-bold font-bold">น้ำก่อนหน้า</th>
                <th className="pb-3 text-center bg-teal-50/60 dark:bg-teal-500/5 w-36 text-teal-600 dark:text-teal-400 font-bold font-bold font-bold">น้ำรอบนี้</th>
                <th className="pb-3 text-center bg-teal-50/60 dark:bg-teal-500/5 w-28 rounded-t-xl border-r border-slate-200 dark:border-slate-800/40 text-teal-600 dark:text-teal-400 font-bold">หน่วย/ยอด</th>
                
                <th className="pb-3 text-right pr-4 w-32">ยอดรวมบิล</th>
                <th className="pb-3 text-center w-28">สถานะ</th>
                <th className="pb-3 text-center w-40 pr-2">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                      <span>กำลังโหลดข้อมูลรวม...</span>
                    </div>
                  </td>
                </tr>
              ) : unifiedItems.length > 0 ? (
                unifiedItems.map((item) => {
                  const hasElecCurr = item.elecCurr !== "" && item.elecCurr !== null && item.elecCurr !== undefined
                  const elecUnitsUsed = hasElecCurr ? Number(item.elecCurr) - Number(item.elecPrev) : 0
                  const elecCost = hasElecCurr && elecUnitsUsed >= 0
                    ? (electricMinChecked && elecUnitsUsed <= electricMinUnit ? electricMinUnit * elecRate : elecUnitsUsed * elecRate)
                    : 0

                  const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
                  const waterUnitsUsed = hasWaterCurr ? Number(item.waterCurr) - Number(item.waterPrev) : 0
                  const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                    ? (waterMinChecked && waterUnitsUsed <= waterMinUnit ? waterMinUnit * waterRate : waterUnitsUsed * waterRate)
                    : 0
                  
                  // คำนวณยอดเงินเรียลไทม์
                  const calculatedAmount = item.baseRent + elecCost + waterCost + commonFee

                  const isModified = item.billStatus !== "not_created" && item.billAmount !== calculatedAmount

                  return (
                    <tr key={item.roomNumber} className={`transition-colors ${isDark ? "hover:bg-slate-900/15" : "hover:bg-slate-50/80"}`}>
                      {/* ห้อง */}
                      <td className={`py-4 pl-3 font-black text-sm ${isDark ? "text-slate-100" : "text-slate-800"}`}>{item.roomNumber}</td>
                      
                      {/* ผู้เช่า / ค่าเช่าห้อง */}
                      <td className="py-4">
                        <div className={`font-bold truncate max-w-[140px] ${isDark ? "text-slate-300" : "text-slate-700"}`} title={item.tenantName || "ไม่มีผู้เช่า"}>
                          {item.tenantName || <span className={isDark ? "text-slate-600 italic" : "text-slate-400 italic"}>ไม่มีข้อมูลผู้เช่า</span>}
                        </div>
                        <div className={`text-[10px] font-mono mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          ค่าเช่า {item.baseRent.toLocaleString()}.- + ส่วนกลาง {commonFee}.-
                        </div>
                      </td>
                      
                      {/* ไฟฟ้า - ก่อนหน้า */}
                      <td className="py-4 text-center bg-blue-50/20 dark:bg-blue-500/5 border-l border-slate-200 dark:border-slate-800/40 px-2">
                        {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isElecPrevEditable ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="กรอกเลข"
                            className={`w-20 text-center py-1.5 border rounded-lg font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all font-semibold ${
                              isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                            }`}
                            value={item.elecPrev}
                            onChange={(e) => handleElecPrevChange(item.roomNumber, e.target.value)}
                          />
                        ) : (
                          <span className={`font-mono font-semibold px-2.5 py-1 rounded-lg border ${
                            isDark ? "text-slate-400 bg-slate-900/50 border-slate-800/40" : "text-slate-600 bg-slate-100 border-slate-200"
                          }`}>
                            {item.elecPrev}
                          </span>
                        )}
                      </td>

                      {/* ไฟฟ้า - อินพุตปัจจุบัน */}
                      <td className="py-4 text-center bg-blue-50/20 dark:bg-blue-500/5 px-2">
                        <div className="relative inline-block">
                          <input
                            type="text"
                            placeholder="กรอกเลข"
                            className={`w-24 text-center py-1.5 border rounded-lg font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all font-semibold ${
                              isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                            }`}
                            value={item.elecCurr}
                            onChange={(e) => handleElecChange(item.roomNumber, e.target.value)}
                          />
                          <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold pointer-events-none ${
                            isDark ? "text-slate-600" : "text-slate-400"
                          }`}>
                            kWh
                          </span>
                        </div>
                      </td>

                      {/* ไฟฟ้า - สรุปหน่วยที่ใช้ / ค่าใช้จ่าย */}
                      <td className="py-4 text-center bg-blue-50/20 dark:bg-blue-500/5 border-r border-slate-200 dark:border-slate-800/40 font-mono">
                        <div className={`font-black text-xs ${!hasElecCurr ? "text-slate-400 dark:text-slate-500" : elecUnitsUsed < 0 ? "text-red-500 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                          {hasElecCurr ? (elecUnitsUsed >= 0 ? `${elecUnitsUsed} หน่วย` : "ผิดพลาด") : "รอจด"}
                        </div>
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                          {hasElecCurr && elecUnitsUsed >= 0 
                            ? `${elecCost.toLocaleString()}.- ${electricMinChecked && elecUnitsUsed <= electricMinUnit ? "(ขั้นต่ำ)" : ""}` 
                            : "-"}
                        </div>
                      </td>

                      {/* น้ำประปา - ก่อนหน้า */}
                      <td className="py-4 text-center bg-teal-50/20 dark:bg-teal-500/5 px-2">
                        {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isWaterPrevEditable ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="กรอกเลข"
                            className={`w-20 text-center py-1.5 border rounded-lg font-mono text-xs focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all font-semibold ${
                              isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                            }`}
                            value={item.waterPrev}
                            onChange={(e) => handleWaterPrevChange(item.roomNumber, e.target.value)}
                          />
                        ) : (
                          <span className={`font-mono font-semibold px-2.5 py-1 rounded-lg border ${
                            isDark ? "text-slate-400 bg-slate-900/50 border-slate-800/40" : "text-slate-600 bg-slate-100 border-slate-200"
                          }`}>
                            {item.waterPrev}
                          </span>
                        )}
                      </td>

                      {/* น้ำประปา - อินพุตปัจจุบัน */}
                      <td className="py-4 text-center bg-teal-50/20 dark:bg-teal-500/5 px-2">
                        <div className="relative inline-block">
                          <input
                            type="text"
                            placeholder="กรอกเลข"
                            className={`w-24 text-center py-1.5 border rounded-lg font-mono text-xs focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all font-semibold ${
                              isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                            }`}
                            value={item.waterCurr}
                            onChange={(e) => handleWaterChange(item.roomNumber, e.target.value)}
                          />
                          <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold pointer-events-none ${
                            isDark ? "text-slate-600" : "text-slate-400"
                          }`}>
                            m³
                          </span>
                        </div>
                      </td>

                      {/* น้ำประปา - สรุปหน่วยที่ใช้ / ค่าใช้จ่าย */}
                      <td className="py-4 text-center bg-teal-50/20 dark:bg-teal-500/5 border-r border-slate-200 dark:border-slate-800/40 font-mono">
                        <div className={`font-black text-xs ${!hasWaterCurr ? "text-slate-400 dark:text-slate-500" : waterUnitsUsed < 0 ? "text-red-500 dark:text-red-400" : "text-teal-600 dark:text-teal-400"}`}>
                          {hasWaterCurr ? (waterUnitsUsed >= 0 ? `${waterUnitsUsed} หน่วย` : "ผิดพลาด") : "รอจด"}
                        </div>
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                          {hasWaterCurr && waterUnitsUsed >= 0 
                            ? `${waterCost.toLocaleString()}.- ${waterMinChecked && waterUnitsUsed <= waterMinUnit ? "(ขั้นต่ำ)" : ""}` 
                            : "-"}
                        </div>
                      </td>

                      {/* ยอดบิลรวม */}
                      <td className="py-4 text-right pr-4 font-mono">
                        <div className={`text-sm font-black ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                          {calculatedAmount.toLocaleString()}.-
                        </div>
                        {isModified && (
                          <span className={`inline-block text-[8px] bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded font-bold ${
                            isDark ? "text-amber-400" : "text-amber-600"
                          }`}>
                            ยอดเงินเปลี่ยน
                          </span>
                        )}
                      </td>

                      {/* สถานะบิล */}
                      <td className="py-4 text-center">
                        <span className={`inline-block text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                          item.billStatus === "paid" ? (isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200") :
                          item.billStatus === "pending" ? (isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse" : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse") :
                          item.billStatus === "unpaid" ? (isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200") :
                          (isDark ? "bg-slate-900 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-500 border-slate-250")
                        }`}>
                          {item.billStatus === "paid" ? "ชำระเงินแล้ว" :
                           item.billStatus === "pending" ? "รอตรวจสลิป" :
                           item.billStatus === "unpaid" ? "ค้างชำระ" : "ยังไม่ออกบิล"}
                        </span>
                      </td>

                      {/* แถบการจัดการบิล */}
                      <td className="py-4 text-center pr-2">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* ปุ่มเซฟและออกบิล */}
                          <button
                            onClick={() => handleSaveRow(item.roomNumber)}
                            disabled={item.isMeterSaved && item.billStatus !== "not_created" && !isModified}
                            className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                              item.isMeterSaved && item.billStatus !== "not_created" && !isModified
                                ? (isDark ? "border-slate-800/40 bg-slate-950/20 text-slate-600 cursor-not-allowed" : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed")
                                : (isDark ? "border-teal-500/30 bg-teal-500/10 hover:bg-teal-500 text-teal-400 hover:text-white hover:scale-105 shadow-sm" : "border-teal-250 bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white hover:scale-105 shadow-sm")
                            }`}
                            title="บันทึกมิเตอร์และออกบิล"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span className="text-[10px]">บันทึกบิล</span>
                          </button>

                          {/* ปุ่มตรวจสลิป กรณีชำระเงินเข้ามา */}
                          {item.billStatus === "pending" ? (
                            <button
                              onClick={() => {
                                setSelectedBill(item)
                                setSlipModalOpen(true)
                              }}
                              className={`p-1.5 rounded-xl border transition-all font-semibold text-xs flex items-center gap-1 hover:scale-105 cursor-pointer ${
                                isDark ? "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500 hover:text-white" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-500 hover:text-white"
                              }`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span className="text-[10px]">ตรวจสลิป</span>
                            </button>
                          ) : item.billStatus !== "not_created" ? (
                            <>
                              {/* ดาวน์โหลด PDF */}
                              <button
                                onClick={() => handleDownloadBillPdf(item)}
                                disabled={downloadingPdfId !== null}
                                className={`p-1.5 border rounded-xl transition-all cursor-pointer ${
                                  isDark ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-blue-400 hover:border-blue-500/40" : "bg-white border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-500/40"
                                }`}
                                title="ดาวน์โหลดบิล PDF"
                              >
                                {downloadingPdfId === item.roomNumber ? (
                                  <div className="w-3.5 h-3.5 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {/* ส่ง LINE OA */}
                              <button
                                onClick={() => handleSendLine(item.roomNumber)}
                                className={`p-1.5 border rounded-xl transition-all cursor-pointer ${
                                  isDark ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-teal-400 hover:border-teal-500/40" : "bg-white border-slate-200 text-slate-600 hover:text-teal-600 hover:border-teal-500/40"
                                }`}
                                title="ส่งเข้า LINE OA"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>

                              {/* บันทึกรับเงินโดยตรง (สำหรับค้างชำระ) */}
                              {item.billStatus === "unpaid" && (
                                <button
                                  onClick={() => handleMarkAsPaid(item.billId!, item.roomNumber)}
                                  className={`p-1.5 border rounded-xl transition-all flex items-center gap-1 hover:scale-105 shadow-sm cursor-pointer ${
                                    isDark ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40" : "bg-white border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-500/40"
                                  }`}
                                  title="รับเงินสด/บันทึกชำระเงินตรง"
                                >
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className={`text-[10px] hidden xl:inline font-bold ${isDark ? "text-slate-400 hover:text-emerald-300" : "text-slate-500 hover:text-emerald-600"}`}>รับเงินแล้ว</span>
                                </button>
                              )}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    ไม่มีรายการห้องพักที่ใช้งานหรือจ้างเช่าอยู่ในขณะนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ปุ่มบันทึกบิลทั้งหมด (Save All Bills Button at the bottom of the last room) */}
        {!loading && unifiedItems.length > 0 && (
          <div className="mt-8 flex justify-center px-4 md:px-0 pb-4">
            <button
              onClick={handleSaveAll}
              className="w-full md:w-auto min-w-[280px] h-14 md:h-12 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-extrabold px-8 rounded-2xl flex items-center justify-center gap-2.5 text-sm md:text-xs shadow-lg shadow-teal-600/20 hover:shadow-teal-500/30 transition-all cursor-pointer active:scale-[0.98] border border-teal-500/30 animate-pulse hover:animate-none"
            >
              <Save className="w-5 h-5 md:w-4.5 md:h-4.5 text-teal-100" />
              <span>บันทึกและออกบิลทุกห้อง ({unifiedItems.length} ห้อง)</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal ตรวจสอบสลิปโอนเงินธนาคาร */}
      {slipModalOpen && selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className={`${
            isDark ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-200"
          } w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6 rounded-3xl relative shadow-2xl animate-scale-up grid grid-cols-1 md:grid-cols-2 gap-6 border`}>
            <button
              onClick={() => {
                setSlipModalOpen(false)
                setSelectedBill(null)
              }}
              className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                isDark ? "text-slate-400 hover:text-white hover:bg-slate-900/50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              }`}
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* ฝั่งสลิปธนาคาร */}
            <div className="space-y-2">
              <h4 className={`text-xs font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>รูปภาพหลักฐานการโอนเงิน</h4>
              <div className={`w-full aspect-[3/4] rounded-2xl overflow-hidden border relative flex items-center justify-center ${
                isDark ? "bg-slate-950 border-slate-900/60" : "bg-slate-50 border-slate-200"
              }`}>
                {selectedBill.slipUrl ? (
                  <img
                    src={selectedBill.slipUrl}
                    alt="Slip Verification"
                    className="object-contain w-full h-full"
                  />
                ) : (
                  <p className={`text-xs ${isDark ? "text-slate-600" : "text-slate-400"}`}>ไม่พบหลักฐานไฟล์แนบในระบบ</p>
                )}
              </div>
            </div>
 
            {/* ฝั่งรายละเอียดและการกดอนุมัติ */}
            <div className="flex flex-col justify-between pt-3">
              <div className="space-y-4">
                <h3 className={`text-sm font-black flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <CreditCard className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-500"}`} /> อนุมัติสลิปโอนและปิดบิล
                </h3>
 
                <div className={`p-4 rounded-xl space-y-2.5 border text-xs ${
                  isDark ? "bg-slate-900/60 border-slate-900" : "bg-slate-50 border-slate-200"
                }`}>
                  <div className="flex justify-between">
                    <span className={isDark ? "text-slate-400" : "text-slate-500"}>หมายเลขห้องพัก:</span>
                    <span className={`font-extrabold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{selectedBill.roomNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? "text-slate-400" : "text-slate-500"}>ผู้จดเช่า:</span>
                    <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>{selectedBill.tenantName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? "text-slate-400" : "text-slate-500"}>ยอดบิลทั้งหมด:</span>
                    <span className={`font-black text-sm ${isDark ? "text-teal-400" : "text-teal-600"}`}>
                      {selectedBill.billAmount.toLocaleString()} บาท
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDark ? "text-slate-400" : "text-slate-500"}>รอบเดือนประจำบิล:</span>
                    <span className={`font-mono font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>{billingCycle}</span>
                  </div>
                </div>
 
                <div className={`p-3 border rounded-xl text-[11px] leading-relaxed font-medium ${
                  isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-400/90" : "bg-amber-50 border-amber-200 text-amber-700"
                }`}>
                  โปรดเช็กยอดเงินโอนและเวลารับเงินในแอปบัญชีธนาคารหอพักของคุณให้ตรงกับรูปสลิป
                </div>
              </div>
 
              <div className="space-y-2 pt-6">
                <button
                  onClick={() => handleApproveSlip(selectedBill.billId)}
                  className="w-full h-12 md:h-10 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg shadow-teal-600/10 transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" /> อนุมัติยอดและปิดบัญชีบิล
                </button>
                <button
                  onClick={() => handleRejectSlip(selectedBill.billId)}
                  className={`w-full h-12 md:h-10 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    isDark 
                      ? "bg-rose-950/20 hover:bg-rose-600 text-rose-400 hover:text-white border-rose-900/40 hover:border-rose-600" 
                      : "bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border-rose-200 hover:border-rose-600"
                  }`}
                >
                  ปฏิเสธสลิป / ข้อมูลการโอนผิดพลาด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal สร้างบิลพิเศษกำหนดเอง */}
      {createBillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className={`w-full max-w-md max-h-[90vh] overflow-y-auto p-5 md:p-6 rounded-3xl relative shadow-2xl animate-scale-up border ${
            isDark ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-200"
          }`}>
            <button
              onClick={() => setCreateBillModalOpen(false)}
              className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                isDark ? "text-slate-400 hover:text-white hover:bg-slate-900/50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
              <Receipt className={`w-5 h-5 ${isDark ? "text-blue-400" : "text-blue-500"}`} /> สร้างใบแจ้งหนี้จำลองพิเศษ
            </h3>

            <form onSubmit={handleCreateBillManual} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>ห้องพัก</label>
                  <select
                    className={`w-full h-11 md:h-10 px-3 border rounded-xl focus:outline-none focus:border-blue-500 text-sm md:text-xs font-semibold cursor-pointer ${
                      isDark ? "bg-slate-950 text-slate-100 border-slate-800" : "bg-white text-slate-800 border-slate-300"
                    }`}
                    value={newRoomNumber}
                    onChange={(e) => setNewRoomNumber(e.target.value)}
                  >
                    {roomsList.map(r => (
                      <option key={r.roomNumber} value={r.roomNumber} className={isDark ? "bg-slate-900 text-slate-200" : "bg-white text-slate-800"}>ห้อง {r.roomNumber}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>รอบบิล</label>
                  <input
                    type="text"
                    disabled
                    className={`w-full h-11 md:h-10 px-3 border rounded-xl text-sm md:text-xs font-mono font-bold ${
                      isDark ? "bg-slate-950/40 border-slate-800/60 text-slate-500" : "bg-slate-100 border-slate-200 text-slate-400"
                    }`}
                    value={billingCycle}
                  />
                </div>
              </div>

              {/* มิเตอร์ปัจจุบัน */}
              <div className={`grid grid-cols-2 gap-3 p-4 rounded-xl border space-y-0.5 ${
                isDark ? "bg-slate-900/40 border-slate-800/60" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>หน่วยไฟที่ใช้</label>
                  <div className="relative">
                    <input
                      type="number"
                      className={`w-full h-11 md:h-10 px-3 border rounded-xl text-sm md:text-xs font-mono font-bold focus:outline-none focus:border-blue-500 ${
                        isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
                      }`}
                      value={elecUnitsManual}
                      onChange={(e) => setElecUnitsManual(Number(e.target.value))}
                    />
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"}`}>หน่วย</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>หน่วยน้ำที่ใช้</label>
                  <div className="relative">
                    <input
                      type="number"
                      className={`w-full h-11 md:h-10 px-3 border rounded-xl text-sm md:text-xs font-mono font-bold focus:outline-none focus:border-teal-500 ${
                        isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
                      }`}
                      value={waterUnitsManual}
                      onChange={(e) => setWaterUnitsManual(Number(e.target.value))}
                    />
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"}`}>หน่วย</span>
                  </div>
                </div>
              </div>

              {/* สรุปยอดราคาจำลอง */}
              <div className={`p-4 rounded-xl border text-xs space-y-2 font-medium ${
                isDark ? "bg-blue-950/20 border-blue-900/40" : "bg-blue-50/50 border-blue-100"
              }`}>
                <div className="flex justify-between">
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>ค่าห้องแอร์/พัดลมปกติ:</span>
                  <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>{rentPrice.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between">
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>ค่าส่วนกลาง (Fixed Common Fee):</span>
                  <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>{commonFee.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between">
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>ค่าไฟฟ้า ({elecUnitsManual} หน่วย):</span>
                  <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                    {electricMinChecked && elecUnitsManual <= electricMinUnit 
                      ? `${(electricMinUnit * elecRate).toLocaleString()} บาท (ขั้นต่ำ ${electricMinUnit} หน่วย)` 
                      : `${(elecUnitsManual * elecRate).toLocaleString()} บาท (หน่วยละ ${elecRate}.-)`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>ค่าน้ำประปา ({waterUnitsManual} หน่วย):</span>
                  <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                    {waterMinChecked && waterUnitsManual <= waterMinUnit 
                      ? `${(waterMinUnit * waterRate).toLocaleString()} บาท (ขั้นต่ำ ${waterMinUnit} หน่วย)` 
                      : `${(waterUnitsManual * waterRate).toLocaleString()} บาท (หน่วยละ ${waterRate}.-)`}
                  </span>
                </div>
                <div className={`h-px my-1.5 ${isDark ? "bg-slate-800/80" : "bg-slate-200"}`} />
                <div className={`flex justify-between font-extrabold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <span>ยอดสุทธิที่ต้องชำระ:</span>
                  <span className={`text-sm font-black ${isDark ? "text-blue-400" : "text-blue-600"}`}>{computedTotal.toLocaleString()} บาท</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-12 md:h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm md:text-xs font-bold shadow-lg shadow-blue-600/15 active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer"
              >
                คำนวณเงินและออกบิลค้างชำระ
              </button>
            </form>
          </div>
        </div>
      )}

      {/* หน้าต่างกำลังบันทึกข้อมูลและออกบิล (Full-Screen Saving Progress Overlay) */}
      {savingAll && (
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md transition-all duration-300 ${
          isDark ? "bg-black/80" : "bg-slate-900/40"
        }`}>
          <div className={`p-8 rounded-3xl border max-w-md w-full mx-4 text-center space-y-6 shadow-2xl relative overflow-hidden ${
            isDark ? "bg-slate-900 border-slate-800/80" : "bg-white border-slate-200"
          }`}>
            {/* Glow Effects */}
            <div className={`absolute -top-12 -left-12 w-32 h-32 rounded-full blur-2xl ${isDark ? "bg-teal-500/10" : "bg-teal-500/5"}`} />
            <div className={`absolute -bottom-12 -right-12 w-32 h-32 rounded-full blur-2xl ${isDark ? "bg-emerald-500/10" : "bg-emerald-500/5"}`} />
            
            {/* Large Beautiful Spinner */}
            <div className="relative flex justify-center">
              <div className={`w-20 h-20 rounded-full border-4 border-t-transparent animate-spin ${
                isDark ? "border-teal-500/5 border-t-teal-400" : "border-teal-500/10 border-t-teal-500"
              }`} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Save className={`w-8 h-8 animate-bounce ${isDark ? "text-teal-400" : "text-teal-600"}`} />
              </div>
            </div>
            
            {/* Title */}
            <div className="space-y-2">
              <h3 className={`text-lg font-black tracking-wide animate-pulse ${isDark ? "text-slate-100" : "text-slate-800"}`}>กำลังบันทึกข้อมูลและออกบิล</h3>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>ระบบกำลังประมวลผลข้อมูลและสร้างบิลไปยังฐานข้อมูล กรุณาอย่าปิดหน้านี้...</p>
            </div>

            {/* Progress Bar */}
            {savingProgress.total > 0 && (
              <div className="space-y-2.5">
                <div className={`flex justify-between items-center text-xs font-bold px-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  <span className={`flex items-center gap-1.5 font-extrabold ${isDark ? "text-teal-400" : "text-teal-600"}`}>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ห้อง {savingProgress.currentRoom}
                  </span>
                  <span className="font-mono">{savingProgress.current} / {savingProgress.total} ห้อง</span>
                </div>
                
                {/* Progress track */}
                <div className={`h-2.5 rounded-full overflow-hidden border p-[1px] ${
                  isDark ? "bg-slate-950 border-slate-800/60" : "bg-slate-100 border-slate-200"
                }`}>
                  <div 
                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300 shadow-md shadow-teal-500/20"
                    style={{ width: `${(savingProgress.current / savingProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
