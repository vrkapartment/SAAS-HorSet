"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
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

interface UnifiedRoomBillingItem {
  roomNumber: string
  tenantName: string | null
  baseRent: number
  status: "occupied" | "available"
  
  // Meter Record fields for current cycle
  meterRecordId?: string
  elecPrev: number
  elecCurr: string | number
  waterPrev: number
  waterCurr: string | number
  isMeterSaved: boolean
  
  // Bill fields for current cycle
  billId?: string
  billAmount: number
  billStatus: "unpaid" | "pending" | "paid" | "not_created"
  slipUrl: string | null
  electricUnits: number
  waterUnits: number
}

export default function UnifiedBillingPage() {
  const [billingCycle, setBillingCycle] = useState("2026-06")
  const [unifiedItems, setUnifiedItems] = useState<UnifiedRoomBillingItem[]>([])
  const [roomsList, setRoomsList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isDemo, setIsDemo] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)
  
  const [selectedBill, setSelectedBill] = useState<any | null>(null)
  const [slipModalOpen, setSlipModalOpen] = useState(false)
  const [createBillModalOpen, setCreateBillModalOpen] = useState(false)

  // ข้อมูลสำหรับโมดอลสร้างบิลด้วยมือ (กรณีฉุกเฉิน)
  const [newRoomNumber, setNewRoomNumber] = useState("105")
  const [elecUnitsManual, setElecUnitsManual] = useState(80)
  const [waterUnitsManual, setWaterUnitsManual] = useState(10)

  const rentPrice = roomsList.find(r => r.roomNumber === newRoomNumber)?.baseRent || 4500
  const elecRate = 7 // 7 บาทต่อหน่วย
  const waterRate = 18 // 18 บาทต่อหน่วย
  const computedElecCost = elecUnitsManual <= 10 ? 80 : elecUnitsManual * elecRate
  const computedWaterCost = waterUnitsManual <= 3 ? 51 : waterUnitsManual * waterRate
  const computedTotal = rentPrice + computedElecCost + computedWaterCost

  const getPreviousCycle = (cycle: string) => {
    const [year, month] = cycle.split("-").map(Number)
    if (month === 1) {
      return `${year - 1}-12`
    } else {
      const prevMonth = month - 1
      return `${year}-${prevMonth.toString().padStart(2, "0")}`
    }
  }

  const loadData = async (cycle = billingCycle) => {
    setLoading(true)
    
    // 1. ดึงข้อมูลห้องพักทั้งหมด
    const roomsRes = await getRooms()
    const rooms = roomsRes.success && roomsRes.data ? roomsRes.data : []
    setRoomsList(rooms)
    
    // 2. ดึงข้อมูลบิลทั้งหมดประจำรอบบิลนี้
    const billsRes = await getBills(cycle)
    const dbBills = billsRes.success && billsRes.data ? billsRes.data : []
    
    // 3. ดึงข้อมูลมิเตอร์น้ำไฟรอบนี้
    const meterRes = await getMeterRecords(cycle)
    const dbMeters = meterRes.success && meterRes.data ? meterRes.data : []
    
    // 4. ดึงข้อมูลมิเตอร์น้ำไฟรอบก่อน เพื่อใช้อ้างอิงเป็นเลขมิเตอร์ครั้งก่อนหน้า
    const prevCycle = getPreviousCycle(cycle)
    const prevMeterRes = await getMeterRecords(prevCycle)
    const dbPrevMeters = prevMeterRes.success && prevMeterRes.data ? prevMeterRes.data : []
    
    const isSupabaseFallback = billsRes.fallback || meterRes.fallback
    setIsDemo(!!isSupabaseFallback)
    
    if (isSupabaseFallback) {
      // โหมด Demo (LocalStorage Fallback)
      let localBills: any[] = []
      const savedBills = localStorage.getItem("horset_bills")
      if (savedBills) {
        try {
          localBills = JSON.parse(savedBills)
        } catch (e) {
          console.error(e)
        }
      } else {
        localBills = [
          { id: "1", roomNumber: "101", tenantName: "คุณวิภาวี สมบูรณ์", amount: 5400, status: "paid", billingCycle: "2026-06", slipUrl: "/slip-mock.jpg", electricUnits: 60, waterUnits: 9 },
          { id: "2", roomNumber: "102", tenantName: "คุณนพดล สุขศรี", amount: 6200, status: "paid", billingCycle: "2026-06", slipUrl: "/slip-mock.jpg", electricUnits: 96, waterUnits: 12 },
          { id: "3", roomNumber: "103", tenantName: "คุณวรรณภา ใสดี", amount: 5850, status: "unpaid", billingCycle: "2026-06", slipUrl: null, electricUnits: 85, waterUnits: 12 },
          { id: "4", roomNumber: "105", tenantName: "คุณณัฐพล ใจดี", amount: 5760, status: "pending", slipUrl: "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=300", billingCycle: "2026-06", electricUnits: 84, waterUnits: 12 },
          { id: "5", roomNumber: "201", tenantName: "คุณอรทัย มั่นคง", amount: 6100, status: "unpaid", billingCycle: "2026-06", slipUrl: null, electricUnits: 90, waterUnits: 10 },
          { id: "6", roomNumber: "202", tenantName: "คุณสุชาติ เลิศรส", amount: 5310, status: "paid", billingCycle: "2026-06", slipUrl: "/slip-mock.jpg", electricUnits: 67, waterUnits: 9 }
        ]
        localStorage.setItem("horset_bills", JSON.stringify(localBills))
      }
      
      let localMeters: any[] = []
      const savedMeters = localStorage.getItem(`horset_meter_records_${cycle}`)
      if (savedMeters) {
        try {
          localMeters = JSON.parse(savedMeters)
        } catch (e) {
          console.error(e)
        }
      }
      
      let localPrevMeters: any[] = []
      const savedPrevMeters = localStorage.getItem(`horset_meter_records_${prevCycle}`)
      if (savedPrevMeters) {
        try {
          localPrevMeters = JSON.parse(savedPrevMeters)
        } catch (e) {}
      }
      
      let localRooms: any[] = []
      const savedRooms = localStorage.getItem("horset_rooms")
      if (savedRooms) {
        try {
          localRooms = JSON.parse(savedRooms)
        } catch (e) {}
      } else {
        localRooms = [
          { id: "1", roomNumber: "101", status: "occupied", baseRent: 4500, tenantName: "คุณวิภาวี สมบูรณ์" },
          { id: "2", roomNumber: "102", status: "occupied", baseRent: 4500, tenantName: "คุณนพดล สุขศรี" },
          { id: "3", roomNumber: "103", status: "occupied", baseRent: 4500, tenantName: "คุณวรรณภา ใสดี" },
          { id: "4", roomNumber: "105", status: "occupied", baseRent: 4500, tenantName: "คุณณัฐพล ใจดี" },
          { id: "5", roomNumber: "201", status: "occupied", baseRent: 4500, tenantName: "คุณอรทัย มั่นคง" },
          { id: "6", roomNumber: "202", status: "occupied", baseRent: 4500, tenantName: "คุณสุชาติ เลิศรส" }
        ]
        localStorage.setItem("horset_rooms", JSON.stringify(localRooms))
      }
      setRoomsList(localRooms)
      
      const activeRooms = localRooms.filter((r: any) => r.status === "occupied")
      const compiled = activeRooms.map((r: any) => {
        const roomBill = localBills.find((b: any) => b.roomNumber === r.roomNumber && b.billingCycle === cycle)
        const roomMeter = localMeters.find((m: any) => m.roomNumber === r.roomNumber)
        const prevMeter = localPrevMeters.find((m: any) => m.roomNumber === r.roomNumber)
        
        // กำหนดเลขมิเตอร์ครั้งก่อนหน้าแบบอัตโนมัติ
        const elecPrev = roomMeter ? Number(roomMeter.elecPrev) : (prevMeter ? (Number(prevMeter.elecCurr) || Number(prevMeter.elecPrev)) : (1000 + Number(r.roomNumber) * 3))
        const waterPrev = roomMeter ? Number(roomMeter.waterPrev) : (prevMeter ? (Number(prevMeter.waterCurr) || Number(prevMeter.waterPrev)) : (100 + Number(r.roomNumber)))
        
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
          isMeterSaved: roomMeter ? !!roomMeter.isSaved : false,
          
          billId: roomBill?.id || undefined,
          billAmount: roomBill ? Number(roomBill.amount) : 0,
          billStatus: roomBill ? (roomBill.status as "unpaid" | "pending" | "paid" | "not_created") : "not_created",
          slipUrl: roomBill ? roomBill.slipUrl : null,
          electricUnits: roomBill ? Number(roomBill.electricUnits) : 0,
          waterUnits: roomBill ? Number(roomBill.waterUnits) : 0
        }
      })
      setUnifiedItems(compiled)
    } else {
      // โหมด Supabase
      const activeRooms = rooms.filter((r: any) => r.status === "occupied" || dbBills.some((b: any) => b.roomNumber === r.roomNumber))
      const compiled = activeRooms.map((r: any) => {
        const roomBill = dbBills.find((b: any) => b.roomNumber === r.roomNumber)
        const roomMeter = dbMeters.find((m: any) => m.roomNumber === r.roomNumber)
        const prevMeter = dbPrevMeters.find((m: any) => m.roomNumber === r.roomNumber)
        
        // กำหนดเลขมิเตอร์ครั้งก่อนหน้าแบบอัตโนมัติ
        const elecPrev = roomMeter ? Number(roomMeter.elecPrev) : (prevMeter ? (Number(prevMeter.elecCurr) || Number(prevMeter.elecPrev)) : (1000 + Number(r.roomNumber) * 3))
        const waterPrev = roomMeter ? Number(roomMeter.waterPrev) : (prevMeter ? (Number(prevMeter.waterCurr) || Number(prevMeter.waterPrev)) : (100 + Number(r.roomNumber)))
        
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
          
          billId: roomBill?.id || undefined,
          billAmount: roomBill ? Number(roomBill.amount) : 0,
          billStatus: roomBill ? (roomBill.status as "unpaid" | "pending" | "paid" | "not_created") : "not_created",
          slipUrl: roomBill ? roomBill.slipUrl : null,
          electricUnits: roomBill ? Number(roomBill.electricUnits) : 0,
          waterUnits: roomBill ? Number(roomBill.waterUnits) : 0
        }
      })
      setUnifiedItems(compiled)
    }
    
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [billingCycle])

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
        item.roomNumber === roomNumber ? { ...item, elecCurr: value, isMeterSaved: false } : item
      )
    )
  }

  // อัปเดตช่องอินพุตเลขมิเตอร์น้ำในหน้าจอ
  const handleWaterChange = (roomNumber: string, value: string) => {
    setUnifiedItems(prev =>
      prev.map(item =>
        item.roomNumber === roomNumber ? { ...item, waterCurr: value, isMeterSaved: false } : item
      )
    )
  }

  // อนุมัติสลิปโอนเงิน
  const handleApproveSlip = async (id: string) => {
    if (isDemo) {
      const savedBills = localStorage.getItem("horset_bills")
      if (savedBills) {
        try {
          const list = JSON.parse(savedBills)
          const updated = list.map((b: any) => b.id === id ? { ...b, status: "paid" } : b)
          localStorage.setItem("horset_bills", JSON.stringify(updated))
        } catch (e) {
          console.error(e)
        }
      }
      showToast("อนุมัติรายการชำระเงินเรียบร้อยแล้ว!")
      await loadData()
    } else {
      const res = await updateBillStatus(id, "paid")
      if (res.success) {
        showToast("อนุมัติรายการชำระเงินเรียบร้อยแล้ว!")
        await loadData()
      } else {
        alert(res.error || "เกิดข้อผิดพลาดในการอัปเดตสถานะบิล")
        return
      }
    }
    setSlipModalOpen(false)
    setSelectedBill(null)
  }

  // ปฏิเสธสลิปโอนเงิน
  const handleRejectSlip = async (id: string) => {
    if (isDemo) {
      const savedBills = localStorage.getItem("horset_bills")
      if (savedBills) {
        try {
          const list = JSON.parse(savedBills)
          const updated = list.map((b: any) => b.id === id ? { ...b, status: "unpaid", slipUrl: null } : b)
          localStorage.setItem("horset_bills", JSON.stringify(updated))
        } catch (e) {
          console.error(e)
        }
      }
      showToast("ปฏิเสธสลิปแล้ว บิลจะกลับเป็นสถานะค้างชำระ")
      await loadData()
    } else {
      const res = await updateBillStatus(id, "unpaid", null)
      if (res.success) {
        showToast("ปฏิเสธสลิปแล้ว บิลจะกลับเป็นสถานะค้างชำระ")
        await loadData()
      } else {
        alert(res.error || "เกิดข้อผิดพลาดในการอัปเดตสถานะบิล")
        return
      }
    }
    setSlipModalOpen(false)
    setSelectedBill(null)
  }

  // บันทึกเฉพาะห้องและสร้างบิล
  const handleSaveRow = async (roomNumber: string) => {
    const item = unifiedItems.find(i => i.roomNumber === roomNumber)
    if (!item) return

    const elecVal = item.elecCurr === "" ? "" : Number(item.elecCurr)
    const waterVal = item.waterCurr === "" ? "" : Number(item.waterCurr)

    if (elecVal === "" || waterVal === "" || isNaN(elecVal as number) || isNaN(waterVal as number)) {
      alert("กรุณากรอกตัวเลขมิเตอร์ไฟฟ้าและค่าน้ำประปาให้ครบถ้วน")
      return
    }

    if ((elecVal as number) < item.elecPrev || (waterVal as number) < item.waterPrev) {
      alert("⚠️ ตัวเลขมิเตอร์ปัจจุบันต้องไม่น้อยกว่ามิเตอร์ครั้งก่อนหน้า")
      return
    }

    const eUnits = (elecVal as number) - item.elecPrev
    const wUnits = (waterVal as number) - item.waterPrev
    const elecCost = eUnits <= 10 ? 80 : eUnits * elecRate
    const waterCost = wUnits <= 3 ? 51 : wUnits * waterRate
    const totalAmount = item.baseRent + elecCost + waterCost

    if (isDemo) {
      // 1. บันทึกเลขมิเตอร์
      let localMeters: any[] = []
      const savedMeters = localStorage.getItem(`horset_meter_records_${billingCycle}`)
      if (savedMeters) {
        try {
          localMeters = JSON.parse(savedMeters)
        } catch (e) {}
      }
      
      const existingMeterIdx = localMeters.findIndex((m: any) => m.roomNumber === roomNumber)
      const updatedMeter = {
        id: item.meterRecordId || Date.now().toString(),
        roomNumber,
        billingCycle,
        elecPrev: item.elecPrev,
        elecCurr: elecVal,
        waterPrev: item.waterPrev,
        waterCurr: waterVal,
        isSaved: true
      }
      if (existingMeterIdx >= 0) {
        localMeters[existingMeterIdx] = updatedMeter
      } else {
        localMeters.push(updatedMeter)
      }
      localStorage.setItem(`horset_meter_records_${billingCycle}`, JSON.stringify(localMeters))

      // 2. ออกบิล / อัปเดตบิล
      let localBills: any[] = []
      const savedBills = localStorage.getItem("horset_bills")
      if (savedBills) {
        try {
          localBills = JSON.parse(savedBills)
        } catch (e) {}
      }

      const existingBillIdx = localBills.findIndex((b: any) => b.roomNumber === roomNumber && b.billingCycle === billingCycle)
      const updatedBill = {
        id: item.billId || (Date.now() + 1).toString(),
        roomNumber,
        tenantName: item.tenantName || "ผู้เช่าจำลอง",
        amount: totalAmount,
        status: (item.billStatus === "not_created" ? "unpaid" : item.billStatus) as any,
        billingCycle,
        slipUrl: item.slipUrl,
        electricUnits: eUnits,
        waterUnits: wUnits
      }

      if (existingBillIdx >= 0) {
        localBills[existingBillIdx] = updatedBill
      } else {
        localBills.push(updatedBill)
      }
      localStorage.setItem("horset_bills", JSON.stringify(localBills))

      showToast(`บันทึกมิเตอร์และประมวลผลบิลห้อง ${roomNumber} สำเร็จ!`)
      await loadData()
    } else {
      // โหมด Supabase
      // 1. บันทึกมิเตอร์ใน DB
      const meterRes = await saveMeterRecord(
        roomNumber,
        billingCycle,
        item.elecPrev,
        elecVal,
        item.waterPrev,
        waterVal
      )
      if (!meterRes.success) {
        alert(meterRes.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูลมิเตอร์")
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
        return
      }

      showToast(`บันทึกมิเตอร์และประมวลผลบิลห้อง ${roomNumber} สำเร็จ!`)
      await loadData()
    }
  }

  // บันทึกและออกบิลให้ทุกห้องที่ข้อมูลสมบูรณ์
  const handleSaveAll = async () => {
    // กรองหาห้องที่กรอกไม่ครบหรือผิดพลาด
    const invalidItems = unifiedItems.filter(item => {
      const elecVal = item.elecCurr === "" ? "" : Number(item.elecCurr)
      const waterVal = item.waterCurr === "" ? "" : Number(item.waterCurr)
      return (
        elecVal === "" ||
        waterVal === "" ||
        isNaN(elecVal as number) ||
        isNaN(waterVal as number) ||
        (elecVal as number) < item.elecPrev ||
        (waterVal as number) < item.waterPrev
      )
    })

    if (invalidItems.length > 0) {
      alert(`ไม่สามารถประมวลผลทั้งหมดได้ เนื่องจากมี ${invalidItems.length} ห้องพักที่ข้อมูลเลขมิเตอร์ไม่ครบถ้วน หรือค่าปัจจุบันน้อยกว่าครั้งก่อนหน้า`)
      return
    }

    if (isDemo) {
      let localMeters: any[] = []
      const savedMeters = localStorage.getItem(`horset_meter_records_${billingCycle}`)
      if (savedMeters) {
        try {
          localMeters = JSON.parse(savedMeters)
        } catch (e) {}
      }

      let localBills: any[] = []
      const savedBills = localStorage.getItem("horset_bills")
      if (savedBills) {
        try {
          localBills = JSON.parse(savedBills)
        } catch (e) {}
      }

      unifiedItems.forEach((item, idx) => {
        const elecVal = Number(item.elecCurr)
        const waterVal = Number(item.waterCurr)
        const eUnits = elecVal - item.elecPrev
        const wUnits = waterVal - item.waterPrev
        const elecCost = eUnits <= 10 ? 80 : eUnits * elecRate
        const waterCost = wUnits <= 3 ? 51 : wUnits * waterRate
        const totalAmount = item.baseRent + elecCost + waterCost

        // 1. มิเตอร์
        const existingMeterIdx = localMeters.findIndex((m: any) => m.roomNumber === item.roomNumber)
        const updatedMeter = {
          id: item.meterRecordId || (Date.now() + idx).toString(),
          roomNumber: item.roomNumber,
          billingCycle,
          elecPrev: item.elecPrev,
          elecCurr: elecVal,
          waterPrev: item.waterPrev,
          waterCurr: waterVal,
          isSaved: true
        }
        if (existingMeterIdx >= 0) {
          localMeters[existingMeterIdx] = updatedMeter
        } else {
          localMeters.push(updatedMeter)
        }

        // 2. บิล
        const existingBillIdx = localBills.findIndex((b: any) => b.roomNumber === item.roomNumber && b.billingCycle === billingCycle)
        const updatedBill = {
          id: item.billId || (Date.now() + idx + 100).toString(),
          roomNumber: item.roomNumber,
          tenantName: item.tenantName || "ผู้เช่าจำลอง",
          amount: totalAmount,
          status: (item.billStatus === "not_created" ? "unpaid" : item.billStatus) as any,
          billingCycle,
          slipUrl: item.slipUrl,
          electricUnits: eUnits,
          waterUnits: wUnits
        }
        if (existingBillIdx >= 0) {
          localBills[existingBillIdx] = updatedBill
        } else {
          localBills.push(updatedBill)
        }
      })

      localStorage.setItem(`horset_meter_records_${billingCycle}`, JSON.stringify(localMeters))
      localStorage.setItem("horset_bills", JSON.stringify(localBills))
      
      showToast("บันทึกเลขมิเตอร์และคำนวณบิลให้ทุกห้องสำเร็จ!")
      await loadData()
    } else {
      // โหมด Supabase
      for (const item of unifiedItems) {
        const elecVal = Number(item.elecCurr)
        const waterVal = Number(item.waterCurr)
        const eUnits = elecVal - item.elecPrev
        const wUnits = waterVal - item.waterPrev
        const elecCost = eUnits <= 10 ? 80 : eUnits * elecRate
        const waterCost = wUnits <= 3 ? 51 : wUnits * waterRate
        const totalAmount = item.baseRent + elecCost + waterCost

        // 1. บันทึกเลขมิเตอร์
        const meterRes = await saveMeterRecord(
          item.roomNumber,
          billingCycle,
          item.elecPrev,
          elecVal,
          item.waterPrev,
          waterVal
        )
        if (!meterRes.success) {
          alert(`เกิดข้อผิดพลาดในการบันทึกมิเตอร์ห้อง ${item.roomNumber}: ${meterRes.error}`)
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
          return
        }
      }

      showToast("บันทึกเลขมิเตอร์และคำนวณบิลให้ทุกห้องสำเร็จ!")
      await loadData()
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
      const promptPayId = localStorage.getItem("horset_promptpay_id") || "0899999999"
      const promptPayName = localStorage.getItem("horset_promptpay_name") || "สมเจตน์ แสนสุข"
      
      const elecUnitsUsed = item.elecCurr !== "" ? Number(item.elecCurr) - item.elecPrev : 0
      const waterUnitsUsed = item.waterCurr !== "" ? Number(item.waterCurr) - item.waterPrev : 0

      const blob = await generateBillPdf({
        roomNumber: item.roomNumber,
        tenantName: item.tenantName || "ผู้เช่า",
        billingCycle: billingCycle === "2026-06" ? "มิถุนายน 2026" : "พฤษภาคม 2026",
        baseRent: item.baseRent,
        electricUnits: elecUnitsUsed,
        electricRate: 7,
        waterUnits: waterUnitsUsed,
        waterRate: 18,
        amount: item.billAmount || (() => {
          const elecCost = elecUnitsUsed <= 10 ? 80 : elecUnitsUsed * 7
          const waterCost = waterUnitsUsed <= 3 ? 51 : waterUnitsUsed * 18
          return item.baseRent + elecCost + waterCost
        })(),
        promptPayId,
        promptPayName
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

  // สร้างบิลด้วยตนเอง (สำหรับกรณีพิเศษ)
  const handleCreateBillManual = async (e: React.FormEvent) => {
    e.preventDefault()
    
    let targetTenant = "ผู้เช่าจำลอง"
    const room = roomsList.find(r => r.roomNumber === newRoomNumber)
    if (room && room.tenantName) {
      targetTenant = room.tenantName
    } else if (!isDemo) {
      alert("ห้องพักนี้ยังไม่มีผู้เช่า หรือสัญญาหมดอายุ ไม่สามารถออกบิลได้")
      return
    }

    if (isDemo) {
      let localBills: any[] = []
      const savedBills = localStorage.getItem("horset_bills")
      if (savedBills) {
        try {
          localBills = JSON.parse(savedBills)
        } catch (e) {}
      }

      const newBill = {
        id: Date.now().toString(),
        roomNumber: newRoomNumber,
        tenantName: targetTenant,
        amount: computedTotal,
        status: "unpaid" as const,
        billingCycle,
        slipUrl: null,
        electricUnits: elecUnitsManual,
        waterUnits: waterUnitsManual
      }

      const filtered = localBills.filter(b => !(b.roomNumber === newRoomNumber && b.billingCycle === billingCycle))
      localStorage.setItem("horset_bills", JSON.stringify([newBill, ...filtered]))
      
      showToast(`สร้างบิลแบบกำหนดเองห้อง ${newRoomNumber} สำเร็จ!`)
      await loadData()
    } else {
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
        await loadData()
      } else {
        alert(res.error || "ออกใบแจ้งยอดไม่สำเร็จ")
        return
      }
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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-blue-500" />
            <h2 className="text-xl font-bold text-slate-100">จดเลขมิเตอร์ & จัดการบิลค่าเช่า</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            หน้าจอแบบบูรณาการ: บันทึกหน่วยมิเตอร์ไฟ/น้ำ พร้อมประมวลผลคำนวณออกใบแจ้งหนี้ให้ผู้เช่าได้ทันทีในคลิกเดียว
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2.5 w-full lg:w-auto">
          {/* แถบเลือกเดือนรอบบิล */}
          <select
            className="px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs font-semibold"
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value)}
          >
            <option value="2026-06">รอบบิล มิถุนายน 2026</option>
            <option value="2026-05">รอบบิล พฤษภาคม 2026</option>
          </select>

          {/* บันทึกทั้งหมด */}
          <button
            onClick={handleSaveAll}
            className="glow-btn bg-teal-600 hover:bg-teal-500 text-white font-semibold py-2 px-4 rounded-xl flex items-center gap-1.5 text-xs shadow-lg shadow-teal-600/15"
          >
            <Save className="w-3.5 h-3.5" /> บันทึกและออกบิลทุกห้อง
          </button>

          {/* ปุ่มบิลกำหนดเอง (สำหรับแอดมินหรือกรณีฉุกเฉิน) */}
          <button
            onClick={() => setCreateBillModalOpen(true)}
            className="py-2 px-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl flex items-center gap-1.5 text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5 text-blue-500" /> บิลจำลองพิเศษ
          </button>
        </div>
      </div>

      {/* แดชบอร์ดสรุปสถิติประจำรอบเดือน */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* การจดมิเตอร์ */}
        <div className="glass-card p-4 rounded-2xl border border-slate-900/50 flex items-center gap-3 bg-slate-950/20">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">บันทึกมิเตอร์แล้ว</p>
            <p className="text-base font-extrabold text-slate-100">{billedCount} / {totalOccupied} ห้อง</p>
          </div>
        </div>

        {/* ชำระเงินเรียบร้อย */}
        <div className="glass-card p-4 rounded-2xl border border-slate-900/50 flex items-center gap-3 bg-slate-950/20">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">ชำระเงินเรียบร้อย</p>
            <p className="text-base font-extrabold text-slate-100">{paidCount} ห้อง</p>
          </div>
        </div>

        {/* รอตรวจสอบสลิป */}
        <div className="glass-card p-4 rounded-2xl border border-slate-900/50 flex items-center gap-3 bg-slate-950/20 relative overflow-hidden">
          {pendingCount > 0 && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />}
          <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">รอตรวจสอบสลิป</p>
            <p className={`text-base font-extrabold ${pendingCount > 0 ? "text-amber-400 font-black animate-pulse" : "text-slate-400"}`}>
              {pendingCount} ห้อง
            </p>
          </div>
        </div>

        {/* ค้างชำระ */}
        <div className="glass-card p-4 rounded-2xl border border-slate-900/50 flex items-center gap-3 bg-slate-950/20">
          <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">ค้างชำระเงิน</p>
            <p className="text-base font-extrabold text-rose-400">{unpaidCount} ห้อง</p>
          </div>
        </div>
      </div>

      {/* แจ้งเตือน */}
      <div className="flex items-center gap-2.5 p-3.5 bg-blue-500/5 border border-blue-500/10 rounded-xl text-xs text-blue-400">
        <Sparkles className="w-4 h-4 shrink-0 text-blue-400" />
        <span>ระบบจำลองการประมวลผลดึงค่ามิเตอร์ครั้งก่อนหน้าและราคาค่าเช่าอิงตาม Room Type โดยอัตโนมัติ กรอกเพียงเลขมิเตอร์ปัจจุบันเพื่อสร้างบิล</span>
      </div>

      {/* ตารางควบคุมหลัก */}
      <div className="glass-card rounded-2xl border border-slate-900/60 p-5 bg-slate-950/10 backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-900/80 text-slate-500 font-semibold">
                <th className="pb-3 pl-2 w-16">ห้อง</th>
                <th className="pb-3 w-40">ผู้เช่า / ค่าเช่า</th>
                
                {/* กลุ่มไฟฟ้า */}
                <th className="pb-3 text-center bg-blue-500/5 rounded-t-xl w-32 border-l border-slate-900/30">ไฟก่อนหน้า</th>
                <th className="pb-3 text-center bg-blue-500/5 w-36">ไฟรอบนี้</th>
                <th className="pb-3 text-center bg-blue-500/5 w-28 rounded-t-xl border-r border-slate-900/30">หน่วย/ยอด</th>
                
                {/* กลุ่มน้ำ */}
                <th className="pb-3 text-center bg-teal-500/5 rounded-t-xl w-32">น้ำก่อนหน้า</th>
                <th className="pb-3 text-center bg-teal-500/5 w-36">น้ำรอบนี้</th>
                <th className="pb-3 text-center bg-teal-500/5 w-28 rounded-t-xl border-r border-slate-900/30">หน่วย/ยอด</th>
                
                <th className="pb-3 text-right pr-4 w-32">ยอดรวมบิล</th>
                <th className="pb-3 text-center w-28">สถานะ</th>
                <th className="pb-3 text-center w-40 pr-2">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/40">
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
                  const elecUnitsUsed = hasElecCurr ? Number(item.elecCurr) - item.elecPrev : 0
                  const elecCost = hasElecCurr && elecUnitsUsed >= 0
                    ? (elecUnitsUsed <= 10 ? 80 : elecUnitsUsed * elecRate)
                    : 0

                  const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
                  const waterUnitsUsed = hasWaterCurr ? Number(item.waterCurr) - item.waterPrev : 0
                  const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                    ? (waterUnitsUsed <= 3 ? 51 : waterUnitsUsed * waterRate)
                    : 0
                  
                  // คำนวณยอดเงินเรียลไทม์
                  const calculatedAmount = item.baseRent + elecCost + waterCost

                  const isModified = item.billStatus !== "not_created" && item.billAmount !== calculatedAmount

                  return (
                    <tr key={item.roomNumber} className="hover:bg-slate-900/15 transition-colors">
                      {/* ห้อง */}
                      <td className="py-4 pl-2 font-black text-slate-100 text-sm">{item.roomNumber}</td>
                      
                      {/* ผู้เช่า / ค่าเช่าห้อง */}
                      <td className="py-4">
                        <div className="font-bold text-slate-300 truncate max-w-[140px]" title={item.tenantName || "ไม่มีผู้เช่า"}>
                          {item.tenantName || <span className="text-slate-600 italic">ไม่มีข้อมูลผู้เช่า</span>}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          ค่าเช่าคงที่ {item.baseRent.toLocaleString()}.-
                        </div>
                      </td>
                      
                      {/* ไฟฟ้า - ก่อนหน้า */}
                      <td className="py-4 text-center bg-blue-500/5 border-l border-slate-900/30">
                        <span className="font-mono text-slate-400 font-semibold bg-slate-900/50 px-2.5 py-1 rounded-lg border border-slate-800/40">
                          {item.elecPrev}
                        </span>
                      </td>

                      {/* ไฟฟ้า - อินพุตปัจจุบัน */}
                      <td className="py-4 text-center bg-blue-500/5 px-2">
                        <div className="relative inline-block">
                          <input
                            type="text"
                            placeholder="กรอกเลข"
                            className="w-24 text-center py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500/80 transition-all font-semibold"
                            value={item.elecCurr}
                            onChange={(e) => handleElecChange(item.roomNumber, e.target.value)}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 font-bold pointer-events-none">
                            kWh
                          </span>
                        </div>
                      </td>

                      {/* ไฟฟ้า - สรุปหน่วยที่ใช้ / ค่าใช้จ่าย */}
                      <td className="py-4 text-center bg-blue-500/5 border-r border-slate-900/30 font-mono">
                        <div className={`font-black text-xs ${!hasElecCurr ? "text-slate-500" : elecUnitsUsed < 0 ? "text-red-400" : "text-blue-400"}`}>
                          {hasElecCurr ? (elecUnitsUsed >= 0 ? `${elecUnitsUsed} หน่วย` : "ผิดพลาด") : "รอจด"}
                        </div>
                        <div className="text-[9px] text-slate-500 font-semibold mt-0.5">
                          {hasElecCurr && elecUnitsUsed >= 0 
                            ? `${elecCost.toLocaleString()}.- ${elecUnitsUsed <= 10 ? "(ขั้นต่ำ)" : ""}` 
                            : "-"}
                        </div>
                      </td>

                      {/* น้ำประปา - ก่อนหน้า */}
                      <td className="py-4 text-center bg-teal-500/5">
                        <span className="font-mono text-slate-400 font-semibold bg-slate-900/50 px-2.5 py-1 rounded-lg border border-slate-800/40">
                          {item.waterPrev}
                        </span>
                      </td>

                      {/* น้ำประปา - อินพุตปัจจุบัน */}
                      <td className="py-4 text-center bg-teal-500/5 px-2">
                        <div className="relative inline-block">
                          <input
                            type="text"
                            placeholder="กรอกเลข"
                            className="w-24 text-center py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono text-xs focus:outline-none focus:border-teal-500/80 transition-all font-semibold"
                            value={item.waterCurr}
                            onChange={(e) => handleWaterChange(item.roomNumber, e.target.value)}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 font-bold pointer-events-none">
                            m³
                          </span>
                        </div>
                      </td>

                      {/* น้ำประปา - สรุปหน่วยที่ใช้ / ค่าใช้จ่าย */}
                      <td className="py-4 text-center bg-teal-500/5 border-r border-slate-900/30 font-mono">
                        <div className={`font-black text-xs ${!hasWaterCurr ? "text-slate-500" : waterUnitsUsed < 0 ? "text-red-400" : "text-teal-400"}`}>
                          {hasWaterCurr ? (waterUnitsUsed >= 0 ? `${waterUnitsUsed} หน่วย` : "ผิดพลาด") : "รอจด"}
                        </div>
                        <div className="text-[9px] text-slate-500 font-semibold mt-0.5">
                          {hasWaterCurr && waterUnitsUsed >= 0 
                            ? `${waterCost.toLocaleString()}.- ${waterUnitsUsed <= 3 ? "(ขั้นต่ำ)" : ""}` 
                            : "-"}
                        </div>
                      </td>

                      {/* ยอดบิลรวม */}
                      <td className="py-4 text-right pr-4 font-mono">
                        <div className="text-sm font-black text-slate-100">
                          {calculatedAmount.toLocaleString()}.-
                        </div>
                        {isModified && (
                          <span className="inline-block text-[8px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded font-bold">
                            ยอดเงินเปลี่ยน
                          </span>
                        )}
                      </td>

                      {/* สถานะบิล */}
                      <td className="py-4 text-center">
                        <span className={`inline-block text-[9px] font-extrabold px-2.5 py-0.5 rounded-full ${
                          item.billStatus === "paid" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          item.billStatus === "pending" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse" :
                          item.billStatus === "unpaid" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                          "bg-slate-900 text-slate-500 border border-slate-800"
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
                            className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all ${
                              item.isMeterSaved && item.billStatus !== "not_created" && !isModified
                                ? "border-slate-900 bg-slate-950/20 text-slate-600 cursor-not-allowed"
                                : "border-teal-500/30 bg-teal-500/10 hover:bg-teal-500 text-teal-400 hover:text-white hover:scale-105 shadow-sm"
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
                              className="p-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl hover:bg-amber-500 hover:text-white transition-all font-semibold text-xs flex items-center gap-1 hover:scale-105"
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
                                className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-blue-400 hover:border-blue-500/40 rounded-xl transition-all"
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
                                className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-teal-400 hover:border-teal-500/40 rounded-xl transition-all"
                                title="ส่งเข้า LINE OA"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
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
      </div>

      {/* Modal ตรวจสอบสลิปโอนเงินธนาคาร */}
      {slipModalOpen && selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="glass-panel w-full max-w-2xl p-6 rounded-3xl relative shadow-2xl animate-scale-up grid grid-cols-1 md:grid-cols-2 gap-6 border border-slate-800/80">
            <button
              onClick={() => {
                setSlipModalOpen(false)
                setSelectedBill(null)
              }}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white hover:bg-slate-900/50 rounded-lg transition-all"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* ฝั่งสลิปธนาคาร */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-400">รูปภาพหลักฐานการโอนเงิน</h4>
              <div className="w-full aspect-[3/4] bg-slate-950 rounded-2xl overflow-hidden border border-slate-900/60 relative flex items-center justify-center">
                {selectedBill.slipUrl ? (
                  <img
                    src={selectedBill.slipUrl}
                    alt="Slip Verification"
                    className="object-contain w-full h-full"
                  />
                ) : (
                  <p className="text-xs text-slate-600">ไม่พบหลักฐานไฟล์แนบในระบบ</p>
                )}
              </div>
            </div>

            {/* ฝั่งรายละเอียดและการกดอนุมัติ */}
            <div className="flex flex-col justify-between pt-3">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-400" /> อนุมัติสลิปโอนและปิดบิล
                </h3>

                <div className="bg-slate-900/60 p-4 rounded-xl space-y-2.5 border border-slate-900 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">หมายเลขห้องพัก:</span>
                    <span className="font-extrabold text-slate-200">{selectedBill.roomNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ผู้จดเช่า:</span>
                    <span className="font-bold text-slate-300">{selectedBill.tenantName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ยอดบิลทั้งหมด:</span>
                    <span className="font-black text-teal-400 text-sm">
                      {selectedBill.billAmount.toLocaleString()} บาท
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">รอบเดือนประจำบิล:</span>
                    <span className="font-mono font-semibold text-slate-400">{billingCycle}</span>
                  </div>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-400/90 leading-relaxed">
                  โปรดเช็กยอดเงินโอนและเวลารับเงินในแอปบัญชีธนาคารหอพักของคุณให้ตรงกับรูปสลิป
                </div>
              </div>

              <div className="space-y-2 pt-6">
                <button
                  onClick={() => handleApproveSlip(selectedBill.billId)}
                  className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-teal-600/10 transition-all hover:-translate-y-0.5"
                >
                  <UserCheck className="w-4 h-4" /> อนุมัติยอดและปิดบัญชีบิล
                </button>
                <button
                  onClick={() => handleRejectSlip(selectedBill.billId)}
                  className="w-full py-2.5 bg-red-600/15 hover:bg-red-600 text-red-400 hover:text-white rounded-xl text-xs font-semibold border border-red-500/20 transition-colors"
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
          <div className="glass-panel w-full max-w-md p-6 rounded-3xl relative shadow-2xl animate-scale-up border border-slate-800/80">
            <button
              onClick={() => setCreateBillModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white hover:bg-slate-900/50 rounded-lg transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-500" /> สร้างใบแจ้งหนี้จำลองพิเศษ
            </h3>

            <form onSubmit={handleCreateBillManual} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ห้องพัก</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs font-semibold"
                    value={newRoomNumber}
                    onChange={(e) => setNewRoomNumber(e.target.value)}
                  >
                    {roomsList.map(r => (
                      <option key={r.roomNumber} value={r.roomNumber}>ห้อง {r.roomNumber}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">รอบบิล</label>
                  <input
                    type="text"
                    disabled
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-500 text-xs font-mono font-bold"
                    value={billingCycle}
                  />
                </div>
              </div>

              {/* มิเตอร์ปัจจุบัน */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-900/40 rounded-xl border border-slate-900 space-y-0.5">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold">หน่วยไฟที่ใช้</label>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs font-mono focus:outline-none focus:border-blue-500"
                      value={elecUnitsManual}
                      onChange={(e) => setElecUnitsManual(Number(e.target.value))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 font-bold">หน่วย</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold">หน่วยน้ำที่ใช้</label>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs font-mono focus:outline-none focus:border-teal-500"
                      value={waterUnitsManual}
                      onChange={(e) => setWaterUnitsManual(Number(e.target.value))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 font-bold">หน่วย</span>
                  </div>
                </div>
              </div>

              {/* สรุปยอดราคาจำลอง */}
              <div className="p-4 bg-blue-600/5 rounded-xl border border-blue-500/10 text-[11px] space-y-2 font-medium">
                <div className="flex justify-between text-slate-400">
                  <span>ค่าห้องแอร์/พัดลมปกติ:</span>
                  <span>{rentPrice.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>ค่าไฟฟ้า ({elecUnitsManual} หน่วย):</span>
                  <span>
                    {elecUnitsManual <= 10 
                      ? "80 บาท (ขั้นต่ำ 10 หน่วย)" 
                      : `${(elecUnitsManual * elecRate).toLocaleString()} บาท (หน่วยละ 7.-)`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>ค่าน้ำประปา ({waterUnitsManual} หน่วย):</span>
                  <span>
                    {waterUnitsManual <= 3 
                      ? "51 บาท (ขั้นต่ำ 3 หน่วย)" 
                      : `${(waterUnitsManual * waterRate).toLocaleString()} บาท (หน่วยละ 18.-)`}
                  </span>
                </div>
                <div className="h-px bg-slate-800 my-1.5" />
                <div className="flex justify-between font-extrabold text-slate-200">
                  <span>ยอดสุทธิที่ต้องชำระ:</span>
                  <span className="text-blue-400 text-xs font-black">{computedTotal.toLocaleString()} บาท</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/15 hover:-translate-y-0.5 transition-all"
              >
                คำนวณเงินและออกบิลค้างชำระ
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
