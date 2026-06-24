"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  TrendingUp,
  Users,
  Home,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  DollarSign,
  Activity,
  CheckCircle2,
  Clock,
  Settings,
  X,
  Layers,
  Lock,
  Plus,
  FileText,
  Receipt,
  Coins,
  ChevronDown,
  Calendar,
  Zap,
  Check
} from "lucide-react"
import { getRooms } from "@/features/room/actions"
import { getTenants, getOldTenants } from "@/features/tenant/actions"
import { getBills } from "@/features/billing/actions"
import { getExpenses } from "@/features/expenses/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

const THAI_MONTHS = [
  { value: "01", label: "มกราคม" },
  { value: "02", label: "กุมภาพันธ์" },
  { value: "03", label: "มีนาคม" },
  { value: "04", label: "เมษายน" },
  { value: "05", label: "พฤษภาคม" },
  { value: "06", label: "มิถุนายน" },
  { value: "07", label: "กรกฎาคม" },
  { value: "08", label: "สิงหาคม" },
  { value: "09", label: "กันยายน" },
  { value: "10", label: "ตุลาคม" },
  { value: "11", label: "พฤศจิกายน" },
  { value: "12", label: "ธันวาคม" }
]

const YEARS = [
  { value: "2024", label: "2567" },
  { value: "2025", label: "2568" },
  { value: "2026", label: "2569" },
  { value: "2027", label: "2570" }
]

export default function AdminDashboard() {
  const router = useRouter()
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)
  const [stats, setStats] = useState<any[]>([])
  const [recentTransactions, setRecentTransactions] = useState<any[]>([])
  const [recentActivities, setRecentActivities] = useState<any[]>([])

  // Dynamic Month / Year Selection
  const [selectedMonth, setSelectedMonth] = useState("06")
  const [selectedYear, setSelectedYear] = useState("2026")
  const [selectedCycle, setSelectedCycle] = useState("2026-06")

  // Dynamic Welcome Name
  const [welcomeName, setWelcomeName] = useState<string>("")

  // Cache raw data client-side for dynamic billing cycle filtering without database refetches
  const [rawRooms, setRawRooms] = useState<any[]>([])
  const [rawTenants, setRawTenants] = useState<any[]>([])
  const [rawBills, setRawBills] = useState<any[]>([])
  const [rawExpenses, setRawExpenses] = useState<any[]>([])
  const [rawOldTenants, setRawOldTenants] = useState<any[]>([])

  // Adaptive Switcher on Mobile/Tablet Compact
  const [activeTab, setActiveTab] = useState<"transactions" | "activities">("transactions")

  // Sync Cycle state whenever Month or Year changes
  useEffect(() => {
    setSelectedCycle(`${selectedYear}-${selectedMonth}`)
  }, [selectedMonth, selectedYear])

  const calculateStats = (rooms: any[], tenants: any[], bills: any[], expenses: any[], cycle: string, oldTenants: any[] = []) => {
    const totalRooms = rooms.length
    
    // Helper function to check if a lease overlaps with the selected cycle month
    const isLeaseOverlappingCycle = (leaseStart: string | null | undefined, leaseEnd: string | null | undefined) => {
      if (!leaseStart || !leaseEnd) return false
      
      const [yearStr, monthStr] = cycle.split("-")
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10) - 1 // 0-indexed month
      
      const cycleStart = new Date(year, month, 1)
      const cycleEnd = new Date(year, month + 1, 0, 23, 59, 59) // last day of month

      const leaseS = new Date(leaseStart)
      const leaseE = new Date(leaseEnd)

      // Normalize times
      const startD = new Date(leaseS.getFullYear(), leaseS.getMonth(), leaseS.getDate())
      const endD = new Date(leaseE.getFullYear(), leaseE.getMonth(), leaseE.getDate())

      return startD <= cycleEnd && endD >= cycleStart
    }

    const currentMonthBills = bills.filter((b: any) => b.billingCycle === cycle)

    // ตรวจสอบห้องพักที่มีผู้เช่าพักอยู่จริงในช่วงเดือนที่เลือก (cycle)
    const occupiedRooms = rooms.filter((r: any) => {
      // 1. ตรวจสอบจากบิลที่มีในเดือนนั้น
      const hasBillInCycle = currentMonthBills.some((b: any) => b.roomNumber === r.roomNumber)
      if (hasBillInCycle) return true

      // 2. ตรวจสอบจากระยะเวลาผู้เช่าปัจจุบัน
      const hasMatchingTenant = tenants.some((t: any) => {
        if (t.roomNumber !== r.roomNumber) return false
        return isLeaseOverlappingCycle(t.contractStart, t.contractEnd)
      })
      if (hasMatchingTenant) return true

      // 3. ตรวจสอบจากระยะเวลาผู้เช่าเก่า (tenants_old)
      const hasMatchingOldTenant = oldTenants.some((t: any) => {
        if (t.roomNumber !== r.roomNumber) return false
        return isLeaseOverlappingCycle(t.contractStart, t.contractEnd)
      })
      if (hasMatchingOldTenant) return true

      // 4. ตรวจสอบจากระยะเวลาเช่าที่ติดมากับห้องพัก (ถ้ามี)
      const hasRoomLeaseOverlap = isLeaseOverlappingCycle(r.leaseStart, r.leaseEnd)
      if (hasRoomLeaseOverlap) return true

      return false
    }).length

    const availableRooms = totalRooms - occupiedRooms
    const paidBills = currentMonthBills.filter((b: any) => b.status === "paid")
    const unpaidBills = currentMonthBills.filter((b: any) => b.status === "unpaid" || b.status === "pending")
    const pendingBills = currentMonthBills.filter((b: any) => b.status === "pending")

    const totalRevenue = paidBills.reduce((sum, b) => sum + Number(b.amount), 0)
    const unpaidAmount = unpaidBills.reduce((sum, b) => sum + Number(b.amount), 0)
    const totalBilled = currentMonthBills.reduce((sum, b) => sum + Number(b.amount), 0)

    // Calculate Expenses for this month cycle
    const currentMonthExpenses = expenses.filter((e: any) => e.created_at && e.created_at.substring(0, 7) === cycle)
    const totalExpenses = currentMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

    const netProfit = totalRevenue - totalExpenses

    // Calculate Late Payment Rate (บิลที่จ่ายล่าช้า หรือ ค้างชำระ)
    const lateBills = currentMonthBills.filter((b: any) => (b.lateDays && b.lateDays > 0) || (b.penaltyAmount && b.penaltyAmount > 0))
    const latePaymentRate = currentMonthBills.length > 0 ? (lateBills.length / currentMonthBills.length) * 100 : 0

    // Collections Progress Rate
    const collectionsRate = totalBilled > 0 ? (totalRevenue / totalBilled) * 100 : 0

    const cycleYear = cycle.split("-")[0]
    const cycleMonth = cycle.split("-")[1]
    const thaiMonthObj = THAI_MONTHS.find(m => m.value === cycleMonth)
    const cycleLabel = thaiMonthObj ? `${thaiMonthObj.label} ${Number(cycleYear) + 543}` : cycle

    setStats([
      {
        title: "จำนวนห้องที่มีผู้เช่า",
        value: `${occupiedRooms} / ${totalRooms} ห้อง`,
        change: `อัตราเข้าพัก ${(totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0).toFixed(1)}%`,
        isPositive: true,
        icon: Users,
        color: "text-teal-500 dark:text-teal-400",
        bg: "bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/30",
        path: "/tenants"
      },
      {
        title: "รายได้เก็บแล้ว",
        value: `${totalRevenue.toLocaleString()} บาท`,
        change: `ยอดแจ้งหนี้รวม ${totalBilled.toLocaleString()} บาท`,
        isPositive: true,
        icon: DollarSign,
        color: "text-emerald-500 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/30",
        path: "/manage-bills"
      },
      {
        title: "ค่าใช้จ่ายเดือนนี้",
        value: `${totalExpenses.toLocaleString()} บาท`,
        change: `บันทึกไว้ ${currentMonthExpenses.length} รายการ`,
        isPositive: false,
        icon: TrendingDown,
        color: "text-rose-500 dark:text-rose-400",
        bg: "bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/30",
        path: "/daily-bills"
      },
      {
        title: "กำไรสุทธิคาดการณ์",
        value: `${netProfit.toLocaleString()} บาท`,
        change: netProfit >= 0 ? "ผลประกอบการเป็นบวก" : "ผลประกอบการติดลบ",
        isPositive: netProfit >= 0,
        icon: TrendingUp,
        color: netProfit >= 0 ? "text-indigo-500 dark:text-indigo-400" : "text-amber-500 dark:text-amber-400",
        bg: netProfit >= 0 ? "bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/30" : "bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/30",
        path: "/daily-bills"
      },
      {
        title: "อัตราการจ่ายล่าช้า",
        value: `${latePaymentRate.toFixed(1)}%`,
        change: `พบ ${lateBills.length} บิลที่จ่ายช้า/มีค่าปรับ`,
        isPositive: latePaymentRate < 10,
        icon: AlertTriangle,
        color: "text-amber-500 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/30",
        path: "/manage-bills"
      },
      {
        title: "อัตราการเก็บเงิน",
        value: `${collectionsRate.toFixed(1)}%`,
        change: `ชำระแล้ว ${paidBills.length} / ${currentMonthBills.length} บิล`,
        isPositive: collectionsRate >= 80,
        icon: CheckCircle2,
        color: "text-purple-500 dark:text-purple-400",
        bg: "bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/30",
        path: "/manage-bills"
      }
    ])

    const formattedTxs = currentMonthBills.slice(0, 4).map((b: any) => ({
      room: `ห้อง ${b.roomNumber}`,
      tenant: b.tenantName,
      type: "โอนผ่านพร้อมเพย์",
      amount: `${b.amount.toLocaleString()} บาท`,
      status: b.status === "paid" ? "สำเร็จ" : b.status === "pending" ? "รอยืนยัน" : "ค้างชำระ",
      time: "ล่าสุด"
    }))
    setRecentTransactions(formattedTxs)

    const activities = []
    if (tenants.length > 0) {
      const latestTenant = tenants[0]
      activities.push({
        user: "ระบบอัตโนมัติ",
        action: `ทำสัญญาเช่าใหม่ ห้อง ${latestTenant.roomNumber} (${latestTenant.fullName})`,
        time: "ล่าสุด"
      })
    }
    if (currentMonthBills.length > 0) {
      const pendingCount = currentMonthBills.filter((b: any) => b.status === "pending").length
      if (pendingCount > 0) {
        activities.push({
          user: "ผู้เช่า",
          action: `มีบิลอัปโหลดสลิปรอการตรวจสอบจำนวน ${pendingCount} รายการ`,
          time: "ล่าสุด"
        })
      }
    }
    if (currentMonthExpenses.length > 0) {
      const latestExpense = currentMonthExpenses[0]
      activities.push({
        user: "ระบบค่าใช้จ่าย",
        action: `เพิ่มรายจ่ายด่วน: ${latestExpense.title} (${latestExpense.amount.toLocaleString()} บาท)`,
        time: "ล่าสุด"
      })
    }
    activities.push({
      user: "ระบบเชื่อมต่อ",
      action: "เชื่อมต่อฐานข้อมูล Supabase สำเร็จ ทำการดึงข้อมูลสดเรียบร้อยแล้ว",
      time: "เชื่อมต่อแล้ว"
    })
    setRecentActivities(activities)
  }

  const loadDashboardData = async (forceRefresh = false) => {
    setLoading(true)
    setDbError(null)
    try {
      // 0. ดึงและแคชข้อมูลโปรไฟล์ผู้ใช้เพื่อระบุ Workspace ปัจจุบันแบบไร้รอยต่อ
      let userProfile = getCachedData("global", "profile")
      if (!userProfile || forceRefresh) {
        const userRes = (await getCurrentUserProfileClient(forceRefresh)) as any
        if (userRes.success && userRes.data) {
          userProfile = userRes.data
          setCachedData("global", "profile", userRes.data)
        } else if (userRes.success === false) {
          throw new Error(userRes.error || "เกิดข้อผิดพลาดในการดึงข้อมูลโปรไฟล์ผู้ใช้")
        }
      }

      let wsId = ""
      if (userProfile) {
        const isSuperAdmin = userProfile.role === "super_admin"
        if (!isSuperAdmin && userProfile.workspace_id) {
          wsId = userProfile.workspace_id
        } else {
          const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
          wsId = cookieWsId || userProfile.workspace_id || ""
        }

        const name = userProfile.full_name || userProfile.email || "ผู้ดูแลระบบ"
        if (userProfile.role === "super_admin") {
          setWelcomeName(`Super Admin ${name}`)
        } else if (userProfile.role === "admin") {
          setWelcomeName(name.startsWith("คุณ") || name.startsWith("แอดมิน") ? name : `แอดมิน ${name}`)
        } else if (userProfile.role === "staff") {
          setWelcomeName(name.startsWith("คุณ") ? name : `คุณ ${name}`)
        } else {
          setWelcomeName(name)
        }
      } else {
        setWelcomeName("แอดมินสมเจตน์")
      }

      // ถ้าเป็นการ Force Refresh ให้ล้างแคชเก่าออก
      if (forceRefresh && wsId) {
        clearWorkspaceCache(wsId)
      }

      // โหลดข้อมูลแบบคู่ขนาน (Parallel Fetching) เพื่อประสิทธิภาพสูงสุด
      const fetchPromises = [];

      const currentYear = selectedYear
      let rooms = wsId ? getCachedData(wsId, "rooms") : null
      let tenants = wsId ? getCachedData(wsId, "tenants") : null
      let bills = wsId ? getCachedData(wsId, `bills_year_${currentYear}`) : null
      let expenses = wsId ? getCachedData(wsId, `expenses_year_${currentYear}`) : null
      let oldTenants = wsId ? getCachedData(wsId, "oldTenants") : null

      if (!rooms || forceRefresh) {
        fetchPromises.push(
          getRooms().then(roomsRes => {
            if (roomsRes && roomsRes.success === false) {
              throw new Error(roomsRes.error || "ไม่สามารถเชื่อมต่อดึงข้อมูลห้องพักได้")
            }
            rooms = roomsRes.success && roomsRes.data ? roomsRes.data : []
            if (wsId) setCachedData(wsId, "rooms", rooms)
          })
        );
      }

      if (!tenants || forceRefresh) {
        fetchPromises.push(
          getTenants().then(tenantsRes => {
            if (tenantsRes && tenantsRes.success === false) {
              throw new Error(tenantsRes.error || "ไม่สามารถเชื่อมต่อดึงข้อมูลผู้เช่าได้")
            }
            tenants = tenantsRes.success && tenantsRes.data ? tenantsRes.data : []
            if (wsId) setCachedData(wsId, "tenants", tenants)
          })
        );
      }

      if (!bills || forceRefresh) {
        fetchPromises.push(
          getBills(undefined, currentYear).then(billsRes => {
            if (billsRes && billsRes.success === false) {
              throw new Error(billsRes.error || "ไม่สามารถเชื่อมต่อดึงข้อมูลบิลได้")
            }
            bills = billsRes.success && billsRes.data ? billsRes.data : []
            if (wsId) setCachedData(wsId, `bills_year_${currentYear}`, bills)
          })
        );
      }

      if (!expenses || forceRefresh) {
        fetchPromises.push(
          getExpenses(currentYear, wsId).then(expensesRes => {
            if (expensesRes && expensesRes.success === false) {
              throw new Error(expensesRes.error || "ไม่สามารถเชื่อมต่อดึงข้อมูลค่าใช้จ่ายได้")
            }
            expenses = expensesRes.success && expensesRes.data ? expensesRes.data : []
            if (wsId) setCachedData(wsId, `expenses_year_${currentYear}`, expenses)
          })
        );
      }

      if (!oldTenants || forceRefresh) {
        fetchPromises.push(
          getOldTenants().then(oldTenantsRes => {
            oldTenants = oldTenantsRes.success && oldTenantsRes.data ? oldTenantsRes.data : []
            if (wsId) setCachedData(wsId, "oldTenants", oldTenants)
          }).catch(() => {
            oldTenants = []
          })
        );
      }

      if (fetchPromises.length > 0) {
        await Promise.all(fetchPromises)
      }

      const isRealSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

      if (isRealSupabase) {
        setIsDemo(false)
        setRawRooms(rooms)
        setRawTenants(tenants)
        setRawBills(bills)
        setRawExpenses(expenses)
        setRawOldTenants(oldTenants || [])
        
        calculateStats(rooms, tenants, bills, expenses, `${selectedYear}-${selectedMonth}`, oldTenants || [])
      } else {
        setIsDemo(true)
        setupDemoFallback(`${selectedYear}-${selectedMonth}`)
      }
    } catch (e) {
      console.error("Failed to load dashboard data:", e)
      const isRealSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
      if (isRealSupabase) {
        setIsDemo(false)
        setDbError(e instanceof Error ? e.message : "การเชื่อมต่อ Database มีปัญหา กรุณาลองใหม่อีกครั้ง")
        setRawRooms([])
        setRawTenants([])
        setRawBills([])
        setRawExpenses([])
        setRawOldTenants([])
        calculateStats([], [], [], [], `${selectedYear}-${selectedMonth}`, [])
      } else {
        setIsDemo(true)
        setupDemoFallback(`${selectedYear}-${selectedMonth}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const setupDemoFallback = (cycle: string) => {
    const cycleYear = cycle.split("-")[0]
    const cycleMonth = cycle.split("-")[1]
    const thaiMonthObj = THAI_MONTHS.find(m => m.value === cycleMonth)
    const cycleLabel = thaiMonthObj ? `${thaiMonthObj.label} ${Number(cycleYear) + 543}` : cycle

    let occupiedRooms = 22
    let totalRooms = 24
    let totalRevenue = 118250
    let totalBilled = 135050
    let totalExpenses = 24500
    let lateBillsCount = 2
    let paidBillsCount = 19
    let totalBillsCount = 22

    if (cycleMonth === "05") {
      totalRevenue = 125400
      totalBilled = 131000
      totalExpenses = 18200
      lateBillsCount = 1
      paidBillsCount = 21
    } else if (cycleMonth === "04") {
      totalRevenue = 130000
      totalBilled = 130000
      totalExpenses = 15000
      lateBillsCount = 0
      paidBillsCount = 22
    } else {
      // General formula for other months in demo mode
      const monthNum = Number(cycleMonth) || 6
      occupiedRooms = 20 + (monthNum % 4)
      totalRevenue = 100000 + (monthNum * 3500)
      totalBilled = totalRevenue + (monthNum % 3 === 0 ? 5600 : 0)
      totalExpenses = 12000 + (monthNum * 1200)
      lateBillsCount = monthNum % 2
      paidBillsCount = occupiedRooms - lateBillsCount
      totalBillsCount = occupiedRooms
    }

    const netProfit = totalRevenue - totalExpenses
    const occupancyRate = (occupiedRooms / totalRooms) * 100
    const latePaymentRate = totalBillsCount > 0 ? (lateBillsCount / totalBillsCount) * 100 : 0
    const collectionsRate = totalBilled > 0 ? (totalRevenue / totalBilled) * 100 : 0

    setStats([
      {
        title: "จำนวนห้องที่มีผู้เช่า",
        value: `${occupiedRooms} / ${totalRooms} ห้อง`,
        change: `อัตราเข้าพัก ${occupancyRate.toFixed(1)}%`,
        isPositive: true,
        icon: Users,
        color: "text-teal-500 dark:text-teal-400",
        bg: "bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/30",
        path: "/tenants"
      },
      {
        title: "รายได้เก็บแล้ว",
        value: `${totalRevenue.toLocaleString()} บาท`,
        change: `ยอดแจ้งหนี้รวม ${totalBilled.toLocaleString()} บาท`,
        isPositive: true,
        icon: DollarSign,
        color: "text-emerald-500 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/30",
        path: "/manage-bills"
      },
      {
        title: "ค่าใช้จ่ายเดือนนี้",
        value: `${totalExpenses.toLocaleString()} บาท`,
        change: `รายการจำลองแบบเดโม`,
        isPositive: false,
        icon: TrendingDown,
        color: "text-rose-500 dark:text-rose-400",
        bg: "bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/30",
        path: "/daily-bills"
      },
      {
        title: "กำไรสุทธิคาดการณ์",
        value: `${netProfit.toLocaleString()} บาท`,
        change: netProfit >= 0 ? "ผลประกอบการเป็นบวก" : "ผลประกอบการติดลบ",
        isPositive: netProfit >= 0,
        icon: TrendingUp,
        color: netProfit >= 0 ? "text-indigo-500 dark:text-indigo-400" : "text-amber-500 dark:text-amber-400",
        bg: netProfit >= 0 ? "bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/30" : "bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/30",
        path: "/daily-bills"
      },
      {
        title: "อัตราการจ่ายล่าช้า",
        value: `${latePaymentRate.toFixed(1)}%`,
        change: `พบ ${lateBillsCount} บิลที่จ่ายล่าช้าในเดโม`,
        isPositive: latePaymentRate < 10,
        icon: AlertTriangle,
        color: "text-amber-500 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/30",
        path: "/manage-bills"
      },
      {
        title: "อัตราการเก็บเงิน",
        value: `${collectionsRate.toFixed(1)}%`,
        change: `ชำระแล้ว ${paidBillsCount} / ${totalBillsCount} บิล`,
        isPositive: collectionsRate >= 80,
        icon: CheckCircle2,
        color: "text-purple-500 dark:text-purple-400",
        bg: "bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/30",
        path: "/manage-bills"
      }
    ])

    if (cycleMonth === "06") {
      setRecentTransactions([
        { room: "ห้อง 101", tenant: "คุณวิภาวี", type: "โอนผ่านพร้อมเพย์", amount: "5,400 บาท", status: "สำเร็จ", time: "10 นาทีที่แล้ว" },
        { room: "ห้อง 203", tenant: "คุณกิตติศักดิ์", type: "โอนผ่านพร้อมเพย์", amount: "6,200 บาท", status: "สำเร็จ", time: "1 ชั่วโมงที่แล้ว" },
        { room: "ห้อง 105", tenant: "คุณณัฐพล", type: "อัปโหลดสลิปค้างยืนยัน", amount: "5,800 บาท", status: "รอยืนยัน", time: "2 ชั่วโมงที่แล้ว" },
        { room: "ห้อง 302", tenant: "คุณรภัสสร", type: "ยังไม่ได้ชำระ", amount: "5,600 บาท", status: "ค้างชำระ", time: "1 วันที่แล้ว" }
      ])
    } else if (cycleMonth === "05") {
      setRecentTransactions([
        { room: "ห้อง 101", tenant: "คุณวิภาวี", type: "โอนผ่านพร้อมเพย์", amount: "5,400 บาท", status: "สำเร็จ", time: "เมื่อเดือนที่แล้ว" },
        { room: "ห้อง 203", tenant: "คุณกิตติศักดิ์", type: "โอนผ่านพร้อมเพย์", amount: "6,200 บาท", status: "สำเร็จ", time: "เมื่อเดือนที่แล้ว" },
        { room: "ห้อง 302", tenant: "คุณรภัสสร", type: "ยังไม่ได้ชำระ", amount: "5,600 บาท", status: "ค้างชำระ", time: "เมื่อเดือนที่แล้ว" }
      ])
    } else {
      setRecentTransactions([
        { room: "ห้อง 101", tenant: "คุณวิภาวี", type: "โอนผ่านพร้อมเพย์", amount: "5,400 บาท", status: "สำเร็จ", time: "2 เดือนที่แล้ว" },
        { room: "ห้อง 203", tenant: "คุณกิตติศักดิ์", type: "โอนผ่านพร้อมเพย์", amount: "6,200 บาท", status: "สำเร็จ", time: "2 เดือนที่แล้ว" }
      ])
    }

    setRecentActivities([
      { user: "พนักงานสมชาย", action: "บันทึกตัวเลขมิเตอร์น้ำไฟรอบเดโมสำเร็จ", time: "เมื่อวานนี้" },
      { user: "ระบบอัตโนมัติ", action: "ส่งใบแจ้งหนี้จำลองไปยังแผงควบคุมหลักสำเร็จ", time: "2 วันก่อน" },
      { user: "แอดมินสมเจตน์", action: "ทดสอบเลือกช่วงเวลาเดโม " + cycleLabel, time: "ล่าสุด" }
    ])
  }

  // Fetch when selected year changes
  useEffect(() => {
    loadDashboardData()
  }, [selectedYear])

  // Sync calculations when selected month changes (without reloading db if rawBills already has the selected year's data)
  useEffect(() => {
    if (!loading) {
      if (isDemo) {
        setupDemoFallback(`${selectedYear}-${selectedMonth}`)
      } else {
        calculateStats(rawRooms, rawTenants, rawBills, rawExpenses, `${selectedYear}-${selectedMonth}`, rawOldTenants)
      }
    }
  }, [selectedMonth])

  const SkeletonLoader = () => (
    <div className="space-y-6">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 animate-pulse">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-6 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800/80 h-28 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
              <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
            </div>
            <div className="h-2.5 bg-slate-150 dark:bg-slate-700 rounded w-1/3" />
          </div>
        ))}
      </div>

      {/* Quick Actions Skeleton */}
      <div className="space-y-3">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800/80 h-16" />
          ))}
        </div>
      </div>

      {/* Two-Column Details Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
        {/* Left Column Table Skeleton */}
        <div className="md:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800/80 h-80 flex flex-col justify-between">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4" />
          <div className="space-y-3.5 flex-1">
            <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-lg w-full" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between items-center py-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/6" />
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/6" />
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/6 text-right" />
              </div>
            ))}
          </div>
        </div>

        {/* Right Column Feed Skeleton */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800/80 h-80 flex flex-col justify-between">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4" />
          <div className="space-y-4 flex-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700 mt-1.5 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* ส่วนหัวข้อต้อนรับแบบพรีเมียม (Adaptive layout) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight min-h-[36px] flex items-center">
            {welcomeName ? (
              `ยินดีต้อนรับกลับ ${welcomeName}!`
            ) : (
              <span className="inline-block bg-slate-200 dark:bg-slate-700 rounded-lg w-64 h-8 animate-pulse" />
            )}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            ข้อมูลสรุปและสถานะภาพรวมของหอพัก แสนสุข แมนชั่น ประจำวันนี้ ติดตามความเคลื่อนไหวได้แบบเรียลไทม์
          </p>
        </div>
        
        {/* DESKTOP Month Dropdown Selector & RLS Badge (>= 768px) */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          {/* Dynamic Month Selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            >
              {THAI_MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            >
              {YEARS.map(y => (
                <option key={y.value} value={y.value}>พ.ศ. {y.label}</option>
              ))}
            </select>
          </div>

          <div className="text-xs font-bold px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center gap-2.5 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
            </span>
            <span className="text-slate-650 dark:text-slate-350">RLS ทำงานปกติ</span>
          </div>
        </div>
      </div>

      {/* MOBILE View Selector (< 768px) */}
      <div className="flex md:hidden items-center gap-2 mt-4 pb-2 border-b border-slate-100 dark:border-slate-800/50 w-full">
        <span className="text-xs font-bold text-slate-400 shrink-0">เลือกช่วงเวลา:</span>
        <div className="flex gap-2 flex-1">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm outline-none"
          >
            {THAI_MONTHS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm outline-none"
          >
            {YEARS.map(y => (
              <option key={y.value} value={y.value}>พ.ศ. {y.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <SkeletonLoader />
      ) : dbError ? (
        <div className="mt-8 p-8 md:p-12 rounded-3xl bg-red-50/40 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 text-center space-y-6 max-w-2xl mx-auto backdrop-blur-md animate-fade-in shadow-xl">
          <div className="inline-flex p-4 rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 animate-bounce mx-auto">
            <AlertTriangle className="w-12 h-12" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              การเชื่อมต่อ Database มีปัญหา
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              {dbError}
            </p>
          </div>
          <div>
            <button
              onClick={() => {
                setLoading(true);
                loadDashboardData(true);
              }}
              className="px-6 py-3 bg-red-650 hover:bg-red-700 active:scale-95 text-white font-extrabold text-sm rounded-xl shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer"
            >
              ลองเชื่อมต่อใหม่อีกครั้ง (Retry)
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Grid การ์ดสถิติ (Stats Grid) - Fully Adaptive & Clickable with premium interactions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6 mt-6">
            {stats.map((stat, idx) => {
              const Icon = stat.icon
              return (
                <div 
                  key={idx} 
                  onClick={() => router.push(stat.path || "/")}
                  className="bg-white dark:bg-slate-850 p-5 md:p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm relative overflow-hidden transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-md cursor-pointer hover:border-slate-300 dark:hover:border-slate-700/80 active:scale-[0.98] group"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-bold block uppercase tracking-wider">{stat.title}</span>
                      <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100 font-mono tracking-tight pt-1 leading-none">{stat.value}</h3>
                      <span className={`inline-flex items-center text-[10px] md:text-xs font-bold tracking-wide mt-1.5 ${stat.isPositive ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-450"}`}>
                        {stat.change}
                      </span>
                    </div>
                    <div className={`p-2 rounded-xl transition-transform duration-300 group-hover:scale-110 shrink-0 ${stat.bg} ${stat.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  {/* Subtle link arrow indicator */}
                  <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </div>
              )
            })}
          </div>

          {/* แผงเมนูลัดจัดข้อมูลด่วน (Quick Actions Panel) - Adaptive Design System */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3.5">
              <Zap className="w-4 h-4 text-amber-500" />
              <h4 className="text-xs md:text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                การดำเนินการด่วน (Quick Actions)
              </h4>
            </div>

            {/* MOBILE VIEW GRID (< 768px, Large 48px touch targets, comfortable spaces) */}
            <div className="grid grid-cols-2 gap-3.5 md:hidden">
              {[
                { label: "จดมิเตอร์น้ำไฟ", sub: "Utility Meter", path: "/billing", icon: Receipt, bg: "from-blue-500/10 to-blue-500/5 text-blue-500 border-blue-500/20 dark:border-blue-500/30" },
                { label: "ออกบิลค่าเช่า", sub: "New Month Bill", path: "/billing", icon: Plus, bg: "from-teal-500/10 to-teal-500/5 text-teal-500 border-teal-500/20 dark:border-teal-500/30" },
                { label: "จัดการผู้เช่า", sub: "Manage Tenants", path: "/tenants", icon: Users, bg: "from-indigo-500/10 to-indigo-500/5 text-indigo-500 border-indigo-500/20 dark:border-indigo-500/30" },
                { label: "รายจ่ายรายวัน", sub: "Daily Expense", path: "/daily-bills", icon: Coins, bg: "from-amber-500/10 to-amber-500/5 text-amber-500 border-amber-500/20 dark:border-amber-500/30" }
              ].map((act, idx) => {
                const Icon = act.icon
                return (
                  <button
                    key={idx}
                    onClick={() => router.push(act.path)}
                    className={`flex flex-col justify-between p-4 bg-gradient-to-br ${act.bg} border rounded-2xl active:scale-95 active:shadow-inner transition-all text-left shadow-sm h-24 cursor-pointer`}
                  >
                    <div className="p-2 bg-white dark:bg-slate-900 rounded-xl w-fit shadow-sm">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-slate-850 dark:text-slate-100">{act.label}</p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase">{act.sub}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* DESKTOP VIEW GRID (>= 768px, Dense info style, fine hover hover effect) */}
            <div className="hidden md:grid grid-cols-4 gap-4">
              {[
                { label: "จดมิเตอร์น้ำไฟ", desc: "บันทึกและคำนวณมิเตอร์ไฟฟ้าน้ำประปา", path: "/billing", icon: Receipt, color: "text-blue-500", bg: "bg-blue-500/10" },
                { label: "ออกบิลค่าเช่าประจำเดือน", desc: "สร้างและจัดส่งใบแจ้งหนี้ไปยัง LINE OA", path: "/billing", icon: Plus, color: "text-teal-500", bg: "bg-teal-500/10" },
                { label: "จัดการสัญญาเช่า & ผู้เช่า", desc: "เพิ่มสัญญา ปรับปรุงข้อมูล จัดการห้องพัก", path: "/tenants", icon: Users, color: "text-indigo-500", bg: "bg-indigo-500/10" },
                { label: "บันทึกรายจ่ายรายวัน", desc: "จดบันทึกรายจ่ายจิปาถะของหอพัก", path: "/daily-bills", icon: Coins, color: "text-amber-500", bg: "bg-amber-500/10" }
              ].map((act, idx) => {
                const Icon = act.icon
                return (
                  <button
                    key={idx}
                    onClick={() => router.push(act.path)}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl text-left hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 group cursor-pointer"
                  >
                    <div className={`p-3 rounded-xl shrink-0 group-hover:scale-105 transition-transform duration-300 ${act.bg} ${act.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">{act.label}</h5>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{act.desc}</p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-3.5 dark:text-slate-650 ml-auto opacity-0 group-hover:opacity-100 transition-all shrink-0" />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mobile Navigation View Switcher (Tab-based for touch-friendly statistics space saving - Threshold strictly at 768px md) */}
          <div className="block md:hidden mt-6">
            <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab("transactions")}
                className={`flex-1 py-3 text-xs font-extrabold rounded-lg text-center transition-all duration-200 cursor-pointer ${
                  activeTab === "transactions" 
                    ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm" 
                    : "text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
                style={{ minHeight: "44px" }}
              >
                บิลล่าสุด ({recentTransactions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("activities")}
                className={`flex-1 py-3 text-xs font-extrabold rounded-lg text-center transition-all duration-200 cursor-pointer ${
                  activeTab === "activities" 
                    ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm" 
                    : "text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
                style={{ minHeight: "44px" }}
              >
                กิจกรรมในระบบ ({recentActivities.length})
              </button>
            </div>
          </div>

          {/* แถวล่าง: ประวัติบิลน้ำไฟ และ กิจกรรมพนักงาน - Double Column strictly on Desktop (>= 768px) and Tab Switch on Mobile (< 768px) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            
            {/* รายการโอนเงินและชำระบิลล่าสุด (2 ใน 3 คอลัมน์) */}
            <div className={`md:col-span-2 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 p-5 md:p-6 flex flex-col shadow-sm ${activeTab === "transactions" ? "block" : "hidden md:flex"}`}>
              <div className="flex justify-between items-center mb-5 md:mb-6">
                <h3 className="text-xs md:text-sm font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2 uppercase tracking-wider">
                  <Activity className="w-4 h-4 text-blue-500 dark:text-blue-400" /> สถานะบิลและการรับเงินล่าสุด
                </h3>
                <button 
                  onClick={() => router.push("/billing")}
                  className="text-xs font-extrabold text-blue-600 dark:text-blue-400 hover:text-blue-500 hover:underline cursor-pointer py-2 px-3"
                  style={{ minHeight: "36px" }}
                >
                  ดูทั้งหมด
                </button>
              </div>

              <div className="flex-1 overflow-x-auto">
                {/* DESKTOP VIEW TABLE (hidden on mobile, strictly visible >= 768px) */}
                <table className="hidden md:table w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800/80 text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider">
                      <th className="pb-3 pl-2">ห้องพัก</th>
                      <th className="pb-3">ชื่อผู้เช่า</th>
                      <th className="pb-3">วิธีการ</th>
                      <th className="pb-3 text-right">ยอดชำระ</th>
                      <th className="pb-3 text-center">สถานะ</th>
                      <th className="pb-3 text-right pr-2">เวลา</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-650 dark:text-slate-300">
                    {recentTransactions.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 group transition-all duration-150">
                        <td className="py-3.5 pl-2 font-bold text-slate-800 dark:text-slate-200">{tx.room}</td>
                        <td className="py-3.5 text-slate-500 dark:text-slate-400">{tx.tenant}</td>
                        <td className="py-3.5 text-slate-500 dark:text-slate-400">{tx.type}</td>
                        <td className="py-3.5 text-right font-mono font-extrabold text-slate-800 dark:text-slate-200">{tx.amount}</td>
                        <td className="py-3.5 text-center">
                          <span className={`inline-block text-[9px] font-bold px-2.5 py-0.5 rounded-full ${
                            tx.status === "สำเร็จ" ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-100/40 dark:border-teal-900/30" :
                            tx.status === "รอยืนยัน" ? "bg-amber-50 dark:bg-amber-950/40 text-amber-500 dark:text-amber-400 border border-amber-100/40 dark:border-amber-900/30" :
                            "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100/40 dark:border-red-900/30"
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3.5 text-right pr-2 text-slate-400 dark:text-slate-500 font-mono text-[10px]">{tx.time}</td>
                      </tr>
                    ))}
                    {recentTransactions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-slate-555 font-medium">
                          ไม่มีข้อมูลธุรกรรมหรือบิลในรอบบัญชีนี้
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* MOBILE VIEW CARD-BASED LIST (visible on mobile, hidden on desktop < 768px) */}
                <div className="block md:hidden space-y-4">
                  {recentTransactions.map((tx, idx) => (
                    <div 
                      key={idx}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-3 hover:border-blue-500/40 dark:hover:border-blue-500/40 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{tx.room}</span>
                        <span className={`inline-block text-[9px] font-extrabold px-2.5 py-1 rounded-full ${
                          tx.status === "สำเร็จ" ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-100/40 dark:border-teal-900/30" :
                          tx.status === "รอยืนยัน" ? "bg-amber-50 dark:bg-amber-950/40 text-amber-500 dark:text-amber-400 border border-amber-100/40 dark:border-amber-900/30" :
                          "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100/40 dark:border-red-900/30"
                        }`}>
                          {tx.status}
                        </span>
                      </div>
                      
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex flex-col gap-2 text-xs text-slate-650 dark:text-slate-400">
                        <div className="flex justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium">ผู้เช่า:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{tx.tenant}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium">วิธีการจ่าย:</span>
                          <span className="text-slate-700 dark:text-slate-200">{tx.type}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 dark:text-slate-500 font-medium">ยอดจ่าย:</span>
                          <span className="font-extrabold text-slate-850 dark:text-slate-100 text-sm font-mono">{tx.amount}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 dark:text-slate-500 font-medium">เวลาบันทึก:</span>
                          <span className="font-mono text-[10px] text-slate-400 dark:text-slate-550">{tx.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {recentTransactions.length === 0 && (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
                      ไม่มีข้อมูลธุรกรรมหรือบิลในรอบบัญชีนี้
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* บันทึกกิจกรรมระบบ/พนักงาน (1 ใน 3 คอลัมน์) */}
            <div className={`bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 p-5 md:p-6 flex flex-col shadow-sm ${activeTab === "activities" ? "block" : "hidden md:flex"}`}>
              <div className="flex justify-between items-center mb-5 md:mb-6">
                <h3 className="text-xs md:text-sm font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2 uppercase tracking-wider">
                  <TrendingUp className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> กิจกรรมล่าสุดในระบบ
                </h3>
              </div>

              {/* Timeline Feeds (gorgeous premium timeline list style) */}
              <div className="flex-1 relative pl-4 border-l border-slate-150 dark:border-slate-800 space-y-6">
                {recentActivities.map((act, idx) => (
                  <div key={idx} className="relative text-xs">
                    {/* Timeline dot */}
                    <div className="absolute -left-[20.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 dark:bg-blue-400 ring-4 ring-white dark:ring-slate-850 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-slate-700 dark:text-slate-250 leading-relaxed">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{act.user}</span>: {act.action}
                      </p>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 block">{act.time}</span>
                    </div>
                  </div>
                ))}
                {recentActivities.length === 0 && (
                  <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
                    ไม่มีประวัติกิจกรรมล่าสุด
                  </div>
                )}
              </div>
            </div>

          </div>
        </>
      )}
    </>
  )
}
