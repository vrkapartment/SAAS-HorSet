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
  Info,
  LayoutGrid,
  List,
  Edit,
  ArrowRightLeft
} from "lucide-react"
import { getTenants, getOldTenants, deleteOldTenant, createTenantsBatch, updateTenant } from "@/features/tenant/actions"
import RoomTransferModal from "@/features/tenant/components/RoomTransferModal"
import { getFinanceSettings } from "@/features/finance/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { DEFAULT_STAFF_PERMISSIONS } from "@/features/permissions/types"
import { getRooms } from "@/features/room/actions"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { DynamicText } from "@/lib/translations/DynamicText"

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

interface TenantItem {
  id: string
  roomId?: string | null
  roomNumber: string
  fullName: string
  phone: string
  lineUserId: string | null
  contractStart: string
  contractEnd: string
  depositPaid?: number | null
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
  const { t, locale } = useLanguage()
  const router = useRouter()
  
  // Tabs and State
  const [activeTab, setActiveTab] = useState<"current" | "old">("current")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tableNotFound, setTableNotFound] = useState(false)
  const [isRefreshing, setIsSubmitting] = useState(false)
  const [financeSettings, setFinanceSettings] = useState<any>(null)

  // Data lists
  const [currentTenants, setCurrentTenants] = useState<TenantItem[]>([])
  const [oldTenants, setOldTenants] = useState<OldTenantItem[]>([])
  const [rooms, setRooms] = useState<any[]>([])

  // UI features
  const [searchQuery, setSearchQuery] = useState("")
  const [showSensitiveData, setShowSensitiveData] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  // CSV Import States
  const [uploadingCsv, setUploadingCsv] = useState(false)
  const [csvErrors, setCsvErrors] = useState<string[] | null>(null)
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false)
  const [isTemplateGuideModalOpen, setIsTemplateGuideModalOpen] = useState(false)

  // Stats Counters
  const [stats, setStats] = useState({
    activeCount: 0,
    expiredCount: 0,
    oldTotalCount: 0
  })

  const [hasEditPermission, setHasEditPermission] = useState(true)
  // ย้ายห้องจำกัดสิทธิ์เฉพาะ Admin/Super Admin เท่านั้น (เข้มกว่า hasEditPermission ทั่วไป เพราะแตะเงินประกัน)
  const [isAdminOrSuper, setIsAdminOrSuper] = useState(false)
  // Tenant Edit States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null)
  const [editFullName, setEditFullName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editRoomNumber, setEditRoomNumber] = useState("")
  const [editContractStart, setEditContractStart] = useState("")
  const [editContractEnd, setEditContractEnd] = useState("")
  const [editLineUserId, setEditLineUserId] = useState("")
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Room Transfer (ย้ายห้อง) States
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [transferTenant, setTransferTenant] = useState<TenantItem | null>(null)

  // Sorting State
  const [sortField, setSortField] = useState<"room" | "fullName" | "line" | "lease" | "status">("room")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")


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
      showToast(t("tenants.downloading_template"), "info")
      const wsId = getCookie("horset_current_workspace_id") || ""
      const roomsRes = await getRooms(wsId)
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
      const todayStr = `'${day}/${month}/${year}`

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

      showToast(t("tenants.template_downloaded"), "success")

      setTimeout(() => {
        setIsTemplateGuideModalOpen(true)
      }, 500)
    } catch (err) {
      showToast(t("tenants.err_template_create"), "error")
    }
  }

  // ฟังก์ชันอัปโหลดไฟล์ CSV และบันทึกข้อมูลผู้เช่า
  const handleUploadCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith(".csv")) {
      showToast(t("tenants.err_csv_only"), "error")
      e.target.value = ""
      return
    }

    setUploadingCsv(true)
    setCsvErrors(null)
    const wsId = getCookie("horset_current_workspace_id") || ""

    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const text = event.target?.result as string
        if (!text) {
          showToast(t("tenants.err_csv_read"), "error")
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
          showToast(t("tenants.err_csv_structure"), "error")
          setUploadingCsv(false)
          return
        }

        const headers = rows[0].map(h => h.toLowerCase().trim())
        const roomNumIdx = headers.indexOf("room_number")
        const nameIdx = headers.indexOf("tenant_name")
        const phoneIdx = headers.indexOf("phone")
        const startIdx = headers.indexOf("lease_start")

        if (roomNumIdx === -1 || nameIdx === -1) {
          showToast(t("tenants.err_csv_headers"), "error")
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
          showToast(t("tenants.err_csv_no_valid_tenant"), "error")
          setUploadingCsv(false)
          return
        }

        // ส่งไปบันทึกที่ Server Action
        const res = await createTenantsBatch(parsedTenants, wsId)
        if (res.success) {
          showToast(t("tenants.csv_import_success").replace("{count}", String(res.count)), "success")
          await loadData(true)
        } else if (res.errors && res.errors.length > 0) {
          setCsvErrors(res.errors)
          setIsErrorModalOpen(true)
          showToast(t("tenants.csv_import_partial_error"), "error")
        } else {
          showToast(res.error || t("tenants.err_csv_import_generic"), "error")
        }
        setUploadingCsv(false)
      }
      reader.readAsText(file, "UTF-8")
    } catch (err: any) {
      showToast(t("tenants.err_csv_upload"), "error")
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
          label: t("tenants.status_overdue_renew"),
          style: "bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 font-bold",
          dotColor: "bg-red-500"
        }
      } else {
        return {
          label: t("rooms.active_contract"),
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
          label = t("tenants.status_remaining_1mo")
        } else if (diffDays <= 60) {
          label = t("tenants.status_remaining_2mo")
        } else {
          label = t("tenants.status_remaining_months").replace("{n}", String(totalMonths))
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
      label: t("tenants.status_normal"),
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
      const wsId = getCookie("horset_current_workspace_id") || ""
      const [currentRes, oldRes, financeRes, roomsRes] = await Promise.all([
        getTenants(),
        getOldTenants(),
        getFinanceSettings(wsId).catch(() => ({ success: false, data: null })),
        getRooms(wsId).catch(() => ({ success: false, data: [] }))
      ])

      if (roomsRes?.success && roomsRes.data) {
        setRooms(roomsRes.data as any[])
      }

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
      setError(t("tenants.err_load_tenants"))
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
          setIsAdminOrSuper(isUserAdminOrSuper)
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
      showToast(t("daily_bills.no_permission_msg"), "error")
      return
    }
    setDeleteSubmitting(true)
    try {
      const res = await deleteOldTenant(id)
      if (res.success) {
        setDeleteConfirmId(null)
        loadData(true)
      } else {
        alert(res.error || t("tenants.err_delete_history"))
      }
    } catch (err) {
      alert(t("tenants.err_connection_generic"))
    } finally {
      setDeleteSubmitting(false)
    }
  }

  const handleEditClick = (tenant: TenantItem) => {
    if (!hasEditPermission) {
      showToast(t("daily_bills.no_permission_msg"), "error")
      return
    }
    setSelectedTenant(tenant)
    setEditFullName(tenant.fullName)
    setEditPhone(tenant.phone || "")
    setEditRoomNumber(tenant.roomNumber)
    
    const formatDateForInput = (dateStr: string | null | undefined) => {
      if (!dateStr) return ""
      try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return ""
        return d.toISOString().split("T")[0]
      } catch {
        return ""
      }
    }
    setEditContractStart(formatDateForInput(tenant.contractStart))
    setEditContractEnd(formatDateForInput(tenant.contractEnd))
    setEditLineUserId(tenant.lineUserId || "")
    setIsEditModalOpen(true)
  }

  const handleOpenTransferModal = (tenant: TenantItem) => {
    if (!isAdminOrSuper) {
      showToast("ฟีเจอร์ย้ายห้องจำกัดสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น", "error")
      return
    }
    setTransferTenant(tenant)
    setTransferModalOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasEditPermission) {
      showToast(t("daily_bills.no_permission_msg"), "error")
      return
    }
    if (!selectedTenant) return

    if (!editFullName.trim()) {
      showToast(t("tenants.err_name_required"), "error")
      return
    }
    if (!editPhone.trim()) {
      showToast(t("tenants.err_phone_required"), "error")
      return
    }
    if (!editRoomNumber.trim()) {
      showToast(t("tenants.err_room_required"), "error")
      return
    }
    if (!editContractStart) {
      showToast(t("tenants.err_start_date_required"), "error")
      return
    }
    if (!editContractEnd) {
      showToast(t("tenants.err_end_date_required"), "error")
      return
    }

    if (new Date(editContractEnd) < new Date(editContractStart)) {
      showToast(t("tenants.err_end_before_start"), "error")
      return
    }

    setEditSubmitting(true)
    try {
      const res = await updateTenant(
        selectedTenant.id,
        editRoomNumber.trim(),
        editFullName.trim(),
        editPhone.trim(),
        editLineUserId.trim() || null,
        editContractStart,
        editContractEnd
      )

      if (res.success) {
        showToast(t("tenants.edit_success"), "success")
        setIsEditModalOpen(false)
        setSelectedTenant(null)
        loadData(true)
      } else {
        showToast(res.error || t("tenants.err_save_generic"), "error")
      }
    } catch (err) {
      showToast(t("tenants.err_server_connection"), "error")
    } finally {
      setEditSubmitting(false)
    }
  }

  // Filter lists based on query and apply sorting
  const filteredCurrent = [...currentTenants]
    .filter(t => {
      const q = searchQuery.toLowerCase().trim()
      if (!q) return true
      return (
        t.fullName.toLowerCase().includes(q) ||
        t.roomNumber.toLowerCase().includes(q) ||
        (t.phone && t.phone.includes(q))
      )
    })
    .sort((a, b) => {
      let comparison = 0
      
      switch (sortField) {
        case "room":
          comparison = a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true, sensitivity: 'base' })
          break
        case "fullName":
          comparison = a.fullName.localeCompare(b.fullName, "th")
          break
        case "line":
          const lineA = a.lineUserId || ""
          const lineB = b.lineUserId || ""
          comparison = lineA.localeCompare(lineB)
          break
        case "lease":
          const leaseA = a.contractStart || ""
          const leaseB = b.contractStart || ""
          comparison = leaseA.localeCompare(leaseB)
          break
        case "status":
          const statusA = getContractStatus(a.contractStart, a.contractEnd)?.label || ""
          const statusB = getContractStatus(b.contractStart, b.contractEnd)?.label || ""
          comparison = statusA.localeCompare(statusB, "th")
          break
        default:
          comparison = 0
      }

      return sortDirection === "asc" ? comparison : -comparison
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
    if (!lineId) return t("tenants.line_not_linked")
    if (showSensitiveData) return lineId
    if (lineId.length > 8) {
      return lineId.substring(0, 4) + "..." + lineId.substring(lineId.length - 4)
    }
    return t("tenants.line_linked")
  }

  const formatDateThai = (dateStr: string) => {
    if (!dateStr) return "-"
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString(locale === "th" ? "th-TH" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      })
    } catch {
      return dateStr
    }
  }

  const isOriginalAction = financeSettings?.lease_expiry_action === "original"
  const expiredCardTitle = isOriginalAction ? t("rooms.active_contract") : t("tenants.status_overdue_renew")
  const expiredCardSub = isOriginalAction ? t("rooms.active_contract") : t("tenants.status_overdue_renew")
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

  // ห้องว่างทั้งหมด (สำหรับ modal ย้ายห้อง — ไม่รวมห้องปัจจุบันของผู้เช่าเพราะสถานะเป็น occupied อยู่แล้ว)
  const vacantRoomsForTransfer = rooms.filter(r => r.status === "available")

  const getRoomFloor = (roomNum: string) => {
    const room = rooms.find(r => r.roomNumber === roomNum)
    if (room && room.floor) return String(room.floor)
    
    // Fallback: If room number starts with digits, use the first digit as the floor
    const match = roomNum.match(/^\d+/)
    if (match) {
      if (roomNum.length >= 3) {
        return roomNum.substring(0, roomNum.length - 2) // e.g. "102" -> "1", "1203" -> "12"
      }
      return match[0][0]
    }
    const charMatch = roomNum.match(/^[A-Za-z]+(\d+)/) // e.g. "A101"
    if (charMatch && charMatch[1]) {
      const numStr = charMatch[1]
      if (numStr.length >= 3) {
        return numStr.substring(0, numStr.length - 2)
      }
      return numStr[0]
    }
    return "1"
  }

  // Group filteredCurrent by floor for Grid View
  const currentByFloor = (() => {
    const grouped: { [key: string]: TenantItem[] } = {}
    filteredCurrent.forEach((t) => {
      const floor = getRoomFloor(t.roomNumber)
      if (!grouped[floor]) {
        grouped[floor] = []
      }
      grouped[floor].push(t)
    })
    return grouped
  })()

  // Get sorted floors
  const sortedFloors = Object.keys(currentByFloor).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  )

  // Group filteredOld by floor for Grid View
  const oldByFloor = (() => {
    const grouped: { [key: string]: OldTenantItem[] } = {}
    filteredOld.forEach((t) => {
      const floor = getRoomFloor(t.roomNumber)
      if (!grouped[floor]) {
        grouped[floor] = []
      }
      grouped[floor].push(t)
    })
    return grouped
  })()

  // Get sorted floors for old tenants
  const sortedOldFloors = Object.keys(oldByFloor).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  )

  const handleSort = (field: "room" | "fullName" | "line" | "lease" | "status") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const renderSortHeader = (
    label: string,
    field: "room" | "fullName" | "line" | "lease" | "status",
    className = "",
    isCenter = false
  ) => {
    const isActive = sortField === field
    return (
      <th className={`py-3.5 px-4 select-none ${className}`}>
        <button
          type="button"
          onClick={() => handleSort(field)}
          className={`flex items-center gap-1.5 hover:text-slate-850 dark:hover:text-slate-100 transition-colors uppercase tracking-wider text-xs sm:text-sm font-bold cursor-pointer outline-none ${
            isCenter ? "justify-center mx-auto" : "justify-start text-left"
          }`}
        >
          <span>{label}</span>
          <ArrowUpDown
            className={`w-3.5 h-3.5 shrink-0 transition-colors ${
              isActive ? "text-blue-500 font-extrabold" : "text-slate-350 dark:text-slate-650 opacity-40"
            }`}
          />
        </button>
      </th>
    )
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
            {t("tenants.header_title")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {t("tenants.header_desc")}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 w-full md:w-auto">
          {/* CSV Actions Group */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              title={t("tenants.download_template_tooltip")}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm flex-1 sm:flex-initial justify-center"
            >
              <Download className="w-4 h-4 text-blue-500" />
              <span className="hidden sm:inline">{t("tenants.download_csv_template_full")}</span>
              <span className="sm:hidden">{t("tenants.download_csv_template_short")}</span>
            </button>

            {hasEditPermission && (
              <label className="relative flex-1 sm:flex-initial">
                <span className={`px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm w-full justify-center ${uploadingCsv ? "opacity-60 cursor-not-allowed" : ""}`}>
                  {uploadingCsv ? (
                    <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 text-emerald-500" />
                  )}
                  <span className="hidden sm:inline">{uploadingCsv ? t("tenants.uploading_btn") : t("tenants.upload_csv_full")}</span>
                  <span className="sm:hidden">{uploadingCsv ? "..." : t("tenants.upload_csv_short")}</span>
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

            <button
              type="button"
              onClick={() => setIsTemplateGuideModalOpen(true)}
              title={t("tenants.csv_guide_tooltip")}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm flex-1 sm:flex-initial justify-center"
            >
              <HelpCircle className="w-4 h-4 text-indigo-500" />
              <span className="hidden sm:inline">{t("tenants.csv_guide_full")}</span>
              <span className="sm:hidden">{t("tenants.csv_guide_short")}</span>
            </button>
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
                  {t("tenants.hide_sensitive")}
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-slate-400" />
                  {t("tenants.show_sensitive")}
                </>
              )}
            </button>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-95 text-slate-500 dark:text-slate-350 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              title={t("tenants.refresh_tooltip")}
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
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("tenants.stat_active_title")}</span>
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono leading-none">
              {loading ? "-" : t("tenants.contract_count").replace("{count}", String(stats.activeCount))}
            </h3>
            <span className="text-[10px] md:text-xs text-teal-600 dark:text-teal-400 font-bold tracking-wide flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t("tenants.stat_active_sub")}
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
              {loading ? "-" : t("tenants.contract_count").replace("{count}", String(stats.expiredCount))}
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
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("tenants.stat_old_title")}</span>
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono leading-none">
              {loading ? "-" : t("tenants.name_count").replace("{count}", String(stats.oldTotalCount))}
            </h3>
            <span className="text-[10px] md:text-xs text-blue-600 dark:text-blue-400 font-bold tracking-wide flex items-center gap-1">
              <Database className="w-3.5 h-3.5" /> {t("tenants.stat_old_sub")}
            </span>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl">
            <UserX className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs and Search Bar Container */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Search bar with ambient border glow */}
        <div className="relative flex-1 max-w-md w-full">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 dark:text-slate-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder={t("tenants.search_placeholder")}
            className="w-full h-11 pl-10 pr-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 text-xs font-medium transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters & View switcher Row */}
        <div className="flex flex-wrap items-center justify-between xl:justify-end gap-3 w-full xl:w-auto">
          {/* Tab switch buttons as Filter Badges Row */}
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline-block">{t("tenants.tenant_status_label")}</span>
            {[
              { id: "current", label: t("tenants.current_tenants_tab").replace("{count}", String(currentTenants.length)), icon: UserCheck },
              { id: "old", label: t("tenants.old_tenants_tab").replace("{count}", String(stats.oldTotalCount)), icon: UserMinus }
            ].map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === tab.id
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 shadow shadow-slate-950/10"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* View Mode Toggle (Hidden on Mobile) */}
          <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800/40 shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === "grid"
                  ? "bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{t("tenants.view_block")}</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === "table"
                  ? "bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>{t("tenants.view_table")}</span>
            </button>
          </div>
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
                {t("tenants.table_not_found_title")}
              </h3>
              <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t("tenants.table_not_found_desc_prefix")} <code className="px-1.5 py-0.5 bg-amber-100/50 dark:bg-amber-900/30 rounded font-mono text-xs text-amber-700 dark:text-amber-400 font-bold">public.tenants_old</code> {t("tenants.table_not_found_desc_suffix")}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" /> {t("tenants.setup_steps_title")}
            </h4>
            <ol className="list-decimal list-inside text-xs text-slate-600 dark:text-slate-400 space-y-2.5">
              <li>{t("tenants.setup_step1_prefix")} <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-bold inline-flex items-center gap-0.5">Supabase.com</a></li>
              <li>{t("tenants.setup_step2_prefix")} <strong>SQL Editor</strong></li>
              <li>{t("tenants.setup_step3_prefix")} <strong>New query</strong> {t("tenants.setup_step3_suffix")}</li>
              <li>{t("tenants.setup_step4_prefix")} <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono font-bold text-slate-800 dark:text-slate-300 text-[11px]">schema_multi_workspace.sql</code> {t("tenants.setup_step4_suffix")}</li>
              <li>{t("tenants.setup_step5_prefix")} <strong>Run</strong> {t("tenants.setup_step5_suffix")}</li>
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
              {t("tenants.retry_connection_btn")}
            </button>
          </div>
        </div>
      ) : error ? (
        // Error Display
        <div className="p-8 text-center bg-red-50/30 dark:bg-red-950/10 border border-red-200/50 dark:border-red-900/30 rounded-2xl max-w-xl mx-auto space-y-4">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{t("tenants.err_fetch_generic")}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
          <button
            onClick={() => loadData()}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            {t("tenants.reload_data_btn")}
          </button>
        </div>
      ) : activeTab === "current" ? (
        <>
          {/* Always Grid View on Mobile, conditional Grid on Desktop */}
          <div className={viewMode === "grid" ? "block" : "block md:hidden"}>
            {sortedFloors.map((floor) => (
              <div key={floor} className="space-y-4 mb-8">
                {/* Floor Header Badge */}
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/40 px-5 py-3 rounded-2xl border border-slate-200/40 dark:border-slate-800/80 shadow-sm">
                  <div className="px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-mono font-black text-sm rounded-lg">
                    FL {floor}
                  </div>
                  <h3 className="text-base md:text-lg font-black text-slate-850 dark:text-slate-100">
                    {t("tenants.floor_simple").replace("{floor}", floor)}
                  </h3>
                  <span className="text-xs md:text-sm text-slate-400 dark:text-slate-500 font-bold ml-auto bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-150 dark:border-slate-800">
                    {t("tenants.tenant_count_rooms").replace("{count}", String(currentByFloor[floor].length))}
                  </span>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {currentByFloor[floor].map((tenant) => {
                    const status = getContractStatus(tenant.contractStart, tenant.contractEnd)
                    return (
                      <div
                        key={tenant.id}
                        className="p-5 rounded-2xl border border-slate-200/60 dark:border-slate-850 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group/card bg-white dark:bg-slate-900"
                      >
                        <div>
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div>
                              <span className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">{t("dashboard.col_room")}</span>
                              <h4 className="text-base sm:text-lg font-black text-slate-850 dark:text-slate-100 tracking-wide">
                                {t("billing.room_label").replace("{roomNumber}", tenant.roomNumber)}
                              </h4>
                            </div>

                            {/* Actions */}
                            {hasEditPermission && (
                              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 p-1 rounded-lg border border-slate-200/30 dark:border-slate-800/30 opacity-60 group-hover/card:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleEditClick(tenant)}
                                  className="p-1 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 rounded hover:bg-slate-200/50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                                  title={t("tenants.edit_tenant_tooltip")}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                {isAdminOrSuper && (
                                  <button
                                    onClick={() => handleOpenTransferModal(tenant)}
                                    className="p-1 text-teal-600 hover:text-teal-500 dark:text-teal-400 dark:hover:text-teal-300 rounded hover:bg-slate-200/50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                                    title="ย้ายห้อง"
                                  >
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Status Badge */}
                          <div className="mb-4">
                            {status ? (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs sm:text-sm font-extrabold uppercase tracking-wider ${status.style}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
                                {status.label}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600">-</span>
                            )}
                          </div>

                          {/* Details */}
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/85 space-y-2.5">
                            <div className="flex items-center justify-between text-sm sm:text-base">
                              <span className="text-slate-400 dark:text-slate-500 font-medium">{t("rooms.tenant_label")}</span>
                              <span className="font-bold text-slate-850 dark:text-slate-200 flex items-center gap-1.5 truncate min-w-0 flex-1 justify-end ml-4" title={tenant.fullName}>
                                <Users className="w-4 h-4 text-slate-400 shrink-0" />
                                <DynamicText>{tenant.fullName}</DynamicText>
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-sm sm:text-base">
                              <span className="text-slate-400 dark:text-slate-500 font-medium">{t("rooms.phone_label")}</span>
                              <span className="font-semibold text-slate-750 dark:text-slate-300 flex items-center gap-1.5 font-mono">
                                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                                {getMaskedPhone(tenant.phone)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-sm sm:text-base">
                              <span className="text-slate-400 dark:text-slate-500 font-medium">{t("tenants.line_oa_status_label")}</span>
                              <span className="font-semibold text-slate-750 dark:text-slate-300 flex items-center gap-1.5 font-mono">
                                <MessageSquare className="w-4 h-4 text-green-500 shrink-0" />
                                {getMaskedLine(tenant.lineUserId)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-sm sm:text-base">
                              <span className="text-slate-400 dark:text-slate-500 font-medium">{t("tenants.lease_term_label")}</span>
                              <span className="font-semibold text-slate-750 dark:text-slate-300 flex items-center gap-1.5 font-mono text-xs sm:text-sm">
                                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                                {formatDateThai(tenant.contractStart)} - {formatDateThai(tenant.contractEnd)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {filteredCurrent.length === 0 && (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium glass-panel bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-850">
                {t("tenants.no_current_tenants")}
              </div>
            )}
          </div>

          {/* Table View: Shown on Desktop only when viewMode === 'table', hidden on Mobile */}
          <div className={viewMode === "table" ? "hidden md:block" : "hidden"}>
            <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm sm:text-base border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/10 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-xs sm:text-sm">
                    {renderSortHeader(t("dashboard.col_room"), "room", "py-3.5 px-5")}
                    {renderSortHeader(t("dashboard.col_tenant"), "fullName", "py-3.5 px-4")}
                    <th className="py-3.5 px-4 select-none">{t("tenants.col_phone_pdpa")}</th>
                    {renderSortHeader(t("tenants.col_line_oa"), "line", "py-3.5 px-4")}
                    {renderSortHeader(t("tenants.col_lease_term"), "lease", "py-3.5 px-4")}
                    {renderSortHeader(t("dashboard.col_status"), "status", "py-3.5 px-5 text-center", true)}
                    {hasEditPermission && <th className="py-3.5 px-5 text-center w-24">{t("tenants.col_actions")}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-650 dark:text-slate-300">
                  {filteredCurrent.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                      <td className="py-4 px-5 font-black text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                        {t("billing.room_label").replace("{roomNumber}", tenant.roomNumber)}
                      </td>
                      <td className="py-4 px-4 font-extrabold text-slate-850 dark:text-slate-200">
                        <DynamicText>{tenant.fullName}</DynamicText>
                      </td>
                      <td className="py-4 px-4 font-semibold font-mono text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                          {getMaskedPhone(tenant.phone)}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-green-500 shrink-0" />
                          {getMaskedLine(tenant.lineUserId)}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="font-mono text-xs sm:text-sm">
                            {formatDateThai(tenant.contractStart)} - {formatDateThai(tenant.contractEnd)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-center">
                        {(() => {
                          const status = getContractStatus(tenant.contractStart, tenant.contractEnd)
                          if (!status) return "-"
                          return (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm font-bold ${status.style}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
                              {status.label}
                            </span>
                          )
                        })()}
                      </td>
                      {hasEditPermission && (
                        <td className="py-4 px-5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleEditClick(tenant)}
                              className="p-1.5 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer inline-flex items-center justify-center"
                              title={t("tenants.edit_tenant_tooltip")}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {isAdminOrSuper && (
                              <button
                                onClick={() => handleOpenTransferModal(tenant)}
                                className="p-1.5 text-teal-600 hover:text-teal-500 dark:text-teal-400 dark:hover:text-teal-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer inline-flex items-center justify-center"
                                title="ย้ายห้อง"
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}

                  {filteredCurrent.length === 0 && (
                    <tr>
                      <td colSpan={hasEditPermission ? 7 : 6} className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                        {t("tenants.no_current_tenants")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </>
      ) : (
        // Tab 2: Archived Old Tenants List (VIEW ONLY OR DELETE ACCORDING TO USER PERMISSIONS)
        <>
          {/* Always Grid View on Mobile, conditional Grid on Desktop */}
          <div className={viewMode === "grid" ? "block" : "block md:hidden"}>
            {sortedOldFloors.map((floor) => (
              <div key={floor} className="space-y-4 mb-8">
                {/* Floor Header Badge */}
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/40 px-5 py-3 rounded-2xl border border-slate-200/40 dark:border-slate-800/80 shadow-sm">
                  <div className="px-3 py-1 bg-rose-100/80 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-mono font-black text-sm rounded-lg">
                    FL {floor}
                  </div>
                  <h3 className="text-base md:text-lg font-black text-slate-850 dark:text-slate-100">
                    {t("tenants.floor_simple").replace("{floor}", floor)}
                  </h3>
                  <span className="text-xs md:text-sm text-slate-400 dark:text-slate-500 font-bold ml-auto bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-150 dark:border-slate-800">
                    {t("tenants.history_count_items").replace("{count}", String(oldByFloor[floor].length))}
                  </span>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {oldByFloor[floor].map((tenant) => (
                    <div
                      key={tenant.id}
                      className="p-5 rounded-2xl border border-slate-200/60 dark:border-slate-850 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group/card bg-white dark:bg-slate-900"
                    >
                      <div>
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <span className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">{t("tenants.last_room_label_detail")}</span>
                            <h4 className="text-base sm:text-lg font-black text-slate-850 dark:text-slate-100 tracking-wide">
                              {t("billing.room_label").replace("{roomNumber}", tenant.roomNumber)}
                            </h4>
                          </div>

                          {/* Actions */}
                          <div>
                            <button
                              onClick={() => {
                                if (!hasEditPermission) {
                                  showToast(t("daily_bills.no_permission_msg"), "error")
                                  return
                                }
                                setDeleteConfirmId(tenant.id)
                              }}
                              disabled={!hasEditPermission}
                              className={`p-1.5 rounded-lg transition-all inline-flex items-center justify-center border ${
                                hasEditPermission
                                  ? "bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/20 dark:hover:bg-rose-900/35 dark:text-rose-400 active:scale-95 cursor-pointer border border-rose-150/40 dark:border-rose-900/30"
                                  : "opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border-slate-200 dark:border-slate-800"
                              }`}
                              title={hasEditPermission ? t("tenants.delete_permanent_tooltip") : t("tenants.no_delete_permission_tooltip")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/85 space-y-2.5">
                          <div className="flex items-center justify-between text-sm sm:text-base">
                            <span className="text-slate-400 dark:text-slate-500 font-medium">{t("tenants.old_tenant_name_label")}</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate min-w-0 flex-1 justify-end ml-4" title={tenant.fullName}>
                              <Users className="w-4 h-4 text-slate-400 shrink-0" />
                              <DynamicText>{tenant.fullName}</DynamicText>
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm sm:text-base">
                            <span className="text-slate-400 dark:text-slate-500 font-medium">{t("rooms.phone_label")}</span>
                            <span className="font-semibold text-slate-750 dark:text-slate-300 flex items-center gap-1.5 font-mono">
                              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                              {getMaskedPhone(tenant.phone)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm sm:text-base">
                            <span className="text-slate-400 dark:text-slate-500 font-medium">{t("tenants.rental_period_label")}</span>
                            <span className="font-semibold text-slate-750 dark:text-slate-300 flex items-center gap-1.5 font-mono text-xs sm:text-sm">
                              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                              {formatDateThai(tenant.contractStart)} - {formatDateThai(tenant.contractEnd)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm sm:text-base">
                            <span className="text-slate-400 dark:text-slate-500 font-medium">{t("tenants.moved_out_date_label")}</span>
                            <span className="font-bold text-rose-600 dark:text-rose-455 flex items-center gap-1.5 font-mono">
                              <Clock className="w-4 h-4 text-rose-500 shrink-0" />
                              {formatDateThai(tenant.movedOutAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {filteredOld.length === 0 && (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium glass-panel bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-850">
                {t("tenants.no_old_tenants")}
              </div>
            )}
          </div>

          {/* Table View: Shown on Desktop only when viewMode === 'table', hidden on Mobile */}
          <div className={viewMode === "table" ? "hidden md:block" : "hidden"}>
            <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm sm:text-base border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/10 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-xs sm:text-sm">
                    <th className="py-3.5 px-5">{t("tenants.last_room_col")}</th>
                    <th className="py-3.5 px-4">{t("tenants.old_tenant_name_col")}</th>
                    <th className="py-3.5 px-4">{t("tenants.col_phone_pdpa")}</th>
                    <th className="py-3.5 px-4">{t("tenants.rental_period_col")}</th>
                    <th className="py-3.5 px-4">{t("tenants.moved_out_date_col")}</th>
                    <th className="py-3.5 px-5 text-center w-24">{t("tenants.delete_record_col")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-650 dark:text-slate-300">
                  {filteredOld.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                      <td className="py-4 px-5 font-black text-slate-700 dark:text-slate-300 text-sm sm:text-base">
                        {t("billing.room_label").replace("{roomNumber}", tenant.roomNumber)}
                      </td>
                      <td className="py-4 px-4 font-extrabold text-slate-850 dark:text-slate-200">
                        <DynamicText>{tenant.fullName}</DynamicText>
                      </td>
                      <td className="py-4 px-4 font-semibold font-mono text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {getMaskedPhone(tenant.phone)}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono text-[11px]">
                            {formatDateThai(tenant.contractStart)} - {formatDateThai(tenant.contractEnd)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-bold text-rose-600 dark:text-rose-450">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="font-mono text-[11px]">
                            {formatDateThai(tenant.movedOutAt)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-center">
                        <button
                          onClick={() => {
                            if (!hasEditPermission) {
                              showToast(t("daily_bills.no_permission_msg"), "error")
                              return
                            }
                            setDeleteConfirmId(tenant.id)
                          }}
                          disabled={!hasEditPermission}
                          className={`p-1.5 rounded-lg transition-all inline-flex items-center justify-center border ${
                            hasEditPermission
                              ? "bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/20 dark:hover:bg-rose-900/35 dark:text-rose-400 active:scale-95 cursor-pointer border border-rose-100/30 dark:border-rose-900/20"
                              : "opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border-slate-200 dark:border-slate-800"
                          }`}
                          title={hasEditPermission ? t("tenants.delete_permanent_tooltip") : t("tenants.no_delete_permission_tooltip")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {filteredOld.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                        {t("tenants.no_old_tenants")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </>
      )}

      {/* Safety Notice Panel (PDPA Compliance & Security) */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/50 dark:border-slate-800/80 flex gap-3 items-start">
        <Lock className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("tenants.pdpa_notice_title")}</h4>
          <p className="text-[10px] md:text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            {t("tenants.pdpa_notice_desc")}
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
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">{t("tenants.confirm_delete_permanent_title")}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-450 leading-relaxed">
                  {t("tenants.confirm_delete_permanent_desc")}
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
                {t("common.cancel")}
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
                {t("tenants.confirm_delete_permanent_btn")}
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
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">{t("tenants.csv_error_title")}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t("tenants.csv_error_desc")}</p>
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
                {t("tenants.acknowledge_close_btn")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Template Download Guide Modal */}
      {isTemplateGuideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-850 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-6 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex gap-4 items-center">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl shrink-0 text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {t("tenants.csv_guide_modal_title")}
                  </h3>
                  <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 mt-1 font-semibold">
                    {t("tenants.csv_guide_modal_desc")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTemplateGuideModalOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-650 dark:hover:text-white transition-all cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-5 py-2">
              {/* Item 1 */}
              <div className="flex gap-4 items-start bg-slate-50/80 dark:bg-slate-900/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">
                    {t("tenants.csv_guide_item1_title")}
                  </h4>
                  <p className="text-sm md:text-base text-slate-700 dark:text-slate-200 leading-relaxed font-semibold">
                    {t("tenants.csv_guide_item1_desc")}
                  </p>
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex gap-4 items-start bg-slate-50/80 dark:bg-slate-900/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">
                    {t("tenants.csv_guide_item2_title")}
                  </h4>
                  <p className="text-sm md:text-base text-slate-700 dark:text-slate-200 leading-relaxed font-semibold">
                    {t("tenants.csv_guide_item2_desc")}
                  </p>
                </div>
              </div>

              {/* Item 3 - Warning */}
              <div className="flex gap-4 items-start bg-amber-50/50 dark:bg-amber-950/20 p-5 rounded-2xl border border-amber-100 dark:border-amber-900/40">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-xl text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-lg md:text-xl font-black text-amber-900 dark:text-amber-300">
                    {t("tenants.csv_guide_warning_title")}
                  </h4>
                  <p className="text-sm md:text-base text-amber-850 dark:text-amber-200 leading-relaxed font-semibold">
                    {t("tenants.csv_guide_warning_desc1")}
                  </p>
                  <p className="text-sm md:text-base text-amber-850 dark:text-amber-200 leading-relaxed font-semibold">
                    {t("tenants.csv_guide_warning_desc2")}
                  </p>
                  <p className="text-sm md:text-base text-amber-850 dark:text-amber-200 leading-relaxed font-semibold">
                    {t("tenants.csv_guide_warning_desc3")}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsTemplateGuideModalOpen(false)}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-base md:text-lg font-bold rounded-2xl shadow-lg hover:shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
              >
                {t("tenants.csv_guide_ack_btn")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Tenant Modal */}
      {isEditModalOpen && selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-2xl">
                  <Edit className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {t("tenants.edit_tenant_tooltip")}
                  </h3>
                  <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                    {t("billing.room_label").replace("{roomNumber}", selectedTenant.roomNumber)} • <DynamicText>{selectedTenant.fullName}</DynamicText>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsEditModalOpen(false)
                  setSelectedTenant(null)
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs md:text-sm font-semibold text-slate-750 dark:text-slate-300 block">
                  {t("tenants.full_name_label")}
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 text-sm md:text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none font-medium"
                  placeholder={t("tenants.full_name_placeholder")}
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs md:text-sm font-semibold text-slate-750 dark:text-slate-300 block">
                  {t("tenants.phone_label_tenant")}
                </label>
                <input
                  type="text"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 text-sm md:text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none font-mono font-semibold"
                  placeholder={t("tenants.phone_placeholder")}
                />
              </div>

              {/* Room Number — แสดงผลอย่างเดียว ย้ายห้องต้องใช้ปุ่ม "ย้ายห้อง" โดยเฉพาะ
                  (มีการเช็คห้องว่าง/ประวัติ/เงินประกัน/มิเตอร์/แจ้งเตือน LINE ที่ฟอร์มนี้ไม่รองรับ) */}
              <div className="space-y-1.5">
                <label className="text-xs md:text-sm font-semibold text-slate-750 dark:text-slate-300 block">
                  {t("tenants.room_number_label_full")}
                </label>
                <div className="w-full px-4 py-3 bg-slate-100/85 dark:bg-slate-950/45 border border-slate-200/50 dark:border-slate-800/80 rounded-xl text-slate-500 dark:text-slate-400 text-sm md:text-base font-mono font-semibold flex justify-between items-center">
                  <span>{t("billing.room_label").replace("{roomNumber}", editRoomNumber)}</span>
                  {isAdminOrSuper && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditModalOpen(false)
                        handleOpenTransferModal(selectedTenant)
                      }}
                      className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 text-xs md:text-sm font-extrabold underline underline-offset-2 cursor-pointer"
                    >
                      ต้องการย้ายห้อง?
                    </button>
                  )}
                </div>
              </div>

              {/* Date Start & End */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs md:text-sm font-semibold text-slate-750 dark:text-slate-300 block">
                    {t("tenants.lease_start_label")}
                  </label>
                  <input
                    type="date"
                    required
                    value={editContractStart}
                    onChange={(e) => setEditContractStart(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 text-sm md:text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none font-mono font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs md:text-sm font-semibold text-slate-750 dark:text-slate-300 block">
                    {t("tenants.lease_end_label")}
                  </label>
                  <input
                    type="date"
                    required
                    value={editContractEnd}
                    onChange={(e) => setEditContractEnd(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 text-sm md:text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none font-mono font-semibold"
                  />
                </div>
              </div>

              {/* LINE User ID */}
              <div className="space-y-1.5">
                <label className="text-xs md:text-sm font-semibold text-slate-750 dark:text-slate-300 block flex items-center justify-between">
                  <span>LINE User ID</span>
                  <span className="text-[10px] text-red-500 dark:text-red-400 font-bold uppercase tracking-wider">{t("tenants.line_locked_label")}</span>
                </label>
                <input
                  type="text"
                  disabled
                  value={editLineUserId || t("tenants.no_line_connection")}
                  className="w-full px-4 py-3 bg-slate-100/85 dark:bg-slate-950/45 border border-slate-200/50 dark:border-slate-800/80 rounded-xl text-slate-500 dark:text-slate-400 text-sm md:text-base outline-none font-mono cursor-not-allowed select-all"
                  placeholder={t("tenants.no_line_connection")}
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false)
                    setSelectedTenant(null)
                  }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs md:text-sm font-extrabold rounded-xl transition-all cursor-pointer"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs md:text-sm font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {editSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      {t("daily_bills.saving_btn")}
                    </>
                  ) : (
                    t("tenants.save_edit_btn")
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Room Transfer Modal */}
      {transferModalOpen && transferTenant && (
        <RoomTransferModal
          tenant={{
            id: transferTenant.id,
            roomNumber: transferTenant.roomNumber,
            fullName: transferTenant.fullName,
            depositPaid: transferTenant.depositPaid
          }}
          vacantRooms={vacantRoomsForTransfer.map(r => ({ id: r.id, roomNumber: r.roomNumber }))}
          onClose={() => {
            setTransferModalOpen(false)
            setTransferTenant(null)
          }}
          onSuccess={({ toRoomNumber }) => {
            setTransferModalOpen(false)
            setTransferTenant(null)
            showToast(`ย้ายห้องสำเร็จ! ย้ายไปห้อง ${toRoomNumber} เรียบร้อยแล้ว`, "success")
            loadData(true)
          }}
        />
      )}
    </div>
    </>
  )
}
