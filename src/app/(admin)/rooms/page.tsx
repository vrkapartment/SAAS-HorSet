"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
import { Home, Plus, Search, Edit, Trash2, AlertCircle, RefreshCw, X, Tag, Settings } from "lucide-react"
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
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [roomTypes, setRoomTypes] = useState<RoomTypeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "occupied" | "available">("all")
  
  // Modals Control
  const [modalOpen, setModalOpen] = useState(false)
  const [typesModalOpen, setTypesModalOpen] = useState(false)
  
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

  // โหลดข้อมูลทั้งหมดจาก Supabase
  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [roomsRes, typesRes] = await Promise.all([getRooms(), getRoomTypes()])
      
      if (roomsRes.success && roomsRes.data) {
        setRooms(roomsRes.data as RoomItem[])
      } else {
        setError(roomsRes.error || "ไม่สามารถโหลดข้อมูลห้องพักได้")
      }
      
      if (typesRes.success && typesRes.data) {
        setRoomTypes(typesRes.data as RoomTypeItem[])
      }
    } catch (err) {
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูล")
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

  // การลบห้องพัก
  const handleDeleteRoom = async (id: string, roomNum: string) => {
    if (confirm(`คุณแน่ใจหรือไม่ที่จะลบห้องพักหมายเลข ${roomNum}?`)) {
      setLoading(true)
      const res = await deleteRoom(id)
      if (res.success) {
        await loadData()
      } else {
        alert(res.error || "ลบห้องพักไม่สำเร็จ")
        setLoading(false)
      }
    }
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
        await loadData()
        setModalOpen(false)
      } else {
        alert(res.error || "แก้ไขข้อมูลห้องพักไม่สำเร็จ")
      }
    } else {
      // เพิ่มห้องพักใหม่
      const res = await createRoom(newRoomNumber, selectedRoomTypeId, Number(newBaseRent))
      if (res.success) {
        await loadData()
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

    if (editingType) {
      const res = await updateRoomType(editingType.id, newTypeName, Number(newTypeRent))
      if (res.success) {
        setNewTypeName("")
        setNewTypeRent(4000)
        setEditingType(null)
        // โหลดข้อมูลประเภทห้องใหม่
        const typesRes = await getRoomTypes()
        if (typesRes.success && typesRes.data) {
          setRoomTypes(typesRes.data as RoomTypeItem[])
        }
      } else {
        alert(res.error || "แก้ไขประเภทห้องไม่สำเร็จ")
      }
    } else {
      const res = await createRoomType(newTypeName, Number(newTypeRent))
      if (res.success) {
        setNewTypeName("")
        setNewTypeRent(4000)
        const typesRes = await getRoomTypes()
        if (typesRes.success && typesRes.data) {
          setRoomTypes(typesRes.data as RoomTypeItem[])
        }
      } else {
        alert(res.error || "เพิ่มประเภทห้องไม่สำเร็จ")
      }
    }
    setTypeSubmitting(false)
  }

  // ลบประเภทห้องพัก
  const handleDeleteType = async (id: string, name: string) => {
    if (confirm(`คุณต้องการลบประเภทห้อง "${name}" ใช่หรือไม่?`)) {
      setTypeSubmitting(true)
      const res = await deleteRoomType(id)
      if (res.success) {
        const typesRes = await getRoomTypes()
        if (typesRes.success && typesRes.data) {
          setRoomTypes(typesRes.data as RoomTypeItem[])
        }
      } else {
        alert(res.error || "ไม่สามารถลบประเภทห้องนี้ได้ เนื่องจากมีห้องพักอื่นอ้างอิงใช้งานประเภทนี้อยู่")
      }
      setTypeSubmitting(false)
    }
  }

  // คัดกรองห้องตามการค้นหาและฟิลเตอร์
  const filteredRooms = rooms.filter(room => {
    const matchesSearch = 
      room.roomNumber.includes(search) || 
      room.roomTypeName.toLowerCase().includes(search.toLowerCase()) ||
      (room.tenantName && room.tenantName.includes(search))
    const matchesFilter = filter === "all" || room.status === filter
    return matchesSearch && matchesFilter
  })

  return (
    <DashboardLayout role="admin">
      {/* Header แถวบน */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">รายการห้องพักทั้งหมด</h2>
          <p className="text-xs text-slate-400 mt-1">บริหารจัดการห้องพัก เลือกประเภทห้องแอร์/พัดลม คอนฟิกราคาตามประเภท และดูข้อมูลผู้เช่าจริง</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 py-2.5 px-3 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setTypesModalOpen(true)}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-medium py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs transition-all"
          >
            <Settings className="w-4 h-4 text-indigo-400" /> จัดการประเภทห้องพัก
          </button>
          <button
            onClick={handleAddClick}
            className="glow-btn bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs shadow-lg shadow-blue-600/10"
          >
            <Plus className="w-4 h-4" /> เพิ่มห้องพักใหม่
          </button>
        </div>
      </div>

      {/* แถวกล่องควบคุมค้นหาและกรอง */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-slate-900/20 p-4 rounded-2xl border border-slate-900/60">
        {/* ค้นหา */}
        <div className="relative flex-1 max-w-sm">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="w-4 h-4 text-slate-500" />
          </span>
          <input
            type="text"
            placeholder="ค้นหาห้องพัก, ประเภทห้อง หรือชื่อผู้เช่า..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ฟิลเตอร์สลับแท็บ */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 text-xs font-medium rounded-xl transition-all ${
              filter === "all"
                ? "bg-slate-800 text-slate-100 border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            ทั้งหมด ({rooms.length})
          </button>
          <button
            onClick={() => setFilter("occupied")}
            className={`px-4 py-2 text-xs font-medium rounded-xl transition-all ${
              filter === "occupied"
                ? "bg-slate-800 text-teal-400 border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            มีผู้เช่า ({rooms.filter(r => r.status === "occupied").length})
          </button>
          <button
            onClick={() => setFilter("available")}
            className={`px-4 py-2 text-xs font-medium rounded-xl transition-all ${
              filter === "available"
                ? "bg-slate-800 text-amber-400 border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            ห้องว่าง ({rooms.filter(r => r.status === "available").length})
          </button>
        </div>
      </div>

      {/* สเตตแสดงความผิดพลาด */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ตารางแสดงข้อมูลห้องพัก */}
      <div className="glass-card rounded-2xl border border-slate-900/60 p-6">
        <div className="overflow-x-auto">
          {loading && rooms.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-500">กำลังดึงข้อมูลห้องพักและประเภทจาก Supabase...</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-900 text-slate-500 font-semibold">
                  <th className="pb-3 pl-2">หมายเลขห้อง</th>
                  <th className="pb-3">ประเภทห้อง</th>
                  <th className="pb-3">สถานะ</th>
                  <th className="pb-3 text-right">ค่าเช่าสุทธิ</th>
                  <th className="pb-3 pl-4">ชื่อผู้เช่า</th>
                  <th className="pb-3">เบอร์โทรติดต่อ</th>
                  <th className="pb-3 text-center">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {filteredRooms.length > 0 ? (
                  filteredRooms.map((room) => (
                    <tr key={room.id} className="hover:bg-slate-900/10">
                      <td className="py-4 pl-2 font-bold text-slate-200 text-sm">{room.roomNumber}</td>
                      <td className="py-4">
                        <span className="inline-flex items-center gap-1 text-[11px] text-indigo-400 font-medium bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/10">
                          <Tag className="w-3 h-3" /> {room.roomTypeName}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          room.status === "occupied" ? "bg-teal-500/10 text-teal-400" : "bg-amber-500/10 text-amber-400"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            room.status === "occupied" ? "bg-teal-500" : "bg-amber-500"
                          }`} />
                          {room.status === "occupied" ? "มีผู้เช่า" : "ห้องว่าง"}
                        </span>
                      </td>
                      <td className="py-4 text-right font-semibold text-slate-200">
                        {room.baseRent.toLocaleString()} บาท
                      </td>
                      <td className="py-4 pl-4 text-slate-300">
                        {room.tenantName ? room.tenantName : <span className="text-slate-600">-</span>}
                      </td>
                      <td className="py-4 text-slate-400">
                        {room.tenantPhone ? room.tenantPhone : <span className="text-slate-600">-</span>}
                      </td>
                      <td className="py-4 text-center space-x-3">
                        <button 
                          onClick={() => handleEditClick(room)}
                          className="text-slate-400 hover:text-blue-400 transition-colors"
                        >
                          <Edit className="w-4 h-4 inline text-blue-400" />
                        </button>
                        <button
                          onClick={() => handleDeleteRoom(room.id, room.roomNumber)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 inline text-red-500" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      ไม่พบข้อมูลห้องพักที่ตรงกับการค้นหา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal 1: เพิ่ม/แก้ไขห้องพัก */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl relative shadow-2xl animate-scale-up">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-md font-bold text-slate-200 flex items-center gap-2">
                <Home className="w-5 h-5 text-blue-400" /> 
                {editingRoom ? "แก้ไขข้อมูลห้องพัก" : "เพิ่มข้อมูลห้องพักใหม่"}
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRoomForm} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">หมายเลขห้องพัก</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น 101, 102"
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                  value={newRoomNumber}
                  onChange={(e) => setNewRoomNumber(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">ประเภทห้องพัก</label>
                <select
                  required
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                  value={selectedRoomTypeId}
                  onChange={(e) => handleRoomTypeChange(e.target.value)}
                >
                  <option value="" disabled>-- เลือกประเภทห้อง --</option>
                  {roomTypes.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.name} (ค่าเช่ามาตรฐาน: {type.default_rent} บาท)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">ราคาค่าเช่าพื้นฐาน (บาท / เดือน)</label>
                <input
                  type="number"
                  required
                  placeholder="ระบบจะดึงจากประเภทห้อง หรือคุณกำหนดเองได้"
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                  value={newBaseRent}
                  onChange={(e) => setNewBaseRent(e.target.value ? Number(e.target.value) : "")}
                />
                <span className="text-[10px] text-slate-500 block">ราคาที่บันทึกจริง สามารถกำหนดให้ต่างจากราคาเริ่มต้นของประเภทห้องได้</span>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={formSubmitting}
                  className="flex-1 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 text-xs rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || roomTypes.length === 0}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-xl font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {formSubmitting ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : "บันทึกข้อมูล"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: จัดการประเภทห้องพัก */}
      {typesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 rounded-2xl relative shadow-2xl animate-scale-up max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h3 className="text-md font-bold text-slate-200 flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-400" /> จัดการประเภทห้องพัก
              </h3>
              <button 
                onClick={() => setTypesModalOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ส่วนที่ 1: แบบฟอร์มเพิ่ม/แก้ไขประเภทห้อง */}
            <form onSubmit={handleSubmitTypeForm} className="bg-slate-900/40 p-4 rounded-xl border border-slate-900 space-y-3 mb-5 shrink-0">
              <h4 className="text-xs font-semibold text-slate-300">
                {editingType ? "แก้ไขประเภทห้องพัก" : "เพิ่มประเภทห้องพักใหม่"}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-medium">ชื่อประเภทห้องพัก</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น ห้องแอร์, ห้องพัดลม"
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-medium">ค่าเช่าเริ่มต้น (บาท/เดือน)</label>
                  <input
                    type="number"
                    required
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                    value={newTypeRent}
                    onChange={(e) => setNewTypeRent(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                {editingType && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingType(null)
                      setNewTypeName("")
                      setNewTypeRent(4000)
                    }}
                    className="px-3 py-1.5 bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 text-xs rounded-lg font-medium transition-colors"
                  >
                    ยกเลิกแก้ไข
                  </button>
                )}
                <button
                  type="submit"
                  disabled={typeSubmitting}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {typeSubmitting ? (
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : editingType ? "อัปเดต" : "เพิ่มประเภท"}
                </button>
              </div>
            </form>

            {/* ส่วนที่ 2: รายการประเภทห้องพักในระบบ */}
            <div className="flex-1 overflow-y-auto min-h-[150px] space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ประเภทห้องในระบบปัจจุบัน</h4>
              {roomTypes.length > 0 ? (
                <div className="divide-y divide-slate-900/60 bg-slate-900/10 border border-slate-900 rounded-xl overflow-hidden">
                  {roomTypes.map(type => (
                    <div key={type.id} className="flex justify-between items-center p-3 hover:bg-slate-900/30">
                      <div>
                        <div className="font-bold text-xs text-slate-200">{type.name}</div>
                        <div className="text-[10px] text-slate-500">ค่าเช่าเริ่มต้น: {type.default_rent.toLocaleString()} บาท</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingType(type)
                            setNewTypeName(type.name)
                            setNewTypeRent(type.default_rent)
                          }}
                          className="p-1.5 bg-slate-950 border border-slate-850 hover:border-slate-800 text-slate-400 hover:text-blue-400 rounded-lg transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteType(type.id, type.name)}
                          className="p-1.5 bg-slate-950 border border-slate-850 hover:border-slate-800 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-600 text-xs">
                  ยังไม่มีประเภทห้องในระบบ ให้กรอกเพิ่มประเภทใหม่ด้านบน
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
