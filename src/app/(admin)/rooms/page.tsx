"use client"

import { useState, useEffect } from "react"
import { 
  Home, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  AlertCircle, 
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
  AlertTriangle
} from "lucide-react"
import { 
  getRooms, 
  createRoom, 
  updateRoom, 
  deleteRoom,
  getRoomTypes,
  createRoomType,
  updateRoomType,
  deleteRoomType
} from "@/features/room/actions"
import { 
  createTenant, 
  deleteTenant, 
  updateTenant 
} from "@/features/tenant/actions"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { getFinanceSettings, type FinanceSettings } from "@/features/finance/actions"

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
  status: "occupied" | "available"
  baseRent: number
  tenantId?: string | null
  tenantName: string | null
  tenantPhone: string | null
  lineUserId?: string | null
  leaseStart?: string | null
  leaseEnd?: string | null
  roomTypeId: string | null
  roomTypeName: string
}

interface RoomTypeItem {
  id: string
  name: string
  default_rent: number
}

export default function RoomsPage() {
  const { getCachedData, setCachedData, clearWorkspaceCache } = useWorkspaceData()
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [roomTypes, setRoomTypes] = useState<RoomTypeItem[]>([])
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings | null>(null)
  const [roomTypeDeposits, setRoomTypeDeposits] = useState<{ [roomTypeId: string]: number }>({})
  const [cancelledContracts, setCancelledContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "available" | "waiting" | "occupied">("all")
  
  // Modals Control
  const [modalOpen, setModalOpen] = useState(false) // Room Modal
  const [typesModalOpen, setTypesModalOpen] = useState(false) // Room Types Modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false) // Confirm Delete
  
  // Unified Tenant Modals
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [tenantDetailModalOpen, setTenantDetailModalOpen] = useState(false)
  const [lineLinkModalOpen, setLineLinkModalOpen] = useState(false)
  
  const [selectedRoom, setSelectedRoom] = useState<RoomItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    type: "room" | "type" | "tenant"
    name: string
    extraId?: string // used for tenant roomNumber
  } | null>(null)
  
  // Room Form State
  const [editingRoom, setEditingRoom] = useState<RoomItem | null>(null)
  const [newRoomNumber, setNewRoomNumber] = useState("")
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState("")
  const [newBaseRent, setNewBaseRent] = useState<number | string>("")
  const [formSubmitting, setFormSubmitting] = useState(false)

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

  // โหลดข้อมูลทั้งหมดจาก Supabase ร่วมกับการใช้งาน Cache ความเร็วสูง
  const loadData = async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
      
      // โหลดข้อมูลประวัติยกเลิกสัญญาจาก localStorage
      const savedCancellations = localStorage.getItem(`cancelled_contracts_${wsId}`)
      if (savedCancellations) {
        try {
          setCancelledContracts(JSON.parse(savedCancellations))
        } catch (e) {
          console.error("Failed to parse saved cancellations", e)
        }
      } else {
        setCancelledContracts([])
      }

      // ดึงข้อมูลตั้งค่าการเงินและบัญชีรับเงิน (เพื่อใช้แสดงค่ามัดจำ/ค่าเช่าล่วงหน้าในโมดอลลิงก์)
      getFinanceSettings(wsId).then(res => {
        if (res.success && res.data) {
          setFinanceSettings(res.data)
        }
      })

      if (forceRefresh && wsId) {
        clearWorkspaceCache(wsId)
      }

      // ดึงข้อมูลจาก In-Memory Cache เพื่อความเร็วระดับ 0ms และป้องกันการยุ่งเกี่ยวกับ local storage
      let cachedRooms = forceRefresh ? null : getCachedData(wsId, "rooms")
      let cachedTypes = forceRefresh ? null : getCachedData(wsId, "room_types")

      if (cachedRooms && cachedTypes) {
        setRooms(cachedRooms)
        setRoomTypes(cachedTypes)
        setLoading(false)
        return
      }

      const [roomsRes, typesRes] = await Promise.all([getRooms(), getRoomTypes()])
      
      if (roomsRes.success && roomsRes.data) {
        const roomsData = roomsRes.data as RoomItem[]
        setRooms(roomsData)
        if (wsId) setCachedData(wsId, "rooms", roomsData)
      } else {
        setError(roomsRes.error || "ไม่สามารถโหลดข้อมูลห้องพักได้")
      }
      
      if (typesRes.success && typesRes.data) {
        const typesData = typesRes.data as RoomTypeItem[]
        setRoomTypes(typesData)
        if (wsId) setCachedData(wsId, "room_types", typesData)
      }
    } catch (err) {
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูลระบบห้องพัก")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // ซิงค์ค่ามัดจำ/เงินประกันแยกตามประเภทห้องจาก Local Storage หรือ Database
  useEffect(() => {
    const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
    let localRtDeposits: { [key: string]: number } = {}
    if (typeof window !== "undefined") {
      try {
        const localSaved = localStorage.getItem(`room_type_deposits_${wsId}`)
        if (localSaved) {
          localRtDeposits = JSON.parse(localSaved)
        }
      } catch (e) {
        console.error("Failed to parse local room type deposits", e)
      }
    }
    
    // Merge กับค่าจาก DB (deposit_amount บน room_types) หากมีและยังไม่มีใน localStorage
    roomTypes.forEach((rt: any) => {
      if (rt.deposit_amount !== undefined && rt.deposit_amount !== null) {
        if (localRtDeposits[rt.id] === undefined) {
          localRtDeposits[rt.id] = rt.deposit_amount
        }
      }
    })
    
    setRoomTypeDeposits(localRtDeposits)
  }, [roomTypes])

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
    setSelectedRoomTypeId("")
    setNewBaseRent("")
    
    // ตั้งค่าประเภทห้องแรกเป็นดีฟอลต์ถ้ามี
    if (roomTypes.length > 0) {
      setSelectedRoomTypeId(roomTypes[0].id)
      setNewBaseRent(roomTypes[0].default_rent)
    }
    setModalOpen(true)
  }

  // เปิดแบบฟอร์มสำหรับแก้ไขห้องเดิม
  const handleEditClick = (room: RoomItem) => {
    setEditingRoom(room)
    setNewRoomNumber(room.roomNumber)
    setSelectedRoomTypeId(room.roomTypeId || "")
    setNewBaseRent(room.baseRent)
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
    if (!deleteTarget) return
    setLoading(true)
    setDeleteConfirmOpen(false)
    
    if (deleteTarget.type === "room") {
      const res = await deleteRoom(deleteTarget.id)
      if (res.success) {
        showToast("✓ ลบห้องพักออกจากระบบสำเร็จแล้ว", "success")
        await loadData(true) // รีเฟรชข้อมูลและเคลียร์แคช
      } else {
        showToast(res.error || "ลบห้องพักไม่สำเร็จ", "error")
        setLoading(false)
      }
    } else if (deleteTarget.type === "type") {
      setTypeSubmitting(true)
      const res = await deleteRoomType(deleteTarget.id)
      if (res.success) {
        const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
        clearWorkspaceCache(wsId)
        showToast("✓ ลบประเภทห้องพักสำเร็จแล้ว", "success")
        const typesRes = await getRoomTypes()
        if (typesRes.success && typesRes.data) {
          const typesData = typesRes.data as RoomTypeItem[]
          setRoomTypes(typesData)
          setCachedData(wsId, "room_types", typesData)
        }
      } else {
        showToast(res.error || "ไม่สามารถลบประเภทห้องนี้ได้ เนื่องจากมีห้องพักอื่นอ้างอิงใช้งานประเภทนี้อยู่", "error")
      }
      setTypeSubmitting(false)
      setLoading(false)
    } else if (deleteTarget.type === "tenant") {
      const res = await deleteTenant(deleteTarget.id, deleteTarget.extraId || "")
      if (res.success) {
        showToast(`✓ ดำเนินการย้ายออกผู้เช่า และคืนสถานะว่างให้ห้อง ${deleteTarget.extraId} สำเร็จแล้ว`, "success")
        setTenantDetailModalOpen(false)
        await loadData(true)
      } else {
        showToast(res.error || "ยกเลิกสัญญาผู้เช่าไม่สำเร็จ", "error")
        setLoading(false)
      }
    }
    setDeleteTarget(null)
  }

  // การส่งแบบฟอร์มบันทึกห้องพัก (เพิ่ม / แก้ไข)
  const handleSubmitRoomForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoomNumber) return
    setFormSubmitting(true)

    if (editingRoom) {
      // แก้ไขห้องพักเดิม
      const res = await updateRoom(
        editingRoom.id,
        newRoomNumber,
        selectedRoomTypeId,
        Number(newBaseRent),
        editingRoom.status
      )
      if (res.success) {
        showToast("✓ อัปเดตข้อมูลห้องพักสำเร็จ", "success")
        await loadData(true) // เคลียร์แคชและดึงข้อมูลใหม่
        setModalOpen(false)
      } else {
        showToast(res.error || "แก้ไขข้อมูลห้องพักไม่สำเร็จ", "error")
      }
    } else {
      // เพิ่มห้องพักใหม่
      const res = await createRoom(newRoomNumber, selectedRoomTypeId, Number(newBaseRent))
      if (res.success) {
        showToast("✓ เพิ่มห้องพักใหม่เข้าสู่ระบบสำเร็จ", "success")
        await loadData(true) // เคลียร์แคชและดึงข้อมูลใหม่
        setModalOpen(false)
      } else {
        showToast(res.error || "สร้างห้องพักไม่สำเร็จ", "error")
      }
    }
    setFormSubmitting(false)
  }

  // จัดการประเภทห้องพัก (เพิ่ม / แก้ไข)
  const handleSubmitTypeForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTypeName) return
    setTypeSubmitting(true)

    const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"

    if (editingType) {
      const res = await updateRoomType(editingType.id, newTypeName, Number(newTypeRent))
      if (res.success) {
        showToast("✓ อัปเดตข้อมูลประเภทห้องสำเร็จ", "success")
        setNewTypeName("")
        setNewTypeRent(4000)
        setEditingType(null)
        clearWorkspaceCache(wsId)
        // โหลดข้อมูลประเภทห้องใหม่
        const typesRes = await getRoomTypes()
        if (typesRes.success && typesRes.data) {
          const typesData = typesRes.data as RoomTypeItem[]
          setRoomTypes(typesData)
          setCachedData(wsId, "room_types", typesData)
        }
      } else {
        showToast(res.error || "แก้ไขประเภทห้องไม่สำเร็จ", "error")
      }
    } else {
      const res = await createRoomType(newTypeName, Number(newTypeRent))
      if (res.success) {
        showToast("✓ สร้างประเภทห้องพักใหม่สำเร็จ", "success")
        setNewTypeName("")
        setNewTypeRent(4000)
        clearWorkspaceCache(wsId)
        const typesRes = await getRoomTypes()
        if (typesRes.success && typesRes.data) {
          const typesData = typesRes.data as RoomTypeItem[]
          setRoomTypes(typesData)
          setCachedData(wsId, "room_types", typesData)
        }
      } else {
        showToast(res.error || "เพิ่มประเภทห้องไม่สำเร็จ", "error")
      }
    }
    setTypeSubmitting(false)
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
    if (!selectedRoom || !tenantNameInput || !tenantPhoneInput) return
    setContractSubmitting(true)

    try {
      const res = await createTenant(
        selectedRoom.roomNumber,
        tenantNameInput,
        tenantPhoneInput,
        null, // lineUserId is null, waiting for Line LIFF registration!
        contractStartInput,
        contractEndInput
      )
      
      if (res.success) {
        showToast(`✓ ทำสัญญาห้อง ${selectedRoom.roomNumber} เรียบร้อยแล้ว! ถัดไปคือแชร์ลิงก์ให้ผู้เช่าเชื่อมต่อกับ LINE`, "success")
        setContractModalOpen(false)
        await loadData(true) // เคลียร์แคชและโหลดข้อมูลจริง
        
        // ค้นหาข้อมูลห้องที่พึ่งอัปเดตเพื่อเปิด Modal เจนลิงก์ LINE ต่อให้แอดมินทันที
        const updatedRoom = rooms.find(r => r.roomNumber === selectedRoom.roomNumber)
        if (updatedRoom) {
          // หน่วงเวลาเปิดเพื่อความต่อเนื่องของ UI
          setTimeout(() => {
            setSelectedRoom({
              ...updatedRoom,
              tenantName: tenantNameInput,
              tenantPhone: tenantPhoneInput,
              tenantId: res.data.id
            })
            setLineLinkModalOpen(true)
          }, 400)
        } else {
          // หากหาใน state ทันทีไม่เจอก็จำลองอ็อบเจกต์ขึ้นมา
          setTimeout(() => {
            setSelectedRoom({
              ...selectedRoom,
              tenantName: tenantNameInput,
              tenantPhone: tenantPhoneInput,
              tenantId: res.data.id,
              status: "occupied"
            })
            setLineLinkModalOpen(true)
          }, 400)
        }
      } else {
        showToast(res.error || "ทำสัญญาผู้เช่าไม่สำเร็จ", "error")
      }
    } catch (err) {
      showToast("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error")
    } finally {
      setContractSubmitting(false)
    }
  }

  // จัดการแชร์/เจนลิงก์ LINE
  const handleOpenLineLinkModal = (room: RoomItem) => {
    setSelectedRoom(room)
    setLineLinkModalOpen(true)
  }

  const getLiffRegistrationLink = (roomNum: string) => {
    const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
    return `https://liff.line.me/2010442620-H4josaDy?workspace_id=${wsId}&room_number=${roomNum}`
  }

  const handleCopyLinkToClipboard = (roomNum: string) => {
    const link = getLiffRegistrationLink(roomNum)
    navigator.clipboard.writeText(link)
    showToast(`✓ คัดลอกลิงก์ LINE LIFF ของห้อง ${roomNum} สำเร็จ! สามารถส่งแชทให้ผู้เช่าลงทะเบียนได้เลย`, "success")
  }

  // เปิดดูรายละเอียดและแจ้งย้ายออก
  const handleOpenDetailModal = (room: RoomItem) => {
    setSelectedRoom(room)
    setTenantDetailModalOpen(true)
  }

  // จัดการย้ายออกผู้เช่า (เปิดฟอร์มคืนห้องและยกเลิกสัญญา มาตรา 40(8))
  const handleCheckoutTenantTrigger = () => {
    if (!selectedRoom || !selectedRoom.tenantId) return
    
    const initialDate = new Date().toISOString().split("T")[0]
    setCheckoutDate(initialDate)
    
    // คำนวณเงินประกันสะสมตามโหมด: คิดตามจำนวนเดือน หรือ ยอดเงินคงที่ (แยกตามประเภทห้อง)
    let calculatedDeposit = 0
    if (financeSettings) {
      if (financeSettings.deposit_type === "fixed") {
        const roomTypeDeposit = selectedRoom.roomTypeId ? roomTypeDeposits[selectedRoom.roomTypeId] : undefined
        calculatedDeposit = roomTypeDeposit !== undefined ? roomTypeDeposit : (financeSettings.deposit_amount || 0)
      } else {
        const depositMonths = financeSettings.deposit_amount || 0
        calculatedDeposit = selectedRoom.baseRent * depositMonths
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

  // ดำเนินการย้ายออกผู้เช่า บันทึกเงินประกันริบเข้าตารางยกเลิกสัญญา และลบผู้เช่า
  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRoom || !selectedRoom.tenantId) return
    
    if (!checkoutDate) {
      setCheckoutError("กรุณากรอกวันที่ยกเลิกสัญญา/ย้ายออก")
      return
    }
    if (checkoutRefund < 0) {
      setCheckoutError("จำนวนเงินโอนคืนต้องไม่ต่ำกว่า 0 บาท")
      return
    }
    if (checkoutRefund > checkoutDeposit) {
      setCheckoutError("จำนวนเงินโอนคืนต้องไม่เกินยอดเงินประกัน")
      return
    }

    setCheckoutSubmitting(true)
    setCheckoutError(null)

    try {
      const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
      
      // 1. บันทึกประวัติการยกเลิกสัญญาเพื่อใช้คำนวณภาษีเงินได้ประเภท 40(8) ที่ริบไว้
      const newCancellation = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        tenantId: selectedRoom.tenantId,
        roomNumber: selectedRoom.roomNumber,
        tenantName: selectedRoom.tenantName,
        cancellationDate: checkoutDate,
        depositAmount: Number(checkoutDeposit),
        refundedAmount: Number(checkoutRefund),
        actualRefund: Number(checkoutRefund), // Added for 100% compatibility with Tax page!
        forfeitedAmount: Math.max(0, Number(checkoutDeposit) - Number(checkoutRefund))
      }

      let savedCancellations: any[] = []
      const localData = localStorage.getItem(`cancelled_contracts_${wsId}`)
      if (localData) {
        try {
          savedCancellations = JSON.parse(localData)
        } catch (e) {
          console.error("Failed to parse saved cancellations from localStorage", e)
        }
      }

      savedCancellations = [newCancellation, ...savedCancellations]
      localStorage.setItem(`cancelled_contracts_${wsId}`, JSON.stringify(savedCancellations))

      // 2. ย้ายออกผู้เช่าออกจากห้องพักใน Supabase
      const res = await deleteTenant(selectedRoom.tenantId, selectedRoom.roomNumber)
      if (res.success) {
        showToast(`✓ ดำเนินการย้ายออกผู้เช่าห้อง ${selectedRoom.roomNumber} และบันทึกประวัติภาษีสัญญายกเลิกเรียบร้อยแล้ว`, "success")
        setCheckoutModalOpen(false)
        await loadData(true)
      } else {
        setCheckoutError(res.error || "เกิดข้อผิดพลาดในการคืนห้องพัก")
      }
    } catch (err) {
      setCheckoutError("เกิดข้อผิดพลาดในการดำเนินการคืนห้องพัก")
    } finally {
      setCheckoutSubmitting(false)
    }
  }



  // ลบประวัติการยกเลิกสัญญา มาตรา 40(8)
  const handleDeleteCancellation = (id: string) => {
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการยกเลิกสัญญานี้? สำหรับยอดภาษีจะคำนวณใหม่โดยอัตโนมัติ")) return
    const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
    const updated = cancelledContracts.filter(c => c.id !== id)
    setCancelledContracts(updated)
    localStorage.setItem(`cancelled_contracts_${wsId}`, JSON.stringify(updated))
    showToast("✓ ลบประวัติการยกเลิกสัญญาเรียบร้อยแล้ว", "success")
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
          label: "สัญญาหมดอายุ",
          style: "bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 font-bold",
          dotColor: "bg-red-500"
        }
      } else {
        return {
          label: "อยู่ครบสัญญา",
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

  // ตรวจสอบเงื่อนไขออกก่อนกำหนด (Break Contract) เปรียบเทียบปีและเดือนที่คืนห้องเทียบกับเดือนที่หมดสัญญา
  const checkIfBreakContract = (dateStr: string) => {
    if (!selectedRoom || !selectedRoom.leaseEnd || !dateStr) return false
    const checkDate = new Date(dateStr)
    const leaseEndDate = new Date(selectedRoom.leaseEnd)
    
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

    if (!hasTenant) {
      return {
        label: "ว่าง",
        badgeStyle: "bg-red-50 text-red-600 dark:bg-red-950/35 dark:text-red-400 border border-red-200/40 dark:border-red-800/40",
        dotStyle: "bg-red-500",
        code: "available"
      }
    } else if (!isRegistered) {
      return {
        label: "มีผู้เช่าแล้ว (ยังไม่ลงทะเบียนไลน์)",
        badgeStyle: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/40 dark:border-amber-900/40",
        dotStyle: "bg-amber-500",
        code: "waiting"
      }
    } else {
      return {
        label: "มีผู้เช่าแล้ว (เชื่อม LINE)",
        badgeStyle: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/35 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40",
        dotStyle: "bg-emerald-500",
        code: "occupied"
      }
    }
  }

  // คัดกรองห้องตามการค้นหาและฟิลเตอร์สถานะใหม่ (ว่าง / รอลงทะเบียน / มีผู้เช่าแล้ว)
  const filteredRooms = rooms.filter(room => {
    const matchesSearch = 
      room.roomNumber.includes(search) || 
      room.roomTypeName.toLowerCase().includes(search.toLowerCase()) ||
      (room.tenantName && room.tenantName.toLowerCase().includes(search.toLowerCase())) ||
      (room.tenantPhone && room.tenantPhone.includes(search))

    const details = getRoomStatusDetails(room)
    const matchesFilter = filter === "all" || details.code === filter
    
    return matchesSearch && matchesFilter
  })

  // คำนวณสถิติหลักของห้องพัก
  const totalRoomsCount = rooms.length
  const vacantRoomsCount = rooms.filter(r => !r.tenantName).length
  const waitingRoomsCount = rooms.filter(r => r.tenantName && !r.lineUserId).length
  const occupiedRoomsCount = rooms.filter(r => r.tenantName && r.lineUserId).length

  // Skeletons Loader component for loading states
  const SkeletonLoader = () => (
    <div className="space-y-4">
      {/* Desktop Table Skeleton */}
      <div className="hidden md:block space-y-3">
        <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse w-full" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between items-center py-4 px-4 border-b border-slate-100 dark:border-slate-800 animate-pulse">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/12" />
          </div>
        ))}
      </div>
      
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

      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-6 relative">
        {/* Ambient Decorative Background Glows */}
        <div className="absolute top-10 right-1/4 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-[250px] h-[250px] bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />

        {/* 1. HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
              <Home className="w-3.5 h-3.5" /> ระบบบริหารจัดการอพาร์ทเมนท์
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              จัดการห้องพักและผู้เช่า
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-2xl leading-relaxed">
              ตารางรวมรายชื่อห้องพักทั้งหมด (Room-centric) เพิ่มผู้เช่า ทำสัญญาเช่าใหม่ เจนลิงก์สำหรับส่งให้ผู้เช่าลงทะเบียนผ่าน LINE และดำเนินการย้ายออกในหน้ารวมหน้านี้หน้าเดียว
            </p>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            {/* Manage Types Config */}
            <button
              onClick={() => setTypesModalOpen(true)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 font-bold text-xs flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Settings className="w-4 h-4 text-indigo-500 animate-spin-hover" />
              ตั้งค่าประเภทห้องพัก
            </button>

            {/* Add Room Button (desktop only) */}
            <button
              onClick={handleAddClick}
              className="hidden md:flex px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs items-center gap-2 transition-all shadow shadow-blue-500/10 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              เพิ่มห้องพักใหม่
            </button>
          </div>
        </div>

        {/* 2. STATS CARDS GRID */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4 shrink-0">
          {/* Card 1: Total Rooms */}
          <div className="glass-panel p-4 md:p-5 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex items-center gap-4 hover:border-slate-300 dark:hover:border-slate-800/80 transition-all group">
            <div className="p-3 bg-slate-100 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 rounded-xl group-hover:scale-110 transition-transform">
              <Building className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 block font-semibold uppercase tracking-wider">ห้องพักทั้งหมด</span>
              <span className="text-lg md:text-xl font-extrabold text-slate-850 dark:text-slate-100 mt-0.5 block">{loading ? "..." : totalRoomsCount} ห้อง</span>
            </div>
          </div>

          {/* Card 2: Vacant Rooms */}
          <div className="glass-panel p-4 md:p-5 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex items-center gap-4 hover:border-red-200 dark:hover:border-red-900/40 transition-all group">
            <div className="p-3 bg-red-500/10 text-red-500 rounded-xl group-hover:scale-110 transition-transform">
              <Home className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 block font-semibold uppercase tracking-wider">ห้องว่าง</span>
              <span className="text-lg md:text-xl font-extrabold text-red-600 dark:text-red-400 mt-0.5 block">{loading ? "..." : vacantRoomsCount} ห้อง</span>
            </div>
          </div>

          {/* Card 3: Waiting for LINE Registration */}
          <div className="glass-panel p-4 md:p-5 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex items-center gap-4 hover:border-amber-200 dark:hover:border-amber-900/40 transition-all group">
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 block font-semibold uppercase tracking-wider">ยังไม่ลงทะเบียนไลน์</span>
              <span className="text-lg md:text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5 block">{loading ? "..." : waitingRoomsCount} ห้อง</span>
            </div>
          </div>

          {/* Card 4: Occupied & Registered */}
          <div className="glass-panel p-4 md:p-5 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex items-center gap-4 hover:border-emerald-200 dark:hover:border-emerald-900/40 transition-all group">
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 block font-semibold uppercase tracking-wider">มีผู้เช่าสมบูรณ์</span>
              <span className="text-lg md:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">{loading ? "..." : occupiedRoomsCount} ห้อง</span>
            </div>
          </div>
        </div>

        {/* 3. SEARCH & STATUS FILTERS */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-200/60 dark:border-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search bar with ambient border glow */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-450 dark:text-slate-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="ค้นหา หมายเลขห้อง, ชื่อผู้เช่า หรือเบอร์โทรศัพท์..."
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

          {/* Filter Badges Row */}
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline-block">ตัวกรอง:</span>
            {[
              { id: "all", label: "ทั้งหมด" },
              { id: "available", label: "เฉพาะห้องว่าง" },
              { id: "waiting", label: "มีผู้เช่าแล้ว (ยังไม่ลงทะเบียนไลน์)" },
              { id: "occupied", label: "มีผู้เช่าแล้ว (เชื่อม LINE)" }
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
              {/* DESKTOP VIEW: HIGH-DENSITY DATA TABLE (hidden on mobile, visible on desktop) */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-900/60 shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200/60 dark:border-slate-900/60">
                      <th className="p-4 w-28">หมายเลขห้อง</th>
                      <th className="p-4 w-40">สถานะห้อง</th>
                      <th className="p-4 w-32 text-right">ค่าเช่ารายเดือน</th>
                      <th className="p-4">ประเภทห้อง</th>
                      <th className="p-4">ผู้เช่าสัญญา</th>
                      <th className="p-4">เบอร์โทรศัพท์</th>
                      <th className="p-4 w-36">สถานะสัญญา</th>
                      <th className="p-4 text-center w-[270px]">การดำเนินการ</th>
                      <th className="p-4 text-center w-24">ตั้งค่าห้อง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-900/50">
                    {filteredRooms.length > 0 ? (
                      filteredRooms.map((room) => {
                        const statusDetails = getRoomStatusDetails(room)
                        return (
                          <tr key={room.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/15 transition-colors">
                            {/* 1. Room Number */}
                            <td className="p-4 font-extrabold text-slate-850 dark:text-slate-100 text-sm tracking-wide">{room.roomNumber}</td>
                            
                            {/* 2. Room Status */}
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${statusDetails.badgeStyle}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusDetails.dotStyle}`} />
                                {statusDetails.label}
                              </span>
                            </td>

                            {/* 3. Rent */}
                            <td className="p-4 text-right font-extrabold text-slate-850 dark:text-slate-100">
                              {room.baseRent.toLocaleString()} บาท
                            </td>

                            {/* 4. Type Name */}
                            <td className="p-4">
                              <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-200/30 dark:border-indigo-800/30">
                                <Tag className="w-3 h-3" /> {room.roomTypeName}
                              </span>
                            </td>

                            {/* 5. Tenant Name */}
                            <td className="p-4 text-slate-700 dark:text-slate-300 font-bold">
                              {room.tenantName ? (
                                <div className="flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate max-w-[140px]" title={room.tenantName}>{room.tenantName}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                              )}
                            </td>

                            {/* 6. Phone Number */}
                            <td className="p-4 text-slate-500 dark:text-slate-400 font-mono">
                              {room.tenantPhone ? (
                                <div className="flex items-center gap-1.5">
                                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{room.tenantPhone}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                              )}
                            </td>

                            {/* 6.5 Contract Status Column */}
                            <td className="p-4">
                              {room.tenantName ? (() => {
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
                              })() : (
                                <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                              )}
                            </td>

                            {/* 7. Action Button column (Status-dependent) */}
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-2 max-w-[260px] mx-auto">
                                {/* VACANT: Generate LINE Link */}
                                {!room.tenantName && (
                                  <button
                                    onClick={() => handleOpenLineLinkModal(room)}
                                    className="w-[145px] h-8 text-[11px] font-bold text-white bg-[#06C755] hover:bg-[#05b34c] rounded-lg hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-[#06C755]/15 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                  >
                                    <Share2 className="w-3.5 h-3.5 shrink-0" />
                                    เจนลิงก์ LINE
                                  </button>
                                )}

                                {/* WAITING FOR LINE: Generate/Copy Link & View Details/Checkout */}
                                {room.tenantName && !room.lineUserId && (
                                  <>
                                    <button
                                      onClick={() => handleOpenLineLinkModal(room)}
                                      className="w-[115px] h-8 text-[11px] font-bold text-[#05a33c] dark:text-[#06d65f] bg-[#06C755]/10 border border-[#06C755]/30 hover:bg-[#06C755] hover:text-white dark:hover:text-white hover:border-transparent rounded-lg hover:-translate-y-0.5 transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                    >
                                      <Share2 className="w-3.5 h-3.5 shrink-0" />
                                      เจนลิงก์ LINE
                                    </button>
                                    <button
                                      onClick={() => handleOpenDetailModal(room)}
                                      className="w-[125px] h-8 text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-900/40 hover:bg-teal-600 hover:text-white dark:hover:text-white hover:border-transparent rounded-lg hover:-translate-y-0.5 transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                      ดูรายละเอียด/ย้ายออก
                                    </button>
                                  </>
                                )}

                                {/* REGISTERED: View details / checkout */}
                                {room.tenantName && room.lineUserId && (
                                  <button
                                    onClick={() => handleOpenDetailModal(room)}
                                    className="w-[145px] h-8 text-[11px] font-bold text-white bg-teal-600 hover:bg-teal-500 rounded-lg hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-teal-600/10 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    ดูรายละเอียด/ย้ายออก
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* 8. Room Management Buttons */}
                            <td className="p-4 text-center border-l border-slate-100 dark:border-slate-900/50">
                              <div className="flex items-center justify-center gap-1.5">
                                <button 
                                  onClick={() => handleEditClick(room)}
                                  className="p-1.5 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-slate-100 dark:hover:bg-slate-900/50 rounded-lg transition-colors cursor-pointer"
                                  title="แก้ไขข้อมูลห้องพัก"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRoomTrigger(room.id, room.roomNumber)}
                                  className="p-1.5 text-red-500 hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-900/50 rounded-lg transition-colors cursor-pointer"
                                  title="ลบห้องพัก"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                          {/* Empty State Block */}
                          <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                            <div className="p-3 bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-full border border-slate-200/50">
                              <Home className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-700 dark:text-slate-300 text-xs">ไม่พบข้อมูลห้องพักหรือเงื่อนไขผู้เช่า</p>
                              <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-1">ทดลองกรอกค้นหาข้อมูลอื่น สลับฟิลเตอร์สถานะ หรือกดปุ่มเพิ่มห้องพักใหม่ด้านบน</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">ห้องพัก</span>
                            <span className="text-lg font-extrabold text-slate-850 dark:text-slate-100 tracking-wide">ห้อง {room.roomNumber}</span>
                          </div>
                          <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${statusDetails.badgeStyle}`}>
                            {statusDetails.label}
                          </span>
                        </div>

                        {/* Mobile Info Body */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500 font-medium">ประเภท & ค่าเช่า:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              {room.roomTypeName} • {room.baseRent.toLocaleString()} บ.
                            </span>
                          </div>
                          
                          {/* Tenant Info */}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500 font-medium">ผู้เช่าปัจจุบัน:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              {room.tenantName ? (
                                <span className="flex items-center gap-1 font-extrabold text-slate-800 dark:text-slate-200">
                                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {room.tenantName}
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
                          <div className="flex gap-2">
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
                                  className="flex-1 py-3 px-4 text-xs font-bold text-[#05a33c] dark:text-[#06d65f] bg-[#06C755]/10 border border-[#06C755]/30 hover:bg-[#06C755] hover:text-white dark:hover:text-white hover:border-transparent rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 h-11 whitespace-nowrap"
                                >
                                  <Share2 className="w-4 h-4 shrink-0" />
                                  เจนลิงก์ LINE
                                </button>
                                <button
                                  onClick={() => handleOpenDetailModal(room)}
                                  className="flex-1 py-3 px-4 text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-900/40 hover:bg-teal-600 hover:text-white dark:hover:text-white hover:border-transparent rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 h-11 whitespace-nowrap"
                                >
                                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                                  ดูรายละเอียด/ย้ายออก
                                </button>
                              </>
                            )}

                            {/* OCCUPIED: View Details / Checkout */}
                            {room.tenantName && room.lineUserId && (
                              <button
                                onClick={() => handleOpenDetailModal(room)}
                                className="flex-1 py-3 px-4 text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 h-11 whitespace-nowrap"
                              >
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                ดูรายละเอียด/ย้ายออก
                              </button>
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
          <div className="glass-panel rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-5 md:p-6 space-y-4">
            <div className="pb-1.5 border-b border-slate-100 dark:border-slate-800/40">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-red-500" /> 
                ประวัติเงินประกันและสัญญายกเลิก มาตรา 40(8)
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
                รายการยกเลิกสัญญาเช่าห้องพักและคำนวณเงินประกันริบ [ เงินประกัน - เงินคืนจริง ] เพื่อนำไปใช้คำนวณภาษีเงินได้ประเภท 40(8) โดยอ้างอิงตามปีปฏิทินที่มีการย้ายออก
              </p>
            </div>

            {cancelledContracts.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200/50 dark:border-slate-800/80 bg-white dark:bg-slate-950/20">
                <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 text-slate-500 dark:text-slate-400 font-bold text-[11px]">
                      <th className="py-3 px-4">ห้องพัก / ผู้เช่า</th>
                      <th className="py-3 px-4 text-center">วันที่ยกเลิก</th>
                      <th className="py-3 px-4 text-right">เงินประกัน (บาท)</th>
                      <th className="py-3 px-4 text-right">โอนคืนจริง (บาท)</th>
                      <th className="py-3 px-4 text-right">ยอดที่ริบ (บาท)</th>
                      <th className="py-3 px-4 text-center w-16">ลบ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    {cancelledContracts.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/5 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300">
                          ห้อง {c.roomNumber} - {c.tenantName}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 dark:text-slate-400 font-semibold font-mono text-[11px]">
                          {c.cancellationDate ? new Date(c.cancellationDate).toLocaleDateString("th-TH", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }) : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-450 font-bold">
                          {Number(c.depositAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-450 font-bold">
                          {Number((c.actualRefund ?? c.refundedAmount) ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-red-600 dark:text-red-400 bg-red-500/5">
                          {Number(c.forfeitedAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleDeleteCancellation(c.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 dark:bg-slate-900 dark:hover:bg-red-950/20 border border-slate-200/40 dark:border-slate-800 rounded-lg transition-all cursor-pointer active:scale-90"
                            title="ลบประวัติ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-col sm:flex-row justify-between items-center p-4 bg-slate-50/50 dark:bg-slate-900/5 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 gap-2 font-bold">
                  <span>จำนวนสัญญาที่ยกเลิกสะสมในระบบ: {cancelledContracts.length} รายการ</span>
                  <span className="text-red-600 dark:text-red-400 font-extrabold font-mono text-xs md:text-sm bg-red-50 dark:bg-red-950/20 px-3 py-1 rounded-xl border border-red-150 dark:border-red-900/30 shadow-sm shadow-red-500/5 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    รวมยอดเงินริบสะสม: {cancelledContracts.reduce((sum, c) => sum + Number(c.forfeitedAmount || 0), 0).toLocaleString()} บาท
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 border border-dashed border-slate-250 dark:border-slate-800/80 text-slate-400 dark:text-slate-500 text-xs">
                <ShieldCheck className="w-8 h-8 text-slate-350 dark:text-slate-600 mx-auto mb-2.5 opacity-60" />
                <p className="font-bold">ยังไม่มีข้อมูลการแจ้งคืนห้องพักหรือสัญญายกเลิก</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500/80 mt-1">ประวัติจะได้รับการบันทึกที่นี่โดยอัตโนมัติเมื่อท่านทำการ "แจ้งย้ายออก" ในปุ่มรายละเอียดห้องพัก</p>
              </div>
            )}
          </div>

        </div>

        {/* MOBILE STICKY BOTTOM ACTION BAR (Strictly Adaptive, handles notches with pb-safe) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 p-3.5 flex items-center justify-between gap-3.5 z-40 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <button
            onClick={() => setTypesModalOpen(true)}
            className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 active:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 dark:active:bg-slate-700/80 text-slate-700 dark:text-slate-200 font-bold px-4 rounded-xl flex items-center justify-center gap-2 text-sm transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <Settings className="w-5 h-5 text-indigo-500" /> ตั้งค่าประเภท
          </button>
          
          <button
            onClick={handleAddClick}
            className="flex-[2] h-12 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-500/20 transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <Plus className="w-5 h-5" /> เพิ่มห้องพักใหม่
          </button>
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

              <form onSubmit={handleSubmitRoomForm} className="space-y-5 relative z-10 overflow-y-auto flex-1 pr-1 pb-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">หมายเลขห้องพัก (Room Number)</label>
                  <input
                    type="text"
                    required
                    placeholder="ระบุหมายเลขห้องพัก เช่น 101, 102..."
                    className="w-full h-12 md:h-10 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-medium"
                    value={newRoomNumber}
                    onChange={(e) => setNewRoomNumber(e.target.value)}
                  />
                </div>

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

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    disabled={formSubmitting}
                    className="order-2 sm:order-1 flex-1 h-12 md:h-10 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm md:text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer"
                  >
                    ยกเลิกและปิด
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting || roomTypes.length === 0}
                    className="order-1 sm:order-2 flex-1 h-12 md:h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm md:text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow shadow-blue-600/10 transition-all duration-150 active:scale-95 cursor-pointer"
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
        {/* MODAL 3: UNIFIED LEASE CONTRACT MODAL (ทำสัญญา/เพิ่มผู้เช่า) */}
        {/* ========================================================= */}
        {contractModalOpen && selectedRoom && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-6 relative overflow-hidden max-h-[92vh] md:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-blue-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex justify-between items-center shrink-0 relative z-10">
                <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-500" /> 
                  ทำสัญญาเช่าห้อง {selectedRoom.roomNumber}
                </h3>
                <button 
                  onClick={() => setContractModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitContract} className="space-y-4.5 relative z-10 overflow-y-auto flex-1 pr-1 pb-1">
                
                {/* Room Info Preview */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-700 dark:text-slate-300">ประเภท: {selectedRoom.roomTypeName}</span>
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
                    className="order-2 sm:order-1 flex-1 h-12 md:h-10 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm md:text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={contractSubmitting}
                    className="order-1 sm:order-2 flex-1 h-12 md:h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm md:text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow shadow-blue-600/10 transition-all duration-150 active:scale-95 cursor-pointer"
                  >
                    {contractSubmitting ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : "สร้างสัญญาและเชื่อมต่อ LINE"}
                  </button>
                </div>
              </form>
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
                  <div className="p-4 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10 dark:border-emerald-500/20 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                    <div className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ทำสัญญาสำเร็จ! กรุณาส่งลิงก์นี้ให้ผู้เช่าเชื่อมโยง LINE
                    </div>
                    <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                      ลิงก์ LINE LIFF นี้ได้รับการล็อค Workspace ID และหมายเลขห้องพัก ({selectedRoom.roomNumber}) ไว้อย่างปลอดภัย ผู้เช่าสามารถเข้าลงทะเบียนด้วย LINE บนสมาร์ทโฟนเพื่อรับส่งบิลค่าน้ำค่าไฟได้ทันที
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/10 dark:border-blue-500/20 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                    <div className="font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <Share2 className="w-4 h-4 shrink-0" />
                      แชร์ลิงก์ให้ผู้เช่าลงทะเบียน (ห้องว่าง)
                    </div>
                    <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                      แชร์ลิงก์ LINE LIFF นี้ให้กับผู้เช่าคนใหม่ ผู้เช่าจะสามารถกรอกชื่อ-นามสกุล และเบอร์โทรศัพท์มือถือผ่านสมาร์ทโฟนของตนเอง เพื่อผูกบัญชีและลงทะเบียนผู้เช่าระบบอพาร์ทเมนท์เข้ากับห้อง {selectedRoom.roomNumber} ได้โดยตรงทันที
                    </p>
                  </div>
                )}

                {/* Tenant Details Preview */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/60 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/60 px-4 py-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">ชื่อผู้เช่า:</span> 
                    <span className={selectedRoom.tenantName ? "font-extrabold text-slate-850 dark:text-slate-200" : "text-slate-400 dark:text-slate-500 italic font-semibold"}>
                      {selectedRoom.tenantName || "(รอผู้เช่าลงทะเบียนกรอกข้อมูล)"}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">เบอร์โทรศัพท์:</span> 
                    <span className={selectedRoom.tenantPhone ? "font-mono font-bold text-slate-850 dark:text-slate-200" : "text-slate-400 dark:text-slate-500 italic font-semibold"}>
                      {selectedRoom.tenantPhone || "(รอผู้เช่าลงทะเบียนกรอกข้อมูล)"}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">หมายเลขห้อง:</span> 
                    <span className="font-bold text-slate-850 dark:text-slate-200">ห้อง {selectedRoom.roomNumber}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-100/50 dark:border-slate-800/50">
                    <span className="text-slate-400">อัตราค่าเช่าห้อง:</span> 
                    <span className="font-bold text-slate-850 dark:text-slate-200">{(selectedRoom.baseRent || 0).toLocaleString()} บาท/เดือน</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">เงินประกัน (มัดจำ):</span> 
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
                    <span className="text-slate-400">ค่าเช่าล่วงหน้า:</span> 
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
                      value={getLiffRegistrationLink(selectedRoom.roomNumber)}
                    />
                    <button
                      onClick={() => handleCopyLinkToClipboard(selectedRoom.roomNumber)}
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
                  ข้อมูลผู้เช่าห้อง {selectedRoom.roomNumber}
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

                {/* Contract details list */}
                <div className="divide-y divide-slate-150 dark:divide-slate-800 border border-slate-200/60 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-900/40 px-4 py-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 dark:text-slate-500">ชื่อผู้เช่า:</span> 
                    <span className="font-extrabold text-slate-850 dark:text-slate-200">{selectedRoom.tenantName}</span>
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
                    <span className="font-semibold">{selectedRoom.roomTypeName} • {selectedRoom.baseRent.toLocaleString()} บาท/เดือน</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 dark:text-slate-500">ระยะสัญญาเริ่มต้น:</span> 
                    <span className="font-mono text-slate-700 dark:text-slate-300">{selectedRoom.leaseStart ? new Date(selectedRoom.leaseStart).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : "-"}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 dark:text-slate-500">วันสิ้นสุดสัญญา:</span> 
                    <span className="font-mono text-slate-700 dark:text-slate-300">{selectedRoom.leaseEnd ? new Date(selectedRoom.leaseEnd).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : "-"}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 dark:text-slate-500">รหัส LINE UID:</span> 
                    <span className="font-mono text-[10px] text-indigo-500 dark:text-indigo-400 select-all truncate max-w-[200px]" title={selectedRoom.lineUserId || ""}>{selectedRoom.lineUserId}</span>
                  </div>
                </div>

                {/* Actions Button */}
                <div className="flex flex-col gap-3 pt-2">
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

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => setTenantDetailModalOpen(false)}
                      className="order-2 sm:order-1 flex-1 h-12 md:h-10 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 text-sm md:text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer"
                    >
                      ปิดหน้าต่าง
                    </button>
                    
                    {/* RED CHECKOUT BUTTON */}
                    <button
                      type="button"
                      onClick={handleCheckoutTenantTrigger}
                      className="order-1 sm:order-2 flex-1 h-12 md:h-10 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 text-sm md:text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all duration-150 border border-red-200 dark:border-red-900/50 active:scale-95 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      แจ้งคืนห้อง/ย้ายออก
                    </button>
                  </div>
                </div>

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
                  className="order-2 sm:order-1 flex-1 h-12 md:h-10 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm md:text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="order-1 sm:order-2 flex-1 h-12 md:h-10 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 text-sm md:text-xs font-bold rounded-xl transition-all duration-150 border border-red-200/50 dark:border-red-900/50 active:scale-95 cursor-pointer"
                >
                  {deleteTarget.type === "tenant" ? "ยืนยันการคืนห้องพัก" : "ยืนยันลบข้อมูลถาวร"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 7: DETAILED TENANT CHECKOUT & CONTRACT CANCELLATION */}
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
                      แจ้งคืนห้องและยกเลิกสัญญา
                    </h3>
                    <p className="text-[10px] text-slate-450 dark:text-slate-500 mt-0.5 font-bold uppercase tracking-wider">คำนวณเงินประกันริบ ม. 40(8)</p>
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
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2 shrink-0">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}

              <form onSubmit={handleConfirmCheckout} className="space-y-4 relative z-10 overflow-y-auto flex-1 pr-1 pb-1">
                
                {/* Tenant & Room summary */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/60 rounded-xl text-xs space-y-2 text-slate-650 dark:text-slate-450">
                  <div className="flex justify-between font-bold">
                    <span>ห้องเช่าพัก:</span>
                    <span className="text-slate-850 dark:text-slate-200 font-extrabold">ห้อง {selectedRoom.roomNumber} ({selectedRoom.roomTypeName})</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>ผู้เช่าปัจจุบัน:</span>
                    <span className="text-blue-600 dark:text-blue-450 font-extrabold">{selectedRoom.tenantName}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-155 dark:border-slate-800 pt-2 text-[11px] font-semibold">
                    <span>อัตราค่าเช่ารายเดือน:</span>
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
                      onChange={(e) => handleCheckoutDateChange(e.target.value)}
                      className="w-full h-12 md:h-10 pl-9 pr-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-slate-800 dark:text-slate-100 text-base md:text-xs transition-colors font-bold font-mono cursor-pointer"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-1 leading-normal">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    ยอดเงินที่ริบไว้จะคิดเป็นรายได้ตาม พ.ศ. ของวันที่แจ้งออกนี้ เพื่อคำนวณภาษี ม. 40(8)
                  </span>
                </div>

                {/* Refund & Deposit fields side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] text-slate-550 dark:text-slate-400 font-bold uppercase tracking-wider block">เงินประกันที่ถืออยู่ (บาท)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                        <DollarSign className="w-4 h-4 md:w-3.5 md:h-3.5" />
                      </span>
                      <input
                        type="number"
                        required
                        value={checkoutDeposit}
                        onChange={(e) => setCheckoutDeposit(Number(e.target.value))}
                        className="w-full h-12 md:h-10 pl-9 pr-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-slate-800 dark:text-slate-100 text-base md:text-xs transition-colors font-extrabold font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] text-slate-550 dark:text-slate-400 font-bold uppercase tracking-wider block">จำนวนเงินคืนจริง (บาท)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                        <DollarSign className="w-4 h-4 md:w-3.5 md:h-3.5" />
                      </span>
                      <input
                        type="number"
                        required
                        min={0}
                        max={checkoutDeposit}
                        value={checkoutRefund}
                        onChange={(e) => setCheckoutRefund(Number(e.target.value))}
                        disabled={checkIfBreakContract(checkoutDate)}
                        className={`w-full h-12 md:h-10 pl-9 pr-4 border rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-slate-800 dark:text-slate-100 text-base md:text-xs transition-colors font-extrabold font-mono ${
                          checkIfBreakContract(checkoutDate)
                            ? "bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-75"
                            : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-850 cursor-text"
                        }`}
                      />
                    </div>
                    {checkIfBreakContract(checkoutDate) && (
                      <span className="text-[10px] text-amber-500 font-bold mt-1 block">
                        * ออกก่อนกำหนด (ผิดสัญญา): งดคืนเงินประกันตามเงื่อนไข
                      </span>
                    )}
                  </div>
                </div>

                {/* Forfeited summary card */}
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-150 dark:border-red-900/20 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-red-700 dark:text-red-400">ยอดเงินริบเข้าหอพัก (บาท)</span>
                    <span className="text-[10px] text-red-600/70 dark:text-red-450/70 block font-semibold">[ เงินประกัน - เงินคืนจริง ]</span>
                  </div>
                  <div className="text-right space-y-0.5">
                    <span className="text-xl md:text-2xl font-extrabold font-mono text-red-600 dark:text-red-400">
                      {Math.max(0, checkoutDeposit - checkoutRefund).toLocaleString()}
                    </span>
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 block">บาท</span>
                  </div>
                </div>

                {/* Submission and Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCheckoutModalOpen(false)}
                    disabled={checkoutSubmitting}
                    className="order-2 sm:order-1 flex-1 h-12 md:h-10 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm md:text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-55"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={checkoutSubmitting}
                    className="order-1 sm:order-2 flex-1 h-12 md:h-10 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 text-sm md:text-xs shadow-lg shadow-red-600/10 hover:shadow-red-600/20 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {checkoutSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 md:w-3.5 md:h-3.5 animate-spin" />
                        กำลังดำเนินการ...
                      </>
                    ) : (
                      <>
                        <LogOut className="w-4 h-4 md:w-3.5 md:h-3.5" />
                        ยืนยันการคืนห้องพัก
                      </>
                    )}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}


      </div>
    </>
  )
}
