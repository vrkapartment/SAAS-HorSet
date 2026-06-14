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
  AlertTriangle, 
  FileText, 
  Filter,
  CheckCircle,
  HelpCircle as QuestionIcon,
  ChevronDown,
  ChevronUp,
  Bookmark
} from "lucide-react"
import { 
  getExpenses, 
  createExpense, 
  updateExpense, 
  deleteExpense, 
  ExpenseItem 
} from "@/features/expenses/actions"

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

export default function DailyBillsPage() {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [taxYear, setTaxYear] = useState("2026")
  
  // ตัวกรองตาราง
  const [categoryFilter, setCategoryFilter] = useState<"all" | "40_5" | "40_8">("all")
  const [searchQuery, setSearchQuery] = useState("")

  // การค้นหาคู่มือคำแนะนำ
  const [guideSearch, setGuideSearch] = useState("")
  const [activeGuideCategory, setActiveGuideCategory] = useState<"all" | "40_5" | "40_8">("all")

  // สถานะ Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formAmount, setFormAmount] = useState<number | string>("")
  const [formCategory, setFormCategory] = useState<"40_5" | "40_8">("40_5")
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ดึงข้อมูล
  const loadData = async (year: string) => {
    setLoading(true)
    try {
      const res = await getExpenses(year)
      if (res.success && res.data) {
        setExpenses(res.data)
      }
    } catch (e) {
      console.error("Failed to load daily bills:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(taxYear)
  }, [taxYear])

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
      if (editingExpense) {
        res = await updateExpense(editingExpense.id, formTitle.trim(), amt, taxYear, formCategory)
      } else {
        res = await createExpense(formTitle.trim(), amt, taxYear, formCategory)
      }

      if (res.success) {
        setModalOpen(false)
        await loadData(taxYear)
      } else {
        setFormError(res.error || "เกิดข้อผิดพลาดในการบันทึกรายการ")
      }
    } catch (err) {
      setFormError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการบิลจ่ายเงิน "${title}"?`)) return

    try {
      const res = await deleteExpense(id)
      if (res.success) {
        await loadData(taxYear)
      } else {
        alert(res.error || "เกิดข้อผิดพลาดในการลบรายการ")
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการทำงาน")
    }
  }

  const applyGuideToForm = (name: string, category: "40_5" | "40_8") => {
    setFormTitle(name)
    setFormCategory(category)
    if (!modalOpen) {
      setEditingExpense(null)
      setFormAmount("")
      setFormError(null)
      setModalOpen(true)
    }
  }

  return (
    <DashboardLayout role="admin">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Coins className="w-5 h-5 text-teal-400" /> บันทึกและจัดการบิลค่าใช้จ่ายรายวัน
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            สมุดจดรายจ่ายประจำวันของหอพัก แยกสัดส่วนเพื่อนำไปหักลดหย่อนภาษีสรรพากรตามจริงมาตรา 40(5) และ 40(8) อัตโนมัติ
          </p>
        </div>

        {/* ตัวเลือกปีภาษีและปุ่มเพิ่ม */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 uppercase">ปีภาษี</span>
            <select
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value)}
              className="pl-14 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-teal-500 transition-all cursor-pointer"
            >
              <option value="2026">2026 (พ.ศ. 2569)</option>
              <option value="2025">2025 (พ.ศ. 2568)</option>
              <option value="2024">2024 (พ.ศ. 2567)</option>
            </select>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-teal-500/10 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" /> บันทึกบิลรายวันใหม่
          </button>
        </div>
      </div>

      {/* บล็อกสรุปค่าวารสารและยอดรวม */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {/* รวมหักตามจริง 40(5) */}
        <div className="glass-card rounded-2xl border border-slate-900/60 p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-blue-400 font-mono uppercase bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10">
              ค่าเช่า มาตรา 40(5)
            </span>
            <h4 className="text-xl font-bold text-slate-100 font-mono pt-1">
              {total405.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
            </h4>
            <p className="text-[9px] text-slate-500">รวมค่าใช้จ่ายจริงเกี่ยวกับตัวตึกและสิ่งปลูกสร้าง</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* รวมหักตามจริง 40(8) */}
        <div className="glass-card rounded-2xl border border-slate-900/60 p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-teal-400 font-mono uppercase bg-teal-500/5 px-2 py-0.5 rounded border border-teal-500/10">
              บริการ มาตรา 40(8)
            </span>
            <h4 className="text-xl font-bold text-slate-100 font-mono pt-1">
              {total408.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
            </h4>
            <p className="text-[9px] text-slate-500">รวมค่าน้ำ/ไฟ/พนักงานบริการส่วนกลาง</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* ยอดรวมทั้งหมดประจำปี */}
        <div className="glass-card rounded-2xl border border-teal-500/10 bg-gradient-to-br from-slate-900/30 to-teal-950/10 p-4 flex items-center justify-between shadow-md">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-amber-400 font-mono uppercase bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
              ยอดรายจ่ายบิลสะสมรวม
            </span>
            <h4 className="text-xl font-bold text-teal-400 font-mono pt-1">
              {grandTotal.toLocaleString()} <span className="text-xs font-normal text-slate-300">บาท</span>
            </h4>
            <p className="text-[9px] text-slate-400">รวมรายจ่ายบิลทั้งหมดในปีภาษี {taxYear}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center shadow-lg shadow-teal-500/10">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
        {/* ฝั่งซ้าย: สมุดจดบิลค่าใช้จ่ายรายวัน (2 ใน 3 คอลัมน์) */}
        <div className="xl:col-span-2 space-y-4">
          <div className="glass-card rounded-2xl border border-slate-900/60 p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase">
                <Bookmark className="w-4 h-4 text-teal-400" /> บันทึกบิลรายการประจำปีภาษี {taxYear}
              </h3>

              {/* คอนโทรลตาราง */}
              <div className="flex flex-wrap items-center gap-2">
                {/* ค้นหาบิล */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="ค้นหาบิล..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 w-[140px] transition-all"
                  />
                </div>

                {/* ฟิลเตอร์ประเภทบิล */}
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setCategoryFilter("all")}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                      categoryFilter === "all" ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    onClick={() => setCategoryFilter("40_5")}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                      categoryFilter === "40_5" ? "bg-blue-600/20 text-blue-400" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    40(5)
                  </button>
                  <button
                    onClick={() => setCategoryFilter("40_8")}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                      categoryFilter === "40_8" ? "bg-teal-600/20 text-teal-400" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    40(8)
                  </button>
                </div>
              </div>
            </div>

            {/* ตารางแสดงบิล */}
            {loading ? (
              <div className="w-full min-h-[300px] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="p-12 text-center bg-slate-950/20 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3">
                <HelpCircle className="w-8 h-8 text-slate-600" />
                <div className="space-y-1">
                  <p className="text-xs text-slate-400 font-semibold">ไม่พบบิลค่าใช้จ่ายที่ตรงกับเงื่อนไข</p>
                  <p className="text-[10px] text-slate-600">กรุณากดปุ่มเพิ่มเพื่อบันทึกรายการบิลประทับจำลองแรกของคุณ</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-[10px] font-bold text-slate-400 uppercase">
                      <th className="py-2.5 pl-2">รายละเอียดรายการบิลจ่าย</th>
                      <th className="py-2.5 text-center">ประเภทภาษี</th>
                      <th className="py-2.5 text-right">จำนวนเงิน</th>
                      <th className="py-2.5 text-center">วันที่บันทึก</th>
                      <th className="py-2.5 text-center pr-2">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-xs">
                    {filteredExpenses.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-900/10">
                        <td className="py-3 pl-2 font-medium text-slate-200">
                          {item.title}
                        </td>
                        <td className="py-3 text-center">
                          {item.category === "40_5" ? (
                            <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/10">
                              40(5) ค่าเช่า
                            </span>
                          ) : (
                            <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/10">
                              40(8) บริการ
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right font-mono text-slate-300 font-bold">
                          {item.amount.toLocaleString()} บาท
                        </td>
                        <td className="py-3 text-center font-mono text-[10px] text-slate-500">
                          {new Date(item.created_at).toLocaleDateString("th-TH", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit"
                          })}
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                              title="แก้ไขบิล"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, item.title)}
                              className="p-1 rounded bg-red-950/30 hover:bg-red-950/60 text-red-400 hover:text-red-300 transition-colors"
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
            )}
          </div>
        </div>

        {/* ฝั่งขวา: เครื่องมือค้นหาและแนะนำประเภทบิลอัจฉริยะ (1 คอลัมน์) */}
        <div className="space-y-4">
          <div className="glass-card rounded-2xl border border-slate-900/60 p-5 space-y-4 shadow-sm flex flex-col h-full max-h-[640px]">
            <div>
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase">
                <QuestionIcon className="w-4 h-4 text-blue-400" /> แนะนำการเลือกประเภทบิล
              </h3>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                พิมพ์ค้นหารายการบิลค่าใช้จ่ายของหอพัก เพื่อดูคำแนะนำว่าต้องยื่นหักเป็นประเภท 40(5) หรือ 40(8) และกดคัดลอกดรอปฟิลด์ได้ทันที
              </p>
            </div>

            {/* ค้นหาในคู่มือ */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="เช่น ค่าน้ำ, หลอดไฟ, ทาสี..."
                value={guideSearch}
                onChange={(e) => setGuideSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>

            {/* สวิตช์ฟิลเตอร์คู่มือ */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-semibold shrink-0">
              <button
                onClick={() => setActiveGuideCategory("all")}
                className={`flex-1 py-1 rounded-lg text-center transition-all ${
                  activeGuideCategory === "all" ? "bg-slate-800 text-slate-200" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                ทั้งหมด
              </button>
              <button
                onClick={() => setActiveGuideCategory("40_5")}
                className={`flex-1 py-1 rounded-lg text-center transition-all ${
                  activeGuideCategory === "40_5" ? "bg-blue-600/15 text-blue-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                40(5) ค่าเช่า
              </button>
              <button
                onClick={() => setActiveGuideCategory("40_8")}
                className={`flex-1 py-1 rounded-lg text-center transition-all ${
                  activeGuideCategory === "40_8" ? "bg-teal-600/15 text-teal-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                40(8) บริการ
              </button>
            </div>

            {/* ลิสต์ผลลัพธ์คู่มือ */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
              {filteredGuide.length === 0 ? (
                <div className="p-8 text-center text-slate-600 text-[11px] leading-relaxed">
                  ไม่พบข้อแนะนำสำหรับ "{guideSearch}"<br />กรุณาลองพิมพ์คำสำคัญคำอื่น เช่น น้ำ, ไฟ, ซ่อม
                </div>
              ) : (
                filteredGuide.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl hover:border-slate-700/60 group transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-200">{item.name}</span>
                      <button
                        onClick={() => applyGuideToForm(item.name, item.category as "40_5" | "40_8")}
                        className="text-[9px] font-bold text-teal-400 group-hover:text-teal-300 flex items-center gap-0.5 whitespace-nowrap bg-teal-500/5 px-1.5 py-0.5 rounded border border-teal-500/10 opacity-80 group-hover:opacity-100 transition-all"
                      >
                        ใช้รายการนี้ <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-1.5 mt-1">
                      {item.category === "40_5" ? (
                        <span className="text-[8px] font-bold uppercase tracking-wide bg-blue-500/10 text-blue-400 px-1 py-0.2 rounded font-mono">
                          มาตรา {item.categoryText}
                        </span>
                      ) : (
                        <span className="text-[8px] font-bold uppercase tracking-wide bg-teal-500/10 text-teal-400 px-1 py-0.2 rounded font-mono">
                          มาตรา {item.categoryText}
                        </span>
                      )}
                    </div>

                    <p className="text-[9px] text-slate-500 leading-relaxed mt-1.5">
                      {item.desc}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal บันทึกบิลรายวัน */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                  <Coins className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm">
                    {editingExpense ? "แก้ไขบิลค่าใช้จ่ายรายวัน" : "บันทึกบิลค่าใช้จ่ายรายวันใหม่"}
                  </h3>
                  <p className="text-[10px] text-slate-500">ปีภาษี {taxYear}</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* รายละเอียดบิล */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">รายละเอียดรายการบิลจ่าย <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ค่าทาสีห้องพัก, หลอดไฟทางเดิน"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
              </div>

              {/* จำนวนเงิน */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">จำนวนเงินบิล (บาท) <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-12 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-xs text-slate-500 font-medium">
                    บาท
                  </div>
                </div>
              </div>

              {/* ประเภทค่าใช้จ่าย */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">ประเภทค่าใช้จ่ายหักตามจริง <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-3">
                  {/* 40(5) */}
                  <button
                    type="button"
                    onClick={() => setFormCategory("40_5")}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all duration-200 ${
                      formCategory === "40_5"
                        ? "bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/40"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-[10px] font-bold text-blue-400 font-mono">ม. 40(5)</span>
                      <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                        formCategory === "40_5" ? "border-blue-500 bg-blue-500" : "border-slate-600"
                      }`}>
                        {formCategory === "40_5" && <div className="w-1 h-1 rounded-full bg-white" />}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-200">ค่าเช่าอาคาร</span>
                    <span className="text-[9px] text-slate-500 leading-relaxed mt-0.5">โครงสร้างตึกและสิ่งปลูกสร้างหลัก</span>
                  </button>

                  {/* 40(8) */}
                  <button
                    type="button"
                    onClick={() => setFormCategory("40_8")}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all duration-200 ${
                      formCategory === "40_8"
                        ? "bg-teal-500/10 border-teal-500/40 ring-1 ring-teal-500/40"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-[10px] font-bold text-teal-400 font-mono">ม. 40(8)</span>
                      <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                        formCategory === "40_8" ? "border-teal-500 bg-teal-500" : "border-slate-600"
                      }`}>
                        {formCategory === "40_8" && <div className="w-1 h-1 rounded-full bg-white" />}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-200">บริการ/สาธารณูปโภค</span>
                    <span className="text-[9px] text-slate-500 leading-relaxed mt-0.5">น้ำไฟส่วนกลาง และพนักงานดูแลตึก</span>
                  </button>
                </div>
              </div>

              {/* ข้อแนะนำไดนามิก */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px] leading-relaxed text-slate-400 space-y-1">
                <div className="flex items-center gap-1 font-bold text-slate-200">
                  <Info className={`w-3.5 h-3.5 ${formCategory === "40_5" ? "text-blue-400" : "text-teal-400"}`} />
                  <span>เกร็ดความรู้ภาษี:</span>
                </div>
                {formCategory === "40_5" ? (
                  <p>
                    <span className="text-blue-400 font-semibold">มาตรา 40(5)</span> สรรพากรยอมให้เลือกหักค่าใช้จ่ายเหมา 30% ได้ หากรายจ่ายบิลจริงรวมกันทั้งปีไม่ถึง 30% แนะนำให้ยื่นหักแบบเหมาจะประหยัดกว่า
                  </p>
                ) : (
                  <p>
                    <span className="text-teal-400 font-semibold">มาตรา 40(8)</span> สรรพากรบังคับหักตามจริงเท่านั้น และต้องมีหลักฐานใบกำกับภาษีหรือใบเสร็จอย่างเป็นทางการเก็บไว้อย่างน้อย 5 ปี ห้ามใช้การหักเหมา
                  </p>
                )}
              </div>
            </form>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 rounded-xl text-xs font-semibold transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-teal-500/10 hover:shadow-teal-500/20 active:scale-95 transition-all"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    บันทึกรายการบิล
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
