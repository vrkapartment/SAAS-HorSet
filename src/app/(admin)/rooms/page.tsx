"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
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
  Info
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
import { useWorkspaceData } from "@/context/WorkspaceDataContext"

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
  tenantName: string | null
  tenantPhone: string | null
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "occupied" | "available">("all")
  
  // Modals Control
  const [modalOpen, setModalOpen] = useState(false)
  const [typesModalOpen, setTypesModalOpen] = useState(false)
  
  // Custom Delete Confirm Modal State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    type: "room" | "type"
    name: string
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

  // โหลดข้อมูลทั้งหมดจาก Supabase ร่วมกับการใช้งาน Cache ความเร็วสูง
  const loadData = async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
      
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
        await loadData(true) // รีเฟรชข้อมูลและเคลียร์แคช
      } else {
        alert(res.error || "ลบห้องพักไม่สำเร็จ")
        setLoading(false)
      }
    } else {
      setTypeSubmitting(true)
      const res = await deleteRoomType(deleteTarget.id)
      if (res.success) {
        const wsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
        clearWorkspaceCache(wsId)
        const typesRes = await getRoomTypes()
        if (typesRes.success && typesRes.data) {
          const typesData = typesRes.data as RoomTypeItem[]
          setRoomTypes(typesData)
          setCachedData(wsId, "room_types", typesData)
        }
      } else {
        alert(res.error || "ไม่สามารถลบประเภทห้องนี้ได้ เนื่องจากมีห้องพักอื่นอ้างอิงใช้งานประเภทนี้อยู่")
      }
      setTypeSubmitting(false)
      setLoading(false)
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
        await loadData(true) // เคลียร์แคชและดึงข้อมูลใหม่
        setModalOpen(false)
      } else {
        alert(res.error || "แก้ไขข้อมูลห้องพักไม่สำเร็จ")
      }
    } else {
      // เพิ่มห้องพักใหม่
      const res = await createRoom(newRoomNumber, selectedRoomTypeId, Number(newBaseRent))
      if (res.success) {
        await loadData(true) // เคลียร์แคชและดึงข้อมูลใหม่
        setModalOpen(false)
      } else {
        alert(res.error || "สร้างห้องพักไม่สำเร็จ")
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
        alert(res.error || "แก้ไขประเภทห้องไม่สำเร็จ")
      }
    } else {
      const res = await createRoomType(newTypeName, Number(newTypeRent))
      if (res.success) {
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
        alert(res.error || "เพิ่มประเภทห้องไม่สำเร็จ")
      }
    }
    setTypeSubmitting(false)
  }

  // คัดกรองห้องตามการค้นหาและฟิลเตอร์
  const filteredRooms = rooms.filter(room => {
    const matchesSearch = 
      room.roomNumber.includes(search) || 
      room.roomTypeName.toLowerCase().includes(search.toLowerCase()) ||
      (room.tenantName && room.tenantName.toLowerCase().includes(search.toLowerCase()))
    const matchesFilter = filter === "all" || room.status === filter
    return matchesSearch && matchesFilter
  })

  // คำนวณสถิติหลักของห้องพัก
  const totalRoomsCount = rooms.length
  const occupiedRoomsCount = rooms.filter(r => r.status === "occupied").length
  const availableRoomsCount = rooms.filter(r => r.status === "available").length

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
    <DashboardLayout role="admin">
      {/* Container หลัก: เผื่อ padding ด้านล่าง pb-24 บนโมบายล์เพื่อหลบแถบปุ่ม Sticky และ pb-12 บนเดสก์ท็อป */}
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 p-3 sm:p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 transition-colors duration-300 pb-24 md:pb-12">
        
        {/* HEADER AREA - ADAPTIVE */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white dark:bg-slate-800/80 p-5 md:p-8 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm relative overflow-hidden">
          {/* subtle glow */}
          <div className="absolute top-0 right-0 w-[260px] h-[130px] bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-full blur-[60px] pointer-events-none" />
          
          <div className="space-y-2 relative z-10 w-full md:w-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400 font-bold rounded-full text-[10px] md:text-[11px] uppercase tracking-wider">
              <Home className="w-3.5 h-3.5" /> ระบบการจัดการห้องพัก
            </div>
            <h1 className="text-xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              จัดการห้องพัก (Manage Rooms)
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
              บริหารจัดการห้องพัก เลือกสลับประเภทแอร์หรือพัดลม คอนฟิกอัตราค่าเช่ามาตรฐานของแต่ละประเภทห้อง ตลอดจนติดตามรายละเอียดข้อมูลผู้เช่าและหมายเลขโทรศัพท์ได้ทันที
            </p>
          </div>

          {/* Desktop inline action items (hidden on mobile to prevent clutter; mobile will use sticky bottom bar) */}
          <div className="hidden md:flex items-center gap-2.5 relative z-10 shrink-0">
            <button
              onClick={() => loadData(true)}
              disabled={loading}
              className="p-2.5 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer hover:-translate-y-0.5 active:scale-95 duration-200 h-10 w-10"
              title="รีเฟรชข้อมูลระบบ"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-500" : ""}`} />
            </button>
            
            <button
              onClick={() => setTypesModalOpen(true)}
              className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold h-10 px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition-all hover:-translate-y-0.5 active:scale-95 duration-200 cursor-pointer"
            >
              <Settings className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> จัดการประเภทห้องพัก
            </button>
            
            <button
              onClick={handleAddClick}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-10 px-4 rounded-xl flex items-center justify-center gap-2 text-xs shadow-md shadow-blue-600/10 transition-all hover:-translate-y-0.5 active:scale-95 duration-200 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> เพิ่มห้องพักใหม่
            </button>
          </div>
          
          {/* Quick Refresh action for Mobile in Header */}
          <div className="md:hidden absolute top-4 right-4 z-10">
            <button
              onClick={() => loadData(true)}
              disabled={loading}
              className="p-3 bg-slate-100 active:bg-slate-200 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-xl flex items-center justify-center transition-all duration-250 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-500" : ""}`} />
            </button>
          </div>
        </div>

        {/* STATS PANEL GRID - ADAPTIVE */}
        <div className="grid grid-cols-3 md:grid-cols-3 gap-3 md:gap-6">
          {/* Card 1: Total Rooms */}
          <div className="bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-3 md:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
            <div className="space-y-0.5 md:space-y-1">
              <span className="text-[9px] md:text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">ห้องพักรวม</span>
              <span className="text-xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100">{totalRoomsCount}</span>
              <span className="text-[9px] md:text-[11px] text-slate-400 dark:text-slate-500 block hidden md:block">ยูนิตห้องพักทั้งหมดในระบบ</span>
            </div>
            <div className="p-2 md:p-4 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg md:rounded-2xl border border-blue-100 dark:border-blue-800/40 self-start md:self-auto mt-1 md:mt-0">
              <Home className="w-4 h-4 md:w-6 md:h-6" />
            </div>
          </div>

          {/* Card 2: Occupied Rooms */}
          <div className="bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-3 md:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
            <div className="space-y-0.5 md:space-y-1">
              <span className="text-[9px] md:text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">มีผู้เช่า</span>
              <span className="text-xl md:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{occupiedRoomsCount}</span>
              <span className="text-[9px] md:text-[11px] text-slate-400 dark:text-slate-500 block hidden md:block">ยูนิตที่มีการสัญญาสมบูรณ์</span>
            </div>
            <div className="p-2 md:p-4 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg md:rounded-2xl border border-emerald-100 dark:border-emerald-800/40 self-start md:self-auto mt-1 md:mt-0">
              <CheckCircle2 className="w-4 h-4 md:w-6 md:h-6" />
            </div>
          </div>

          {/* Card 3: Available Rooms */}
          <div className="bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-3 md:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
            <div className="space-y-0.5 md:space-y-1">
              <span className="text-[9px] md:text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">ห้องว่าง</span>
              <span className="text-xl md:text-3xl font-extrabold text-amber-500 dark:text-amber-450">{availableRoomsCount}</span>
              <span className="text-[9px] md:text-[11px] text-slate-400 dark:text-slate-500 block hidden md:block">พร้อมต้อนรับผู้เช่ารายใหม่</span>
            </div>
            <div className="p-2 md:p-4 bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-450 rounded-lg md:rounded-2xl border border-amber-100 dark:border-amber-800/40 self-start md:self-auto mt-1 md:mt-0">
              <Tag className="w-4 h-4 md:w-6 md:h-6" />
            </div>
          </div>
        </div>

        {/* CONTROLS AREA (SEARCH & FILTER) - ADAPTIVE */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm transition-colors duration-300">
          
          {/* Search Box - Adaptive touch target on mobile */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="w-5 h-5 md:w-4 md:h-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="ค้นหา หมายเลขห้อง, ประเภท หรือชื่อผู้เช่า..."
              className="w-full h-12 md:h-10 pl-11 md:pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-base md:text-xs transition-all placeholder-slate-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Segmented Control Switch Filter - High-touch targets on mobile */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200/40 dark:border-slate-800/60 h-12 md:h-10">
            <button
              onClick={() => setFilter("all")}
              className={`flex-1 md:flex-none text-center px-3.5 text-xs md:text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center active:scale-95 duration-150 ${
                filter === "all"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/60 dark:border-slate-700/50"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              ทั้งหมด ({rooms.length})
            </button>
            <button
              onClick={() => setFilter("occupied")}
              className={`flex-1 md:flex-none text-center px-3.5 text-xs md:text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center active:scale-95 duration-150 ${
                filter === "occupied"
                  ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/60 dark:border-slate-700/50"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              มีผู้เช่า ({rooms.filter(r => r.status === "occupied").length})
            </button>
            <button
              onClick={() => setFilter("available")}
              className={`flex-1 md:flex-none text-center px-3.5 text-xs md:text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center active:scale-95 duration-150 ${
                filter === "available"
                  ? "bg-white dark:bg-slate-800 text-amber-500 dark:text-amber-450 shadow-sm border border-slate-200/60 dark:border-slate-700/50"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              ห้องว่าง ({rooms.filter(r => r.status === "available").length})
            </button>
          </div>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-red-800 dark:text-red-400 rounded-2xl text-xs md:text-sm flex items-center gap-3 shadow-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* ROOM DATA CONTAINER - ADAPTIVE LAYOUTS */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-4 md:p-6 shadow-sm transition-colors duration-300">
          
          {loading && rooms.length === 0 ? (
            <SkeletonLoader />
          ) : (
            <>
              {/* DESKTOP VIEW: HIGH-DENSITY DATA TABLE (hidden on mobile, visible on desktop) */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800/80">
                      <th className="p-4">หมายเลขห้อง</th>
                      <th className="p-4">ประเภทห้องพัก</th>
                      <th className="p-4">สถานะสัญญา</th>
                      <th className="p-4 text-right">อัตราค่าเช่า (เดือน)</th>
                      <th className="p-4">ชื่อผู้เช่าห้อง</th>
                      <th className="p-4">เบอร์โทรติดต่อ</th>
                      <th className="p-4 text-center">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredRooms.length > 0 ? (
                      filteredRooms.map((room) => (
                        <tr key={room.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/25 transition-colors">
                          <td className="p-4 font-extrabold text-slate-850 dark:text-slate-100 text-sm tracking-wide">{room.roomNumber}</td>
                          <td className="p-4">
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 rounded-lg border border-indigo-200/40 dark:border-indigo-800/40">
                              <Tag className="w-3 h-3" /> {room.roomTypeName}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              room.status === "occupied" 
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40" 
                                : "bg-amber-50 text-amber-500 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/40 dark:border-amber-800/40"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                room.status === "occupied" ? "bg-emerald-500" : "bg-amber-500"
                              }`} />
                              {room.status === "occupied" ? "มีผู้เช่าแล้ว" : "ห้องว่าง"}
                            </span>
                          </td>
                          <td className="p-4 text-right font-extrabold text-slate-800 dark:text-slate-100">
                            {room.baseRent.toLocaleString()} บาท
                          </td>
                          <td className="p-4 text-slate-700 dark:text-slate-350 font-semibold">
                            {room.tenantName ? (
                              <div className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-slate-400" />
                                {room.tenantName}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                            )}
                          </td>
                          <td className="p-4 text-slate-500 dark:text-slate-450 font-mono">
                            {room.tenantPhone ? (
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                {room.tenantPhone}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => handleEditClick(room)}
                                className="p-1.5 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                                title="แก้ไขข้อมูลห้องพัก"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteRoomTrigger(room.id, room.roomNumber)}
                                className="p-1.5 text-red-500 hover:text-red-450 bg-slate-50 hover:bg-red-50 dark:bg-slate-900 dark:hover:bg-red-950/20 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                                title="ลบห้องพัก"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                          {/* Empty State Block */}
                          <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                            <div className="p-3 bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-full border border-slate-200/50">
                              <Home className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-700 dark:text-slate-300 text-xs">ไม่พบข้อมูลระบบห้องพัก</p>
                              <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-1">ทดลองกรอกค้นหาหมายเลขอื่น หรือเพิ่มห้องพักใหม่เข้าระบบ</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* MOBILE VIEW: CARD-BASED LIST (visible on mobile, hidden on desktop) */}
              <div className="block md:hidden space-y-4">
                {filteredRooms.length > 0 ? (
                  filteredRooms.map((room) => (
                    <div 
                      key={room.id}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-4 hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">หมายเลขห้องพัก</span>
                          <span className="text-lg font-extrabold text-slate-850 dark:text-slate-100 tracking-wide">{room.roomNumber}</span>
                        </div>
                        <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                          room.status === "occupied" 
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40" 
                            : "bg-amber-50 text-amber-500 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/40 dark:border-amber-800/40"
                        }`}>
                          {room.status === "occupied" ? "มีผู้เช่าแล้ว" : "ห้องว่าง"}
                        </span>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-350">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium text-xs">ประเภทห้อง:</span>
                          <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 rounded-lg border border-indigo-200/40 dark:border-indigo-800/40">
                            <Tag className="w-3.5 h-3.5" /> {room.roomTypeName}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium text-xs">ค่าเช่ารายเดือน:</span>
                          <span className="font-extrabold text-slate-850 dark:text-slate-100">{room.baseRent.toLocaleString()} บาท</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium text-xs">ผู้เช่าปัจจุบัน:</span>
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            {room.tenantName ? (
                              <span className="flex items-center gap-1">
                                <Users className="w-4 h-4 text-slate-400 shrink-0" /> {room.tenantName}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium text-xs">เบอร์โทรศัพท์:</span>
                          <span className="font-mono text-slate-700 dark:text-slate-250">
                            {room.tenantPhone ? (
                              <a href={`tel:${room.tenantPhone}`} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 underline decoration-dotted">
                                <Phone className="w-4 h-4 text-slate-400 shrink-0" /> {room.tenantPhone}
                              </a>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons with high-touch targets on mobile */}
                      <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleEditClick(room)}
                          className="flex-1 py-3 px-4 text-sm font-bold text-blue-600 dark:text-blue-400 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all flex items-center justify-center gap-2 h-12 active:scale-95 active:bg-slate-100 dark:active:bg-slate-800 duration-200 cursor-pointer"
                        >
                          <Edit className="w-4 h-4" /> แก้ไขห้อง
                        </button>
                        <button
                          onClick={() => handleDeleteRoomTrigger(room.id, room.roomNumber)}
                          className="flex-1 py-3 px-4 text-sm font-bold text-red-600 dark:text-red-400 bg-slate-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/20 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all flex items-center justify-center gap-2 h-12 active:scale-95 active:bg-red-100 dark:active:bg-red-950/30 duration-200 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" /> ลบห้องพัก
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 bg-slate-50/50 dark:bg-slate-900/40 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 text-slate-400 dark:text-slate-500 text-xs">
                    ไม่พบข้อมูลห้องพักหรือตึกตามที่ระบุค้นหา
                  </div>
                )}
              </div>
            </>
          )}

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

        {/* MODAL 1: ADD/EDIT ROOM MODAL (Dialog on Desktop, Sheet on Mobile) */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-6 relative overflow-hidden max-h-[92vh] md:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              {/* Subtle ambient glow in modal */}
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-blue-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex justify-between items-center relative z-10 shrink-0">
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
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
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

                {/* Submit / Cancel Button Row - Touch friendly heights */}
                <div className="flex flex-col sm:flex-row gap-3 pt-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    disabled={formSubmitting}
                    className="order-2 sm:order-1 flex-1 h-12 md:h-10 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm md:text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer"
                  >
                    ยกเลิกและปิดหน้าต่าง
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting || roomTypes.length === 0}
                    className="order-1 sm:order-2 flex-1 h-12 md:h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm md:text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow shadow-blue-600/10 hover:-translate-y-0.5 transition-all duration-150 active:scale-95 cursor-pointer"
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

        {/* MODAL 2: MANAGE ROOM TYPES MODAL (Dialog on Desktop, Sheet on Mobile) */}
        {typesModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-lg bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 relative max-h-[92vh] md:max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              {/* Subtle ambient glow in modal */}
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-indigo-500/10 rounded-full blur-[50px] pointer-events-none animate-pulse" />
              
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

              {/* Form container scrollable inside sheet */}
              <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                {/* Form: Add/Edit Type - Adaptive Columns */}
                <form onSubmit={handleSubmitTypeForm} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/80 space-y-4 shrink-0 relative z-10">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200/50 dark:border-slate-800/55 pb-2">
                    <Settings className="w-3.5 h-3.5 text-indigo-500" />
                    {editingType ? "แก้ไขประเภทห้องพัก (Edit Type)" : "เพิ่มประเภทห้องพักใหม่ (Create Type)"}
                  </h4>
                  
                  {/* Grid Layout: Adaptive column counts */}
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

                {/* List: Existing Types - Touch friendly action layouts */}
                <div className="space-y-3 shrink-0 relative z-10">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">ประเภทห้องพักปัจจุบัน</h4>
                  {roomTypes.length > 0 ? (
                    <div className="divide-y divide-slate-150 dark:divide-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
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

        {/* MODAL 3: CUSTOM CONFIRM DELETE MODAL (Premium SaaS UX - Dialog/Sheet Adaptive) */}
        {deleteConfirmOpen && deleteTarget && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-750 shadow-2xl p-6 space-y-6 relative overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full border border-red-100 dark:border-red-900/40 shrink-0">
                  <AlertCircle className="w-6 h-6 animate-bounce" />
                </div>
                
                <div className="space-y-1.5 flex-1 min-w-0">
                  <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    ยืนยันการลบข้อมูลระบบ
                  </h3>
                  <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    คุณแน่ใจหรือไม่ที่จะลบรายการ <strong className="text-slate-850 dark:text-slate-100 font-extrabold">{deleteTarget.name}</strong> ออกจากฐานข้อมูลระบบ? การดำเนินการนี้จะลบข้อมูลถาวรและไม่สามารถย้อนคืนได้
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
                  ยืนยันลบข้อมูลถาวร
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
