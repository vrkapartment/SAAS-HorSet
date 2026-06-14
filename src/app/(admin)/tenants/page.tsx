"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
import { 
  Users, 
  Plus, 
  Search, 
  Calendar, 
  UserPlus, 
  Trash2, 
  Edit, 
  MessageSquare, 
  AlertCircle, 
  RefreshCw, 
  X, 
  Phone, 
  Info,
  CheckCircle2,
  AlertTriangle
} from "lucide-react"
import { 
  getTenants, 
  createTenant, 
  updateTenant, 
  deleteTenant 
} from "@/features/tenant/actions"

interface TenantItem {
  id: string
  roomNumber: string
  fullName: string
  phone: string
  lineUserId: string | null
  contractStart: string
  contractEnd: string
  status: "active" | "expired"
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [search, setSearch] = useState("")
  const [modalOpen, setModalOpen] = useState(false)

  // Custom Delete Confirm Modal State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    roomNumber: string
    fullName: string
  } | null>(null)

  // ข้อมูลฟอร์มผู้เช่า
  const [editingTenant, setEditingTenant] = useState<TenantItem | null>(null)
  const [roomNumber, setRoomNumber] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [lineUserId, setLineUserId] = useState("")
  const [contractStart, setContractStart] = useState("")
  const [contractEnd, setContractEnd] = useState("")
  const [formSubmitting, setFormSubmitting] = useState(false)

  // โหลดข้อมูลผู้เช่าจาก Supabase
  const loadTenants = async () => {
    setLoading(true)
    setError(null)
    const res = await getTenants()
    if (res.success && res.data) {
      setTenants(res.data as TenantItem[])
    } else {
      setError(res.error || "ไม่สามารถโหลดข้อมูลสัญญาผู้เช่าได้")
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTenants()
  }, [])

  // เปิดสำหรับเพิ่มผู้เช่าใหม่
  const handleAddClick = () => {
    setEditingTenant(null)
    setRoomNumber("")
    setFullName("")
    setPhone("")
    setLineUserId("")
    
    // ตั้งค่าเริ่มต้นของวันที่วันนี้และสิ้นสุดปีถัดไป
    const today = new Date()
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    nextYear.setDate(nextYear.getDate() - 1)
    
    setContractStart(today.toISOString().split("T")[0])
    setContractEnd(nextYear.toISOString().split("T")[0])
    setModalOpen(true)
  }

  // เปิดสำหรับแก้ไขผู้เช่าเดิม
  const handleEditClick = (tenant: TenantItem) => {
    setEditingTenant(tenant)
    setRoomNumber(tenant.roomNumber)
    setFullName(tenant.fullName)
    setPhone(tenant.phone)
    setLineUserId(tenant.lineUserId || "")
    setContractStart(tenant.contractStart)
    setContractEnd(tenant.contractEnd)
    setModalOpen(true)
  }

  // ทริกเกอร์การลบ (เปิด Custom Delete Confirm Modal)
  const handleDeleteTrigger = (id: string, roomNum: string, tenantName: string) => {
    setDeleteTarget({ id, roomNumber: roomNum, fullName: tenantName })
    setDeleteConfirmOpen(true)
  }

  // ดำเนินการลบจริงในฐานข้อมูลผู้เช่าเมื่อได้รับการกดยืนยันใน Custom Modal
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    setDeleteConfirmOpen(false)
    
    const res = await deleteTenant(deleteTarget.id, deleteTarget.roomNumber)
    if (res.success) {
      await loadTenants()
    } else {
      alert(res.error || "ยกเลิกและลบข้อมูลสัญญาผู้เช่าไม่สำเร็จ")
      setLoading(false)
    }
    setDeleteTarget(null)
  }

  // บันทึกฟอร์ม (เพิ่ม/แก้ไข)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName || !roomNumber) return
    setFormSubmitting(true)

    try {
      if (editingTenant) {
        // อัปเดตข้อมูลผู้เช่าจริง
        const res = await updateTenant(
          editingTenant.id,
          roomNumber,
          fullName,
          phone,
          lineUserId || null,
          contractStart,
          contractEnd
        )
        if (res.success) {
          await loadTenants()
          setModalOpen(false)
        } else {
          alert(res.error || "แก้ไขข้อมูลสัญญาผู้เช่าไม่สำเร็จ")
        }
      } else {
        // เพิ่มผู้เช่าใหม่จริง
        const res = await createTenant(
          roomNumber,
          fullName,
          phone,
          lineUserId || null,
          contractStart,
          contractEnd
        )
        if (res.success) {
          await loadTenants()
          setModalOpen(false)
        } else {
          alert(res.error || "สร้างสัญญาผู้เช่าไม่สำเร็จ")
        }
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ฐานข้อมูล")
    } finally {
      setFormSubmitting(false)
    }
  }

  // คัดกรองรายการ
  const filteredTenants = tenants.filter(tenant =>
    tenant.fullName.toLowerCase().includes(search.toLowerCase()) || 
    tenant.roomNumber.includes(search) || 
    tenant.phone.includes(search)
  )

  // Skeletons Loader component for loading states (Adaptive)
  const SkeletonLoader = () => (
    <div className="space-y-4">
      {/* Desktop Table Skeleton */}
      <div className="hidden md:block space-y-3">
        <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse w-full" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex justify-between items-center py-4 px-4 border-b border-slate-100 dark:border-slate-800 animate-pulse">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/12" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/12" />
          </div>
        ))}
      </div>
      
      {/* Mobile Cards Skeleton */}
      <div className="block md:hidden space-y-4">
        {[1, 2].map((i) => (
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
      {/* Container หลัก: เผื่อ pb-24 บนมือถือสำหรับหลบแถบปุ่มลอย และ pb-12 บนเดสก์ท็อป */}
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 p-3 sm:p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 transition-colors duration-300 pb-24 md:pb-12">
        
        {/* HEADER AREA - ADAPTIVE */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white dark:bg-slate-800/80 p-5 md:p-8 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm relative overflow-hidden">
          {/* subtle glow */}
          <div className="absolute top-0 right-0 w-[260px] h-[130px] bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-full blur-[60px] pointer-events-none" />
          
          <div className="space-y-2 relative z-10 w-full md:w-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400 font-bold rounded-full text-[10px] md:text-[11px] uppercase tracking-wider">
              <Users className="w-3.5 h-3.5" /> ระบบจัดการข้อมูลผู้เช่า
            </div>
            <h1 className="text-xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              จัดการสัญญาผู้เช่า (Lease Agreements)
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
              บันทึกประวัติผู้เช่าห้องพัก กำหนดระยะเวลาสัญญาเช่า ตลอดจนผูกเชื่อม LINE User ID ของผู้เช่าเข้ากับฐานข้อมูลระบบ เพื่อเตรียมส่งข้อความแจ้งเตือนแจ้งหนี้ค่าเช่าประจำเดือนอัตโนมัติ
            </p>
          </div>

          {/* Desktop Actions Row (hidden on mobile, uses sticky bottom bar on mobile) */}
          <div className="hidden md:flex items-center gap-2.5 relative z-10 shrink-0">
            <button
              onClick={loadTenants}
              disabled={loading}
              className="p-2.5 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer hover:-translate-y-0.5 active:scale-95 duration-200 h-10 w-10"
              title="รีเฟรชข้อมูลระบบ"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-500" : ""}`} />
            </button>
            
            <button
              onClick={handleAddClick}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-10 px-4 rounded-xl flex items-center justify-center gap-2 text-xs shadow-md shadow-blue-600/10 transition-all hover:-translate-y-0.5 active:scale-95 duration-200 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> เพิ่มสัญญาเช่าใหม่
            </button>
          </div>
          
          {/* Quick Refresh action for Mobile in Header */}
          <div className="md:hidden absolute top-4 right-4 z-10">
            <button
              onClick={loadTenants}
              disabled={loading}
              className="p-3 bg-slate-100 active:bg-slate-200 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-xl flex items-center justify-center transition-all duration-250 cursor-pointer animate-in fade-in"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-500" : ""}`} />
            </button>
          </div>
        </div>

        {/* CONTROLS AREA (SEARCH & TOTALS) - ADAPTIVE */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm transition-colors duration-300">
          
          {/* Search Box - Touch optimized spacing on mobile */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="w-5 h-5 md:w-4 md:h-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="ค้นหาชื่อผู้เช่า, หมายเลขห้องพัก, เบอร์โทร..."
              className="w-full h-12 md:h-10 pl-11 md:pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-base md:text-xs transition-all placeholder-slate-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Inline Information Badge on Desktop, Full Row on Mobile */}
          <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-250/30 dark:border-slate-800 rounded-xl flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-500" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-350">
              จำนวนสัญญาทั้งหมดที่แสดง: <strong className="text-slate-900 dark:text-white font-extrabold">{filteredTenants.length}</strong> รายการ
            </span>
          </div>
        </div>

        {/* Error Alert Bar */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-red-800 dark:text-red-400 rounded-2xl text-xs md:text-sm flex items-center gap-3 shadow-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* TENANTS DATA CONTAINER - ADAPTIVE LAYOUTS */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-4 md:p-6 shadow-sm transition-colors duration-300">
          
          {loading && tenants.length === 0 ? (
            <SkeletonLoader />
          ) : (
            <>
              {/* DESKTOP VIEW: HIGH-DENSITY CONTRACT DATA TABLE (hidden on mobile, visible on desktop) */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800/80">
                      <th className="p-4">หมายเลขห้อง</th>
                      <th className="p-4">ชื่อผู้เช่า</th>
                      <th className="p-4">เบอร์โทรศัพท์ติดต่อ</th>
                      <th className="p-4">ผูกข้อมูล LINE Bot</th>
                      <th className="p-4 text-center">กำหนดระยะสัญญาเช่า</th>
                      <th className="p-4 text-center">สถานะปัจจุบัน</th>
                      <th className="p-4 text-center">การจัดการสัญญาสาร</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredTenants.length > 0 ? (
                      filteredTenants.map((tenant) => (
                        <tr key={tenant.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/25 transition-colors">
                          <td className="p-4 font-extrabold text-slate-850 dark:text-slate-100 text-sm tracking-wide">{tenant.roomNumber}</td>
                          <td className="p-4 font-bold text-slate-700 dark:text-slate-200">{tenant.fullName}</td>
                          <td className="p-4 text-slate-500 dark:text-slate-400 font-mono font-medium">{tenant.phone}</td>
                          <td className="p-4">
                            {tenant.lineUserId ? (
                              <span className="inline-flex items-center gap-1.5 text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider bg-teal-50 dark:bg-teal-950/30 px-2.5 py-0.5 rounded-lg border border-teal-200/40 dark:border-teal-800/40 animate-pulse">
                                <MessageSquare className="w-3 h-3" /> ผูกเชื่อมสมบูรณ์
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 text-[10px] font-medium">-</span>
                            )}
                          </td>
                          <td className="p-4 text-center text-slate-500 dark:text-slate-450 font-mono">
                            <div className="flex items-center justify-center gap-1.5 font-medium">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>{tenant.contractStart} ถึง {tenant.contractEnd}</span>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              tenant.status === "active" 
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40" 
                                : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-500 border border-slate-200/30 dark:border-slate-800/50"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                tenant.status === "active" ? "bg-emerald-500" : "bg-slate-400"
                              }`} />
                              {tenant.status === "active" ? "มีผลใช้งาน" : "หมดระยะสัญญา"}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => handleEditClick(tenant)}
                                className="p-1.5 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                                title="แก้ไขข้อมูลสัญญา"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTrigger(tenant.id, tenant.roomNumber, tenant.fullName)}
                                className="p-1.5 text-red-500 hover:text-red-450 bg-slate-50 hover:bg-red-50 dark:bg-slate-900 dark:hover:bg-red-950/20 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                                title="ยกเลิกสัญญาและลบ"
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
                              <Users className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-700 dark:text-slate-300 text-xs">ไม่พบข้อมูลสัญญาผู้เช่า</p>
                              <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-1">ทดลองกรอกค้นหาชื่อห้องพักอื่น หรือเริ่มทำการบันทึกสัญญาฉบับแรก</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* MOBILE VIEW: CARD-BASED CONTRACT LIST (visible on mobile, hidden on desktop) */}
              <div className="block md:hidden space-y-4">
                {filteredTenants.length > 0 ? (
                  filteredTenants.map((tenant) => (
                    <div 
                      key={tenant.id}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-4 hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">หมายเลขห้องพัก</span>
                          <span className="text-lg font-extrabold text-slate-850 dark:text-slate-100 tracking-wide">{tenant.roomNumber}</span>
                        </div>
                        <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                          tenant.status === "active" 
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40" 
                            : "bg-slate-100 text-slate-500 dark:bg-slate-950/20 dark:text-slate-500 border border-slate-200/30 dark:border-slate-800/50"
                        }`}>
                          {tenant.status === "active" ? "มีผลใช้งาน" : "หมดสัญญา"}
                        </span>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-350">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium text-xs">ชื่อผู้เช่าจริง:</span>
                          <span className="font-extrabold text-slate-850 dark:text-slate-100">{tenant.fullName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium text-xs">เบอร์โทรศัพท์:</span>
                          <span className="font-mono text-slate-850 dark:text-slate-100">
                            <a href={`tel:${tenant.phone}`} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 underline decoration-dotted font-bold">
                              <Phone className="w-4 h-4 text-slate-400 shrink-0" /> {tenant.phone}
                            </a>
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500 font-medium text-xs">ผูกบัญชี LINE ID:</span>
                          <span>
                            {tenant.lineUserId ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider bg-teal-50/50 dark:bg-teal-950/20 px-2.5 py-0.5 rounded-lg border border-teal-200/30 dark:border-teal-850">
                                <MessageSquare className="w-3.5 h-3.5 text-teal-500" /> เชื่อม LINE แล้ว
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 text-xs font-normal">ยังไม่ได้เชื่อมต่อ</span>
                            )}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 pt-1">
                          <span className="text-slate-400 dark:text-slate-500 font-medium text-xs">ช่วงวันกำหนดระยะสัญญา:</span>
                          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span>{tenant.contractStart} ถึง {tenant.contractEnd}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons with high-touch targets on mobile */}
                      <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleEditClick(tenant)}
                          className="flex-1 py-3 px-4 text-sm font-bold text-blue-600 dark:text-blue-400 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all flex items-center justify-center gap-2 h-12 active:scale-95 active:bg-slate-100 dark:active:bg-slate-800 duration-200 cursor-pointer"
                        >
                          <Edit className="w-4 h-4" /> แก้ไขสัญญา
                        </button>
                        <button
                          onClick={() => handleDeleteTrigger(tenant.id, tenant.roomNumber, tenant.fullName)}
                          className="flex-1 py-3 px-4 text-sm font-bold text-red-600 dark:text-red-400 bg-slate-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/20 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all flex items-center justify-center gap-2 h-12 active:scale-95 active:bg-red-100 dark:active:bg-red-950/30 duration-200 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" /> ลบสัญญาเช่า
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 bg-slate-50/50 dark:bg-slate-900/40 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 text-slate-400 dark:text-slate-500 text-xs">
                    ไม่พบข้อมูลสัญญาเช่าหรือชื่อผู้เช่าที่ค้นหา
                  </div>
                )}
              </div>
            </>
          )}

        </div>

        {/* MOBILE STICKY BOTTOM ACTION BAR (Strictly Adaptive, handles notches with pb-safe) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 p-3.5 flex items-center justify-between gap-3.5 z-45 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.08)] animate-in slide-in-from-bottom">
          <button
            onClick={loadTenants}
            className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 active:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 dark:active:bg-slate-700/80 text-slate-700 dark:text-slate-200 font-bold px-4 rounded-xl flex items-center justify-center gap-2 text-sm transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-500" : ""}`} /> ดึงข้อมูลใหม่
          </button>
          
          <button
            onClick={handleAddClick}
            className="flex-[2] h-12 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-500/20 transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-5 h-5" /> ทำสัญญาเช่าใหม่
          </button>
        </div>

        {/* MODAL 1: ADD/EDIT LEASE MODAL (Dialog on Desktop, Sheet on Mobile) */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-5 relative overflow-hidden max-h-[92vh] md:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              {/* Subtle ambient glow in modal */}
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-blue-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex justify-between items-center relative z-10 shrink-0">
                <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-500" /> 
                  {editingTenant ? "แก้ไขสัญญาเช่าห้องพัก" : "เพิ่มสัญญาเช่าใหม่ (New Lease)"}
                </h3>
                <button 
                  onClick={() => setModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 relative z-10 overflow-y-auto flex-1 pr-1 pb-1">
                {/* Form layout: Grid Column 2 on desktop, Single Column on Mobile */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">หมายเลขห้องพัก (Room No.)</label>
                    <input
                      type="text"
                      required
                      placeholder="ระบุหมายเลขห้อง เช่น 101, 102..."
                      className="w-full h-12 md:h-10 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-bold"
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">เบอร์โทรศัพท์มือถือ</label>
                    <input
                      type="tel"
                      required
                      placeholder="เช่น 08X-XXX-XXXX..."
                      className="w-full h-12 md:h-10 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-mono font-semibold"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ชื่อ-นามสกุลจริง ผู้เช่า (Full Name)</label>
                  <input
                    type="text"
                    required
                    placeholder="กรอกชื่อและนามสกุลจริง..."
                    className="w-full h-12 md:h-10 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-semibold"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">LINE User ID (สำหรับแจ้งเตือนบิลของระบบ)</label>
                  <input
                    type="text"
                    placeholder="Uxxxxxx... (หากไม่มีเว้นว่างไว้ก่อนได้)"
                    className="w-full h-12 md:h-10 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-base md:text-xs transition-colors placeholder-slate-400 font-mono"
                    value={lineUserId}
                    onChange={(e) => setLineUserId(e.target.value)}
                  />
                  <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-semibold flex items-center gap-1 leading-normal">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    ใช้รับส่งใบเสร็จ บิลค่าน้ำไฟทางแชท LINE อัตโนมัติ
                  </span>
                </div>

                {/* Form layout grid for dates: Dual columns on desktop, Single column on Mobile */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">วันเริ่มต้นทำสัญญาเช่า</label>
                    <input
                      type="date"
                      required
                      className="w-full h-12 md:h-10 px-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-base md:text-xs transition-colors cursor-pointer font-bold"
                      value={contractStart}
                      onChange={(e) => setContractStart(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">วันสิ้นสุดสัญญาเช่า</label>
                    <input
                      type="date"
                      required
                      className="w-full h-12 md:h-10 px-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-base md:text-xs transition-colors cursor-pointer font-bold"
                      value={contractEnd}
                      onChange={(e) => setContractEnd(e.target.value)}
                    />
                  </div>
                </div>

                {/* Submit / Cancel Action Row - Touch target friendly heights */}
                <div className="flex flex-col sm:flex-row gap-3 pt-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    disabled={formSubmitting}
                    className="order- order-2 sm:order-1 flex-1 h-12 md:h-10 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm md:text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer"
                  >
                    ยกเลิกสัญญา
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="order-1 sm:order-2 flex-1 h-12 md:h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm md:text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow shadow-blue-600/10 hover:-translate-y-0.5 transition-all duration-150 active:scale-95 cursor-pointer"
                  >
                    {formSubmitting ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : editingTenant ? "บันทึกอัปเดตสัญญา" : "จัดทำสัญญาเช่าใหม่"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: CUSTOM DESTRUCTIVE CONFIRM MODAL (Premium SaaS UX - Dialog/Sheet Adaptive) */}
        {deleteConfirmOpen && deleteTarget && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300">
            <div className="w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-750 shadow-2xl p-6 space-y-6 relative overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-300 md:duration-200 pb-safe-bottom">
              
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full border border-red-100 dark:border-red-900/40 shrink-0">
                  <AlertTriangle className="w-6 h-6 animate-bounce" />
                </div>
                
                <div className="space-y-1.5 flex-1 min-w-0">
                  <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    ยืนยันลบและยกเลิกสัญญาเช่า
                  </h3>
                  <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    คุณแน่ใจหรือไม่ที่จะยกเลิกสัญญาเช่าของ <strong className="text-slate-850 dark:text-slate-100 font-extrabold">{deleteTarget.fullName}</strong> จากห้องพัก <strong className="text-slate-850 dark:text-slate-100 font-extrabold">{deleteTarget.roomNumber}</strong>?
                  </p>
                  <p className="text-[11px] text-amber-500 dark:text-amber-400 font-semibold leading-relaxed flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    เมื่อสัญญานี้ถูกลบ ห้องพักจะถูกปลดกลับมาเป็นสถานะว่าง (available) โดยทันที
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
                  เก็บสัญญาไว้
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="order-1 sm:order-2 flex-1 h-12 md:h-10 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 text-sm md:text-xs font-bold rounded-xl transition-all duration-150 border border-red-200/50 dark:border-red-900/50 active:scale-95 cursor-pointer"
                >
                  ยืนยันลบและปลดห้องว่าง
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
