"use client"

import { useState, useEffect } from "react"
import { 
  FileText, 
  Download, 
  AlertTriangle, 
  Calculator, 
  FileCheck, 
  Landmark, 
  Settings, 
  Database, 
  Sliders, 
  CheckCircle2, 
  HelpCircle,
  TrendingUp,
  Plus,
  Trash2,
  Edit,
  X,
  Info,
  Coins,
  Calendar,
  Zap,
  Droplet,
  Wrench,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldCheck
} from "lucide-react"
import { 
  getExpenses, 
  createExpense, 
  updateExpense, 
  deleteExpense, 
  ExpenseItem 
} from "@/features/expenses/actions"
import { getFinanceSettings } from "@/features/finance/actions"
import { getRooms } from "@/features/room/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { getBills } from "@/features/billing/actions"
import { getTenants } from "@/features/tenant/actions"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"

interface BillItem {
  id: string
  roomNumber: string
  tenantName: string
  amount: number
  status: "unpaid" | "pending" | "paid"
  billingCycle: string
  slipUrl: string | null
  electricUnits: number
  waterUnits: number
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

export default function TaxPage() {
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const [taxYear, setTaxYear] = useState("2026")

  // สำหรับเงินประกันและค่าเช่าล่วงหน้า
  const [workspaceId, setWorkspaceId] = useState("")
  const [tenants, setTenants] = useState<any[]>([])
  const [cancelledContracts, setCancelledContracts] = useState<any[]>([])
  const [defaultDepositAmount, setDefaultDepositAmount] = useState(0)
  const [defaultAdvanceRent, setDefaultAdvanceRent] = useState(0)



  // โหลดข้อมูลผู้เสียภาษีจากตั้งค่าการเงิน
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [taxId, setTaxId] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [loadingPdf, setLoadingPdf] = useState<"90" | "94" | null>(null)

  // แหล่งที่มาของข้อมูลการคำนวณภาษี
  const [dataSource, setDataSource] = useState<"system" | "manual">("system")
  const [manualRent405, setManualRent405] = useState(0)
  const [manualUtilities408, setManualUtilities408] = useState(0)
  const [manualOther408, setManualOther408] = useState(0)

  // อัตราและข้อมูลตั้งค่าการเงินจริงจากระบบ
  const [electricRate, setElectricRate] = useState(7)
  const [waterRate, setWaterRate] = useState(18)
  const [commonFee, setCommonFee] = useState(50)
  const [latePenaltyRate, setLatePenaltyRate] = useState(0)
  const [rooms, setRooms] = useState<{ roomNumber: string; baseRent: number }[]>([])

  // วิธีหักค่าใช้จ่ายสำหรับมาตรา 40(5) และ 40(8)
  const [deductionMethod405, setDeductionMethod405] = useState<"เหมา 30%" | "ตามจริง">("เหมา 30%")
  const [deductionMethod408, setDeductionMethod408] = useState<"เหมา 60%" | "ตามจริง">("เหมา 60%")
  const [actualExpense405, setActualExpense405] = useState(0)
  const [actualExpense408, setActualExpense408] = useState(0)

  // ข้อมูลค่าใช้จ่ายจาก DB
  const [expenses, setExpenses] = useState<ExpenseItem[]>([])
  const [loadingExpenses, setLoadingExpenses] = useState(false)
  const [dbActualExpense405, setDbActualExpense405] = useState(0)
  const [dbActualExpense408, setDbActualExpense408] = useState(0)

  // สำหรับการซ่อน/แสดงคู่มือคำแนะนำ
  const [showGuide, setShowGuide] = useState(true)

  // State ฟอร์มบันทึกค่าใช้จ่าย
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null)
  const [expenseTitle, setExpenseTitle] = useState("")
  const [expenseAmount, setExpenseAmount] = useState<number | string>("")
  const [expenseCategory, setExpenseCategory] = useState<"40_5" | "40_8">("40_5")
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)
  const [expenseError, setExpenseError] = useState<string | null>(null)

  const [bills, setBills] = useState<BillItem[]>([])

  useEffect(() => {
    async function loadInitialData() {
      try {
        const userRes = await getCurrentUserProfileClient()
        
        let currentWsId: string | undefined = undefined
        
        if (userRes.success && userRes.data) {
          const isSuperAdmin = userRes.data.role === "super_admin"
          
          if (!isSuperAdmin && userRes.data.workspace_id) {
            // สำหรับ Admin และ Staff ทั่วไป: ให้ใช้ workspace_id จาก Profile เสมอ
            currentWsId = userRes.data.workspace_id
          } else {
            // สำหรับ Super Admin: ดึงจาก Cookie เพื่อรองรับการสลับ Workspace คอนโซลด้านบน
            const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
            currentWsId = cookieWsId || userRes.data.workspace_id || undefined
          }
        }

        if (currentWsId) {
          setWorkspaceId(currentWsId)

          // โหลดข้อมูลประวัติยกเลิกสัญญาจาก localStorage
          const savedCancellations = localStorage.getItem(`cancelled_contracts_${currentWsId}`)
          if (savedCancellations) {
            try {
              setCancelledContracts(JSON.parse(savedCancellations))
            } catch (e) {
              console.error("Failed to parse saved cancellations", e)
            }
          }

          // 1. โหลดข้อมูลผู้เสียภาษีและการเงิน
          const financeCacheKey = "finance_settings"
          const cachedFinance = getCachedData<any>(currentWsId, financeCacheKey)
          if (cachedFinance) {
            setFirstName(cachedFinance.tax_firstname || "")
            setLastName(cachedFinance.tax_lastname || "")
            setTaxId(cachedFinance.tax_id || "")
            setAddress(cachedFinance.tax_address || "")
            setPhone(cachedFinance.tax_phone || "")
            setElectricRate(Number(cachedFinance.electric_rate !== null && cachedFinance.electric_rate !== undefined ? cachedFinance.electric_rate : 7))
            setWaterRate(Number(cachedFinance.water_rate !== null && cachedFinance.water_rate !== undefined ? cachedFinance.water_rate : 18))
            setCommonFee(Number(cachedFinance.common_fee !== null && cachedFinance.common_fee !== undefined ? cachedFinance.common_fee : 50))
            setLatePenaltyRate(Number(cachedFinance.late_penalty_rate !== null && cachedFinance.late_penalty_rate !== undefined ? cachedFinance.late_penalty_rate : 0))
            setDefaultDepositAmount(Number(cachedFinance.deposit_amount !== null && cachedFinance.deposit_amount !== undefined ? cachedFinance.deposit_amount : 0))
            setDefaultAdvanceRent(Number(cachedFinance.advance_rent !== null && cachedFinance.advance_rent !== undefined ? cachedFinance.advance_rent : 0))
          } else {
            const res = await getFinanceSettings(currentWsId)
            if (res.success && res.data) {
              setFirstName(res.data.tax_firstname || "")
              setLastName(res.data.tax_lastname || "")
              setTaxId(res.data.tax_id || "")
              setAddress(res.data.tax_address || "")
              setPhone(res.data.tax_phone || "")
              setElectricRate(res.data.electric_rate)
              setWaterRate(res.data.water_rate)
              setCommonFee(res.data.common_fee)
              setLatePenaltyRate(res.data.late_penalty_rate)
              setDefaultDepositAmount(res.data.deposit_amount !== undefined ? Number(res.data.deposit_amount) : 0)
              setDefaultAdvanceRent(res.data.advance_rent !== undefined ? Number(res.data.advance_rent) : 0)
              setCachedData(currentWsId, financeCacheKey, res.data)
            }
          }

          // 1.2 โหลดข้อมูลผู้เช่า
          const tenantsCacheKey = "tenants_all"
          const cachedTenants = getCachedData<any[]>(currentWsId, tenantsCacheKey)
          if (cachedTenants) {
            setTenants(cachedTenants)
          } else {
            const tenantsRes = await getTenants()
            if (tenantsRes.success && tenantsRes.data) {
              setTenants(tenantsRes.data)
              setCachedData(currentWsId, tenantsCacheKey, tenantsRes.data)
            }
          }

          // 1.5 โหลดข้อมูลห้องเพื่อรู้ค่าเช่าห้องพักหลัก (baseRent)
          const roomsCacheKey = "rooms_all"
          const cachedRooms = getCachedData<any[]>(currentWsId, roomsCacheKey)
          if (cachedRooms) {
            setRooms(cachedRooms)
          } else {
            const roomsRes = await getRooms()
            if (roomsRes.success && roomsRes.data) {
              const mappedRooms = roomsRes.data.map((r: any) => ({
                roomNumber: r.roomNumber,
                baseRent: Number(r.baseRent)
              }))
              setRooms(mappedRooms)
              setCachedData(currentWsId, roomsCacheKey, mappedRooms)
            }
          }

          // 2. โหลดบิลจากระบบ
          const billsCacheKey = "bills_all"
          const cachedBills = getCachedData<any[]>(currentWsId, billsCacheKey)
          if (cachedBills) {
            const mappedBills: BillItem[] = cachedBills.map((b: any) => ({
              id: b.id,
              roomNumber: b.roomNumber,
              tenantName: b.tenantName || "ผู้เช่า",
              amount: Number(b.amount),
              status: b.status as "unpaid" | "pending" | "paid",
              billingCycle: b.billingCycle,
              slipUrl: b.slipUrl || null,
              electricUnits: Number(b.electricUnits || 0),
              waterUnits: Number(b.waterUnits || 0)
            }))
            setBills(mappedBills)
          } else {
            const billsRes = await getBills()
            if (billsRes.success && billsRes.data) {
              const mappedBills: BillItem[] = billsRes.data.map((b: any) => ({
                id: b.id,
                roomNumber: b.roomNumber,
                tenantName: b.tenantName || "ผู้เช่า",
                amount: Number(b.amount),
                status: b.status as "unpaid" | "pending" | "paid",
                billingCycle: b.billingCycle,
                slipUrl: b.slipUrl || null,
                electricUnits: Number(b.electricUnits || 0),
                waterUnits: Number(b.waterUnits || 0)
              }))
              setBills(mappedBills)
              setCachedData(currentWsId, billsCacheKey, billsRes.data)
            }
          }

          // 3. โหลดค่าใช้จ่าย
          await loadExpensesData(taxYear, currentWsId)
        }
      } catch (err) {
        console.error("Failed to load initial data in tax page:", err)
      }
    }

    loadInitialData()
  }, [taxYear])

  // ฟังก์ชันโหลดข้อมูลค่าใช้จ่ายจาก DB
  const loadExpensesData = async (year: string, explicitWsId?: string, forceRefresh = false) => {
    setLoadingExpenses(true)
    try {
      let activeWsId = explicitWsId
      if (!activeWsId) {
        const userRes = await getCurrentUserProfileClient()
        if (userRes.success && userRes.data) {
          const isSuperAdmin = userRes.data.role === "super_admin"
          if (!isSuperAdmin && userRes.data.workspace_id) {
            activeWsId = userRes.data.workspace_id
          } else {
            const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
            activeWsId = cookieWsId || userRes.data.workspace_id || undefined
          }
        }
      }
      
      if (activeWsId && !forceRefresh) {
        const cached = getCachedData<ExpenseItem[]>(activeWsId, `expenses_${year}`)
        if (cached) {
          setExpenses(cached)
          
          const sum405 = cached
            .filter(e => e.category === "40_5")
            .reduce((sum, e) => sum + e.amount, 0)
          
          const sum408 = cached
            .filter(e => e.category === "40_8")
            .reduce((sum, e) => sum + e.amount, 0)
            
          setDbActualExpense405(sum405)
          setDbActualExpense408(sum408)
          
          // อัปเดตตัวแปรจริงที่ใช้คำนวณแบบเรียลไทม์
          setActualExpense405(sum405)
          setActualExpense408(sum408)
          setLoadingExpenses(false)
          return
        }
      }
      
      const res = await getExpenses(year, activeWsId)
      if (res.success && res.data) {
        setExpenses(res.data)
        if (activeWsId) {
          setCachedData(activeWsId, `expenses_${year}`, res.data)
        }
        
        const sum405 = res.data
          .filter(e => e.category === "40_5")
          .reduce((sum, e) => sum + e.amount, 0)
        
        const sum408 = res.data
          .filter(e => e.category === "40_8")
          .reduce((sum, e) => sum + e.amount, 0)
          
        setDbActualExpense405(sum405)
        setDbActualExpense408(sum408)
        
        // อัปเดตตัวแปรจริงที่ใช้คำนวณแบบเรียลไทม์
        setActualExpense405(sum405)
        setActualExpense408(sum408)
      }
    } catch (e) {
      console.error("Failed to load expenses:", e)
    } finally {
      setLoadingExpenses(false)
    }
  }

  // รีโหลดข้อมูลทุกครั้งที่เปลี่ยนปีภาษี
  useEffect(() => {
    loadExpensesData(taxYear)
  }, [taxYear])

  // จัดการฟอร์มบันทึกค่าใช้จ่าย
  const handleOpenAddExpense = () => {
    setEditingExpense(null)
    setExpenseTitle("")
    setExpenseAmount("")
    setExpenseCategory("40_5")
    setExpenseError(null)
    setExpenseModalOpen(true)
  }

  const handleOpenEditExpense = (expense: ExpenseItem) => {
    setEditingExpense(expense)
    setExpenseTitle(expense.title)
    setExpenseAmount(expense.amount)
    setExpenseCategory(expense.category)
    setExpenseError(null)
    setExpenseModalOpen(true)
  }

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseTitle.trim()) {
      setExpenseError("กรุณากรอกชื่อรายการค่าใช้จ่าย")
      return
    }
    const amt = Number(expenseAmount)
    if (isNaN(amt) || amt <= 0) {
      setExpenseError("กรุณากรอกจำนวนเงินให้ถูกต้องและมากกว่า 0 บาท")
      return
    }

    setExpenseSubmitting(true)
    setExpenseError(null)

    try {
      let res
      if (editingExpense) {
        res = await updateExpense(
          editingExpense.id,
          expenseTitle.trim(),
          amt,
          taxYear,
          expenseCategory
        )
      } else {
        res = await createExpense(
          expenseTitle.trim(),
          amt,
          taxYear,
          expenseCategory
        )
      }

      if (res.success) {
        setExpenseModalOpen(false)
        const userRes = await getCurrentUserProfileClient()
        if (userRes.success && userRes.data) {
          const isSuperAdmin = userRes.data.role === "super_admin"
          const activeWsId = isSuperAdmin 
            ? (getCookie("horset_current_workspace_id") || userRes.data.workspace_id)
            : userRes.data.workspace_id
          if (activeWsId) {
            clearWorkspaceCache(activeWsId)
          }
        }
        await loadExpensesData(taxYear, undefined, true)
      } else {
        setExpenseError(res.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล")
      }
    } catch (err) {
      setExpenseError("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์")
    } finally {
      setExpenseSubmitting(false)
    }
  }

  const handleDeleteExpense = async (id: string, title: string) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการ "${title}"?`)) return

    setLoadingExpenses(true)
    try {
      const res = await deleteExpense(id)
      if (res.success) {
        const userRes = await getCurrentUserProfileClient()
        if (userRes.success && userRes.data) {
          const isSuperAdmin = userRes.data.role === "super_admin"
          const activeWsId = isSuperAdmin 
            ? (getCookie("horset_current_workspace_id") || userRes.data.workspace_id)
            : userRes.data.workspace_id
          if (activeWsId) {
            clearWorkspaceCache(activeWsId)
          }
        }
        await loadExpensesData(taxYear, undefined, true)
      } else {
        alert(res.error || "เกิดข้อผิดพลาดในการลบรายการ")
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์")
    } finally {
      setLoadingExpenses(false)
    }
  }



  // บันทึกการตั้งค่าเมื่อมีการเปลี่ยนแปลง
  const handleDataSourceChange = (val: "system" | "manual") => {
    setDataSource(val)
  }

  const handleManualRentChange = (val: number) => {
    setManualRent405(val)
  }

  const handleManualUtilChange = (val: number) => {
    setManualUtilities408(val)
  }

  const handleManualOtherChange = (val: number) => {
    setManualOther408(val)
  }

  const handleDeductionMethodChange = (val: "เหมา 30%" | "ตามจริง") => {
    setDeductionMethod405(val)
  }

  const handleDeductionMethod408Change = (val: "เหมา 60%" | "ตามจริง") => {
    setDeductionMethod408(val)
  }

  const handleActualExpense405Change = (val: number) => {
    setActualExpense405(val)
  }

  const handleActualExpense408Change = (val: number) => {
    setActualExpense408(val)
  }

  // คำนวณรายได้จากบิลจริงแยกประเภทตามเกณฑ์สรรพากรใหม่
  // 1. ค่าเช่า 40(5) คือเฉพาะ ค่าเช่าห้องพักหลัก (baseRent)
  // 2. ค่าน้ำไฟ/บริการ 40(8) คือ ยูนิตน้ำไฟ + ค่าบริการส่วนกลางคงที่
  // 3. รายได้อื่นๆ 40(8) (ไม่เข้าเกณฑ์หักเหมา) คือ ค่าปรับจ่ายล่าช้า หรือค่าบริการพิเศษอื่นๆ

  // คัดกรองบิลตามปีภาษีที่เลือกและสถานะที่ชำระเงินแล้ว
  const paidBillsInYear = bills.filter(bill => {
    const isPaid = bill.status === "paid"
    const matchesYear = bill.billingCycle && bill.billingCycle.startsWith(taxYear)
    return isPaid && matchesYear
  })

  // คำนวณรายได้จากบิลจริง
  let calculatedRent405Full = 0
  let calculatedUtilities408Full = 0
  let calculatedOther408Full = 0
  
  let calculatedRent405Half = 0
  let calculatedUtilities408Half = 0
  let calculatedOther408Half = 0

  paidBillsInYear.forEach(bill => {
    const electricUnits = Number(bill.electricUnits || 0)
    const waterUnits = Number(bill.waterUnits || 0)
    
    const elecAmount = electricUnits * electricRate
    const waterAmount = waterUnits * waterRate
    
    // ค่าน้ำไฟ/บริการ 40(8) = ค่ายูนิตน้ำ + ค่ายูนิตไฟ + ค่าส่วนกลาง
    const utilitiesAmount = elecAmount + waterAmount + commonFee
    
    const billAmount = Number(bill.amount || 0)
    
    // ค้นหาค่าเช่าห้องพักหลัก (baseRent) จากข้อมูลห้อง หรือใช้ส่วนต่างบิลหักน้ำไฟส่วนกลางเป็นทางเลือกสุดท้าย
    const matchedRoom = rooms.find(r => r.roomNumber === bill.roomNumber)
    const baseRentVal = matchedRoom ? matchedRoom.baseRent : Math.max(0, billAmount - utilitiesAmount)
    
    // ค่าเช่า 40(5) = เฉพาะค่าเช่าห้องพักหลัก
    const rentAmount = Math.max(0, Math.min(baseRentVal, billAmount))
    
    // รายได้อื่นๆ 40(8) (ไม่หักเหมา) = ยอดชำระสุทธิ - ค่าเช่าห้อง - ค่าน้ำไฟ/บริการส่วนกลาง (เช่น เงินปรับล่าช้า / มัดจำ)
    const otherAmount = Math.max(0, billAmount - rentAmount - utilitiesAmount)

    calculatedRent405Full += rentAmount
    calculatedUtilities408Full += utilitiesAmount
    calculatedOther408Full += otherAmount

    // ครึ่งปีแรก (เดือน 01 - 06)
    const cycleParts = bill.billingCycle.split("-")
    const monthNum = cycleParts[1] ? parseInt(cycleParts[1], 10) : 0
    if (monthNum >= 1 && monthNum <= 6) {
      calculatedRent405Half += rentAmount
      calculatedUtilities408Half += utilitiesAmount
      calculatedOther408Half += otherAmount
    }
  })

  const hasPaidBills = paidBillsInYear.length > 0

  // =========================================================================
  // LOGIC คำนวณค่าเช่าล่วงหน้า และ เงินประกันยกเลิกสัญญา
  // =========================================================================

  // 1. ค่าเช่าล่วงหน้า (มาตรา 40(5)): วิ่งไปบวกใน 40(5) ของปีนั้นๆ ทันทีตามปี พ.ศ. ที่เริ่มสัญญา
  const advanceRentBills = tenants.filter(t => {
    if (!t.contractStart) return false
    const parts = t.contractStart.split("-")
    return parts[0] === taxYear
  })
  
  // คำนวณรายหัว: จำนวนเดือน * ค่าเช่าของห้องนั้นๆ
  const totalAdvanceRentAmount = advanceRentBills.reduce((sum, t) => {
    const matchedRoom = rooms.find(r => r.roomNumber === t.roomNumber)
    const roomRent = matchedRoom ? matchedRoom.baseRent : 0
    return sum + (roomRent * defaultAdvanceRent)
  }, 0)

  // ครึ่งปีแรก (สัญญาเริ่มเดือน 01 - 06)
  const advanceRentBillsHalf = advanceRentBills.filter(t => {
    const parts = t.contractStart.split("-")
    const month = parts[1] ? parseInt(parts[1], 10) : 0
    return month >= 1 && month <= 6
  })
  const totalAdvanceRentAmountHalf = advanceRentBillsHalf.reduce((sum, t) => {
    const matchedRoom = rooms.find(r => r.roomNumber === t.roomNumber)
    const roomRent = matchedRoom ? matchedRoom.baseRent : 0
    return sum + (roomRent * defaultAdvanceRent)
  }, 0)

  // 2. เงินประกันริบ (มาตรา 40(8)): เมื่อยกเลิกสัญญา คำนวณ [มัดจำ - เงินคืนจริง] = ยอดริบ และนำไปบวกเป็นรายได้ในปีที่ยกเลิกสัญญา
  const cancelledInYear = cancelledContracts.filter(c => {
    if (!c.cancellationDate) return false
    const parts = c.cancellationDate.split("-")
    return parts[0] === taxYear
  })
  const totalForfeitedAmount = cancelledInYear.reduce((sum, c) => sum + Number(c.forfeitedAmount || 0), 0)

  // ครึ่งปีแรก (ยกเลิกสัญญาช่วงเดือน 01 - 06)
  const cancelledInYearHalf = cancelledInYear.filter(c => {
    const parts = c.cancellationDate.split("-")
    const month = parts[1] ? parseInt(parts[1], 10) : 0
    return month >= 1 && month <= 6
  })
  const totalForfeitedAmountHalf = cancelledInYearHalf.reduce((sum, c) => sum + Number(c.forfeitedAmount || 0), 0)

  // 1. รายได้รวมมาตรา 40(5) (เฉพาะค่าเช่าห้องพักหลัก) + ยอดค่าเช่าล่วงหน้า
  const rent405Full = (dataSource === "system" && hasPaidBills
    ? calculatedRent405Full
    : (dataSource === "system" ? 0 : manualRent405)) + totalAdvanceRentAmount

  // 2. รายได้รวมมาตรา 40(8) (ค่าน้ำไฟ/บริการส่วนกลาง)
  const utilities408Full = dataSource === "system" && hasPaidBills
    ? calculatedUtilities408Full
    : (dataSource === "system" ? 0 : manualUtilities408)

  // 3. รายได้รวมอื่นๆ มาตรา 40(8) (เงินปรับจ่ายล่าช้า / ยอดริบมัดจำ - ไม่เข้าเกณฑ์หักเหมา)
  const other408Full = (dataSource === "system" && hasPaidBills
    ? calculatedOther408Full
    : (dataSource === "system" ? 0 : manualOther408)) + totalForfeitedAmount

  // ครึ่งปี
  const rent405Half = (dataSource === "system" && hasPaidBills
    ? calculatedRent405Half
    : (dataSource === "system" ? 0 : manualRent405 / 2)) + totalAdvanceRentAmountHalf

  const utilities408Half = dataSource === "system" && hasPaidBills
    ? calculatedUtilities408Half
    : (dataSource === "system" ? 0 : manualUtilities408 / 2)

  const other408Half = (dataSource === "system" && hasPaidBills
    ? calculatedOther408Half
    : (dataSource === "system" ? 0 : manualOther408 / 2)) + totalForfeitedAmountHalf

  // การคำนวณหักค่าใช้จ่ายสำหรับ 40(5)
  // เต็มปี
  const getDeduction405Full = () => {
    if (deductionMethod405 === "เหมา 30%") return rent405Full * 0.30
    return actualExpense405
  }
  const deductionRent405Full = getDeduction405Full()

  // ครึ่งปี
  const getDeduction405Half = () => {
    if (deductionMethod405 === "เหมา 30%") return rent405Half * 0.30
    return actualExpense405 / 2
  }
  const deductionRent405Half = getDeduction405Half()

  // การคำนวณหักค่าใช้จ่ายสำหรับ 40(8) (เหมา 60% เฉพาะส่วนบริการน้ำไฟ หรือหักตามจริง)
  const getDeduction408Full = () => {
    if (deductionMethod408 === "เหมา 60%") return utilities408Full * 0.60 // รายได้อื่นๆ หักเหมาได้ 0% ตามเงื่อนไขสรรพากร
    return actualExpense408
  }
  const deductionUtilities408Full = getDeduction408Full()

  const getDeduction408Half = () => {
    if (deductionMethod408 === "เหมา 60%") return utilities408Half * 0.60
    return actualExpense408 / 2
  }
  const deductionUtilities408Half = getDeduction408Half()

  // รายได้สุทธิประเมิน
  const fullTotalRevenue = rent405Full + utilities408Full + other408Full
  const netIncomeFull = fullTotalRevenue - (deductionRent405Full + deductionUtilities408Full)

  const halfTotalRevenue = rent405Half + utilities408Half + other408Half
  const netIncomeHalf = halfTotalRevenue - (deductionRent405Half + deductionUtilities408Half)

  const handleExport = () => {
    alert("ระบบกำลังสร้างไฟล์รายงาน Excel รายละเอียดรายรับ-รายจ่ายของปีภาษี " + taxYear + " เพื่อประกอบการยื่นแบบภาษี")
  }

  const handleDownloadPdf = async (type: "90" | "94") => {
    setLoadingPdf(type)
    try {
      const { generatePndPdf } = await import("@/lib/pdfHelper")
      const blob = await generatePndPdf(type, {
        firstName,
        lastName,
        taxId,
        address,
        phone,
        rent405: type === "90" ? rent405Full : rent405Half * 2,
        deductionRent405: type === "90" ? deductionRent405Full : deductionRent405Half,
        utilities408: type === "90" ? (utilities408Full + other408Full) : (utilities408Half + other408Half) * 2,
        deductionUtilities408: type === "90" ? deductionUtilities408Full : deductionUtilities408Half,
        netIncome: type === "90" ? netIncomeFull : netIncomeHalf,
        taxYear,
      })
      
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `pnd${type}_${taxYear}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      console.error(e)
      alert("เกิดข้อผิดพลาดในการโหลดแบบฟอร์ม PDF กรุณาตรวจสอบว่าคุณตั้งค่าการเงินและอินเทอร์เน็ตใช้งานได้ตามปกติ")
    } finally {
      setLoadingPdf(null)
    }
  }

  // ลิสต์แสดงรายเดือน
  const monthsList = [
    { num: "01", name: "มกราคม" },
    { num: "02", name: "กุมภาพันธ์" },
    { num: "03", name: "มีนาคม" },
    { num: "04", name: "เมษายน" },
    { num: "05", name: "พฤษภาคม" },
    { num: "06", name: "มิถุนายน" },
    { num: "07", name: "กรกฎาคม" },
    { num: "08", name: "สิงหาคม" },
    { num: "09", name: "กันยายน" },
    { num: "10", name: "ตุลาคม" },
    { num: "11", name: "พฤศจิกายน" },
    { num: "12", name: "ธันวาคม" },
  ]

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">สรุปข้อมูลเพื่อการยื่นภาษีเงินได้</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">คัดแยกรายได้อพาร์ทเมนท์ตามกฎหมายสรรพากรไทย ภ.ง.ด. 94 และ ภ.ง.ด. 90</p>
        </div>
        
        <div className="flex gap-3">
          <select
            className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-sm"
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
          >
            <option value="2026">ปีภาษี 2026</option>
            <option value="2025">ปีภาษี 2025</option>
          </select>
          
          <button
            onClick={handleExport}
            className="glow-btn bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 text-xs shadow-lg shadow-blue-600/10"
          >
            <Download className="w-4 h-4" /> ส่งออกรายงานสรุป
          </button>
        </div>
      </div>

      {/* คำเตือนความรับผิดชอบทางกฎหมาย */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">⚠️ ข้อสงวนสิทธิ์ทางกฎหมาย (Legal Disclaimer)</p>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            ข้อมูลการคำนวณและรายงานตัวเลขรายได้ในหน้านี้ จัดทำขึ้นเพื่อใช้เป็นข้อมูลอ้างอิงเบื้องต้นในการคำนวณภาษีเท่านั้น ผู้ใช้งานต้องนำส่งแบบฟอร์มภาษีและตรวจสอบเอกสารความถูกต้องด้วยตนเองผ่านช่องทางระบบอย่างเป็นทางการของกรมสรรพากรอีกครั้ง
          </p>
        </div>
      </div>

      {/* ส่วนตั้งค่าแหล่งข้อมูลการคำนวณและลดหย่อนภาษี */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* คอนฟิกแหล่งข้อมูล */}
        <div className="glass-card p-6 rounded-2xl border border-slate-200 dark:border-slate-900/60 space-y-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-100 dark:border-slate-900 pb-3">
            <Database className="w-4 h-4 text-blue-500" /> แหล่งข้อมูลรายได้ภาษี
          </h3>
          
          <div className="space-y-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleDataSourceChange("system")}
                className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-2 ${
                  dataSource === "system"
                    ? "bg-blue-50 dark:bg-blue-600/10 border-blue-500 text-blue-600 dark:text-blue-400"
                    : "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <Database className="w-3.5 h-3.5" /> ดึงข้อมูลอัตโนมัติจากระบบ
              </button>
              <button
                type="button"
                onClick={() => handleDataSourceChange("manual")}
                className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-2 ${
                  dataSource === "manual"
                    ? "bg-blue-50 dark:bg-blue-600/10 border-blue-500 text-blue-600 dark:text-blue-400"
                    : "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <Settings className="w-3.5 h-3.5" /> กำหนดตัวเลขเอง
              </button>
            </div>

            {dataSource === "system" ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-900 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">สถานะดึงข้อมูลบิล:</span>
                  {hasPaidBills ? (
                    <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 font-semibold bg-teal-50 dark:bg-teal-500/10 px-2 py-0.5 rounded-full text-[10px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" /> ดึงข้อมูลจริงจากระบบสำเร็จ ({paidBillsInYear.length} บิล)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full text-[10px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> ไม่พบประวัติบิลชำระเงิน (ยังไม่มีบิลชำระในปีนี้)
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {hasPaidBills 
                    ? `ระบบทำการรวมรายได้จากบิลค่าเช่าในระบบที่เปลี่ยนสถานะเป็น "ชำระแล้ว" ในปี ${taxYear} โดยคำนวณแยกตามมิเตอร์และค่าเช่าสุทธิ`
                    : `ไม่พบประวัติบิลที่ชำระเงินในปี ${taxYear} ระบบจึงแสดงยอดรายได้พึงประเมินเป็น 0 บาท ท่านสามารถบันทึกบิลชำระเงินในระบบเพื่ออัปเดตยอดจริง หรือเปลี่ยนเป็นโหมด "กำหนดตัวเลขเอง" ด้านบน`
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-650 dark:text-slate-400 font-medium">ป้อนรายได้เช่า 40(5) ทั้งปี (บาท)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 text-xs font-mono"
                    value={manualRent405}
                    onChange={(e) => handleManualRentChange(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-650 dark:text-slate-400 font-medium">ป้อนรายได้สาธารณูปโภค 40(8) ทั้งปี (บาท)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 text-xs font-mono"
                    value={manualUtilities408}
                    onChange={(e) => handleManualUtilChange(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-650 dark:text-slate-400 font-medium">ป้อนรายได้อื่นๆ 40(8) ทั้งปี (บาท)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 dark:text-slate-200 text-xs font-mono"
                    value={manualOther408}
                    onChange={(e) => handleManualOtherChange(Number(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* คอนฟิกค่าใช้จ่ายและการหักค่าใช้จ่าย */}
        <div className="glass-card p-6 rounded-2xl border border-slate-200 dark:border-slate-900/60 space-y-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-100 dark:border-slate-900 pb-3">
            <Sliders className="w-4 h-4 text-teal-500" /> การคำนวณหักค่าใช้จ่ายทางภาษี
          </h3>
          
          <div className="space-y-4">
            {/* 40(5) Deduction Select */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-650 dark:text-slate-400 font-medium">รูปแบบการหักรายจ่ายของ ค่าเช่า 40(5)</label>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full font-semibold">มาตรา 40(5)</span>
              </div>
              <div className="flex gap-2">
                {(["เหมา 30%", "ตามจริง"] as const).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => handleDeductionMethodChange(method)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                      deductionMethod405 === method
                        ? "bg-teal-50 dark:bg-teal-600/10 border-teal-500 text-teal-600 dark:text-teal-400"
                        : "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    {method === "เหมา 30%" ? "หักเหมา 30%" : "หักตามจริง"}
                  </button>
                ))}
              </div>
              
              {deductionMethod405 === "ตามจริง" && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">ค่าใช้จ่ายจริงในการดำเนินงานเช่าหอพักสะสมต่อปี (บาท)</label>
                  <div className="relative">
                    <input
                      type="number"
                      readOnly
                      placeholder="ระบบคำนวณจากบันทึกค่าใช้จ่าย 40(5) ด้านล่าง..."
                      className="w-full pl-3 pr-24 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-xl text-slate-650 dark:text-slate-400 text-xs font-mono cursor-not-allowed"
                      value={actualExpense405}
                    />
                    <button
                      type="button"
                      onClick={() => loadExpensesData(taxYear, undefined, true)}
                      disabled={loadingExpenses}
                      className="absolute right-2 top-1.5 inline-flex items-center gap-1 text-[9px] text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 hover:bg-teal-100 dark:hover:bg-teal-500/20 px-2 py-1 rounded font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95 animate-fade-in"
                      title="คลิกเพื่อดึงข้อมูลจากตารางบันทึกค่าใช้จ่ายล่าสุด"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${loadingExpenses ? "animate-spin" : ""}`} />
                      ดึงอัตโนมัติ
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    * ยอดรวมมาจากการบันทึกรายจ่ายจริงในตารางด้านล่าง กรุณาเพิ่มรายการเพื่ออัปเดตยอดหักลดหย่อน
                  </p>
                </div>
              )}
            </div>

            {/* 40(8) Deduction Select */}
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-900/60 pt-3">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-650 dark:text-slate-400 font-medium">รูปแบบการหักรายจ่ายของ ค่าน้ำไฟ/บริการ 40(8)</label>
                <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full font-semibold">มาตรา 40(8)</span>
              </div>
              <div className="flex gap-2">
                {(["เหมา 60%", "ตามจริง"] as const).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => handleDeductionMethod408Change(method)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                      deductionMethod408 === method
                        ? "bg-teal-50 dark:bg-teal-600/10 border-teal-500 text-teal-600 dark:text-teal-400"
                        : "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    {method === "เหมา 60%" ? "หักเหมา 60%" : "หักตามจริง"}
                  </button>
                ))}
              </div>
              
              {deductionMethod408 === "ตามจริง" && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">ค่าใช้จ่ายจริงที่เกิดขึ้นของค่าน้ำไฟ/บริการ 40(8) ทั้งปี (บาท)</label>
                  <div className="relative">
                    <input
                      type="number"
                      readOnly
                      placeholder="ระบบคำนวณจากบันทึกค่าใช้จ่าย 40(8) ด้านล่าง..."
                      className="w-full pl-3 pr-24 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-xl text-slate-650 dark:text-slate-400 text-xs font-mono cursor-not-allowed"
                      value={actualExpense408}
                    />
                    <button
                      type="button"
                      onClick={() => loadExpensesData(taxYear, undefined, true)}
                      disabled={loadingExpenses}
                      className="absolute right-2 top-1.5 inline-flex items-center gap-1 text-[9px] text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 hover:bg-teal-100 dark:hover:bg-teal-500/20 px-2 py-1 rounded font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95 animate-fade-in"
                      title="คลิกเพื่อดึงข้อมูลจากตารางบันทึกค่าใช้จ่ายล่าสุด"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${loadingExpenses ? "animate-spin" : ""}`} />
                      ดึงอัตโนมัติ
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    * ยอดรวมมาจากการบันทึกรายจ่ายจริงในตารางด้านล่าง กรุณาเพิ่มรายการเพื่ออัปเดตยอดหักลดหย่อน
                  </p>
                </div>
              )}
              {deductionMethod408 === "เหมา 60%" && (
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  * ระบบทำการคำนวณหักรายจ่ายแบบเหมาในอัตรา 60% ของรายได้พึงประเมินมาตรา 40(8) ทั้งหมด
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* การแบ่งประเภทรายได้และเปรียบเทียบการหักลดหย่อน */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* รายได้ประเภทที่ 40(5) */}
        <div className="glass-card p-6 rounded-2xl border border-slate-200 dark:border-slate-900/60 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400">มาตรา 40(5)</span>
              <Landmark className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">รายได้ค่าเช่าห้องพัก</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">เฉพาะส่วนที่เป็นค่าเช่าห้องพักหลัก</p>
              <p className="text-xl font-bold mt-2 text-slate-800 dark:text-slate-100">{rent405Full.toLocaleString()} บาท</p>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed space-y-1 mt-auto pt-2">
            <p>เงินได้ประเภทนี้สามารถหักค่าใช้จ่ายตามแบบที่เลือก:</p>
            <div className="bg-slate-50 dark:bg-slate-950/40 p-2 rounded-lg border border-slate-200 dark:border-slate-900 text-slate-700 dark:text-slate-300 font-medium">
              หักแบบ{deductionMethod405} : <span className="text-blue-600 dark:text-blue-400 font-bold">{deductionRent405Full.toLocaleString()} บาท</span>
            </div>
          </div>
        </div>

        {/* รายได้ประเภทที่ 40(8) */}
        <div className="glass-card p-6 rounded-2xl border border-slate-200 dark:border-slate-900/60 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400">มาตรา 40(8)</span>
              <Zap className="w-5 h-5 text-teal-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">ค่าน้ำไฟและบริการ</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ค่ายูนิตน้ำ/ไฟ + ค่าบริการส่วนกลาง</p>
              <p className="text-xl font-bold mt-2 text-slate-800 dark:text-slate-100">{utilities408Full.toLocaleString()} บาท</p>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed space-y-1 mt-auto pt-2">
            <p>เงินได้ประเภทนี้สามารถหักค่าใช้จ่ายตามแบบที่เลือก:</p>
            <div className="bg-slate-50 dark:bg-slate-950/40 p-2 rounded-lg border border-slate-200 dark:border-slate-900 text-slate-700 dark:text-slate-300 font-medium">
              หักแบบ{deductionMethod408} : <span className="text-teal-600 dark:text-teal-400 font-bold">{deductionUtilities408Full.toLocaleString()} บาท</span>
            </div>
          </div>
        </div>

        {/* รายได้ประเภทที่ 40(8) อื่นๆ (ไม่หักเหมา) */}
        <div className="glass-card p-6 rounded-2xl border border-slate-200 dark:border-slate-900/60 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400">ม. 40(8) อื่นๆ (ไม่หักเหมา)</span>
              <Coins className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">รายได้อื่น (ค่าปรับ/ริบมัดจำ)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">เงินปรับจ่ายล่าช้า หรือเงินริบมัดจำ</p>
              <p className="text-xl font-bold mt-2 text-slate-800 dark:text-slate-100">{other408Full.toLocaleString()} บาท</p>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed space-y-1 mt-auto pt-2">
            <p>ไม่เข้าเกณฑ์หักเหมา 60% (หักแบบเหมาเป็น 0):</p>
            <div className="bg-slate-50 dark:bg-slate-950/40 p-2 rounded-lg border border-slate-200 dark:border-slate-900 text-slate-700 dark:text-slate-300 font-medium">
              {deductionMethod408 === "เหมา 60%" ? (
                <span>หักแบบเหมา 60% : <span className="text-amber-600 dark:text-amber-400 font-bold">0 บาท</span></span>
              ) : (
                <span>หักตามจ่ายจริง : <span className="text-teal-600 dark:text-teal-400 font-bold">ใช้สิทธิ์ตามจ่ายจริง</span></span>
              )}
            </div>
          </div>
        </div>

        {/* รายจ่ายจริงสะสม */}
        <div className="glass-card p-6 rounded-2xl border border-slate-200 dark:border-slate-900/60 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">รายจ่ายสะสม</span>
              <Calculator className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">รายจ่ายรวมหักลดหย่อน</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">รวมค่าใช้จ่ายหักเหมาหรือหักจริง</p>
              <p className="text-xl font-bold mt-2 text-emerald-600 dark:text-emerald-400">{(deductionRent405Full + deductionUtilities408Full).toLocaleString()} บาท</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-auto pt-2">
            เป็นการรวมยอดค่าลดหย่อนภาษีของค่าเช่าห้อง ({deductionRent405Full.toLocaleString()} บ.) และค่าน้ำไฟหลวง/บริการ ({deductionUtilities408Full.toLocaleString()} บ.)
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. ระบบบันทึกค่าใช้จ่ายและคู่มือคำแนะนำทางภาษี */}
      {/* ========================================================================= */}
      <div className="space-y-6">
        {/* ส่วนคู่มือแนะนำ (Recommendation Guide) */}
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-900 pb-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-500" />
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">คู่มือแนะนำ: การเลือกประเภทรายจ่ายตามหลักสรรพากร</h3>
                <p className="text-[10px] text-slate-550 dark:text-slate-400 mt-0.5">เลือกประเภทค่าใช้จ่ายอย่างถูกต้อง เพื่อลดหย่อนภาษีสูงสุดและป้องกันการตรวจสอบย้อนหลัง</p>
              </div>
            </div>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="p-1.5 bg-slate-100 dark:bg-slate-900/40 hover:bg-slate-200 dark:hover:bg-slate-900 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors text-xs flex items-center gap-1 cursor-pointer"
            >
              {showGuide ? (
                <>ซ่อนคู่มือ <ChevronUp className="w-3.5 h-3.5" /></>
              ) : (
                <>แสดงคู่มือ <ChevronDown className="w-3.5 h-3.5" /></>
              )}
            </button>
          </div>

          {showGuide && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-scale-up">
              {/* รายจ่าย 40(5) */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs">
                  <Landmark className="w-4 h-4" /> มาตรา 40(5) (ค่าเช่าตึก / โครงสร้าง)
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  เป็นรายจ่ายที่เกี่ยวเนื่องโดยตรงกับ **ตัวโครงสร้างอาคารและสิทธิ์ในการจัดหาอพาร์ทเมนท์** เหมาะสำหรับธุรกิจเช่าห้องพักที่เลือกหักค่าใช้จ่าย "ตามจริง"
                </p>
                <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-900">
                  <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300">✅ รายการที่หักภาษีได้:</div>
                  <ul className="space-y-1 text-[10px] text-slate-600 dark:text-slate-400 list-disc pl-4 leading-relaxed">
                    <li><strong className="text-slate-700 dark:text-slate-300">ค่าซ่อมแซมใหญ่โครงสร้าง:</strong> เช่น ทาสีอาคารใหม่ทั้งหมด, เปลี่ยนหลังคาป้องกันน้ำรั่วซึม, งานซ่อมแซมโครงสร้างตึก</li>
                    <li><strong className="text-slate-700 dark:text-slate-300">ดอกเบี้ยกู้ยืม:</strong> ดอกเบี้ยธนาคารสำหรับวงเงินกู้ซื้อที่ดินหรือก่อสร้างอาคารหอพัก</li>
                    <li><strong className="text-slate-700 dark:text-slate-300">ภาษีที่เกี่ยวข้อง:</strong> ภาษีที่ดินและสิ่งปลูกสร้างที่เจ้าของกิจการชำระให้ท้องถิ่น</li>
                    <li><strong className="text-slate-700 dark:text-slate-300">เบี้ยประกันภัย:</strong> ค่าเบี้ยประกันอัคคีภัย ประกันภัยพิบัติของสิ่งปลูกสร้าง</li>
                    <li><strong className="text-slate-700 dark:text-slate-300">ค่าเสื่อมราคาอาคาร:</strong> การหักค่าเสื่อมราคาสิ่งปลูกสร้างรายปีทางบัญชี</li>
                  </ul>
                </div>
                <div className="p-2 bg-blue-50 dark:bg-blue-500/5 rounded text-[10px] text-blue-700 dark:text-blue-300 flex gap-1.5 items-start">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span><strong>คำแนะนำ:</strong> เลือกข้อนี้เมื่อใช้จ่ายกับ "ตึกหรืองานก่อสร้างถาวร" ที่มีใบเสร็จ/ใบกำกับภาษีเต็มรูปแบบในนามกิจการ</span>
                </div>
              </div>

              {/* รายจ่าย 40(8) */}
              <div className="p-4 bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-xs">
                  <Zap className="w-4 h-4" /> มาตรา 40(8) (ค่าน้ำไฟ / งานบริการ)
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  เป็นรายจ่ายที่เกี่ยวกับ **การให้บริการสาธารณูปโภคและอำนวยความสะดวก** แก่ผู้เช่า (กฎหมายสรรพากรบังคับให้รายรับน้ำไฟต้องยื่นแบบหักตามจริงเท่านั้น)
                </p>
                <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-900">
                  <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300">✅ รายการที่หักภาษีได้:</div>
                  <ul className="space-y-1 text-[10px] text-slate-600 dark:text-slate-400 list-disc pl-4 leading-relaxed">
                    <li><strong className="text-slate-700 dark:text-slate-300">ค่าน้ำไฟหลวง:</strong> บิลค่าน้ำประปาและค่าไฟฟ้าที่จ่ายตรงให้กับการไฟฟ้า/การประปาของหอพัก</li>
                    <li><strong className="text-slate-700 dark:text-slate-300">ค่าซ่อมระบบบริการ:</strong> ซ่อมมิเตอร์น้ำไฟเสีย, ซ่อมท่อประปาแตกในตึก, เดินสายไฟทางเดินใหม่</li>
                    <li><strong className="text-slate-700 dark:text-slate-300">ค่าจ้างพนักงาน:</strong> ค่าแรงแม่บ้านทำความสะอาดทางเดินส่วนกลาง, ช่างประจำตึก, ค่าแรงคนจดมิเตอร์</li>
                    <li><strong className="text-slate-700 dark:text-slate-300">ค่าอินเทอร์เน็ต:</strong> บิลค่าเน็ตรายเดือนที่แชร์ให้ผู้เช่าใช้งานทั้งอพาร์ทเมนท์</li>
                    <li><strong className="text-slate-700 dark:text-slate-300">ค่าอุปกรณ์บริการ:</strong> ซื้อหลอดไฟทางเดินส่วนกลาง, ซื้อปั๊มน้ำใหม่ทดแทนตัวเก่า</li>
                  </ul>
                </div>
                <div className="p-2 bg-teal-50 dark:bg-teal-500/5 rounded text-[10px] text-teal-700 dark:text-teal-300 flex gap-1.5 items-start">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span><strong>คำแนะนำ:</strong> เลือกข้อนี้สำหรับการดูแลน้ำไฟ สื่อสาร หรือความสะอาด ซึ่งเป็นรายจ่ายหมวนเวียนเพื่อการบริการ</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ตารางและเครื่องมือจัดการรายจ่าย (Expense Tracker) */}
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-500" /> สมุดบันทึกรายจ่ายจริงประจำปีภาษี {taxYear}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">บันทึกค่าใช้จ่ายสะสมเพื่อนำไปหักลดหย่อนภาษีตามจริงโดยอิงหลักฐานเอกสาร</p>
            </div>
            
            <button
              onClick={handleOpenAddExpense}
              className="glow-btn bg-teal-600 hover:bg-teal-500 text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 text-xs shadow-lg shadow-teal-600/10 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" /> บันทึกค่าใช้จ่ายใหม่
            </button>
          </div>

          {loadingExpenses ? (
            <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2 justify-center">
              <div className="w-5 h-5 border-2 border-slate-700 border-t-teal-500 rounded-full animate-spin" />
              กำลังโหลดข้อมูลรายจ่าย...
            </div>
          ) : expenses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-900 text-slate-500 font-semibold">
                    <th className="pb-3 pl-2">รายการค่าใช้จ่าย</th>
                    <th className="pb-3">ประเภทภาษี</th>
                    <th className="pb-3 text-right">จำนวนเงิน</th>
                    <th className="pb-3 text-center">วันที่บันทึก</th>
                    <th className="pb-3 text-center">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-900/40">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/10">
                      <td className="py-3.5 pl-2 font-medium text-slate-800 dark:text-slate-200">{exp.title}</td>
                      <td className="py-3.5">
                        {exp.category === "40_5" ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-500/10">
                            <Landmark className="w-3 h-3" /> 40(5) ค่าเช่าหอพัก
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-500/10">
                            <Zap className="w-3 h-3" /> 40(8) น้ำไฟ/บริการ
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                        {exp.amount.toLocaleString()} บาท
                      </td>
                      <td className="py-3.5 text-center text-slate-550 dark:text-slate-400 text-[10px] font-mono">
                        {new Date(exp.created_at).toLocaleDateString("th-TH", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2.5">
                          <button
                            onClick={() => handleOpenEditExpense(exp)}
                            className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                            title="แก้ไข"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(exp.id, exp.title)}
                            className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                            title="ลบ"
                          >
                            <Trash2 className="w-4 h-4 text-red-500/80 hover:text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-900 text-[11px] text-slate-500 dark:text-slate-400">
                <div>* แสดงผลลัพธ์รายจ่ายของปีภาษี {taxYear} ทั้งหมดจำนวน {expenses.length} รายการ</div>
                <div className="flex gap-4">
                  <div>ยอดรวม 40(5) สะสม: <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">{dbActualExpense405.toLocaleString()} บ.</span></div>
                  <div>ยอดรวม 40(8) สะสม: <span className="font-bold text-teal-600 dark:text-teal-400 font-mono">{dbActualExpense408.toLocaleString()} บ.</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center rounded-xl bg-slate-50/50 dark:bg-slate-900/20 border border-dashed border-slate-200 dark:border-slate-900/60 text-slate-500 text-xs space-y-2">
              <Coins className="w-8 h-8 text-slate-400 dark:text-slate-700 mx-auto animate-pulse" />
              <p>ยังไม่มีบันทึกค่าใช้จ่ายจริงในปีภาษี {taxYear}</p>
              <button
                onClick={handleOpenAddExpense}
                className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-355 underline cursor-pointer"
              >
                + เริ่มต้นบันทึกรายการแรก
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ตารางแสดงรายรับรายเดือน */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-blue-500" /> ตารางสรุปรายได้สะสมรายเดือน ({taxYear})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-900 text-slate-500 font-semibold">
                <th className="pb-3 pl-2">เดือน</th>
                <th className="pb-3 text-center">จำนวนบิลจริงที่รับเงิน</th>
                <th className="pb-3 text-right">ค่าเช่า 40(5)</th>
                <th className="pb-3 text-right">สาธารณูปโภค 40(8)</th>
                <th className="pb-3 text-right">รวมรายได้ประเมิน</th>
                <th className="pb-3 text-center">สถานะข้อมูล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-900/40">
              {monthsList.map(m => {
                const cycleStr = `${taxYear}-${m.num}`
                const paidBillsInMonth = bills.filter(b => b.status === "paid" && b.billingCycle === cycleStr)
                
                let monthlyRent = 0
                let monthlyUtil = 0
                
                if (dataSource === "system" && hasPaidBills) {
                  paidBillsInMonth.forEach(bill => {
                    const elecVal = Number(bill.electricUnits || 0) * electricRate
                    const waterVal = Number(bill.waterUnits || 0) * waterRate
                    const utilVal = elecVal + waterVal
                    const rentVal = Number(bill.amount || 0) - utilVal
                    
                    monthlyRent += rentVal
                    monthlyUtil += utilVal
                  })
                } else {
                  // ข้อมูลจำลอง/ manual หาร 12
                  monthlyRent = rent405Full / 12
                  monthlyUtil = utilities408Full / 12
                }
                
                const monthlyTotal = monthlyRent + monthlyUtil
                const hasRealData = paidBillsInMonth.length > 0 && dataSource === "system"
                
                return (
                  <tr key={m.num} className="hover:bg-slate-50 dark:hover:bg-slate-900/10">
                    <td className="py-3 pl-2 font-medium text-slate-800 dark:text-slate-200">{m.name}</td>
                    <td className="py-3 text-center text-slate-500 dark:text-slate-400">
                      {dataSource === "system" && hasPaidBills ? `${paidBillsInMonth.length} ห้อง` : "-"}
                    </td>
                    <td className="py-3 text-right text-slate-700 dark:text-slate-300 font-mono">{Math.round(monthlyRent).toLocaleString()} บาท</td>
                    <td className="py-3 text-right text-slate-700 dark:text-slate-300 font-mono">{Math.round(monthlyUtil).toLocaleString()} บาท</td>
                    <td className="py-3 text-right text-teal-600 dark:text-teal-400 font-bold font-mono">{Math.round(monthlyTotal).toLocaleString()} บาท</td>
                    <td className="py-3 text-center">
                      {hasRealData ? (
                        <span className="inline-block text-[8px] font-bold px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-500/10">บิลจริง</span>
                      ) : (
                        <span className="inline-block text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">คำนวณจำลอง</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ส่วนจัดการสัญญา ค่าเช่าล่วงหน้า (มาตรา 40(5)) */}
      <div>
        {/* บล็อกค่าเช่าล่วงหน้าสะสม (มาตรา 40(5)) */}
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Landmark className="w-4 h-4 text-blue-500" /> ค่าเช่าล่วงหน้าสะสม มาตรา 40(5)
            </h3>
            <p className="text-[10px] text-slate-550 dark:text-slate-400 mt-0.5">
              สัญญาเช่าที่เริ่มต้นในปีภาษี {taxYear} จะนำยอดค่าเช่าล่วงหน้าวิ่งไปคำนวณเป็นรายได้ 40(5) ของปีนั้นๆ ทันที
            </p>
          </div>

          {advanceRentBills.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-900 text-slate-550 font-semibold text-[11px]">
                    <th className="pb-2.5 pl-2">ห้องพัก / ผู้เช่า</th>
                    <th className="pb-2.5 text-center">วันที่เริ่มสัญญา</th>
                    <th className="pb-2.5 text-right">ยอดเช่าล่วงหน้า</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-900/40">
                  {advanceRentBills.map((t) => {
                    const matchedRoom = rooms.find(r => r.roomNumber === t.roomNumber)
                    const roomRent = matchedRoom ? matchedRoom.baseRent : 0
                    const advanceRentVal = roomRent * defaultAdvanceRent
                    return (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/5">
                        <td className="py-2.5 pl-2 font-medium text-slate-800 dark:text-slate-200">
                          ห้อง {t.roomNumber} - {t.fullName}
                          <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                            ค่าเช่าห้อง: {roomRent.toLocaleString()} บ. (ล่วงหน้า {defaultAdvanceRent} เดือน)
                          </span>
                        </td>
                        <td className="py-2.5 text-center text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                          {t.contractStart ? new Date(t.contractStart).toLocaleDateString("th-TH", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }) : "-"}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {advanceRentVal.toLocaleString()} บ.
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-900 text-[11px] text-slate-550 dark:text-slate-400 mt-2 font-semibold">
                <span>จำนวนสัญญาที่เริ่มในปีนี้: {advanceRentBills.length} รายการ</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold font-mono">
                  รวม {totalAdvanceRentAmount.toLocaleString()} บาท
                </span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center rounded-xl bg-slate-50/50 dark:bg-slate-900/10 border border-dashed border-slate-200 dark:border-slate-900/60 text-slate-550 text-xs">
              <p>ไม่มีสัญญาใหม่ที่เริ่มเช่าในปีภาษี {taxYear}</p>
            </div>
          )}
        </div>
      </div>

      {/* แถวการคำนวณแบ่งยื่นครึ่งปีและเต็มปี */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ครึ่งปี ภ.ง.ด. 94 */}
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-500" /> 1. แบบยื่นภาษีเงินได้ครึ่งปี (ภ.ง.ด. 94)
          </h3>
          
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>รายได้ครึ่งปีแรก (ม.ค. - มิ.ย.):</span><span className="font-semibold text-slate-800 dark:text-slate-200">{halfTotalRevenue.toLocaleString()} บาท</span></div>
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>หักค่าใช้จ่าย ({deductionMethod405}) ของค่าเช่าห้อง:</span><span className="font-semibold text-red-600 dark:text-red-400">-{deductionRent405Half.toLocaleString()} บาท</span></div>
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>หักค่าใช้จ่ายจริงของค่าน้ำไฟ (ครึ่งปี):</span><span className="font-semibold text-red-600 dark:text-red-400">-{deductionUtilities408Half.toLocaleString()} บาท</span></div>
            <div className="h-px bg-slate-200 dark:bg-slate-900 my-2" />
            <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200"><span>เงินได้สุทธิประเมินครึ่งปี:</span><span className="text-blue-600 dark:text-blue-400">{netIncomeHalf.toLocaleString()} บาท</span></div>
          </div>
          
          <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl text-[10px] text-slate-550 dark:text-slate-400 leading-relaxed">
            <span className="font-bold text-slate-700 dark:text-slate-300">ระยะเวลาการยื่นแบบ:</span> ปกติยื่นระหว่างเดือนกรกฎาคม ถึง กันยายนของปีนั้นๆ เป็นการเสียภาษีล่วงหน้าสำหรับรายได้ในช่วงครึ่งปีแรก
          </div>

          <button
            onClick={() => handleDownloadPdf("94")}
            disabled={loadingPdf !== null}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-blue-600/10 transition-colors"
          >
            {loadingPdf === "94" ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Download className="w-4 h-4" /> ดาวน์โหลดแบบยื่น ภ.ง.ด. 94 (PDF)
              </>
            )}
          </button>
        </div>

        {/* เต็มปี ภ.ง.ด. 90 */}
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-teal-500" /> 2. แบบยื่นภาษีเงินได้ปลายปี (ภ.ง.ด. 90)
          </h3>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>รายได้เต็มปีสะสม (12 เดือน):</span><span className="font-semibold text-slate-800 dark:text-slate-200">{fullTotalRevenue.toLocaleString()} บาท</span></div>
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>หักค่าใช้จ่าย ({deductionMethod405}) ของค่าเช่าห้อง:</span><span className="font-semibold text-red-600 dark:text-red-400">-{deductionRent405Full.toLocaleString()} บาท</span></div>
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>หักค่าใช้จ่ายจริงค่าน้ำไฟ (หักตามจริงเต็มปี):</span><span className="font-semibold text-red-600 dark:text-red-400">-{deductionUtilities408Full.toLocaleString()} บาท</span></div>
            <div className="h-px bg-slate-200 dark:bg-slate-900 my-2" />
            <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200"><span>เงินได้สุทธิประเมินเต็มปี:</span><span className="text-teal-600 dark:text-teal-400">{netIncomeFull.toLocaleString()} บาท</span></div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl text-[10px] text-slate-550 dark:text-slate-400 leading-relaxed">
            <span className="font-bold text-slate-700 dark:text-slate-300">ระยะเวลาการยื่นแบบ:</span> ยื่นระหว่างเดือนมกราคม ถึง มีนาคมของปีถัดไป โดยสามารถนำตัวเลขที่จ่ายภาษี ภ.ง.ด. 94 ไปหักลดหย่อนภาษีที่ชำระไว้แล้วครึ่งปีได้
          </div>

          <button
            onClick={() => handleDownloadPdf("90")}
            disabled={loadingPdf !== null}
            className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-teal-600/10 transition-colors"
          >
            {loadingPdf === "90" ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Download className="w-4 h-4" /> ดาวน์โหลดแบบยื่น ภ.ง.ด. 90 (PDF)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modal บันทึกค่าใช้จ่าย */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <Coins className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-base">
                    {editingExpense ? "แก้ไขรายการค่าใช้จ่าย" : "บันทึกค่าใช้จ่ายใหม่"}
                  </h3>
                  <p className="text-[10px] text-slate-550 dark:text-slate-400">ปีภาษี {taxYear}</p>
                </div>
              </div>
              <button
                onClick={() => setExpenseModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitExpense} className="flex-1 overflow-y-auto p-5 space-y-4">
              {expenseError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{expenseError}</span>
                </div>
              )}

              {/* ชื่อรายการ */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">ชื่อรายการค่าใช้จ่าย <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ค่าทาสีห้องพัก, ค่าน้ำประปาที่จ่ายหลวง"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
              </div>

              {/* จำนวนเงิน */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">จำนวนเงิน (บาท) <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-3.5 pr-12 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-xs text-slate-500 dark:text-slate-400 font-medium">
                    บาท
                  </div>
                </div>
              </div>

              {/* เลือกประเภท */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">ประเภทค่าใช้จ่ายตามจริงของสรรพากร <span className="text-red-400">*</span></label>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* 40(5) */}
                  <button
                    type="button"
                    onClick={() => setExpenseCategory("40_5")}
                    className={`flex flex-col text-left p-3.5 rounded-xl border transition-all duration-200 ${
                      expenseCategory === "40_5"
                        ? "bg-blue-50 dark:bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/40"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">มาตรา 40(5)</span>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        expenseCategory === "40_5" ? "border-blue-500 bg-blue-500" : "border-slate-300 dark:border-slate-600"
                      }`}>
                        {expenseCategory === "40_5" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">ค่าเช่าอสังหาริมทรัพย์</span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">เกี่ยวกับตัวตึก อาคาร และสิ่งปลูกสร้างหลัก</span>
                  </button>

                  {/* 40(8) */}
                  <button
                    type="button"
                    onClick={() => setExpenseCategory("40_8")}
                    className={`flex flex-col text-left p-3.5 rounded-xl border transition-all duration-200 ${
                      expenseCategory === "40_8"
                        ? "bg-teal-50 dark:bg-teal-500/10 border-teal-500/40 ring-1 ring-teal-500/40"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold text-teal-600 dark:text-teal-400 font-mono">มาตรา 40(8)</span>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        expenseCategory === "40_8" ? "border-teal-500 bg-teal-500" : "border-slate-300 dark:border-slate-600"
                      }`}>
                        {expenseCategory === "40_8" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">บริการและสาธารณูปโภค</span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">เกี่ยวกับงานบริการ ค่าน้ำ ค่าไฟ และดูแลส่วนกลาง</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Guidance / Recommendation Tooltip */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Info className={`w-4 h-4 ${expenseCategory === "40_5" ? "text-blue-600 dark:text-blue-400" : "text-teal-600 dark:text-teal-400"}`} />
                  <span>คำแนะนำการเลือกรายการประเภทนี้</span>
                </div>
                
                {expenseCategory === "40_5" ? (
                  <div className="text-[10px] text-slate-650 dark:text-slate-400 space-y-1.5 leading-relaxed">
                    <p className="text-slate-700 dark:text-slate-300 font-medium">รายการที่หักเป็นค่าใช้จ่ายตามจริงของ <span className="text-blue-600 dark:text-blue-400 font-bold">40(5) - ค่าเช่า</span> ได้:</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-450">
                      <li><strong className="text-slate-700 dark:text-slate-300">ค่าซ่อมแซมบำรุงโครงสร้าง</strong> ทาสีตึกภายนอก, ซ่อมหลังคา, ซ่อมลิฟต์, ซ่อมฐานราก</li>
                      <li><strong className="text-slate-700 dark:text-slate-300">ดอกเบี้ยเงินกู้ยืม</strong> ซื้อ/สร้าง/ปรับปรุงอาคารหอพัก (เฉพาะส่วนดอกเบี้ยเท่านั้น)</li>
                      <li><strong className="text-slate-700 dark:text-slate-300">ภาษีที่ดินและสิ่งปลูกสร้าง</strong> และค่าธรรมเนียมราชการอื่นเกี่ยวกับทรัพย์สินเช่า</li>
                      <li><strong className="text-slate-700 dark:text-slate-300">เบี้ยประกันภัยทรัพย์สิน</strong> เบี้ยประกันอัคคีภัย/วินาศภัยของตึก</li>
                    </ul>
                    <p className="text-[9px] text-amber-750 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/5 p-1.5 rounded border border-amber-200 dark:border-amber-500/10 mt-1">
                      💡 สรรพากรเปิดช่องให้เลือกหักเหมา 30% ได้ หากจ่ายจริงรวมทั้งปีไม่ถึง 30% แนะนำให้ยื่นหักแบบเหมาเพื่อประหยัดภาษีสูงสุด
                    </p>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-650 dark:text-slate-400 space-y-1.5 leading-relaxed">
                    <p className="text-slate-700 dark:text-slate-300 font-medium">รายการที่หักเป็นค่าใช้จ่ายตามจริงของ <span className="text-teal-600 dark:text-teal-400 font-bold">40(8) - บริการ</span> ได้:</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-450">
                      <li><strong className="text-slate-700 dark:text-slate-300">ค่าน้ำไฟฟ้าจ่ายหลวง</strong> บิลจ่ายตรงให้การไฟฟ้า/ประปา (ไม่รวมบิลที่เราเก็บจากผู้เช่า)</li>
                      <li><strong className="text-slate-700 dark:text-slate-300">ค่าจ้างแม่บ้าน รปภ. ช่าง</strong> เงินเดือนหรือค่าจ้างบริการดูแลส่วนกลางตึก</li>
                      <li><strong className="text-slate-700 dark:text-slate-300">วัสดุอุปกรณ์สิ้นเปลือง</strong> หลอดไฟทางเดิน, น้ำยาล้างพื้น, อะไหล่สวิตช์, สายยาง</li>
                      <li><strong className="text-slate-700 dark:text-slate-300">อินเทอร์เน็ต, น้ำมันเครื่องปั่นไฟ</strong> และค่าบำบัดน้ำเสียส่วนกลาง</li>
                    </ul>
                    <p className="text-[9px] text-amber-750 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/5 p-1.5 rounded border border-amber-200 dark:border-amber-500/10 mt-1">
                      💡 สรรพากรเปิดช่องให้เลือกหักเหมา 60% ได้ หากจ่ายจริงรวมทั้งปีไม่ถึง 60% แนะนำให้ยื่นหักแบบเหมาเพื่อประหยัดภาษีสูงสุด
                    </p>
                  </div>
                )}
              </div>
            </form>

            {/* Footer Actions */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setExpenseModalOpen(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 rounded-xl text-xs font-semibold transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmitExpense}
                disabled={expenseSubmitting}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:from-slate-200 disabled:to-slate-200 dark:disabled:from-slate-800 dark:disabled:to-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-teal-500/10 hover:shadow-teal-500/20 active:scale-[0.98] transition-all"
              >
                {expenseSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    บันทึกรายการ
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}


    </>
  )
}
