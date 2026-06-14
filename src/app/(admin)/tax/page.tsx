"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
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
  TrendingUp
} from "lucide-react"

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

export default function TaxPage() {
  const [taxYear, setTaxYear] = useState("2026")

  // โหลดข้อมูลผู้เสียภาษีจากตั้งค่าการเงิน
  const [firstName, setFirstName] = useState("สมเจตน์")
  const [lastName, setLastName] = useState("แสนสุข")
  const [taxId, setTaxId] = useState("1100100222333")
  const [address, setAddress] = useState("123/45 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310")
  const [phone, setPhone] = useState("089-999-9999")
  const [loadingPdf, setLoadingPdf] = useState<"90" | "94" | null>(null)

  // แหล่งที่มาของข้อมูลการคำนวณภาษี
  const [dataSource, setDataSource] = useState<"system" | "manual">("system")
  const [manualRent405, setManualRent405] = useState(1188000)
  const [manualUtilities408, setManualUtilities408] = useState(591000)

  // วิธีหักค่าใช้จ่ายสำหรับมาตรา 40(5)
  const [deductionMethod405, setDeductionMethod405] = useState<"เหมา 60%" | "เหมา 30%" | "ตามจริง">("เหมา 60%")
  const [actualExpense405, setActualExpense405] = useState(0)
  const [actualExpense408, setActualExpense408] = useState(320000)

  const [bills, setBills] = useState<BillItem[]>([])

  useEffect(() => {
    // 1. โหลดข้อมูลผู้เสียภาษี
    const savedFirstName = localStorage.getItem("horset_tax_firstname")
    const savedLastName = localStorage.getItem("horset_tax_lastname")
    const savedTaxId = localStorage.getItem("horset_tax_id")
    const savedAddress = localStorage.getItem("horset_tax_address")
    const savedPhone = localStorage.getItem("horset_tax_phone")

    if (savedFirstName) setFirstName(savedFirstName)
    if (savedLastName) setLastName(savedLastName)
    if (savedTaxId) setTaxId(savedTaxId)
    if (savedAddress) setAddress(savedAddress)
    if (savedPhone) setPhone(savedPhone)

    // 2. โหลดบิลจากระบบ
    const savedBills = localStorage.getItem("horset_bills")
    if (savedBills) {
      try {
        setBills(JSON.parse(savedBills))
      } catch (e) {
        console.error("Failed to parse bills", e)
      }
    }

    // 3. โหลดการตั้งค่าการคำนวณภาษี
    const savedDataSource = localStorage.getItem("horset_tax_datasource") as "system" | "manual" | null
    const savedManualRent = localStorage.getItem("horset_tax_manual_rent405")
    const savedManualUtil = localStorage.getItem("horset_tax_manual_utilities408")
    const savedDedMethod = localStorage.getItem("horset_tax_deduction_method_405") as any
    const savedActExp405 = localStorage.getItem("horset_tax_actual_expense_405")
    const savedActExp408 = localStorage.getItem("horset_tax_actual_expense_408")

    if (savedDataSource) setDataSource(savedDataSource)
    if (savedManualRent) setManualRent405(Number(savedManualRent))
    if (savedManualUtil) setManualUtilities408(Number(savedManualUtil))
    if (savedDedMethod) setDeductionMethod405(savedDedMethod)
    if (savedActExp405) setActualExpense405(Number(savedActExp405))
    if (savedActExp408) setActualExpense408(Number(savedActExp408))
  }, [])

  // บันทึกการตั้งค่ากลับไปยัง localStorage เมื่อมีการเปลี่ยนแปลง
  const handleDataSourceChange = (val: "system" | "manual") => {
    setDataSource(val)
    localStorage.setItem("horset_tax_datasource", val)
  }

  const handleManualRentChange = (val: number) => {
    setManualRent405(val)
    localStorage.setItem("horset_tax_manual_rent405", String(val))
  }

  const handleManualUtilChange = (val: number) => {
    setManualUtilities408(val)
    localStorage.setItem("horset_tax_manual_utilities408", String(val))
  }

  const handleDeductionMethodChange = (val: "เหมา 60%" | "เหมา 30%" | "ตามจริง") => {
    setDeductionMethod405(val)
    localStorage.setItem("horset_tax_deduction_method_405", val)
  }

  const handleActualExpense405Change = (val: number) => {
    setActualExpense405(val)
    localStorage.setItem("horset_tax_actual_expense_405", String(val))
  }

  const handleActualExpense408Change = (val: number) => {
    setActualExpense408(val)
    localStorage.setItem("horset_tax_actual_expense_408", String(val))
  }

  // อัตราการคำนวณบิล
  const electricRate = 7
  const waterRate = 18

  // คัดกรองบิลตามปีภาษีที่เลือกและสถานะที่ชำระเงินแล้ว
  const paidBillsInYear = bills.filter(bill => {
    const isPaid = bill.status === "paid"
    const matchesYear = bill.billingCycle && bill.billingCycle.startsWith(taxYear)
    return isPaid && matchesYear
  })

  // คำนวณรายได้จากบิลจริง
  let calculatedRent405Full = 0
  let calculatedUtilities408Full = 0
  let calculatedRent405Half = 0
  let calculatedUtilities408Half = 0

  paidBillsInYear.forEach(bill => {
    const electricUnits = Number(bill.electricUnits || 0)
    const waterUnits = Number(bill.waterUnits || 0)
    const utilitiesAmount = (electricUnits * electricRate) + (waterUnits * waterRate)
    const billAmount = Number(bill.amount || 0)
    const rentAmount = billAmount - utilitiesAmount

    calculatedRent405Full += rentAmount
    calculatedUtilities408Full += utilitiesAmount

    // ครึ่งปีแรก (เดือน 01 - 06)
    const cycleParts = bill.billingCycle.split("-")
    const monthNum = cycleParts[1] ? parseInt(cycleParts[1], 10) : 0
    if (monthNum >= 1 && monthNum <= 6) {
      calculatedRent405Half += rentAmount
      calculatedUtilities408Half += utilitiesAmount
    }
  })

  const hasPaidBills = paidBillsInYear.length > 0

  // 1. รายได้รวมมาตรา 40(5) (ค่าเช่าทรัพย์สิน)
  const rent405Full = dataSource === "system" && hasPaidBills
    ? calculatedRent405Full
    : (dataSource === "system" ? 1188000 : manualRent405)

  // 2. รายได้รวมมาตรา 40(8) (ค่าบริการและสาธารณูปโภค)
  const utilities408Full = dataSource === "system" && hasPaidBills
    ? calculatedUtilities408Full
    : (dataSource === "system" ? 591000 : manualUtilities408)

  // ครึ่งปี
  const rent405Half = dataSource === "system" && hasPaidBills
    ? calculatedRent405Half
    : (dataSource === "system" ? 594000 : manualRent405 / 2)

  const utilities408Half = dataSource === "system" && hasPaidBills
    ? calculatedUtilities408Half
    : (dataSource === "system" ? 295500 : manualUtilities408 / 2)

  // การคำนวณหักค่าใช้จ่ายสำหรับ 40(5)
  // เต็มปี
  const getDeduction405Full = () => {
    if (deductionMethod405 === "เหมา 60%") return rent405Full * 0.60
    if (deductionMethod405 === "เหมา 30%") return rent405Full * 0.30
    return actualExpense405
  }
  const deductionRent405Full = getDeduction405Full()

  // ครึ่งปี
  const getDeduction405Half = () => {
    if (deductionMethod405 === "เหมา 60%") return rent405Half * 0.60
    if (deductionMethod405 === "เหมา 30%") return rent405Half * 0.30
    return actualExpense405 / 2
  }
  const deductionRent405Half = getDeduction405Half()

  // การคำนวณหักค่าใช้จ่ายสำหรับ 40(8) (ตามจริงเท่านั้น)
  const deductionUtilities408Full = actualExpense408
  const deductionUtilities408Half = actualExpense408 / 2

  // รายได้สุทธิประเมิน
  const fullTotalRevenue = rent405Full + utilities408Full
  const netIncomeFull = fullTotalRevenue - (deductionRent405Full + deductionUtilities408Full)

  const halfTotalRevenue = rent405Half + utilities408Half
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
        utilities408: type === "90" ? utilities408Full : utilities408Half * 2,
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
    <DashboardLayout role="admin">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">สรุปข้อมูลเพื่อการยื่นภาษีเงินได้</h2>
          <p className="text-xs text-slate-400 mt-1">คัดแยกรายได้อพาร์ทเมนท์ตามกฎหมายสรรพากรไทย ภ.ง.ด. 94 และ ภ.ง.ด. 90</p>
        </div>
        
        <div className="flex gap-3">
          <select
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none text-slate-200 text-xs font-semibold"
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
      <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-400">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">⚠️ ข้อสงวนสิทธิ์ทางกฎหมาย (Legal Disclaimer)</p>
          <p className="text-slate-400 leading-relaxed">
            ข้อมูลการคำนวณและรายงานตัวเลขรายได้ในหน้านี้ จัดทำขึ้นเพื่อใช้เป็นข้อมูลอ้างอิงเบื้องต้นในการคำนวณภาษีเท่านั้น ผู้ใช้งานต้องนำส่งแบบฟอร์มภาษีและตรวจสอบเอกสารความถูกต้องด้วยตนเองผ่านช่องทางระบบอย่างเป็นทางการของกรมสรรพากรอีกครั้ง
          </p>
        </div>
      </div>

      {/* ส่วนตั้งค่าแหล่งข้อมูลการคำนวณและลดหย่อนภาษี */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* คอนฟิกแหล่งข้อมูล */}
        <div className="glass-card p-6 rounded-2xl border border-slate-900/60 space-y-6">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-900 pb-3">
            <Database className="w-4 h-4 text-blue-500" /> แหล่งข้อมูลรายได้ภาษี
          </h3>
          
          <div className="space-y-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleDataSourceChange("system")}
                className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-2 ${
                  dataSource === "system"
                    ? "bg-blue-600/10 border-blue-500 text-blue-400"
                    : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <Database className="w-3.5 h-3.5" /> ดึงข้อมูลอัตโนมัติจากระบบ
              </button>
              <button
                type="button"
                onClick={() => handleDataSourceChange("manual")}
                className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-2 ${
                  dataSource === "manual"
                    ? "bg-blue-600/10 border-blue-500 text-blue-400"
                    : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <Settings className="w-3.5 h-3.5" /> กำหนดตัวเลขเอง
              </button>
            </div>

            {dataSource === "system" ? (
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-900 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">สถานะดึงข้อมูลบิล:</span>
                  {hasPaidBills ? (
                    <span className="inline-flex items-center gap-1 text-teal-400 font-semibold bg-teal-500/10 px-2 py-0.5 rounded-full text-[10px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" /> ดึงข้อมูลจริงจากระบบสำเร็จ ({paidBillsInYear.length} บิล)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-full text-[10px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> ใช้ข้อมูลจำลองชั่วคราว (ยังไม่มีบิลชำระในปีนี้)
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {hasPaidBills 
                    ? `ระบบทำการรวมรายได้จากบิลค่าเช่าในระบบที่เปลี่ยนสถานะเป็น "ชำระแล้ว" ในปี ${taxYear} โดยคำนวณแยกตามมิเตอร์และค่าเช่าสุทธิ`
                    : `เนื่องจากไม่พบประวัติบิลที่ชำระเงินในปี ${taxYear} ระบบจึงใช้อัตราค่าเช่าจำลอง 99,000 บ./เดือน และค่าน้ำไฟเฉลี่ยรวม 49,250 บ./เดือน เพื่อแสดงแนวทางการทำงาน ท่านสามารถป้อนตัวเลขเองได้โดยเปลี่ยนเป็นโหมด "กำหนดตัวเลขเอง"`
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium">ป้อนรายได้เช่า 40(5) ทั้งปี (บาท)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs font-mono"
                    value={manualRent405}
                    onChange={(e) => handleManualRentChange(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium">ป้อนรายได้สาธารณูปโภค 40(8) ทั้งปี (บาท)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs font-mono"
                    value={manualUtilities408}
                    onChange={(e) => handleManualUtilChange(Number(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* คอนฟิกค่าใช้จ่ายและการหักค่าใช้จ่าย */}
        <div className="glass-card p-6 rounded-2xl border border-slate-900/60 space-y-6">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-900 pb-3">
            <Sliders className="w-4 h-4 text-teal-500" /> การคำนวณหักค่าใช้จ่ายทางภาษี
          </h3>
          
          <div className="space-y-4">
            {/* 40(5) Deduction Select */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-400 font-medium">รูปแบบการหักรายจ่ายของ ค่าเช่า 40(5)</label>
                <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full font-semibold">มาตรา 40(5)</span>
              </div>
              <div className="flex gap-2">
                {(["เหมา 60%", "เหมา 30%", "ตามจริง"] as const).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => handleDeductionMethodChange(method)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                      deductionMethod405 === method
                        ? "bg-teal-600/10 border-teal-500 text-teal-400"
                        : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
              
              {deductionMethod405 === "ตามจริง" && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] text-slate-400 font-medium">ค่าใช้จ่ายจริงในการดำเนินงานเช่าหอพักสะสมต่อปี (บาท)</label>
                  <input
                    type="number"
                    placeholder="ป้อนค่าใช้จ่ายในการซ่อมแซมใหญ่ โครงสร้าง หรือดูแลผู้เช่า..."
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-200 text-xs font-mono"
                    value={actualExpense405}
                    onChange={(e) => handleActualExpense405Change(Number(e.target.value))}
                  />
                </div>
              )}
            </div>

            {/* 40(8) Deduction (Actual only) */}
            <div className="space-y-2 border-t border-slate-900/60 pt-3">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-400 font-medium">ค่าใช้จ่ายจริงที่เกิดขึ้นของค่าน้ำไฟ/บริการ 40(8) ทั้งปี (บาท)</label>
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-semibold">มาตรา 40(8) หักจริงเท่านั้น</span>
              </div>
              <input
                type="number"
                placeholder="เช่น ค่าน้ำไฟหลวงรวมที่จ่ายให้รัฐบาล ค่าจ้างพนักงานจดหน่วย..."
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-teal-500 text-slate-200 text-xs font-mono"
                value={actualExpense408}
                onChange={(e) => handleActualExpense408Change(Number(e.target.value))}
              />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                * ตามกฎหมาย รายรับน้ำไฟ/บริการของธุรกิจอพาร์ทเมนท์ไม่สามารถหักแบบเหมาได้ ต้องหักจากรายจ่ายจริงสะสมเพื่อคำนวณกำไรสุทธิ
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* การแบ่งประเภทรายได้และเปรียบเทียบการหักลดหย่อน */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* รายได้ประเภทที่ 40(5) */}
        <div className="glass-card p-6 rounded-2xl border border-slate-900/60 space-y-4">
          <div className="flex justify-between items-start">
            <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">มาตรา 40(5)</span>
            <Landmark className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">รายได้ค่าเช่าทรัพย์สิน (ห้องพัก)</h3>
            <p className="text-xl font-bold mt-1 text-slate-100">{rent405Full.toLocaleString()} บาท</p>
          </div>
          <div className="text-[10px] text-slate-400 leading-relaxed space-y-1">
            <p>เงินได้ประเภทนี้สามารถหักค่าใช้จ่ายตามแบบที่ท่านเลือกด้านบน:</p>
            <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-900 text-slate-300 font-medium">
              หักแบบ{deductionMethod405} : <span className="text-blue-400 font-bold">{deductionRent405Full.toLocaleString()} บาท</span>
            </div>
          </div>
        </div>

        {/* รายได้ประเภทที่ 40(8) */}
        <div className="glass-card p-6 rounded-2xl border border-slate-900/60 space-y-4">
          <div className="flex justify-between items-start">
            <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400">มาตรา 40(8)</span>
            <Landmark className="w-5 h-5 text-teal-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">รายได้ค่าสาธารณูปโภคและบริการ</h3>
            <p className="text-xl font-bold mt-1 text-slate-100">{utilities408Full.toLocaleString()} บาท</p>
          </div>
          <div className="text-[10px] text-slate-400 leading-relaxed space-y-1">
            <p>ค่าน้ำประปา ค่ากระแสไฟฟ้า และบริการสิ่งอำนวยความสะดวก ต้องหักตามจริง:</p>
            <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-900 text-slate-300 font-medium">
              หักรายจ่ายตามจริง : <span className="text-teal-400 font-bold">{deductionUtilities408Full.toLocaleString()} บาท</span>
            </div>
          </div>
        </div>

        {/* รายจ่ายจริงสะสม */}
        <div className="glass-card p-6 rounded-2xl border border-slate-900/60 space-y-4">
          <div className="flex justify-between items-start">
            <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">รายจ่ายสะสม</span>
            <Calculator className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">รายจ่ายรวมที่ใช้ยื่นหักลดหย่อน</h3>
            <p className="text-xl font-bold mt-1 text-slate-100">{(deductionRent405Full + deductionUtilities408Full).toLocaleString()} บาท</p>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            เป็นการรวมค่าใช้จ่ายหักเหมาหรือตามจริงของค่าเช่าห้อง {deductionRent405Full.toLocaleString()} บ. และค่าน้ำไฟหลวงสะสมที่ท่านได้ระบุด้านบน {deductionUtilities408Full.toLocaleString()} บ.
          </p>
        </div>
      </div>

      {/* ตารางแสดงรายรับรายเดือน */}
      <div className="glass-card rounded-2xl border border-slate-900/60 p-6">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-blue-500" /> ตารางสรุปรายได้สะสมรายเดือน ({taxYear})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-900 text-slate-500 font-semibold">
                <th className="pb-3 pl-2">เดือน</th>
                <th className="pb-3 text-center">จำนวนบิลจริงที่รับเงิน</th>
                <th className="pb-3 text-right">ค่าเช่า 40(5)</th>
                <th className="pb-3 text-right">สาธารณูปโภค 40(8)</th>
                <th className="pb-3 text-right">รวมรายได้ประเมิน</th>
                <th className="pb-3 text-center">สถานะข้อมูล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/40">
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
                  <tr key={m.num} className="hover:bg-slate-900/10">
                    <td className="py-3 pl-2 font-medium text-slate-200">{m.name}</td>
                    <td className="py-3 text-center text-slate-400">
                      {dataSource === "system" && hasPaidBills ? `${paidBillsInMonth.length} ห้อง` : "-"}
                    </td>
                    <td className="py-3 text-right text-slate-300 font-mono">{Math.round(monthlyRent).toLocaleString()} บาท</td>
                    <td className="py-3 text-right text-slate-300 font-mono">{Math.round(monthlyUtil).toLocaleString()} บาท</td>
                    <td className="py-3 text-right text-teal-400 font-bold font-mono">{Math.round(monthlyTotal).toLocaleString()} บาท</td>
                    <td className="py-3 text-center">
                      {hasRealData ? (
                        <span className="inline-block text-[8px] font-bold px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-400">บิลจริง</span>
                      ) : (
                        <span className="inline-block text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">คำนวณจำลอง</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* แถวการคำนวณแบ่งยื่นครึ่งปีและเต็มปี */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ครึ่งปี ภ.ง.ด. 94 */}
        <div className="glass-card rounded-2xl border border-slate-900/60 p-6 space-y-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-500" /> 1. แบบยื่นภาษีเงินได้ครึ่งปี (ภ.ง.ด. 94)
          </h3>
          
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-400"><span>รายได้ครึ่งปีแรก (ม.ค. - มิ.ย.):</span><span className="font-semibold text-slate-200">{halfTotalRevenue.toLocaleString()} บาท</span></div>
            <div className="flex justify-between text-slate-400"><span>หักค่าใช้จ่าย ({deductionMethod405}) ของค่าเช่าห้อง:</span><span className="font-semibold text-red-400">-{deductionRent405Half.toLocaleString()} บาท</span></div>
            <div className="flex justify-between text-slate-400"><span>หักค่าใช้จ่ายจริงของค่าน้ำไฟ (ครึ่งปี):</span><span className="font-semibold text-red-400">-{deductionUtilities408Half.toLocaleString()} บาท</span></div>
            <div className="h-px bg-slate-900 my-2" />
            <div className="flex justify-between font-bold text-slate-200"><span>เงินได้สุทธิประเมินครึ่งปี:</span><span className="text-blue-400">{netIncomeHalf.toLocaleString()} บาท</span></div>
          </div>
          
          <div className="p-3.5 bg-slate-900/60 rounded-xl text-[10px] text-slate-400 leading-relaxed">
            <span className="font-bold text-slate-300">ระยะเวลาการยื่นแบบ:</span> ปกติยื่นระหว่างเดือนกรกฎาคม ถึง กันยายนของปีนั้นๆ เป็นการเสียภาษีล่วงหน้าสำหรับรายได้ในช่วงครึ่งปีแรก
          </div>

          <button
            onClick={() => handleDownloadPdf("94")}
            disabled={loadingPdf !== null}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-blue-600/10 transition-colors"
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
        <div className="glass-card rounded-2xl border border-slate-900/60 p-6 space-y-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-teal-500" /> 2. แบบยื่นภาษีเงินได้ปลายปี (ภ.ง.ด. 90)
          </h3>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-400"><span>รายได้เต็มปีสะสม (12 เดือน):</span><span className="font-semibold text-slate-200">{fullTotalRevenue.toLocaleString()} บาท</span></div>
            <div className="flex justify-between text-slate-400"><span>หักค่าใช้จ่าย ({deductionMethod405}) ของค่าเช่าห้อง:</span><span className="font-semibold text-red-400">-{deductionRent405Full.toLocaleString()} บาท</span></div>
            <div className="flex justify-between text-slate-400"><span>หักค่าใช้จ่ายจริงค่าน้ำไฟ (หักตามจริงเต็มปี):</span><span className="font-semibold text-red-400">-{deductionUtilities408Full.toLocaleString()} บาท</span></div>
            <div className="h-px bg-slate-900 my-2" />
            <div className="flex justify-between font-bold text-slate-200"><span>เงินได้สุทธิประเมินเต็มปี:</span><span className="text-teal-400">{netIncomeFull.toLocaleString()} บาท</span></div>
          </div>

          <div className="p-3.5 bg-slate-900/60 rounded-xl text-[10px] text-slate-400 leading-relaxed">
            <span className="font-bold text-slate-300">ระยะเวลาการยื่นแบบ:</span> ยื่นระหว่างเดือนมกราคม ถึง มีนาคมของปีถัดไป โดยสามารถนำตัวเลขที่จ่ายภาษี ภ.ง.ด. 94 ไปหักลดหย่อนภาษีที่ชำระไว้แล้วครึ่งปีได้
          </div>

          <button
            onClick={() => handleDownloadPdf("90")}
            disabled={loadingPdf !== null}
            className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-teal-600/10 transition-colors"
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
    </DashboardLayout>
  )
}
