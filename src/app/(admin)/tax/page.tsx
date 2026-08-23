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
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Info,
  Coins,
  Calendar,
  Zap,
  Droplet,
  Wrench,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  AlertCircle,
  X
} from "lucide-react"
import { getExpenses, ExpenseItem } from "@/features/expenses/actions"
import { getFinanceSettings, saveTaxSettings } from "@/features/finance/actions"
import { getRooms } from "@/features/room/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { getBills } from "@/features/billing/actions"
import { getTenants, getCancelledContracts, migrateLocalStorageCancelledContracts } from "@/features/tenant/actions"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { DEFAULT_STAFF_PERMISSIONS } from "@/features/permissions/types"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import {
  loadTaxDataset,
  filePitReturn,
  getPitFilingSnapshot,
  getPp30Filings,
  upsertPp30Filing,
  getTaxDeductions,
  getPitFilings,
} from "@/features/tax/actions"
import { assertWorkspaceFeatureEnabled } from "@/features/subscription/actions"
import {
  VatGate,
  VatNotRegisteredOnly,
  VatThresholdCard,
  TaxOverviewDashboard,
  MonthlyVatOverviewTable,
  VatSettingsSection,
  TaxpayerTypeSection,
  ExpenseModeSection,
  MinTaxRuleSection,
  PersonalAllowanceLockNotice,
  ProgressiveBracketTable,
  PitBalanceSummary,
  PitComparisonTable,
  Pp30Report,
  Pp30FilingForm,
} from "@/features/tax/components"
import { useVatStatus, useTaxOverview, usePp30 } from "@/features/tax/hooks/useTax"
import { firstThresholdBreach, DEFAULT_TAX_SETTINGS, todayISO } from "@/lib/tax"
import { toCsv, downloadCsv, thaiMonth } from "@/lib/tax/format"
import { capActualExpenseDeduction, computePitBreakdown } from "@/lib/thaiTax"
import type { TaxDataset, TaxSettings, Pp30Filing, Pp30Row } from "@/types/tax"

interface BillItem {
  id: string
  roomNumber: string
  /** rooms.id ของห้องที่ออกบิลใบนี้ — ใช้จับคู่หาค่าเช่าฐาน (ดู findRoomFor) */
  roomId?: string | null
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

function formatMoney(val: number | string): string {
  const num = Number(val || 0)
  return num.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function TaxPage() {
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const { t, locale } = useLanguage()
  const [taxYear, setTaxYear] = useState("2026")
  const [hasEditPermission, setHasEditPermission] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

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
  // ที่อยู่ช่องย่อยเพิ่มเติมที่ไม่ได้รวมอยู่ใน address (tax_address) — ใช้กรอกแบบฟอร์ม ภ.ง.ด. 94 โดยเฉพาะ
  const [addressBuilding, setAddressBuilding] = useState("")
  const [addressRoom, setAddressRoom] = useState("")
  const [addressFloor, setAddressFloor] = useState("")
  const [addressVillage, setAddressVillage] = useState("")
  const [addressMoo, setAddressMoo] = useState("")
  const [addressSoi, setAddressSoi] = useState("")
  const [addressYaek, setAddressYaek] = useState("")
  const [loadingPdf, setLoadingPdf] = useState<"90" | "94" | null>(null)

  // ============================================================================
  // ฟีเจอร์ VAT + ภ.พ.30 + ส่วนขยาย ภ.ง.ด.90/94 — ดู src/features/tax/, src/lib/tax
  // ============================================================================

  // TaxDataset เต็มชุด (ใช้กับ VAT/ภ.พ.30 เท่านั้น) — เริ่มเป็นค่าว่างที่ถูกต้องตาม type เสมอ
  // เพื่อให้ hooks (useVatStatus/useTaxOverview/usePp30) เรียกได้แน่นอนทุก render ไม่ต้องมีเงื่อนไข
  const [taxDataset, setTaxDataset] = useState<TaxDataset>({
    incomes: [],
    expenses: [],
    settings: DEFAULT_TAX_SETTINGS as TaxSettings,
    deductions: [],
    pp30Filings: [],
    pitFilings: [],
  })
  const [taxDatasetLoaded, setTaxDatasetLoaded] = useState(false)
  const [savingVatSettings, setSavingVatSettings] = useState(false)

  // สถานะผู้เสียภาษี — มาจาก taxDataset.settings แหล่งเดียว (แก้ไขได้ที่หน้าตั้งค่าการเงินเท่านั้น
  // ดู FinanceSettingsTab.tsx) ไม่มี state แยกในหน้านี้อีกต่อไป กันไม่ให้ค่าไม่ sync กันระหว่างจอ
  const taxpayerStatus = taxDataset.settings.taxpayerType
  const partnerCount = taxDataset.settings.partnerCount

  const vatStatus = useVatStatus(taxDataset)
  const vatBreach = firstThresholdBreach(taxDataset.incomes, taxDataset.settings)
  const taxOverview = useTaxOverview(taxDataset, Number(taxYear))
  const pp30 = usePp30(taxDataset, Number(taxYear))

  // ⚠️ ตัวเลข ภ.ง.ด.90/94 ที่ใช้ยื่นจริง (แสดงใน PitBreakdown ด้านล่าง) คำนวณผ่าน
  // computePitBreakdown() (src/lib/thaiTax.ts เท่านั้น) — ห้ามใช้ taxDataset/lib-tax/pit.ts
  // คำนวณตัวเลขชุดนี้ เพื่อให้ตรงกับ PDF ที่ดาวน์โหลดเป๊ะ (ดู useMemo ท้ายไฟล์ที่ประกอบ pitResult90/94)
  type PitFilingSnapshot = NonNullable<Awaited<ReturnType<typeof getPitFilingSnapshot>>["data"]>
  const [pitFiledSnapshot90, setPitFiledSnapshot90] = useState<PitFilingSnapshot | null>(null)
  const [pitFiledSnapshot94, setPitFiledSnapshot94] = useState<PitFilingSnapshot | null>(null)
  const [filingPit, setFilingPit] = useState<"90" | "94" | null>(null)

  // Modal กรอกภาษีซื้อ/ยื่น ภ.พ.30 รายเดือน — เปิดจากปุ่มใน <Pp30Report onOpenFiling>
  const [filingPp30Row, setFilingPp30Row] = useState<Pp30Row | null>(null)
  const [savingPp30, setSavingPp30] = useState(false)

  const handleVatSettingsChange = async (patch: Partial<TaxSettings>) => {
    const previousSettings = taxDataset.settings
    const nextSettings = { ...previousSettings, ...patch } as TaxSettings
    setTaxDataset(prev => ({ ...prev, settings: nextSettings }))
    if (!workspaceId) return
    setSavingVatSettings(true)
    try {
      const res = await saveTaxSettings(workspaceId, {
        taxpayer_status: nextSettings.taxpayerType, partner_count: nextSettings.partnerCount,
        vat_registered: nextSettings.vatRegistered,
        vat_registered_from: nextSettings.vatRegisteredFrom ? `${nextSettings.vatRegisteredFrom}-01` : null,
        vat_rate: nextSettings.vatRate,
        vat_threshold: nextSettings.vatThreshold,
        vat_opening_credit: nextSettings.vatOpeningCredit,
        expense_a_mode: nextSettings.expenseA.mode, expense_a_lump_rate: nextSettings.expenseA.lumpRate,
        expense_b_mode: nextSettings.expenseB.mode, expense_b_lump_rate: nextSettings.expenseB.lumpRate,
        cap_expense_per_bucket: nextSettings.capExpensePerBucket,
        min_tax_enabled: nextSettings.minTaxRule.enabled, min_tax_rate: nextSettings.minTaxRule.rate,
        min_tax_threshold_pnd90: nextSettings.minTaxRule.incomeThresholdPND90,
        min_tax_threshold_pnd94: nextSettings.minTaxRule.incomeThresholdPND94,
        min_tax_exempt_below: nextSettings.minTaxRule.exemptBelow,
      })
      if (res.success) {
        clearWorkspaceCache(workspaceId)
      } else {
        setTaxDataset(prev => ({ ...prev, settings: previousSettings }))
        alert(res.error || "เกิดข้อผิดพลาดในการบันทึกการตั้งค่า กรุณาลองใหม่อีกครั้ง")
      }
    } finally {
      setSavingVatSettings(false)
    }
  }

  // upsertPp30Filing เขียนทับทุกคอลัมน์ตามที่ส่งไป (ไม่ merge บางส่วนให้) จึงต้องรวมค่าที่ยังไม่แตะ
  // จาก filing เดิมเข้าไปด้วยเสมอ กัน field อื่นหายตอน upsert — Pp30FilingForm ไม่ส่ง filedAt มาด้วยแล้ว
  // (ปุ่ม "บันทึก" ในฟอร์มมีไว้บันทึกยอดภาษีขาย/ซื้อเท่านั้น ไม่แตะสถานะยื่น — ดู onMarkFiled แยกต่างหาก)
  // จึงต้องคงค่า filedAt เดิมไว้เสมอตรงนี้ ไม่ default เป็น null มิฉะนั้นเดือนที่ยื่นแล้วจะถูกยกเลิกโดยไม่ตั้งใจ
  const handleSubmitPp30Filing = async (patch: Pp30Filing) => {
    if (!workspaceId) return
    const previousFilings = taxDataset.pp30Filings
    const existing = previousFilings.find(f => f.period === patch.period)
    const nextFiling: Pp30Filing = {
      period: patch.period,
      outputVatManual: patch.outputVatManual ?? null,
      inputVatManual: patch.inputVatManual ?? null,
      filedAt: patch.filedAt !== undefined ? patch.filedAt : (existing?.filedAt ?? null),
      note: patch.note ?? "",
      paidAmount: existing?.paidAmount ?? null,
    }
    setSavingPp30(true)
    setTaxDataset(prev => ({
      ...prev,
      pp30Filings: [...prev.pp30Filings.filter(f => f.period !== patch.period), nextFiling],
    }))
    try {
      const res = await upsertPp30Filing(workspaceId, patch.period, nextFiling)
      if (res.success) {
        clearWorkspaceCache(workspaceId)
        setFilingPp30Row(null)
      } else {
        setTaxDataset(prev => ({ ...prev, pp30Filings: previousFilings }))
        alert(res.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล ภ.พ.30 กรุณาลองใหม่อีกครั้ง")
      }
    } finally {
      setSavingPp30(false)
    }
  }

  const handleUnfilePp30 = async (period: string) => {
    if (!workspaceId) return
    const previousFilings = taxDataset.pp30Filings
    const existing = previousFilings.find(f => f.period === period)
    const nextFiling: Pp30Filing = {
      period,
      outputVatManual: existing?.outputVatManual ?? null,
      inputVatManual: existing?.inputVatManual ?? null,
      filedAt: null,
      note: existing?.note ?? "",
      paidAmount: existing?.paidAmount ?? null,
    }
    setSavingPp30(true)
    setTaxDataset(prev => ({
      ...prev,
      pp30Filings: [...prev.pp30Filings.filter(f => f.period !== period), nextFiling],
    }))
    try {
      const res = await upsertPp30Filing(workspaceId, period, nextFiling)
      if (res.success) {
        clearWorkspaceCache(workspaceId)
      } else {
        setTaxDataset(prev => ({ ...prev, pp30Filings: previousFilings }))
        alert(res.error || "เกิดข้อผิดพลาดในการยกเลิกการยื่น ภ.พ.30 กรุณาลองใหม่อีกครั้ง")
      }
    } finally {
      setSavingPp30(false)
    }
  }

  // ทำเครื่องหมายว่ายื่นแล้ว (ตั้ง filedAt = วันนี้) — ปุ่มลัดในตารางรายเดือน ไม่เปิด modal
  // ไม่แตะยอดภาษีขาย/ซื้อที่กรอกไว้ก่อนหน้า (ถ้ามี) เก็บค่าเดิมไว้ทั้งหมด
  const handleMarkPp30Filed = async (row: Pp30Row) => {
    if (!workspaceId) return
    const previousFilings = taxDataset.pp30Filings
    const existing = previousFilings.find(f => f.period === row.period)
    const nextFiling: Pp30Filing = {
      period: row.period,
      outputVatManual: existing?.outputVatManual ?? null,
      inputVatManual: existing?.inputVatManual ?? null,
      filedAt: todayISO(),
      note: existing?.note ?? "",
      paidAmount: existing?.paidAmount ?? null,
    }
    setSavingPp30(true)
    setTaxDataset(prev => ({
      ...prev,
      pp30Filings: [...prev.pp30Filings.filter(f => f.period !== row.period), nextFiling],
    }))
    try {
      const res = await upsertPp30Filing(workspaceId, row.period, nextFiling)
      if (res.success) {
        clearWorkspaceCache(workspaceId)
      } else {
        setTaxDataset(prev => ({ ...prev, pp30Filings: previousFilings }))
        alert(res.error || "เกิดข้อผิดพลาดในการทำเครื่องหมายว่ายื่นแล้ว กรุณาลองใหม่อีกครั้ง")
      }
    } finally {
      setSavingPp30(false)
    }
  }

  const handleFilePitReturn = async (form: "90" | "94") => {
    if (!workspaceId) return
    const result = form === "90" ? pitResult90 : pitResult94
    if (!result) return
    setFilingPit(form)
    try {
      const res = await filePitReturn(workspaceId, Number(taxYear), form, result)
      if (res.success) {
        showToast(t("tax_page.filed_success") || "บันทึกการยื่นแบบเรียบร้อยแล้ว")
        const snap = await getPitFilingSnapshot(workspaceId, Number(taxYear), form)
        if (snap.success) {
          if (form === "90") setPitFiledSnapshot90(snap.data)
          else setPitFiledSnapshot94(snap.data)
        }
      } else {
        alert(res.error || "เกิดข้อผิดพลาดในการบันทึกการยื่นแบบ")
      }
    } finally {
      setFilingPit(null)
    }
  }

  // แหล่งที่มาของข้อมูลการคำนวณภาษี
  const [dataSource, setDataSource] = useState<"system" | "manual">("system")
  const [manualRent405, setManualRent405] = useState(0)
  const [manualUtilities408, setManualUtilities408] = useState(0)
  const [manualOther408, setManualOther408] = useState(0)

  // อัตราและข้อมูลตั้งค่าการเงินจริงจากระบบ
  const [electricRate, setElectricRate] = useState(7)
  const [waterRate, setWaterRate] = useState(18)
  const [commonFee, setCommonFee] = useState(50)
  const [rooms, setRooms] = useState<{ roomNumber: string; roomId?: string | null; baseRent: number }[]>([])

  // วิธีหักค่าใช้จ่ายสำหรับมาตรา 40(5) และ 40(8) — มาจาก taxDataset.settings.expenseA/expenseB แหล่งเดียว
  // (แก้ไขได้ผ่านการ์ด ExpenseModeSection เท่านั้น) คง string เดิมไว้เพื่อให้ทุกจุดที่เทียบ === ทำงานต่อได้
  const deductionMethod405: "เหมา 30%" | "ตามจริง" =
    taxDataset.settings.expenseA.mode === "lump" ? "เหมา 30%" : "ตามจริง"
  const deductionMethod408: "เหมา 60%" | "ตามจริง" =
    taxDataset.settings.expenseB.mode === "lump" ? "เหมา 60%" : "ตามจริง"
  const [actualExpense405, setActualExpense405] = useState(0)
  const [actualExpense408, setActualExpense408] = useState(0)

  // ข้อมูลค่าใช้จ่ายจาก DB
  const [expenses, setExpenses] = useState<ExpenseItem[]>([])
  const [loadingExpenses, setLoadingExpenses] = useState(false)

  // สำหรับการซ่อน/แสดงคู่มือคำแนะนำ — ค่าเริ่มต้นซ่อนไว้ก่อน (ปุ่มเปิดดูเน้นสีให้เห็นชัดว่ากดดูได้)
  const [showGuide, setShowGuide] = useState(false)

  const [bills, setBills] = useState<BillItem[]>([])
  // true จนกว่าข้อมูลชุดแรก (รวมถึงประวัติยกเลิกสัญญา) จะโหลดครบ ป้องกันการ์ดสรุปยอดโชว์เลขที่ยังไม่ครบก่อนเด้งเป็นเลขจริง
  const [isSummaryLoading, setIsSummaryLoading] = useState(true)
  // true เมื่อทั้งข้อมูลสรุปเดิม (รายรับ/รายจ่าย/ประวัติยกเลิกสัญญา) และ TaxDataset ของฟีเจอร์ VAT/ภ.พ.30
  // โหลดเสร็จพร้อมกันแล้วเท่านั้น — กันไม่ให้ส่วนเดิมกับส่วนใหม่ของหน้าโชว์ข้อมูลไม่พร้อมกัน (คนละ effect คนละจังหวะโหลด)
  const dataReady = !isSummaryLoading && taxDatasetLoaded

  useEffect(() => {
    async function loadInitialData() {
      setIsSummaryLoading(true)
      setTaxDatasetLoaded(false)
      // เก็บข้อมูล "ดิบ" ที่ query มาแล้วระหว่างทาง (ก่อนแปลงรูปเป็น state เฉพาะของหน้านี้) ไว้ส่งต่อให้
      // loadTaxDataset() ใช้แทนการยิง query ซ้ำเอง — ดูจุดที่เรียกท้ายฟังก์ชันนี้ (ลด query ซ้ำซ้อน 6 คำสั่ง
      // ระหว่าง pipeline เดิมกับ pipeline ของฟีเจอร์ VAT/ภ.พ.30 ซึ่งเป็นสาเหตุหลักที่ทำให้ 2 ฝั่งโหลดไม่พร้อมกัน)
      let prefetchRooms: { roomNumber: string; roomId?: string | null; baseRent: number }[] | undefined
      let prefetchTenants: Awaited<ReturnType<typeof getTenants>>["data"] | undefined
      let prefetchCancelledContracts: Awaited<ReturnType<typeof getCancelledContracts>>["data"] | undefined
      let prefetchFinanceSettings: Awaited<ReturnType<typeof getFinanceSettings>>["data"] | undefined
      let prefetchBills: Awaited<ReturnType<typeof getBills>>["data"] | undefined
      let prefetchExpenses: ExpenseItem[] | undefined
      try {
        const userRes = await getCurrentUserProfileClient()

        let currentWsId: string | undefined = undefined
        
        if (userRes.success && userRes.data) {
          const profile = userRes.data
          const isUserAdminOrSuper = profile.role === "admin" || profile.role === "super_admin"
          if (isUserAdminOrSuper) {
            setHasEditPermission(true)
          } else {
            let perms = profile.permissions
            if (typeof perms === "string") {
              try { perms = JSON.parse(perms) } catch { perms = null }
            }
            const defaultPerms = DEFAULT_STAFF_PERMISSIONS
            const userPerms = { ...defaultPerms, ...perms }
            setHasEditPermission(!!userPerms.access_tax_edit)
          }

          const isSuperAdmin = profile.role === "super_admin"
          
          if (!isSuperAdmin && profile.workspace_id) {
            // สำหรับ Admin และ Staff ทั่วไป: ให้ใช้ workspace_id จาก Profile เสมอ
            currentWsId = profile.workspace_id
          } else {
            // สำหรับ Super Admin: ดึงจาก Cookie เพื่อรองรับการสลับ Workspace คอนโซลด้านบน
            const cookieWsId = typeof window !== "undefined" ? getCookie("horset_current_workspace_id") : undefined
            currentWsId = cookieWsId || profile.workspace_id || undefined
          }
        }

        if (currentWsId) {
          setWorkspaceId(currentWsId)

          // ยิง query ที่ loadTaxDataset() ต้องใช้แต่ไม่มี pipeline เดิมดึงไว้ก่อน (ปีก่อนหน้า/ภ.พ.30/ค่าลดหย่อน/
          // การยื่นแบบ) ไปคู่ขนานกับ fetchPromises ด้านล่างตั้งแต่ตอนนี้เลย แทนที่จะรอ fetchPromises เสร็จก่อน
          // แล้วค่อยเรียก loadTaxDataset() ต่อท้าย (เดิมทำให้เวลาโหลดรวมเป็น T(wave1)+T(wave2) แทน max ของสองฝั่ง)
          const taxDatasetCacheKey = `tax_dataset_${taxYear}`
          const cachedTaxDataset = getCachedData<TaxDataset>(currentWsId, taxDatasetCacheKey)
          const extraTaxDatasetPromise = cachedTaxDataset ? null : Promise.all([
            getBills(undefined, String(Number(taxYear) - 1), currentWsId),
            getExpenses(String(Number(taxYear) - 1), currentWsId),
            getPp30Filings(currentWsId),
            getTaxDeductions(currentWsId, Number(taxYear)),
            getPitFilings(currentWsId),
          ]).then(([prevBillsRes, prevExpensesRes, pp30Res, deductionsRes, pitFilingsRes]) => ({
            prevYearBills: prevBillsRes.success ? prevBillsRes.data : undefined,
            prevYearExpenses: prevExpensesRes.success ? prevExpensesRes.data : undefined,
            pp30Filings: pp30Res.success ? pp30Res.data : undefined,
            deductions: deductionsRes.success ? deductionsRes.data : undefined,
            pitFilings: pitFilingsRes.success ? pitFilingsRes.data : undefined,
          }))

          // โหลดข้อมูลประวัติยกเลิกสัญญาจาก Supabase และย้ายข้อมูลหากยังมีใน Local Storage
          let tempCancellations: any[] = []
          let hasLocalCancellations = false
          if (typeof window !== "undefined") {
            try {
              const savedCancellations = localStorage.getItem(`cancelled_contracts_${currentWsId}`)
              if (savedCancellations) {
                tempCancellations = JSON.parse(savedCancellations)
                hasLocalCancellations = true
              }
            } catch (e) {
              console.error("Failed to parse saved cancellations from localStorage", e)
            }
          }

          // เริ่มโหลดข้อมูลแบบคู่ขนาน (Parallel Fetching) เพื่อประสิทธิภาพสูงสุดและปลอดภัยตามเดิม
          // หมายเหตุ: ยอดริบมัดจำ (คำนวณจาก cancelledContracts) มีผลต่อการ์ดสรุปยอดโดยตรง จึงต้องรวมอยู่ใน
          // fetchPromises ให้ Promise.all รอด้วย ไม่งั้นการ์ดจะเด้งจากเลขที่ยังไม่รวมยอดริบมัดจำ ไปเป็นเลขที่รวมแล้ว
          const fetchPromises = [];

          if (hasLocalCancellations && tempCancellations.length > 0) {
            // ย้ายข้อมูลไปยัง Supabase
            fetchPromises.push(
              migrateLocalStorageCancelledContracts(currentWsId, tempCancellations).then(async (migrated) => {
                if (migrated.success) {
                  localStorage.removeItem(`cancelled_contracts_${currentWsId}`)
                  console.log("Successfully migrated cancelled contracts to Supabase and deleted local storage cache")
                  const res = await getCancelledContracts(currentWsId!)
                  if (res.success && res.data) {
                    setCancelledContracts(res.data)
                    prefetchCancelledContracts = res.data
                  }
                } else if (migrated.error === "table_not_found") {
                  setCancelledContracts(tempCancellations)
                  console.warn("Table 'cancelled_contracts' not found in database. Local data kept in memory.")
                }
              })
            )
          } else {
            fetchPromises.push(
              getCancelledContracts(currentWsId).then(res => {
                if (res.success && res.data) {
                  setCancelledContracts(res.data)
                  prefetchCancelledContracts = res.data
                } else if (res.error === "table_not_found") {
                  console.warn("Table 'cancelled_contracts' not found in database. History list is empty.")
                  setCancelledContracts([])
                }
              })
            )
          }

          // 1. โหลดข้อมูลผู้เสียภาษีและการเงิน
          const financeCacheKey = "finance_settings"
          const cachedFinance = getCachedData<any>(currentWsId, financeCacheKey)
          if (cachedFinance) {
            prefetchFinanceSettings = cachedFinance
            setFirstName(cachedFinance.tax_firstname || "")
            setLastName(cachedFinance.tax_lastname || "")
            setTaxId(cachedFinance.tax_id || "")
            setAddress(cachedFinance.tax_address || "")
            setPhone(cachedFinance.tax_phone || "")
            setAddressBuilding(cachedFinance.tax_address_building || "")
            setAddressRoom(cachedFinance.tax_address_room || "")
            setAddressFloor(cachedFinance.tax_address_floor || "")
            setAddressVillage(cachedFinance.tax_address_village || "")
            setAddressMoo(cachedFinance.tax_address_moo || "")
            setAddressSoi(cachedFinance.tax_address_soi || "")
            setAddressYaek(cachedFinance.tax_address_yaek || "")
            setElectricRate(Number(cachedFinance.electric_rate !== null && cachedFinance.electric_rate !== undefined ? cachedFinance.electric_rate : 7))
            setWaterRate(Number(cachedFinance.water_rate !== null && cachedFinance.water_rate !== undefined ? cachedFinance.water_rate : 18))
            setCommonFee(Number(cachedFinance.common_fee !== null && cachedFinance.common_fee !== undefined ? cachedFinance.common_fee : 50))
            setDefaultDepositAmount(Number(cachedFinance.deposit_amount !== null && cachedFinance.deposit_amount !== undefined ? cachedFinance.deposit_amount : 0))
            setDefaultAdvanceRent(Number(cachedFinance.advance_rent !== null && cachedFinance.advance_rent !== undefined ? cachedFinance.advance_rent : 0))
          } else {
            fetchPromises.push(
              getFinanceSettings(currentWsId).then(res => {
                if (res.success && res.data) {
                  prefetchFinanceSettings = res.data
                  setFirstName(res.data.tax_firstname || "")
                  setLastName(res.data.tax_lastname || "")
                  setTaxId(res.data.tax_id || "")
                  setAddress(res.data.tax_address || "")
                  setPhone(res.data.tax_phone || "")
                  setAddressBuilding(res.data.tax_address_building || "")
                  setAddressRoom(res.data.tax_address_room || "")
                  setAddressFloor(res.data.tax_address_floor || "")
                  setAddressVillage(res.data.tax_address_village || "")
                  setAddressMoo(res.data.tax_address_moo || "")
                  setAddressSoi(res.data.tax_address_soi || "")
                  setAddressYaek(res.data.tax_address_yaek || "")
                  setElectricRate(res.data.electric_rate)
                  setWaterRate(res.data.water_rate)
                  setCommonFee(res.data.common_fee)
                  setDefaultDepositAmount(res.data.deposit_amount !== undefined ? Number(res.data.deposit_amount) : 0)
                  setDefaultAdvanceRent(res.data.advance_rent !== undefined ? Number(res.data.advance_rent) : 0)
                  setCachedData(currentWsId, financeCacheKey, res.data)
                }
              })
            );
          }

          // 1.2 โหลดข้อมูลผู้เช่า
          const tenantsCacheKey = "tenants_all"
          const cachedTenants = getCachedData<any[]>(currentWsId, tenantsCacheKey)
          if (cachedTenants) {
            setTenants(cachedTenants)
            prefetchTenants = cachedTenants
          } else {
            fetchPromises.push(
              getTenants(currentWsId).then(tenantsRes => {
                if (tenantsRes.success && tenantsRes.data) {
                  setTenants(tenantsRes.data)
                  prefetchTenants = tenantsRes.data
                  setCachedData(currentWsId, tenantsCacheKey, tenantsRes.data)
                }
              })
            );
          }

          // 1.5 โหลดข้อมูลห้องเพื่อรู้ค่าเช่าห้องพักหลัก (baseRent)
          const roomsCacheKey = "rooms_all"
          const cachedRooms = getCachedData<any[]>(currentWsId, roomsCacheKey)
          if (cachedRooms) {
            setRooms(cachedRooms)
            prefetchRooms = cachedRooms
          } else {
            fetchPromises.push(
              getRooms(currentWsId).then(roomsRes => {
                if (roomsRes.success && roomsRes.data) {
                  const mappedRooms = roomsRes.data.map((r: any) => ({
                    roomNumber: r.roomNumber,
                    // roomId ต้องติดไปด้วย ไม่งั้น adapter ภาษีจับคู่บิลกับห้องด้วยเลขห้อง
                    // ซึ่งกำกวมเมื่อหอมีหลายตึกใช้เลขห้องซ้ำกัน (ดู findRoom ใน lib/tax/adapter.ts)
                    roomId: r.id ?? null,
                    baseRent: Number(r.baseRent)
                  }))
                  setRooms(mappedRooms)
                  prefetchRooms = mappedRooms
                  setCachedData(currentWsId, roomsCacheKey, mappedRooms)
                }
              })
            );
          }

          // 2. โหลดบิลจากระบบ
          const billsCacheKey = `bills_year_${taxYear}`
          const cachedBills = getCachedData<any[]>(currentWsId, billsCacheKey)
          if (cachedBills) {
            const mappedBills: BillItem[] = cachedBills.map((b: any) => ({
              id: b.id,
              roomNumber: b.roomNumber,
              roomId: b.roomId ?? null,
              tenantName: b.tenantName || t("tax_page.tenant_fallback"),
              amount: Number(b.amount),
              status: b.status as "unpaid" | "pending" | "paid",
              billingCycle: b.billingCycle,
              slipUrl: b.slipUrl || null,
              electricUnits: Number(b.electricUnits || 0),
              waterUnits: Number(b.waterUnits || 0)
            }))
            setBills(mappedBills)
            prefetchBills = cachedBills
          } else {
            fetchPromises.push(
              getBills(undefined, taxYear, currentWsId).then(billsRes => {
                if (billsRes.success && billsRes.data) {
                  const mappedBills: BillItem[] = billsRes.data.map((b: any) => ({
                    id: b.id,
                    roomNumber: b.roomNumber,
                    roomId: b.roomId ?? null,
                    tenantName: b.tenantName || t("tax_page.tenant_fallback"),
                    amount: Number(b.amount),
                    status: b.status as "unpaid" | "pending" | "paid",
                    billingCycle: b.billingCycle,
                    slipUrl: b.slipUrl || null,
                    electricUnits: Number(b.electricUnits || 0),
                    waterUnits: Number(b.waterUnits || 0)
                  }))
                  setBills(mappedBills)
                  prefetchBills = billsRes.data
                  setCachedData(currentWsId, billsCacheKey, billsRes.data)
                }
              })
            );
          }

          // 3. โหลดค่าใช้จ่าย
          fetchPromises.push(loadExpensesData(taxYear, currentWsId).then(data => { prefetchExpenses = data }))

          // รอให้ทุกสัญญาทำงานเสร็จสิ้นพร้อมกัน
          if (fetchPromises.length > 0) {
            await Promise.all(fetchPromises)
          }

          // โหลด TaxDataset เต็มชุดสำหรับฟีเจอร์ VAT/ภ.พ.30 — ส่ง prefetch ของ wave1 (ด้านบน) รวมกับผลลัพธ์ของ
          // extraTaxDatasetPromise (ยิงคู่ขนานกับ wave1 ไปตั้งแต่ต้นฟังก์ชัน) ให้ loadTaxDataset() ไม่ต้องยิง
          // query อะไรเพิ่มเลย — ตอนนี้แค่รอ promise ที่ยิงไปพร้อมกันแล้ว ไม่ใช่ค่อยเริ่มยิงใหม่ต่อท้าย
          if (cachedTaxDataset) {
            setTaxDataset(cachedTaxDataset)
          } else {
            const extra = extraTaxDatasetPromise ? await extraTaxDatasetPromise : {}
            const taxDatasetRes = await loadTaxDataset(currentWsId, Number(taxYear), {
              rooms: prefetchRooms,
              tenants: prefetchTenants,
              cancelledContracts: prefetchCancelledContracts,
              financeSettings: prefetchFinanceSettings,
              thisYearBills: prefetchBills,
              thisYearExpenses: prefetchExpenses,
              ...extra,
            })
            if (taxDatasetRes.success && taxDatasetRes.data) {
              setTaxDataset(taxDatasetRes.data)
              setCachedData(currentWsId, taxDatasetCacheKey, taxDatasetRes.data)
            }
          }
          setTaxDatasetLoaded(true)
        }
      } catch (err) {
        console.error("Failed to load initial data in tax page:", err)
      } finally {
        setIsSummaryLoading(false)
      }
    }

    loadInitialData()
  }, [taxYear])

  // ฟังก์ชันโหลดข้อมูลค่าใช้จ่ายจาก DB
  async function loadExpensesData(year: string, explicitWsId?: string, forceRefresh = false) {
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

          // อัปเดตตัวแปรจริงที่ใช้คำนวณแบบเรียลไทม์
          setActualExpense405(sum405)
          setActualExpense408(sum408)
          setLoadingExpenses(false)
          return cached
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

        // อัปเดตตัวแปรจริงที่ใช้คำนวณแบบเรียลไทม์
        setActualExpense405(sum405)
        setActualExpense408(sum408)
        return res.data
      }
    } catch (e) {
      console.error("Failed to load expenses:", e)
    } finally {
      setLoadingExpenses(false)
    }
    return undefined
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

  /**
   * หาห้องของบิล/สัญญา เพื่อดึงค่าเช่าฐาน
   *
   * ⚠️ ต้องใช้กฎเดียวกับ findRoom() ใน lib/tax/adapter.ts เป๊ะ ๆ ไม่งั้นตัวเลขบนหน้านี้
   * กับตัวเลขในชุดข้อมูล VAT/ภ.พ.30 จะไม่ตรงกัน แล้วไม่มีใครรู้ว่าฝั่งไหนถูก
   *
   * จับด้วย roomId ก่อน — เลขห้องซ้ำกันได้ข้ามอาคาร ถ้าเทียบด้วยเลขห้อง บิลของตึก B
   * จะไปดึงค่าเช่าของตึก A แล้วยอดแยก "ค่าเช่า 40(5)" กับ "ค่าน้ำไฟ 40(8)" ผิดทั้งใบ
   * ถอยไปเทียบเลขห้องเฉพาะเมื่อไม่มี roomId และเลขห้องนั้นไม่กำกวม
   */
  const findRoomFor = (ref: { roomId?: string | null; roomNumber: string }) => {
    if (ref.roomId) {
      const byId = rooms.find(r => r.roomId && r.roomId === ref.roomId)
      if (byId) return byId
    }
    const byNumber = rooms.filter(r => r.roomNumber === ref.roomNumber)
    return byNumber.length === 1 ? byNumber[0] : undefined
  }

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
    const matchedRoom = findRoomFor(bill)
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
  const advanceRentBills = tenants.filter(tenantItem => {
    if (!tenantItem.contractStart) return false
    const parts = tenantItem.contractStart.split("-")
    return parts[0] === taxYear
  })
  
  // คำนวณรายหัว: จำนวนเดือน * ค่าเช่าของห้องนั้นๆ
  const totalAdvanceRentAmount = advanceRentBills.reduce((sum, tenantItem) => {
    const matchedRoom = findRoomFor(tenantItem)
    const roomRent = matchedRoom ? matchedRoom.baseRent : 0
    return sum + (roomRent * defaultAdvanceRent)
  }, 0)

  // ครึ่งปีแรก (สัญญาเริ่มเดือน 01 - 06)
  const advanceRentBillsHalf = advanceRentBills.filter(tenantItem => {
    const parts = tenantItem.contractStart.split("-")
    const month = parts[1] ? parseInt(parts[1], 10) : 0
    return month >= 1 && month <= 6
  })
  const totalAdvanceRentAmountHalf = advanceRentBillsHalf.reduce((sum, tenantItem) => {
    const matchedRoom = findRoomFor(tenantItem)
    const roomRent = matchedRoom ? matchedRoom.baseRent : 0
    return sum + (roomRent * defaultAdvanceRent)
  }, 0)

  // 2. เงินประกันริบ (มาตรา 40(8)): เมื่อยกเลิกสัญญา คำนวณ [มัดจำ - เงินคืนจริง] = ยอดริบ และนำไปบวกเป็นรายได้ในปีที่ยกเลิกสัญญา
  const cancelledInYear = cancelledContracts.filter(c => {
    if (!c.cancellationDate) return false
    
    // ซ่อนสัญญายกเลิกที่ยังไม่ถึงกำหนด (ย้ายออกล่วงหน้าในอนาคต)
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const date = String(d.getDate()).padStart(2, '0')
    const todayStr = `${year}-${month}-${date}`
    if (c.cancellationDate > todayStr) return false

    const parts = c.cancellationDate.split("-")
    return parts[0] === taxYear
  })

  // แยกรายได้จากการหักเงินประกันตามสัญญายกเลิกที่กรองมาแล้ว
  const totalDeductedRent405 = cancelledInYear.reduce((sum, c) => sum + Number(c.deductedRent405 || 0), 0)
  const totalDeductedUtilities408 = cancelledInYear.reduce((sum, c) => sum + Number(c.deductedUtilities408 || 0), 0)

  // Backwards-compatible parser for Section 40(8) Services/Other
  const getContractServices408 = (c: any) => {
    const rent = Number(c.deductedRent405 || 0)
    const utils = Number(c.deductedUtilities408 || 0)
    const services = Number(c.deductedServices408 || 0)
    if (rent === 0 && utils === 0 && services === 0) {
      return Number(c.forfeitedAmount || 0)
    }
    return services
  }

  const totalDeductedServices408 = cancelledInYear.reduce((sum, c) => sum + getContractServices408(c), 0)

  // ครึ่งปีแรก (ยกเลิกสัญญาช่วงเดือน 01 - 06)
  const cancelledInYearHalf = cancelledInYear.filter(c => {
    const parts = c.cancellationDate.split("-")
    const month = parts[1] ? parseInt(parts[1], 10) : 0
    return month >= 1 && month <= 6
  })

  const totalDeductedRent405Half = cancelledInYearHalf.reduce((sum, c) => sum + Number(c.deductedRent405 || 0), 0)
  const totalDeductedUtilities408Half = cancelledInYearHalf.reduce((sum, c) => sum + Number(c.deductedUtilities408 || 0), 0)
  const totalDeductedServices408Half = cancelledInYearHalf.reduce((sum, c) => sum + getContractServices408(c), 0)

  // 1. รายได้รวมมาตรา 40(5) (เฉพาะค่าเช่าห้องพักหลัก) + ยอดค่าเช่าล่วงหน้า + ค่าเช่าหักจากประกันวันเช็คเอาท์
  // หมายเหตุ: ยอดหักจากเงินประกัน (totalDeducted...) นับรวมเฉพาะโหมด "ระบบ" เท่านั้น
  // โหมด "กำหนดตัวเลขเอง" ให้ยึดค่าที่ผู้ใช้กรอกเป็นยอดจริงทั้งหมด ไม่บวกเพิ่ม
  const rent405Full = (dataSource === "system" && hasPaidBills
    ? calculatedRent405Full
    : (dataSource === "system" ? 0 : manualRent405)) + totalAdvanceRentAmount + (dataSource === "system" ? totalDeductedRent405 : 0)

  // 2. รายได้รวมมาตรา 40(8) (ค่าน้ำไฟ/บริการส่วนกลาง) + ค่าน้ำไฟหักจากประกันวันเช็คเอาท์
  const utilities408Full = (dataSource === "system" && hasPaidBills
    ? calculatedUtilities408Full
    : (dataSource === "system" ? 0 : manualUtilities408)) + (dataSource === "system" ? totalDeductedUtilities408 : 0)

  // 3. รายได้รวมอื่นๆ มาตรา 40(8) (เงินปรับจ่ายล่าช้า / ยอดค่าบริการและค่าเสียหายอื่นๆ วันเช็คเอาท์ - ไม่เข้าเกณฑ์หักเหมา)
  const other408Full = (dataSource === "system" && hasPaidBills
    ? calculatedOther408Full
    : (dataSource === "system" ? 0 : manualOther408)) + (dataSource === "system" ? totalDeductedServices408 : 0)

  // ครึ่งปี
  const rent405Half = (dataSource === "system" && hasPaidBills
    ? calculatedRent405Half
    : (dataSource === "system" ? 0 : manualRent405 / 2)) + totalAdvanceRentAmountHalf + (dataSource === "system" ? totalDeductedRent405Half : 0)

  const utilities408Half = (dataSource === "system" && hasPaidBills
    ? calculatedUtilities408Half
    : (dataSource === "system" ? 0 : manualUtilities408 / 2)) + (dataSource === "system" ? totalDeductedUtilities408Half : 0)

  const other408Half = (dataSource === "system" && hasPaidBills
    ? calculatedOther408Half
    : (dataSource === "system" ? 0 : manualOther408 / 2)) + (dataSource === "system" ? totalDeductedServices408Half : 0)

  // ค่าใช้จ่ายจริงที่เกิดขึ้นในครึ่งปีแรก (ม.ค.-มิ.ย.) แยกตามวันที่จริงของแต่ละรายการ
  // แทนที่จะหารยอดทั้งปีด้วย 2 ซึ่งไม่ตรงกับรายจ่ายจริงที่อาจเกิดไม่เท่ากันในแต่ละครึ่งปี
  const expensesInFirstHalf = expenses.filter(exp => {
    if (!exp.created_at) return false
    const month = new Date(exp.created_at).getMonth() + 1
    return month >= 1 && month <= 6
  })
  const actualExpense405Half = expensesInFirstHalf
    .filter(exp => exp.category === "40_5")
    .reduce((sum, exp) => sum + exp.amount, 0)
  const actualExpense408Half = expensesInFirstHalf
    .filter(exp => exp.category === "40_8")
    .reduce((sum, exp) => sum + exp.amount, 0)

  // การคำนวณหักค่าใช้จ่ายสำหรับ 40(5) และ 40(8) — อัตราเหมา/โหมด capExpensePerBucket มาจาก
  // taxDataset.settings (การ์ด ExpenseModeSection) ใช้ capActualExpenseDeduction() ตัวเดียวกับที่
  // computePitBreakdownFromThaiTax ใช้ฝั่ง server เพื่อให้บัตรสรุป/PDF/PitBreakdown ตรงกันเป๊ะเสมอ
  // เต็มปี
  const getDeduction405Full = () => {
    const requested = deductionMethod405 === "เหมา 30%" ? rent405Full * taxDataset.settings.expenseA.lumpRate : actualExpense405
    return capActualExpenseDeduction(taxDataset.settings.expenseA.mode, requested, rent405Full, taxDataset.settings.capExpensePerBucket)
  }
  const deductionRent405Full = getDeduction405Full()

  // ครึ่งปี
  const getDeduction405Half = () => {
    const requested = deductionMethod405 === "เหมา 30%" ? rent405Half * taxDataset.settings.expenseA.lumpRate : actualExpense405Half
    return capActualExpenseDeduction(taxDataset.settings.expenseA.mode, requested, rent405Half, taxDataset.settings.capExpensePerBucket)
  }
  const deductionRent405Half = getDeduction405Half()

  // การคำนวณหักค่าใช้จ่ายสำหรับ 40(8) (เหมาเฉพาะส่วนบริการน้ำไฟ หรือหักตามจริง)
  const getDeduction408Full = () => {
    const requested = deductionMethod408 === "เหมา 60%" ? utilities408Full * taxDataset.settings.expenseB.lumpRate : actualExpense408 // รายได้อื่นๆ หักเหมาได้ 0% ตามเงื่อนไขสรรพากร
    return capActualExpenseDeduction(taxDataset.settings.expenseB.mode, requested, utilities408Full, taxDataset.settings.capExpensePerBucket)
  }
  const deductionUtilities408Full = getDeduction408Full()

  const getDeduction408Half = () => {
    const requested = deductionMethod408 === "เหมา 60%" ? utilities408Half * taxDataset.settings.expenseB.lumpRate : actualExpense408Half
    return capActualExpenseDeduction(taxDataset.settings.expenseB.mode, requested, utilities408Half, taxDataset.settings.capExpensePerBucket)
  }
  const deductionUtilities408Half = getDeduction408Half()

  // รายได้สุทธิประเมิน
  const fullTotalRevenue = rent405Full + utilities408Full + other408Full
  const netIncomeFull = fullTotalRevenue - (deductionRent405Full + deductionUtilities408Full)

  const halfTotalRevenue = rent405Half + utilities408Half + other408Half
  const netIncomeHalf = halfTotalRevenue - (deductionRent405Half + deductionUtilities408Half)

  // คำนวณผลภาษี ภ.ง.ด.90/94 เต็มชุด (สำหรับ PitBreakdown) ผ่าน computePitBreakdown() ใน src/lib/thaiTax.ts
  // เท่านั้น — ต้องคำนวณ 94 ก่อนเสมอ เพราะ 90 ต้องใช้ยอดภาษีครึ่งปีมาหักกลบ เป็นการคำนวณคณิตศาสตร์ล้วนที่เบามาก
  // จึงคำนวณตรงเป็นค่าธรรมดาในทุก render เหมือนตัวแปรอื่นๆ ในไฟล์นี้ (rent405Full, netIncomeFull ฯลฯ)
  // ไม่ต้องพึ่ง useEffect + state แยกเหมือนเดิม (ตอนนั้นยังเป็น Server Action จึงต้อง await + เก็บ state)
  // ⚠️ รอให้ isSummaryLoading = false และ taxDatasetLoaded = true ก่อนเสมอ ไม่งั้นจะคำนวณด้วยข้อมูลที่โหลดมาไม่ครบ
  // (bills/expenses/taxDataset.settings ทยอยมาทีละก้อน) แล้วโชว์ตัวเลขชั่วคราวที่ผิดวาบขึ้นมาก่อนค่อยแก้เป็นตัวจริง
  const pitResult94 = (isSummaryLoading || !taxDatasetLoaded) ? null : computePitBreakdown({
    form: "PND94",
    incomeA: rent405Half,
    incomeB: utilities408Half,
    incomeOther: other408Half,
    expenseA: {
      mode: taxDataset.settings.expenseA.mode,
      lumpRate: taxDataset.settings.expenseA.lumpRate,
      actualAmount: actualExpense405Half,
    },
    expenseB: {
      mode: taxDataset.settings.expenseB.mode,
      lumpRate: taxDataset.settings.expenseB.lumpRate,
      actualAmount: actualExpense408Half,
    },
    capExpensePerBucket: taxDataset.settings.capExpensePerBucket,
    taxpayerType: taxpayerStatus,
    partnerCount,
    otherDeductions: 0,
  })

  const pitResult90 = (isSummaryLoading || !taxDatasetLoaded || !pitResult94) ? null : computePitBreakdown({
    form: "PND90",
    incomeA: rent405Full,
    incomeB: utilities408Full,
    incomeOther: other408Full,
    expenseA: {
      mode: taxDataset.settings.expenseA.mode,
      lumpRate: taxDataset.settings.expenseA.lumpRate,
      actualAmount: actualExpense405,
    },
    expenseB: {
      mode: taxDataset.settings.expenseB.mode,
      lumpRate: taxDataset.settings.expenseB.lumpRate,
      actualAmount: actualExpense408,
    },
    capExpensePerBucket: taxDataset.settings.capExpensePerBucket,
    taxpayerType: taxpayerStatus,
    partnerCount,
    otherDeductions: 0,
    pnd94Paid: pitResult94.payable ?? 0,
  })

  // ประกอบ PeriodComputation สำหรับ PitBalanceSummary — แยกจาก pitResult94/90 (ผลคำนวณดิบ) เพราะ
  // PitBalanceSummary ต้องใช้ pnd94Paid/pnd94IsEstimate/pnd94Result เพิ่มด้วย (ดูหมายเหตุที่ใช้ด้านล่าง)
  const pnd94Computation = pitResult94 ? {
    year: Number(taxYear), form: "PND94" as const, from: "", to: "", months: 6,
    income: taxOverview.yearIncome, expense: taxOverview.yearExpense,
    tax: pitResult94, filing: null, pnd94Paid: 0, pnd94IsEstimate: false, pnd94Result: null,
  } : null
  const pnd90Computation = (pitResult90 && pnd94Computation) ? {
    year: Number(taxYear), form: "PND90" as const, from: "", to: "", months: 12,
    income: taxOverview.yearIncome, expense: taxOverview.yearExpense,
    tax: pitResult90, filing: null, pnd94Paid: pitResult94?.payable ?? 0, pnd94IsEstimate: !pitFiledSnapshot94,
    pnd94Result: pnd94Computation,
  } : null

  // โหลด snapshot ของปีนี้ (ถ้าเคยกดยื่นแบบไปแล้ว) — ใช้บอกผู้ใช้ว่ายื่นไปแล้วเมื่อไร ไม่ได้ล็อกการแก้ settings
  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    Promise.all([
      getPitFilingSnapshot(workspaceId, Number(taxYear), "90"),
      getPitFilingSnapshot(workspaceId, Number(taxYear), "94"),
    ]).then(([snap90, snap94]) => {
      if (cancelled) return
      if (snap90.success) setPitFiledSnapshot90(snap90.data)
      if (snap94.success) setPitFiledSnapshot94(snap94.data)
    })
    return () => { cancelled = true }
  }, [workspaceId, taxYear])

  const handleExport = () => {
    alert(t("tax_page.alert_export", { year: taxYear }))
  }

  const handleDownloadPdf = async (type: "90" | "94") => {
    if (!hasEditPermission) {
      showToast(t("tax_page.toast_no_permission"))
      return
    }
    setLoadingPdf(type)
    try {
      await assertWorkspaceFeatureEnabled(workspaceId, "tax_export")

      const { generatePndPdf } = await import("@/lib/pdfHelper")
      const { parseAddress } = await import("@/lib/thaiAddress")

      // เช็คว่า Super Admin อัปโหลด PDF template เองไว้หรือไม่ ถ้ามีให้ใช้ไฟล์นั้นแทนไฟล์เริ่มต้นของระบบ
      const { getActiveTaxFormTemplateAction, getTaxFormFieldMappingsAction } = await import("@/features/tax/actions")
      const templateRes = await getActiveTaxFormTemplateAction(type, taxYear)
      const customTemplateUrl = templateRes.success ? templateRes.data?.file_url : undefined

      // ดึง mapping ที่ Super Admin ตั้งไว้สำหรับ template นี้โดยเฉพาะ (ระบบ Visual Field Mapping — ดู pdfHelper.ts)
      // ถ้ายังไม่มีการ map เลย (mapping ว่างเปล่า หรือไม่มี template ที่ active) generatePndPdf() จะ fallback ไปใช้
      // DEFAULT_PND90/94_MAPPING ของไฟล์ที่ bundle มากับระบบเอง จึงไม่ต้องกังวลกรณีที่ยังไม่ได้ตั้งค่า mapping
      const templateId = templateRes.success ? templateRes.data?.id : undefined
      const mappingRes = templateId ? await getTaxFormFieldMappingsAction(templateId) : null
      const fieldMapping = mappingRes?.success && mappingRes.data.length > 0 ? mappingRes.data : undefined

      // ภ.ง.ด. 90 ใช้ template เดียวข้ามทุกปี: ถ้า Super Admin ตั้งปีภาษีที่จะพิมพ์ลงฟอร์มไว้ ให้ใช้ปีนั้นแทนปีที่ Admin เลือกดูรายงานอยู่
      const printedTaxYear = (type === "90" && templateRes.success && templateRes.data?.tax_year)
        ? templateRes.data.tax_year
        : taxYear

      const blob = await generatePndPdf(type, {
        firstName,
        lastName,
        taxId,
        address,
        phone,
        rent405: type === "90" ? rent405Full : rent405Half * 2,
        deductionRent405: type === "90" ? deductionRent405Full : deductionRent405Half,
        // ทั้ง ภ.ง.ด. 90 และ 94 มีแถว (1) ค่าน้ำไฟ/บริการ กับ (2) รายได้อื่น (ปรับ/ริบมัดจำ) แยกกันในข้อ 7/ก. ของฟอร์ม
        // จึงต้องส่ง utilities408 กับ other408 แยกกันเสมอ ไม่ยัดรวมเป็นก้อนเดียว มิฉะนั้นตัวเลขที่กรอกจะไม่ตรงกับฟอร์มจริง
        utilities408: type === "90" ? utilities408Full : utilities408Half * 2,
        deductionUtilities408: type === "90" ? deductionUtilities408Full : deductionUtilities408Half,
        other408: type === "90" ? other408Full : other408Half * 2,
        netIncome: type === "90" ? netIncomeFull : netIncomeHalf,
        taxYear: printedTaxYear,
        // ที่อยู่แยกช่องใช้กับทั้ง ภ.ง.ด. 90 และ 94 เพราะฟอร์มทั้งสองมีกล่องที่อยู่ย่อยแยกกันบนหน้าแรกเหมือนกัน
        addressParts: {
          ...parseAddress(address),
          building: addressBuilding,
          room: addressRoom,
          floor: addressFloor,
          village: addressVillage,
          moo: addressMoo,
          soi: addressSoi,
          yaek: addressYaek,
        },
        taxpayerStatus,
        partnerCount,
        rentDeductionMethod: deductionMethod405 === "เหมา 30%" ? "percentage" : "actual",
        utilitiesDeductionMethod: deductionMethod408 === "เหมา 60%" ? "percentage" : "actual",
      }, customTemplateUrl, fieldMapping)

      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `pnd${type}_${taxYear}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error && e.message ? e.message : t("tax_page.alert_pdf_error"))
    } finally {
      setLoadingPdf(null)
    }
  }

  // ดาวน์โหลด PDF แบบ ภ.พ.30 ของเดือนที่เลือก — กรอกลง template จริง public/templates/PP30_Template.pdf
  // (ไม่มีระบบอัปโหลด template เองของ super admin แบบ ภ.ง.ด.90/94 จึงใช้ mapping เริ่มต้นที่ bundle มาเสมอ)
  const handleExportPp30Pdf = async (row: Pp30Row) => {
    if (!hasEditPermission) {
      showToast(t("tax_page.toast_no_permission"))
      return
    }
    try {
      await assertWorkspaceFeatureEnabled(workspaceId, "tax_export")

      const { generatePp30Pdf } = await import("@/lib/pdfHelper")
      const { buildPp30FormFields } = await import("@/lib/pp30-fields")
      const { parseAddress } = await import("@/lib/thaiAddress")
      const form = buildPp30FormFields(row, {
        name: `${firstName} ${lastName}`.trim(),
        taxId,
        addressParts: {
          ...parseAddress(address),
          building: addressBuilding,
          room: addressRoom,
          floor: addressFloor,
          village: addressVillage,
          moo: addressMoo,
          soi: addressSoi,
          yaek: addressYaek,
        },
        phone,
      })
      const blob = await generatePp30Pdf(form)

      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `pp30_${row.period}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error && e.message ? e.message : t("tax_page.alert_pdf_error"))
    }
  }

  // ส่งออก CSV สรุป ภ.พ.30 ทั้งปีที่เลือก — ข้อมูลเดียวกับตารางที่แสดงบนจอ ไม่ต้องกรอกในแอปหรือของทางการ
  const handleExportPp30Csv = async () => {
    try {
      await assertWorkspaceFeatureEnabled(workspaceId, "tax_export")
    } catch (e) {
      alert(e instanceof Error && e.message ? e.message : t("tax_page.alert_pdf_error"))
      return
    }
    const headers = [
      t("tax_page.pp30_col_tax_month"),
      t("tax_page.pp30_col_service_base"),
      t("tax_page.monthly_col_output_vat"),
      t("tax_page.monthly_col_input_vat"),
      t("tax_page.pp30_col_credit_brought"),
      t("tax_page.pp30_csv_col_payable"),
      t("tax_page.pp30_csv_col_carry_forward"),
      t("tax_page.pp30_csv_col_status"),
      t("tax_page.pp30_csv_col_filed_date"),
    ]
    const rows = pp30.rows.map((r) => [
      thaiMonth(r.period, true, locale),
      r.serviceBase,
      r.outputVat,
      r.inputVat,
      r.creditBrought,
      r.payable,
      r.carryForward,
      r.filed ? t("tax_page.pp30_filed_badge") : t("tax_page.pp30_not_filed_status"),
      r.filedAt || "",
    ])
    downloadCsv(`pp30_${taxYear}.csv`, toCsv(headers, rows))
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
    <div className="space-y-6 md:space-y-8 pb-12">
      {/* Toast แจ้งเตือน */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 glass-panel border border-teal-500/30 text-teal-400 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up text-xs font-semibold">
          <AlertCircle className="w-4 h-4 text-teal-400" /> {toastMessage}
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            {t("tax_page.title")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {t("tax_page.subtitle")}
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto self-stretch md:self-auto justify-end">
          <div className="relative group min-w-[120px]">
            <select
              className="w-full appearance-none px-4 py-2.5 pr-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-sm transition-all cursor-pointer"
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value)}
            >
              <option value="2026">{t("tax_page.tax_year_option", { year: 2026 })}</option>
              <option value="2025">{t("tax_page.tax_year_option", { year: 2025 })}</option>
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
          
          <button
            onClick={handleExport}
            className="glow-btn bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 hover:from-blue-500 hover:via-indigo-500 hover:to-indigo-600 active:scale-95 text-white font-semibold py-2.5 px-5 rounded-xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/35 transition-all duration-300 cursor-pointer"
          >
            <Download className="w-4 h-4" /> {t("tax_page.export_report")}
          </button>
        </div>
      </div>

      {/* {t("tax_page.legal_disclaimer")} */}
      <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/[0.04] via-amber-500/[0.08] to-transparent dark:from-amber-500/[0.06] dark:via-amber-500/[0.03] dark:to-transparent border border-amber-500/20 dark:border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.03)] backdrop-blur-md p-5 rounded-2xl flex items-start gap-4 transition-all hover:shadow-[0_0_20px_rgba(245,158,11,0.06)] group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-amber-500/10 transition-all duration-500"></div>
        <div className="p-2.5 bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-xl shrink-0 shadow-inner">
          <AlertTriangle className="w-5 h-5 animate-pulse" />
        </div>
        <div className="space-y-1.5 relative z-10">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 tracking-wide flex items-center gap-1.5">
            {t("tax_page.legal_disclaimer")}
          </p>
          <p className="text-amber-950/70 dark:text-amber-100/80 text-xs sm:text-sm leading-relaxed max-w-5xl">
            {t("tax_page.disclaimer_desc")}
          </p>
        </div>
      </div>

      {/* ภาพรวม VAT — แสดงเฉพาะเมื่อ workspace จดทะเบียน VAT แล้ว (ยกเว้นคำเตือนใกล้/เกินเกณฑ์ 1.8 ล้าน)
          การ์ดเกณฑ์ VAT (VatThresholdCard) render แค่ที่นี่จุดเดียว — TaxOverviewDashboard ไม่มีการ์ดนี้ซ้ำแล้ว */}
      {dataReady && (
        <>
          <VatThresholdCard status={vatStatus} breach={vatBreach} t={t} locale={locale} />
          <VatGate settings={taxDataset.settings}>
            <TaxOverviewDashboard
              vatEnabled={taxOverview.vatEnabled}
              yearIncome={taxOverview.yearIncome}
              t={t}
            />
          </VatGate>
        </>
      )}

      {/* บัตรรายได้และหักลดหย่อน (The Four Income Cards) — แสดงเฉพาะตอนยังไม่จด VAT
          ตอนจด VAT แล้ว ใช้การ์ดสรุปตะกร้า A/B ของ TaxOverviewDashboard ด้านบนแทน กันโชว์ 2 แดชบอร์ดซ้อนกัน */}
      <VatNotRegisteredOnly settings={taxDataset.settings}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* บัตร 1: ม. 40(5) */}
        <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40 shadow-[0_8px_30px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.15)] rounded-3xl p-6 flex flex-col justify-between hover:-translate-y-1.5 hover:shadow-xl hover:shadow-blue-500/[0.05] transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/[0.03] dark:bg-blue-500/[0.06] rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-blue-500/[0.08] transition-all duration-300"></div>

          <div className="space-y-5">
            <div className="flex justify-between items-start">
              <span className="inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-blue-500/[0.08] dark:bg-blue-500/[0.12] text-blue-600 dark:text-blue-400 border border-blue-500/10 tracking-wider">
                {t("tax_page.sec_405")}
              </span>
              <div className="p-2.5 bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-450 rounded-xl shadow-inner group-hover:scale-110 transition-transform duration-300">
                <Landmark className="w-5 h-5" />
              </div>
            </div>

            <div className="space-y-1 relative z-10">
              <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("tax_page.card_rent_title")}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-none">{t("tax_page.card_rent_subtitle")}</p>
              {!dataReady ? (
                <div className="h-8 w-32 mt-3 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ) : (
                <p className="text-2xl font-black tracking-tight mt-3 text-blue-600 dark:text-blue-400">
                  {formatMoney(rent405Full)} <span className="text-xs font-bold text-slate-500 dark:text-slate-450">{t("tax_page.baht")}</span>
                </p>
              )}
            </div>
          </div>

          <div className="relative z-10 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/85">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-455 uppercase tracking-wider mb-2">{t("tax_page.selected_deduction")}</p>
            <div className="bg-slate-50/80 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850/80 rounded-xl p-3 flex flex-col gap-0.5">
              {!dataReady ? (
                <>
                  <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-4 w-20 mt-1 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                </>
              ) : (
                <>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t("tax_page.deduction_by_method", { method: deductionMethod405 === "เหมา 30%" ? t("tax_page.flat_30_label") : t("tax_page.actual_deduction") })}</span>
                  <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 tracking-tight">
                    {formatMoney(deductionRent405Full)} {t("tax_page.baht")}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* บัตร 2: ม. 40(8) ค่าน้ำไฟ */}
        <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-teal-100 dark:border-teal-900/40 shadow-[0_8px_30px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.15)] rounded-3xl p-6 flex flex-col justify-between hover:-translate-y-1.5 hover:shadow-xl hover:shadow-teal-500/[0.05] transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/[0.03] dark:bg-teal-500/[0.06] rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-teal-500/[0.08] transition-all duration-300"></div>

          <div className="space-y-5">
            <div className="flex justify-between items-start">
              <span className="inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-teal-500/[0.08] dark:bg-teal-500/[0.12] text-teal-600 dark:text-teal-400 border border-teal-500/10 tracking-wider">
                {t("tax_page.sec_408")}
              </span>
              <div className="p-2.5 bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-450 rounded-xl shadow-inner group-hover:scale-110 transition-transform duration-300">
                <Zap className="w-5 h-5" />
              </div>
            </div>

            <div className="space-y-1 relative z-10">
              <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("tax_page.card_util_title")}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-none">{t("tax_page.card_util_subtitle")}</p>
              {!dataReady ? (
                <div className="h-8 w-32 mt-3 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ) : (
                <p className="text-2xl font-black tracking-tight mt-3 text-teal-600 dark:text-teal-400">
                  {formatMoney(utilities408Full)} <span className="text-xs font-bold text-slate-500 dark:text-slate-450">{t("tax_page.baht")}</span>
                </p>
              )}
            </div>
          </div>

          <div className="relative z-10 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/85">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-455 uppercase tracking-wider mb-2">{t("tax_page.selected_deduction")}</p>
            <div className="bg-slate-50/80 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850/80 rounded-xl p-3 flex flex-col gap-0.5">
              {!dataReady ? (
                <>
                  <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-4 w-20 mt-1 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                </>
              ) : (
                <>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t("tax_page.deduction_by_method", { method: deductionMethod408 === "เหมา 60%" ? t("tax_page.flat_60_label") : t("tax_page.actual_deduction") })}</span>
                  <span className="text-xs font-extrabold text-teal-600 dark:text-teal-400 tracking-tight">
                    {formatMoney(deductionUtilities408Full)} {t("tax_page.baht")}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* บัตร 3: ม. 40(8) อื่นๆ */}
        <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-900/40 shadow-[0_8px_30px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.15)] rounded-3xl p-6 flex flex-col justify-between hover:-translate-y-1.5 hover:shadow-xl hover:shadow-amber-500/[0.05] transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/[0.03] dark:bg-amber-500/[0.06] rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-amber-500/[0.08] transition-all duration-300"></div>

          <div className="space-y-5">
            <div className="flex justify-between items-start">
              <span className="inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/[0.08] dark:bg-amber-500/[0.12] text-amber-700 dark:text-amber-400 border border-amber-500/10 tracking-wider">
                {t("tax_page.sec_408_other")}
              </span>
              <div className="p-2.5 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-450 rounded-xl shadow-inner group-hover:scale-110 transition-transform duration-300">
                <Coins className="w-5 h-5" />
              </div>
            </div>

            <div className="space-y-1 relative z-10">
              <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("tax_page.card_other_title")}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-none">{t("tax_page.card_other_subtitle")}</p>
              {!dataReady ? (
                <div className="h-8 w-32 mt-3 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ) : (
                <p className="text-2xl font-black tracking-tight mt-3 text-amber-600 dark:text-amber-400">
                  {formatMoney(other408Full)} <span className="text-xs font-bold text-slate-500 dark:text-slate-450">{t("tax_page.baht")}</span>
                </p>
              )}
            </div>
          </div>

          <div className="relative z-10 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/85">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{t("tax_page.selected_deduction")}</p>
            <div className="bg-slate-50/80 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850/80 rounded-xl p-3 flex flex-col gap-0.5">
              {!dataReady ? (
                <>
                  <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-4 w-20 mt-1 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                </>
              ) : (
                <>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t("tax_page.no_flat_deduction")}</span>
                  <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 tracking-tight">
                    {deductionMethod408 === "เหมา 60%" ? (
                      t("tax_page.flat_deduction_zero")
                    ) : (
                      t("tax_page.actual_deduction_shared")
                    )}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* บัตร 4: รายจ่ายรวมหักลดหย่อน */}
        <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-900/40 shadow-[0_8px_30px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.15)] rounded-3xl p-6 flex flex-col justify-between hover:-translate-y-1.5 hover:shadow-xl hover:shadow-purple-500/[0.05] transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/[0.03] dark:bg-purple-500/[0.06] rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-purple-500/[0.08] transition-all duration-300"></div>

          <div className="space-y-5">
            <div className="flex justify-between items-start">
              <span className="inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-purple-500/[0.08] dark:bg-purple-500/[0.12] text-purple-600 dark:text-purple-450 border border-purple-500/10 tracking-wider">
                {t("tax_page.total_deduction")}
              </span>
              <div className="p-2.5 bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-450 rounded-xl shadow-inner group-hover:scale-110 transition-transform duration-300">
                <Calculator className="w-5 h-5" />
              </div>
            </div>

            <div className="space-y-1 relative z-10">
              <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("tax_page.total_deduction_title")}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-none">{t("tax_page.total_deduction_subtitle")}</p>
              {!dataReady ? (
                <div className="h-8 w-32 mt-3 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ) : (
                <p className="text-2xl font-black tracking-tight mt-3 text-purple-600 dark:text-purple-400">
                  {formatMoney(deductionRent405Full + deductionUtilities408Full)} <span className="text-xs font-bold text-slate-500 dark:text-slate-450">{t("tax_page.baht")}</span>
                </p>
              )}
            </div>
          </div>

          <div className="relative z-10 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/85">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-455 uppercase tracking-wider mb-2">{t("tax_page.deduction_composition")}</p>
            <div className="bg-slate-50/80 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850/80 rounded-xl p-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
              {!dataReady ? (
                <>
                  <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                </>
              ) : (
                <>
                  <div className="flex justify-between font-medium">
                    <span>{t("tax_page.rent_405_composition")}</span>
                    <span className="text-slate-700 dark:text-slate-300 font-bold">{formatMoney(deductionRent405Full)} {t("tax_page.baht")}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>{t("tax_page.util_408_composition")}</span>
                    <span className="text-slate-700 dark:text-slate-300 font-bold">{formatMoney(deductionUtilities408Full)} {t("tax_page.baht")}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      </VatNotRegisteredOnly>

      {/* ส่วนตั้งค่าแหล่งข้อมูลการคำนวณและลดหย่อนภาษี */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* คอนฟิกแหล่งข้อมูล */}
        <div className="relative overflow-hidden glass-card p-6 md:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-900/60 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-900 pb-4">
              <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl shadow-inner">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t("tax_page.data_source_title")}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t("tax_page.data_source_subtitle")}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-3 bg-slate-100/50 dark:bg-slate-950/40 p-1.5 rounded-2xl border border-slate-200/50 dark:border-slate-900/80">
                <button
                  type="button"
                  onClick={() => handleDataSourceChange("system")}
                  className={`flex-1 py-3 px-4 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                    dataSource === "system"
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 dark:shadow-blue-500/10 font-bold scale-[1.01]"
                      : "bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Database className="w-3.5 h-3.5" /> {t("tax_page.system_data")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDataSourceChange("manual")}
                  className={`flex-1 py-3 px-4 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                    dataSource === "manual"
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 dark:shadow-blue-500/10 font-bold scale-[1.01]"
                      : "bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" /> {t("tax_page.manual_data")}
                </button>
              </div>

              {dataSource === "system" ? (
                <div className="p-4 bg-slate-50/50 dark:bg-slate-950/30 rounded-2xl border border-slate-200/50 dark:border-slate-900/80 text-sm space-y-3 shadow-inner">
                  {!dataReady ? (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-900/80 pb-2.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">{t("tax_page.bill_status_label")}</span>
                        <div className="h-6 w-32 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
                      </div>
                      <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                      <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-900/80 pb-2.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">{t("tax_page.bill_status_label")}</span>
                        {hasPaidBills ? (
                          <span className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-400 font-bold bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12] border border-emerald-500/20 px-3 py-1 rounded-full text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {t("tax_page.system_success", { count: paidBillsInYear.length })}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold bg-amber-500/[0.08] dark:bg-amber-500/[0.12] border border-amber-500/20 px-3 py-1 rounded-full text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> {t("tax_page.no_paid_bills")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-450 leading-relaxed">
                        {hasPaidBills
                          ? t("tax_page.system_desc_active", { year: taxYear })
                          : t("tax_page.system_desc_empty", { year: taxYear })
                        }
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold tracking-wide">{t("tax_page.manual_rent_label")}</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="w-full px-4 py-2.5 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-200 text-xs font-mono transition-all"
                        value={manualRent405}
                        onChange={(e) => handleManualRentChange(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold tracking-wide">{t("tax_page.manual_util_label")}</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="w-full px-4 py-2.5 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-200 text-xs font-mono transition-all"
                        value={manualUtilities408}
                        onChange={(e) => handleManualUtilChange(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold tracking-wide">{t("tax_page.manual_other_label")}</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="w-full px-4 py-2.5 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-200 text-xs font-mono transition-all"
                        value={manualOther408}
                        onChange={(e) => handleManualOtherChange(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* รูปแบบการหักค่าใช้จ่าย — ฟีเจอร์ 5 (ของใหม่) ย้ายมาแทนที่การ์ดเดิมซึ่งไม่เคยบันทึกลง DB
            เพื่อไม่ให้มีการตั้งค่าเดียวกัน 2 จุดที่ขัดกันเอง (ดูหมายเหตุหัวไฟล์ TaxRulesSettingsSection.tsx)
            หัวข้อการ์ดโชว์ทันที ไม่รอ dataReady — ส่ง loading ให้สลับเฉพาะแถวควบคุมเป็น skeleton ระหว่างรอ
            (กันไม่ให้การ์ดนี้ดู "หลุดจังหวะ" จากการ์ดอื่นที่โชว์หัวข้อทันทีเหมือนกัน) */}
        {hasEditPermission ? (
          <ExpenseModeSection
            loading={!dataReady}
            settings={taxDataset.settings}
            onChange={handleVatSettingsChange}
            busy={savingVatSettings}
            actualAmountA={actualExpense405}
            actualAmountB={actualExpense408}
            onRefreshActual={() => loadExpensesData(taxYear, undefined, true)}
            refreshingActual={loadingExpenses}
            t={t}
          />
        ) : (
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-900/60 dark:bg-slate-900 h-full min-h-[220px] animate-pulse" />
        )}
      </div>

      {/* ตั้งค่า VAT + กฎภาษี — ฟีเจอร์ 5 (ของใหม่ทั้งบล็อก) ดู src/features/tax/components
          หัวข้อการ์ดโชว์ทันทีเหมือนการ์ดอื่นในหน้านี้ — ส่ง loading={!dataReady} ให้สลับเฉพาะตัวควบคุม/ตาราง
          เป็น skeleton ระหว่างรอ ไม่ต้องซ่อนทั้งบล็อกจนกว่าจะโหลดเสร็จ (MinTaxRuleSection เป็นค่าคงที่ตามกฎหมาย
          ไม่มีอะไรต้องรอโหลด จึงไม่ต้องส่ง loading ให้) */}
      {hasEditPermission && (
        <div className="space-y-6">
          <VatSettingsSection
            loading={!dataReady}
            settings={taxDataset.settings}
            onChange={handleVatSettingsChange}
            status={vatStatus}
            breach={vatBreach}
            busy={savingVatSettings}
            t={t}
            locale={locale}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TaxpayerTypeSection loading={!dataReady} settings={taxDataset.settings} t={t} />
            <MinTaxRuleSection t={t} />
          </div>
        </div>
      )}

      {/* 3. ระบบบันทึกค่าใช้จ่ายและคู่มือคำแนะนำทางภาษี */}
      <div className="space-y-6">
        
        {/* คู่มือแนะนำ (Recommendation Guide) */}
        <div className="glass-card rounded-3xl border border-slate-200/80 dark:border-slate-900/60 p-6 md:p-8 space-y-5 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-900 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{t("tax_page.guide_title")}</h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t("tax_page.guide_subtitle")}</p>
              </div>
            </div>
            
            <button
              onClick={() => setShowGuide(!showGuide)}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                showGuide
                  ? "bg-slate-100 dark:bg-slate-900/40 hover:bg-slate-200 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 border border-transparent hover:border-slate-200/30"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30"
              }`}
            >
              {showGuide ? (
                <>{t("tax_page.hide_guide")} <ChevronUp className="w-4 h-4" /></>
              ) : (
                <>{t("tax_page.show_guide")} <ChevronDown className="w-4 h-4" /></>
              )}
            </button>
          </div>

          {showGuide && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1 animate-fade-in">
              
              {/* รายจ่าย 40(5) */}
              <div className="bg-gradient-to-br from-blue-500/[0.03] to-indigo-500/[0.01] dark:from-blue-500/[0.07] dark:to-transparent border border-blue-100 dark:border-blue-900/40 rounded-2xl p-6 space-y-4 shadow-inner group">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-extrabold text-xs">
                  <div className="p-1.5 bg-blue-500/10 dark:bg-blue-500/20 rounded-lg">
                    <Landmark className="w-4 h-4" />
                  </div>
                  {t("tax_page.guide_405_title")}
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  {t("tax_page.guide_405_desc_part1")} <strong className="text-slate-700 dark:text-slate-300">{t("tax_page.guide_405_desc_part2")}</strong> {t("tax_page.guide_405_desc_part3")}
                </p>
                
                <div className="space-y-3 pt-3 border-t border-slate-250/30 dark:border-slate-800/80">
                  <div className="text-xs sm:text-sm font-extrabold text-slate-700 dark:text-slate-250 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> {t("tax_page.deductible_items")}
                  </div>
                  <ul className="space-y-2.5 pl-1">
                    <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-blue-500/80 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-800 dark:text-slate-300">{t("tax_page.item_major_repair")}</strong> {t("tax_page.item_major_repair_desc")}
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-blue-500/80 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-800 dark:text-slate-300">{t("tax_page.item_interest")}</strong> {t("tax_page.item_interest_desc")}
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-blue-500/80 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-800 dark:text-slate-300">{t("tax_page.item_taxes")}</strong> {t("tax_page.item_taxes_desc")}
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-blue-500/80 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-800 dark:text-slate-300">{t("tax_page.item_insurance")}</strong> {t("tax_page.item_insurance_desc")}
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-blue-500/80 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-800 dark:text-slate-300">{t("tax_page.item_depreciation")}</strong> {t("tax_page.item_depreciation_desc")}
                      </div>
                    </li>
                  </ul>
                </div>
                
                <div className="p-3 bg-blue-500/[0.04] dark:bg-blue-500/[0.08] border border-blue-500/10 rounded-xl text-xs text-blue-800 dark:text-blue-300 flex gap-2 items-start shadow-inner">
                  <Info className="w-4 h-4 shrink-0 text-blue-500" />
                  <span className="leading-relaxed"><strong>{t("tax_page.guide_recommendation")}</strong> {t("tax_page.guide_405_recommend_desc")}</span>
                </div>
              </div>

              {/* รายจ่าย 40(8) */}
              <div className="bg-gradient-to-br from-teal-500/[0.03] to-emerald-500/[0.01] dark:from-teal-500/[0.07] dark:to-transparent border border-teal-100 dark:border-teal-900/40 rounded-2xl p-6 space-y-4 shadow-inner group">
                <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-extrabold text-xs">
                  <div className="p-1.5 bg-teal-500/10 dark:bg-teal-500/20 rounded-lg">
                    <Zap className="w-4 h-4" />
                  </div>
                  {t("tax_page.guide_408_title")}
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  {t("tax_page.guide_408_desc_part1")} <strong className="text-slate-700 dark:text-slate-300">{t("tax_page.guide_408_desc_part2")}</strong> {t("tax_page.guide_408_desc_part3")}
                </p>
                
                <div className="space-y-3 pt-3 border-t border-slate-250/30 dark:border-slate-800/80">
                  <div className="text-xs sm:text-sm font-extrabold text-slate-700 dark:text-slate-250 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span> {t("tax_page.deductible_items")}
                  </div>
                  <ul className="space-y-2.5 pl-1">
                    <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-teal-500/80 dark:text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-800 dark:text-slate-300">{t("tax_page.item_utilities_gov")}</strong> {t("tax_page.item_utilities_gov_desc")}
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-teal-500/80 dark:text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-800 dark:text-slate-300">{t("tax_page.item_utility_maintenance")}</strong> {t("tax_page.item_utility_maintenance_desc")}
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-teal-500/80 dark:text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-800 dark:text-slate-300">{t("tax_page.item_staff_wages")}</strong> {t("tax_page.item_staff_wages_desc")}
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-teal-500/80 dark:text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-800 dark:text-slate-300">{t("tax_page.item_internet")}</strong> {t("tax_page.item_internet_desc")}
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-teal-500/80 dark:text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-800 dark:text-slate-300">{t("tax_page.item_supplies")}</strong> {t("tax_page.item_supplies_desc")}
                      </div>
                    </li>
                  </ul>
                </div>
                
                <div className="p-3 bg-teal-500/[0.04] dark:bg-teal-500/[0.08] border border-teal-500/10 rounded-xl text-xs text-teal-800 dark:text-teal-300 flex gap-2 items-start shadow-inner">
                  <Info className="w-4 h-4 shrink-0 text-teal-500" />
                  <span className="leading-relaxed"><strong>{t("tax_page.guide_recommendation")}</strong> {t("tax_page.guide_408_recommend_desc")}</span>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>


      {/* ตารางแสดงรายรับรายเดือน — แสดงเฉพาะตอนยังไม่จด VAT เท่านั้น พอจดแล้วสลับไปโชว์แบบ ภ.พ.30
          รายเดือนแทนที่ตำแหน่งนี้เลย (ดู VatGate ด้านล่าง) เพราะเป็นข้อมูลชุดเดียวกันแค่มุมมองต่างกัน */}
      <VatNotRegisteredOnly settings={taxDataset.settings}>
      <div className="glass-card rounded-3xl border border-slate-200/80 dark:border-slate-900/60 p-6 md:p-8 space-y-6 shadow-sm hover:shadow-md transition-all duration-300">
        <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-900/40">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          <div>
            <h3 className="text-base font-bold text-slate-850 dark:text-slate-50">
              {t("tax_page.monthly_summary_title", { year: taxYear })}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {t("tax_page.monthly_summary_subtitle")}
            </p>
          </div>
        </div>
        
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm bg-white dark:bg-slate-950/20">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm sm:text-base border-collapse">
              <thead>
                <tr className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 font-extrabold text-xs sm:text-sm uppercase tracking-wider border-b-2 border-slate-250 dark:border-slate-800 shadow-sm">
                  <th className="py-4 px-4 pl-5">{t("tax_page.col_month")}</th>
                  <th className="py-4 px-4 text-center">{t("tax_page.col_bills_count")}</th>
                  <th className="py-4 px-4 text-right text-blue-700 dark:text-blue-350">{t("tax_page.col_rent_405")}</th>
                  <th className="py-4 px-4 text-right text-teal-700 dark:text-teal-350">{t("tax_page.col_util_408")}</th>
                  <th className="py-4 px-4 text-right text-indigo-700 dark:text-indigo-350">{t("tax_page.col_total_revenue")}</th>
                  <th className="py-4 px-4 pr-5 text-center">{t("tax_page.col_data_status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 bg-white dark:bg-transparent">
                {(() => {
                  let sumRent = 0
                  let sumUtil = 0
                  let sumTotal = 0
                  let sumBills = 0

                  const rows = monthsList.map((m, idx) => {
                    const cycleStr = `${taxYear}-${m.num}`
                    const paidBillsInMonth = bills.filter(b => b.status === "paid" && b.billingCycle === cycleStr)
                    
                    let monthlyRent = 0
                    let monthlyUtil = 0
                    
                    if (dataSource === "system" && hasPaidBills) {
                      paidBillsInMonth.forEach(bill => {
                        const electricUnits = Number(bill.electricUnits || 0)
                        const waterUnits = Number(bill.waterUnits || 0)
                        
                        const elecAmount = electricUnits * electricRate
                        const waterAmount = waterUnits * waterRate
                        
                        // ค่าน้ำไฟ/บริการ 40(8) = ค่ายูนิตน้ำ + ค่ายูนิตไฟ + ค่าส่วนกลาง
                        const utilitiesAmount = elecAmount + waterAmount + commonFee
                        
                        const billAmount = Number(bill.amount || 0)
                        
                        // ค้นหาค่าเช่าห้องพักหลัก (baseRent) จากข้อมูลห้อง หรือใช้ส่วนต่างบิลหักน้ำไฟส่วนกลางเป็นทางเลือกสุดท้าย
                        const matchedRoom = findRoomFor(bill)
                        const baseRentVal = matchedRoom ? matchedRoom.baseRent : Math.max(0, billAmount - utilitiesAmount)
                        
                        // ค่าเช่า 40(5) = เฉพาะค่าเช่าห้องพักหลัก
                        const rentAmount = Math.max(0, Math.min(baseRentVal, billAmount))
                        
                        // รายได้อื่นๆ 40(8) = ยอดชำระสุทธิ - ค่าเช่าห้อง - ค่าน้ำไฟ/บริการส่วนกลาง (เช่น เงินปรับล่าช้า / มัดจำ)
                        const otherAmount = Math.max(0, billAmount - rentAmount - utilitiesAmount)

                        monthlyRent += rentAmount
                        monthlyUtil += (utilitiesAmount + otherAmount)
                      })
                      
                      // บวกค่าเช่าล่วงหน้าสะสมของเดือนนี้ (40(5))
                      const advanceRentBillsInMonth = advanceRentBills.filter(tenantItem => tenantItem.contractStart && tenantItem.contractStart.startsWith(`${taxYear}-${m.num}`))
                      const advanceRentAmountInMonth = advanceRentBillsInMonth.reduce((sum, tenantItem) => {
                        const matchedRoom = findRoomFor(tenantItem)
                        const roomRent = matchedRoom ? matchedRoom.baseRent : 0
                        return sum + (roomRent * defaultAdvanceRent)
                      }, 0)
                      
                      // บวกเงินประกันริบสะสมของเดือนนี้ (40(8) และ 40(5) ที่เกิดขึ้นจากการเช็คเอาท์)
                      const forfeitedBillsInMonth = cancelledInYear.filter(c => c.cancellationDate && c.cancellationDate.startsWith(`${taxYear}-${m.num}`))
                      
                      const rentDeductionInMonth = forfeitedBillsInMonth.reduce((sum, c) => sum + Number(c.deductedRent405 || 0), 0)
                      const utilitiesDeductionInMonth = forfeitedBillsInMonth.reduce((sum, c) => sum + Number(c.deductedUtilities408 || 0), 0)
                      const servicesDeductionInMonth = forfeitedBillsInMonth.reduce((sum, c) => sum + getContractServices408(c), 0)

                      monthlyRent += advanceRentAmountInMonth + rentDeductionInMonth
                      monthlyUtil += utilitiesDeductionInMonth + servicesDeductionInMonth
                      sumBills += paidBillsInMonth.length
                    } else {
                      // ข้อมูลจำลอง/ manual หาร 12
                      monthlyRent = rent405Full / 12
                      monthlyUtil = (utilities408Full + other408Full) / 12
                    }
                    
                    const monthlyTotal = monthlyRent + monthlyUtil
                    const hasRealData = paidBillsInMonth.length > 0 && dataSource === "system"

                    sumRent += monthlyRent
                    sumUtil += monthlyUtil
                    sumTotal += monthlyTotal

                    const isEven = idx % 2 === 0;

                    return (
                      <tr 
                        key={m.num} 
                        className={`${isEven ? "bg-slate-50/[0.35] dark:bg-slate-900/[0.15]" : "bg-white dark:bg-transparent"} hover:bg-blue-500/[0.05] dark:hover:bg-blue-500/[0.09] transition-all duration-150 border-b border-slate-100 dark:border-slate-800/60`}
                      >
                        <td className="py-3.5 px-4 pl-5 font-extrabold text-slate-900 dark:text-slate-100">{t("dashboard.month_" + m.num)}</td>
                        <td className="py-3.5 px-4 text-center text-slate-700 dark:text-slate-300 font-semibold">
                          {dataSource === "system" && hasPaidBills ? t("tax_page.rooms_unit", { count: paidBillsInMonth.length }) : "-"}
                        </td>
                        <td className="py-3.5 px-4 text-right text-slate-900 dark:text-slate-100 font-mono font-semibold">{formatMoney(monthlyRent)} {t("tax_page.baht")}</td>
                        <td className="py-3.5 px-4 text-right text-slate-900 dark:text-slate-100 font-mono font-semibold">{formatMoney(monthlyUtil)} {t("tax_page.baht")}</td>
                        <td className="py-3.5 px-4 text-right text-blue-600 dark:text-blue-400 font-extrabold font-mono bg-blue-500/[0.01] dark:bg-blue-500/[0.03]">{formatMoney(monthlyTotal)} {t("tax_page.baht")}</td>
                        <td className="py-3.5 px-4 pr-5 text-center">
                          {hasRealData ? (
                            <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-teal-500/[0.08] dark:bg-teal-500/[0.12] text-teal-700 dark:text-teal-400 border border-teal-500/20 shadow-sm">
                              {t("tax_page.real_bill")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm">
                              {t("tax_page.simulated_calc")}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })

                  return (
                    <>
                      {rows}
                      {/* แถวสรุปผลรวมสะสมที่ถูกต้องสมบูรณ์เพื่อไม่ให้เกิดเศษหรือข้อผิดพลาด */}
                      <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-gradient-to-r from-slate-100/90 to-slate-50/90 dark:from-slate-900 dark:to-slate-900/60 font-black text-slate-900 dark:text-slate-100 shadow-md">
                        <td className="py-4.5 px-4 pl-5 font-black">{t("tax_page.total_accum_year")}</td>
                        <td className="py-4.5 px-4 text-center text-slate-900 dark:text-slate-200 font-bold">
                          {dataSource === "system" && hasPaidBills ? t("tax_page.bills_unit", { count: sumBills }) : "-"}
                        </td>
                        <td className="py-4.5 px-4 text-right text-blue-700 dark:text-blue-350 font-mono font-bold">{formatMoney(sumRent)} {t("tax_page.baht")}</td>
                        <td className="py-4.5 px-4 text-right text-teal-700 dark:text-teal-350 font-mono font-bold">{formatMoney(sumUtil)} {t("tax_page.baht")}</td>
                        <td className="py-4.5 px-4 text-right text-blue-800 dark:text-blue-300 font-mono font-black">
                          <span className="bg-blue-500/[0.08] dark:bg-blue-500/[0.15] px-3 py-1.5 rounded-xl border border-blue-500/20 dark:border-blue-500/35 shadow-inner">
                            {formatMoney(sumTotal)} {t("tax_page.baht")}
                          </span>
                        </td>
                        <td className="py-4.5 px-4 pr-5 text-center">
                          <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-extrabold px-3 py-1 rounded-lg bg-blue-600 dark:bg-blue-500 text-white dark:text-white border border-blue-600 dark:border-blue-500 shadow-md shadow-blue-500/25">
                            {t("tax_page.grand_total_badge")}
                          </span>
                        </td>
                      </tr>
                    </>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </VatNotRegisteredOnly>

      {/* สรุปรายเดือนแบบมี VAT — แสดงแทนตารางรายรับรายเดือนด้านบนทันทีที่จดทะเบียน VAT แล้ว (ตำแหน่งเดียวกัน)
          แบบ ภ.พ.30 รายเดือน (การยื่นแบบจริง) ย้ายไปอยู่ใต้บล็อกค่าเช่าล่วงหน้าสะสม มาตรา 40(5) แทนแล้ว */}
      {dataReady && (
        <VatGate settings={taxDataset.settings}>
          <MonthlyVatOverviewTable
            year={Number(taxYear)}
            vatEnabled={taxOverview.vatEnabled}
            yearIncome={taxOverview.yearIncome}
            yearExpense={taxOverview.yearExpense}
            months={taxOverview.months}
            hasData={taxOverview.hasData}
            t={t}
            locale={locale}
          />
        </VatGate>
      )}

      {/* Modal กรอกภาษีซื้อ/ยื่น ภ.พ.30 ของเดือนที่เลือก */}
      {filingPp30Row && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300 animate-fade-in">
          <div className="relative w-full md:max-w-2xl bg-white dark:bg-slate-900 border-t md:border border-slate-200 dark:border-slate-800 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm tracking-tight">
                {t('tax_page.pp30_modal_title', { year: taxYear })}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportPp30Pdf(filingPp30Row)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> {t('tax_page.pp30_modal_download_pdf')}
                </button>
                <button
                  onClick={() => setFilingPp30Row(null)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-100 text-slate-500 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <Pp30FilingForm
                row={filingPp30Row}
                expensesInMonth={taxDataset.expenses.filter(e => e.date.slice(0, 7) === filingPp30Row.period)}
                onSubmitFiling={handleSubmitPp30Filing}
                onUnfile={handleUnfilePp30}
                onCancel={() => setFilingPp30Row(null)}
                busy={savingPp30}
                t={t}
                locale={locale}
              />
            </div>
          </div>
        </div>
      )}

      {/* ส่วนจัดการสัญญา ค่าเช่าล่วงหน้า (มาตรา 40(5)) */}
      <div>
        {/* บล็อกค่าเช่าล่วงหน้าสะสม (มาตรา 40(5)) */}
        <div className="glass-card rounded-3xl border border-slate-200/80 dark:border-slate-900/60 p-6 md:p-8 space-y-6 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="pb-2 border-b border-slate-100 dark:border-slate-900/40">
            <h3 className="text-base font-bold text-slate-855 dark:text-slate-50 flex items-center gap-2.5">
              <Landmark className="w-5 h-5 text-blue-500" /> {t("tax_page.advance_rent_title")}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {t("tax_page.advance_rent_subtitle", { year: taxYear })}
            </p>
          </div>

          {advanceRentBills.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm bg-white dark:bg-slate-950/20">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm sm:text-base border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 font-bold text-xs sm:text-sm uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-800/60">
                        <th className="py-4 px-4 pl-5">{t("tax_page.col_room_tenant")}</th>
                        <th className="py-4 px-4 text-center">{t("tax_page.col_contract_start")}</th>
                        <th className="py-4 px-4 pr-5 text-right">{t("tax_page.col_advance_rent_accum")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-900/30">
                      {advanceRentBills.map((tenantItem) => {
                        const matchedRoom = findRoomFor(tenantItem)
                        const roomRent = matchedRoom ? matchedRoom.baseRent : 0
                        const advanceRentVal = roomRent * defaultAdvanceRent
                        return (
                          <tr key={tenantItem.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors duration-150">
                            <td className="py-4 px-4 pl-5 font-bold text-slate-855 dark:text-slate-100">
                              {t("tax_page.room_tenant_format", { room: tenantItem.roomNumber, tenant: tenantItem.fullName })}
                              <span className="block text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
                                {t("tax_page.rent_rate_label")} <span className="font-semibold text-slate-700 dark:text-slate-300">{formatMoney(roomRent)} {t("tax_page.baht_per_month")}</span> {t("tax_page.advance_months_count", { count: defaultAdvanceRent })}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-center text-slate-600 dark:text-slate-400 font-mono text-xs sm:text-sm font-medium">
                              {tenantItem.contractStart ? new Date(tenantItem.contractStart).toLocaleDateString(locale === "th" ? "th-TH" : "en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              }) : "-"}
                            </td>
                            <td className="py-4 px-4 pr-5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                              {formatMoney(advanceRentVal)} {t("tax_page.baht")}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800 text-xs sm:text-sm text-slate-555 dark:text-slate-400 font-bold">
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  {t("tax_page.contracts_started_count", { count: advanceRentBills.length })}
                </span>
                <span className="text-blue-600 dark:text-blue-400 font-bold font-mono text-xs sm:text-sm bg-blue-50/50 dark:bg-blue-500/[0.12] px-3 py-1.5 rounded-xl border border-blue-100 dark:border-blue-500/20 shadow-sm">
                  {t("tax_page.total_advance_accum", { amount: formatMoney(totalAdvanceRentAmount) })}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center rounded-2xl bg-slate-50/40 dark:bg-slate-900/10 border border-dashed border-slate-200 dark:border-slate-800/80 text-slate-500 text-xs">
              <p className="font-semibold text-slate-700 dark:text-slate-300">{t("tax_page.no_new_contracts", { year: taxYear })}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">{t("tax_page.no_new_contracts_desc")}</p>
            </div>
          )}
        </div>
      </div>

      {/* แบบ ภ.พ.30 รายเดือน — ย้ายมาอยู่ใต้บล็อกค่าเช่าล่วงหน้าสะสม มาตรา 40(5) แล้ว (เดิมอยู่ติดกับ
          MonthlyVatOverviewTable ด้านบน) */}
      {dataReady && (
        <VatGate settings={taxDataset.settings}>
          <Pp30Report
            year={Number(taxYear)}
            rows={pp30.rows}
            totals={pp30.totals}
            enabled={pp30.enabled}
            vat={vatStatus}
            onOpenFiling={(row) => setFilingPp30Row(row)}
            onMarkFiled={handleMarkPp30Filed}
            onExportCsv={handleExportPp30Csv}
            onExportPdf={handleExportPp30Pdf}
            t={t}
            locale={locale}
          />
        </VatGate>
      )}


      {/* แถวการคำนวณแบ่งยื่นครึ่งปีและเต็มปี — รวมสรุปยอด/ค่าลดหย่อนส่วนตัว/ขั้นบันได/ยอดชำระ เป็นการ์ดเดียวต่อแบบ
          ปุ่มดาวน์โหลด PDF และปุ่มบันทึกว่ายื่นแบบแล้วอยู่ล่างสุดของการ์ด */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ครึ่งปี ภ.ง.ด. 94 */}
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-500" /> {t("tax_page.pnd94_title")}
          </h3>

          <PersonalAllowanceLockNotice hideHeader form="PND94" taxpayerType={taxpayerStatus} partnerCount={partnerCount} t={t} />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>{t("tax_page.revenue_first_half_label")}</span><span className="font-semibold text-slate-800 dark:text-slate-200">{formatMoney(halfTotalRevenue)} {t("tax_page.baht")}</span></div>
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>{t("tax_page.deduction_rent_label", { method: deductionMethod405 === "เหมา 30%" ? t("tax_page.flat_30_label") : t("tax_page.actual_deduction") })}</span><span className="font-semibold text-red-600 dark:text-red-400">-{formatMoney(deductionRent405Half)} {t("tax_page.baht")}</span></div>
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>{t("tax_page.deduction_util_half_label")}</span><span className="font-semibold text-red-600 dark:text-red-400">-{formatMoney(deductionUtilities408Half)} {t("tax_page.baht")}</span></div>
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>{t("tax_page.personal_allowance_label")}</span><span className="font-semibold text-red-600 dark:text-red-400">-{formatMoney(pitResult94?.deductions.personalAllowance ?? 0)} {t("tax_page.baht")}</span></div>
            <div className="h-px bg-slate-200 dark:bg-slate-900 my-2" />
            <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200"><span>{t("tax_page.net_income_half_label")}</span><span className="text-blue-600 dark:text-blue-400">{formatMoney(pitResult94?.netIncome ?? netIncomeHalf)} {t("tax_page.baht")}</span></div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl text-xs text-slate-550 dark:text-slate-400 leading-relaxed">
            <span className="font-bold text-slate-700 dark:text-slate-300">{t("tax_page.filing_period_title")}</span> {t("tax_page.pnd94_filing_period_desc")}
          </div>

          {pitResult94 && (
            <>
              <div className="h-px bg-slate-200 dark:bg-slate-900" />
              <ProgressiveBracketTable bare result={pitResult94} t={t} />
              {pnd94Computation && (
                <>
                  <div className="h-px bg-slate-200 dark:bg-slate-900" />
                  <PitBalanceSummary bare computation={pnd94Computation} t={t} />
                </>
              )}
            </>
          )}

          <button
            onClick={() => handleDownloadPdf("94")}
            disabled={loadingPdf !== null}
            className={`w-full py-2.5 bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/10 transition-colors ${
              !hasEditPermission ? "opacity-50 cursor-not-allowed font-medium" : "hover:bg-blue-500 cursor-pointer disabled:cursor-not-allowed"
            }`}
          >
            {loadingPdf === "94" ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Download className="w-4 h-4" /> {t("tax_page.download_pnd94_btn")}
              </>
            )}
          </button>
          {hasEditPermission && (
            <button
              onClick={() => handleFilePitReturn("94")}
              disabled={filingPit !== null || !pitResult94}
              className="w-full py-2 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-400 font-semibold rounded-xl text-xs hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {filingPit === "94" ? "กำลังบันทึก..." : pitFiledSnapshot94 ? `ยื่นแบบแล้วเมื่อ ${pitFiledSnapshot94.filedAt} (กดเพื่ออัปเดต)` : "บันทึกว่ายื่นแบบแล้ว"}
            </button>
          )}
        </div>

        {/* เต็มปี ภ.ง.ด. 90 */}
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-900/60 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-teal-500" /> {t("tax_page.pnd90_title")}
          </h3>

          <PersonalAllowanceLockNotice hideHeader form="PND90" taxpayerType={taxpayerStatus} partnerCount={partnerCount} t={t} />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>{t("tax_page.revenue_full_year_label")}</span><span className="font-semibold text-slate-800 dark:text-slate-200">{formatMoney(fullTotalRevenue)} {t("tax_page.baht")}</span></div>
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>{t("tax_page.deduction_rent_label", { method: deductionMethod405 === "เหมา 30%" ? t("tax_page.flat_30_label") : t("tax_page.actual_deduction") })}</span><span className="font-semibold text-red-600 dark:text-red-400">-{formatMoney(deductionRent405Full)} {t("tax_page.baht")}</span></div>
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>{t("tax_page.deduction_util_full_label")}</span><span className="font-semibold text-red-600 dark:text-red-400">-{formatMoney(deductionUtilities408Full)} {t("tax_page.baht")}</span></div>
            <div className="flex justify-between text-slate-550 dark:text-slate-400"><span>{t("tax_page.personal_allowance_label")}</span><span className="font-semibold text-red-600 dark:text-red-400">-{formatMoney(pitResult90?.deductions.personalAllowance ?? 0)} {t("tax_page.baht")}</span></div>
            <div className="h-px bg-slate-200 dark:bg-slate-900 my-2" />
            <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200"><span>{t("tax_page.net_income_full_label")}</span><span className="text-teal-600 dark:text-teal-400">{formatMoney(pitResult90?.netIncome ?? netIncomeFull)} {t("tax_page.baht")}</span></div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl text-xs text-slate-550 dark:text-slate-400 leading-relaxed">
            <span className="font-bold text-slate-700 dark:text-slate-300">{t("tax_page.filing_period_title")}</span> {t("tax_page.pnd90_filing_period_desc")}
          </div>

          {pitResult90 && (
            <>
              <div className="h-px bg-slate-200 dark:bg-slate-900" />
              <ProgressiveBracketTable bare result={pitResult90} t={t} />
              {pnd90Computation && (
                <>
                  <div className="h-px bg-slate-200 dark:bg-slate-900" />
                  <PitBalanceSummary bare computation={pnd90Computation} t={t} />
                </>
              )}
            </>
          )}

          <button
            onClick={() => handleDownloadPdf("90")}
            disabled={loadingPdf !== null}
            className={`w-full py-2.5 bg-teal-600 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-teal-600/10 transition-colors ${
              !hasEditPermission ? "opacity-50 cursor-not-allowed font-medium" : "hover:bg-teal-500 cursor-pointer disabled:cursor-not-allowed"
            }`}
          >
            {loadingPdf === "90" ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Download className="w-4 h-4" /> {t("tax_page.download_pnd90_btn")}
              </>
            )}
          </button>
          {hasEditPermission && (
            <button
              onClick={() => handleFilePitReturn("90")}
              disabled={filingPit !== null || !pitResult90}
              className="w-full py-2 border border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-400 font-semibold rounded-xl text-xs hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {filingPit === "90" ? "กำลังบันทึก..." : pitFiledSnapshot90 ? `ยื่นแบบแล้วเมื่อ ${pitFiledSnapshot90.filedAt} (กดเพื่ออัปเดต)` : "บันทึกว่ายื่นแบบแล้ว"}
            </button>
          )}
        </div>
      </div>

      {/* ตารางเทียบครึ่งปี vs สิ้นปี — คำนวณจาก src/lib/thaiTax.ts เท่านั้น (ตรงกับ PDF ด้านบนเป๊ะ) */}
      {dataReady && pnd90Computation && <PitComparisonTable pnd90={pnd90Computation} t={t} />}

    </div>
  )
}
