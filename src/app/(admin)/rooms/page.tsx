"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { 
  Home, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  AlertCircle, 
  HelpCircle,
  RefreshCw, 
  X, 
  Tag, 
  Settings, 
  Users, 
  Phone,
  CheckCircle2,
  DollarSign,
  Info,
  Copy,
  ExternalLink,
  Calendar,
  UserPlus,
  LogOut,
  Share2,
  ClipboardCheck,
  Building,
  ShieldCheck,
  AlertTriangle,
  LayoutGrid,
  List,
  Unlink,
  Download,
  Upload,
  Sparkles,
  Clock,
  Coins,
  Zap,
  Droplet,
  ArrowRightLeft
} from "lucide-react"
import RoomTransferModal from "@/features/tenant/components/RoomTransferModal"
import { 
  getRooms, 
  createRoom, 
  updateRoom, 
  deleteRoom,
  getRoomTypes,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  migrateRoomTypeDeposits,
  importRoomsFromCSV,
  createRoomsBatch
} from "@/features/room/actions"
import { getBuildings, createBuilding, updateBuilding, deleteBuilding } from "@/features/building/actions"
import {
  buildBuildingNameMap,
  matchBuildingByName,
  collectUnmatchedBuildingNames,
  normalizeBuildingName,
  type BuildingMappingRow
} from "@/features/building/utils"
import { 
  createTenant, 
  deleteTenant, 
  updateTenant,
  getCancelledContracts,
  saveCancelledContract,
  deleteCancelledContract,
  migrateLocalStorageCancelledContracts,
  disconnectLine,
  lazyCleanupPastDueTenants
} from "@/features/tenant/actions"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { getFinanceSettings, type FinanceSettings } from "@/features/finance/actions"
import { calculateDepositProration, checkIfBreakContract, computeStandardDeposit } from "@/features/room/deposit-calculator"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { DEFAULT_STAFF_PERMISSIONS } from "@/features/permissions/types"
import { packWorkspaceAndRoom } from "@/lib/urlPacker"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { DynamicText } from "@/lib/translations/DynamicText"

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

interface RoomItem {
  id: string
  roomNumber: string
  floor?: string
  status: "occupied" | "available" | "Pending_Refund"
  baseRent: number
  tenantId?: string | null
  tenantName: string | null
  tenantPhone: string | null
  lineUserId?: string | null
  leaseStart?: string | null
  leaseEnd?: string | null
  roomTypeId: string | null
  roomTypeName: string
  waiveElectricMin?: boolean
  waiveWaterMin?: boolean
  extraExpenses?: { name: string; amount: number }[]
  depositPaid?: number | null
  buildingId?: string | null
}

interface RoomTypeItem {
  id: string
  name: string
  default_rent: number
}

export default function RoomsPage() {
  return (
    <Suspense fallback={
      <div className="py-32 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span>กำลังเปิดหน้าจัดการห้องพักและผู้เช่า...</span>
      </div>
    }>
      <RoomsContent />
    </Suspense>
  )
}

interface CsvRoomItem {
  roomNumber: string
  floor: string
  csvTypeName: string
  roomTypeId: string
  baseRent: number
  /** ชื่ออาคารตามที่เขียนมาในไฟล์ (คงรูปเดิมไว้ ใช้จับคู่กับอาคารในระบบทีหลัง) */
  csvBuildingName: string
  /** อาคารที่จับคู่ได้ทันทีจากชื่อ ("" = ต้องให้ผู้ใช้เลือกในหน้าต่างจับคู่) */
  buildingId: string
}

function RoomsContent() {
  const { t, locale } = useLanguage()
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const fetchCounterRef = useRef(0)
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [roomTypes, setRoomTypes] = useState<RoomTypeItem[]>([])
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings | null>(null)
  const [roomTypeDeposits, setRoomTypeDeposits] = useState<{ [roomTypeId: string]: number }>({})
  const [cancelledContracts, setCancelledContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasEditPermission, setHasEditPermission] = useState(true)
  // ย้ายห้องจำกัดสิทธิ์เฉพาะ Admin/Super Admin เท่านั้น (เข้มกว่า hasEditPermission ทั่วไป เพราะแตะเงินประกัน)
  const [isAdminOrSuper, setIsAdminOrSuper] = useState(false)
  const [transferModalOpen, setTransferModalOpen] = useState(false)

  // CSV Import States
  const [autoMappedRooms, setAutoMappedRooms] = useState<CsvRoomItem[]>([])
  const [csvRooms, setCsvRooms] = useState<CsvRoomItem[]>([])
  const [isCsvMappingModalOpen, setIsCsvMappingModalOpen] = useState(false)
  // ชื่ออาคารในไฟล์ที่จับคู่กับอาคารในระบบไม่ได้ — รวบเป็นรายการละ 1 ชื่อ ไม่ใช่รายละแถว
  // (ไฟล์ 40 แถวที่เขียนชื่อเดียวกัน ผู้ใช้ควรเลือกครั้งเดียว)
  const [csvBuildingMappings, setCsvBuildingMappings] = useState<BuildingMappingRow[]>([])
  const [isRoomTemplateGuideModalOpen, setIsRoomTemplateGuideModalOpen] = useState(false)
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [mappingSubmitting, setMappingSubmitting] = useState(false)
  
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
        console.error("Failed to check permissions in rooms page", err)
      }
    }
    checkPermissions()
  }, [])
  
  const [search, setSearch] = useState("")
  const searchParams = useSearchParams()
  const initialFilter = searchParams.get("filter")
  const [filter, setFilter] = useState<"all" | "available" | "waiting" | "occupied" | "has_tenant">(
    initialFilter === "available" || initialFilter === "waiting" || initialFilter === "occupied" || initialFilter === "has_tenant"
      ? initialFilter
      : "all"
  )

  useEffect(() => {
    const f = searchParams.get("filter")
    if (f === "available" || f === "waiting" || f === "occupied" || f === "has_tenant") {
      setFilter(f)
    } else if (f === "all") {
      setFilter("all")
    }
  }, [searchParams])

  const [viewMode, setViewMode] = useState<"floor" | "table">("floor")
  
  // Modals Control
  const [modalOpen, setModalOpen] = useState(false) // Room Modal
  const [typesModalOpen, setTypesModalOpen] = useState(false) // Room Types Modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false) // Confirm Delete
  
  // Unified Tenant Modals
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [contractSuccess, setContractSuccess] = useState(false)
  const [tenantDetailModalOpen, setTenantDetailModalOpen] = useState(false)
  const [lineLinkModalOpen, setLineLinkModalOpen] = useState(false)
  const [lineDisconnectConfirmOpen, setLineDisconnectConfirmOpen] = useState(false)
  const [disconnectSubmitting, setDisconnectSubmitting] = useState(false)
  
  const [selectedRoom, setSelectedRoom] = useState<RoomItem | null>(null)
  const [workspaceLiffId, setWorkspaceLiffId] = useState("2010442620-H4josaDy")
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    type: "room" | "type" | "tenant"
    name: string
    extraId?: string // used for tenant roomNumber
  } | null>(null)
  
  // Room Form State
  const [editingRoom, setEditingRoom] = useState<RoomItem | null>(null)
  const [newRoomNumber, setNewRoomNumber] = useState("")
  const [newRoomFloor, setNewRoomFloor] = useState("")
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState("")
  const [newBaseRent, setNewBaseRent] = useState<number | string>("")
  const [waiveElectricMin, setWaiveElectricMin] = useState(false)
  const [waiveWaterMin, setWaiveWaterMin] = useState(false)
  const [extraExpenses, setExtraExpenses] = useState<{ name: string; amount: number }[]>([])
  const [newRoomBuildingId, setNewRoomBuildingId] = useState("")
  const [buildings, setBuildings] = useState<{ id: string; name: string; code?: string | null; address?: string | null }[]>([])
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [roomFormError, setRoomFormError] = useState<string | null>(null)

  // จัดการอาคาร (ย้ายมาจากหน้าตั้งค่าคุณสมบัติ — ผูกกับหน้าจัดการห้องพักโดยตรงเพราะเป็นข้อมูลที่ใช้กำหนดห้องพักในหน้านี้)
  const [buildingsModalOpen, setBuildingsModalOpen] = useState(false)
  const [buildingsLoading, setBuildingsLoading] = useState(false)
  const [buildingFilter, setBuildingFilter] = useState<string>("all")
  const [newBuildingName, setNewBuildingName] = useState("")
  const [newBuildingCode, setNewBuildingCode] = useState("")
  const [newBuildingAddress, setNewBuildingAddress] = useState("")
  const [buildingSubmitting, setBuildingSubmitting] = useState(false)
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null)
  const [editingBuildingName, setEditingBuildingName] = useState("")
  const [editingBuildingCode, setEditingBuildingCode] = useState("")
  const [editingBuildingAddress, setEditingBuildingAddress] = useState("")

  // Room Type Form State (inside Manage Types modal)
  const [newTypeName, setNewTypeName] = useState("")
  const [newTypeRent, setNewTypeRent] = useState(4000)
  const [editingType, setEditingType] = useState<RoomTypeItem | null>(null)
  const [typeSubmitting, setTypeSubmitting] = useState(false)

  // Contract Form State
  const [tenantNameInput, setTenantNameInput] = useState("")
  const [tenantPhoneInput, setTenantPhoneInput] = useState("")
  const [contractStartInput, setContractStartInput] = useState("")
  const [contractEndInput, setContractEndInput] = useState("")
  const [contractSubmitting, setContractSubmitting] = useState(false)
  
  // Checkout (Move-out) Form State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false)
  const [checkoutDate, setCheckoutDate] = useState("")
  const [checkoutDeposit, setCheckoutDeposit] = useState<number>(0)
  const [checkoutRefund, setCheckoutRefund] = useState<number>(0)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false)

  // States for Task 3: Refund Process Page/Modal
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [refundingRoom, setRefundingRoom] = useState<RoomItem | null>(null)
  const [loadingMeter, setLoadingMeter] = useState(false)
  const [refundCheckoutDate, setRefundCheckoutDate] = useState("")
  const [refundDeposit, setRefundDeposit] = useState(0)
  const [finalElec, setFinalElec] = useState<number | string>("")
  const [finalWater, setFinalWater] = useState<number | string>("")
  const [prevElec, setPrevElec] = useState(0)
  const [prevWater, setPrevWater] = useState(0)
  const [isRentWaived, setIsRentWaived] = useState(false)
  const [customDeductions, setCustomDeductions] = useState<{ id: string; name: string; amount: number | string }[]>([
    { id: "1", name: "ค่าล้างแอร์", amount: 500 }
  ])
  const [refundError, setRefundError] = useState<string | null>(null)
  const [refundSubmitting, setRefundSubmitting] = useState(false)
  const [editingCancelledContractId, setEditingCancelledContractId] = useState<string | null>(null)
  const [historicalRentDeduction, setHistoricalRentDeduction] = useState<number | "">(0)
  const [historicalUtilitiesDeduction, setHistoricalUtilitiesDeduction] = useState<number | "">(0)
  const [isHistoricalBreach, setIsHistoricalBreach] = useState<boolean>(false)

  // Tenant Editing Form State
  const [isEditingTenant, setIsEditingTenant] = useState(false)
  const [editTenantName, setEditTenantName] = useState("")
  const [editTenantPhone, setEditTenantPhone] = useState("")
  const [editLeaseStart, setEditLeaseStart] = useState("")
  const [editLeaseEnd, setEditLeaseEnd] = useState("")
  const [editTenantSubmitting, setEditTenantSubmitting] = useState(false)
  const [editTenantError, setEditTenantError] = useState<string | null>(null)



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

  // CSV Import/Export States
  const [uploadingCsv, setUploadingCsv] = useState(false)

  // ฟังก์ชันดาวน์โหลด CSV Template พร้อมใส่ข้อมูลตัวอย่างจริงใน Workspace นำทาง
  const handleDownloadTemplate = () => {
    try {
      const sampleTypeName = roomTypes[0]?.name || (locale === "th" ? "แอร์" : "Air Conditioner")
      // ใส่คอลัมน์ building_name เฉพาะหอที่มีมากกว่า 1 อาคาร — หออาคารเดียวไม่ต้องกรอกอยู่แล้ว
      // ระบบใส่อาคารนั้นให้อัตโนมัติ ใส่คอลัมน์ไปก็มีแต่จะทำให้เข้าใจผิดว่าต้องกรอก
      const isMultiBuilding = buildings.length > 1
      // ใช้ชื่ออาคารจริงในระบบเป็นตัวอย่าง ผู้ใช้จะได้เห็นว่าต้องสะกดแบบไหนถึงจะตรง
      const sampleBuildingA = buildings[0]?.name || ""
      const sampleBuildingB = buildings[1]?.name || sampleBuildingA

      const headers = isMultiBuilding
        ? "room_number,room_type_name,floor,building_name"
        : "room_number,room_type_name,floor"
      const rows = isMultiBuilding
        ? [
            `101,${sampleTypeName},1,${sampleBuildingA}`,
            `102,${sampleTypeName},1,${sampleBuildingA}`,
            `201,${sampleTypeName},2,${sampleBuildingB}`,
            `202,${sampleTypeName},2,${sampleBuildingB}`
          ]
        : [
            `101,${sampleTypeName},1`,
            `102,${sampleTypeName},1`,
            `201,${sampleTypeName},2`,
            `202,${sampleTypeName},2`
          ]
      
      const csvContent = "\ufeff" + [headers, ...rows].join("\n") // มี BOM เพื่อให้เปิดใน Excel สระภาษาไทยแสดงถูกต้องไม่เพี้ยน
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.setAttribute("href", url)
      link.setAttribute("download", "rooms_template.csv")
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      showToast(t("rooms.toasts.download_template_success"), "success")
      
      // แสดงข้อความแจ้งเตือนคำแนะนำเรื่องการกรอก room_type_name เพื่อป้องกันข้อผิดพลาด
      setTimeout(() => {
        setIsRoomTemplateGuideModalOpen(true)
      }, 500)
    } catch (err: any) {
      showToast(t("rooms.toasts.download_template_error"), "error")
    }
  }

  // ฟังก์ชันอัปโหลดไฟล์ CSV และอ่านข้อมูลนำทางมาจับคู่ที่หน้าบ้าน (Interactive Mapping)
  const handleUploadCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith(".csv")) {
      showToast(t("rooms.toasts.upload_csv_only"), "error")
      e.target.value = ""
      return
    }

    setUploadingCsv(true)
    setMappingError(null)
    const wsId = getCookie("horset_current_workspace_id") || ""

    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const text = event.target?.result as string
        if (!text) {
          showToast(t("rooms.toasts.read_csv_error"), "error")
          setUploadingCsv(false)
          return
        }

        // แปลงไฟล์ CSV เป็นอาร์เรย์แถวแบบ Client-side
        const lines = text.split(/\r?\n/)
        const rows: string[][] = []
        for (const line of lines) {
          if (!line.trim()) continue
          const row = line.split(",").map(val => val.trim().replace(/^["']|["']$/g, ""))
          rows.push(row)
        }

        if (rows.length < 2) {
          showToast(t("rooms.toasts.csv_invalid_structure"), "error")
          setUploadingCsv(false)
          return
        }

        const headers = rows[0].map(h => h.toLowerCase().trim())
        const roomNumIdx = headers.indexOf("room_number")
        const typeNameIdx = headers.indexOf("room_type_name")
        const floorIdx = headers.indexOf("floor")
        const buildingNameIdx = headers.indexOf("building_name")

        if (roomNumIdx === -1 || typeNameIdx === -1) {
          showToast(t("rooms.toasts.csv_invalid_headers"), "error")
          setUploadingCsv(false)
          return
        }

        const validRooms: CsvRoomItem[] = []
        const invalidRooms: CsvRoomItem[] = []

        const typeMap = new Map<string, RoomTypeItem>()
        roomTypes.forEach(rt => {
          typeMap.set(rt.name.trim().toLowerCase(), rt)
        })

        // หอที่มีอาคารเดียวไม่ต้องสนคอลัมน์ building_name เลย ใส่อาคารนั้นให้ทุกห้อง
        // (ไฟล์ CSV เก่าที่ไม่มีคอลัมน์นี้จึงยังใช้ได้เหมือนเดิม ไม่มีหน้าต่างจับคู่มากวน)
        const singleBuildingId = buildings.length === 1 ? buildings[0].id : ""
        const buildingNameMap = buildBuildingNameMap(buildings)

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (row.length <= Math.max(roomNumIdx, typeNameIdx)) continue

          const roomNumber = row[roomNumIdx]?.trim()
          const csvTypeName = row[typeNameIdx]?.trim() || ""

          if (!roomNumber) continue

          // ตรวจสอบชั้น (floor) จากคอลัมน์ หรือเดาเลขชั้นโดยดูจากตัวเลขแรกของห้องพัก
          let floor = ""
          if (floorIdx !== -1 && row[floorIdx]?.trim()) {
            floor = row[floorIdx].trim()
          } else {
            const numMatch = roomNumber.match(/^(\d+)/)
            if (numMatch) {
              const numStr = numMatch[1]
              if (numStr.length === 3) {
                floor = numStr.substring(0, 1)
              } else if (numStr.length === 4) {
                floor = numStr.substring(0, 2)
              }
            }
          }

          const matchedType = typeMap.get(csvTypeName.toLowerCase())

          const csvBuildingName = buildingNameIdx !== -1 ? (row[buildingNameIdx]?.trim() || "") : ""
          // อาคารเดียว = ใช้อาคารนั้นเสมอ | หลายอาคาร = เทียบชื่อตรงตัว ไม่ตรงก็ปล่อยว่างให้ผู้ใช้เลือก
          const matchedBuilding = singleBuildingId
            ? null
            : matchBuildingByName(csvBuildingName, buildingNameMap)

          const item: CsvRoomItem = {
            roomNumber,
            floor,
            csvTypeName,
            roomTypeId: matchedType ? matchedType.id : "",
            baseRent: matchedType ? Number(matchedType.default_rent || 0) : 0,
            csvBuildingName,
            buildingId: singleBuildingId || matchedBuilding?.id || ""
          }

          if (matchedType) {
            validRooms.push(item)
          } else {
            invalidRooms.push(item)
          }
        }

        if (validRooms.length === 0 && invalidRooms.length === 0) {
          showToast(t("rooms.toasts.csv_no_rooms"), "error")
          setUploadingCsv(false)
          return
        }

        // ชื่ออาคารที่จับคู่ไม่ได้ นับจากทุกแถว (ทั้งแถวที่ประเภทห้องตรงและไม่ตรง)
        const buildingMappings = collectUnmatchedBuildingNames([...validRooms, ...invalidRooms])

        // กรณีที่ 1: ไม่มีอะไรต้องให้ผู้ใช้จับคู่เลย (ประเภทห้องตรงหมด และอาคารตรงหมด) นำเข้าทันที
        if (invalidRooms.length === 0 && buildingMappings.length === 0) {
          const roomsPayload = validRooms.map(r => ({
            room_number: r.roomNumber,
            room_type_id: r.roomTypeId,
            base_rent: r.baseRent,
            status: "available" as const,
            floor: r.floor || null,
            workspace_id: wsId,
            building_id: r.buildingId || null
          }))

          try {
            const res = await createRoomsBatch(roomsPayload)
            if (res.success) {
              showToast(t("rooms.toasts.import_success").replace("{count}", String(res.count)), "success")
              await loadData(true)
            } else {
              showToast(res.error || t("rooms.toasts.save_error"), "error")
            }
          } catch (err: any) {
            showToast(err?.message || t("rooms.toasts.db_save_error"), "error")
          } finally {
            setUploadingCsv(false)
          }
          return;
        }

        // กรณีที่ 2: มีอะไรต้องจับคู่ -> เก็บห้องที่ประเภทถูกต้องใน autoMappedRooms, ห้องที่ประเภทไม่ตรงใน csvRooms
        // และชื่ออาคารที่ไม่ตรงใน csvBuildingMappings แล้วเปิด Modal ให้จับคู่ทีเดียวจบ
        setAutoMappedRooms(validRooms)
        setCsvRooms(invalidRooms)
        setCsvBuildingMappings(buildingMappings)
        setIsCsvMappingModalOpen(true)
        setUploadingCsv(false)
      }
      reader.readAsText(file, "UTF-8")
    } catch (err: any) {
      showToast(t("rooms.toasts.system_csv_error"), "error")
      setUploadingCsv(false)
    } finally {
      e.target.value = ""
    }
  }

  // ฟังก์ชันบันทึกข้อมูลนำเข้าหลังจากการจับคู่ประเภทห้องพักเรียบร้อยแล้ว (บันทึกรวมห้องดี + ห้องที่ถูกแก้ไข)
  const handleConfirmImport = async () => {
    setMappingSubmitting(true)
    setMappingError(null)

    // ตรวจสอบว่าห้องที่มีปัญหาทั้งหมดได้รับการเลือกประเภทห้องเรียบร้อยแล้วหรือยัง
    const unmappedRoom = csvRooms.find(r => !r.roomTypeId)
    if (unmappedRoom) {
      setMappingError(t("rooms.toasts.mapping_select_type").replace("{roomNumber}", unmappedRoom.roomNumber))
      setMappingSubmitting(false)
      return
    }

    // ชื่ออาคารทุกชื่อที่จับคู่ไม่ได้ ต้องถูกเลือกให้ครบก่อน ไม่ปล่อยให้ห้องเข้าไปแบบไม่มีอาคาร
    // (ห้องที่ไม่มี building_id จะหลุดจากตัวกรองอาคาร และคิดค่าน้ำ-ไฟแบบหารตามสัดส่วนทั้งอาคารไม่ได้)
    const unmappedBuilding = csvBuildingMappings.find(m => !m.buildingId)
    if (unmappedBuilding) {
      setMappingError(
        t("rooms.toasts.mapping_select_building").replace(
          "{buildingName}",
          unmappedBuilding.csvName || t("rooms.csv_building_blank")
        )
      )
      setMappingSubmitting(false)
      return
    }

    const wsId = getCookie("horset_current_workspace_id") || ""

    // แปลงชื่ออาคารที่ผู้ใช้จับคู่ไว้ ให้เป็นดัชนีสำหรับเติมกลับเข้าแต่ละแถว
    const mappedBuildingByName = new Map(
      csvBuildingMappings.map(m => [normalizeBuildingName(m.csvName), m.buildingId])
    )

    // รวมทั้งชุดข้อมูลที่ดีอยู่แล้ว และชุดข้อมูลที่ได้รับการแก้ไขแมปเสร็จสิ้นจากในโมดอลป๊อปอัป
    const allRooms = [...autoMappedRooms, ...csvRooms]

    const roomsPayload = allRooms.map(r => ({
      room_number: r.roomNumber,
      room_type_id: r.roomTypeId,
      base_rent: r.baseRent,
      status: "available" as const,
      floor: r.floor || null,
      workspace_id: wsId,
      // ถ้าจับคู่ได้ตรง ๆ ตอนอ่านไฟล์ก็ใช้ค่านั้น ไม่งั้นเอาจากที่ผู้ใช้เลือกในหน้าต่างจับคู่
      building_id: r.buildingId || mappedBuildingByName.get(normalizeBuildingName(r.csvBuildingName)) || null
    }))

    try {
      const res = await createRoomsBatch(roomsPayload)
      if (res.success) {
        showToast(t("rooms.toasts.import_success").replace("{count}", String(res.count)), "success")
        setIsCsvMappingModalOpen(false)
        setCsvRooms([])
        setAutoMappedRooms([])
        setCsvBuildingMappings([])
        await loadData(true) // โหลดข้อมูลห้องใหม่และล้างแคช
      } else {
        setMappingError(res.error || t("rooms.toasts.db_save_error"))
      }
    } catch (err: any) {
      setMappingError(err?.message || t("rooms.toasts.save_error"))
    } finally {
      setMappingSubmitting(false)
    }
  }

  // โหลดข้อมูลทั้งหมดจาก Supabase ร่วมกับการใช้งาน Cache ความเร็วสูง
  // โหลดข้อมูลทั้งหมดจาก Supabase ร่วมกับการใช้งาน Cache ความเร็วสูง
  const loadData = async (forceRefresh = false) => {
    const currentFetchId = ++fetchCounterRef.current
    setLoading(true)
    setError(null)
    try {
      const wsId = getCookie("horset_current_workspace_id") || ""
      
      // ดึงข้อมูล LIFF ID ไดนามิกของ Workspace นี้
      fetch(`/api/workspace-liff?workspace_id=${wsId}`)
        .then(res => res.json())
        .then(data => {
          if (currentFetchId !== fetchCounterRef.current) return
          if (data.success && data.liffId) {
            setWorkspaceLiffId(data.liffId)
          }
        })
        .catch(err => console.error("Failed to load workspace LIFF ID:", err))
      
      // โหลดข้อมูลประวัติยกเลิกสัญญาจาก Supabase และย้ายข้อมูลจาก localStorage หากมีอยู่
      let tempCancellations: any[] = []
      let hasLocalCancellations = false
      if (typeof window !== "undefined") {
        try {
          const savedCancellations = localStorage.getItem(`cancelled_contracts_${wsId}`)
          if (savedCancellations) {
            tempCancellations = JSON.parse(savedCancellations)
            hasLocalCancellations = true
          }
        } catch (e) {
          console.error("Failed to parse saved cancellations from localStorage", e)
        }
      }

      let cachedCancellations = forceRefresh ? null : getCachedData(wsId, "cancelled_contracts")
      let loadedCancellations: any[] = []
      
      if (cachedCancellations) {
        loadedCancellations = cachedCancellations
        setCancelledContracts(loadedCancellations)
      } else {
        if (hasLocalCancellations && tempCancellations.length > 0) {
          // ย้ายข้อมูลไปยัง Supabase
          const migrated = await migrateLocalStorageCancelledContracts(wsId, tempCancellations)
          if (currentFetchId !== fetchCounterRef.current) return
          if (migrated.success) {
            localStorage.removeItem(`cancelled_contracts_${wsId}`)
            console.log("Successfully migrated cancelled contracts to Supabase and deleted local storage cache")
            const res = await getCancelledContracts(wsId)
            if (currentFetchId !== fetchCounterRef.current) return
            if (res.success && res.data) {
              loadedCancellations = res.data
            }
          } else if (migrated.error === "table_not_found") {
            loadedCancellations = tempCancellations
            console.warn("Table 'cancelled_contracts' not found in database. Local data kept in memory.")
          }
        } else {
          const res = await getCancelledContracts(wsId)
          if (currentFetchId !== fetchCounterRef.current) return
          if (res.success && res.data) {
            loadedCancellations = res.data
          } else if (res.error === "table_not_found") {
            console.warn("Table 'cancelled_contracts' not found in database. History list is empty.")
            loadedCancellations = []
          }
        }
        setCancelledContracts(loadedCancellations)
        if (wsId) setCachedData(wsId, "cancelled_contracts", loadedCancellations)
      }

      // ดึงข้อมูลตั้งค่าการเงินและบัญชีรับเงิน (เพื่อใช้แสดงค่ามัดจำ/ค่าเช่าล่วงหน้าในโมดอลลิงก์)
      getFinanceSettings(wsId).then(res => {
        if (currentFetchId !== fetchCounterRef.current) return
        if (res.success && res.data) {
          setFinanceSettings(res.data)
        }
      })

      // ดึงรายชื่ออาคาร (ใช้กับดรอปดาวน์เลือกอาคารในฟอร์มห้องพัก และหน้าจัดการอาคารในโมดอลนี้)
      getBuildings(wsId).then(res => {
        if (currentFetchId !== fetchCounterRef.current) return
        if (res.success && res.data) {
          setBuildings(res.data.map(b => ({ id: b.id, name: b.name, code: b.code, address: b.address })))
        }
      })

      if (forceRefresh && wsId) {
        clearWorkspaceCache(wsId)
      }

      // ดึงข้อมูลจาก In-Memory Cache เพื่อความเร็วระดับ 0ms และป้องกันการยุ่งเกี่ยวกับ local storage
      let cachedRooms = forceRefresh ? null : getCachedData(wsId, "rooms")
      let cachedTypes = forceRefresh ? null : getCachedData(wsId, "room_types")

      let roomsData: RoomItem[] = []
      let typesData: RoomTypeItem[] = []

      if (cachedRooms && cachedTypes) {
        roomsData = cachedRooms
        typesData = cachedTypes
        setRooms(roomsData)
        setRoomTypes(typesData)
      } else {
        const [roomsRes, typesRes] = await Promise.all([getRooms(wsId), getRoomTypes(wsId)])
        
        if (currentFetchId !== fetchCounterRef.current) return

        if (roomsRes.success && roomsRes.data) {
          roomsData = roomsRes.data as RoomItem[]
          setRooms(roomsData)
          if (wsId) setCachedData(wsId, "rooms", roomsData)
        } else {
          setError(roomsRes.error || "ไม่สามารถโหลดข้อมูลห้องพักได้")
        }
        
        if (typesRes.success && typesRes.data) {
          typesData = typesRes.data as RoomTypeItem[]
          setRoomTypes(typesData)
          if (wsId) setCachedData(wsId, "room_types", typesData)
        }
      }

      // LAZY CLEANUP: เรียกทำงานเบื้องหลัง (fire-and-forget) ไม่บล็อกการโหลดหน้าหลัก
      if (roomsData.length > 0 && wsId) {
        lazyCleanupPastDueTenants(wsId).then(cleanupRes => {
          if (currentFetchId !== fetchCounterRef.current) return
          if (cleanupRes.success && cleanupRes.count && cleanupRes.count > 0) {
            console.log(`Lazy cleanup success: Removed ${cleanupRes.count} past-due tenants server-side. Refreshing view in background...`)
            clearWorkspaceCache(wsId)
            Promise.all([getRooms(wsId), getRoomTypes(wsId)]).then(([roomsResNew, typesResNew]) => {
              if (currentFetchId !== fetchCounterRef.current) return
              if (roomsResNew.success && roomsResNew.data) {
                const finalRooms = roomsResNew.data as RoomItem[]
                setRooms(finalRooms)
                setCachedData(wsId, "rooms", finalRooms)
              }
              if (typesResNew.success && typesResNew.data) {
                const finalTypes = typesResNew.data as RoomTypeItem[]
                setRoomTypes(finalTypes)
                setCachedData(wsId, "room_types", finalTypes)
              }
            }).catch(err => console.error("Refreshing rooms after lazy cleanup failed:", err))
          }
        }).catch(err => console.error("Lazy cleanup failed:", err))
      }
    } catch (err) {
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูลระบบห้องพัก")
    } finally {
      if (currentFetchId === fetchCounterRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // ซิงค์ค่ามัดจำ/เงินประกันแยกตามประเภทห้องจาก Database และย้ายข้อมูลหากยังมีใน Local Storage
  useEffect(() => {
    const wsId = getCookie("horset_current_workspace_id") || ""
    let localRtDeposits: { [key: string]: number } = {}
    let hasLocalSaved = false
    if (typeof window !== "undefined") {
      try {
        const localSaved = localStorage.getItem(`room_type_deposits_${wsId}`)
        if (localSaved) {
          localRtDeposits = JSON.parse(localSaved)
          hasLocalSaved = true
        }
      } catch (e) {
        console.error("Failed to parse local room type deposits", e)
      }
    }
    
    if (hasLocalSaved && Object.keys(localRtDeposits).length > 0) {
      migrateRoomTypeDeposits(wsId, localRtDeposits).then(migrated => {
        if (migrated.success) {
          localStorage.removeItem(`room_type_deposits_${wsId}`)
          console.log("Successfully migrated room type deposits to Supabase and deleted local storage cache")
        }
      })
    }

    // สร้างข้อมูลเงินประกันจาก DB เท่านั้น
    const dbDeposits: { [key: string]: number } = {}
    roomTypes.forEach((rt: any) => {
      if (rt.deposit_amount !== undefined && rt.deposit_amount !== null) {
        dbDeposits[rt.id] = rt.deposit_amount
      } else {
        dbDeposits[rt.id] = localRtDeposits[rt.id] || (financeSettings?.deposit_amount || 5000)
      }
    })
    
    setRoomTypeDeposits(dbDeposits)
  }, [roomTypes, financeSettings])

  // สลับประเภทห้องในหน้าจอฟอร์มห้องพัก -> ดึงราคาอัตโนมัติ
  const handleRoomTypeChange = (typeId: string) => {
    setSelectedRoomTypeId(typeId)
    const matchedType = roomTypes.find(t => t.id === typeId)
    if (matchedType) {
      setNewBaseRent(matchedType.default_rent)
    } else {
      setNewBaseRent("")
    }
  }

  // เปิดแบบฟอร์มสำหรับเพิ่มห้องใหม่
  const handleAddClick = () => {
    setEditingRoom(null)
    setNewRoomNumber("")
    setNewRoomFloor("")
    setSelectedRoomTypeId("")
    setNewBaseRent("")
    setWaiveElectricMin(false)
    setWaiveWaterMin(false)
    setExtraExpenses([])
    setNewRoomBuildingId(buildings.length > 0 ? buildings[0].id : "")

    // ตั้งค่าประเภทห้องแรกเป็นดีฟอลต์ถ้ามี
    if (roomTypes.length > 0) {
      setSelectedRoomTypeId(roomTypes[0].id)
      setNewBaseRent(roomTypes[0].default_rent)
    }
    setRoomFormError(null)
    setModalOpen(true)
  }

  // เปิดแบบฟอร์มสำหรับแก้ไขห้องเดิม
  const handleEditClick = (room: RoomItem) => {
    setEditingRoom(room)
    setNewRoomNumber(room.roomNumber)
    setNewRoomFloor(room.floor || "")
    setSelectedRoomTypeId(room.roomTypeId || "")
    setNewBaseRent(room.baseRent)
    setWaiveElectricMin(!!room.waiveElectricMin)
    setWaiveWaterMin(!!room.waiveWaterMin)
    setExtraExpenses(room.extraExpenses || [])
    setNewRoomBuildingId(room.buildingId || (buildings.length > 0 ? buildings[0].id : ""))
    setRoomFormError(null)
    setModalOpen(true)
  }

  // ทริกเกอร์ลบห้องพัก (เปิด Custom Modal)
  const handleDeleteRoomTrigger = (id: string, roomNum: string) => {
    setDeleteTarget({ id, type: "room", name: `ห้องพักหมายเลข ${roomNum}` })
    setDeleteConfirmOpen(true)
  }

  // ทริกเกอร์ลบประเภทห้องพัก (เปิด Custom Modal)
  const handleDeleteTypeTrigger = (id: string, name: string) => {
    setDeleteTarget({ id, type: "type", name: `ประเภทห้อง "${name}"` })
    setDeleteConfirmOpen(true)
  }

  // การดำเนินการลบจริงหลังกดยืนยันใน Custom Modal
  const handleConfirmDelete = async () => {
    if (!hasEditPermission) {
      showToast(t("rooms.toasts.permission_denied"), "error")
      return
    }
    if (!deleteTarget) return
    setLoading(true)
    setDeleteConfirmOpen(false)
    
    if (deleteTarget.type === "room") {
      const res = await deleteRoom(deleteTarget.id)
      if (res.success) {
        showToast(t("rooms.toasts.delete_room_success"), "success")
        await loadData(true) // รีเฟรชข้อมูลและเคลียร์แคช
      } else {
        showToast(res.error || t("rooms.toasts.delete_room_error"), "error")
        setLoading(false)
      }
    } else if (deleteTarget.type === "type") {
      setTypeSubmitting(true)
      const res = await deleteRoomType(deleteTarget.id)
      if (res.success) {
        const wsId = getCookie("horset_current_workspace_id") || ""
        clearWorkspaceCache(wsId)
        showToast(t("rooms.toasts.delete_type_success"), "success")
        const typesRes = await getRoomTypes(wsId)
        if (typesRes.success && typesRes.data) {
          const typesData = typesRes.data as RoomTypeItem[]
          setRoomTypes(typesData)
          setCachedData(wsId, "room_types", typesData)
        }
      } else {
        showToast(res.error || t("rooms.toasts.delete_type_error"), "error")
      }
      setTypeSubmitting(false)
      setLoading(false)
    } else if (deleteTarget.type === "tenant") {
      const res = await deleteTenant(deleteTarget.id, deleteTarget.extraId || "")
      if (res.success) {
        showToast(t("rooms.toasts.checkout_success_return_vacant").replace("{roomNumber}", deleteTarget.extraId || ""), "success")
        setTenantDetailModalOpen(false)
        await loadData(true)
      } else {
        showToast(res.error || t("rooms.toasts.cancel_contract_error"), "error")
        setLoading(false)
      }
    }
    setDeleteTarget(null)
  }

  // การส่งแบบฟอร์มบันทึกห้องพัก (เพิ่ม / แก้ไข)
  const handleSubmitRoomForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasEditPermission) {
      showToast(t("rooms.toasts.permission_denied"), "error")
      return
    }
    if (!newRoomNumber) return
    setFormSubmitting(true)
    setRoomFormError(null)

    if (editingRoom) {
      // แก้ไขห้องพักเดิม
      const res = await updateRoom(
        editingRoom.id,
        newRoomNumber,
        selectedRoomTypeId,
        Number(newBaseRent),
        editingRoom.status,
        newRoomFloor,
        waiveElectricMin,
        waiveWaterMin,
        extraExpenses,
        newRoomBuildingId || undefined
      )
      if (res.success) {
        showToast(t("rooms.toasts.update_room_success"), "success")
        await loadData(true) // เคลียร์แคชและดึงข้อมูลใหม่
        setModalOpen(false)
      } else {
        setRoomFormError(res.error || t("rooms.toasts.update_room_error"))
      }
    } else {
      // เพิ่มห้องพักใหม่
      const res = await createRoom(newRoomNumber, selectedRoomTypeId, Number(newBaseRent), newRoomFloor, extraExpenses, newRoomBuildingId || undefined)
      if (res.success) {
        showToast(t("rooms.toasts.add_room_success"), "success")
        await loadData(true) // เคลียร์แคชและดึงข้อมูลใหม่
        setModalOpen(false)
      } else {
        setRoomFormError(res.error || t("rooms.toasts.create_room_error"))
      }
    }
    setFormSubmitting(false)
  }

  // จัดการประเภทห้องพัก (เพิ่ม / แก้ไข)
  const handleSubmitTypeForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasEditPermission) {
      showToast(t("rooms.toasts.permission_denied"), "error")
      return
    }
    if (!newTypeName) return
    setTypeSubmitting(true)

    const wsId = getCookie("horset_current_workspace_id") || ""

    if (editingType) {
      const res = await updateRoomType(editingType.id, newTypeName, Number(newTypeRent))
      if (res.success) {
        showToast(t("rooms.toasts.update_type_success"), "success")
        setNewTypeName("")
        setNewTypeRent(4000)
        setEditingType(null)
        clearWorkspaceCache(wsId)
        // โหลดข้อมูลประเภทห้องใหม่
        const typesRes = await getRoomTypes(wsId)
        if (typesRes.success && typesRes.data) {
          const typesData = typesRes.data as RoomTypeItem[]
          setRoomTypes(typesData)
          setCachedData(wsId, "room_types", typesData)
        }
      } else {
        showToast(res.error || t("rooms.toasts.update_type_error"), "error")
      }
    } else {
      const res = await createRoomType(newTypeName, Number(newTypeRent))
      if (res.success) {
        showToast(t("rooms.toasts.create_type_success"), "success")
        setNewTypeName("")
        setNewTypeRent(4000)
        clearWorkspaceCache(wsId)
        const typesRes = await getRoomTypes(wsId)
        if (typesRes.success && typesRes.data) {
          const typesData = typesRes.data as RoomTypeItem[]
          setRoomTypes(typesData)
          setCachedData(wsId, "room_types", typesData)
        }
      } else {
        showToast(res.error || t("rooms.toasts.add_type_error"), "error")
      }
    }
    setTypeSubmitting(false)
  }

  // ---------------------------------------------------------
  // จัดการอาคาร (Buildings CRUD) — เปิดผ่านปุ่ม "จัดการอาคาร" เป็น pop-up ในหน้านี้
  // ---------------------------------------------------------
  const handleAddBuilding = async () => {
    if (!hasEditPermission) {
      showToast(t("rooms.toasts.permission_denied"), "error")
      return
    }
    if (!newBuildingName.trim()) return
    setBuildingSubmitting(true)
    try {
      const res = await createBuilding(newBuildingName, newBuildingAddress, newBuildingCode)
      if (res.success && res.data) {
        setBuildings(prev => [...prev, { id: res.data!.id, name: res.data!.name, code: res.data!.code, address: res.data!.address }].sort((a, b) => a.name.localeCompare(b.name)))
        setNewBuildingName("")
        setNewBuildingCode("")
        setNewBuildingAddress("")
        showToast("เพิ่มอาคารสำเร็จ", "success")
      } else {
        showToast(res.error || "เกิดข้อผิดพลาดในการเพิ่มอาคาร", "error")
      }
    } finally {
      setBuildingSubmitting(false)
    }
  }

  const handleStartEditBuilding = (b: { id: string; name: string; code?: string | null; address?: string | null }) => {
    setEditingBuildingId(b.id)
    setEditingBuildingName(b.name)
    setEditingBuildingCode(b.code || "")
    setEditingBuildingAddress(b.address || "")
  }

  const handleSaveEditBuilding = async (id: string) => {
    if (!editingBuildingName.trim()) return
    setBuildingSubmitting(true)
    try {
      const res = await updateBuilding(id, editingBuildingName, editingBuildingAddress, editingBuildingCode)
      if (res.success && res.data) {
        setBuildings(prev => prev.map(b => b.id === id ? { id: res.data!.id, name: res.data!.name, code: res.data!.code, address: res.data!.address } : b).sort((a, b) => a.name.localeCompare(b.name)))
        setEditingBuildingId(null)
        showToast("แก้ไขอาคารสำเร็จ", "success")
      } else {
        showToast(res.error || "เกิดข้อผิดพลาดในการแก้ไขอาคาร", "error")
      }
    } finally {
      setBuildingSubmitting(false)
    }
  }

  const handleDeleteBuilding = async (id: string) => {
    if (!confirm("ต้องการลบอาคารนี้ใช่หรือไม่?")) return
    setBuildingSubmitting(true)
    try {
      const res = await deleteBuilding(id)
      if (res.success) {
        setBuildings(prev => prev.filter(b => b.id !== id))
        if (buildingFilter === id) setBuildingFilter("all")
        showToast("ลบอาคารสำเร็จ", "success")
      } else {
        showToast(res.error || "เกิดข้อผิดพลาดในการลบอาคาร", "error")
      }
    } finally {
      setBuildingSubmitting(false)
    }
  }

  // ---------------------------------------------------------
  // Unified Tenant Management logic
  // ---------------------------------------------------------
  
  // ตัวจัดการเปลี่ยนวันเริ่มสัญญา และคำนวณวันสิ้นสุดให้อัตโนมัติจากระยะเวลาสัญญาเริ่มต้น
  const handleContractStartChange = (val: string) => {
    setContractStartInput(val)
    if (!val) return

    const start = new Date(val)
    if (isNaN(start.getTime())) return

    const duration = financeSettings?.lease_duration ?? 6
    const end = new Date(start.getFullYear(), start.getMonth() + duration, start.getDate())
    
    const year = end.getFullYear()
    const month = String(end.getMonth() + 1).padStart(2, "0")
    const day = String(end.getDate()).padStart(2, "0")
    
    setContractEndInput(`${year}-${month}-${day}`)
  }

  // เปิดสำหรับทำสัญญาใหม่
  const handleOpenContractModal = (room: RoomItem) => {
    setSelectedRoom(room)
    setTenantNameInput("")
    setTenantPhoneInput("")
    setContractSuccess(false)
    
    const today = new Date()
    const duration = financeSettings?.lease_duration ?? 6
    const end = new Date(today.getFullYear(), today.getMonth() + duration, today.getDate())
    
    const startStr = today.toISOString().split("T")[0]
    setContractStartInput(startStr)
    
    const endYear = end.getFullYear()
    const endMonth = String(end.getMonth() + 1).padStart(2, "0")
    const endDay = String(end.getDate()).padStart(2, "0")
    setContractEndInput(`${endYear}-${endMonth}-${endDay}`)
    
    setContractModalOpen(true)
  }

  // ส่งแบบฟอร์มทำสัญญา
  const handleSubmitContract = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasEditPermission) {
      showToast(t("rooms.toasts.permission_denied"), "error")
      return
    }
    if (!selectedRoom || !tenantNameInput || !tenantPhoneInput) return
    setContractSubmitting(true)

    try {
      const res = await createTenant(
        { roomId: selectedRoom.id },
        tenantNameInput,
        tenantPhoneInput,
        null, // lineUserId is null, waiting for Line LIFF registration!
        contractStartInput,
        contractEndInput
      )
      
      if (res.success) {
        showToast(t("rooms.toasts.contract_success").replace("{roomNumber}", selectedRoom.roomNumber), "success")
        await loadData(true) // เคลียร์แคชและโหลดข้อมูลจริง
        
        // อัปเดต selectedRoom ใน state ทันทีเพื่อให้แสดงผลใน Success View ได้ครบถ้วน
        const updatedRoom = rooms.find(r => r.roomNumber === selectedRoom.roomNumber)
        setSelectedRoom({
          ...(updatedRoom || selectedRoom),
          tenantName: tenantNameInput,
          tenantPhone: tenantPhoneInput,
          tenantId: res.data.id,
          status: "occupied"
        })
        setContractSuccess(true)
      } else {
        showToast(res.error || t("rooms.toasts.contract_error"), "error")
      }
    } catch (err) {
      showToast(t("rooms.toasts.server_connection_error"), "error")
    } finally {
      setContractSubmitting(false)
    }
  }

  // จัดการแชร์/เจนลิงก์ LINE
  const handleOpenLineLinkModal = (room: RoomItem) => {
    setSelectedRoom(room)
    setLineLinkModalOpen(true)
  }

  const getLiffRegistrationLink = (roomId: string) => {
    const wsId = getCookie("horset_current_workspace_id") || ""
    const packed = packWorkspaceAndRoom(wsId, roomId)
    if (packed) {
      return `https://liff.line.me/${workspaceLiffId}?p=${packed}`
    }
    return `https://liff.line.me/${workspaceLiffId}?workspace_id=${wsId}&room_id=${roomId}`
  }

  const handleCopyLinkToClipboard = (roomId: string, roomNum: string) => {
    const link = getLiffRegistrationLink(roomId)
    navigator.clipboard.writeText(link)
    showToast(t("rooms.toasts.copy_line_link_success").replace("{roomNumber}", roomNum), "success")
  }

  // เตรียมและเปิด Modal ยืนยันหยุดเชื่อมต่อ LINE
  const handleDisconnectLineTrigger = (room: RoomItem) => {
    setSelectedRoom(room)
    setLineDisconnectConfirmOpen(true)
  }

  // กดยืนยันหยุดเชื่อมต่อ LINE ใน Modal
  const handleConfirmDisconnectLine = async () => {
    if (!hasEditPermission) {
      showToast(t("rooms.toasts.permission_denied"), "error")
      return
    }
    if (!selectedRoom || !selectedRoom.tenantId) return
    setDisconnectSubmitting(true)
    try {
      const res = await disconnectLine(selectedRoom.tenantId)
      if (res.success) {
        showToast(t("rooms.toasts.disconnect_line_success").replace("{roomNumber}", selectedRoom.roomNumber), "success")
        setLineDisconnectConfirmOpen(false)
        await loadData(true)
      } else {
        showToast(res.error || t("rooms.toasts.disconnect_line_error"), "error")
      }
    } catch (err) {
      showToast(t("rooms.toasts.server_connection_error"), "error")
    } finally {
      setDisconnectSubmitting(false)
    }
  }

  // เปิดดูรายละเอียดและแจ้งย้ายออก
  const handleOpenDetailModal = (room: RoomItem) => {
    setSelectedRoom(room)
    setIsEditingTenant(false)
    setEditTenantError(null)
    setEditTenantName(room.tenantName || "")
    setEditTenantPhone(room.tenantPhone || "")
    
    const getSafeDateStr = (dateStr: string | null | undefined) => {
      if (!dateStr) return ""
      if (dateStr.length === 10 && dateStr.includes("-")) return dateStr
      try {
        const d = new Date(dateStr)
        return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0]
      } catch (e) {
        return ""
      }
    }

    setEditLeaseStart(getSafeDateStr(room.leaseStart))
    setEditLeaseEnd(getSafeDateStr(room.leaseEnd))
    setTenantDetailModalOpen(true)
  }

  // บันทึกการแก้ไขข้อมูลผู้เช่า
  const handleSaveTenantEdits = async () => {
    if (!hasEditPermission) {
      showToast(t("rooms.toasts.permission_denied"), "error")
      return
    }
    if (!selectedRoom || !selectedRoom.tenantId) return
    if (!editTenantName.trim()) {
      setEditTenantError(t("rooms.toasts.fill_tenant_name"))
      return
    }
    if (!editTenantPhone.trim()) {
      setEditTenantError(t("rooms.toasts.fill_tenant_phone"))
      return
    }

    setEditTenantSubmitting(true)
    setEditTenantError(null)
    try {
      const res = await updateTenant(
        selectedRoom.tenantId,
        { roomId: selectedRoom.id },
        editTenantName,
        editTenantPhone,
        selectedRoom.lineUserId || null,
        editLeaseStart || "",
        editLeaseEnd || ""
      )

      if (res.success) {
        showToast(t("rooms.toasts.update_tenant_success"), "success")
        setIsEditingTenant(false)
        await loadData(true)

        // อัปเดต selectedRoom ใน state เพื่อให้ UI แสดงผลข้อมูลใหม่ทันทีโดยไม่ต้องปิดโมดอล
        setSelectedRoom(prev => prev ? {
          ...prev,
          tenantName: editTenantName,
          tenantPhone: editTenantPhone,
          leaseStart: editLeaseStart || null,
          leaseEnd: editLeaseEnd || null
        } : null)
      } else {
        setEditTenantError(res.error || t("rooms.toasts.update_tenant_error"))
      }
    } catch (err) {
      setEditTenantError(t("rooms.toasts.save_error"))
    } finally {
      setEditTenantSubmitting(false)
    }
  }

  // จัดการย้ายออกผู้เช่า (เปิดฟอร์มคืนห้องและยกเลิกสัญญา มาตรา 40(8))
  const handleCheckoutTenantTrigger = () => {
    if (!selectedRoom || !selectedRoom.tenantId) return
    
    const initialDate = new Date().toISOString().split("T")[0]
    setCheckoutDate(initialDate)
    
    // เงินประกันจริงที่เก็บจากผู้เช่ารายนี้ (ground truth) — คำนวณสดจาก settings เฉพาะกรณี
    // ผู้เช่ายังไม่ถูก migrate (depositPaid เป็น null) เท่านั้น
    let calculatedDeposit = selectedRoom.depositPaid ?? 0
    if (selectedRoom.depositPaid === null || selectedRoom.depositPaid === undefined) {
      if (financeSettings) {
        const roomTypeDeposit = selectedRoom.roomTypeId ? roomTypeDeposits[selectedRoom.roomTypeId] : undefined
        calculatedDeposit = computeStandardDeposit(
          selectedRoom.baseRent,
          financeSettings.deposit_type,
          financeSettings.deposit_amount || 0,
          roomTypeDeposit
        )
      }
    }
    setCheckoutDeposit(calculatedDeposit)
    
    // ตั้งยอดเงินคืนจริงตามเงื่อนไขวันสิ้นสุดสัญญา
    if (selectedRoom.leaseEnd) {
      const checkDate = new Date(initialDate)
      const leaseEndDate = new Date(selectedRoom.leaseEnd)
      
      const isBreak = checkDate.getFullYear() < leaseEndDate.getFullYear() || 
                      (checkDate.getFullYear() === leaseEndDate.getFullYear() && checkDate.getMonth() < leaseEndDate.getMonth())
      
      if (isBreak) {
        setCheckoutRefund(0)
      } else {
        setCheckoutRefund(calculatedDeposit)
      }
    } else {
      setCheckoutRefund(0)
    }

    setCheckoutError(null)
    setCheckoutSubmitting(false)
    
    setTenantDetailModalOpen(false)
    setCheckoutModalOpen(true)
  }

  // ดำเนินการย้ายออกผู้เช่า ปรับสถานะห้องเป็นรอดำเนินการคืนเงินประกัน
  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasEditPermission) {
      setCheckoutError(t("rooms.toasts.permission_denied"))
      return
    }
    if (!selectedRoom || !selectedRoom.tenantId) return
    
    if (!checkoutDate) {
      setCheckoutError(t("rooms.toasts.fill_checkout_date"))
      return
    }

    setCheckoutSubmitting(true)
    setCheckoutError(null)

    try {
      // ตรวจสอบว่าเป็นวันย้ายออกล่วงหน้าในอนาคตหรือไม่
      const d = new Date()
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const date = String(d.getDate()).padStart(2, '0')
      const todayStr = `${year}-${month}-${date}`

      const isFutureCheckout = checkoutDate > todayStr

      if (isFutureCheckout) {
        // 1. ถ้าเป็นการย้ายออกล่วงหน้า ให้ปล่อยผู้เช่าค้างในห้องพักไปก่อน แต่เปลี่ยนวันสิ้นสุดสัญญา (lease_end) เป็นวันที่ย้ายออกจริง
        const updateRes = await updateTenant(
          selectedRoom.tenantId,
          { roomId: selectedRoom.id },
          selectedRoom.tenantName || "",
          selectedRoom.tenantPhone || "",
          selectedRoom.lineUserId || null,
          selectedRoom.leaseStart || "",
          checkoutDate
        )
        if (updateRes.success) {
          showToast(t("rooms.toasts.future_checkout_logged").replace("{roomNumber}", selectedRoom.roomNumber), "success")
          setCheckoutModalOpen(false)
          await loadData(true)
        } else {
          setCheckoutError(updateRes.error || t("rooms.toasts.update_lease_end_error"))
        }
      } else {
        // 2. ปรับสถานะห้องเป็น Pending_Refund เพื่อรอจัดการคืนเงินประกันปลายงวด
        const { updateRoomStatus } = await import("@/features/room/actions")
        const res = await updateRoomStatus(selectedRoom.id, "Pending_Refund")
        if (res.success) {
          showToast(t("rooms.toasts.moved_to_pending_refund").replace("{roomNumber}", selectedRoom.roomNumber), "success")
          setCheckoutModalOpen(false)
          await loadData(true)
        } else {
          setCheckoutError(res.error || t("rooms.toasts.update_room_status_error"))
        }
      }
    } catch (err) {
      setCheckoutError(t("rooms.toasts.checkout_error"))
    } finally {
      setCheckoutSubmitting(false)
    }
  }

  // ฟังก์ชันช่วยเหลือสำหรับกระบวนการจัดการคืนเงินประกัน (Task 3)
  const handleOpenRefundModal = async (room: RoomItem) => {
    setEditingCancelledContractId(null)
    setIsHistoricalBreach(false)
    setRefundingRoom(room)
    setLoadingMeter(true)
    setRefundError(null)
    setRefundCheckoutDate(new Date().toISOString().split("T")[0])
    setIsRentWaived(false)
    
    // ตั้งค่าบริการและค่าเสียหายอื่นเริ่มต้นเป็น "ค่าล้างแอร์" 500 บาท
    setCustomDeductions([
      { id: "1", name: "ค่าล้างแอร์", amount: 500 }
    ])
    
    // เงินประกันจริงที่เก็บจากผู้เช่ารายนี้ (ground truth) — คำนวณสดจาก settings เฉพาะกรณี
    // ผู้เช่ายังไม่ถูก migrate (depositPaid เป็น null) เท่านั้น
    let calculatedDeposit = room.depositPaid ?? 0
    if (room.depositPaid === null || room.depositPaid === undefined) {
      if (financeSettings) {
        const roomTypeDeposit = room.roomTypeId ? roomTypeDeposits[room.roomTypeId] : undefined
        calculatedDeposit = computeStandardDeposit(
          room.baseRent,
          financeSettings.deposit_type,
          financeSettings.deposit_amount || 0,
          roomTypeDeposit
        )
      }
    }
    setRefundDeposit(calculatedDeposit)
    
    try {
      // ดึงเลขมิเตอร์น้ำไฟรอบล่าสุดเพื่อสืบทอด
      const { getLatestMeterRecord } = await import("@/features/meter/actions")
      const meterRes = await getLatestMeterRecord({ roomId: room.id }, getCookie("horset_current_workspace_id") || undefined)
      
      if (meterRes.success && meterRes.data) {
        const record = meterRes.data
        // ดึงเลขมิเตอร์น้ำไฟที่จดจริงล่าสุด
        const pElec = record.elecCurr !== null && record.elecCurr !== undefined ? record.elecCurr : record.elecPrev
        const pWater = record.waterCurr !== null && record.waterCurr !== undefined ? record.waterCurr : record.waterPrev
        setPrevElec(pElec)
        setPrevWater(pWater)
        setFinalElec(pElec)
        setFinalWater(pWater)
      } else {
        setPrevElec(0)
        setPrevWater(0)
        setFinalElec("")
        setFinalWater("")
      }
    } catch (err) {
      console.error("Failed to load meter records:", err)
      setPrevElec(0)
      setPrevWater(0)
    } finally {
      setLoadingMeter(false)
      setRefundModalOpen(true)
    }
  }

  const handleEditCancelledContract = (c: any) => {
    setEditingCancelledContractId(c.id)
    setRefundingRoom({
      id: "historical",
      roomNumber: c.roomNumber,
      roomTypeId: "",
      status: "Vacant",
      baseRent: 0,
      tenantId: c.tenantId || "historical",
      tenantName: c.tenantName || "",
      tenantPhone: ""
    } as any)
    setRefundCheckoutDate(c.cancellationDate ? c.cancellationDate.split("T")[0] : new Date().toISOString().split("T")[0])
    setRefundDeposit(c.depositAmount || 0)
    setHistoricalRentDeduction(c.deductedRent405 || 0)
    setHistoricalUtilitiesDeduction(c.deductedUtilities408 || 0)
    setIsRentWaived(c.deductedRent405 === 0)
    
    // Determine historical breach
    const wasRefundZero = Number(c.actualRefund ?? c.refundedAmount ?? 0) === 0
    setIsHistoricalBreach(wasRefundZero)
    
    setCustomDeductions([
      { id: "edit-1", name: "ค่าบริการและค่าปรับอื่นๆ", amount: c.deductedServices408 || 0 }
    ])
    
    setRefundError(null)
    setRefundModalOpen(true)
  }


  const handleAddCustomDeduction = () => {
    if (customDeductions.length >= 5) {
      showToast(t("rooms.toasts.max_deductions"), "error")
      return
    }
    setCustomDeductions([
      ...customDeductions,
      { id: Date.now().toString(), name: "", amount: "" }
    ])
  }

  const handleUpdateCustomDeduction = (id: string, field: "name" | "amount", value: string) => {
    setCustomDeductions(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value }
      }
      return item
    }))
  }

  const handleRemoveCustomDeduction = (id: string) => {
    setCustomDeductions(prev => prev.filter(item => item.id !== id))
  }

  const handleConfirmRefundSubmit = async () => {
    if (!refundingRoom || !refundingRoom.tenantId) return
    
    const isHistoricalEdit = editingCancelledContractId !== null
    let fElec = 0
    let fWater = 0
    
    if (!isHistoricalEdit) {
      if (finalElec === "" || finalWater === "") {
        setRefundError(t("rooms.toasts.fill_meter_readings"))
        return
      }
      
      fElec = Number(finalElec)
      fWater = Number(finalWater)
      
      if (isNaN(fElec) || fElec < prevElec) {
        setRefundError(t("rooms.toasts.invalid_electric_meter").replace("{value}", String(prevElec)))
        return
      }
      
      if (isNaN(fWater) || fWater < prevWater) {
        setRefundError(t("rooms.toasts.invalid_water_meter").replace("{value}", String(prevWater)))
        return
      }
    }
    
    setRefundSubmitting(true)
    setRefundError(null)
    
    try {
      const wsId = getCookie("horset_current_workspace_id") || ""
      
      if (!isHistoricalEdit) {
        const currentCycle = refundCheckoutDate.substring(0, 7) // e.g., "2026-07"
        
        // 1. บันทึกเลขมิเตอร์ปลายงวดในรอบบิลปัจจุบัน และสืบทอดเป็น "เลขมิเตอร์ก่อนหน้า" ในรอบบิลถัดไป (สำหรับผู้เช่าคนใหม่)
        const { saveMeterRecord } = await import("@/features/meter/actions")
        
        const currentMeterRes = await saveMeterRecord(
          { roomId: refundingRoom.id },
          currentCycle,
          prevElec,
          fElec,
          prevWater,
          fWater
        )
        
        if (!currentMeterRes.success) {
          setRefundError(currentMeterRes.error || t("rooms.toasts.meter_save_error"))
          setRefundSubmitting(false)
          return
        }
        
        // คำนวณรอบถัดไป
        const [yearStr, monthStr] = currentCycle.split("-")
        let nextYear = parseInt(yearStr, 10)
        let nextMonth = parseInt(monthStr, 10) + 1
        if (nextMonth > 12) {
          nextMonth = 1
          nextYear += 1
        }
        const nextCycle = `${nextYear}-${String(nextMonth).padStart(2, "0")}`
        
        const nextMeterRes = await saveMeterRecord(
          { roomId: refundingRoom.id },
          nextCycle,
          fElec,
          "", // current value is empty for next tenant to write later
          fWater,
          ""
        )
        
        if (!nextMeterRes.success) {
          setRefundError(nextMeterRes.error || t("rooms.toasts.meter_carry_over_error"))
          setRefundSubmitting(false)
          return
        }
      }
      
      // 2. สรุปการแบ่งประเภทรายได้หักภาษีปลายงวด
      let totalUtilities408 = 0
      if (!isHistoricalEdit) {
        const elecUnits = fElec - prevElec
        const waterUnits = fWater - prevWater
        const elecCost = elecUnits * (financeSettings?.electric_rate || 7)
        const waterCost = waterUnits * (financeSettings?.water_rate || 18)
        totalUtilities408 = elecCost + waterCost
      }

      const {
        daysStayed,
        isContractBroken,
        rentDeduction: rentDeductionVal,
        utilitiesDeduction: utilitiesDeductionVal,
        servicesDeduction: servicesDeductionVal,
        forfeitedAmount: forfeitedAmountVal,
        actualRefund: checkoutRefundAmount
      } = calculateDepositProration({
        baseRent: refundingRoom.baseRent,
        depositAmount: Number(refundDeposit),
        checkoutDate: refundCheckoutDate,
        contractEnd: refundingRoom.leaseEnd || null,
        checkoutPolicy: financeSettings?.checkout_policy || "DAILY_PRORATE",
        isRentWaived,
        totalUtilities408,
        customDeductions: customDeductions.map(d => ({ name: d.name, amount: Number(d.amount) })),
        isHistoricalEdit,
        isHistoricalBreach,
        historicalRentDeduction: historicalRentDeduction === "" ? undefined : Number(historicalRentDeduction),
        historicalUtilitiesDeduction: historicalUtilitiesDeduction === "" ? undefined : Number(historicalUtilitiesDeduction)
      })
      
      // 3. บันทึกสัญญายกเลิกและกระจายภาษีแยกสัดส่วนลง cancelled_contracts
      const cancellationPayload: any = {
        tenantId: refundingRoom.tenantId === "historical" ? null : refundingRoom.tenantId,
        roomNumber: refundingRoom.roomNumber,
        tenantName: refundingRoom.tenantName || "",
        cancellationDate: refundCheckoutDate,
        depositAmount: Number(refundDeposit),
        refundedAmount: Number(checkoutRefundAmount),
        actualRefund: Number(checkoutRefundAmount),
        forfeitedAmount: Number(forfeitedAmountVal),
        deductedRent405: Number(rentDeductionVal),
        deductedUtilities408: Number(utilitiesDeductionVal),
        deductedServices408: Number(servicesDeductionVal),
        
        // Raw Data Fields for Server-Side Recomputation
        baseRent: refundingRoom.baseRent,
        contractEnd: refundingRoom.leaseEnd,
        checkoutPolicy: financeSettings?.checkout_policy || "DAILY_PRORATE",
        isRentWaived,
        totalUtilities408,
        customDeductions,
        isHistoricalEdit,
        isHistoricalBreach,
        historicalRentDeduction,
        historicalUtilitiesDeduction
      }
      
      if (isHistoricalEdit) {
        cancellationPayload.id = editingCancelledContractId
      }
      
      const saveRes = await saveCancelledContract(wsId, cancellationPayload)
      if (!saveRes.success) {
        setRefundError(saveRes.error || t("rooms.toasts.tax_submitting_error"))
        setRefundSubmitting(false)
        return
      }
      
      if (!isHistoricalEdit) {
        // 4. ลบ/เก็บบันทึกสัญญาผู้เช่าเก่า และปรับสถานะห้องว่าง (Vacant)
        const deleteRes = await deleteTenant(refundingRoom.tenantId, refundingRoom.roomNumber)
        if (!deleteRes.success) {
          setRefundError(deleteRes.error || t("rooms.toasts.close_tenant_system_error"))
          setRefundSubmitting(false)
          return
        }
      }
      
      showToast(
        isHistoricalEdit 
          ? t("rooms.toasts.update_history_success").replace("{roomNumber}", refundingRoom.roomNumber)
          : t("rooms.toasts.refund_summary_success").replace("{roomNumber}", refundingRoom.roomNumber), 
        "success"
      )
      setRefundModalOpen(false)
      await loadData(true)
      
    } catch (err: any) {
      setRefundError(err?.message || t("rooms.toasts.system_refund_error"))
    } finally {
      setRefundSubmitting(false)
    }
  }



  // ลบประวัติการยกเลิกสัญญา มาตรา 40(8)
  const handleDeleteCancellation = async (id: string) => {
    if (!hasEditPermission) {
      showToast(t("rooms.toasts.permission_denied"), "error")
      return
    }
    if (!confirm(t("rooms.toasts.confirm_delete_history"))) return
    const wsId = getCookie("horset_current_workspace_id") || ""
    const res = await deleteCancelledContract(id)
    if (res.success || res.error === "table_not_found") {
      const updated = cancelledContracts.filter(c => c.id !== id)
      setCancelledContracts(updated)
      if (wsId) setCachedData(wsId, "cancelled_contracts", updated)
      showToast(t("rooms.toasts.delete_history_success"), "success")
    } else {
      showToast(t("rooms.toasts.delete_history_error").replace("{error}", res.error || ""), "error")
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
          label: t("rooms.status_overdue_lease"),
          style: "bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 font-bold",
          dotColor: "bg-red-500"
        }
      } else {
        return {
          label: t("rooms.status_active_lease"),
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
          label = t("rooms.status_remaining_months_1")
        } else if (diffDays <= 60) {
          label = t("rooms.status_remaining_months_2")
        } else {
          label = t("rooms.status_remaining_months_n").replace("{months}", String(totalMonths))
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
      label: t("rooms.status_normal_lease"),
      style: "bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 font-bold",
      dotColor: "bg-blue-500"
    }
  }

  // ตรวจสอบเงื่อนไขออกก่อนกำหนด (Break Contract) เปรียบเทียบปีและเดือนที่คืนห้องเทียบกับเดือนที่หมดสัญญา
  const checkIfBreakContract = (dateStr: string, roomObj?: any) => {
    const r = roomObj || selectedRoom
    if (!r || !r.leaseEnd || !dateStr) return false
    const checkDate = new Date(dateStr)
    const leaseEndDate = new Date(r.leaseEnd)
    
    const checkYear = checkDate.getFullYear()
    const checkMonth = checkDate.getMonth()
    
    const leaseYear = leaseEndDate.getFullYear()
    const leaseMonth = leaseEndDate.getMonth()
    
    if (checkYear < leaseYear) return true
    if (checkYear === leaseYear && checkMonth < leaseMonth) return true
    
    return false
  }

  // ตัวจัดการการเปลี่ยนวันแจ้งออกจริง
  const handleCheckoutDateChange = (val: string) => {
    setCheckoutDate(val)
    if (checkIfBreakContract(val)) {
      setCheckoutRefund(0)
    }
  }

  // คำนวณสถานะห้อง (ว่าง / รอลงทะเบียน / มีผู้เช่าแล้ว)
  const getRoomStatusDetails = (room: RoomItem) => {
    const hasTenant = !!room.tenantName
    const isRegistered = !!room.lineUserId

    if (room.status === "Pending_Refund") {
      return {
        label: t("rooms.status_pending_refund"),
        badgeStyle: "bg-purple-50 text-purple-600 dark:bg-purple-950/35 dark:text-purple-400 border border-purple-200/40 dark:border-purple-800/40 font-bold",
        dotStyle: "bg-purple-500",
        code: "Pending_Refund"
      }
    } else if (!hasTenant) {
      return {
        label: t("rooms.status_vacant"),
        badgeStyle: "bg-red-50 text-red-600 dark:bg-red-950/35 dark:text-red-400 border border-red-200/40 dark:border-red-800/40",
        dotStyle: "bg-red-500",
        code: "available"
      }
    } else if (!isRegistered) {
      return {
        label: t("rooms.status_occupied_waiting_line"),
        badgeStyle: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/40 dark:border-amber-900/40",
        dotStyle: "bg-amber-500",
        code: "waiting"
      }
    } else {
      return {
        label: t("rooms.status_occupied_connected_line"),
        badgeStyle: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/35 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40",
        dotStyle: "bg-emerald-500",
        code: "occupied"
      }
    }
  }

  // คัดกรองห้องตามการค้นหาและฟิลเตอร์สถานะใหม่ (ว่าง / รอลงทะเบียน / มีผู้เช่าแล้ว)
  const filteredRooms = rooms.filter(room => {
    // ห้องรอดำเนินการคืนเงินประกันจะถูกแยกไปอยู่ Board ด้านบนโดยเฉพาะ
    if (room.status === "Pending_Refund") return false

    const matchesSearch = 
      room.roomNumber.includes(search) || 
      room.roomTypeName.toLowerCase().includes(search.toLowerCase()) ||
      (room.tenantName && room.tenantName.toLowerCase().includes(search.toLowerCase())) ||
      (room.tenantPhone && room.tenantPhone.includes(search))

    const details = getRoomStatusDetails(room)
    let matchesFilter = false
    if (filter === "all") {
      matchesFilter = true
    } else if (filter === "has_tenant") {
      matchesFilter = details.code === "waiting" || details.code === "occupied"
    } else {
      matchesFilter = details.code === filter
    }

    const matchesBuilding = buildingFilter === "all" || room.buildingId === buildingFilter

    return matchesSearch && matchesFilter && matchesBuilding
  })

  // คำนวณสถิติหลักของห้องพัก
  const totalRoomsCount = rooms.length
  const vacantRoomsCount = rooms.filter(r => !r.tenantName).length
  const waitingRoomsCount = rooms.filter(r => r.tenantName && !r.lineUserId).length
  const occupiedRoomsCount = rooms.filter(r => r.tenantName && r.lineUserId).length

  // เดาเลขชั้นแบบไดนามิกจากหมายเลขห้องพัก (ใช้เป็นตัวช่วยเดาตอนพิมพ์เพิ่มห้องพักใหม่)
  const guessFloorNumber = (roomNo: string) => {
    if (!roomNo) return ""
    const digits = roomNo.replace(/\D/g, "")
    if (digits.length === 3) return digits.charAt(0)
    if (digits.length === 4) return digits.substring(0, 2)
    const match = roomNo.match(/^([A-Za-z-]*\d+)/)
    if (match) {
      const pureDigits = match[0].replace(/\D/g, "")
      if (pureDigits.length >= 3) return pureDigits.substring(0, pureDigits.length - 2)
    }
    return roomNo.charAt(0) || "1"
  }

  // ดึงเลขชั้นของห้องพัก (ใช้อิงจากคอลัมน์ใน DB เป็นหลัก และใช้เดาชั้นกรณีเป็นห้องเก่าที่ไม่มีข้อมูล)
  const getFloorNumber = (room: RoomItem) => {
    if (room.floor) return room.floor
    return guessFloorNumber(room.roomNumber) || "1"
  }

  // จัดกลุ่มห้องพักแยกตามชั้น
  const groupedRoomsByFloor: { [floor: string]: RoomItem[] } = {}
  filteredRooms.forEach(room => {
    const floor = getFloorNumber(room)
    if (!groupedRoomsByFloor[floor]) groupedRoomsByFloor[floor] = []
    groupedRoomsByFloor[floor].push(room)
  })

  const sortedFloors = Object.keys(groupedRoomsByFloor).sort((a, b) => {
    const numA = parseInt(a, 10)
    const numB = parseInt(b, 10)
    if (isNaN(numA) || isNaN(numB)) return a.localeCompare(b)
    return numA - numB
  })

  // Skeletons Loader component for loading states
  const SkeletonLoader = () => (
    <div className="space-y-4">
      {viewMode === "floor" ? (
        /* Floor Card Grid Skeleton */
        <div className="space-y-8 animate-pulse">
          <div className="flex items-center gap-3 justify-center">
            <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
            <div className="h-6 bg-slate-200 dark:bg-slate-850 rounded-full w-24" />
            <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-12" />
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-20" />
                  </div>
                  <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-16" />
                </div>
                <div className="h-7 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-4/5" />
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 h-10 bg-slate-100 dark:bg-slate-850 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Desktop Table Skeleton */
        <div className="hidden md:block space-y-3">
          <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse w-full" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between items-center py-4 px-4 border-b border-slate-100 dark:border-slate-800 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/12" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/12" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/12" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/12" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/12" />
            </div>
          ))}
        </div>
      )}
      
      {/* Mobile Cards Skeleton */}
      <div className="block md:hidden space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-5 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl space-y-4 shadow-sm animate-pulse">
            <div className="flex justify-between items-center">
              <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/5" />
            </div>
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
              <div className="flex justify-between"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" /><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" /></div>
              <div className="flex justify-between"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" /><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" /></div>
              <div className="flex justify-between"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" /><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" /></div>
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex gap-3">
              <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-xl w-1/2" />
              <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-xl w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  const todayStr = `${year}-${month}-${date}`

  const activeCancelledContracts = cancelledContracts.filter(c => {
    if (!c.cancellationDate) return true
    return c.cancellationDate <= todayStr
  })

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

      <div className="space-y-6 max-w-none pb-24 md:pb-6 relative">
        {/* Ambient Decorative Background Glows */}
        <div className="absolute top-10 right-1/4 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-[250px] h-[250px] bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />

        {/* 1. HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
              <Home className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              {t("rooms.title") || "จัดการห้องพักและผู้เช่า"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {t("rooms.subtitle") || "ตารางรวมรายชื่อห้องพักทั้งหมด จัดการตึกของท่านในหน้านี้หน้าเดียว"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
            {/* Manage Types Config */}
            <button
              onClick={() => setTypesModalOpen(true)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 font-bold text-xs flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Settings className="w-4 h-4 text-indigo-500 animate-spin-hover" />
              {hasEditPermission ? (t("rooms.config_types") || "ตั้งค่าประเภทห้องพัก") : (t("rooms.view_types") || "ดูประเภทห้องพัก")}
            </button>

            {/* Manage Buildings */}
            <button
              onClick={() => setBuildingsModalOpen(true)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 font-bold text-xs flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Building className="w-4 h-4 text-teal-500" />
              {hasEditPermission ? "จัดการอาคาร" : "ดูรายชื่ออาคาร"}
            </button>

            {/* CSV Actions Group */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                title={t("rooms.download_template_title") || "ดาวน์โหลดเทมเพลตไฟล์ CSV สำหรับเพิ่มห้องพัก"}
                className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4 text-blue-500" />
                <span className="hidden sm:inline">{t("rooms.download_template") || "ดาวน์โหลด CSV Template"}</span>
                <span className="sm:hidden">{t("rooms.download_template_short") || "เทมเพลต"}</span>
              </button>

              {hasEditPermission && (
                <label className="relative">
                  <span className={`px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${uploadingCsv ? "opacity-60 cursor-not-allowed" : ""}`}>
                    {uploadingCsv ? (
                      <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 text-emerald-500" />
                    )}
                    <span className="hidden sm:inline">{uploadingCsv ? (t("rooms.upload_csv_loading") || "กำลังอัปโหลด...") : (t("rooms.upload_csv") || "อัปโหลดไฟล์ CSV")}</span>
                    <span className="sm:hidden">{uploadingCsv ? "..." : (t("rooms.upload_csv_btn_short") || "อัปโหลด")}</span>
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
                onClick={() => setIsRoomTemplateGuideModalOpen(true)}
                title={t("rooms.csv_guide_title") || "เปิดดูคู่มือการกรอกไฟล์เทมเพลต CSV ของห้องพัก"}
                className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm flex-1 sm:flex-initial justify-center"
              >
                <HelpCircle className="w-4 h-4 text-indigo-500" />
                <span className="hidden sm:inline">{t("rooms.csv_guide") || "คู่มือการใช้ CSV"}</span>
                <span className="sm:hidden">{t("rooms.csv_guide") || "คู่มือ CSV"}</span>
              </button>
            </div>

            {/* Add Room Button (desktop only) */}
            {!hasEditPermission ? (
              <span className="px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center gap-1.5 shadow-sm">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                {t("rooms.read_only_mode")}
              </span>
            ) : (
              <button
                onClick={handleAddClick}
                className="hidden md:flex px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs items-center gap-2 transition-all shadow shadow-blue-500/10 active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t("rooms.add_room") || "เพิ่มห้องพักใหม่"}
              </button>
            )}
          </div>
        </div>

        {/* 2. STATS CARDS GRID */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4 shrink-0">
          {/* Card 1: Total Rooms */}
          <div className="glass-panel p-4 md:p-5 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex items-center gap-4 hover:border-slate-300 dark:hover:border-slate-800/80 transition-all group">
            <div className="p-3 bg-slate-100 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 rounded-xl group-hover:scale-110 transition-transform">
              <Building className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 block font-semibold uppercase tracking-wider">{t("rooms.stats_total") || "ห้องพักทั้งหมด"}</span>
              <span className="text-lg md:text-xl font-extrabold text-slate-850 dark:text-slate-100 mt-0.5 flex items-center gap-1.5 leading-none">
                {loading ? (
                  <span className="inline-block h-5 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                ) : (
                  <span className="tabular-nums font-black">{totalRoomsCount}</span>
                )}
                <span className="text-xs md:text-sm font-bold text-slate-500">{t("rooms.rooms_unit") || "ห้อง"}</span>
              </span>
            </div>
          </div>

          {/* Card 2: Vacant Rooms */}
          <div className="glass-panel p-4 md:p-5 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex items-center gap-4 hover:border-red-200 dark:hover:border-red-900/40 transition-all group">
            <div className="p-3 bg-red-500/10 text-red-500 rounded-xl group-hover:scale-110 transition-transform">
              <Home className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 block font-semibold uppercase tracking-wider">{t("rooms.stats_vacant") || "ห้องว่าง"}</span>
              <span className="text-lg md:text-xl font-extrabold text-red-600 dark:text-red-400 mt-0.5 flex items-center gap-1.5 leading-none">
                {loading ? (
                  <span className="inline-block h-5 w-10 bg-red-200/50 dark:bg-red-900/30 rounded animate-pulse" />
                ) : (
                  <span className="tabular-nums font-black">{vacantRoomsCount}</span>
                )}
                <span className="text-xs md:text-sm font-bold text-red-555">{t("rooms.rooms_unit") || "ห้อง"}</span>
              </span>
            </div>
          </div>

          {/* Card 3: Waiting for LINE Registration */}
          <div className="glass-panel p-4 md:p-5 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex items-center gap-4 hover:border-amber-200 dark:hover:border-amber-900/40 transition-all group">
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 block font-semibold uppercase tracking-wider">{t("rooms.stats_waiting_line") || "ยังไม่ลงทะเบียนไลน์"}</span>
              <span className="text-lg md:text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1.5 leading-none">
                {loading ? (
                  <span className="inline-block h-5 w-10 bg-amber-200/50 dark:bg-amber-900/30 rounded animate-pulse" />
                ) : (
                  <span className="tabular-nums font-black">{waitingRoomsCount}</span>
                )}
                <span className="text-xs md:text-sm font-bold text-amber-555">{t("rooms.rooms_unit") || "ห้อง"}</span>
              </span>
            </div>
          </div>

          {/* Card 4: Occupied & Registered */}
          <div className="glass-panel p-4 md:p-5 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex items-center gap-4 hover:border-emerald-200 dark:hover:border-emerald-900/40 transition-all group">
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 block font-semibold uppercase tracking-wider">{t("rooms.stats_fully_occupied") || "มีผู้เช่าสมบูรณ์"}</span>
              <span className="text-lg md:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1.5 leading-none">
                {loading ? (
                  <span className="inline-block h-5 w-10 bg-emerald-200/50 dark:bg-emerald-900/30 rounded animate-pulse" />
                ) : (
                  <span className="tabular-nums font-black">{occupiedRoomsCount}</span>
                )}
                <span className="text-xs md:text-sm font-bold text-emerald-555">{t("rooms.rooms_unit") || "ห้อง"}</span>
              </span>
            </div>
          </div>
        </div>

        {/* 3. SEARCH & STATUS FILTERS */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Search bar with ambient border glow */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-450 dark:text-slate-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder={t("rooms.search_placeholder") || "ค้นหา หมายเลขห้อง, ชื่อผู้เช่า หรือเบอร์โทรศัพท์..."}
              className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 text-xs font-medium transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button 
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters & View switcher Row */}
          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-3 w-full xl:w-auto">
            {/* Filter Badges Row */}
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline-block">{t("rooms.filter_label") || "ตัวกรอง:"}</span>
              {[
                { id: "all", label: t("rooms.filter_all") || "ทั้งหมด" },
                { id: "available", label: t("rooms.filter_vacant") || "เฉพาะห้องว่าง" },
                { id: "has_tenant", label: t("rooms.filter_occupied") || "มีผู้เช่า" },
                { id: "waiting", label: t("rooms.filter_waiting_line") || "มีผู้เช่า (รอ LINE)" },
                { id: "occupied", label: t("rooms.filter_connected_line") || "มีผู้เช่า (เชื่อม LINE)" }
              ].map(tab => (
                <button
                   key={tab.id}
                   onClick={() => setFilter(tab.id as any)}
                   className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                     filter === tab.id
                       ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 shadow shadow-slate-950/10"
                       : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-800 dark:hover:text-slate-200"
                   }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Building Filter — แสดงเฉพาะเมื่อหอมีมากกว่า 1 อาคาร */}
            {buildings.length > 1 && (
              <select
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
                className="h-9 px-3 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-950 border border-slate-200/40 dark:border-slate-800/40 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer shrink-0"
              >
                <option value="all">ทุกอาคาร</option>
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}

            {/* View Mode Toggle (Hidden on Mobile) */}
            <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800/40 shrink-0">
              <button
                onClick={() => setViewMode("floor")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "floor"
                    ? "bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{t("rooms.view_mode_floor") || "บล็อกตามชั้น"}</span>
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
                <span>{t("rooms.view_mode_table") || "ตาราง"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4. MAIN DATA LIST: DESKTOP & MOBILE VIEWS */}
        <div>
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-2xl flex items-start gap-3.5 text-red-500 text-xs font-semibold mb-6">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p>ข้อผิดพลาดระบบ: {error}</p>
                <button onClick={() => loadData(true)} className="mt-1 text-[11px] underline flex items-center gap-1 cursor-pointer">
                  <RefreshCw className="w-3 h-3" /> ลองใหม่อีกครั้ง
                </button>
              </div>
            </div>
          )}

          {loading && rooms.length === 0 ? (
            <SkeletonLoader />
          ) : (
            <>
              {/* ========================================================= */}
              {/* TASK 2: PENDING DEPOSIT REFUND BOARD/CONTAINER           */}
              {/* ========================================================= */}
              {(() => {
                const pendingRefundRooms = rooms.filter(room => room.status === "Pending_Refund")
                if (pendingRefundRooms.length === 0) return null
                return (
                  <div className="mb-8 p-6 bg-gradient-to-br from-purple-500/[0.03] via-purple-500/[0.01] to-slate-500/[0.01] dark:from-purple-500/[0.02] dark:via-purple-500/[0.005] dark:to-transparent rounded-3xl border border-purple-100/60 dark:border-purple-900/30 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[250px] h-[120px] bg-purple-500/10 rounded-full blur-[60px] pointer-events-none" />
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-2xl border border-purple-100/80 dark:border-purple-900/20 shadow-sm">
                          <Clock className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            รอดำเนินการคืนเงินประกัน (Pending Deposit Refund)
                            <span className="px-2.5 py-0.5 text-[10px] font-extrabold text-white bg-purple-600 rounded-full shrink-0 shadow-sm shadow-purple-600/20 animate-bounce duration-1000">
                              {pendingRefundRooms.length} ห้อง
                            </span>
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5 leading-normal">
                            ห้องพักที่แจ้งย้ายออกเรียบร้อยแล้ว รอจดเลขมิเตอร์เพื่อคำนวณหักล้างหนี้และโอนเงินประกันคืน
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative z-10">
                      {pendingRefundRooms.map((room) => (
                        <div 
                          key={room.id} 
                          className="p-5 bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-950/40 rounded-2xl shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-800/80 transition-all duration-300 flex flex-col justify-between group"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <span className="inline-flex items-center gap-1 text-[9px] text-purple-600 dark:text-purple-400 font-extrabold bg-purple-50 dark:bg-purple-950/30 px-2 py-0.5 rounded border border-purple-100/80 dark:border-purple-900/20 uppercase tracking-wide">
                                แจ้งย้ายออกแล้ว
                              </span>
                              <h5 className="text-sm font-extrabold text-slate-850 dark:text-slate-100">
                                ห้อง {room.roomNumber}
                              </h5>
                            </div>
                            
                            <h4 className="text-base font-extrabold text-slate-800 dark:text-slate-100 truncate">
                              <DynamicText>{room.tenantName}</DynamicText>
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-455 mt-1.5 flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {room.tenantPhone || "ไม่มีเบอร์โทรผู้เช่า"}
                            </p>
                            
                            <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-450 dark:text-slate-500 font-semibold space-y-1.5">
                              <div className="flex justify-between">
                                <span>ค่าเช่าเดิม:</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">{room.baseRent.toLocaleString()} บ./เดือน</span>
                              </div>
                              <div className="flex justify-between">
                                <span>ระยะสัญญา:</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                  {room.leaseEnd ? new Date(room.leaseEnd).toLocaleDateString(locale === "th" ? "th-TH" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "-"}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => handleOpenRefundModal(room)}
                            className="mt-4.5 w-full h-10 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.97] cursor-pointer shadow-md shadow-purple-600/10 hover:shadow-purple-600/20"
                          >
                            <Coins className="w-4 h-4" />
                            จัดการคืนเงินประกัน
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* DESKTOP VIEW: FLOOR GRID VIEW or CONDENSED TABLE VIEW */}
              <div className="hidden md:block">
                {viewMode === "floor" ? (
                  /* FLOOR GRID VIEW: Groups rooms by floor */
                  <div className="space-y-10">
                    {sortedFloors.length > 0 ? (
                      sortedFloors.map((floor) => (
                        <div key={floor} className="space-y-4">
                          {/* Floor Header */}
                          <div className="flex items-center gap-3">
                            <div className="h-px bg-slate-200 dark:bg-slate-800/60 flex-1" />
                            <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-4 py-1.5 bg-slate-100 dark:bg-slate-950 rounded-full border border-slate-200/40 dark:border-slate-800/40">
                              ชั้นที่ {floor}
                            </h3>
                            <div className="h-px bg-slate-200 dark:bg-slate-800/60 flex-1" />
                          </div>

                          {/* Grid of Room Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {groupedRoomsByFloor[floor].map((room) => {
                              const statusDetails = getRoomStatusDetails(room)
                              const hasTenant = !!room.tenantName
                              return (
                                <div
                                  key={room.id}
                                  className={`relative p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-850 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group/card ${
                                    hasTenant 
                                      ? "hover:border-teal-500/30 dark:hover:border-teal-500/20" 
                                      : "hover:border-blue-500/30 dark:hover:border-blue-500/20"
                                  }`}
                                >
                                  {/* Card Header */}
                                  <div>
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                      <div>
                                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider block">ห้องพัก</span>
                                        <h4 className="text-base sm:text-lg font-bold text-slate-850 dark:text-slate-100 tracking-wide">
                                          ห้อง {room.roomNumber}
                                        </h4>
                                      </div>
                                      
                                      {/* Edit / Delete Buttons (Top-right corner, visible on card hover) */}
                                      {hasEditPermission && (
                                        <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 p-1 rounded-lg border border-slate-200/30 dark:border-slate-800/30 opacity-60 group-hover/card:opacity-100 transition-opacity">
                                          <button
                                            onClick={() => handleEditClick(room)}
                                            className="p-1 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 rounded hover:bg-slate-200/50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                                            title="แก้ไขข้อมูลห้องพัก"
                                          >
                                            <Edit className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteRoomTrigger(room.id, room.roomNumber)}
                                            className="p-1 text-red-500 hover:text-red-400 rounded hover:bg-slate-200/50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                                            title="ลบห้องพัก"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Room Type & Base Rent */}
                                    <div className="flex items-center justify-between gap-2 mb-4">
                                      <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-200/30 dark:border-indigo-800/30 uppercase tracking-wide">
                                        <Tag className="w-2.5 h-2.5" /> <DynamicText>{room.roomTypeName}</DynamicText>
                                      </span>
                                      <span className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-300">
                                        {room.baseRent.toLocaleString()} บ.
                                      </span>
                                    </div>

                                    {/* Status Badge */}
                                    <div className="mb-4">
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs sm:text-sm font-semibold uppercase tracking-wider ${statusDetails.badgeStyle}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${statusDetails.dotStyle}`} />
                                        {statusDetails.label}
                                      </span>
                                    </div>

                                    {/* Tenant Information block if occupied */}
                                    {hasTenant ? (
                                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/85 space-y-2 mb-4">
                                        <div className="flex items-center justify-between text-sm sm:text-base">
                                          <span className="text-slate-400 dark:text-slate-500 font-medium">ผู้เช่า:</span>
                                          <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 truncate max-w-[150px]" title={room.tenantName || ""}>
                                            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <DynamicText>{room.tenantName}</DynamicText>
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm sm:text-base">
                                          <span className="text-slate-400 dark:text-slate-500 font-medium">เบอร์โทรศัพท์:</span>
                                          <span className="font-semibold text-slate-750 dark:text-slate-300 flex items-center gap-1 font-mono">
                                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            {room.tenantPhone || "-"}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm sm:text-base">
                                          <span className="text-slate-400 dark:text-slate-500 font-medium">สถานะสัญญา:</span>
                                          <span>
                                            {(() => {
                                              const status = getContractStatus(room.leaseStart, room.leaseEnd)
                                              if (status) {
                                                return (
                                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs sm:text-sm ${status.style}`}>
                                                    {status.label}
                                                  </span>
                                                )
                                              }
                                              return <span className="text-slate-400 dark:text-slate-600">-</span>
                                            })()}
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-center h-20 text-slate-400 dark:text-slate-600 text-xs sm:text-sm mb-4">
                                        ไม่มีผู้เช่าปัจจุบัน (ห้องว่าง)
                                      </div>
                                    )}
                                  </div>

                                  {/* Card Actions (Footer) */}
                                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 mt-auto">
                                    {/* VACANT: Generate LINE Link */}
                                    {!room.tenantName && (
                                      <button
                                        onClick={() => handleOpenLineLinkModal(room)}
                                        className="w-full h-9 text-xs font-bold text-white bg-[#06C755] hover:bg-[#05b34c] rounded-xl hover:-translate-y-0.5 transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                      >
                                        <Share2 className="w-3.5 h-3.5 shrink-0" />
                                        เจนลิงก์ LINE
                                      </button>
                                    )}

                                    {/* WAITING FOR LINE: Generate/Copy Link & View Details/Checkout */}
                                    {room.tenantName && !room.lineUserId && (
                                      <div className="flex gap-1.5">
                                        <button
                                          onClick={() => handleOpenLineLinkModal(room)}
                                          className="flex-[0.8] h-9 text-[11px] sm:text-xs tracking-tight font-bold text-[#05a33c] dark:text-[#06d65f] bg-[#06C755]/10 border border-[#06C755]/20 hover:bg-[#06C755] hover:text-white dark:hover:text-white hover:border-transparent rounded-xl hover:-translate-y-0.5 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap"
                                          title="เจนลิงก์ LINE"
                                        >
                                          <Share2 className="w-3.5 h-3.5 shrink-0" />
                                          เจนลิงก์
                                        </button>
                                        <button
                                          onClick={() => handleOpenDetailModal(room)}
                                          className="flex-[1.7] h-9 text-[10px] sm:text-[11px] tracking-tight font-bold text-white bg-teal-600 hover:bg-teal-500 rounded-xl hover:-translate-y-0.5 transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                          ดูรายละเอียด/ย้ายออก
                                        </button>
                                      </div>
                                    )}

                                    {/* REGISTERED: View details / checkout */}
                                    {room.tenantName && room.lineUserId && (
                                      <div className="flex gap-1.5 w-full">
                                        <button
                                          onClick={() => handleDisconnectLineTrigger(room)}
                                          className="flex-[1.1] h-9 text-[10px] sm:text-[11px] tracking-tight font-bold text-red-600 dark:text-red-400 bg-red-550/10 border border-red-500/20 hover:bg-red-600 hover:text-white dark:hover:text-white hover:border-transparent rounded-xl hover:-translate-y-0.5 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap"
                                          title="หยุดเชื่อมไลน์"
                                        >
                                          <Unlink className="w-3.5 h-3.5 shrink-0" />
                                          หยุดเชื่อมไลน์
                                        </button>
                                        <button
                                          onClick={() => handleOpenDetailModal(room)}
                                          className="flex-[1.7] h-9 text-[10px] sm:text-[11px] tracking-tight font-bold text-white bg-teal-600 hover:bg-teal-500 rounded-xl hover:-translate-y-0.5 transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                          ดูรายละเอียด/ย้ายออก
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                        <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                          <div className="p-3 bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-full border border-slate-200/50">
                            <Home className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-700 dark:text-slate-300 text-xs">{t("rooms.empty_search_title")}</p>
                            <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-1">{t("rooms.empty_search_desc")}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* CONDENSED TABLE VIEW: Elegant 5-Column layout to eliminate crowding */
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-900/60 shadow-sm">
                    <table className="w-full text-left text-sm sm:text-base border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-bold text-xs sm:text-sm border-b border-slate-200/60 dark:border-slate-900/60">
                          <th className="p-4 w-40">{t("rooms.table_header_room_type")}</th>
                          <th className="p-4 w-48">{t("rooms.table_header_status_rent")}</th>
                          <th className="p-4">{t("rooms.table_header_tenant_contract")}</th>
                          <th className="p-4 w-72">{t("rooms.table_header_tenant_mgmt")}</th>
                          <th className="p-4 text-center w-28 border-l border-slate-100 dark:border-slate-900/50">{t("rooms.table_header_room_settings")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-900/50">
                        {filteredRooms.length > 0 ? (
                          filteredRooms.map((room) => {
                            const statusDetails = getRoomStatusDetails(room)
                            return (
                              <tr key={room.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/15 transition-colors">
                                {/* 1. Room & Type */}
                                <td className="p-4">
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-850 dark:text-slate-100 text-sm sm:text-base tracking-wide">ห้อง {room.roomNumber}</span>
                                      <span className="inline-flex items-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-850 px-1.5 py-0.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50">ชั้น {room.floor || getFloorNumber(room)}</span>
                                    </div>
                                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded w-max border border-indigo-200/30 dark:border-indigo-800/30">
                                      <Tag className="w-3.5 h-3.5" /> <DynamicText>{room.roomTypeName}</DynamicText>
                                    </span>
                                  </div>
                                </td>
                                
                                {/* 2. Status & Monthly Rent */}
                                <td className="p-4">
                                  <div className="flex flex-col gap-1.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs sm:text-sm font-semibold uppercase tracking-wider w-max ${statusDetails.badgeStyle}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${statusDetails.dotStyle}`} />
                                      {statusDetails.label}
                                    </span>
                                    <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-450">
                                      ค่าเช่า: {room.baseRent.toLocaleString()} บาท/ด.
                                    </span>
                                  </div>
                                </td>

                                {/* 3. Tenant & Contract */}
                                <td className="p-4">
                                  {room.tenantName ? (
                                    <div className="flex flex-col gap-1.5">
                                      <div className="flex items-center gap-1.5 text-sm sm:text-base text-slate-800 dark:text-slate-200 font-bold">
                                        <Users className="w-4 h-4 text-slate-400 shrink-0" />
                                        <span className="truncate max-w-[140px]" title={room.tenantName}><DynamicText>{room.tenantName}</DynamicText></span>
                                      </div>
                                      {room.tenantPhone && (
                                        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-550 dark:text-slate-400 font-mono">
                                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                          <span>{room.tenantPhone}</span>
                                        </div>
                                      )}
                                      {(() => {
                                        const status = getContractStatus(room.leaseStart, room.leaseEnd)
                                        if (status) {
                                          return (
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs sm:text-sm w-max mt-0.5 ${status.style}`}>
                                              {status.label}
                                            </span>
                                          )
                                        }
                                        return null
                                      })()}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                                  )}
                                </td>

                                {/* 4. Actions dependent on Status */}
                                <td className="p-4">
                                  <div className="flex items-center justify-start gap-2">
                                    {/* VACANT: Generate LINE Link */}
                                    {!room.tenantName && (
                                      <button
                                        onClick={() => handleOpenLineLinkModal(room)}
                                        className="h-9 px-3 sm:px-4 text-xs sm:text-sm font-bold text-white bg-[#06C755] hover:bg-[#05b34c] rounded-lg hover:-translate-y-0.5 transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                      >
                                        <Share2 className="w-4 h-4 shrink-0" />
                                        เจนลิงก์ LINE
                                      </button>
                                    )}

                                    {/* WAITING FOR LINE: Generate/Copy Link & View Details/Checkout */}
                                    {room.tenantName && !room.lineUserId && (
                                      <>
                                        <button
                                          onClick={() => handleOpenLineLinkModal(room)}
                                          className="h-9 px-3 text-xs sm:text-sm tracking-tight font-bold text-[#05a33c] dark:text-[#06d65f] bg-[#06C755]/10 border border-[#06C755]/30 hover:bg-[#06C755] hover:text-white rounded-lg hover:-translate-y-0.5 transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                        >
                                          <Share2 className="w-4 h-4 shrink-0" />
                                          เจนลิงก์ LINE
                                        </button>
                                        <button
                                          onClick={() => handleOpenDetailModal(room)}
                                          className="h-9 px-3 text-xs sm:text-sm tracking-tight font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-900/40 hover:bg-teal-600 hover:text-white dark:hover:text-white hover:border-transparent rounded-lg hover:-translate-y-0.5 transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                        >
                                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                                          ดูรายละเอียด/ย้ายออก
                                        </button>
                                      </>
                                    )}

                                    {/* REGISTERED: View details / checkout */}
                                    {room.tenantName && room.lineUserId && (
                                      <>
                                        <button
                                          onClick={() => handleDisconnectLineTrigger(room)}
                                          className="h-9 px-3 text-xs sm:text-sm tracking-tight font-bold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-600 hover:text-white rounded-lg hover:-translate-y-0.5 transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                        >
                                          <Unlink className="w-4 h-4 shrink-0" />
                                          หยุดเชื่อมไลน์
                                        </button>
                                        <button
                                          onClick={() => handleOpenDetailModal(room)}
                                          className="h-9 px-3 text-xs sm:text-sm tracking-tight font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-900/40 hover:bg-teal-600 hover:text-white dark:hover:text-white hover:border-transparent rounded-lg hover:-translate-y-0.5 transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                        >
                                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                                          ดูรายละเอียด/ย้ายออก
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>

                                {/* 5. Edit/Delete room */}
                                <td className="p-4 text-center border-l border-slate-100 dark:border-slate-900/50">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {hasEditPermission ? (
                                      <>
                                        <button 
                                          onClick={() => handleEditClick(room)}
                                          className="p-1.5 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-slate-100 dark:hover:bg-slate-900/50 rounded-lg transition-colors cursor-pointer"
                                          title="แก้ไขข้อมูลห้องพัก"
                                        >
                                          <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteRoomTrigger(room.id, room.roomNumber)}
                                          className="p-1.5 text-red-500 hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-900/50 rounded-lg transition-colors cursor-pointer"
                                          title="ลบห้องพัก"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-medium">ไม่มีสิทธิ์</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                              {/* Empty State Block */}
                              <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                                <div className="p-3 bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-full border border-slate-200/50">
                                  <Home className="w-6 h-6" />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-700 dark:text-slate-300 text-xs">{t("rooms.empty_search_title")}</p>
                                  <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-1">{t("rooms.empty_search_desc")}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* MOBILE VIEW: PREMIUM CARD-BASED LIST (visible on mobile, hidden on desktop) */}
              <div className="block md:hidden space-y-4">
                {filteredRooms.length > 0 ? (
                  filteredRooms.map((room) => {
                    const statusDetails = getRoomStatusDetails(room)
                    return (
                      <div 
                        key={room.id}
                        className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-850 shadow-sm space-y-4 hover:border-blue-500/40 dark:hover:border-blue-500/40 transition-all duration-300"
                      >
                        {/* Mobile Header Card */}
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider block">ห้องพัก</span>
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-slate-850 dark:text-slate-100 tracking-wide">ห้อง {room.roomNumber}</span>
                              <span className="inline-flex items-center text-[9px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-700/50">ชั้น {room.floor || getFloorNumber(room)}</span>
                            </div>
                          </div>
                          <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wider ${statusDetails.badgeStyle}`}>
                            {statusDetails.label}
                          </span>
                        </div>

                        {/* Mobile Info Body */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500 font-medium">ประเภท & ค่าเช่า:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              <DynamicText>{room.roomTypeName}</DynamicText> • {room.baseRent.toLocaleString()} บ.
                            </span>
                          </div>
                          
                          {/* Tenant Info */}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500 font-medium">ผู้เช่าปัจจุบัน:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              {room.tenantName ? (
                                <span className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" /> <DynamicText>{room.tenantName}</DynamicText>
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                              )}
                            </span>
                          </div>

                          {/* Tenant Phone */}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500 font-medium">เบอร์โทรศัพท์:</span>
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-350">
                              {room.tenantPhone ? (
                                <a href={`tel:${room.tenantPhone}`} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 underline decoration-dotted">
                                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {room.tenantPhone}
                                </a>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                              )}
                            </span>
                          </div>

                          {/* Contract Status (Mobile) */}
                          {room.tenantName && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 dark:text-slate-500 font-medium">สถานะสัญญา:</span>
                              <span>
                                {(() => {
                                  const status = getContractStatus(room.leaseStart, room.leaseEnd)
                                  if (status) {
                                    return (
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] ${status.style}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
                                        {status.label}
                                      </span>
                                    )
                                  }
                                  return <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                                })()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Mobile Footer Buttons (Dynamic lease triggers and setting buttons) */}
                        <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                          
                          {/* Primary Action Row based on state */}
                          <div className="flex flex-col sm:flex-row gap-2">
                            {/* VACANT: Generate LINE Link */}
                            {!room.tenantName && (
                              <button
                                onClick={() => handleOpenLineLinkModal(room)}
                                className="flex-1 py-3 px-4 text-xs font-bold text-white bg-[#06C755] hover:bg-[#05b34c] rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 h-11 whitespace-nowrap"
                              >
                                <Share2 className="w-4 h-4 shrink-0" />
                                เจนลิงก์ LINE
                              </button>
                            )}

                             {/* WAITING: Generate LIFF LINK & View Details/Checkout */}
                             {room.tenantName && !room.lineUserId && (
                               <>
                                 <button
                                   onClick={() => handleOpenLineLinkModal(room)}
                                   className="flex-1 py-3 px-4 text-xs tracking-tight font-bold text-[#05a33c] dark:text-[#06d65f] bg-[#06C755]/10 border border-[#06C755]/30 hover:bg-[#06C755] hover:text-white dark:hover:text-white hover:border-transparent rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 h-11 whitespace-nowrap"
                                 >
                                   <Share2 className="w-4 h-4 shrink-0" />
                                   เจนลิงก์ LINE
                                 </button>
                                 <button
                                   onClick={() => handleOpenDetailModal(room)}
                                   className="flex-1 py-3 px-4 text-xs tracking-tight font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-900/40 hover:bg-teal-600 hover:text-white dark:hover:text-white hover:border-transparent rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 h-11 whitespace-nowrap"
                                 >
                                   <CheckCircle2 className="w-4 h-4 shrink-0" />
                                   ดูรายละเอียด/ย้ายออก
                                 </button>
                               </>
                             )}

                             {/* OCCUPIED: View Details / Checkout */}
                             {room.tenantName && room.lineUserId && (
                               <>
                                 <button
                                   onClick={() => handleOpenDetailModal(room)}
                                   className="flex-1 py-3 px-4 text-xs tracking-tight font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-900/40 hover:bg-teal-600 hover:text-white dark:hover:text-white hover:border-transparent rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 h-11 whitespace-nowrap"
                                 >
                                   <CheckCircle2 className="w-4 h-4 shrink-0" />
                                   ดูรายละเอียด/ย้ายออก
                                 </button>
                                 <button
                                   onClick={() => handleDisconnectLineTrigger(room)}
                                   className="flex-1 py-3 px-4 text-xs tracking-tight font-bold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-600 hover:text-white dark:hover:text-white hover:border-transparent rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 h-11 whitespace-nowrap"
                                 >
                                   <Unlink className="w-4 h-4 shrink-0" />
                                   หยุดเชื่อมไลน์
                                 </button>
                               </>
                             )}
                          </div>

                          {/* Secondary Row: Room Configuration */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditClick(room)}
                              className="flex-1 py-2 px-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-250/50 dark:border-slate-800 transition-all flex items-center justify-center gap-1 h-9 active:scale-95 duration-200 cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" /> แก้ไขข้อมูลห้อง
                            </button>
                            <button
                              onClick={() => handleDeleteRoomTrigger(room.id, room.roomNumber)}
                              className="flex-1 py-2 px-3 text-[11px] font-bold text-red-500 dark:text-red-400 bg-slate-50 hover:bg-red-50 dark:bg-slate-900 dark:hover:bg-red-950/20 rounded-lg border border-slate-250/50 dark:border-slate-800 transition-all flex items-center justify-center gap-1 h-9 active:scale-95 duration-200 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> ลบห้องพัก
                            </button>
                          </div>

                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-12 bg-slate-50/50 dark:bg-slate-900/40 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 text-slate-400 dark:text-slate-500 text-xs">
                    ไม่พบข้อมูลห้องพักหรือตึกตามที่ระบุค้นหา
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* SECTION: SECURITY DEPOSIT AND CANCELLATION LEDGER 40(8) */}
          {/* ========================================================= */}
          <div className="glass-panel rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-5 md:p-6 space-y-4 mt-12 md:mt-16">
            <div className="pb-1.5 border-b border-slate-100 dark:border-slate-800/40">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-red-500" /> 
                {t("rooms.cancellation_history_title")}
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
                {t("rooms.cancellation_history_desc")}
              </p>
            </div>

            {activeCancelledContracts.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200/50 dark:border-slate-800/80 bg-white dark:bg-slate-950/20">
                <table className="w-full text-left text-sm sm:text-base border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 text-slate-500 dark:text-slate-400 font-bold text-xs sm:text-sm">
                      <th className="py-3 px-4">{t("rooms.table_header_room_tenant")}</th>
                      <th className="py-3 px-4 text-center">{t("rooms.table_header_checkout_date")}</th>
                      <th className="py-3 px-4 text-right">{t("rooms.table_header_deposit")}</th>
                      <th className="py-3 px-4 text-right">{t("rooms.table_header_actual_refund")}</th>
                      <th className="py-3 px-4 text-right">{t("rooms.table_header_forfeited")}</th>
                      <th className="py-3 px-4 text-center w-28">{t("rooms.table_header_action")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    {activeCancelledContracts.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/5 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-700 dark:text-slate-300">
                          ห้อง {c.roomNumber} - <DynamicText>{c.tenantName}</DynamicText>
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-500 dark:text-slate-400 font-semibold font-mono text-xs sm:text-sm">
                          {c.cancellationDate ? new Date(c.cancellationDate).toLocaleDateString(locale === "th" ? "th-TH" : "en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }) : "-"}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-455 font-bold">
                          {Number(c.depositAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-455 font-bold">
                          {Number((c.actualRefund ?? c.refundedAmount) ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-extrabold text-red-600 dark:text-red-400 bg-red-500/5">
                          {Number(c.forfeitedAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleEditCancelledContract(c)}
                              className="p-1.5 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 bg-slate-50 hover:bg-purple-50 dark:bg-slate-900 dark:hover:bg-purple-950/20 border border-slate-200/40 dark:border-slate-800 rounded-lg transition-all cursor-pointer active:scale-90"
                              title="แก้ไขประวัติ"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCancellation(c.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 dark:bg-slate-900 dark:hover:bg-red-950/20 border border-slate-200/40 dark:border-slate-800 rounded-lg transition-all cursor-pointer active:scale-90"
                              title="ลบประวัติ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-col sm:flex-row justify-between items-center p-4 bg-slate-50/50 dark:bg-slate-900/5 border-t border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-500 dark:text-slate-400 gap-2 font-bold">
                  <span>จำนวนสัญญาที่ยกเลิกสะสมในระบบ: {activeCancelledContracts.length} รายการ</span>
                  <span className="text-red-600 dark:text-red-400 font-extrabold font-mono text-xs md:text-sm bg-red-50 dark:bg-red-950/20 px-3 py-1 rounded-xl border border-red-150 dark:border-red-900/30 shadow-sm shadow-red-500/5 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    รวมยอดเงินริบสะสม: {activeCancelledContracts.reduce((sum, c) => sum + Number(c.forfeitedAmount || 0), 0).toLocaleString()} บาท
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 border border-dashed border-slate-250 dark:border-slate-800/80 text-slate-400 dark:text-slate-500 text-xs">
                <ShieldCheck className="w-8 h-8 text-slate-350 dark:text-slate-600 mx-auto mb-2.5 opacity-60" />
                <p className="font-bold">{t("rooms.cancellation_empty_title")}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500/80 mt-1">{t("rooms.cancellation_empty_desc")}</p>
              </div>
            )}
          </div>

        </div>

        {/* MOBILE STICKY BOTTOM ACTION BAR (Strictly Adaptive, handles notches with pb-safe) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 p-3.5 flex items-center justify-between gap-3.5 z-40 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          {!hasEditPermission ? (
            <div className="flex-1 h-12 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-bold px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-sm">
              <AlertCircle className="w-5 h-5 text-amber-500" /> {t("rooms.read_only_mode")}
            </div>
          ) : (
            <>
              <button
                onClick={() => setTypesModalOpen(true)}
                title="ตั้งค่าประเภทห้องพัก"
                className="shrink-0 w-12 h-12 bg-slate-100 hover:bg-slate-200 active:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 dark:active:bg-slate-700/80 text-slate-700 dark:text-slate-200 font-bold rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <Settings className="w-5 h-5 text-indigo-500" />
              </button>

              <button
                onClick={() => setBuildingsModalOpen(true)}
                title="จัดการอาคาร"
                className="shrink-0 w-12 h-12 bg-slate-100 hover:bg-slate-200 active:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 dark:active:bg-slate-700/80 text-slate-700 dark:text-slate-200 font-bold rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <Building className="w-5 h-5 text-teal-500" />
              </button>

              <button
                onClick={handleAddClick}
                className="flex-1 h-12 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-500/20 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <Plus className="w-5 h-5" /> เพิ่มห้องพักใหม่
              </button>
            </>
          )}
        </div>

        {/* ========================================================= */}
        {/* MODAL 1: ADD/EDIT ROOM MODAL */}
        {/* ========================================================= */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-6 relative overflow-hidden max-h-[92vh] md:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              {/* Ambient decoration */}
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-blue-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex justify-between items-center shrink-0 relative z-10">
                <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Home className="w-5 h-5 text-blue-500" /> 
                  {editingRoom ? "แก้ไขข้อมูลห้องพัก" : "เพิ่มห้องพักใหม่ (Add Room)"}
                </h3>
                <button 
                  onClick={() => setModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <form onSubmit={handleSubmitRoomForm} className="space-y-4 relative z-10 overflow-y-auto flex-1 pr-1 pb-1">
                {roomFormError && (
                  <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2 animate-pulse">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
                    <span>{roomFormError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">หมายเลขห้องพัก (Room Number)</label>
                  <input
                    type="text"
                    required
                    placeholder="ระบุหมายเลขห้องพัก เช่น 101, 102..."
                    className="w-full h-12 md:h-10 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-medium"
                    value={newRoomNumber}
                    onChange={(e) => {
                      setNewRoomNumber(e.target.value)
                      // เดาเลขชั้นให้อัตโนมัติเฉพาะตอนเพิ่มห้องพักใหม่
                      if (!editingRoom) {
                        setNewRoomFloor(guessFloorNumber(e.target.value))
                      }
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ชั้นของห้องพัก (Floor)</label>
                  <input
                    type="text"
                    required
                    placeholder="ระบุเลขชั้น เช่น 1, 2..."
                    className="w-full h-12 md:h-10 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-medium"
                    value={newRoomFloor}
                    onChange={(e) => setNewRoomFloor(e.target.value)}
                  />
                </div>

                {buildings.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">อาคาร (Building)</label>
                    <select
                      required
                      className="w-full h-12 md:h-10 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-base md:text-xs transition-colors cursor-pointer"
                      value={newRoomBuildingId}
                      onChange={(e) => setNewRoomBuildingId(e.target.value)}
                    >
                      <option value="" disabled>-- เลือกอาคาร --</option>
                      {buildings.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ประเภทห้องพัก (Room Type)</label>
                  <select
                    required
                    className="w-full h-12 md:h-10 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-base md:text-xs transition-colors cursor-pointer"
                    value={selectedRoomTypeId}
                    onChange={(e) => handleRoomTypeChange(e.target.value)}
                  >
                    <option value="" disabled>-- เลือกประเภทห้อง --</option>
                    {roomTypes.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.name} (ค่าเช่ามาตรฐาน: {type.default_rent.toLocaleString()} บาท)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ค่าเช่าสุทธิรายเดือน (บาท / เดือน)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-450">
                      <DollarSign className="w-4 h-4 md:w-3.5 md:h-3.5" />
                    </span>
                    <input
                      type="number"
                      readOnly
                      disabled
                      placeholder="ระบบจะเลือกราคาตามประเภทห้องโดยอัตโนมัติ"
                      className="w-full h-12 md:h-10 pl-9 pr-4 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-xl text-slate-500 dark:text-slate-400 text-base md:text-xs transition-colors cursor-not-allowed font-bold"
                      value={newBaseRent}
                    />
                  </div>
                  <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-semibold flex items-center gap-1 leading-normal">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    🔒 ล็อคตามราคามาตรฐานของประเภทห้องที่เลือก
                  </span>
                </div>

                {/* Waive Minimum Charges Config */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-3.5 rounded-2xl border border-slate-150 dark:border-slate-800/80 space-y-3.5">
                  <span className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ตั้งค่าการยกเว้นค่าบริการขั้นต่ำ</span>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label htmlFor="waiveElectricMin" className="text-xs md:text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">ยกเว้นหน่วยขั้นต่ำค่าไฟ</label>
                      <p className="text-[10px] text-slate-450 dark:text-slate-500">คำนวณตามหน่วยใช้งานจริง ไม่ใช้หน่วยขั้นต่ำ</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        id="waiveElectricMin"
                        className="sr-only peer" 
                        checked={waiveElectricMin}
                        onChange={(e) => setWaiveElectricMin(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-850 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-650 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-150 dark:border-slate-800/60 pt-3">
                    <div className="space-y-0.5">
                      <label htmlFor="waiveWaterMin" className="text-xs md:text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">ยกเว้นหน่วยขั้นต่ำค่าน้ำ</label>
                      <p className="text-[10px] text-slate-450 dark:text-slate-500">คำนวณตามหน่วยใช้งานจริง ไม่ใช้หน่วยขั้นต่ำ</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        id="waiveWaterMin"
                        className="sr-only peer" 
                        checked={waiveWaterMin}
                        onChange={(e) => setWaiveWaterMin(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-850 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-650 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                {/* Extra Expenses Config */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-150 dark:border-slate-800/80 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ค่าใช้จ่ายเสริมรายเดือน (สูงสุด 5 รายการ)</span>
                    <button
                      type="button"
                      disabled={extraExpenses.length >= 5}
                      onClick={() => setExtraExpenses([...extraExpenses, { name: "", amount: 0 }])}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      เพิ่มรายการ
                    </button>
                  </div>

                  {extraExpenses.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold italic text-center py-2">
                      ไม่มีค่าใช้จ่ายเสริมรายเดือน
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {extraExpenses.map((exp, idx) => (
                        <div key={idx} className="flex gap-2 items-center bg-white dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-850 shadow-sm animate-in fade-in zoom-in-95 duration-150">
                          <input
                            type="text"
                            required
                            placeholder="เช่น ค่าเช่าตู้เย็น, ที่จอดรถ..."
                            className="flex-1 h-9 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-xs font-semibold placeholder-slate-400"
                            value={exp.name}
                            onChange={(e) => {
                              const updated = [...extraExpenses]
                              updated[idx].name = e.target.value
                              setExtraExpenses(updated)
                            }}
                          />
                          <div className="relative w-[100px] shrink-0">
                            <input
                              type="number"
                              required
                              min="0"
                              placeholder="บาท"
                              className="w-full h-9 pl-3 pr-7 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-xs font-bold text-right"
                              value={exp.amount || ""}
                              onChange={(e) => {
                                const updated = [...extraExpenses]
                                updated[idx].amount = Number(e.target.value)
                                setExtraExpenses(updated)
                              }}
                            />
                            <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-bold text-slate-400 pointer-events-none">
                              บ.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = extraExpenses.filter((_, i) => i !== idx)
                              setExtraExpenses(updated)
                            }}
                            className="p-1.5 text-red-500 hover:text-red-650 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    disabled={formSubmitting}
                    className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer"
                  >
                    ยกเลิกและปิด
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting || roomTypes.length === 0}
                    className="order-1 sm:order-2 w-full sm:flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow shadow-blue-600/10 transition-all duration-150 active:scale-95 cursor-pointer"
                  >
                    {formSubmitting ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : "บันทึกข้อมูลห้องพัก"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 2: MANAGE ROOM TYPES MODAL */}
        {/* ========================================================= */}
        {typesModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-lg bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 relative max-h-[92vh] md:max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-indigo-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex justify-between items-center mb-4 shrink-0 relative z-10">
                <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-indigo-500 dark:text-indigo-400" /> จัดการประเภทห้องพัก
                </h3>
                <button 
                  onClick={() => setTypesModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                <form onSubmit={handleSubmitTypeForm} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/80 space-y-4 shrink-0 relative z-10">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200/50 dark:border-slate-800/55 pb-2">
                    <Settings className="w-3.5 h-3.5 text-indigo-500" />
                    {editingType ? "แก้ไขประเภทห้องพัก" : "เพิ่มประเภทห้องพักใหม่"}
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ชื่อประเภทห้องพัก</label>
                      <input
                        type="text"
                        required
                        placeholder="เช่น ห้องพัดลมสตูดิโอ, แอร์พรีเมียม..."
                        className="w-full h-12 md:h-10 px-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-medium"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ค่าเช่ารายเดือนเริ่มต้น</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                          <DollarSign className="w-4 h-4 md:w-3.5 md:h-3.5" />
                        </span>
                        <input
                          type="number"
                          required
                          inputMode="numeric"
                          placeholder="กรอกจำนวนเงินบาท..."
                          className="w-full h-12 md:h-10 pl-9 pr-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-bold font-mono"
                          value={newTypeRent}
                          onChange={(e) => setNewTypeRent(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2.5 pt-1 border-t border-slate-200/30 dark:border-slate-800/40">
                    {editingType && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingType(null)
                          setNewTypeName("")
                          setNewTypeRent(4000)
                        }}
                        className="px-4 h-11 md:h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400 text-sm md:text-xs rounded-xl font-semibold transition-colors cursor-pointer active:scale-95 duration-150"
                      >
                        ยกเลิก
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={typeSubmitting}
                      className="px-5 h-11 md:h-9 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm md:text-xs font-bold rounded-xl transition-all shadow hover:-translate-y-0.5 active:scale-95 duration-200 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {typeSubmitting ? (
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : editingType ? "อัปเดตประเภท" : "สร้างประเภทห้อง"}
                    </button>
                  </div>
                </form>

                <div className="space-y-3 shrink-0 relative z-10">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">ประเภทห้องพักปัจจุบัน</h4>
                  {roomTypes.length > 0 ? (
                    <div className="divide-y divide-slate-150 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
                      {roomTypes.map(type => (
                        <div key={type.id} className="flex justify-between items-center p-3.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                          <div className="space-y-0.5 min-w-0 pr-2">
                            <div className="font-extrabold text-sm md:text-xs text-slate-800 dark:text-slate-200 truncate">{type.name}</div>
                            <div className="text-[11px] md:text-[10px] text-indigo-500 dark:text-indigo-400 font-bold">อัตราเช่ามาตรฐาน: {type.default_rent.toLocaleString()} บาท</div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => {
                                setEditingType(type)
                                setNewTypeName(type.name)
                                setNewTypeRent(type.default_rent)
                              }}
                              className="p-2.5 md:p-1.5 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 rounded-xl border border-slate-200/50 dark:border-slate-800 transition-colors cursor-pointer active:scale-95 duration-150"
                              title="แก้ไขประเภทห้อง"
                            >
                              <Edit className="w-4 h-4 md:w-3.5 md:h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTypeTrigger(type.id, type.name)}
                              className="p-2.5 md:p-1.5 text-red-500 hover:text-red-400 bg-white hover:bg-red-50 dark:bg-slate-900 dark:hover:bg-red-950/20 rounded-xl border border-slate-200/50 dark:border-slate-800 transition-colors cursor-pointer active:scale-95 duration-150"
                              title="ลบประเภทห้อง"
                            >
                              <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-slate-50/50 dark:bg-slate-900/20 rounded-xl border border-slate-200/50 dark:border-slate-800/80 text-slate-400 dark:text-slate-500 text-xs">
                      ยังไม่มีข้อมูลประเภทห้องพัก กรุณากรอกแบบฟอร์มด้านบน
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: จัดการอาคาร (ย้ายมาจากหน้าตั้งค่าคุณสมบัติ) */}
        {/* ========================================================= */}
        {buildingsModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-lg bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 relative max-h-[92vh] md:max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-teal-500/10 rounded-full blur-[50px] pointer-events-none" />

              <div className="flex justify-between items-center mb-4 shrink-0 relative z-10">
                <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Building className="w-5 h-5 text-teal-500" /> จัดการอาคาร
                </h3>
                <button
                  onClick={() => setBuildingsModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs md:text-sm text-slate-450 dark:text-slate-400 mb-4 shrink-0 relative z-10">
                ถ้าหอของคุณมีหลายอาคาร แต่ละอาคารมีมิเตอร์หลัก/บิลไฟฟ้า-น้ำประปาแยกกันคนละใบ ให้เพิ่มอาคารที่นี่ แล้วเลือกอาคารให้แต่ละห้องพักตอนเพิ่ม/แก้ไขห้อง — เลือกดูเฉพาะห้องของอาคารใดอาคารหนึ่งได้จากตัวกรอง "อาคาร" ในหน้ารายการห้องพัก
              </p>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 relative z-10">
                {buildingsLoading ? (
                  <p className="text-xs text-slate-400">กำลังโหลดรายชื่ออาคาร...</p>
                ) : buildings.length > 0 ? (
                  <div className="divide-y divide-slate-150 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
                    {buildings.map((b) => (
                      <div key={b.id} className="p-3.5">
                        {editingBuildingId === b.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingBuildingName}
                              onChange={(e) => setEditingBuildingName(e.target.value)}
                              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold outline-none focus:border-teal-500"
                            />
                            <input
                              type="text"
                              value={editingBuildingCode}
                              onChange={(e) => setEditingBuildingCode(e.target.value)}
                              placeholder="รหัสอาคารสั้น ๆ เช่น A (ใช้กำกับเลขห้องที่ซ้ำกันและเลขใบกำกับ)"
                              maxLength={8}
                              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm outline-none focus:border-teal-500"
                            />
                            <input
                              type="text"
                              value={editingBuildingAddress}
                              onChange={(e) => setEditingBuildingAddress(e.target.value)}
                              placeholder="ที่อยู่ (ไม่บังคับ)"
                              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm outline-none focus:border-teal-500"
                            />
                            <div className="flex justify-end gap-2 pt-1">
                              <button type="button" onClick={() => setEditingBuildingId(null)} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg cursor-pointer">
                                ยกเลิก
                              </button>
                              <button type="button" onClick={() => handleSaveEditBuilding(b.id)} disabled={buildingSubmitting} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50">
                                บันทึก
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                                {b.name}
                                {b.code && <span className="ml-2 px-1.5 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 text-[11px] font-extrabold align-middle">{b.code}</span>}
                              </p>
                              {b.address && <p className="text-xs text-slate-450 truncate">{b.address}</p>}
                            </div>
                            {hasEditPermission && (
                              <div className="flex gap-2 shrink-0">
                                <button
                                  onClick={() => handleStartEditBuilding(b)}
                                  className="p-2.5 md:p-1.5 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 rounded-xl border border-slate-200/50 dark:border-slate-800 transition-colors cursor-pointer active:scale-95 duration-150"
                                  title="แก้ไขอาคาร"
                                >
                                  <Edit className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteBuilding(b.id)}
                                  disabled={buildingSubmitting}
                                  className="p-2.5 md:p-1.5 text-red-500 hover:text-red-400 bg-white hover:bg-red-50 dark:bg-slate-900 dark:hover:bg-red-950/20 rounded-xl border border-slate-200/50 dark:border-slate-800 transition-colors cursor-pointer active:scale-95 duration-150 disabled:opacity-50"
                                  title="ลบอาคาร"
                                >
                                  <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 bg-slate-50/50 dark:bg-slate-900/20 rounded-xl border border-slate-200/50 dark:border-slate-800/80 text-slate-400 dark:text-slate-500 text-xs">
                    ยังไม่มีข้อมูลอาคาร กรุณาเพิ่มอาคารแรกด้านล่าง
                  </div>
                )}

                {hasEditPermission && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/80 space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200/50 dark:border-slate-800/55 pb-2">
                      <Plus className="w-3.5 h-3.5 text-teal-500" /> เพิ่มอาคารใหม่
                    </h4>
                    <input
                      type="text"
                      placeholder="ชื่ออาคาร เช่น ตึก A, อาคาร 2..."
                      value={newBuildingName}
                      onChange={(e) => setNewBuildingName(e.target.value)}
                      className="w-full h-11 px-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 text-sm transition-colors placeholder-slate-400 font-medium"
                    />
                    <input
                      type="text"
                      placeholder="รหัสอาคารสั้น ๆ เช่น A (ใช้กำกับเลขห้องที่ซ้ำกันและเลขใบกำกับ)"
                      value={newBuildingCode}
                      onChange={(e) => setNewBuildingCode(e.target.value)}
                      maxLength={8}
                      className="w-full h-11 px-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 text-sm transition-colors placeholder-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="ที่อยู่ (ไม่บังคับ)"
                      value={newBuildingAddress}
                      onChange={(e) => setNewBuildingAddress(e.target.value)}
                      className="w-full h-11 px-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 text-sm transition-colors placeholder-slate-400"
                    />
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleAddBuilding}
                        disabled={buildingSubmitting || !newBuildingName.trim()}
                        className="px-5 h-10 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {buildingSubmitting ? (
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : "+ เพิ่มอาคาร"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 3: UNIFIED LEASE CONTRACT MODAL (ทำสัญญา/เพิ่มผู้เช่า) */}
        {/* ========================================================= */}
        {contractModalOpen && selectedRoom && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-6 relative overflow-hidden max-h-[92vh] md:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-blue-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex justify-between items-center shrink-0 relative z-10">
                <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  {contractSuccess ? (
                    <>
                      <Share2 className="w-5 h-5 text-emerald-500" /> 
                      เจนลิงก์ LINE (ห้อง {selectedRoom.roomNumber})
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-5 h-5 text-blue-500" /> 
                      ทำสัญญาเช่าห้อง {selectedRoom.roomNumber}
                    </>
                  )}
                </h3>
                <button 
                  onClick={() => setContractModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {contractSuccess ? (
                <div className="space-y-4 relative z-10 overflow-y-auto flex-1 pr-1 pb-1">
                  
                  {/* Visual success/share note */}
                  <div className="p-4 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10 dark:border-emerald-500/20 text-xs text-emerald-900/90 dark:text-emerald-100/90 space-y-2 animate-in fade-in duration-300">
                    <div className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ทำสัญญาสำเร็จ! กรุณาส่งลิงก์นี้ให้ผู้เช่าเชื่อมโยง LINE
                    </div>
                    <p className="leading-relaxed text-emerald-800/80 dark:text-emerald-300/80">
                      ลิงก์ LINE LIFF นี้ได้รับการล็อค Workspace ID และหมายเลขห้องพัก ({selectedRoom.roomNumber}) ไว้อย่างปลอดภัย ผู้เช่าสามารถเข้าลงทะเบียนด้วย LINE บนสมาร์ทโฟนเพื่อรับส่งบิลค่าน้ำค่าไฟได้ทันที
                    </p>
                  </div>

                  {/* Tenant Details Preview */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/60 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/60 px-4 py-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between py-2">
                      <span className="text-slate-550 dark:text-slate-400">ชื่อผู้เช่า:</span> 
                      <span className="font-extrabold text-slate-850 dark:text-slate-200">
                        {selectedRoom.tenantName || tenantNameInput}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-550 dark:text-slate-400">เบอร์โทรศัพท์:</span> 
                      <span className="font-mono font-bold text-slate-850 dark:text-slate-200">
                        {selectedRoom.tenantPhone || tenantPhoneInput}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-550 dark:text-slate-400">หมายเลขห้อง:</span> 
                      <span className="font-bold text-slate-850 dark:text-slate-200">ห้อง {selectedRoom.roomNumber}</span>
                    </div>
                    <div className="flex justify-between py-2 border-t border-slate-100/50 dark:border-slate-800/50">
                      <span className="text-slate-550 dark:text-slate-400">อัตราค่าเช่าห้อง:</span> 
                      <span className="font-bold text-slate-850 dark:text-slate-200">{(selectedRoom.baseRent || 0).toLocaleString()} บาท/เดือน</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-550 dark:text-slate-400">เงินประกัน (มัดจำ):</span> 
                      <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                        {financeSettings ? (
                          financeSettings.deposit_type === "fixed" ? (
                            (() => {
                              const roomTypeDeposit = selectedRoom.roomTypeId ? roomTypeDeposits[selectedRoom.roomTypeId] : undefined
                              const amount = roomTypeDeposit !== undefined ? roomTypeDeposit : (financeSettings.deposit_amount || 0)
                              return `${amount.toLocaleString()} บาท (คงที่ตามประเภทห้อง)`
                            })()
                          ) : (
                            `${financeSettings.deposit_amount || 0} เดือน (${((selectedRoom.baseRent || 0) * (financeSettings.deposit_amount || 0)).toLocaleString()} บาท)`
                          )
                        ) : "กำลังโหลด..."}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-550 dark:text-slate-400">ค่าเช่าล่วงหน้า:</span> 
                      <span className="font-extrabold text-blue-600 dark:text-blue-400">
                        {financeSettings ? `${financeSettings.advance_rent || 0} เดือน` : "กำลังโหลด..."}{" "}
                        {financeSettings && `(${((selectedRoom.baseRent || 0) * (financeSettings.advance_rent || 0)).toLocaleString()} บาท)`}
                      </span>
                    </div>
                  </div>

                  {/* Pre-filled Link Section */}
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">ลิงก์ลงทะเบียน LINE LIFF สำหรับแชร์</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        className="flex-1 h-11 px-3.5 bg-slate-100 dark:bg-slate-950 border border-slate-250 dark:border-slate-900 rounded-xl text-slate-500 text-[11px] select-all focus:outline-none font-mono"
                        value={getLiffRegistrationLink(selectedRoom.id)}
                      />
                      <button
                        onClick={() => handleCopyLinkToClipboard(selectedRoom.id, selectedRoom.roomNumber)}
                        className="h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-950 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        คัดลอกลิงก์
                      </button>
                    </div>
                  </div>

                  {/* Instruction steps */}
                  <div className="pt-2 text-[11px] text-slate-500 space-y-2">
                    <div className="font-bold text-slate-700 dark:text-slate-300">💡 วิธีการแชร์และใช้งาน:</div>
                    <ul className="list-decimal pl-4 space-y-1.5 leading-relaxed">
                      <li>กดปุ่ม <strong className="text-slate-700 dark:text-slate-200">คัดลอกลิงก์</strong> ด้านบน</li>
                      <li>ส่งลิงก์นี้ไปทาง LINE หรือช่องทางแชทให้กับผู้เช่าโดยตรง</li>
                      <li>ผู้เช่ากดลิงก์บนมือถือ จะเปิดหน้าจอ LINE LIFF เพื่อกรอกข้อมูลผู้เช่าและกดยืนยันตัวตน UID เพื่อเสร็จสิ้น</li>
                    </ul>
                  </div>

                  {/* Done Button */}
                  <div className="pt-3 flex">
                    <button
                      onClick={() => setContractModalOpen(false)}
                      className="flex-1 h-12 md:h-10 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
                    >
                      ปิดหน้าต่างเสร็จสิ้น
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitContract} className="space-y-4.5 relative z-10 overflow-y-auto flex-1 pr-1 pb-1">
                  
                  {/* Room Info Preview */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
                    <div className="space-y-0.5">
                      <span className="font-bold text-slate-700 dark:text-slate-300">ประเภท: <DynamicText>{selectedRoom.roomTypeName}</DynamicText></span>
                    </div>
                    <div className="font-extrabold text-slate-850 dark:text-slate-200">
                      อัตราค่าเช่า: {selectedRoom.baseRent.toLocaleString()} บาท/เดือน
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ชื่อ-นามสกุล ผู้เช่า</label>
                    <input
                      type="text"
                      required
                      placeholder="ระบุชื่อ-นามสกุลจริงของผู้เช่า..."
                      className="w-full h-12 md:h-10 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-medium"
                      value={tenantNameInput}
                      onChange={(e) => setTenantNameInput(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">เบอร์โทรศัพท์มือถือ</label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      placeholder="เช่น 0891234567..."
                      className="w-full h-12 md:h-10 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-bold font-mono"
                      value={tenantPhoneInput}
                      onChange={(e) => setTenantPhoneInput(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">วันเริ่มสัญญา</label>
                      <input
                        type="date"
                        required
                        className="w-full h-12 md:h-10 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-750 dark:text-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition-colors cursor-pointer"
                        value={contractStartInput}
                        onChange={(e) => handleContractStartChange(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">วันสิ้นสุดสัญญา</label>
                      <input
                        type="date"
                        required
                        className="w-full h-12 md:h-10 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-750 dark:text-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition-colors cursor-pointer"
                        value={contractEndInput}
                        onChange={(e) => setContractEndInput(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Info Note */}
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 font-semibold flex items-start gap-1.5 leading-normal bg-blue-500/5 p-3 rounded-xl border border-blue-500/10">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      เมื่อบันทึกข้อมูลแล้ว สัญญาจะเริ่มทำงานทันที โดยระบบจะสร้าง URL Dynamic Pre-filled เพื่อแชร์ให้ผู้เช่าเชื่อมโยง UID และสิทธิ์รับบิลตรงผ่าน LINE
                    </span>
                  </span>

                  {/* Submit / Cancel Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setContractModalOpen(false)}
                      disabled={contractSubmitting}
                      className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={contractSubmitting}
                      className="order-1 sm:order-2 w-full sm:flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow shadow-blue-600/10 transition-all duration-150 active:scale-95 cursor-pointer"
                    >
                      {contractSubmitting ? (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : "สร้างสัญญาและเชื่อมต่อ LINE"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 4: LINE REGISTRATION LINK MODAL (เจนลิงก์ LINE) */}
        {/* ========================================================= */}
        {lineLinkModalOpen && selectedRoom && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-6 relative overflow-hidden max-h-[92vh] md:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-green-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex justify-between items-center shrink-0 relative z-10">
                <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-emerald-500" /> 
                  เจนลิงก์ LINE (ห้อง {selectedRoom.roomNumber})
                </h3>
                <button 
                  onClick={() => setLineLinkModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 relative z-10 overflow-y-auto flex-1 pr-1 pb-1">
                
                {/* Visual success/share note */}
                {selectedRoom.tenantName ? (
                  <div className="p-4 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10 dark:border-emerald-500/20 text-xs text-emerald-900/90 dark:text-emerald-100/90 space-y-2">
                    <div className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ทำสัญญาสำเร็จ! กรุณาส่งลิงก์นี้ให้ผู้เช่าเชื่อมโยง LINE
                    </div>
                    <p className="leading-relaxed text-emerald-800/80 dark:text-emerald-300/80">
                      ลิงก์ LINE LIFF นี้ได้รับการล็อค Workspace ID และหมายเลขห้องพัก ({selectedRoom.roomNumber}) ไว้อย่างปลอดภัย ผู้เช่าสามารถเข้าลงทะเบียนด้วย LINE บนสมาร์ทโฟนเพื่อรับส่งบิลค่าน้ำค่าไฟได้ทันที
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/10 dark:border-blue-500/20 text-xs text-blue-950/90 dark:text-blue-100/90 space-y-2">
                    <div className="font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <Share2 className="w-4 h-4 shrink-0" />
                      แชร์ลิงก์ให้ผู้เช่าลงทะเบียน (ห้องว่าง)
                    </div>
                    <p className="leading-relaxed text-blue-800/80 dark:text-blue-300/80">
                      แชร์ลิงก์ LINE LIFF นี้ให้กับผู้เช่าคนใหม่ ผู้เช่าจะสามารถกรอกชื่อ-นามสกุล และเบอร์โทรศัพท์มือถือผ่านสมาร์ทโฟนของตนเอง เพื่อผูกบัญชีและลงทะเบียนผู้เช่าระบบอพาร์ทเมนท์เข้ากับห้อง {selectedRoom.roomNumber} ได้โดยตรงทันที
                    </p>
                  </div>
                )}

                {/* Tenant Details Preview */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/60 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/60 px-4 py-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-550 dark:text-slate-400">ชื่อผู้เช่า:</span> 
                    <span className={selectedRoom.tenantName ? "font-extrabold text-slate-850 dark:text-slate-200" : "text-slate-400 dark:text-slate-500 italic font-semibold"}>
                      <DynamicText>{selectedRoom.tenantName || "(รอผู้เช่าลงทะเบียนกรอกข้อมูล)"}</DynamicText>
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-550 dark:text-slate-400">เบอร์โทรศัพท์:</span> 
                    <span className={selectedRoom.tenantPhone ? "font-mono font-bold text-slate-850 dark:text-slate-200" : "text-slate-400 dark:text-slate-500 italic font-semibold"}>
                      {selectedRoom.tenantPhone || "(รอผู้เช่าลงทะเบียนกรอกข้อมูล)"}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-550 dark:text-slate-400">หมายเลขห้อง:</span> 
                    <span className="font-bold text-slate-850 dark:text-slate-200">ห้อง {selectedRoom.roomNumber}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-100/50 dark:border-slate-800/50">
                    <span className="text-slate-550 dark:text-slate-400">อัตราค่าเช่าห้อง:</span> 
                    <span className="font-bold text-slate-850 dark:text-slate-200">{(selectedRoom.baseRent || 0).toLocaleString()} บาท/เดือน</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-550 dark:text-slate-400">เงินประกัน (มัดจำ):</span> 
                    <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                      {financeSettings ? (
                        financeSettings.deposit_type === "fixed" ? (
                          (() => {
                            const roomTypeDeposit = selectedRoom.roomTypeId ? roomTypeDeposits[selectedRoom.roomTypeId] : undefined
                            const amount = roomTypeDeposit !== undefined ? roomTypeDeposit : (financeSettings.deposit_amount || 0)
                            return `${amount.toLocaleString()} บาท (คงที่ตามประเภทห้อง)`
                          })()
                        ) : (
                          `${financeSettings.deposit_amount || 0} เดือน (${((selectedRoom.baseRent || 0) * (financeSettings.deposit_amount || 0)).toLocaleString()} บาท)`
                        )
                      ) : "กำลังโหลด..."}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-550 dark:text-slate-400">ค่าเช่าล่วงหน้า:</span> 
                    <span className="font-extrabold text-blue-600 dark:text-blue-400">
                      {financeSettings ? `${financeSettings.advance_rent || 0} เดือน` : "กำลังโหลด..."}{" "}
                      {financeSettings && `(${((selectedRoom.baseRent || 0) * (financeSettings.advance_rent || 0)).toLocaleString()} บาท)`}
                    </span>
                  </div>
                </div>

                {/* Pre-filled Link Section */}
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">ลิงก์ลงทะเบียน LINE LIFF สำหรับแชร์</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      className="flex-1 h-11 px-3.5 bg-slate-100 dark:bg-slate-950 border border-slate-250 dark:border-slate-900 rounded-xl text-slate-500 text-[11px] select-all focus:outline-none font-mono"
                      value={getLiffRegistrationLink(selectedRoom.id)}
                    />
                    <button
                      onClick={() => handleCopyLinkToClipboard(selectedRoom.id, selectedRoom.roomNumber)}
                      className="h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-950 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      คัดลอกลิงก์
                    </button>
                  </div>
                </div>

                {/* Instruction steps */}
                <div className="pt-2 text-[11px] text-slate-500 space-y-2">
                  <div className="font-bold text-slate-700 dark:text-slate-300">💡 วิธีการแชร์และใช้งาน:</div>
                  <ul className="list-decimal pl-4 space-y-1.5 leading-relaxed">
                    <li>กดปุ่ม <strong className="text-slate-700 dark:text-slate-200">คัดลอกลิงก์</strong> ด้านบน</li>
                    <li>ส่งลิงก์นี้ไปทาง LINE หรือช่องทางแชทให้กับผู้เช่าโดยตรง</li>
                    <li>ผู้เช่ากดลิงก์บนมือถือ จะเปิดหน้าจอ LINE LIFF เพื่อกรอกข้อมูลผู้เช่าและกดยืนยันตัวตน UID เพื่อเสร็จสิ้น</li>
                  </ul>
                </div>

                {/* Offline manual registration fallback */}
                {!selectedRoom.tenantName && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                    <button
                      onClick={() => {
                        setLineLinkModalOpen(false)
                        setTenantNameInput("")
                        setTenantPhoneInput("")
                        
                        const today = new Date()
                        const duration = financeSettings?.lease_duration ?? 6
                        const end = new Date(today.getFullYear(), today.getMonth() + duration, today.getDate())
                        
                        setContractStartInput(today.toISOString().split("T")[0])
                        
                        const endYear = end.getFullYear()
                        const endMonth = String(end.getMonth() + 1).padStart(2, "0")
                        const endDay = String(end.getDate()).padStart(2, "0")
                        setContractEndInput(`${endYear}-${endMonth}-${endDay}`)

                        setTimeout(() => {
                          setContractModalOpen(true)
                        }, 300)
                      }}
                      className="text-[11px] text-blue-650 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline font-extrabold cursor-pointer inline-flex items-center gap-1"
                    >
                      <UserPlus className="w-3 h-3" />
                      ต้องการทำสัญญา/เพิ่มผู้เช่าแบบออฟไลน์ด้วยตนเอง? (คลิก)
                    </button>
                  </div>
                )}

                {/* Close Button */}
                <div className="pt-3 flex">
                  <button
                    onClick={() => setLineLinkModalOpen(false)}
                    className="flex-1 h-12 md:h-10 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
                  >
                    ปิดหน้าต่างเสร็จสิ้น
                  </button>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 5: TENANT DETAIL MODAL (ดูรายละเอียด/จัดการย้ายออก) */}
        {/* ========================================================= */}
        {tenantDetailModalOpen && selectedRoom && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-6 relative overflow-hidden max-h-[92vh] md:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-teal-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex justify-between items-center shrink-0 relative z-10">
                <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Users className="w-5 h-5 text-teal-550" /> 
                  {isEditingTenant ? "แก้ไขข้อมูลผู้เช่าห้อง " : "ข้อมูลผู้เช่าห้อง "}{selectedRoom.roomNumber}
                </h3>
                <button 
                  onClick={() => setTenantDetailModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4.5 relative z-10 overflow-y-auto flex-1 pr-1 pb-1">
                
                {/* Connection Line Verified Badge */}
                {selectedRoom.lineUserId && (
                  <div className="p-4 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 text-xs flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">
                        ผู้เช่าได้ทำการยืนยันตัวตนสำเร็จแล้ว
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">
                        ผู้เช่าเข้าเชื่อมต่อ UID กับแอป LINE OA แล้ว ระบบจะส่งภาพบิลและแจ้งโอนโดยอัตโนมัติ
                      </p>
                    </div>
                  </div>
                )}

                {/* Contract details list */}
                <div className="divide-y divide-slate-150 dark:divide-slate-800 border border-slate-200/60 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-900/40 px-4 py-2 text-xs text-slate-600 dark:text-slate-300">
                  {isEditingTenant ? (
                    <div className="space-y-4 py-2 text-left">
                      {editTenantError && (
                        <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2 animate-pulse">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
                          <span>{editTenantError}</span>
                        </div>
                      )}
                      {/* Name input */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-slate-450 dark:text-slate-400 font-extrabold">ชื่อผู้เช่า:</label>
                        <input
                          type="text"
                          value={editTenantName}
                          onChange={(e) => setEditTenantName(e.target.value)}
                          className="w-full h-11 px-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-250 dark:border-slate-700 text-slate-850 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all text-xs shadow-sm"
                          placeholder="ชื่อ-นามสกุล ผู้เช่า"
                        />
                      </div>
                      {/* Phone input */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-slate-450 dark:text-slate-400 font-extrabold">เบอร์โทรศัพท์:</label>
                        <input
                          type="text"
                          value={editTenantPhone}
                          onChange={(e) => setEditTenantPhone(e.target.value)}
                          className="w-full h-11 px-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-250 dark:border-slate-700 text-slate-850 dark:text-slate-100 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all text-xs shadow-sm"
                          placeholder="เบอร์โทรศัพท์มือถือ"
                        />
                      </div>
                      
                      <div className="flex justify-between py-2.5 items-center border-t border-slate-150 dark:border-slate-800">
                        <span className="text-slate-400 dark:text-slate-500">หมายเลขห้องพัก:</span> 
                        <span className="font-bold text-slate-800 dark:text-slate-200">ห้อง {selectedRoom.roomNumber}</span>
                      </div>
                      <div className="flex justify-between py-2.5 items-center border-t border-slate-150 dark:border-slate-800">
                        <span className="text-slate-400 dark:text-slate-500">ประเภทห้อง & ค่าเช่า:</span> 
                        <span className="font-semibold text-slate-800 dark:text-slate-200"><DynamicText>{selectedRoom.roomTypeName}</DynamicText> • {selectedRoom.baseRent.toLocaleString()} บาท/เดือน</span>
                      </div>

                      {/* Lease start */}
                      <div className="flex flex-col gap-1.5 border-t border-slate-150 dark:border-slate-800 pt-3">
                        <label className="text-slate-450 dark:text-slate-400 font-extrabold">ระยะสัญญาเริ่มต้น:</label>
                        <input
                          type="date"
                          value={editLeaseStart}
                          onChange={(e) => setEditLeaseStart(e.target.value)}
                          className="w-full h-11 px-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-250 dark:border-slate-700 text-slate-850 dark:text-slate-100 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all text-xs shadow-sm"
                        />
                      </div>
                      {/* Lease end */}
                      <div className="flex flex-col gap-1.5 pt-1.5">
                        <label className="text-slate-450 dark:text-slate-400 font-extrabold">วันสิ้นสุดสัญญา:</label>
                        <input
                          type="date"
                          value={editLeaseEnd}
                          onChange={(e) => setEditLeaseEnd(e.target.value)}
                          className="w-full h-11 px-3 rounded-xl bg-white dark:bg-slate-850 border border-slate-250 dark:border-slate-700 text-slate-850 dark:text-slate-100 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all text-xs shadow-sm"
                        />
                      </div>

                      <div className="flex justify-between py-2.5 items-center border-t border-slate-150 dark:border-slate-800">
                        <span className="text-slate-400 dark:text-slate-500">รหัส LINE UID:</span> 
                        <span className="font-mono text-[10px] text-indigo-500 dark:text-indigo-450 select-all truncate max-w-[200px]" title={selectedRoom.lineUserId || ""}>{selectedRoom.lineUserId || "-"}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between py-2.5">
                        <span className="text-slate-400 dark:text-slate-500">ชื่อผู้เช่า:</span> 
                        <span className="font-extrabold text-slate-850 dark:text-slate-200"><DynamicText>{selectedRoom.tenantName}</DynamicText></span>
                      </div>
                      <div className="flex justify-between py-2.5">
                        <span className="text-slate-400 dark:text-slate-500">เบอร์โทรศัพท์:</span>
                        <span className="font-mono font-bold text-slate-850 dark:text-slate-200">{selectedRoom.tenantPhone}</span>
                      </div>
                      <div className="flex justify-between py-2.5">
                        <span className="text-slate-400 dark:text-slate-500">หมายเลขห้องพัก:</span>
                        <span className="font-bold text-slate-850 dark:text-slate-200">ห้อง {selectedRoom.roomNumber}</span>
                      </div>
                      <div className="flex justify-between py-2.5">
                        <span className="text-slate-400 dark:text-slate-500">ประเภทห้อง & ค่าเช่า:</span>
                        <span className="font-semibold"><DynamicText>{selectedRoom.roomTypeName}</DynamicText> • {selectedRoom.baseRent.toLocaleString()} บาท/เดือน</span>
                      </div>
                      <div className="flex justify-between py-2.5">
                        <span className="text-slate-400 dark:text-slate-500">ระยะสัญญาเริ่มต้น:</span> 
                        <span className="font-mono text-slate-700 dark:text-slate-300">{selectedRoom.leaseStart ? new Date(selectedRoom.leaseStart).toLocaleDateString(locale === "th" ? "th-TH" : "en-US", { year: 'numeric', month: 'long', day: 'numeric' }) : "-"}</span>
                      </div>
                      <div className="flex justify-between py-2.5">
                        <span className="text-slate-400 dark:text-slate-500">วันสิ้นสุดสัญญา:</span> 
                        <span className="font-mono text-slate-700 dark:text-slate-300">{selectedRoom.leaseEnd ? new Date(selectedRoom.leaseEnd).toLocaleDateString(locale === "th" ? "th-TH" : "en-US", { year: 'numeric', month: 'long', day: 'numeric' }) : "-"}</span>
                      </div>
                      <div className="flex justify-between py-2.5">
                        <span className="text-slate-400 dark:text-slate-500">รหัส LINE UID:</span> 
                        <span className="font-mono text-[10px] text-indigo-500 dark:text-indigo-450 select-all truncate max-w-[200px]" title={selectedRoom.lineUserId || ""}>{selectedRoom.lineUserId || "-"}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions Button */}
                <div className="flex flex-col gap-3 pt-2">
                  {isEditingTenant ? (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={() => { setIsEditingTenant(false); setEditTenantError(null) }}
                        disabled={editTenantSubmitting}
                        className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveTenantEdits}
                        disabled={editTenantSubmitting}
                        className="order-1 sm:order-2 w-full sm:flex-1 h-11 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all duration-150 border border-teal-600/20 active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        {editTenantSubmitting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            กำลังบันทึก...
                          </>
                        ) : (
                          "บันทึกข้อมูล"
                        )}
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Share Dynamic LINE Link again option in details */}
                      <button
                        onClick={() => {
                          setTenantDetailModalOpen(false)
                          setTimeout(() => {
                            setLineLinkModalOpen(true)
                          }, 300)
                        }}
                        className="w-full h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 text-slate-650 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 duration-150"
                      >
                        <Share2 className="w-3.5 h-3.5 text-blue-500" />
                        คัดลอก/ดูลิงก์ LINE LIFF ของห้องอีกครั้ง
                      </button>

                      {/* Edit Tenant Action */}
                      <button
                        type="button"
                        onClick={() => setIsEditingTenant(true)}
                        className="w-full h-11 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/20 dark:hover:bg-teal-950/40 border border-teal-200/50 dark:border-teal-900/40 text-teal-600 dark:text-teal-400 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 duration-150"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        แก้ไขข้อมูลผู้เช่า
                      </button>

                      {/* ย้ายห้อง — จำกัดสิทธิ์เฉพาะ Admin/Super Admin เพราะแตะเงินประกันจริง */}
                      {isAdminOrSuper && (
                        <button
                          type="button"
                          onClick={() => {
                            setTenantDetailModalOpen(false)
                            setTransferModalOpen(true)
                          }}
                          className="w-full h-11 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 border border-blue-200/50 dark:border-blue-900/40 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 duration-150"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          ย้ายห้อง
                        </button>
                      )}

                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => setTenantDetailModalOpen(false)}
                          className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          ปิดหน้าต่าง
                        </button>
                        
                        {/* RED CHECKOUT BUTTON */}
                        <button
                          type="button"
                          onClick={handleCheckoutTenantTrigger}
                          className="order-1 sm:order-2 w-full sm:flex-1 h-11 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all duration-150 border border-red-200/60 dark:border-red-900/50 active:scale-95 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          แจ้งคืนห้อง/ย้ายออก
                        </button>
                      </div>
                    </>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 5.5: LINE DISCONNECT CONFIRMATION MODAL */}
        {/* ========================================================= */}
        {lineDisconnectConfirmOpen && selectedRoom && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-750 shadow-2xl p-6 space-y-6 relative overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-red-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full border border-red-100 dark:border-red-900/40 shrink-0">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                
                <div className="space-y-1.5 flex-1 min-w-0">
                  <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    ยืนยันการหยุดเชื่อมต่อ LINE
                  </h3>
                  <div className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed space-y-2">
                    <p>
                      คุณแน่ใจหรือไม่ที่จะหยุดเชื่อมต่อบัญชี LINE ของผู้เช่าคุณ <strong className="text-slate-850 dark:text-slate-100 font-extrabold"><DynamicText>{selectedRoom.tenantName}</DynamicText></strong> (ห้อง {selectedRoom.roomNumber})?
                    </p>
                    <p className="bg-amber-500/10 text-amber-600 dark:text-amber-400 p-3 rounded-xl border border-amber-500/20 font-medium">
                      💡 <strong>ข้อดี:</strong> หากผู้เช่าเปลี่ยนบัญชี LINE ใหม่ คุณสามารถกดหยุดเชื่อมต่อตรงนี้แล้วเจนลิงก์ใหม่ให้ผู้เช่าสแกนเพื่อผูกบัญชีได้ทันที <strong>โดยไม่ต้องย้ายออกหรือทำลายสัญญาเช่าเดิม</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons with touch-friendly heights */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setLineDisconnectConfirmOpen(false)
                  }}
                  disabled={disconnectSubmitting}
                  className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDisconnectLine}
                  disabled={disconnectSubmitting}
                  className="order-1 sm:order-2 w-full sm:flex-1 h-11 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50 shadow-md shadow-red-650/10"
                >
                  {disconnectSubmitting ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "ยืนยันหยุดเชื่อมต่อ LINE"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}        {/* ========================================================= */}
        {/* MODAL 7: DETAILED TENANT CHECKOUT - PHASE 1: NOTIFY CHECKOUT */}
        {/* ========================================================= */}
        {checkoutModalOpen && selectedRoom && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300 animate-in fade-in duration-200">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-5 relative overflow-hidden max-h-[92vh] md:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-red-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex justify-between items-center shrink-0 relative z-10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 rounded-xl border border-red-100 dark:border-red-900/30">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                      แจ้งคืนห้องและย้ายออก
                    </h3>
                    <p className="text-[10px] text-slate-450 dark:text-slate-500 mt-0.5 font-bold uppercase tracking-wider">ระบบจัดการคิวคืนเงินประกันหอพัก</p>
                  </div>
                </div>
                <button 
                  onClick={() => setCheckoutModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {checkoutError && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-650 dark:text-red-400 flex items-start gap-2 shrink-0">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}

              <form onSubmit={handleConfirmCheckout} className="space-y-4 relative z-10 overflow-y-auto flex-1 pr-1 pb-1">
                
                {/* Tenant & Room summary */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/60 rounded-xl text-xs space-y-2 text-slate-650 dark:text-slate-455">
                  <div className="flex justify-between font-bold">
                    <span>ห้องเช่าพัก:</span>
                    <span className="text-slate-850 dark:text-slate-200 font-extrabold">ห้อง {selectedRoom.roomNumber} (<DynamicText>{selectedRoom.roomTypeName}</DynamicText>)</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>ผู้เช่าปัจจุบัน:</span>
                    <span className="text-blue-600 dark:text-blue-450 font-extrabold"><DynamicText>{selectedRoom.tenantName}</DynamicText></span>
                  </div>
                  <div className="flex justify-between border-t border-slate-155 dark:border-slate-800 pt-2 text-[11px] font-semibold">
                    <span>ค่าเช่ารายเดือน:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{selectedRoom.baseRent.toLocaleString()} บาท/เดือน</span>
                  </div>
                </div>

                {/* Cancellation date selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] md:text-[11px] text-slate-550 dark:text-slate-400 font-bold uppercase tracking-wider block">วันที่คืนห้อง / ย้ายออกจริง <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <Calendar className="w-4 h-4 md:w-3.5 md:h-3.5" />
                    </span>
                    <input
                      type="date"
                      required
                      value={checkoutDate}
                      onChange={(e) => setCheckoutDate(e.target.value)}
                      className="w-full h-12 md:h-10 pl-9 pr-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-slate-800 dark:text-slate-100 text-base md:text-xs transition-colors font-bold font-mono cursor-pointer"
                    />
                  </div>
                </div>

                {/* Status machine explanation */}
                <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-100 dark:border-purple-950/20 text-xs text-purple-700 dark:text-purple-400 leading-relaxed space-y-1">
                  <span className="font-extrabold block">ⓘ ข้อมูลลำดับขั้นตอนการทำงาน:</span>
                  <p>เมื่อกดยืนยันแล้ว ระบบจะยังคงข้อมูลผู้เช่าและเปลี่ยนสถานะห้องพักเป็น <strong className="font-bold">"รอดำเนินการคืนเงินประกัน"</strong> ซึ่งจะถูกย้ายไปแสดงที่บอร์ดด้านบนแยกต่างหาก เพื่อให้แอดมินเข้าไปจดเลขมิเตอร์และเคลียร์ยอดเงินสุทธิอย่างถูกต้องต่อไป</p>
                </div>

                {/* Submission and Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCheckoutModalOpen(false)}
                    disabled={checkoutSubmitting}
                    className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-55"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={checkoutSubmitting}
                    className="order-1 sm:order-2 w-full sm:flex-1 h-11 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-lg shadow-red-600/10 hover:shadow-red-600/20 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {checkoutSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        กำลังดำเนินการ...
                      </>
                    ) : (
                      <>
                        <LogOut className="w-4 h-4" />
                        ยืนยันการแจ้งย้ายออก
                      </>
                    )}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TASK 3: DETAILED DEPOSIT REFUND PROCESS PAGE / MODAL      */}
        {/* ========================================================= */}
        {refundModalOpen && refundingRoom && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300 animate-in fade-in duration-200">
            <div className="w-full md:max-w-2xl bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-3xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 relative overflow-hidden max-h-[92vh] md:max-h-[88vh] flex flex-col animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              
              <div className="absolute top-0 right-0 w-[300px] h-[150px] bg-purple-500/5 rounded-full blur-[60px] pointer-events-none" />
              
              {/* Header */}
              <div className="flex justify-between items-center shrink-0 relative z-10 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 text-purple-650 dark:text-purple-400 rounded-xl border border-purple-100 dark:border-purple-900/30 shadow-sm">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                      จัดการเคลียร์บัญชีและคืนเงินประกัน
                    </h3>
                    <p className="text-xs text-slate-405 dark:text-slate-500 mt-0.5 font-bold uppercase tracking-wider">ห้อง {refundingRoom.roomNumber} • ผู้เช่า: <DynamicText>{refundingRoom.tenantName}</DynamicText></p>
                  </div>
                </div>
                <button 
                  onClick={() => setRefundModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Error box */}
              {refundError && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2 shrink-0 mt-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{refundError}</span>
                </div>
              )}

              {/* Scrollable Content Form */}
              <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                
                {editingCancelledContractId !== null ? (
                  /* HISTORICAL ADAPTIVE FORM */
                  <div className="space-y-6">
                    {/* Section 1: ข้อมูลและสัดส่วนประวัติสัญญา */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-extrabold border border-blue-100 dark:border-blue-900/30 shadow-sm">1</span>
                        <h4 className="text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">แก้ไขข้อมูลประวัติสัญญาย้อนหลัง</h4>
                      </div>

                      <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-800/40 rounded-2xl space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Checkout Date Picker */}
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-550 dark:text-slate-400">วันที่ย้ายออก (Checkout Date)</label>
                            <input
                              type="date"
                              required
                              value={refundCheckoutDate}
                              onChange={(e) => setRefundCheckoutDate(e.target.value)}
                              className="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs font-bold text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          {/* Deposit Amount Input */}
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-550 dark:text-slate-400">จำนวนเงินประกันตั้งต้น (Deposit)</label>
                            <div className="relative">
                              <input
                                type="number"
                                required
                                min={0}
                                placeholder="กรอกจำนวนเงินประกัน"
                                value={refundDeposit}
                                onChange={(e) => setRefundDeposit(Number(e.target.value) || 0)}
                                className="w-full h-10 pl-3 pr-8 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs font-extrabold font-mono text-slate-800 dark:text-slate-100"
                              />
                              <span className="absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-400 font-bold">บ.</span>
                            </div>
                          </div>
                        </div>

                        {/* Contract Breach Toggle */}
                        <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/60 rounded-xl shadow-sm">
                          <div className="space-y-0.5">
                            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">ระบุการผิดสัญญาเช่า (Breach of Contract)</span>
                            <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-bold">ริบเงินประกันทั้งหมด และกระจายสัดส่วนยอดริบเป็นค่าปรับ</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsHistoricalBreach(!isHistoricalBreach)}
                            className={`h-8 px-3.5 rounded-lg text-[11px] font-extrabold border transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 duration-100 ${
                              isHistoricalBreach
                                ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 shadow-sm"
                                : "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 border-slate-250 dark:border-slate-850 text-slate-650 dark:text-slate-300 shadow-sm"
                            }`}
                          >
                            {isHistoricalBreach ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-red-500" />
                                ผิดสัญญาเช่า
                              </>
                            ) : (
                              <>
                                <X className="w-3.5 h-3.5 text-slate-400" />
                                ไม่ผิดสัญญาเช่า
                              </>
                            )}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Rent Deduction Input */}
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-550 dark:text-slate-400">ยอดหักค่าเช่าห้องพัก ม.40(5) (Rent Deduction)</label>
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                placeholder="กรอกยอดหักค่าเช่าพัก"
                                value={historicalRentDeduction}
                                onChange={(e) => setHistoricalRentDeduction(e.target.value === "" ? "" : Number(e.target.value))}
                                className="w-full h-10 pl-3 pr-8 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs font-extrabold font-mono text-slate-800 dark:text-slate-100"
                              />
                              <span className="absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-400 font-bold">บ.</span>
                            </div>
                          </div>

                          {/* Utilities Deduction Input */}
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-550 dark:text-slate-400">ยอดหักค่าน้ำไฟ ม.40(8) (Utilities Deduction)</label>
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                placeholder="กรอกยอดหักน้ำไฟ"
                                value={historicalUtilitiesDeduction}
                                onChange={(e) => setHistoricalUtilitiesDeduction(e.target.value === "" ? "" : Number(e.target.value))}
                                className="w-full h-10 pl-3 pr-8 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs font-extrabold font-mono text-slate-800 dark:text-slate-100"
                              />
                              <span className="absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-400 font-bold">บ.</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* STANDARD ACTIVE ROOM REFUND FORM */
                  <>
                    {/* 1. METER READINGS SECTION */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-extrabold border border-blue-100 dark:border-blue-900/30 shadow-sm">1</span>
                        <h4 className="text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">บันทึกเลขมิเตอร์ปลายงวดวันย้ายออก</h4>
                      </div>
                      
                      {loadingMeter ? (
                        <div className="py-4 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                          กำลังดึงข้อมูลเลขมิเตอร์ครั้งก่อนหน้า...
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Electricity Meter */}
                          <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-800/40 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Zap className="w-4 h-4 text-amber-500" /> มิเตอร์ไฟปลายงวด
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">เลขครั้งก่อน: {prevElec}</span>
                            </div>
                            <div className="space-y-1.5">
                              <input
                                type="number"
                                placeholder="กรอกเลขมิเตอร์ไฟวันย้ายออก"
                                value={finalElec}
                                onChange={(e) => setFinalElec(e.target.value)}
                                className="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100"
                              />
                              {(() => {
                                const units = Math.max(0, Number(finalElec || 0) - prevElec)
                                const cost = units * (financeSettings?.electric_rate || 7)
                                return (
                                  <div className="flex justify-between items-center text-[11px] font-semibold text-slate-500 dark:text-slate-455 pt-1">
                                    <span>จำนวนหน่วยที่ใช้: <strong className="font-extrabold text-slate-700 dark:text-slate-300">{units} หน่วย</strong></span>
                                    <span>คิดเป็นเงิน: <strong className="font-extrabold text-blue-600 dark:text-blue-400">{cost.toLocaleString()} บาท</strong></span>
                                  </div>
                                )
                              })()}
                            </div>
                          </div>

                          {/* Water Meter */}
                          <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-800/40 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Droplet className="w-4 h-4 text-blue-500" /> มิเตอร์น้ำปลายงวด
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">เลขครั้งก่อน: {prevWater}</span>
                            </div>
                            <div className="space-y-1.5">
                              <input
                                type="number"
                                placeholder="กรอกเลขมิเตอร์น้ำวันย้ายออก"
                                value={finalWater}
                                onChange={(e) => setFinalWater(e.target.value)}
                                className="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100"
                              />
                              {(() => {
                                const units = Math.max(0, Number(finalWater || 0) - prevWater)
                                const cost = units * (financeSettings?.water_rate || 18)
                                return (
                                  <div className="flex justify-between items-center text-[11px] font-semibold text-slate-500 dark:text-slate-455 pt-1">
                                    <span>จำนวนหน่วยที่ใช้: <strong className="font-extrabold text-slate-700 dark:text-slate-300">{units} หน่วย</strong></span>
                                    <span>คิดเป็นเงิน: <strong className="font-extrabold text-blue-600 dark:text-blue-400">{cost.toLocaleString()} บาท</strong></span>
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. RENT DEDUCTION SECTION */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-extrabold border border-blue-100 dark:border-blue-900/30 shadow-sm">2</span>
                        <h4 className="text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">คำนวณสัดส่วนค่าเช่าห้องพักกลางเดือน</h4>
                      </div>

                      <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-800/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                              นโยบายหอพัก: {financeSettings?.checkout_policy === "DAILY_PRORATE" ? "คิดเฉลี่ยรายวัน (DAILY_PRORATE)" : "คิดเต็มเดือน (FULL_MONTH)"}
                            </span>
                          </div>
                          {(() => {
                            const days = new Date(refundCheckoutDate).getDate()
                            const policy = financeSettings?.checkout_policy || "DAILY_PRORATE"
                            const calculated = policy === "DAILY_PRORATE" 
                              ? Math.round((refundingRoom.baseRent / 30) * days * 100) / 100
                              : refundingRoom.baseRent
                            return (
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                                {policy === "DAILY_PRORATE" 
                                  ? `คำนวณเฉลี่ย: ${refundingRoom.baseRent.toLocaleString()} บาท / 30 วัน * อยู่จริง ${days} วัน`
                                  : `หักยอดค่าห้องพักเต็มเดือน: ${refundingRoom.baseRent.toLocaleString()} บาท`
                                }
                                <span className="block mt-1 font-extrabold text-slate-700 dark:text-slate-300">
                                  ยอดหักสุทธิ: {isRentWaived ? "0.00 บาท (ยกเว้นแล้ว)" : `${calculated.toLocaleString()} บาท`}
                                </span>
                              </p>
                            )
                          })()}
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => setIsRentWaived(!isRentWaived)}
                          className={`h-9 px-4 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 duration-100 ${
                            isRentWaived 
                              ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400 shadow-sm"
                              : "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 border-slate-250 dark:border-slate-850 text-slate-650 dark:text-slate-300 shadow-sm"
                          }`}
                        >
                          {isRentWaived ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              ยกเว้นค่าเช่าเรียบร้อย
                            </>
                          ) : (
                            <>
                              <X className="w-4 h-4 text-slate-400" />
                              ยกเว้นค่าเช่าพัก
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* 3. CUSTOM SERVICES & DAMAGES SECTION */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-extrabold border border-blue-100 dark:border-blue-900/30 shadow-sm">
                        {editingCancelledContractId !== null ? "2" : "3"}
                      </span>
                      <h4 className="text-xs font-extrabold text-slate-455 dark:text-slate-400 uppercase tracking-wider">ค่าบริการและค่าเสียหายอื่นๆ (สูงสุด 5 รายการ)</h4>
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleAddCustomDeduction}
                      disabled={customDeductions.length >= 5}
                      className="h-8 px-3 rounded-lg text-[11px] font-extrabold text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900/40 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" /> เพิ่มรายการหักเงิน
                    </button>
                  </div>

                  {customDeductions.length === 0 ? (
                    <div className="p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center text-xs text-slate-400 font-bold">
                      ไม่มีรายการหักค่าบริการอื่น
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customDeductions.map((item, index) => (
                        <div key={item.id} className="flex gap-2 items-center">
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              placeholder="เช่น ค่าล้างแอร์ / ค่าเสียหายลูกบิด"
                              required
                              value={item.name}
                              onChange={(e) => handleUpdateCustomDeduction(item.id, "name", e.target.value)}
                              className="col-span-2 h-10 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs font-bold text-slate-800 dark:text-slate-100"
                            />
                            <div className="relative">
                              <input
                                type="number"
                                placeholder="จำนวนเงิน"
                                required
                                min={0}
                                value={item.amount}
                                onChange={(e) => handleUpdateCustomDeduction(item.id, "amount", e.target.value)}
                                className="w-full h-10 pl-3 pr-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs font-extrabold font-mono text-slate-800 dark:text-slate-100"
                              />
                              <span className="absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-400 font-bold">บ.</span>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomDeduction(item.id)}
                            className="p-2.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 hover:text-red-400 rounded-xl border border-slate-100 dark:border-slate-800 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. REAL-TIME ACCOUNTING & TAX SUMMARY SECTION */}
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-extrabold border border-blue-100 dark:border-blue-900/30 shadow-sm font-bold">
                      {editingCancelledContractId !== null ? "3" : "4"}
                    </span>
                    <h4 className="text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">สรุปยอดประเมินสิทธิคืนเงินประกัน และสัดส่วนภาษี</h4>
                  </div>

                  {(() => {
                    const isHistorical = editingCancelledContractId !== null

                    // Recalculate utilities
                    let totalUtilities408 = 0
                    if (isHistorical) {
                      totalUtilities408 = Number(historicalUtilitiesDeduction || 0)
                    } else {
                      const elecUnits = Math.max(0, Number(finalElec || 0) - prevElec)
                      const waterUnits = Math.max(0, Number(finalWater || 0) - prevWater)
                      const elecCost = elecUnits * (financeSettings?.electric_rate || 7)
                      const waterCost = waterUnits * (financeSettings?.water_rate || 18)
                      totalUtilities408 = elecCost + waterCost
                    }
                    
                    const totalCustomDeductions = customDeductions.reduce((sum, d) => sum + Number(d.amount || 0), 0)
                    const totalDeductions = (isHistorical ? (isRentWaived ? 0 : Number(historicalRentDeduction || 0)) : (isRentWaived ? 0 : (financeSettings?.checkout_policy === "DAILY_PRORATE" ? Math.round((refundingRoom.baseRent / 30) * new Date(refundCheckoutDate).getDate() * 100) / 100 : refundingRoom.baseRent))) + totalUtilities408 + totalCustomDeductions
                    
                    const {
                      isContractBroken,
                      rentDeduction: rentDeductionVal,
                      utilitiesDeduction: taxUtilities408,
                      servicesDeduction: taxServices408,
                      actualRefund: netRefundVal
                    } = calculateDepositProration({
                      baseRent: refundingRoom.baseRent,
                      depositAmount: Number(refundDeposit),
                      checkoutDate: refundCheckoutDate,
                      contractEnd: refundingRoom.leaseEnd || null,
                      checkoutPolicy: financeSettings?.checkout_policy || "DAILY_PRORATE",
                      isRentWaived,
                      totalUtilities408,
                      customDeductions: customDeductions.map(d => ({ name: d.name, amount: Number(d.amount) })),
                      isHistoricalEdit: isHistorical,
                      isHistoricalBreach: isHistoricalBreach,
                      historicalRentDeduction: historicalRentDeduction === "" ? undefined : Number(historicalRentDeduction),
                      historicalUtilitiesDeduction: historicalUtilitiesDeduction === "" ? undefined : Number(historicalUtilitiesDeduction)
                    })
                    
                    const taxRent405 = rentDeductionVal
                    
                    return (
                      <div className="space-y-4">
                        {/* Financial Ledger Breakdown card */}
                        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/20 dark:from-slate-900/40 dark:to-indigo-950/5 border border-slate-200/50 dark:border-slate-800/80 shadow-inner relative">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
                            <div className="space-y-2.5">
                              <div className="flex justify-between">
                                <span className="flex items-center gap-1.5"><Coins className="w-3.5 h-3.5 text-yellow-500" /> เงินประกันตั้งต้น:</span>
                                <span className="font-extrabold text-slate-855 dark:text-slate-100">{refundDeposit.toLocaleString()} บาท</span>
                              </div>
                              <div className="flex justify-between border-t border-slate-150 dark:border-slate-800/50 pt-2 text-red-600 dark:text-red-400">
                                <span>(-) ยอดหักสัดส่วนค่าเช่าห้องพัก:</span>
                                <span className="font-bold">{rentDeductionVal.toLocaleString()} บาท</span>
                              </div>
                              <div className="flex justify-between text-red-655 dark:text-red-400">
                                <span>(-) ยอดหักค่าน้ำและค่าไฟฟ้า:</span>
                                <span className="font-bold">{totalUtilities408.toLocaleString()} บาท</span>
                              </div>
                              <div className="flex justify-between text-red-655 dark:text-red-400">
                                <span>(-) ยอดหักค่าบริการ/ค่าเสียหายอื่นๆ:</span>
                                <span className="font-bold">{totalCustomDeductions.toLocaleString()} บาท</span>
                              </div>
                            </div>
                            
                            <div className="flex flex-col justify-center items-center md:items-end md:text-right border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-4 md:pt-0 md:pl-5 space-y-1">
                              {isContractBroken ? (
                                <>
                                  <span className="text-[11px] font-extrabold text-red-650 dark:text-red-400 uppercase tracking-wider block">ยอดเงินโอนคืนผู้เช่าสุทธิ (ผิดสัญญา)</span>
                                  <span className="text-2xl font-extrabold font-mono text-red-600 dark:text-red-400">
                                    0 บาท
                                  </span>
                                  <span className="text-[10px] text-amber-500 font-bold mt-1 text-center md:text-right leading-relaxed">
                                    * ริบเงินประกันทั้งหมดเนื่องจากอยู่ไม่ครบระยะสัญญา
                                  </span>
                                </>
                              ) : netRefundVal >= 0 ? (
                                <>
                                  <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">ยอดเงินโอนคืนผู้เช่าสุทธิ</span>
                                  <span className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                                    {netRefundVal.toLocaleString()} บาท
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-[11px] font-extrabold text-red-650 dark:text-red-400 uppercase tracking-wider block">ยอดผู้เช่าค้างชำระเพิ่มสุทธิ</span>
                                  <span className="text-2xl font-extrabold font-mono text-red-600 dark:text-red-400">
                                    {Math.abs(netRefundVal).toLocaleString()} บาท
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          
                          {/* Alert when deductions exceed deposit */}
                          {!isContractBroken && netRefundVal < 0 && (
                            <div className="mt-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-red-600 dark:text-red-400 flex items-start gap-2 animate-bounce">
                              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="font-extrabold block mb-0.5">ยอดหักเงินประกันปลายงวดติดลบ!</span>
                                <span>เนื่องจากตัวเลขค่าใช้จ่ายหักล้างรวม {totalDeductions.toLocaleString()} บาท ซึ่งมากกว่ายอดเงินประกันที่ถืออยู่ ขอแนะนำให้แอดมินเรียกเก็บค่าปรับ/ค่าเสียหายส่วนต่างจำนวน <strong className="font-extrabold text-red-700 dark:text-red-300">{Math.abs(netRefundVal).toLocaleString()} บาท</strong> เพิ่มเติมจากผู้เช่าก่อนกดยืนยันปิดเช็คเอาต์</span>
                              </div>
                            </div>
                          )}

                          {/* Info banner for contract breach */}
                          {isContractBroken && (
                            <div className="mt-4 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="font-extrabold block mb-0.5">แจ้งเตือน: อยู่ไม่ครบระยะสัญญา (ผิดสัญญา)</span>
                                <span>ระบบริบเงินประกันทั้งหมด {refundDeposit.toLocaleString()} บาท โดยอัตโนมัติ โดยนำไปหักชำระค่ายอดค้าง และส่วนที่เหลือทั้งหมดจะถูกจัดสรรเข้ากระเป๋าบัญชีภาษี <strong className="font-bold text-amber-700 dark:text-amber-300">มาตรา 40(8) อื่นๆ (หักค่าใช้จ่ายแบบเหมาไม่ได้)</strong> เพื่อความโปร่งใสและถูกต้องตามข้อกำหนดของสรรพากร</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Real-time Thai Tax allocation preview */}
                        <div className="p-4 rounded-2xl bg-indigo-500/[0.02] border border-indigo-100 dark:border-indigo-950/20">
                          <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block mb-2.5">ภาพรวมการจัดสรรภาษีหอพัก (Tax Allocation Preview)</span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] font-bold">
                            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
                              <span className="text-slate-400 dark:text-slate-500 block mb-1">รายได้ ม. 40(5) [ค่าเช่าห้อง]</span>
                              <span className="text-sm font-extrabold text-slate-855 dark:text-slate-100 font-mono">{taxRent405.toLocaleString()} บ.</span>
                            </div>
                            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
                              <span className="text-slate-400 dark:text-slate-500 block mb-1">รายได้ ม. 40(8) [สาธารณูปโภค]</span>
                              <span className="text-sm font-extrabold text-slate-855 dark:text-slate-100 font-mono">{taxUtilities408.toLocaleString()} บ.</span>
                            </div>
                            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
                              <span className="text-slate-400 dark:text-slate-500 block mb-1">รายได้ ม. 40(8) [บริการอื่นๆ/ริบประกัน]</span>
                              <span className="text-sm font-extrabold text-slate-855 dark:text-slate-100 font-mono">{taxServices408.toLocaleString()} บ.</span>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 block leading-normal">
                            * {isContractBroken ? "ยอดรายรับหักล้างทั้งหมดรวมทั้งเงินประกันที่ริบส่วนที่เหลือจะสะสมเข้าตารางบัญชีภาษีของหอพักในหน้ายื่นภาษีให้อัตโนมัติ" : "ยอดสุทธิเงินประกันโอนคืนผู้เช่าส่วนที่เหลือได้รับการยกเว้นภาษี (Tax Exempt) โดยระบบจะดึงเฉพาะข้อมูลรายรับหักล้างด้านบนไปสะสมเข้าตารางภาษีเงินได้หอพักในหน้ายื่นภาษีให้อัตโนมัติ"}
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                </div>

              </div>

              {/* Form Footer Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0 relative z-10">
                <button
                  type="button"
                  onClick={() => setRefundModalOpen(false)}
                  disabled={refundSubmitting}
                  className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-55"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRefundSubmit}
                  disabled={refundSubmitting}
                  className="order-1 sm:order-2 w-full sm:flex-1 h-11 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-lg shadow-purple-600/10 hover:shadow-purple-600/20 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {refundSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {editingCancelledContractId !== null ? "กำลังบันทึกการแก้ไข..." : "กำลังบันทึกและส่งภาษี..."}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      {editingCancelledContractId !== null ? "ยืนยันบันทึกการแก้ไขข้อมูลประวัติ" : "ยืนยันสรุปคืนเงินประกันและปิดบัญชีภาษี"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {isCsvMappingModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-2xl bg-white dark:bg-slate-850 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 relative overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom flex flex-col max-h-[90vh]">
              
              {/* Header */}
              <div className="flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl border border-blue-500/20">
                    <ClipboardCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-slate-100">
                      ตรวจสอบและจับคู่ข้อมูลก่อนนำเข้า
                    </h3>
                    <p className="text-[10px] md:text-xs text-amber-600 dark:text-amber-400 font-extrabold mt-0.5 flex items-center gap-1">
                      ⚠️ {[
                        csvRooms.length > 0 ? `ประเภทห้องไม่ตรง ${csvRooms.length} ห้อง` : null,
                        csvBuildingMappings.length > 0 ? `ชื่ออาคารไม่ตรง ${csvBuildingMappings.length} ชื่อ` : null
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCsvMappingModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-1">
                {mappingError && (
                  <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2.5 animate-pulse">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{mappingError}</span>
                  </div>
                )}

                {/* จับคู่ชื่ออาคาร — จับคู่ต่อ "ชื่อ" ไม่ใช่ต่อแถว ถ้าไฟล์มี 40 แถวใช้ชื่อเดียวกัน เลือกครั้งเดียวจบ */}
                {csvBuildingMappings.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                      ชื่ออาคารในไฟล์ต่อไปนี้ <strong className="text-amber-600 dark:text-amber-400">ไม่ตรงกับอาคารที่มีในระบบ</strong> กรุณาเลือกว่าแต่ละชื่อหมายถึงอาคารไหน — เลือกครั้งเดียวมีผลกับทุกห้องที่ใช้ชื่อนั้น
                    </p>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900">
                      <div className="grid grid-cols-12 bg-slate-100 dark:bg-slate-850 p-3 text-xs font-extrabold text-slate-650 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <div className="col-span-7">ชื่ออาคารในไฟล์ CSV</div>
                        <div className="col-span-5">อาคารในระบบ</div>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/40">
                        {csvBuildingMappings.map((m, idx) => (
                          <div
                            key={idx}
                            className={`grid grid-cols-12 items-center gap-2 p-3 text-xs ${!m.buildingId ? "bg-amber-500/5 dark:bg-amber-500/[0.02]" : ""}`}
                          >
                            <div className="col-span-7 min-w-0">
                              <div className="font-bold text-slate-850 dark:text-slate-200 truncate" title={m.csvName}>
                                {m.csvName || <span className="text-slate-400 font-normal italic">(ไม่ได้ระบุอาคาร)</span>}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5 truncate">
                                {m.count} ห้อง · {m.sampleRooms.join(", ")}{m.count > m.sampleRooms.length ? " …" : ""}
                              </div>
                            </div>
                            <div className="col-span-5">
                              <select
                                value={m.buildingId}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setCsvBuildingMappings(prev =>
                                    prev.map((row, i) => i === idx ? { ...row, buildingId: val } : row)
                                  )
                                }}
                                className={`w-full p-2 rounded-lg border text-xs font-bold cursor-pointer focus:outline-none focus:border-blue-500 ${
                                  !m.buildingId
                                    ? "border-amber-400 dark:border-amber-500/50 bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-200"
                                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-200"
                                }`}
                              >
                                <option value="">— เลือกอาคาร —</option>
                                {buildings.map(b => (
                                  <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-semibold">
                      ไม่มีอาคารที่ต้องการในรายการ? ปิดหน้าต่างนี้แล้วไปสร้างอาคารใหม่ที่หน้าจัดการอาคารก่อน แล้วอัปโหลดไฟล์อีกครั้ง
                    </p>
                  </div>
                )}

                {csvRooms.length > 0 && (
                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                  ระบบได้ทำการจับคู่ประเภทห้องที่ถูกต้องให้โดยอัตโนมัติแล้วจำนวน <strong className="text-emerald-600 dark:text-emerald-400">{autoMappedRooms.length} ห้อง</strong> และ <strong className="text-amber-600 dark:text-amber-400">แสดงเฉพาะห้องที่มีปัญหา {csvRooms.length} ห้อง</strong> ด้านล่างนี้เพื่อให้คุณเลือกจับคู่ประเภทห้องให้ถูกต้องครับ
                </p>
                )}

                {/* Table list */}
                {csvRooms.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900">
                  <div className="grid grid-cols-12 bg-slate-100 dark:bg-slate-850 p-3 text-xs font-extrabold text-slate-650 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <div className="col-span-2">หมายเลขห้อง</div>
                    <div className="col-span-2">ชั้น (Floor)</div>
                    <div className="col-span-3">ชื่อในไฟล์ CSV</div>
                    <div className="col-span-5">ประเภทห้องในระบบ (Dropdown)</div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800/40 overflow-y-auto max-h-[45vh]">
                    {csvRooms.map((room, idx) => {
                      const isUnmapped = !room.roomTypeId;
                      return (
                        <div key={idx} className={`grid grid-cols-12 items-center p-3 text-xs transition-colors hover:bg-slate-100/40 dark:hover:bg-slate-850/40 ${isUnmapped ? "bg-amber-500/5 dark:bg-amber-500/[0.02]" : ""}`}>
                          {/* Room number */}
                          <div className="col-span-2 font-mono font-bold text-slate-850 dark:text-slate-200 flex items-center gap-1.5">
                            <Home className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {room.roomNumber}
                          </div>

                          {/* Floor */}
                          <div className="col-span-2 text-slate-500 dark:text-slate-400 font-semibold">
                            {room.floor ? `ชั้น ${room.floor}` : "ไม่ได้ระบุ"}
                          </div>

                          {/* CSV Original type name */}
                          <div className="col-span-3 truncate pr-2 font-semibold text-slate-650 dark:text-slate-300" title={room.csvTypeName}>
                            {room.csvTypeName || <span className="text-slate-400 font-normal italic">(ไม่ได้ระบุ)</span>}
                          </div>

                          {/* Selected system Room type */}
                          <div className="col-span-5">
                            <select
                              value={room.roomTypeId}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const matchedType = roomTypes.find(rt => rt.id === selectedId);
                                setCsvRooms(prev => prev.map((r, rIdx) => {
                                  if (rIdx === idx) {
                                    return {
                                      ...r,
                                      roomTypeId: selectedId,
                                      baseRent: matchedType ? Number(matchedType.default_rent || 0) : 0
                                    };
                                  }
                                  return r;
                                }));
                              }}
                              className={`w-full p-2.5 text-xs font-bold rounded-lg border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer ${
                                isUnmapped 
                                  ? "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:border-amber-700/80 dark:text-amber-250 focus:border-amber-500" 
                                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                              }`}
                            >
                              <option value="" className="bg-white dark:bg-slate-950 text-rose-500 dark:text-rose-400 font-extrabold">
                                ⚠️ คลิกเลือกประเภทห้องพัก...
                              </option>
                              {roomTypes.map(rt => (
                                <option 
                                  key={rt.id} 
                                  value={rt.id} 
                                  className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-bold"
                                >
                                  {rt.name} (฿{rt.default_rent.toLocaleString()})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-150 dark:border-slate-800/80 flex flex-col sm:flex-row gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCsvMappingModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-900 transition-all cursor-pointer text-center"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={mappingSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-extrabold shadow-lg shadow-blue-500/15 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                >
                  {mappingSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      กำลังนำเข้าข้อมูล...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      ยืนยันนำเข้าทั้งหมด {autoMappedRooms.length + csvRooms.length} ห้อง (รวมห้องที่ไม่มีปัญหา)
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* MODAL: ROOM CSV TEMPLATE DOWNLOAD GUIDE */}
        {isRoomTemplateGuideModalOpen && (
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
                      คู่มือการใช้ไฟล์ CSV สำหรับการเพิ่มห้องพัก
                    </h3>
                    <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 mt-1 font-semibold">
                      โปรดอ่านคำแนะนำนี้เพื่อนำเข้าข้อมูลห้องพักได้อย่างราบรื่นและถูกต้องครับ
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsRoomTemplateGuideModalOpen(false)}
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
                      ชื่อประเภทห้องพัก (สะกดให้ตรงกับชื่อในระบบ)
                    </h4>
                    <p className="text-sm md:text-base text-slate-700 dark:text-slate-200 leading-relaxed font-semibold">
                      คอลัมน์ <span className="font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">room_type_name</span> จะต้องสะกดตรงกับชื่อประเภทห้องพักที่มีในระบบ (เช่น <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">{roomTypes[0]?.name || "แอร์"}</span>) เพื่อระบบจะได้ดึงข้อมูลค่าเช่ารายเดือนและเงินประกันมาตั้งค่าเริ่มต้นให้ได้อย่างถูกต้อง
                    </p>
                  </div>
                </div>

                {/* Item 2 */}
                <div className="flex gap-4 items-start bg-amber-50/50 dark:bg-amber-950/20 p-5 rounded-2xl border border-amber-100 dark:border-amber-900/40">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-xl text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-lg md:text-xl font-black text-amber-900 dark:text-amber-300">
                      หากประเภทห้องพักสะกดไม่ถูกต้อง
                    </h4>
                    <p className="text-sm md:text-base text-amber-850 dark:text-amber-200 leading-relaxed font-semibold">
                      กรณีที่ชื่อประเภทห้องพักในไฟล์สะกดไม่ถูกต้อง สะกดผิด เว้นวรรคเกิน หรือไม่มีอยู่ในระบบ ระบบจะแสดงหน้าต่างให้ท่านเลือก &quot;ประเภทห้องพัก&quot; ได้ทันทีโดยไม่ต้องไปนั่งแก้ไฟล์
                    </p>
                  </div>
                </div>

                {/* Item 3 */}
                <div className="flex gap-4 items-start bg-slate-50/80 dark:bg-slate-900/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">
                      ชั้นวางห้องพัก (กำหนดเองหรือเว้นว่างไว้)
                    </h4>
                    <p className="text-sm md:text-base text-slate-700 dark:text-slate-200 leading-relaxed font-semibold">
                      คอลัมน์ floor (ชั้น) สามารถกำหนดได้เอง หรือหากเว้นว่างไว้ ระบบจะช่วยจัดตำแหน่งชั้นให้อัตโนมัติโดยอิงจากหลักสิบหรือหลักร้อยของเลขห้องพัก
                    </p>
                  </div>
                </div>

                {/* Item 4 — ชื่ออาคาร (แสดงเฉพาะหอที่มีมากกว่า 1 อาคาร) */}
                {buildings.length > 1 && (
                  <div className="flex gap-4 items-start bg-slate-50/80 dark:bg-slate-900/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                      <Building className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h4 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">
                        ชื่ออาคาร (พิมพ์ให้ตรงกับชื่อในระบบ)
                      </h4>
                      <p className="text-sm md:text-base text-slate-700 dark:text-slate-200 leading-relaxed font-semibold">
                        เนื่องจากหอของท่านมีมากกว่า 1 อาคาร ในไฟล์จะมีคอลัมน์ <span className="font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">building_name</span> เพิ่มมา กรุณา<strong>พิมพ์ชื่ออาคารให้ตรงกับชื่อในระบบ</strong> (เช่น <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">{buildings[0]?.name}</span>) ระบบเทียบชื่อแบบตรงตัว ไม่เดาให้ เพราะถ้าเดาผิดห้องจะไปอยู่ผิดอาคารและค่าน้ำ-ไฟที่หารตามสัดส่วนทั้งอาคารจะผิดตามไปด้วย
                      </p>
                      <p className="text-sm md:text-base text-slate-700 dark:text-slate-200 leading-relaxed font-semibold">
                        <strong>หากไม่มีอาคารที่ต้องการในระบบ</strong> กรุณาไปกดสร้างอาคารใหม่ที่<strong>หน้าจัดการอาคาร</strong>ก่อน แล้วจึงกลับมาอัปโหลดไฟล์อีกครั้ง
                      </p>
                    </div>
                  </div>
                )}

                {/* Item 5 — ถ้าชื่ออาคารไม่ตรง */}
                {buildings.length > 1 && (
                  <div className="flex gap-4 items-start bg-amber-50/50 dark:bg-amber-950/20 p-5 rounded-2xl border border-amber-100 dark:border-amber-900/40">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-xl text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h4 className="text-lg md:text-xl font-black text-amber-900 dark:text-amber-300">
                        หากชื่ออาคารสะกดไม่ตรง
                      </h4>
                      <p className="text-sm md:text-base text-amber-850 dark:text-amber-200 leading-relaxed font-semibold">
                        ระบบจะแสดงหน้าต่างให้ท่านเลือกว่าแต่ละชื่อหมายถึงอาคารไหน โดยเลือกครั้งเดียวมีผลกับทุกห้องที่ใช้ชื่อนั้น ไม่ต้องกลับไปแก้ไฟล์
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Buttons */}
              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRoomTemplateGuideModalOpen(false)}
                  className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-base md:text-lg font-black rounded-2xl shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  รับทราบและเข้าใจคำแนะนำ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 6: CUSTOM CONFIRM DELETE MODAL */}
        {/* ========================================================= */}
        {deleteConfirmOpen && deleteTarget && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-750 shadow-2xl p-6 space-y-6 relative overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full border border-red-100 dark:border-red-900/40 shrink-0">
                  <AlertCircle className="w-6 h-6 animate-bounce" />
                </div>
                
                <div className="space-y-1.5 flex-1 min-w-0">
                  <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    ยืนยันการทำเรื่องถอนระบบข้อมูล
                  </h3>
                  <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    คุณแน่ใจหรือไม่ที่จะลบหรือถอนข้อมูล <strong className="text-slate-850 dark:text-slate-100 font-extrabold">{deleteTarget.name}</strong>? 
                    {deleteTarget.type === "tenant" ? " การแจ้งคืนห้องพัก/ย้ายออกจะยกเลิกสัญญาเช่าปัจจุบัน และปลดความเชื่อมโยง LINE ทันที โดยข้อมูลในตารางบิลและมิเตอร์ทั้งหมดจะยังคงอยู่เพื่อความถูกต้องทางบัญชี" : " การดำเนินการนี้จะลบข้อมูลจากระบบถาวรและไม่สามารถกู้กลับคืนมาได้อีก"}
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
                  className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="order-1 sm:order-2 w-full sm:flex-1 h-11 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all duration-150 border border-red-200/50 dark:border-red-900/50 active:scale-95 cursor-pointer"
                >
                  {deleteTarget.type === "tenant" ? "ยืนยันการคืนห้องพัก" : "ยืนยันลบข้อมูลถาวร"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 7: ROOM TRANSFER MODAL (ย้ายห้อง) */}
        {/* ========================================================= */}
        {transferModalOpen && selectedRoom && selectedRoom.tenantId && (
          <RoomTransferModal
            tenant={{
              id: selectedRoom.tenantId,
              roomId: selectedRoom.id,
              roomNumber: selectedRoom.roomNumber,
              fullName: selectedRoom.tenantName || "",
              depositPaid: selectedRoom.depositPaid
            }}
            vacantRooms={rooms.filter(r => r.status === "available").map(r => ({ id: r.id, roomNumber: r.roomNumber }))}
            workspaceId={getCookie("horset_current_workspace_id") || undefined}
            onClose={() => setTransferModalOpen(false)}
            onSuccess={({ toRoomNumber }) => {
              setTransferModalOpen(false)
              showToast(`ย้ายห้องสำเร็จ! ย้ายไปห้อง ${toRoomNumber} เรียบร้อยแล้ว`, "success")
              loadData(true)
            }}
          />
        )}

      </div>
    </>
  )
}
