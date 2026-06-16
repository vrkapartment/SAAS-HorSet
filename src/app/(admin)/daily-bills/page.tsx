"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
import { 
  Coins, 
  Plus, 
  Search, 
  HelpCircle, 
  Info, 
  ArrowRight, 
  TrendingUp, 
  Calendar, 
  FileCheck, 
  Edit, 
  Trash2, 
  X, 
  Lock,
  AlertTriangle, 
  FileText, 
  Filter,
  CheckCircle,
  Bookmark,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Settings,
  Users,
  Phone
} from "lucide-react"
import { 
  getExpenses, 
  createExpense, 
  updateExpense, 
  deleteExpense, 
  ExpenseItem 
} from "@/features/expenses/actions"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"

// คู่มือรายจ่ายยอดนิยมและคำอธิบายประเภทภาษี
const commonExpensesGuide = [
  { name: "ค่าสีทาตึกภายนอก / ภายใน", category: "40_5", categoryText: "40(5) ค่าเช่า", desc: "การปรับปรุงหรือทาสีโครงสร้างตึกหลัก ถือเป็นค่าใช้จ่ายซ่อมแซมรักษาอาคารของผู้ให้เช่า" },
  { name: "ค่าซ่อมแซมหลังคารั่วซึม", category: "40_5", categoryText: "40(5) ค่าเช่า", desc: "การบำรุงรักษาและซ่อมแซมโครงสร้างใหญ่ของอาคารเพื่อรักษาสภาพตึกให้ใช้งานได้ปลอดภัย" },
  { name: "ค่าซ่อมแซมลิฟต์โดยสาร", category: "40_5", categoryText: "40(5) ค่าเช่า", desc: "การบำรุงรักษาลิฟต์ซึ่งถือเป็นสิ่งปลูกสร้างหรืออุปกรณ์ควบอาคารส่วนโครงสร้างหลัก" },
  { name: "ค่าเบี้ยประกันภัยตึก (อัคคีภัย / วินาศภัย)", category: "40_5", categoryText: "40(5) ค่าเช่า", desc: "ค่าประกันภัยคุ้มครองโครงสร้างอสังหาริมทรัพย์และตัวอาคารหอพัก" },
  { name: "ดอกเบี้ยเงินกู้ยืมเพื่อซื้อ / สร้างหอพัก", category: "40_5", categoryText: "40(5) ค่าเช่า", desc: "ดอกเบี้ยจ่ายจากสัญญากู้เงินเพื่อลงทุนก่อสร้างอาคารหอพัก (หักเฉพาะดอกเบี้ย ห้ามหักเงินต้น)" },
  { name: "ภาษีที่ดินและสิ่งปลูกสร้าง", category: "40_5", categoryText: "40(5) ค่าเช่า", desc: "ภาษีทางตรงเกี่ยวกับอสังหาริมทรัพย์ที่ผู้ให้เช่ามีหน้าที่ต้องชำระตามกฎหมายประจำปี" },
  { name: "ค่าจ้างแม่บ้านทำความสะอาดพื้นที่ส่วนกลาง", category: "40_8", categoryText: "40(8) บริการ", desc: "ค่าตอบแทนงานบริการดูแลพื้นที่ส่วนกลาง ทางเดิน บันได และดูแลความสะอาดทั่วไปของตึก" },
  { name: "ค่าจ้างพนักงานรักษาความปลอดภัย (รปภ.)", category: "40_8", categoryText: "40(8) บริการ", desc: "งานจ้างดูแลความปลอดภัยในตัวตึกและลานจอดรถ ซึ่งเกี่ยวข้องกับการให้บริการของหอพัก" },
  { name: "ค่าน้ำประปาจ่ายหลวง (บิลการประปา)", category: "40_8", categoryText: "40(8) บริการ", desc: "ค่าน้ำดิบที่ทางหอพักชำระโดยตรงให้กับการประปานครหลวงหรือภูมิภาคส่วนกลางตึก" },
  { name: "ค่าไฟฟ้าส่วนกลาง (บิลการไฟฟ้า)", category: "40_8", categoryText: "40(8) บริการ", desc: "บิลค่าไฟฟ้าส่วนกลาง ลิฟต์ ทางเดิน และไฟปั๊มน้ำที่จ่ายตรงให้การไฟฟ้านครหลวงหรือภูมิภาค" },
  { name: "ค่าซ่อมแซมระบบประปา / ท่อน้ำแตก", category: "40_8", categoryText: "40(8) บริการ", desc: "งานซ่อมแซมบำรุงรักษาท่อน้ำดี-น้ำเสียและเครื่องปั๊มน้ำที่คอยให้บริการสุขาภิบาล" },
  { name: "ค่าจัดซื้อหลอดไฟส่องสว่างทางเดิน", category: "40_8", categoryText: "40(8) บริการ", desc: "ค่าใช้จ่ายจัดซื้อวัสดุอุปกรณ์สิ้นเปลืองสำหรับงานบริการดูแลพื้นที่ส่วนกลางและทางเดิน" },
  { name: "ค่าบริการอินเทอร์เน็ต Wifi ในหอพัก", category: "40_8", categoryText: "40(8) บริการ", desc: "ค่าสัญญาณอินเทอร์เน็ตที่แชร์ให้ห้องพักต่าง ๆ ใช้งาน ซึ่งนับเป็นส่วนหนึ่งของการให้บริการ" },
  { name: "ค่าซ่อมแซมระบบคีย์การ์ด / กล้องวงจรปิด", category: "40_8", categoryText: "40(8) บริการ", desc: "ค่าบำรุงรักษาอุปกรณ์อำนวยความสะดวกและรักษาความปลอดภัยส่วนกลางตึก" },
  { name: "ค่ากำจัดปลวกและแมลงรบกวน", category: "40_5", categoryText: "40(5) ค่าเช่า", desc: "การฉีดพ่นเคมีรักษาเนื้อไม้และโครงสร้างตึก เพื่อถนอมและปกป้องสภาพโครงสร้างสิ่งปลูกสร้างหลัก" },
  { name: "ค่าถุงขยะสีดำและอุปกรณ์ล้างพื้น", category: "40_8", categoryText: "40(8) บริการ", desc: "ค่าวัสดุสิ้นเปลืองใช้ในการทำความสะอาดพื้นที่ส่วนกลางเพื่อรักษาระดับการบริการของหอพัก" }
]

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

export default function DailyBillsPage() {
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const [expenses, setExpenses] = useState<ExpenseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [taxYear, setTaxYear] = useState("2026")
  
  // สิทธิ์และสถานะการช่วยเหลือสำหรับ Super Admin
  const [userRole, setUserRole] = useState<string>("admin")
  const [supportApproved, setSupportApproved] = useState<boolean>(true)
  
  // ตัวกรองตาราง
  const [categoryFilter, setCategoryFilter] = useState<"all" | "40_5" | "40_8">("all")
  const [searchQuery, setSearchQuery] = useState("")

  // การค้นหาคู่มือคำแนะนำ
  const [guideSearch, setGuideSearch] = useState("")
  const [activeGuideCategory, setActiveGuideCategory] = useState<"all" | "40_5" | "40_8">("all")

  // Adaptive Mobile Tab switcher: "bills" หรือ "guide"
  const [activeTab, setActiveTab] = useState<"bills" | "guide">("guide")

  // สถานะ Custom Delete Confirm Modal (SaaS Premium UX)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // สถานะ Modal ฟอร์ม บันทึก/แก้ไข
  const [modalOpen, setModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formAmount, setFormAmount] = useState<number | string>("")
  const [formCategory, setFormCategory] = useState<"40_5" | "40_8">("40_5")
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ดึงข้อมูล
  const loadData = async (year: string, forceRefresh = false) => {
    setLoading(true)
    try {
      const userRes = await getCurrentUserProfileClient(forceRefresh)
      let wsId: string | undefined = undefined
      
      if (userRes.success && userRes.data) {
        const isSuperAdmin = userRes.data.role === "super_admin"
        
        if (!isSuperAdmin && userRes.data.workspace_id) {
          // สำหรับ Admin และ Staff ทั่วไป: ให้ใช้ workspace_id จาก Profile เสมอ
          wsId = userRes.data.workspace_id
        } else {
          // สำหรับ Super Admin: ดึงจาก Cookie เพื่อรองรับการสลับ Workspace คอนโซลด้านบน
          const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
          wsId = cookieWsId || userRes.data.workspace_id || undefined
        }
      }

      if (wsId) {
        if (forceRefresh) {
          clearWorkspaceCache(wsId)
        }

        const cacheKey = `expenses_${year}`
        const cached = getCachedData<ExpenseItem[]>(wsId, cacheKey)
        if (cached) {
          setExpenses(cached)
          setLoading(false)
          return
        }

        const res = await getExpenses(year, wsId)
        if (res.success && res.data) {
          setExpenses(res.data)
          setCachedData(wsId, cacheKey, res.data)
        }
      }
    } catch (e) {
      console.error("Failed to load daily bills:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 1. ดึงสิทธิ์ผู้ใช้และสถานะการเข้าช่วยเหลือ
    const mockRole = typeof document !== "undefined"
      ? document.cookie
          .split("; ")
          .find((row) => row.startsWith("horset_user_role="))
          ?.split("=")[1] || "admin"
      : "admin"
    setUserRole(mockRole)

    const checkSupportStatus = async () => {
      if (mockRole === "super_admin") {
        const activeWsId = getCookie("horset_current_workspace_id")
        if (!activeWsId) {
          setSupportApproved(false)
          return
        }

        // เช็คจาก Supabase ด้วย (ถ้ามี)
        const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
        if (!isDemo) {
          try {
            const { createClient: createSupabaseClient } = await import("@/lib/supabase/client")
            const supabase = createSupabaseClient()
            const { data: grantData } = await supabase
              .from("support_access_grants")
              .select("status")
              .eq("workspace_id", activeWsId)
              .single()

            if (grantData) {
              setSupportApproved(grantData.status === "approved")
            } else {
              setSupportApproved(false)
            }
          } catch (e) {
            // fallback เช็คจากคุกกี้
            const savedStatus = getCookie(`horset_support_status_${activeWsId}`) || "none"
            setSupportApproved(savedStatus === "approved")
          }
        } else {
          const savedStatus = getCookie(`horset_support_status_${activeWsId}`) || "none"
          setSupportApproved(savedStatus === "approved")
        }
      } else {
        setSupportApproved(true)
      }
    }

    checkSupportStatus()
  }, [])

  useEffect(() => {
    if (supportApproved) {
      loadData(taxYear)
    }
  }, [taxYear, supportApproved])

  // คำนวณยอดรวมสุทธิแยกประเภท
  const total405 = expenses
    .filter(item => item.category === "40_5")
    .reduce((sum, item) => sum + item.amount, 0)

  const total408 = expenses
    .filter(item => item.category === "40_8")
    .reduce((sum, item) => sum + item.amount, 0)

  const grandTotal = total405 + total408

  // คัดกรองข้อมูลบิลที่จะแสดงในตาราง
  const filteredExpenses = expenses.filter(item => {
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // คัดกรองคู่มือรายจ่ายยอดนิยม
  const filteredGuide = commonExpensesGuide.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(guideSearch.toLowerCase()) || 
                          item.desc.toLowerCase().includes(guideSearch.toLowerCase())
    const matchesCategory = activeGuideCategory === "all" || item.category === activeGuideCategory
    return matchesSearch && matchesCategory
  })

  // จัดการฟอร์มบันทึกบิล
  const handleOpenAddModal = () => {
    setEditingExpense(null)
    setFormTitle("")
    setFormAmount("")
    setFormCategory("40_5")
    setFormError(null)
    setModalOpen(true)
  }

  const handleOpenEditModal = (item: ExpenseItem) => {
    setEditingExpense(item)
    setFormTitle(item.title)
    setFormAmount(item.amount)
    setFormCategory(item.category)
    setFormError(null)
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) {
      setFormError("กรุณากรอกรายละเอียดของบิลค่าใช้จ่าย")
      return
    }
    const amt = Number(formAmount)
    if (isNaN(amt) || amt <= 0) {
      setFormError("กรุณากรอกจำนวนเงินให้ถูกต้องและมากกว่า 0 บาท")
      return
    }

    setSubmitting(true)
    setFormError(null)

    try {
      let res
      const userRes = await getCurrentUserProfileClient()
      let wsId: string | undefined = undefined
      
      if (userRes.success && userRes.data) {
        const isSuperAdmin = userRes.data.role === "super_admin"
        
        if (!isSuperAdmin && userRes.data.workspace_id) {
          // สำหรับ Admin และ Staff ทั่วไป: ให้ใช้ workspace_id จาก Profile เสมอ
          wsId = userRes.data.workspace_id
        } else {
          // สำหรับ Super Admin: ดึงจาก Cookie เพื่อรองรับการสลับ Workspace คอนโซลด้านบน
          const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
          wsId = cookieWsId || userRes.data.workspace_id || undefined
        }
      }

      if (editingExpense) {
        res = await updateExpense(editingExpense.id, formTitle.trim(), amt, taxYear, formCategory)
      } else {
        res = await createExpense(formTitle.trim(), amt, taxYear, formCategory, wsId)
      }

      if (res.success) {
        setModalOpen(false)
        if (wsId) {
          clearWorkspaceCache(wsId)
        }
        await loadData(taxYear, true)
      } else {
        setFormError(res.error || "เกิดข้อผิดพลาดในการบันทึกรายการ")
      }
    } catch (err) {
      setFormError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์")
    } finally {
      setSubmitting(false)
    }
  }

  // เรียกใช้ Trigger เพื่อแสดง Custom Delete Modal แทน confirm ดั้งเดิม
  const handleDeleteTrigger = (item: ExpenseItem) => {
    setDeleteTarget(item)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await deleteExpense(deleteTarget.id)
      if (res.success) {
        setDeleteConfirmOpen(false)
        setDeleteTarget(null)
        
        const userRes = await getCurrentUserProfileClient()
        if (userRes.success && userRes.data) {
          const isSuperAdmin = userRes.data.role === "super_admin"
          const wsId = !isSuperAdmin && userRes.data.workspace_id
            ? userRes.data.workspace_id
            : (typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined) || userRes.data.workspace_id
          if (wsId) {
            clearWorkspaceCache(wsId)
          }
        }
        await loadData(taxYear, true)
      } else {
        alert(res.error || "เกิดข้อผิดพลาดในการลบรายการ")
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการทำงาน")
    } finally {
      setDeleting(false)
    }
  }

  const applyGuideToForm = (name: string, category: "40_5" | "40_8") => {
    setFormTitle(name)
    setFormCategory(category)
    setEditingExpense(null)
    setFormAmount("")
    setFormError(null)
    setModalOpen(true)
    
    // เมื่อกดเลือกบนโมบายล์ สลับแท็บกลับมาหน้าบันทึกบิลเพื่อให้เห็นความเปลี่ยนแปลง
    if (activeTab === "guide") {
      setActiveTab("bills")
    }
  }

  // local SkeletonLoader ที่ตอบสนองแบบ Adaptive ตามความกว้างหน้าจอ
  const SkeletonLoader = () => (
    <div className="space-y-4">
      {/* Desktop Table Skeleton */}
      <div className="hidden md:block space-y-3">
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse w-full" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex justify-between items-center py-4 px-4 border-b border-slate-100 dark:border-slate-800/80 animate-pulse">
            <div className="h-4 bg-slate-150 dark:bg-slate-700 rounded w-4/12" />
            <div className="h-4 bg-slate-150 dark:bg-slate-700 rounded w-2/12" />
            <div className="h-4 bg-slate-150 dark:bg-slate-700 rounded w-2/12" />
            <div className="h-4 bg-slate-150 dark:bg-slate-700 rounded w-2/12" />
            <div className="h-4 bg-slate-150 dark:bg-slate-700 rounded w-1/12" />
          </div>
        ))}
      </div>
      
      {/* Mobile Cards Skeleton */}
      <div className="block md:hidden space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-5 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl space-y-4 shadow-sm animate-pulse">
            <div className="flex justify-between items-center">
              <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
            </div>
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
              <div className="flex justify-between flex-row">
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
              </div>
              <div className="flex justify-between flex-row">
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex gap-3">
              <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-xl w-1/2 animate-pulse" />
              <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-xl w-1/2 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (userRole === "super_admin" && !supportApproved) {
    return (
      <DashboardLayout role="super_admin">
        <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-900/40 border border-slate-800/60 rounded-3xl max-w-2xl mx-auto space-y-6 mt-12 animate-scale-up backdrop-blur-sm shadow-xl">
          <div className="p-4 bg-red-500/10 rounded-2xl text-red-400 border border-red-500/20">
            <Lock className="w-10 h-10 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-100">พื้นที่จำกัดสิทธิ์เฉพาะการเข้าช่วยเหลือระบบ</h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
              ขออภัย บัญชีสิทธิ์ <span className="text-red-400 font-semibold font-mono">Super Admin</span> ของคุณจำเป็นต้องมีสถานะได้รับการอนุมัติช่วยเหลือจึงจะสามารถเข้าดูหรือบันทึกบิลรายจ่ายรายวันใน Workspace นี้ได้
            </p>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-500 leading-relaxed max-w-sm mx-auto">
            💡 กรุณาเปิดแผงควบคุมหลักด้านซ้าย แล้วเลือก <strong>"ส่งคำขอเข้าช่วยเหลือระบบ"</strong> และได้รับการยืนยันสิทธิ์จากเจ้าของระบบก่อนดำเนินการเข้าสลับหอพัก
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role={userRole as any}>
      {/* Header section with responsive layout and action toggles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2 tracking-tight">
            <Coins className="w-5.5 h-5.5 text-teal-500 dark:text-teal-400" /> บันทึกและจัดการบิลค่าใช้จ่ายรายวัน
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-450 mt-1 leading-relaxed max-w-2xl">
            สมุดจดรายจ่ายประจำวันของหอพัก แยกสัดส่วนเพื่อนำไปหักลดหย่อนภาษีสรรพากรตามจริงมาตรา 40(5) และ 40(8) อัตโนมัติ ป้องกันข้อมูลตกหล่น
          </p>
        </div>

        {/* ตัวเลือกปีภาษีและปุ่มเพิ่ม (สลับปุ่มเพิ่มเป็นซ่อนบนมือถือเพราะมี Sticky Bottom แทน) */}
        <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto shrink-0 pt-1 md:pt-0">
          <div className="relative flex-1 md:flex-initial">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-extrabold text-slate-400 dark:text-slate-550 uppercase tracking-wider">ปีภาษี</span>
            <select
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value)}
              className="w-full md:w-auto pl-14 pr-8 py-2.5 md:py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all cursor-pointer h-11 md:h-9 shadow-sm"
            >
              <option value="2026">2026 (พ.ศ. 2569)</option>
              <option value="2025">2025 (พ.ศ. 2568)</option>
              <option value="2024">2024 (พ.ศ. 2567)</option>
            </select>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="hidden md:flex px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold items-center gap-2 shadow-lg shadow-teal-500/10 active:scale-95 transition-all duration-150 h-9 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> บันทึกบิลรายวันใหม่
          </button>
        </div>
      </div>

      {/* บล็อกสรุปค่าวารสารและยอดรวม - ปรับสไตล์เป็นพรีเมียม */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        {/* รวมหักตามจริง 40(5) */}
        <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 p-5 flex items-center justify-between shadow-sm shadow-blue-500/5 hover:-translate-y-0.5 transition-all duration-300">
          <div className="space-y-1.5">
            <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 font-mono uppercase bg-blue-50 dark:bg-blue-950/40 px-2.5 py-0.5 rounded border border-blue-100 dark:border-blue-900/30 tracking-wider">
              ค่าเช่า มาตรา 40(5)
            </span>
            <h4 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono pt-1">
              {total405.toLocaleString()} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">บาท</span>
            </h4>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">รวมค่าใช้จ่ายจริงเกี่ยวกับตัวตึกและสิ่งปลูกสร้างหลัก</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/20 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* รวมหักตามจริง 40(8) */}
        <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 p-5 flex items-center justify-between shadow-sm shadow-teal-500/5 hover:-translate-y-0.5 transition-all duration-300">
          <div className="space-y-1.5">
            <span className="text-[10px] font-extrabold text-teal-600 dark:text-teal-400 font-mono uppercase bg-teal-50 dark:bg-teal-950/40 px-2.5 py-0.5 rounded border border-teal-100 dark:border-teal-900/30 tracking-wider">
              บริการ มาตรา 40(8)
            </span>
            <h4 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono pt-1">
              {total408.toLocaleString()} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">บาท</span>
            </h4>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">รวมค่าน้ำ/ไฟ/พนักงานบริการส่วนกลางของตึก</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-100 dark:border-teal-900/20 shrink-0">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* ยอดรวมทั้งหมดประจำปี */}
        <div className="bg-white dark:bg-slate-850 rounded-2xl border border-amber-200/50 dark:border-amber-900/30 bg-gradient-to-br from-white to-amber-500/5 dark:from-slate-850 dark:to-amber-950/10 p-5 flex items-center justify-between shadow-sm shadow-amber-500/5 hover:-translate-y-0.5 transition-all duration-300">
          <div className="space-y-1.5">
            <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 font-mono uppercase bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 rounded border border-amber-150 dark:border-amber-900/30 tracking-wider">
              ยอดรายจ่ายบิลสะสมรวม
            </span>
            <h4 className="text-2xl font-extrabold text-teal-600 dark:text-teal-400 font-mono pt-1">
              {grandTotal.toLocaleString()} <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">บาท</span>
            </h4>
            <p className="text-[10px] text-slate-550 dark:text-slate-400">รวมรายจ่ายบิลทั้งหมดในปีภาษี {taxYear}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 dark:text-amber-400 flex items-center justify-center border border-amber-100 dark:border-amber-900/20 shrink-0">
            <TrendingUp className="w-5 h-5 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Mobile Navigation View Switcher (Tab-based strictly for responsive space saving) */}
      <div className="block md:hidden mt-6">
        <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("bills")}
            className={`flex-1 py-2.5 text-xs font-extrabold rounded-lg text-center transition-all duration-200 cursor-pointer ${
              activeTab === "bills" 
                ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm" 
                : "text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            รายการบิล ({filteredExpenses.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("guide")}
            className={`flex-1 py-2.5 text-xs font-extrabold rounded-lg text-center transition-all duration-200 cursor-pointer ${
              activeTab === "guide" 
                ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm" 
                : "text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            แนะนำการเลือกบิล ({filteredGuide.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6 pb-24 md:pb-6">
        {/* ฝั่งซ้าย: สมุดจดบิลค่าใช้จ่ายรายวัน (2 ใน 3 คอลัมน์) (สลับแท็บความกว้างมือถือ) */}
        <div className={`xl:col-span-2 space-y-4 ${activeTab === "bills" ? "block" : "hidden md:block"}`}>
          <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 p-5 md:p-6 space-y-5 shadow-sm">
            
            {/* Filter and search control section (Touch-friendly and Adaptive layout) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                <Bookmark className="w-4 h-4 text-teal-500" /> สมุดบันทึกรายการประจำปี {taxYear}
              </h3>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                {/* ช่องค้นหารายการ */}
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="w-4 h-4 md:w-3.5 md:h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาบิล..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-[160px] pl-9 md:pl-8 pr-3 py-2.5 md:py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all h-11 md:h-9 text-base md:text-xs"
                  />
                </div>

                {/* ตัวเลือกประเภทบิล */}
                <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800 h-11 md:h-9 shrink-0 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("all")}
                    className={`flex-1 sm:flex-initial px-4 md:px-2.5 py-1.5 md:py-1 rounded-lg text-xs md:text-[10px] font-extrabold md:font-semibold transition-all cursor-pointer duration-150 ${
                      categoryFilter === "all" ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm" : "text-slate-500 dark:text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("40_5")}
                    className={`flex-1 sm:flex-initial px-4 md:px-2.5 py-1.5 md:py-1 rounded-lg text-xs md:text-[10px] font-extrabold md:font-semibold transition-all cursor-pointer duration-150 ${
                      categoryFilter === "40_5" ? "bg-blue-500 dark:bg-blue-600/30 text-white dark:text-blue-400 shadow-sm" : "text-slate-500 dark:text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    40(5)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("40_8")}
                    className={`flex-1 sm:flex-initial px-4 md:px-2.5 py-1.5 md:py-1 rounded-lg text-xs md:text-[10px] font-extrabold md:font-semibold transition-all cursor-pointer duration-150 ${
                      categoryFilter === "40_8" ? "bg-teal-500 dark:bg-teal-600/30 text-white dark:text-teal-400 shadow-sm" : "text-slate-500 dark:text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    40(8)
                  </button>
                </div>
              </div>
            </div>

            {/* ตารางแสดงบิลหรือตัวกรองแบบการ์ด (Adaptive Display Switching) */}
            {loading ? (
              <SkeletonLoader />
            ) : filteredExpenses.length === 0 ? (
              <div className="p-12 text-center bg-slate-50/50 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3 animate-fade-in">
                <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-full text-slate-400 dark:text-slate-600 border border-slate-200/40 dark:border-slate-800/40">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">ไม่พบบิลค่าใช้จ่ายที่ต้องการค้นหา</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">กรุณาคลิกเพื่อบันทึกรายการแรกของคุณหรือเปลี่ยนเงื่อนไขการค้นหา</p>
                </div>
              </div>
            ) : (
              <>
                {/* DESKTOP VIEW: HIGH-DENSITY DATA TABLE (visible on desktop, hidden on mobile) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800/80 text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        <th className="py-3 pl-3">รายละเอียดรายการบิลจ่าย</th>
                        <th className="py-3 text-center">ประเภทภาษี</th>
                        <th className="py-3 text-right">จำนวนเงิน</th>
                        <th className="py-3 text-center">วันที่บันทึก</th>
                        <th className="py-3 text-center pr-3">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-xs">
                      {filteredExpenses.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 group transition-all duration-150">
                          <td className="py-3.5 pl-3 font-semibold text-slate-800 dark:text-slate-200">
                            {item.title}
                          </td>
                          <td className="py-3.5 text-center">
                            {item.category === "40_5" ? (
                              <span className="inline-block text-[9px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100/40 dark:border-blue-900/30">
                                40(5) ค่าเช่า
                              </span>
                            ) : (
                              <span className="inline-block text-[9px] font-bold px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-100/40 dark:border-teal-900/30">
                                40(8) บริการ
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 text-right font-mono text-slate-800 dark:text-slate-200 font-extrabold">
                            {item.amount.toLocaleString()} บาท
                          </td>
                          <td className="py-3.5 text-center font-mono text-[10px] text-slate-400 dark:text-slate-500">
                            {new Date(item.created_at).toLocaleDateString("th-TH", {
                              day: "2-digit",
                              month: "short",
                              year: "2-digit"
                            })}
                          </td>
                          <td className="py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleOpenEditModal(item)}
                                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                title="แก้ไขบิล"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTrigger(item)}
                                className="p-1.5 rounded-lg bg-slate-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/30 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors cursor-pointer"
                                title="ลบบิล"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE VIEW: CARD-BASED LIST (visible on mobile, hidden on desktop) */}
                <div className="block md:hidden space-y-4">
                  {filteredExpenses.map((item) => (
                    <div
                      key={item.id}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-4 hover:border-teal-500/40 dark:hover:border-teal-500/40 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">รายละเอียดรายการบิล</span>
                          <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-wide">{item.title}</span>
                        </div>
                        {item.category === "40_5" ? (
                          <span className="inline-block text-[9px] font-extrabold px-2.5 py-1 rounded-full bg-blue-50/80 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 shrink-0">
                            40(5) ค่าเช่า
                          </span>
                        ) : (
                          <span className="inline-block text-[9px] font-extrabold px-2.5 py-1 rounded-full bg-teal-50/80 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/40 shrink-0">
                            40(8) บริการ
                          </span>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex flex-col gap-2.5 text-xs text-slate-600 dark:text-slate-350">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium">จำนวนเงิน:</span>
                          <span className="font-extrabold text-slate-850 dark:text-slate-100 text-sm font-mono">{item.amount.toLocaleString()} บาท</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium">วันที่บันทึก:</span>
                          <span className="font-mono text-slate-600 dark:text-slate-350">
                            {new Date(item.created_at).toLocaleDateString("th-TH", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric"
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Touch-friendly actions */}
                      <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="flex-1 py-3 px-4 text-xs font-bold text-teal-600 dark:text-teal-400 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 rounded-xl border border-slate-200/60 dark:border-slate-800/80 transition-all flex items-center justify-center gap-2 h-11 active:scale-95 duration-200 cursor-pointer"
                        >
                          <Edit className="w-4 h-4" /> แก้ไขรายการ
                        </button>
                        <button
                          onClick={() => handleDeleteTrigger(item)}
                          className="flex-1 py-3 px-4 text-xs font-bold text-red-600 dark:text-red-400 bg-slate-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/20 rounded-xl border border-slate-200/60 dark:border-slate-800/80 transition-all flex items-center justify-center gap-2 h-11 active:scale-95 duration-200 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" /> ลบรายการ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ฝั่งขวา: เครื่องมือค้นหาและแนะนำประเภทบิลอัจฉริยะ (1 คอลัมน์) (สลับแท็บความกว้างมือถือ) */}
        <div className={`space-y-4 ${activeTab === "guide" ? "block" : "hidden md:block"}`}>
          <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 p-5 md:p-6 space-y-4 shadow-sm flex flex-col h-full max-h-[640px]">
            <div>
              <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                <Bookmark className="w-4 h-4 text-blue-500" /> แนะนำการเลือกประเภทบิล
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
                พิมพ์ค้นหารายการบิลค่าใช้จ่ายของหอพัก เพื่อดูคำแนะนำว่าต้องยื่นหักเป็นประเภท 40(5) หรือ 40(8) และกดคัดลอกได้ทันที
              </p>
            </div>

            {/* ค้นหาในคู่มือ */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="เช่น ค่าน้ำ, หลอดไฟ, ทาสี..."
                value={guideSearch}
                onChange={(e) => setGuideSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all text-base md:text-xs h-11 md:h-9 shadow-sm"
              />
            </div>

            {/* สวิตช์ฟิลเตอร์คู่มือ */}
            <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800 text-[10px] font-semibold shrink-0 h-11 md:h-9 shadow-inner">
              <button
                type="button"
                onClick={() => setActiveGuideCategory("all")}
                className={`flex-1 py-1.5 md:py-1 rounded-lg text-center transition-all cursor-pointer text-xs md:text-[10px] font-extrabold md:font-semibold ${
                  activeGuideCategory === "all" ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm" : "text-slate-500 dark:text-slate-550"
                }`}
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideCategory("40_5")}
                className={`flex-1 py-1.5 md:py-1 rounded-lg text-center transition-all cursor-pointer text-xs md:text-[10px] font-extrabold md:font-semibold ${
                  activeGuideCategory === "40_5" ? "bg-blue-500 dark:bg-blue-600/30 text-white dark:text-blue-400 shadow-sm" : "text-slate-500 dark:text-slate-550"
                }`}
              >
                40(5) ค่าเช่า
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideCategory("40_8")}
                className={`flex-1 py-1.5 md:py-1 rounded-lg text-center transition-all cursor-pointer text-xs md:text-[10px] font-extrabold md:font-semibold ${
                  activeGuideCategory === "40_8" ? "bg-teal-500 dark:bg-teal-600/30 text-white dark:text-teal-400 shadow-sm" : "text-slate-500 dark:text-slate-550"
                }`}
              >
                40(8) บริการ
              </button>
            </div>

            {/* ลิสต์ผลลัพธ์คู่มือ */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
              {filteredGuide.length === 0 ? (
                <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-[11px] leading-relaxed">
                  ไม่พบข้อแนะนำสำหรับ "{guideSearch}"<br />กรุณาลองพิมพ์คำสำคัญคำอื่น เช่น น้ำ, ไฟ, ซ่อม, ปูน
                </div>
              ) : (
                filteredGuide.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-150 dark:border-slate-900 rounded-xl hover:border-teal-500/40 dark:hover:border-slate-700/60 group transition-all duration-200 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">{item.name}</span>
                      <button
                        type="button"
                        onClick={() => applyGuideToForm(item.name, item.category as "40_5" | "40_8")}
                        className="text-[9px] font-extrabold text-teal-600 dark:text-teal-400 group-hover:text-teal-500 dark:group-hover:text-teal-350 flex items-center gap-0.5 whitespace-nowrap bg-teal-50 dark:bg-teal-500/5 px-2 py-0.5 rounded border border-teal-100 dark:border-teal-500/10 opacity-90 group-hover:opacity-100 transition-all duration-150 cursor-pointer h-7"
                      >
                        ใช้รายการนี้ <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-1.5 mt-1">
                      {item.category === "40_5" ? (
                        <span className="text-[8px] font-extrabold uppercase tracking-wide bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.2 rounded font-mono border border-blue-100/30 dark:border-blue-900/10">
                          มาตรา {item.categoryText}
                        </span>
                      ) : (
                        <span className="text-[8px] font-extrabold uppercase tracking-wide bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 px-1.5 py-0.2 rounded font-mono border border-teal-100/30 dark:border-teal-900/10">
                          มาตรา {item.categoryText}
                        </span>
                      )}
                    </div>

                    <p className="text-[9.5px] text-slate-500 dark:text-slate-450 leading-relaxed mt-2 border-t border-slate-100 dark:border-slate-900/55 pt-1.5">
                      {item.desc}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE STICKY BOTTOM ACTION BAR (Strictly Adaptive, handles notches with pb-safe) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 p-3.5 flex items-center justify-between gap-3.5 z-40 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        <button
          onClick={handleOpenAddModal}
          className="flex-1 h-12 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 active:scale-95 text-white font-extrabold px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-teal-500/20 transition-all duration-200 cursor-pointer"
        >
          <Plus className="w-5 h-5" /> บันทึกบิลรายวันใหม่
        </button>
      </div>

      {/* MODAL 1: ADAPTIVE ADD/EDIT FORM MODAL (Bottom sheet on mobile, centered modal on desktop) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300 animate-fade-in">
          <div className="relative w-full md:max-w-md bg-white dark:bg-slate-900 border-t md:border border-slate-200 dark:border-slate-800 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-100 dark:border-teal-900/30">
                  <Coins className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm tracking-tight">
                    {editingExpense ? "แก้ไขบิลค่าใช้จ่ายรายวัน" : "บันทึกบิลค่าใช้จ่ายรายวันใหม่"}
                  </h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">ปีภาษี {taxYear}</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-100 text-slate-500 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2 animate-pulse">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* รายละเอียดบิล */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold md:font-medium text-slate-700 dark:text-slate-300">รายละเอียดรายการบิลจ่าย <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ค่าทาสีห้องพัก, หลอดไฟทางเดิน"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 md:px-3.5 md:py-2 text-base md:text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all h-12 md:h-10 shadow-sm"
                />
              </div>

              {/* จำนวนเงิน */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold md:font-medium text-slate-700 dark:text-slate-300">จำนวนเงินบิล (บาท) <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    inputMode="decimal"
                    required
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-4 pr-12 py-3 md:pl-3.5 md:pr-12 md:py-2 text-base md:text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all h-12 md:h-10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 md:pr-3.5 pointer-events-none text-sm md:text-xs text-slate-400 dark:text-slate-500 font-medium">
                    บาท
                  </div>
                </div>
              </div>

              {/* ประเภทค่าใช้จ่าย */}
              <div className="space-y-2">
                <label className="text-xs font-semibold md:font-medium text-slate-700 dark:text-slate-300">ประเภทค่าใช้จ่ายหักตามจริง <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-3">
                  {/* 40(5) */}
                  <button
                    type="button"
                    onClick={() => setFormCategory("40_5")}
                    className={`flex flex-col text-left p-3.5 md:p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      formCategory === "40_5"
                        ? "bg-blue-50 dark:bg-blue-500/10 border-blue-400 dark:border-blue-500/40 ring-1 ring-blue-400 dark:ring-blue-500/40"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 font-mono">ม. 40(5)</span>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        formCategory === "40_5" ? "border-blue-500 bg-blue-500" : "border-slate-300 dark:border-slate-600"
                      }`}>
                        {formCategory === "40_5" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">ค่าเช่าอาคาร</span>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-relaxed mt-0.5">โครงสร้างตึกและสิ่งปลูกสร้างหลัก</span>
                  </button>

                  {/* 40(8) */}
                  <button
                    type="button"
                    onClick={() => setFormCategory("40_8")}
                    className={`flex flex-col text-left p-3.5 md:p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      formCategory === "40_8"
                        ? "bg-teal-50 dark:bg-teal-500/10 border-teal-400 dark:border-teal-500/40 ring-1 ring-teal-400 dark:ring-teal-500/40"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-[10px] font-extrabold text-teal-600 dark:text-teal-400 font-mono">ม. 40(8)</span>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        formCategory === "40_8" ? "border-teal-500 bg-teal-500" : "border-slate-300 dark:border-slate-600"
                      }`}>
                        {formCategory === "40_8" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">บริการ/สาธารณูปโภค</span>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-relaxed mt-0.5">น้ำไฟส่วนกลาง และพนักงานดูแลตึก</span>
                  </button>
                </div>
              </div>

              {/* ข้อแนะนำไดนามิก */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 space-y-1">
                <div className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-200">
                  <Info className={`w-3.5 h-3.5 ${formCategory === "40_5" ? "text-blue-500" : "text-teal-500"}`} />
                  <span>เกร็ดความรู้ภาษี:</span>
                </div>
                {formCategory === "40_5" ? (
                  <p>
                    <span className="text-blue-600 dark:text-blue-400 font-bold">มาตรา 40(5)</span> สรรพากรยอมให้เลือกหักค่าใช้จ่ายเหมา 30% ได้ หากรายจ่ายบิลจริงรวมกันทั้งปีไม่ถึง 30% แนะนำให้ยื่นหักแบบเหมาจะประหยัดกว่า
                  </p>
                ) : (
                  <p>
                    <span className="text-teal-600 dark:text-teal-400 font-bold">มาตรา 40(8)</span> สรรพากรบังคับหักตามจริงเท่านั้น และต้องมีหลักฐานใบกำกับภาษีหรือใบเสร็จอย่างเป็นทางการเก็บไว้อย่างน้อย 5 ปี ห้ามใช้การหักเหมา
                  </p>
                )}
              </div>
            </form>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 sm:flex-none h-12 md:h-9 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-850 rounded-xl text-sm md:text-xs font-bold md:font-semibold transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-[2] sm:flex-none h-12 md:h-9 px-5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-550 text-white rounded-xl text-sm md:text-xs font-extrabold md:font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-teal-500/10 hover:shadow-teal-500/20 active:scale-95 transition-all cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 md:w-3.5 md:h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4.5 h-4.5" />
                    บันทึกรายการบิล
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CUSTOM DESTRUCTIVE CONFIRM MODAL (SaaS Premium UX) */}
      {deleteConfirmOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
          <div className="w-full md:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-6 relative overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full border border-red-100 dark:border-red-900/40 shrink-0">
                <AlertCircle className="w-6 h-6 animate-bounce" />
              </div>
              
              <div className="space-y-1.5 flex-1 min-w-0">
                <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  ยืนยันการลบบิลค่าใช้จ่าย
                </h3>
                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  คุณแน่ใจหรือไม่ที่จะลบรายการบิลจ่ายเงิน <strong className="text-slate-850 dark:text-slate-100 font-extrabold">"{deleteTarget.title}"</strong> จำนวนเงิน <strong className="text-teal-600 font-extrabold font-mono">{deleteTarget.amount.toLocaleString()} บาท</strong>? การดำเนินการนี้จะลบข้อมูลออกอย่างถาวรและไม่สามารถย้อนคืนได้
                </p>
              </div>
            </div>

            {/* Action buttons with touch-friendly heights */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false)
                  setDeleteTarget(null)
                }}
                disabled={deleting}
                className="order-2 sm:order-1 flex-1 h-12 md:h-9.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-550 dark:text-slate-400 text-sm md:text-xs font-bold md:font-semibold transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="order-1 sm:order-2 flex-1 h-12 md:h-9.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 text-sm md:text-xs font-bold rounded-xl transition-all duration-150 border border-red-200/50 dark:border-red-900/50 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                    กำลังลบ...
                  </>
                ) : (
                  "ยืนยันลบข้อมูลถาวร"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
