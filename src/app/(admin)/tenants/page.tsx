"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
import { Users, Plus, Search, Calendar, UserPlus, Trash2, Edit, MessageSquare, AlertCircle, RefreshCw } from "lucide-react"
import { getTenants, createTenant, updateTenant, deleteTenant } from "@/features/tenant/actions"

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
      setError(res.error || "ไม่สามารถโหลดข้อมูลผู้เช่าได้")
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

  // ลบสัญญาผู้เช่า
  const handleDelete = async (id: string, roomNum: string, tenantName: string) => {
    if (confirm(`คุณต้องการยกเลิกสัญญาและลบข้อมูลผู้เช่า ${tenantName} จากห้อง ${roomNum} ใช่หรือไม่? (ห้องพักจะกลับมาเป็นสถานะว่าง)`)) {
      setLoading(true)
      const res = await deleteTenant(id, roomNum)
      if (res.success) {
        await loadTenants()
      } else {
        alert(res.error || "ลบข้อมูลสัญญาผู้เช่าไม่สำเร็จ")
        setLoading(false)
      }
    }
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
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์")
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

  return (
    <DashboardLayout role="admin">
      {/* Header แถวบน */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">ระบบจัดการผู้เช่าและสัญญา</h2>
          <p className="text-xs text-slate-400 mt-1">บันทึกประวัติผู้เช่าห้องพัก กำหนดช่วงสัญญา และผูก LINE User ID จริงเชื่อมโยงกับฐานข้อมูล Supabase</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadTenants}
            disabled={loading}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 py-2.5 px-3 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleAddClick}
            className="glow-btn bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-4 rounded-xl flex items-center gap-2 text-xs shadow-lg shadow-blue-600/10"
          >
            <UserPlus className="w-4 h-4" /> เพิ่มสัญญาเช่าใหม่
          </button>
        </div>
      </div>

      {/* ค้นหา */}
      <div className="relative max-w-sm bg-slate-900/20 p-2 rounded-2xl border border-slate-900/60">
        <span className="absolute inset-y-0 left-0 flex items-center pl-5">
          <Search className="w-4 h-4 text-slate-500" />
        </span>
        <input
          type="text"
          placeholder="ค้นหาชื่อผู้เช่า, ห้องพัก, เบอร์โทร..."
          className="w-full pl-9 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* แสดง Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ตารางข้อมูล */}
      <div className="glass-card rounded-2xl border border-slate-900/60 p-6">
        <div className="overflow-x-auto">
          {loading && tenants.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-500">กำลังดึงข้อมูลผู้เช่าจาก Supabase...</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-900 text-slate-500 font-semibold">
                  <th className="pb-3 pl-2">ห้อง</th>
                  <th className="pb-3">ชื่อผู้เช่า</th>
                  <th className="pb-3">เบอร์ติดต่อ</th>
                  <th className="pb-3">LINE User ID</th>
                  <th className="pb-3 text-center">ระยะสัญญา</th>
                  <th className="pb-3 text-center">สถานะสัญญา</th>
                  <th className="pb-3 text-center">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {filteredTenants.length > 0 ? (
                  filteredTenants.map(tenant => (
                    <tr key={tenant.id} className="hover:bg-slate-900/10">
                      <td className="py-4 pl-2 font-bold text-slate-200 text-sm">{tenant.roomNumber}</td>
                      <td className="py-4 font-medium text-slate-300">{tenant.fullName}</td>
                      <td className="py-4 text-slate-400 font-mono">{tenant.phone}</td>
                      <td className="py-4 text-slate-400">
                        {tenant.lineUserId ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-teal-400 font-mono bg-teal-500/10 px-2 py-0.5 rounded-md">
                            <MessageSquare className="w-3 h-3" /> ผูกเชื่อมแล้ว
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono text-[10px]">ยังไม่ได้ผูก</span>
                        )}
                      </td>
                      <td className="py-4 text-center text-slate-400 font-mono">
                        <div className="flex items-center justify-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{tenant.contractStart} ถึง {tenant.contractEnd}</span>
                        </div>
                      </td>
                      <td className="py-4 text-center">
                        <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          tenant.status === "active" ? "bg-teal-500/15 text-teal-400" : "bg-slate-800 text-slate-500"
                        }`}>
                          {tenant.status === "active" ? "มีผลใช้งาน" : "หมดสัญญา"}
                        </span>
                      </td>
                      <td className="py-4 text-center space-x-3">
                        <button 
                          onClick={() => handleEditClick(tenant)}
                          className="text-slate-400 hover:text-blue-400 transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5 inline text-blue-400" />
                        </button>
                        <button
                          onClick={() => handleDelete(tenant.id, tenant.roomNumber, tenant.fullName)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline text-red-500" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      ไม่พบข้อมูลสัญญาผู้เช่า
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal เพิ่ม/แก้ไขผู้เช่า */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl relative shadow-2xl animate-scale-up">
            <h3 className="text-md font-bold text-slate-200 mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-400" /> 
              {editingTenant ? "แก้ไขสัญญาเช่าห้องพัก" : "เพิ่มสัญญาเช่าห้องพักใหม่"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">หมายเลขห้อง</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น 104"
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    required
                    placeholder="08X-XXX-XXXX"
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">ชื่อ-นามสกุล ผู้เช่า</label>
                <input
                  type="text"
                  required
                  placeholder="ชื่อ-นามสกุล จริง"
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">LINE User ID (สำหรับแจ้งเตือนบิล)</label>
                <input
                  type="text"
                  placeholder="Uxxxxxx... (เว้นไว้ก่อนได้)"
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                  value={lineUserId}
                  onChange={(e) => setLineUserId(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">วันเริ่มสัญญาเช่า</label>
                  <input
                    type="date"
                    required
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                    value={contractStart}
                    onChange={(e) => setContractStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">วันสิ้นสุดสัญญาเช่า</label>
                  <input
                    type="date"
                    required
                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-xs transition-colors"
                    value={contractEnd}
                    onChange={(e) => setContractEnd(e.target.value)}
                  />
                </div>
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
                  disabled={formSubmitting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-xl font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {formSubmitting ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : editingTenant ? "อัปเดตสัญญา" : "ทำสัญญาเช่า"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
