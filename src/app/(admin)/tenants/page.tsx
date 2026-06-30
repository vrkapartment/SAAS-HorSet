"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  Search,
  UserCheck,
  UserMinus,
  Calendar,
  Phone,
  MessageSquare,
  Clock,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Database,
  Eye,
  EyeOff,
  UserX,
  FileText,
  Lock,
  Download,
  Upload,
  X,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  ArrowUpDown,
  AlertCircle,
  Info
} from "lucide-react"
import { getTenants, getOldTenants, deleteOldTenant, createTenantsBatch } from "@/features/tenant/actions"
import { getFinanceSettings } from "@/features/finance/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { DEFAULT_STAFF_PERMISSIONS } from "@/features/permissions/types"
import { getRooms } from "@/features/room/actions"

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

interface TenantItem {
  id: string
  roomNumber: string
  fullName: string
  phone: string
  lineUserId: string | null
  contractStart: string
  contractEnd: string
  status?: string
}

interface OldTenantItem {
  id: string
  tenantId: string | null
  roomNumber: string
  fullName: string
  phone: string
  lineUserId: string | null
  contractStart: string
  contractEnd: string
  movedOutAt: string
}

export default function TenantsPage() {
  const router = useRouter()
  
  // Tabs and State
  const [activeTab, setActiveTab] = useState<"current" | "old">("current")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tableNotFound, setTableNotFound] = useState(false)
  const [isRefreshing, setIsSubmitting] = useState(false)
  const [financeSettings, setFinanceSettings] = useState<any>(null)

  // Data lists
  const [currentTenants, setCurrentTenants] = useState<TenantItem[]>([])
  const [oldTenants, setOldTenants] = useState<OldTenantItem[]>([])

  // UI features
  const [searchQuery, setSearchQuery] = useState("")
  const [showSensitiveData, setShowSensitiveData] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  // CSV Import States
  const [uploadingCsv, setUploadingCsv] = useState(false)
  const [csvErrors, setCsvErrors] = useState<string[] | null>(null)
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false)

  // Stats Counters
  const [stats, setStats] = useState({
    activeCount: 0,
    expiredCount: 0,
    oldTotalCount: 0
  })

  const [hasEditPermission, setHasEditPermission] = useState(true)

  // Custom Toast State
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: "success" | "error" | "info"
  }>({ show: false, message: "", type: "success" })

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ show: true, message, type })
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }))
    }, 4000)
  }

  // ฟังก์ชันดาวน์โหลดเทมเพลต CSV ผู้เช่า ดึงเลขห้องพักที่มีจริงใน Workspace
  const handleDownloadTemplate = async () => {
    try {
      showToast("⏳ กำลังจัดเตรียมข้อมูลเทมเพลต...", "info")
      const roomsRes = await getRooms()
      let sortedRooms: any[] = []
      
      if (roomsRes.success && roomsRes.data) {
        sortedRooms = (roomsRes.data as any[]).sort((a, b) =>
          a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true, sensitivity: 'base' })
        )
      }

      const headers = "room_number,tenant_name,phone,lease_start"
      const duration = financeSettings?.lease_duration ?? 6
      
      const todayDate = new Date()
      const day = String(todayDate.getDate()).padStart(2, '0')
      const month = String(todayDate.getMonth() + 1).padStart(2, '0')
      const year = todayDate.getFullYear()
      const todayStr = `${day}/${month}/${year}`

      const rows: string[] = []
      if (sortedRooms.length > 0) {
        sortedRooms.forEach(r => {
          rows.push(`${r.roomNumber},,,${todayStr}`)
        })
      } else {
        rows.push(`101,สมชาย ใจดี,'0812345678,${todayStr}`)
        rows.push(`102,สมหญิง รักดี,'0898765432,${todayStr}`)
      }

      const csvContent = "\ufeff" + [headers, ...rows].join("\n")
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.setAttribute("href", url)
      link.setAttribute("download", "tenants_template.csv")
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      showToast("✓ ดาวน์โหลดเทมเพลตสำเร็จ พร้อมดึงข้อมูลห้องแล้ว", "success")

      setTimeout(() => {
        alert(
          "⚠️ คำแนะนำสำคัญในการกรอกไฟล์เทมเพลตผู้เช่า:\n\n" +
          "• ระบบดึงเลขห้องทั้งหมดที่คุณมีในตึกมาใส่ในคอลัมน์ [room_number] ให้แล้วโดยอัตโนมัติ\n" +
          "• คุณเพียงแค่กรอก [tenant_name] (ชื่อผู้เช่า) และ [phone] (เบอร์โทร) ลงไปตามเลขห้องได้ทันที\n" +
          "• เบอร์โทรศัพท์สามารถกรอกนำหน้าด้วยเลข 0 ได้ตามปกติ หากคุณบันทึกผ่าน Excel แล้วเลข 0 หายไป ระบบหลังบ้านอัจฉริยะของเราจะช่วยเติมเลข 0 นำหน้ากลับมาให้อัตโนมัติครับ\n" +
          "• คอลัมน์ [lease_start] (วันเริ่มสัญญาเช่า) ถูกตั้งค่าเริ่มต้นเป็นวันปัจจุบันให้เรียบร้อยแล้ว หากสัญญาเช่าของห้องนั้นแตกต่างออกไป สามารถแก้ไขวันที่ได้เองในรูปแบบ DD/MM/YYYY (เช่น 01/07/2026)\n" +
          "• คุณไม่จำเป็นต้องกรอกวันหมดสัญญา (lease_end) อีกต่อไปแล้ว! ระบบหลังบ้านจะคำนวณวันหมดสัญญาให้อัตโนมัติโดยอิงจาก \"ระยะเวลาสัญญาเช่าเริ่มต้น\" (" + duration + " เดือน) ที่คุณตั้งค่าไว้ในระบบครับ"
        )
      }, 500)
    } catch (err) {
      showToast("เกิดข้อผิดพลาดในการสร้างไฟล์เทมเพลต", "error")
    }
  }

  // ฟังก์ชันอัปโหลดไฟล์ CSV และบันทึกข้อมูลผู้เช่า
  const handleUploadCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith(".csv")) {
      showToast("กรุณาเลือกไฟล์ที่มีนามสกุล .csv เท่านั้น", "error")
      e.target.value = ""
      return
    }

    setUploadingCsv(true)
    setCsvErrors(null)
    const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"

    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const text = event.target?.result as string
        if (!text) {
          showToast("ไม่สามารถเปิดอ่านข้อมูลในไฟล์ CSV นี้ได้", "error")
          setUploadingCsv(false)
          return
        }

        const lines = text.split(/\r?\n/)
        const rows: string[][] = []
        for (const line of lines) {
          if (!line.trim()) continue
          const row = line.split(",").map(val => val.trim().replace(/^["']|["']$/g, ""))
          rows.push(row)
        }

        if (rows.length < 2) {
          showToast("โครงสร้างไฟล์ CSV ไม่ถูกต้อง หรือไม่มีข้อมูลในไฟล์", "error")
          setUploadingCsv(false)
          return
        }

        const headers = rows[0].map(h => h.toLowerCase().trim())
        const roomNumIdx = headers.indexOf("room_number")
        const nameIdx = headers.indexOf("tenant_name")
        const phoneIdx = headers.indexOf("phone")
        const startIdx = headers.indexOf("lease_start")

        if (roomNumIdx === -1 || nameIdx === -1) {
          showToast("หัวคอลัมน์ไม่ถูกต้อง ในไฟล์ CSV ต้องมีคอลัมน์ room_number และ tenant_name", "error")
          setUploadingCsv(false)
          return
        }

        const parsedTenants: any[] = []

        // ฟังก์ชันช่วยทำความสะอาดเบอร์โทรและกู้คืนเลข 0 นำหน้าที่โดน Excel ตัดออก
        const cleanAndRestorePhone = (rawPhone: string) => {
          if (!rawPhone) return ""
          let clean = rawPhone.trim().replace(/^="?|"?$|^'|^"/g, "")
          clean = clean.replace(/\D/g, "")
          if (clean.length === 9 && clean[0] !== '0') {
            clean = '0' + clean
          }
          return clean
        }

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (row.length === 0 || (row.length === 1 && !row[0])) continue

          const roomNumber = row[roomNumIdx]?.trim() || ""
          const tenantName = row[nameIdx]?.trim() || ""
          const rawPhone = phoneIdx !== -1 ? row[phoneIdx]?.trim() || "" : ""
          const leaseStart = startIdx !== -1 ? row[startIdx]?.trim() || "" : ""

          const phone = cleanAndRestorePhone(rawPhone)

          // ข้ามบรรทัดที่ไม่มีข้อมูลอะไรเลย
          if (!roomNumber && !tenantName && !phone) continue

          // ถ้ามีเลขห้องแต่ไม่มีผู้เช่า ข้ามได้ (ถือว่าไม่ได้เลือกกรอก)
          if (roomNumber && !tenantName) continue

          parsedTenants.push({
            room_number: roomNumber,
            tenant_name: tenantName,
            phone,
            lease_start: leaseStart,
            line_number: i + 1
          })
        }

        if (parsedTenants.length === 0) {
          showToast("ไม่พบข้อมูลผู้เช่าที่ระบุชื่อผู้เช่าถูกต้องในไฟล์ CSV", "error")
          setUploadingCsv(false)
          return
        }

        // ส่งไปบันทึกที่ Server Action
        const res = await createTenantsBatch(parsedTenants, wsId)
        if (res.success) {
          showToast(`✓ นำเข้าข้อมูลผู้เช่าสำเร็จเรียบร้อย ${res.count} ห้องพัก!`, "success")
          await loadData(true)
        } else if (res.errors && res.errors.length > 0) {
          setCsvErrors(res.errors)
          setIsErrorModalOpen(true)
          showToast("⚠️ ไม่สามารถนำเข้าข้อมูลได้เนื่องจากมีข้อผิดพลาดบางจุด", "error")
        } else {
          showToast(res.error || "เกิดข้อผิดพลาดในการนำเข้าข้อมูลผู้เช่า", "error")
        }
        setUploadingCsv(false)
      }
      reader.readAsText(file, "UTF-8")
    } catch (err: any) {
      showToast("เกิดข้อผิดพลาดในการอัปโหลดไฟล์", "error")
      setUploadingCsv(false)
    } finally {
      e.target.value = ""
    }
  }

  // คำนวณสถานะสัญญาเช่าผู้เช่า (สัญญาปกติ / เหลืออายุสัญญา X เดือน / สัญญาหมดอายุ / อยู่ครบสัญญา)
  const getContractStatus = (leaseStart: string | null | undefined, leaseEnd: string | null | undefined) => {
    if (!leaseStart || !leaseEnd) return null

    const now = new Date()
    // ล้างเวลาเพื่อความแม่นยำในการเปรียบเทียบวันที่
    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    const endDate = new Date(leaseEnd)
    const endDateTime = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())

    // ตรวจสอบว่าหมดอายุหรือยัง
    if (currentDate > endDateTime) {
      const action = financeSettings?.lease_expiry_action || "renew"
      if (action === "renew") {
        return {
          label: "เกินกำหนดระยะสัญญาเดิม",
          style: "bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 font-bold",
          dotColor: "bg-red-500"
        }
      } else {
        return {
          label: "อยู่ครบตามอายุสัญญา",
          style: "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400 font-bold",
          dotColor: "bg-emerald-500"
        }
      }
    }

    // คำนวณความแตกต่างของจำนวนเดือน
    const diffYears = endDate.getFullYear() - now.getFullYear()
    const diffMonths = endDate.getMonth() - now.getMonth()
    const totalMonths = diffYears * 12 + diffMonths

    // คำนวณความแตกต่างของจำนวนวันจริงที่เหลือ
    const diffTime = endDateTime.getTime() - currentDate.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    const action = financeSettings?.lease_expiry_action || "renew"

    if (action === "renew") {
      // ช่วง 2 เดือนสุดท้าย (60 วัน หรือ totalMonths <= 2)
      if (totalMonths <= 2 && totalMonths >= 0) {
        let label = ""
        if (diffDays <= 30) {
          label = "เหลืออายุสัญญาอีก 1 เดือน"
        } else if (diffDays <= 60) {
          label = "เหลืออายุสัญญาอีก 2 เดือน"
        } else {
          label = `เหลืออายุสัญญาอีก ${totalMonths} เดือน`
        }
        return {
          label: label,
          style: "bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 font-bold",
          dotColor: "bg-amber-500 animate-pulse"
        }
      }
    }

    // สัญญาเช่ายังปกติอยู่
    return {
      label: "สัญญาปกติ",
      style: "bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 font-bold",
      dotColor: "bg-blue-500"
    }
  }

  // Load Data
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    setTableNotFound(false)
    try {
      const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
      const [currentRes, oldRes, financeRes] = await Promise.all([
        getTenants(),
        getOldTenants(),
        getFinanceSettings(wsId).catch(() => ({ success: false, data: null }))
      ])

      let activeSettings = null
      if (financeRes?.success && financeRes.data) {
        setFinanceSettings(financeRes.data)
        activeSettings = financeRes.data
      }

      if (currentRes.success && currentRes.data) {
        const tenants = currentRes.data as TenantItem[]
        setCurrentTenants(tenants)
        
        // Count stats precisely matching getContractStatus
        const now = new Date()
        const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        
        let activeCount = 0
        let expiredCount = 0

        tenants.forEach(t => {
          if (!t.contractStart || !t.contractEnd) {
            activeCount++
            return
          }
          const endDate = new Date(t.contractEnd)
          const endDateTime = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
          
          if (currentDate > endDateTime) {
            expiredCount++
          } else {
            activeCount++
          }
        })
        setStats(prev => ({ ...prev, activeCount, expiredCount }))
      } else if (currentRes.error) {
        setError(currentRes.error)
      }

      if (oldRes.success && oldRes.data) {
        const oldList = oldRes.data as OldTenantItem[]
        setOldTenants(oldList)
        setStats(prev => ({ ...prev, oldTotalCount: oldList.length }))
      } else if (oldRes.error === "table_not_found") {
        setTableNotFound(true)
      } else if (oldRes.error) {
        setError(oldRes.error)
      }
    } catch (err) {
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูลผู้เช่า")
    } finally {
      setLoading(false)
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    async function checkPermissions() {
      try {
        const res = await getCurrentUserProfileClient()
        if (res.success && res.data) {
          const profile = res.data
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
            setHasEditPermission(!!userPerms.manage_rooms_tenants_edit)
          }
        }
      } catch (err) {
        console.error("Failed to check permissions in tenants page", err)
      }
    }
    checkPermissions()
    loadData()
  }, [])

  const handleRefresh = () => {
    setIsSubmitting(true)
    loadData(true)
  }

  // Handle deletion of old tenant history log
  const handleDeleteOldTenant = async (id: string) => {
    if (!hasEditPermission) {
      showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล", "error")
      return
    }
    setDeleteSubmitting(true)
    try {
      const res = await deleteOldTenant(id)
      if (res.success) {
        setDeleteConfirmId(null)
        loadData(true)
      } else {
        alert(res.error || "เกิดข้อผิดพลาดในการลบประวัติ")
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดการเชื่อมต่อ")
    } finally {
      setDeleteSubmitting(false)
    }
  }

  // Filter lists based on query
  const filteredCurrent = currentTenants.filter(t => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      t.fullName.toLowerCase().includes(q) ||
      t.roomNumber.toLowerCase().includes(q) ||
      (t.phone && t.phone.includes(q))
    )
  })

  const filteredOld = oldTenants.filter(t => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      t.fullName.toLowerCase().includes(q) ||
      t.roomNumber.toLowerCase().includes(q) ||
      (t.phone && t.phone.includes(q))
    )
  })

  // Helper function to format Thai Phone (0xx-xxx-xxxx)
  const formatPhone = (phoneStr: string) => {
    if (!phoneStr) return "-"
    const clean = phoneStr.replace(/\D/g, "")
    if (clean.length === 10) {
      return `${clean.substring(0, 3)}-${clean.substring(3, 6)}-${clean.substring(6)}`
    }
    return phoneStr
  }

  // Mask Phone for data security/privacy
  const getMaskedPhone = (phoneStr: string) => {
    if (!phoneStr) return "-"
    const formatted = formatPhone(phoneStr)
    if (showSensitiveData) return formatted
    // Mask middle digits: 081-xxx-xx99
    const parts = formatted.split("-")
    if (parts.length === 3) {
      return `${parts[0]}-xxx-x${parts[2].substring(1)}`
    }
    return phoneStr.substring(0, 3) + "*-***-*" + phoneStr.substring(phoneStr.length - 2)
  }

  // Mask Line User ID
  const getMaskedLine = (lineId: string | null) => {
    if (!lineId) return "ไม่ได้ผูก LINE"
    if (showSensitiveData) return lineId
    if (lineId.length > 8) {
      return lineId.substring(0, 4) + "..." + lineId.substring(lineId.length - 4)
    }
    return "ผูก LINE แล้ว"
  }

  const formatDateThai = (dateStr: string) => {
    if (!dateStr) return "-"
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric"
      })
    } catch {
      return dateStr
    }
  }

  const isOriginalAction = financeSettings?.lease_expiry_action === "original"
  const expiredCardTitle = isOriginalAction ? "อยู่ครบตามอายุสัญญา" : "เกินกำหนดระยะสัญญาเดิม"
  const expiredCardSub = isOriginalAction ? "อยู่ครบตามอายุสัญญา" : "เกินกำหนดระยะสัญญาเดิม"
  const ExpiredIcon = isOriginalAction ? CheckCircle2 : Clock
  const expiredColors = isOriginalAction
    ? {
        text: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
      }
    : {
        text: "text-red-500 dark:text-red-400",
        bg: "bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400"
      }

  return (
    <>
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 backdrop-blur-md font-bold text-xs ${
            toast.type === "success" 
              ? "bg-emerald-500/90 text-white shadow-emerald-500/10 border border-emerald-400/20"
              : toast.type === "error"
              ? "bg-red-500/90 text-white shadow-red-500/10 border border-red-400/20"
              : "bg-blue-600/90 text-white shadow-blue-600/10 border border-blue-500/20"
          }`}>
            {toast.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {toast.type === "error" && <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.type === "info" && <Info className="w-4 h-4 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="space-y-6">
      {/* Header and Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            ข้อมูลผู้เช่าและประวัติ
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            ดูรายชื่อผู้เช่าปัจจุบัน สัญญาเช่าปัจจุบัน และประวัติผู้เช่าเก่าที่ย้ายออกแล้วอย่างปลอดภัยตามมาตรฐาน PDPA
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 w-full md:w-auto">
          {/* CSV Actions Group */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              title="ดาวน์โหลดเทมเพลตไฟล์ CSV สำหรับจัดการข้อมูลผู้เช่าและสัญญา"
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm flex-1 sm:flex-initial justify-center"
            >
              <Download className="w-4 h-4 text-blue-500" />
              <span className="hidden sm:inline">ดาวน์โหลด CSV Template</span>
              <span className="sm:hidden">เทมเพลต</span>
            </button>
            
            {hasEditPermission && (
              <label className="relative flex-1 sm:flex-initial">
                <span className={`px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm w-full justify-center ${uploadingCsv ? "opacity-60 cursor-not-allowed" : ""}`}>
                  {uploadingCsv ? (
                    <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 text-emerald-500" />
                  )}
                  <span className="hidden sm:inline">{uploadingCsv ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์ CSV"}</span>
                  <span className="sm:hidden">{uploadingCsv ? "..." : "อัปโหลด"}</span>
                </span>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleUploadCSV}
                  disabled={uploadingCsv}
                  className="absolute inset-0 w-0 h-0 opacity-0 cursor-pointer"
                />
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Sensitive data toggle */}
            <button
              onClick={() => setShowSensitiveData(!showSensitiveData)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold shadow-sm transition-all duration-300 cursor-pointer flex-1 sm:flex-initial justify-center ${
                showSensitiveData
                  ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-750 dark:text-amber-400"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-850"
              }`}
            >
              {showSensitiveData ? (
                <>
                  <EyeOff className="w-4 h-4 text-amber-500" />
                  ซ่อนข้อมูลส่วนตัว
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-slate-400" />
                  แสดงข้อมูลส่วนตัว (PDPA)
                </>
              )}
            </button>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-95 text-slate-500 dark:text-slate-350 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        {/* Stat 1: Active Current Tenants */}
        <div className="bg-white dark:bg-slate-850 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">ผู้เช่าสัญญาปกติ</span>
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono leading-none">
              {loading ? "-" : `${stats.activeCount} สัญญา`}
            </h3>
            <span className="text-[10px] md:text-xs text-teal-600 dark:text-teal-400 font-bold tracking-wide flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> อยู่ในสัญญาเช่าปกติ
            </span>
          </div>
          <div className="p-3 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-2xl">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 2: Expired Current Tenants */}
        <div className="bg-white dark:bg-slate-850 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{expiredCardTitle}</span>
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono leading-none">
              {loading ? "-" : `${stats.expiredCount} สัญญา`}
            </h3>
            <span className={`text-[10px] md:text-xs font-bold tracking-wide flex items-center gap-1 ${expiredColors.text}`}>
              <ExpiredIcon className="w-3.5 h-3.5" /> {expiredCardSub}
            </span>
          </div>
          <div className={`p-3 rounded-2xl ${expiredColors.bg}`}>
            <ExpiredIcon className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 3: Archived Old Tenants */}
        <div className="bg-white dark:bg-slate-850 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">ประวัติผู้เช่าเก่า</span>
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono leading-none">
              {loading ? "-" : `${stats.oldTotalCount} รายชื่อ`}
            </h3>
            <span className="text-[10px] md:text-xs text-blue-600 dark:text-blue-400 font-bold tracking-wide flex items-center gap-1">
              <Database className="w-3.5 h-3.5" /> สำรองข้อมูลในระบบถาวร
            </span>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl">
            <UserX className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs and Search Bar Container */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-2">
        {/* Tab switch buttons */}
        <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800 w-full md:w-auto">
          <button
            onClick={() => setActiveTab("current")}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-extrabold rounded-lg text-center transition-all duration-200 cursor-pointer ${
              activeTab === "current"
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <UserCheck className="w-4 h-4" />
            ผู้เช่าปัจจุบัน ({currentTenants.length})
          </button>
          <button
            onClick={() => setActiveTab("old")}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-extrabold rounded-lg text-center transition-all duration-200 cursor-pointer ${
              activeTab === "old"
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <UserMinus className="w-4 h-4" />
            ผู้เช่าเก่า/ย้ายออก ({stats.oldTotalCount})
          </button>
        </div>

        {/* Real-time Search Input */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="ค้นหาชื่อ, ห้องพัก, เบอร์โทร..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-slate-100 text-slate-700 shadow-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
          />
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400 dark:text-slate-500" />
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        // Premium table loader
        <div className="bg-white dark:bg-slate-850 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl p-8 space-y-4 animate-pulse">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg w-full" />
            ))}
          </div>
        </div>
      ) : tableNotFound && activeTab === "old" ? (
        // Guided Database Patch Warning
        <div className="p-6 md:p-8 rounded-3xl bg-amber-50/30 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30 space-y-6 max-w-3xl mx-auto backdrop-blur-md">
          <div className="flex gap-4 items-start">
            <div className="p-3.5 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 shrink-0">
              <Database className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                ยังไม่ได้ติดตั้งฐานข้อมูลย้ายออก (Table tenants_old Not Found)
              </h3>
              <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                ระบบหลังบ้านของท่านยังขาดตาราง <code className="px-1.5 py-0.5 bg-amber-100/50 dark:bg-amber-900/30 rounded font-mono text-xs text-amber-700 dark:text-amber-400 font-bold">public.tenants_old</code> สำหรับสำรองข้อมูลประวัติผู้เช่าเก่า
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <h4 className="text-xs font-bold text-slate-550 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" /> ขั้นตอนการติดตั้งง่ายๆ ภายใน 1 นาที:
            </h4>
            <ol className="list-decimal list-inside text-xs text-slate-600 dark:text-slate-400 space-y-2.5">
              <li>เปิดเข้าไปหน้าแดชบอร์ดโครงการของคุณที่ <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-bold inline-flex items-center gap-0.5">Supabase.com</a></li>
              <li>เมนูด้านซ้าย เลือกเมนู <strong>SQL Editor</strong></li>
              <li>คลิกปุ่ม <strong>New query</strong> เพื่อเปิดหน้าเขียนสคริปต์ว่างๆ</li>
              <li>คัดลอกรหัส SQL ในไฟล์ <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono font-bold text-slate-800 dark:text-slate-300 text-[11px]">database_patch_tenants_old.sql</code> ในโฟลเดอร์โปรเจกต์ของคุณไปวางทั้งหมด</li>
              <li>คลิกปุ่ม <strong>Run</strong> ที่มุมขวาล่างเพื่อสร้างตารางและนโยบาย RLS ในทันที</li>
            </ol>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => {
                setLoading(true);
                loadData();
              }}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer"
            >
              ทดลองเชื่อมต่ออีกครั้ง (Retry Connection)
            </button>
          </div>
        </div>
      ) : error ? (
        // Error Display
        <div className="p-8 text-center bg-red-50/30 dark:bg-red-950/10 border border-red-200/50 dark:border-red-900/30 rounded-2xl max-w-xl mx-auto space-y-4">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">เกิดข้อผิดพลาดในการดึงข้อมูล</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
          <button
            onClick={() => loadData()}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            โหลดข้อมูลใหม่
          </button>
        </div>
      ) : activeTab === "current" ? (
        // Tab 1: Current Tenants List
        <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm sm:text-base border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/10 text-slate-500 dark:text-slate-455 font-bold uppercase tracking-wider text-xs sm:text-sm">
                  <th className="py-3.5 px-5">ห้องพัก</th>
                  <th className="py-3.5 px-4">ชื่อผู้เช่า</th>
                  <th className="py-3.5 px-4">เบอร์โทรศัพท์ (PDPA)</th>
                  <th className="py-3.5 px-4">สถานะ LINE OA</th>
                  <th className="py-3.5 px-4">ระยะสัญญาเช่า</th>
                  <th className="py-3.5 px-5 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-650 dark:text-slate-300">
                {filteredCurrent.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="py-4 px-5 font-black text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                      ห้อง {t.roomNumber}
                    </td>
                    <td className="py-4 px-4 font-extrabold text-slate-850 dark:text-slate-200">
                      {t.fullName}
                    </td>
                    <td className="py-4 px-4 font-semibold font-mono text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                        {getMaskedPhone(t.phone)}
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-4 h-4 text-green-500 shrink-0" />
                        {getMaskedLine(t.lineUserId)}
                      </div>
                    </td>
                    <td className="py-4 px-4 font-semibold text-slate-550 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="font-mono text-xs sm:text-sm">
                          {formatDateThai(t.contractStart)} - {formatDateThai(t.contractEnd)}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-center">
                      {(() => {
                        const status = getContractStatus(t.contractStart, t.contractEnd)
                        if (!status) return "-"
                        return (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm font-bold ${status.style}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
                            {status.label}
                          </span>
                        )
                      })()}
                    </td>
                  </tr>
                ))}

                {filteredCurrent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-555 font-medium">
                      ไม่มีข้อมูลผู้เช่าเช่าอยู่ในขณะนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // Tab 2: Archived Old Tenants List (VIEW ONLY OR DELETE ACCORDING TO USER PERMISSIONS)
        <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm sm:text-base border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/10 text-slate-500 dark:text-slate-455 font-bold uppercase tracking-wider text-xs sm:text-sm">
                  <th className="py-3.5 px-5">ห้องสุดท้าย</th>
                  <th className="py-3.5 px-4">ชื่อผู้เช่าเก่า</th>
                  <th className="py-3.5 px-4">เบอร์โทรศัพท์ (PDPA)</th>
                  <th className="py-3.5 px-4">ระยะเวลาที่เคยเช่า</th>
                  <th className="py-3.5 px-4">วันที่แจ้งคืนห้อง/ย้ายออก</th>
                  <th className="py-3.5 px-5 text-center w-24">ลบบันทึก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-650 dark:text-slate-300">
                {filteredOld.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="py-4 px-5 font-black text-slate-700 dark:text-slate-300 text-sm sm:text-base">
                      ห้อง {t.roomNumber}
                    </td>
                    <td className="py-4 px-4 font-extrabold text-slate-850 dark:text-slate-200">
                      {t.fullName}
                    </td>
                    <td className="py-4 px-4 font-semibold font-mono text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {getMaskedPhone(t.phone)}
                      </div>
                    </td>
                    <td className="py-4 px-4 font-semibold text-slate-550 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px]">
                          {formatDateThai(t.contractStart)} - {formatDateThai(t.contractEnd)}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-bold text-rose-600 dark:text-rose-450">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span className="font-mono text-[11px]">
                          {formatDateThai(t.movedOutAt)}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-center">
                      <button
                        onClick={() => {
                          if (!hasEditPermission) {
                            showToast("คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล", "error")
                            return
                          }
                          setDeleteConfirmId(t.id)
                        }}
                        disabled={!hasEditPermission}
                        className={`p-1.5 rounded-lg transition-all inline-flex items-center justify-center border ${
                          hasEditPermission
                            ? "bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/20 dark:hover:bg-rose-900/35 dark:text-rose-400 active:scale-95 cursor-pointer border border-rose-100/30 dark:border-rose-900/20"
                            : "opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border-slate-200 dark:border-slate-800"
                        }`}
                        title={hasEditPermission ? "ลบข้อมูลประวัติผู้เช่าถาวร" : "ไม่มีสิทธิ์ในการลบข้อมูล"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredOld.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-555 font-medium">
                      ไม่มีประวัติข้อมูลผู้เช่าเก่าย้ายออกในตาราง
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Safety Notice Panel (PDPA Compliance & Security) */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/50 dark:border-slate-800/80 flex gap-3 items-start">
        <Lock className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">มาตรฐานความปลอดภัยข้อมูลผู้เช่า (GDPR & PDPA compliance)</h4>
          <p className="text-[10px] md:text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            ข้อมูลผู้เช่าและเอกสารถูกเข้ารหัสและเข้าถึงโดยจำกัดสิทธิ์เฉพาะแอดมินหรือทีมงานที่ได้รับอนุมัติในตึกนี้ (Workspace-Scoped RLS) ข้อมูลหมายเลขโทรศัพท์และรหัสประจำตัว LINE OA จะได้รับการปกปิด (Masked) เป็นค่าเริ่มต้น เพื่อเพิ่มความปลอดภัยและป้องกันการรั่วไหลของข้อมูลส่วนบุคคล
          </p>
        </div>
      </div>

      {/* Confirmation Modal for Permanently Deleting Archived Tenants */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-850 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 max-w-sm w-full shadow-2xl space-y-6">
            <div className="flex gap-4 items-start text-red-600">
              <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">ยืนยันการลบประวัติถาวร?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-450 leading-relaxed">
                  การลบรายชื่อผู้เช่าออกจากประวัติเก่า จะทำลายข้อมูลนี้ออกจากฐานข้อมูลโดยถาวร และไม่สามารถเรียกกลับมาดูใหม่ได้อีก
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-150 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={() => handleDeleteOldTenant(deleteConfirmId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                {deleteSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                ยืนยันลบถาวร
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Error Report Modal */}
      {isErrorModalOpen && csvErrors && csvErrors.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-850 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 max-w-lg w-full shadow-2xl space-y-4 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-start">
              <div className="flex gap-3 items-center text-red-600 dark:text-red-400">
                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 rounded-2xl shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">พบข้อผิดพลาดในการตรวจสอบข้อมูล</h3>
                  <p className="text-xs text-slate-550 dark:text-slate-400 mt-0.5">การบันทึกถูกระงับเพื่อความถูกต้องของข้อมูลทั้งหมด (Atomic Safety)</p>
                </div>
              </div>
              <button
                onClick={() => setIsErrorModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-650 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[50vh] min-h-[150px] border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-900/30">
              {csvErrors.map((err, idx) => (
                <div key={idx} className="flex gap-2.5 items-start text-xs text-slate-700 dark:text-slate-300 font-medium py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  <p className="leading-relaxed">{err}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsErrorModalOpen(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl cursor-pointer hover:shadow-lg transition-all active:scale-95"
              >
                รับทราบและปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
