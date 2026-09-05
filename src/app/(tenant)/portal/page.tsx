"use client"

import { Suspense, useState, useEffect, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

function setCookie(name: string, value: string, days = 7) {
  if (typeof document === "undefined") return
  const date = new Date()
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
  document.cookie = `${name}=${value}; path=/; expires=${date.toUTCString()}`
}
import {
  Building,
  Calendar,
  Zap,
  Droplet,
  Download,
  Upload,
  CheckCircle2,
  Clock,
  LogOut,
  History,
  QrCode,
  Image as ImageIcon,
  ShieldCheck,
  AlertCircle,
  X,
  Share2
} from "lucide-react"
import { generatePromptPayPayload } from "@/lib/promptpay"
import { usePortalData } from "./PortalDataProvider"
import PortalLoadingScreen from "./PortalLoadingScreen"
import { updateBillStatus } from "@/features/billing/actions"
import { createClient } from "@/lib/supabase/client"
import PullToRefresh from "@/components/PullToRefresh"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { parseUtilitySegments, formatSegmentRoomLabel } from "@/lib/billSegments"
import { parsePortalFocusAction, type PortalFocusAction } from "@/lib/portalLiff"
import { DynamicText } from "@/lib/translations/DynamicText"
import { LanguageToggle } from "@/components/LanguageToggle"
import { ThemeToggle } from "@/components/ThemeToggle"


interface BillHistoryItem {
  cycle: string
  amount: number
  status: "paid" | "unpaid" | "pending"
}

/** การ์ดที่ ?action= จาก rich menu ชี้ให้เลื่อนไปหา (null = ไม่ได้เจาะจง ให้อยู่หัวหน้าบิลตามปกติ) */
type PortalFocusSection = PortalFocusAction | null

const optimizeImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Resize logic: Max width 1200px (retaining aspect ratio)
        const maxWidth = 1200;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get 2D context for image compression"));
          return;
        }

        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP if browser supports it, otherwise fallback to JPEG
        // We compress at 75% quality as requested
        const targetType = "image/jpeg";
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Image compression failed"));
            }
          },
          targetType,
          0.75
        );
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

function TenantPortalContent() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ปุ่มใน rich menu ของ LINE ส่ง ?action= มาบอกว่าผู้เช่ากดปุ่มอะไรเข้ามา (ดู src/lib/portalLiff.ts)
  // เพื่อเลื่อนจอไปที่การ์ดนั้นให้ทันที ไม่ต้องให้ผู้เช่าเลื่อนหาเองในหน้าที่ยาวมาก
  const qrSectionRef = useRef<HTMLDivElement | null>(null)
  const uploadSectionRef = useRef<HTMLDivElement | null>(null)
  const didFocusActionRef = useRef(false)
  const [focusSection, setFocusSection] = useState<PortalFocusSection>(null)

  /**
   * ลิงก์ไปหน้าประวัติบิล โดยพา workspace_id/room_id/token เดิมไปด้วย
   *
   * อ่านผ่าน useSearchParams ไม่ใช่ window.location เพราะ window ไม่มีตอน SSR
   * ถ้าแยกสองทางจะได้ href คนละค่าระหว่าง server กับ client แล้ว hydration ไม่ตรงกัน
   */
  const historyHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("action")
    const qs = params.toString()
    return qs ? `/portal/history?${qs}` : "/portal/history"
  }, [searchParams])

  /** ห้องนี้ยังไม่เคยมีบิลออกมาเลย (คนละเรื่องกับบิลที่จ่ายครบแล้ว) */
  const [noBillYet, setNoBillYet] = useState(false)

  const [isDemo, setIsDemo] = useState(false)
  const [roomNumber, setRoomNumber] = useState("")
  const [tenantName, setTenantName] = useState("")
  const [billingCycle, setBillingCycle] = useState("")
  // ข้อมูลบิลทั้งหมดโหลดที่ layout ครั้งเดียว (ดู PortalDataProvider) หน้านี้แค่หยิบมาแปลงลงจอ
  const { result, loading: pageLoading, isLoginFree, reload } = usePortalData()
  
  const [bill, setBill] = useState<any>(null)
  const [billStatus, setBillStatus] = useState<"unpaid" | "pending" | "paid">("unpaid")
  const [uploadedSlip, setUploadedSlip] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [promptPayId, setPromptPayId] = useState("0899999999")
  const [promptPayName, setPromptPayName] = useState("สมเจตน์ แสนสุข")
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceAddress, setWorkspaceAddress] = useState("")
  const [workspacePhone, setWorkspacePhone] = useState("")
  const [workspaceTaxId, setWorkspaceTaxId] = useState("")
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [history, setHistory] = useState<BillHistoryItem[]>([])
  const [baseRent, setBaseRent] = useState(4500)
  const [commonFee, setCommonFee] = useState(50)
  const [waterRate, setWaterRate] = useState(18)
  const [electricRate, setElectricRate] = useState(7)
  const [latePenaltyRate, setLatePenaltyRate] = useState(0)
  const [waiveElectricMin, setWaiveElectricMin] = useState(false)
  const [waiveWaterMin, setWaiveWaterMin] = useState(false)
  const [waterMinChecked, setWaterMinChecked] = useState(true)
  const [waterMinUnit, setWaterMinUnit] = useState(3)
  const [electricMinChecked, setElectricMinChecked] = useState(true)
  const [electricMinUnit, setElectricMinUnit] = useState(10)
  const [extraExpenses, setExtraExpenses] = useState<any[]>([])
  const [electricBillingMode, setElectricBillingMode] = useState<"fixed_rate" | "building_total">("fixed_rate")
  const [waterBillingMode, setWaterBillingMode] = useState<"fixed_rate" | "building_total">("fixed_rate")
  const [workspaceLogo, setWorkspaceLogo] = useState<string>("")
  const [combinedQrUrl, setCombinedQrUrl] = useState<string>("")
  const [isQrLoading, setIsQrLoading] = useState<boolean>(false)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && typeof navigator.share === "function") {
      setCanShare(true)
    }
  }, [])



  const formatCycle = (cycleStr: string) => {
    if (!cycleStr) return ""
    if (cycleStr.includes("-")) {
      const [year, month] = cycleStr.split("-")
      const monthIdx = parseInt(month, 10) - 1
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${t("dashboard.month_" + month)} ${year}`
      }
    }
    return cycleStr
  }

  // แปลงรอบบิล "YYYY-MM" เป็น "เดือน ปี" ภาษาไทยเสมอ (ไม่ผูกกับภาษา UI ที่เลือกไว้) — ใช้เฉพาะกล่อง
  // "รายละเอียดใบแจ้งหนี้จริงจากหน่วยงาน" ที่เป็นข้อความราชการ/กฎหมายซึ่งควรเป็นภาษาไทยเสมอ
  const formatCycleThai = (cycleStr: string) => {
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

  // แปลงผลดิบจาก PortalDataProvider (layout) ลง state ของหน้านี้
  //
  // การโหลดจริงย้ายไปอยู่ที่ layout แล้ว เพื่อให้ /portal กับ /portal/history ใช้ข้อมูลชุดเดียวกัน
  // ไม่ต้องยิง server action ซ้ำตอนสลับหน้า — ที่นี่เหลือแค่หน้าที่ "แปลงค่าลงจอ" เท่านั้น
  useEffect(() => {
    if (!result) return
    const res = result
    if (res.success && res.data) {
      setIsDemo(false)
      const data = res.data
      setRoomNumber(data.roomNumber || t("tenant_portal.room_fallback"))
      setTenantName(data.tenantName)
      setBaseRent(data.baseRent)
      if (data.promptPayId) {
        setPromptPayId(data.promptPayId)
      }
      if (data.promptPayName) {
        setPromptPayName(data.promptPayName)
      }
      if (data.workspaceName) {
        setWorkspaceName(data.workspaceName)
      }
      if (data.workspaceAddress) {
        setWorkspaceAddress(data.workspaceAddress)
      }
      if (data.workspacePhone) {
        setWorkspacePhone(data.workspacePhone)
      }
      if (data.workspaceTaxId) {
        setWorkspaceTaxId(data.workspaceTaxId)
      }
      if (data.commonFee !== undefined) {
        setCommonFee(data.commonFee)
      }
      if (data.waterRate !== undefined) {
        setWaterRate(data.waterRate)
      }
      if (data.electricRate !== undefined) {
        setElectricRate(data.electricRate)
      }
      if (data.latePenaltyRate !== undefined) {
        setLatePenaltyRate(data.latePenaltyRate)
      }
      if (data.waiveElectricMin !== undefined) {
        setWaiveElectricMin(!!data.waiveElectricMin)
      }
      if (data.waiveWaterMin !== undefined) {
        setWaiveWaterMin(!!data.waiveWaterMin)
      }
      if (data.waterMinChecked !== undefined) {
        setWaterMinChecked(!!data.waterMinChecked)
      }
      if (data.waterMinUnit !== undefined) {
        setWaterMinUnit(Number(data.waterMinUnit))
      }
      if (data.electricMinChecked !== undefined) {
        setElectricMinChecked(!!data.electricMinChecked)
      }
      if (data.electricMinUnit !== undefined) {
        setElectricMinUnit(Number(data.electricMinUnit))
      }
      setExtraExpenses(data.extraExpenses || [])
      if (data.electricBillingMode === "building_total") {
        setElectricBillingMode("building_total")
      } else {
        setElectricBillingMode("fixed_rate")
      }
      if (data.waterBillingMode === "building_total") {
        setWaterBillingMode("building_total")
      } else {
        setWaterBillingMode("fixed_rate")
      }
      if (data.workspaceLogo) {
        setWorkspaceLogo(data.workspaceLogo)
      } else {
        setWorkspaceLogo("")
      }

      const activeBills = data.bills as any[]
      if (activeBills && activeBills.length > 0) {
        // Latest bill is current bill
        const latest = activeBills[0]
        setBill(latest)
        setBillStatus(latest.status)
        setUploadedSlip(latest.slipUrl)
        setBillingCycle(formatCycle(latest.billingCycle))

        // Rest are history
        const hist: BillHistoryItem[] = activeBills.slice(1).map(b => ({
          cycle: formatCycle(b.billingCycle),
          amount: b.amount,
          status: b.status === "paid" ? "paid" : b.status === "pending" ? "pending" : "unpaid"
        }))
        setHistory(hist)
        setNoBillYet(false)
      } else {
        setBill(null)
        setBillStatus("paid") // default to clean state if no bills
        setUploadedSlip(null)
        setBillingCycle(t("tenant_portal.no_cycle_yet"))
        setHistory([])
        // ห้องนี้ยังไม่เคยมีบิลออกมาเลย — ต้องแยกจาก "จ่ายครบแล้ว" ให้ชัด ไม่งั้นผู้เช่าที่เพิ่ง
        // ลงทะเบียนแล้วกดปุ่มใน rich menu จะเจอข้อความ "ยอดชำระของคุณเสร็จเรียบร้อย!"
        // ทั้งที่ยังไม่เคยมีบิลให้จ่าย (ยอดในการ์ดบิลก็จะเป็นค่าตั้งต้นของหอ ไม่ใช่ยอดจริง)
        setNoBillYet(true)
      }
    } else if ((res as any).fallback) {
      setIsDemo(true)
      setRoomNumber("105")
      setTenantName("คุณณัฐพล ใจดี")
      setBillingCycle("มิถุนายน 2026")
      setBaseRent(4500)
      setLatePenaltyRate(100) // Fallback penalty rate for demo

      const loadMyBill = () => {
        const savedBills = getCookie("horset_bills")
        if (savedBills) {
          try {
            const bills = JSON.parse(decodeURIComponent(savedBills))
            const myBill = bills.find((b: any) => b.roomNumber === "105" && b.billingCycle === "2026-06")
            if (myBill) {
              setBill(myBill)
              setBillStatus(myBill.status)
              setUploadedSlip(myBill.slipUrl)
            }
          } catch (e) {
            console.error(e)
          }
        }
      }
      loadMyBill()

      const demoHistory: BillHistoryItem[] = [
        { cycle: "พฤษภาคม 2026", amount: 5120, status: "paid" },
        { cycle: "เมษายน 2026", amount: 4950, status: "paid" },
        { cycle: "มีนาคม 2026", amount: 5310, status: "paid" }
      ]
      setHistory(demoHistory)
    }
  }, [result, t])

  // เลื่อนจอไปยังการ์ดที่ปุ่มใน rich menu ระบุมา แล้วขึ้นขอบเรืองแสงสั้น ๆ ให้เห็นว่าคือกล่องไหน
  //
  // ทำครั้งเดียวต่อการเปิดหน้า (didFocusActionRef) เพราะ poll ทุก 30 วินาทีจะทำให้ billStatus
  // เปลี่ยนค่าได้เรื่อย ๆ — ถ้าไม่กันไว้ ผู้เช่าจะถูกดึงจอกลับมาที่การ์ดเดิมกลางทางที่กำลังอ่านอยู่
  //
  // ไม่เรียก fileInputRef.click() ให้อัตโนมัติ เพราะเบราว์เซอร์บล็อกการเปิดตัวเลือกไฟล์
  // ที่ไม่ได้เกิดจากการกดของผู้ใช้ (หน้านี้มาจากการ redirect จึงไม่มี user gesture ติดมา)
  useEffect(() => {
    if (pageLoading || didFocusActionRef.current) return
    if (typeof window === "undefined") return

    const raw = new URLSearchParams(window.location.search).get("action") || ""
    const target: PortalFocusSection = parsePortalFocusAction(raw)
    if (!target) {
      didFocusActionRef.current = true
      return
    }

    // การ์ด QR/อัปโหลดไม่ถูก render เมื่อบิลจ่ายครบแล้ว และกล่องอัปโหลดหายไปตอนสลิปรอตรวจสอบ
    // — กรณีนั้นถอยไปเลื่อนที่การ์ด QR (ซึ่งมีสถานะ "รอตรวจสอบ" อยู่) แทน
    const node =
      target === "slip" ? uploadSectionRef.current || qrSectionRef.current : qrSectionRef.current
    if (!node) return

    didFocusActionRef.current = true
    node.scrollIntoView({ behavior: "smooth", block: "center" })
    setFocusSection(target)
    const highlightTimer = setTimeout(() => setFocusSection(null), 2600)
    return () => clearTimeout(highlightTimer)
  }, [pageLoading, billStatus])

  // Helper to calculate late days
  const calculateLateDays = (cycleStr: string): number => {
    if (!cycleStr || !cycleStr.includes("-")) return 0
    const [yearStr, monthStr] = cycleStr.split("-")
    const year = parseInt(yearStr, 10)
    const dueMonth = parseInt(monthStr, 10) // e.g. "06" -> 6 (July in 0-indexed Date)

    // Construct due date elements wrapping safely
    const tempDueDate = new Date(Date.UTC(year, dueMonth, 5))
    const dueYearWrapped = tempDueDate.getUTCFullYear()
    const dueMonthWrapped = tempDueDate.getUTCMonth()
    const dueDateWrapped = tempDueDate.getUTCDate()

    // 23:59:59.999 in Bangkok (UTC+7) is 16:59:59.999 UTC
    const dueTimeUTC = Date.UTC(dueYearWrapped, dueMonthWrapped, dueDateWrapped, 16, 59, 59, 999)
    const now = new Date()

    if (now.getTime() <= dueTimeUTC) return 0

    // Calculate local calendar day difference in Bangkok (UTC+7)
    const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
    const nowYear = bangkokNow.getUTCFullYear()
    const nowMonth = bangkokNow.getUTCMonth()
    const nowDate = bangkokNow.getUTCDate()

    const dueMidnightUTC = Date.UTC(dueYearWrapped, dueMonthWrapped, dueDateWrapped)
    const nowMidnightUTC = Date.UTC(nowYear, nowMonth, nowDate)

    const diffTime = nowMidnightUTC - dueMidnightUTC
    if (diffTime <= 0) return 0

    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }

  // ค่าใช้จ่ายต่างๆ (ใช้ค่าของบิลจริง หรือค่าจำลองหากยังไม่มีบิลในระบบ)
  // ถ้าใช้ไม่ถึงขั้นต่ำที่ตั้งไว้ (และห้องนี้ไม่ได้ยกเว้นขั้นต่ำ) ให้คิดค่าไฟ/น้ำตามขั้นต่ำแทนยอดใช้จริง
  // บิลที่มี snapshot = อ่านองค์ประกอบจากตัวบิลตรง ๆ ห้ามคำนวณใหม่จากค่า config ปัจจุบัน
  // เพราะค่าเช่า/อัตรา/ค่าส่วนกลาง/การตั้งค่าขั้นต่ำ เปลี่ยนได้หลังออกบิลไปแล้ว ใบที่ผู้เช่าถืออยู่
  // ต้องแสดงตัวเลขเดิมและบวกกันได้เท่ายอดรวมเสมอ (ดู database_patch_add_bill_snapshot.sql)
  //
  // บิลเก่าที่ยังไม่มี snapshot (hasSnapshot = false) ถอยไปคำนวณแบบเดิมทุกบรรทัด
  const useSnapshot = !!bill?.hasSnapshot

  const elecUnits = bill ? bill.electricUnits : 0
  const finalElecUnits = !waiveElectricMin && electricMinChecked && elecUnits <= electricMinUnit ? electricMinUnit : elecUnits
  const elecAmount = useSnapshot
    ? Number(bill.electricAmount || 0)
    : finalElecUnits * electricRate
  const waterUnits = bill ? bill.waterUnits : 0
  const finalWaterUnits = !waiveWaterMin && waterMinChecked && waterUnits <= waterMinUnit ? waterMinUnit : waterUnits
  const waterAmount = useSnapshot
    ? Number(bill.waterAmount || 0)
    : finalWaterUnits * waterRate

  // ช่วงเลขมิเตอร์ก่อนหน้า-ปัจจุบัน (แสดงเฉพาะเมื่อมีข้อมูลมิเตอร์จริงของรอบบิลนี้)
  const elecPrev = bill && bill.elecPrev !== null && bill.elecPrev !== undefined ? bill.elecPrev : null
  const elecCurr = bill && bill.elecCurr !== null && bill.elecCurr !== undefined ? bill.elecCurr : null
  const waterPrev = bill && bill.waterPrev !== null && bill.waterPrev !== undefined ? bill.waterPrev : null
  const waterCurr = bill && bill.waterCurr !== null && bill.waterCurr !== undefined ? bill.waterCurr : null
  const hasElecMeterRange = elecPrev !== null && elecCurr !== null
  const hasWaterMeterRange = waterPrev !== null && waterCurr !== null

  // รายละเอียดใบแจ้งหนี้จริงทั้งอาคาร (แสดงเฉพาะเปิดโหมด "หารตามสัดส่วน" และมีข้อมูลของรอบบิลนี้จริง)
  const electricBuildingTotalAmount = bill && bill.electricBuildingTotalAmount !== null && bill.electricBuildingTotalAmount !== undefined ? bill.electricBuildingTotalAmount : null
  const electricBuildingTotalUnits = bill && bill.electricBuildingTotalUnits !== null && bill.electricBuildingTotalUnits !== undefined ? bill.electricBuildingTotalUnits : null
  const waterBuildingTotalAmount = bill && bill.waterBuildingTotalAmount !== null && bill.waterBuildingTotalAmount !== undefined ? bill.waterBuildingTotalAmount : null
  const waterBuildingTotalUnits = bill && bill.waterBuildingTotalUnits !== null && bill.waterBuildingTotalUnits !== undefined ? bill.waterBuildingTotalUnits : null
  const hasElectricDisclosure = electricBillingMode === "building_total" && electricBuildingTotalAmount !== null && electricBuildingTotalUnits !== null
  const hasWaterDisclosure = waterBillingMode === "building_total" && waterBuildingTotalAmount !== null && waterBuildingTotalUnits !== null
  const disclosureCycleThai = bill ? formatCycleThai(bill.billingCycle) : ""

  const commonAreaFee = useSnapshot ? Number(bill.commonFee || 0) : commonFee
  const otherServiceAmount = bill ? (bill.otherServiceAmount || 0) : 0
  const vatAmount = bill ? (bill.vatAmount || 0) : 0

  // ค่าเช่าห้องพักหลัก — จากบิล ไม่ใช่จาก config ห้องปัจจุบัน
  const rentPrice = useSnapshot ? Number(bill.baseRent || 0) : baseRent

  // คำนวณจำนวนวันและค่าปรับล่าช้า (ทำบน Backend ทั้งหมดแล้วสำหรับข้อมูลจริง / มี Fallback สำหรับ Demo เท่านั้น)
  const lateDays = bill 
    ? (bill.lateDays !== null && bill.lateDays !== undefined ? Number(bill.lateDays) : (isDemo ? calculateLateDays(bill.billingCycle) : 0))
    : 0

  const penaltyAmount = bill 
    ? (bill.penaltyAmount !== null && bill.penaltyAmount !== undefined ? Number(bill.penaltyAmount) : (isDemo ? (lateDays * latePenaltyRate) : 0))
    : 0

  // ส่วนของห้องเดิมที่ยกมารวมในใบนี้ (ย้ายห้องกลางเดือน) — ว่างในบิลปกติทุกใบ
  // ยอดพวกนี้รวมอยู่ใน bill.amount แล้ว ที่แสดงคือการ "แยกให้เห็น" ไม่ใช่บวกเพิ่ม
  const billUtilitySegments = parseUtilitySegments(bill?.utilitySegments)

  // ค่าใช้จ่ายเสริม — รายการที่คิดเงินไปจริงในใบนี้ ไม่ใช่รายการปัจจุบันของห้อง
  const billExtraExpenses = useSnapshot ? (bill.extraExpenses || []) : extraExpenses
  const extraExpensesSum = billExtraExpenses?.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0
  const totalAmount = bill 
    ? Number(bill.amount) 
    : (rentPrice + elecAmount + waterAmount + commonAreaFee + otherServiceAmount + extraExpensesSum)

  useEffect(() => {
    if (!promptPayId) return

    const qrPayload = generatePromptPayPayload(promptPayId, totalAmount)
    const qrRawUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrPayload)}&size=500x500&ecc=H`

    setIsQrLoading(true)

    const qrImg = new Image()
    qrImg.crossOrigin = "anonymous"
    qrImg.src = qrRawUrl

    qrImg.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = 500
      canvas.height = 500
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        setCombinedQrUrl(qrRawUrl)
        setIsQrLoading(false)
        return
      }

      // Draw base QR code
      ctx.drawImage(qrImg, 0, 0, 500, 500)

      if (workspaceLogo) {
        const logoImg = new Image()
        logoImg.crossOrigin = "anonymous"
        logoImg.src = workspaceLogo

        logoImg.onload = () => {
          try {
            // Draw white rounded background for logo overlay to keep it scan-friendly
            const bgSize = 86
            const logoSize = 64
            const radius = 12
            const x = 250 - bgSize / 2
            const y = 250 - bgSize / 2

            ctx.fillStyle = "#ffffff"
            ctx.beginPath()
            ctx.moveTo(x + radius, y)
            ctx.arcTo(x + bgSize, y, x + bgSize, y + bgSize, radius)
            ctx.arcTo(x + bgSize, y + bgSize, x, y + bgSize, radius)
            ctx.arcTo(x, y + bgSize, x, y, radius)
            ctx.arcTo(x, y, x + bgSize, y, radius)
            ctx.closePath()
            ctx.fill()

            // Draw logo centered
            const lx = 250 - logoSize / 2
            const ly = 250 - logoSize / 2
            ctx.drawImage(logoImg, lx, ly, logoSize, logoSize)

            setCombinedQrUrl(canvas.toDataURL("image/png"))
          } catch (err) {
            console.error("Error drawing logo on QR canvas:", err)
            setCombinedQrUrl(qrRawUrl)
          } finally {
            setIsQrLoading(false)
          }
        }

        logoImg.onerror = (err) => {
          console.error("Error loading logo image for QR:", err)
          try {
            setCombinedQrUrl(canvas.toDataURL("image/png"))
          } catch (e) {
            setCombinedQrUrl(qrRawUrl)
          }
          setIsQrLoading(false)
        }
      } else {
        try {
          setCombinedQrUrl(canvas.toDataURL("image/png"))
        } catch (e) {
          setCombinedQrUrl(qrRawUrl)
        }
        setIsQrLoading(false)
      }
    }

    qrImg.onerror = () => {
      setCombinedQrUrl(qrRawUrl)
      setIsQrLoading(false)
    }
  }, [promptPayId, totalAmount, workspaceLogo])

  const handleShare = async () => {
    try {
      if (!combinedQrUrl) return
      
      const response = await fetch(combinedQrUrl)
      const blob = await response.blob()
      const file = new File([blob], `qr_payment_room${roomNumber}.png`, { type: "image/png" })
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t("tenant_portal.share_title").replace("{room}", roomNumber),
          text: t("tenant_portal.share_text_full").replace("{room}", roomNumber).replace("{amount}", totalAmount.toLocaleString()),
        })
      } else {
        // Fallback text share if files are not shareable but text is
        await navigator.share({
          title: t("tenant_portal.share_title").replace("{room}", roomNumber),
          text: t("tenant_portal.share_text_fallback").replace("{room}", roomNumber).replace("{amount}", totalAmount.toLocaleString()),
          url: window.location.href
        })
      }
    } catch (error) {
      console.error("Error sharing QR code:", error)
    }
  }


  const handleDownloadBillPdf = async () => {
    setDownloadingPdf(true)
    try {
      const { generateBillPdf } = await import("@/lib/pdfHelper")
      
      const blob = await generateBillPdf({
        roomNumber,
        tenantName,
        billingCycle,
        baseRent: rentPrice,
        // ส่งสัญญาณว่าตัวเลขเป็น snapshot ของบิลจริง เพื่อให้ PDF พิมพ์ตามนั้น
        // ไม่ต้องคำนวณค่าเช่าย้อนจากยอดรวม (ดู adjustedBaseRent ใน pdfHelper)
        hasSnapshot: useSnapshot,
        electricAmount: elecAmount,
        waterAmount: waterAmount,
        electricUnits: elecUnits,
        electricRate: useSnapshot ? Number(bill.electricRate || 0) : electricRate,
        waterUnits: waterUnits,
        waterRate: useSnapshot ? Number(bill.waterRate || 0) : waterRate,
        commonFee: commonAreaFee,
        // การคิดขั้นต่ำ: ใบที่มี snapshot ใช้ผลลัพธ์ที่บันทึกไว้ ไม่คิดใหม่จากการตั้งค่าปัจจุบัน
        elecMinApplied: useSnapshot ? (bill.elecMinApplied ?? undefined) : undefined,
        waterMinApplied: useSnapshot ? (bill.waterMinApplied ?? undefined) : undefined,
        // รายการของห้องเดิมที่ยกมารวม (ย้ายห้องกลางเดือน) — ว่างในบิลปกติทุกใบ
        utilitySegments: bill.utilitySegments ?? [],
        electricMinUnit: useSnapshot ? (bill.electricMinUnitSnapshot ?? electricMinUnit) : electricMinUnit,
        waterMinUnit: useSnapshot ? (bill.waterMinUnitSnapshot ?? waterMinUnit) : waterMinUnit,
        amount: totalAmount,
        promptPayId,
        promptPayName,
        workspaceName,
        workspaceAddress,
        workspacePhone,
        workspaceTaxId,
        penaltyAmount,
        lateDays,
        latePenaltyRate,
        otherServiceAmount,
        vatAmount,
        waiveElectricMin,
        waiveWaterMin,
        invoiceId: bill ? (bill.invoiceId || bill.invoice_id) : `INV-${(bill?.billingCycle || '2026-06').replace('-', '')}-${roomNumber}`,
        extraExpenses: billExtraExpenses,
        elecPrev,
        elecCurr,
        waterPrev,
        waterCurr,
        billingCycleRaw: bill ? bill.billingCycle : "",
        electricBuildingTotalAmount,
        electricBuildingTotalUnits,
        waterBuildingTotalAmount,
        waterBuildingTotalUnits
      })

      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `bill_room${roomNumber}_${bill ? bill.billingCycle : "invoice"}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      console.error(e)
      alert(t("tenant_portal.err_pdf_generate_invoice"))
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      // 1. Client-Side Image Optimization (Resize & Compress)
      const optimizedBlob = await optimizeImage(file)
      
      // Safety Check: Ensure size is under 1MB
      if (optimizedBlob.size > 1024 * 1024) {
        alert(t("tenant_portal.err_image_too_large"))
        setUploading(false)
        return
      }

      if (isDemo) {
        // In demo mode, convert optimized blob to local URL for live preview
        const localUrl = URL.createObjectURL(optimizedBlob)
        setUploadedSlip(localUrl)
        setBillStatus("pending")

        const savedBills = getCookie("horset_bills")
        if (savedBills) {
          try {
            const bills = JSON.parse(decodeURIComponent(savedBills))
            const updatedBills = bills.map((b: any) => {
              if (b.roomNumber === "105" && b.billingCycle === "2026-06") {
                return { ...b, status: "pending", slipUrl: localUrl, amount: totalAmount }
              }
              return b
            })
            setCookie("horset_bills", encodeURIComponent(JSON.stringify(updatedBills)))
          } catch (err) {
            console.error(err)
          }
        }
        setUploading(false)
        alert(t("tenant_portal.upload_success_demo"))
      } else {
        if (!bill) {
          setUploading(false)
          alert(t("tenant_portal.err_no_bill_this_month"))
          return
        }

        const supabase = createClient()
        const fileExt = "jpeg"
        const fileName = `slips/bill_${bill.id}_${Date.now()}.${fileExt}`

        // 2. Upload optimized blob to Supabase Storage
        const { data, error: uploadError } = await supabase.storage
          .from("payment-slips")
          .upload(fileName, optimizedBlob, {
            contentType: "image/jpeg",
            cacheControl: "3600",
            upsert: true,
          })

        if (uploadError) {
          throw uploadError
        }

        // 3. Get Public URL of the uploaded image
        const { data: { publicUrl } } = supabase.storage
          .from("payment-slips")
          .getPublicUrl(fileName)

        // 4. Update Database Bill Status
        // ส่งตัวระบุห้อง "ตามที่อยู่ในลิงก์จริง" ไปให้ฝั่ง server ตรวจ token — ลิงก์ใหม่ใช้ room_id
        // ลิงก์เก่าที่ยังค้างใน LINE ใช้ room_number และ token ถูกเซ็นด้วยเลขห้องนั้น
        // ถ้าส่งผิดชนิด token จะตรวจไม่ผ่านและผู้เช่าจะอัปโหลดสลิปไม่ได้
        let portalAuth: { workspaceId: string; room: { roomId: string } | { roomNumber: string }; token: string } | undefined
        if (typeof window !== "undefined") {
          const searchParams = new URLSearchParams(window.location.search)
          const wsId = searchParams.get("workspace_id") || ""
          const rId = searchParams.get("room_id") || ""
          const rNum = searchParams.get("room_number") || ""
          const token = searchParams.get("token") || ""
          if (wsId && token && (rId || rNum)) {
            portalAuth = { workspaceId: wsId, room: rId ? { roomId: rId } : { roomNumber: rNum }, token }
          }
        }
        const res = await updateBillStatus(bill.id, "pending", publicUrl, totalAmount, portalAuth)
        setUploading(false)

        if (res.success) {
          setUploadedSlip(publicUrl)
          setBillStatus("pending")
          alert(t("tenant_portal.upload_success"))
          reload()
        } else {
          alert(res.error || t("tenant_portal.err_save_slip_db"))
        }
      }
    } catch (err: any) {
      console.error("Error optimizing/uploading image:", err)
      alert(err?.message || t("tenant_portal.err_upload_image_generic"))
      setUploading(false)
    }
  }


  if (pageLoading) {
    return <PortalLoadingScreen />
  }

  return (
    <PullToRefresh onRefresh={async () => { await reload() }}>
      <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 font-sans pb-12 w-full flex-1 flex flex-col">
        {/* Header สไตล์ Mobile Portal */}
        <header className="glass-panel border-b border-slate-200/60 dark:border-slate-900/60 px-6 py-4 sticky top-0 z-20 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <Building className="w-5 h-5 text-blue-500" />
          <div>
            <h1 className="text-sm font-bold">{t("tenant_portal.room_prefix_label").replace("{room}", roomNumber)}</h1>
            <p className="text-[9px] text-slate-500 dark:text-slate-400"><DynamicText>{tenantName}</DynamicText> • {t("tenant_portal.role_tenant")}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <LanguageToggle />
          <ThemeToggle />
          {!isLoginFree && (
            <button
              onClick={() => {
                document.cookie = "horset_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
                router.push("/login")
              }}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900/50"
              title={t("common.logout")}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* กล่องเนื้อหาแบบโมบาย (Mobile Layout Wrapper) */}
      <main className="max-w-md mx-auto px-4 pt-6 space-y-6">

        {noBillYet ? (
          /* ยังไม่เคยมีบิลของห้องนี้ — แสดงการ์ดนี้แทนทั้งหน้า เพราะการ์ดบิล/QR/ประวัติ
             จะโชว์แต่ค่าตั้งต้นของหอกับกล่องเปล่า ซึ่งทำให้ผู้เช่าเข้าใจผิดว่ามีบิลอยู่ */
          <div className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Calendar className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t("tenant_portal.no_bill_title")}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                {t("tenant_portal.no_bill_desc")}
              </p>
            </div>
          </div>
        ) : (
          <>
        {/* บิลหลักประจำเดือน */}
        <div className="glass-panel rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-6 space-y-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/5 rounded-full blur-xl pointer-events-none" />

          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">{t("tenant_portal.invoice_cycle_label")}</span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200 mt-0.5">{billingCycle}</h2>
              {bill && (bill.invoiceId || bill.invoice_id) && (
                <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-1 flex items-center gap-1">
                  <span>{t("tenant_portal.invoice_id_label")}</span>
                  <span className="font-mono bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px] text-blue-700 dark:text-blue-300">
                    {bill.invoiceId || bill.invoice_id}
                  </span>
                </div>
              )}
            </div>
            
            <span className={`inline-block text-[10px] font-bold px-3 py-1 rounded-full ${
              billStatus === "paid" ? "bg-teal-500/10 text-teal-400" :
              billStatus === "pending" ? "bg-amber-500/10 text-amber-400 animate-pulse" :
              "bg-red-500/10 text-red-400"
            }`}>
              {billStatus === "paid" ? t("tenant_portal.status_paid_full") : billStatus === "pending" ? t("tenant_portal.status_pending_slip") : t("dashboard.status_overdue")}
            </span>
          </div>

          {/* รายละเอียดค่าใช้จ่าย */}
          <div className="space-y-3 pt-2 text-xs">
            {/* 1. ค่าเช่าห้องพัก */}
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-200 dark:border-slate-900">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <Building className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>{t("tenant_portal.item_rent")}</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-slate-200">{rentPrice.toLocaleString()} {t("daily_bills.baht_unit")}</span>
            </div>

            {/* 2. ค่าไฟฟ้า */}
            <div className="flex justify-between items-start pb-2.5 border-b border-slate-200 dark:border-slate-900">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>{t("tenant_portal.item_electric")}</span>
                </div>
                <p className="text-[10px] text-slate-500 pl-5">
                  {hasElecMeterRange
                    ? t("tenant_portal.electric_meter_reading").replace("{prev}", String(elecPrev)).replace("{curr}", String(elecCurr)).replace("{units}", String(elecUnits))
                    : t("tenant_portal.electric_units_used").replace("{units}", String(elecUnits))}
                </p>
              </div>
              <span className="font-semibold text-slate-900 dark:text-slate-200">{elecAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
            </div>

            {/* 3. ค่าน้ำประปา */}
            <div className="flex justify-between items-start pb-2.5 border-b border-slate-200 dark:border-slate-900">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <Droplet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>{t("tenant_portal.item_water")}</span>
                </div>
                <p className="text-[10px] text-slate-500 pl-5">
                  {hasWaterMeterRange
                    ? t("tenant_portal.water_meter_reading").replace("{prev}", String(waterPrev)).replace("{curr}", String(waterCurr)).replace("{units}", String(waterUnits))
                    : t("tenant_portal.water_units_used").replace("{units}", String(waterUnits))}
                </p>
              </div>
              <span className="font-semibold text-slate-900 dark:text-slate-200">{waterAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
            </div>

            {/* 4. ค่าส่วนกลาง */}
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-200 dark:border-slate-900">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{t("tenant_portal.item_common_fee")}</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-slate-200">{commonAreaFee.toLocaleString()} {t("daily_bills.baht_unit")}</span>
            </div>

            {/* ส่วนของห้องเดิม เมื่อย้ายห้องกลางเดือน (ว่างในบิลปกติทุกใบ)
                แยกเป็นกล่องของตัวเองพร้อมกำกับเลขห้อง เพื่อให้ผู้เช่าเห็นชัดว่าส่วนไหนคือห้องเดิม
                ส่วนไหนคือห้องที่อยู่ตอนนี้ — ตัวเลขเดียวกับที่พิมพ์ลง PDF (มาจาก bills.utility_segments) */}
            {billUtilitySegments.length > 0 && (
              <div className="pb-2.5 border-b border-slate-200 dark:border-slate-900 space-y-2">
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  {t("tenant_portal.segment_header")}
                </p>
                {billUtilitySegments.map((seg, index) => (
                  <div key={seg.transferId || index} className="pl-2 border-l-2 border-amber-300 dark:border-amber-700/60 space-y-1">
                    <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                      {t("tenant_portal.segment_room").replace("{room}", formatSegmentRoomLabel(seg).replace("ห้อง ", ""))}
                    </p>
                    {(seg.elecAmount > 0 || seg.elecUnits > 0) && (
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>{t("tenant_portal.segment_electric")}{seg.elecMinApplied ? ` (${t("tenant_portal.segment_min_applied")})` : ""}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 pl-5">
                            {t("tenant_portal.electric_meter_reading")
                              .replace("{prev}", String(seg.elecPrev))
                              .replace("{curr}", String(seg.elecCurr))
                              .replace("{units}", String(seg.elecUnits))}
                            {seg.elecCurr < seg.elecPrev ? ` (${t("tenant_portal.segment_meter_rollover")})` : ""}
                          </p>
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-slate-200">{seg.elecAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
                      </div>
                    )}
                    {(seg.waterAmount > 0 || seg.waterUnits > 0) && (
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Droplet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            <span>{t("tenant_portal.segment_water")}{seg.waterMinApplied ? ` (${t("tenant_portal.segment_min_applied")})` : ""}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 pl-5">
                            {t("tenant_portal.water_meter_reading")
                              .replace("{prev}", String(seg.waterPrev))
                              .replace("{curr}", String(seg.waterCurr))
                              .replace("{units}", String(seg.waterUnits))}
                            {seg.waterCurr < seg.waterPrev ? ` (${t("tenant_portal.segment_meter_rollover")})` : ""}
                          </p>
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-slate-200">{seg.waterAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
                      </div>
                    )}
                    {seg.rentIncluded && seg.rentAmount > 0 && (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Building className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>{t("tenant_portal.segment_rent").replace("{date}", seg.toDate)}</span>
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-slate-200">{seg.rentAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ค่าใช้จ่ายเสริมรายเดือน (ถ้ามี) */}
            {billExtraExpenses && billExtraExpenses.length > 0 && billExtraExpenses.map((exp: any, index: number) => (
              <div key={index} className="flex justify-between items-center pb-2.5 border-b border-slate-200 dark:border-slate-900">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>➕ <DynamicText>{exp.name}</DynamicText></span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-slate-200">{Number(exp.amount || 0).toLocaleString()} {t("daily_bills.baht_unit")}</span>
              </div>
            ))}

            {/* ค่าบริการอื่น ๆ (ถ้ามี) */}
            {otherServiceAmount > 0 && (
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-200 dark:border-slate-900">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  <span>{t("tenant_portal.item_other_services")}</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-slate-200">{otherServiceAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
              </div>
            )}

            {/* ภาษีมูลค่าเพิ่ม (VAT) — แสดงเฉพาะเมื่อบิลนี้มีการคิดจริง */}
            {vatAmount > 0 && (
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-200 dark:border-slate-900">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>ภาษีมูลค่าเพิ่ม (VAT)</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-slate-200">{vatAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
              </div>
            )}

            {/* 5. ค่าปรับ */}
            <div className="flex justify-between items-start pb-2.5 border-b border-slate-200 dark:border-slate-900">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>{t("tenant_portal.item_penalty")}</span>
                </div>
                {lateDays > 0 && (
                  <p className="text-[10px] text-rose-600 dark:text-rose-400 pl-5">{t("tenant_portal.late_days_note").replace("{days}", String(lateDays)).replace("{rate}", String(latePenaltyRate))}</p>
                )}
                {lateDays === 0 && penaltyAmount > 0 && (
                  <p className="text-[10px] text-rose-600 dark:text-rose-400 pl-5">{t("tenant_portal.accumulated_penalty_note")}</p>
                )}
              </div>
              <span className="font-semibold text-slate-900 dark:text-slate-200">{penaltyAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
            </div>

            {/* ยอดเงินรวมสุทธิ */}
            <div className="flex justify-between items-center pt-2">
              <span className="font-bold text-slate-600 dark:text-slate-300">{t("tenant_portal.net_total_label")}</span>
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{totalAmount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
            </div>

            {/* รายละเอียดใบแจ้งหนี้จริงจากหน่วยงาน (แสดงเฉพาะเปิดโหมด "หารตามสัดส่วนทั้งอาคาร" และมีข้อมูลของรอบบิลนี้) */}
            {(hasElectricDisclosure || hasWaterDisclosure) && (
              <div className="mt-2 p-3.5 bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 text-[11px] leading-relaxed">
                <p className="font-bold text-slate-600 dark:text-slate-300">
                  รายละเอียด ใบแจ้งหนี้ของการไฟฟ้า/การประปา ประจำรอบเดือน {disclosureCycleThai}
                </p>

                {hasElectricDisclosure && (
                  <div className="space-y-0.5">
                    <p className="text-slate-500 dark:text-slate-400">การไฟฟ้านครหลวง/การไฟฟ้าส่วนภูมิภาค</p>
                    <p className="text-slate-500 dark:text-slate-400">จำนวนหน่วยที่ใช้ {Number(electricBuildingTotalUnits).toLocaleString()} หน่วย</p>
                    <p className="text-slate-500 dark:text-slate-400">ยอดที่ต้องชำระ {Number(electricBuildingTotalAmount).toLocaleString()} บาท</p>
                  </div>
                )}

                {hasWaterDisclosure && (
                  <div className="space-y-0.5">
                    <p className="text-slate-500 dark:text-slate-400">การประปานครหลวง/การประปาส่วนภูมิภาค</p>
                    <p className="text-slate-500 dark:text-slate-400">จำนวนน้ำใช้ {Number(waterBuildingTotalUnits).toLocaleString()} หน่วย</p>
                    <p className="text-slate-500 dark:text-slate-400">ยอดที่ต้องชำระ {Number(waterBuildingTotalAmount).toLocaleString()} บาท</p>
                  </div>
                )}

                <p className="text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800">
                  หมายเหตุ: อัตราค่าไฟฟ้าและค่าน้ำประปาคำนวณจาก (เลขมิเตอร์ปัจจุบัน - เลขมิเตอร์ครั้งก่อน) × อัตราเฉลี่ยจริงตามใบแจ้งหนี้ของการไฟฟ้า/การประปา
                  ประจำรอบเดือน {disclosureCycleThai} โดยไม่มีการบวกกำไรเพิ่มใดๆ ทั้งสิ้น
                </p>
              </div>
            )}

            {/* ปุ่มดาวน์โหลดบิล PDF */}
            <button
              onClick={handleDownloadBillPdf}
              disabled={downloadingPdf}
              className="w-full mt-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 disabled:border-slate-100 dark:disabled:border-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-slate-600 dark:text-slate-300 font-semibold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors"
            >
              {downloadingPdf ? (
                <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-500 border-t-slate-600 dark:border-t-slate-300 rounded-full animate-spin" />
              ) : (
                <>
                  <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{t("tenant_portal.download_invoice_pdf_btn")}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* หน้าจอโอนเงินสแกน QR พร้อมเพย์ (แสดงเฉพาะเมื่อยังไม่จ่าย หรือรอยืนยัน) */}
        {billStatus !== "paid" && (
          <div
            ref={qrSectionRef}
            className={`glass-card rounded-2xl border p-6 space-y-5 transition-shadow duration-500 ${
              focusSection === "qr"
                ? "border-blue-500/60 ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/10"
                : "border-slate-200/60 dark:border-slate-900/60"
            }`}
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-600 dark:text-blue-400" /> {t("tenant_portal.scan_promptpay_title")}
            </h3>

            {/* ดีไซน์การ์ด พร้อมเพย์สไตล์หรูหรา */}
            <div className="bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-6 rounded-xl flex flex-col items-center gap-4 relative overflow-hidden">
              <div className="absolute top-2 left-2 flex items-center gap-1 text-[9px] text-slate-500 font-bold">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                PromptPay EMVCo
              </div>
              
              {/* รูป QR code ที่สามารถสแกนได้จริง */}
              <div className="w-44 h-44 bg-white p-2 rounded-lg flex flex-col justify-center items-center relative shadow-lg">
                {isQrLoading ? (
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">{t("tenant_portal.qr_loading")}</span>
                  </div>
                ) : (
                  <img
                    src={combinedQrUrl || `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(generatePromptPayPayload(promptPayId, totalAmount))}&size=200x200&ecc=H`}
                    alt="PromptPay QR Code"
                    className="w-40 h-40 object-contain"
                  />
                )}
              </div>

              <div className="text-center space-y-1">
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {t("tenant_portal.promptpay_account_label")} <span className="font-bold text-slate-900 dark:text-slate-200">
                    {promptPayId.length === 10
                      ? promptPayId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
                      : promptPayId.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, "$1-$2-$3-$4-$5")}
                  </span>
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200">{t("tenant_portal.amount_to_pay_label").replace("{amount}", totalAmount.toLocaleString())}</p>
                <p className="text-[9px] text-slate-500 font-medium">{t("tenant_portal.auto_amount_note")}</p>
              </div>

              {/* Action Buttons for QR Code */}
              {canShare && (
                <div className="w-full max-w-[280px] pt-1">
                  <button
                    onClick={handleShare}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-all shadow-md active:scale-[0.98]"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{t("tenant_portal.share_save_btn")}</span>
                  </button>
                </div>
              )}
            </div>

            {/* ฟอร์มอัปโหลดส่งสลิป */}
            {billStatus === "unpaid" ? (
              <div ref={uploadSectionRef} className="space-y-3.5 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>{t("tenant_portal.upload_slip_title")}</span>
                  </h4>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                </div>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={`w-full py-8 bg-gradient-to-b from-blue-50 to-slate-100 dark:from-blue-950/20 dark:to-slate-950/40 border border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all shadow-lg hover:shadow-blue-500/5 group cursor-pointer ${
                    focusSection === "slip"
                      ? "border-blue-500 ring-2 ring-blue-500/40 shadow-blue-500/15"
                      : "border-blue-500/35 hover:border-blue-400"
                  }`}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{t("tenant_portal.processing_upload")}</span>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 bg-blue-500/10 rounded-full group-hover:scale-110 group-hover:bg-blue-500/20 transition-all duration-300">
                        <ImageIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="space-y-1 text-center">
                        <p className="font-semibold text-[13px] text-slate-900 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {t("tenant_portal.tap_to_select_slip")}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {t("tenant_portal.upload_hint")}
                        </p>
                      </div>
                      <span className="text-[9px] text-slate-500 font-medium bg-slate-100/60 dark:bg-slate-950/60 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-900">
                        {t("tenant_portal.supported_formats")}
                      </span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3 text-xs text-amber-600 dark:text-amber-400">
                <Clock className="w-5 h-5 shrink-0 animate-spin" />
                <div className="space-y-0.5">
                  <p className="font-bold">{t("tenant_portal.slip_under_review_title")}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("tenant_portal.slip_under_review_desc")}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* กรณีจ่ายบิลสำเร็จแล้ว */}
        {billStatus === "paid" && (
          <div className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-teal-600 dark:text-teal-400 mx-auto animate-bounce" />
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t("tenant_portal.payment_complete_title")}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                {t("tenant_portal.payment_complete_thanks")}<br />
                {t("tenant_portal.payment_complete_received_prefix")} <DynamicText>{workspaceName || "แสนสุขแมนชั่น"}</DynamicText> {t("tenant_portal.payment_complete_received_suffix")}
              </p>
            </div>
          </div>
        )}

        {/* ประวัติการรับบิลย้อนหลัง — โชว์ย่อ 3 รอบล่าสุด รายละเอียดเต็มอยู่ที่ /portal/history */}
        <div className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> {t("tenant_portal.history_title")}
            </h3>
            {history.length > 0 && (
              <Link
                href={historyHref}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
              >
                {t("tenant_portal.history_view_all")} →
              </Link>
            )}
          </div>

          <div className="space-y-3 text-xs">
            {history.slice(0, 3).map((h, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-slate-100/40 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-900/80 rounded-xl">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span className="font-medium text-slate-600 dark:text-slate-300">{h.cycle}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-600 dark:text-slate-300">{h.amount.toLocaleString()} {t("daily_bills.baht_unit")}</span>
                  <span className={`inline-block text-[8px] font-bold px-2 py-0.5 rounded-full ${
                    h.status === "paid" ? "bg-teal-500/10 text-teal-400" :
                    h.status === "pending" ? "bg-amber-500/10 text-amber-400 animate-pulse" :
                    "bg-red-500/10 text-red-400"
                  }`}>
                    {h.status === "paid" ? t("tenant_portal.status_paid_history") : h.status === "pending" ? t("tenant_portal.status_pending_history") : t("dashboard.status_overdue")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
          </>
        )}

      </main>
      </div>
    </PullToRefresh>
  )
}


/** useSearchParams ต้องอยู่ใต้ Suspense ไม่งั้น Next บังคับให้ทั้งหน้าเป็น dynamic */
export default function TenantPortal() {
  return (
    <Suspense fallback={<PortalLoadingScreen />}>
      <TenantPortalContent />
    </Suspense>
  )
}
