"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  Users, 
  UserPlus, 
  Shield, 
  ShieldAlert, 
  Check, 
  X, 
  Trash2, 
  Edit3, 
  Phone, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Database, 
  Copy, 
  AlertCircle, 
  CheckCircle2,
  Calendar,
  Building,
  KeyRound,
  FileCode
} from "lucide-react"
import { 
  getWorkspaceStaffAction, 
  createWorkspaceStaffAction, 
  updateStaffPermissionsAction, 
  deleteStaffAction
} from "@/features/permissions/actions"
import { 
  type StaffPermissions,
  DEFAULT_STAFF_PERMISSIONS
} from "@/features/permissions/types"
import { getCurrentUserProfileClient } from "@/features/auth/client"

interface StaffMember {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  role: "staff"
  workspace_id: string | null
  created_at: string
  permissions: StaffPermissions
}

export default function PermissionsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Modals & Forms State
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [staffToDelete, setStaffIdToDelete] = useState<string | null>(null)

  // Form Inputs: Add Staff
  const [addEmail, setAddEmail] = useState("")
  const [addPassword, setAddPassword] = useState("")
  const [addFullName, setAddFullName] = useState("")
  const [addPhone, setAddPhone] = useState("")
  const [addPermissions, setAddPermissions] = useState<StaffPermissions>({ ...DEFAULT_STAFF_PERMISSIONS })
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [formSubmitting, setFormLoading] = useState(false)

  // Form Inputs: Edit Staff
  const [editFullName, setEditFullName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editPermissions, setEditPermissions] = useState<StaffPermissions>({ ...DEFAULT_STAFF_PERMISSIONS })

  // DB SQL Script Text for manual run
  const [sqlCopied, setSqlCopied] = useState(false)
  const sqlScript = `-- Database Patch: Add staff permissions to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS permissions JSONB 
DEFAULT '{"view_dashboard_stats": false, "manage_rooms_tenants": true, "manage_meters_bills": true, "manage_bills": true, "manage_finance_expenses": false, "access_tax": false, "manage_finance_settings": false, "manage_property_settings": false, "manage_staff_permissions": false, "billing_send_line": true, "billing_download_pdf": true, "billing_copy_summary": true}'::jsonb;

UPDATE public.profiles
SET permissions = '{"view_dashboard_stats": true, "manage_rooms_tenants": true, "manage_meters_bills": true, "manage_bills": true, "manage_finance_expenses": true, "access_tax": true, "manage_finance_settings": true, "manage_property_settings": true, "manage_staff_permissions": true, "billing_send_line": true, "billing_download_pdf": true, "billing_copy_summary": true}'::jsonb
WHERE role IN ('admin', 'super_admin');`;

  // Check demo mode
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  // 1. Authenticate user & load roles
  useEffect(() => {
    async function initPage() {
      try {
        const res = await getCurrentUserProfileClient()
        if (!res.success || !res.data) {
          router.push("/login")
          return
        }

        const profile = res.data
        if (profile.role !== "admin" && profile.role !== "super_admin") {
          // If staff or tenant, redirect them to home/dashboard
          router.push("/dashboard")
          return
        }

        setCurrentUser(profile)
        await loadStaffData()
      } catch (err: any) {
        console.error("Initialization error:", err)
        setError(`ไม่สามารถโหลดสิทธิ์การเข้าใช้งานของคุณได้: ${err?.message || String(err)}`)
        setLoading(false)
      }
    }
    initPage()
  }, [])

  // 2. Load Staff data from database / server actions
  const loadStaffData = async () => {
    setLoading(true)
    setError(null)
    const result = await getWorkspaceStaffAction()
    if (result.success && result.data) {
      setStaffList(result.data as StaffMember[])
    } else {
      setError(result.error || "เกิดข้อผิดพลาดในการดึงรายชื่อ Staff")
    }
    setLoading(false)
  }

  // 3. Add Staff Submit Handler
  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addEmail || !addFullName) {
      setError("กรุณากรอกอีเมลและชื่อ-นามสกุล")
      return
    }

    setFormLoading(true)
    setError(null)
    setSuccess(null)

    const result = await createWorkspaceStaffAction({
      email: addEmail.trim(),
      password: addPassword || undefined,
      fullName: addFullName.trim(),
      phone: addPhone.trim(),
      permissions: addPermissions
    })

    if (result.success) {
      setSuccess("เพิ่ม Staff สำเร็จเรียบร้อยแล้ว!")
      setShowAddModal(false)
      // Reset Form
      setAddEmail("")
      setAddPassword("")
      setAddFullName("")
      setAddPhone("")
      setAddPermissions({ ...DEFAULT_STAFF_PERMISSIONS })
      // Refresh Data
      await loadStaffData()
    } else {
      setError(result.error || "เกิดข้อผิดพลาดในการสร้างบัญชี Staff")
    }
    setFormLoading(false)
  }

  // 4. Edit Staff Prepare Handler
  const handleOpenEditModal = (staff: StaffMember) => {
    setSelectedStaff(staff)
    setEditFullName(staff.full_name || "")
    setEditPhone(staff.phone || "")
    setEditPermissions({ ...staff.permissions })
    setShowEditModal(true)
  }

  // 5. Edit Staff Submit Handler
  const handleEditStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaff) return

    setFormLoading(true)
    setError(null)
    setSuccess(null)

    const result = await updateStaffPermissionsAction(selectedStaff.id, {
      fullName: editFullName.trim(),
      phone: editPhone.trim(),
      permissions: editPermissions
    })

    if (result.success) {
      setSuccess(`บันทึกการแก้ไขสิทธิ์ของคุณ ${editFullName} เรียบร้อยแล้ว!`)
      setShowEditModal(false)
      setSelectedStaff(null)
      await loadStaffData()
    } else {
      setError(result.error || "เกิดข้อผิดพลาดในการอัปเดตข้อมูล Staff")
    }
    setFormLoading(false)
  }

  // 6. Delete Staff Handler
  const handleDeleteClick = (staffId: string) => {
    setStaffIdToDelete(staffId)
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async () => {
    if (!staffToDelete) return
    setFormLoading(true)
    setError(null)
    setSuccess(null)

    const result = await deleteStaffAction(staffToDelete)
    if (result.success) {
      setSuccess("ลบบัญชี Staff ออกจากระบบเรียบร้อยแล้ว")
      setShowDeleteConfirm(false)
      setStaffIdToDelete(null)
      await loadStaffData()
    } else {
      setError(result.error || "เกิดข้อผิดพลาดในการลบ Staff")
      setShowDeleteConfirm(false)
    }
    setFormLoading(false)
  }

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(sqlScript)
    setSqlCopied(true)
    setTimeout(() => setSqlCopied(false), 3000)
  }

  const handlePermissionToggle = (type: "add" | "edit", field: keyof StaffPermissions) => {
    if (type === "add") {
      setAddPermissions(prev => ({ ...prev, [field]: !prev[field] }))
    } else {
      setEditPermissions(prev => ({ ...prev, [field]: !prev[field] }))
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 p-5 rounded-3xl border border-blue-500/20 shadow-sm backdrop-blur-md">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <span>ระบบจัดการสิทธิ์การใช้งาน (Staff Permissions)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            กำหนดบทบาทและสิทธิ์ของ Staff ประจำหอพักได้อย่างละเอียด เพื่อควบคุมสิทธิ์ในการเข้าถึงหน้าข้อมูลห้องพัก บิลค่าเช่า การเงิน และส่วนข้อมูลภาษี
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="h-11 px-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-500/10 active:scale-[0.98] shrink-0 self-stretch sm:self-auto justify-center"
        >
          <UserPlus className="w-4.5 h-4.5" />
          <span>เพิ่ม Staff ใหม่</span>
        </button>
      </div>

      {/* 2. Alert & Result Boxes */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* 3. Stats Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-3xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 dark:text-blue-400 flex items-center justify-center border border-blue-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Staff ทั้งหมด</span>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-0.5">{staffList.length} คน</h3>
          </div>
        </div>

        <div className="p-5 rounded-3xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">สิทธิ์การทำงานละเอียด</span>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-0.5">7 ด้านแยกอิสระ</h3>
          </div>
        </div>

        <div className="p-5 rounded-3xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">บทบาทปัจจุบันของคุณ</span>
            <h3 className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
              {currentUser?.role === "super_admin" ? "SUPER ADMIN" : "WORKSPACE ADMIN"}
            </h3>
          </div>
        </div>
      </div>

      {/* 4. Active Staff Members Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl p-5 shadow-sm">
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <span>รายชื่อ Staff ประจำ Workspace ของคุณ</span>
          {loading && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
        </h3>

        {loading ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <span>กำลังโหลดรายชื่อทีมงาน...</span>
          </div>
        ) : staffList.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {staffList.map((staff) => (
              <div 
                key={staff.id} 
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/20 hover:border-slate-300 dark:hover:border-slate-800 transition-all flex flex-col justify-between gap-4"
              >
                {/* Staff Basic Info */}
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-200">
                      {staff.full_name || <span className="text-slate-450 italic">ไม่มีข้อมูลชื่อ</span>}
                    </h4>
                    <div className="flex flex-col gap-1.5 mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {staff.email}
                      </span>
                      {staff.phone && (
                        <span className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          {staff.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-teal-600 bg-teal-500/10 dark:text-teal-400 dark:bg-teal-500/5 border border-teal-500/20 px-2.5 py-0.5 rounded-full uppercase shrink-0">
                    STAFF
                  </span>
                </div>

                {/* Staff Permissions Visual List */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-850 space-y-2">
                  <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase block mb-1">
                    สิทธิ์ที่ได้รับมอบหมาย:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const items = [
                        { key: "view_dashboard_stats", label: "ดูสถิติภาพรวม" },
                        { key: "manage_rooms_tenants", label: "จัดการห้องพัก & ผู้เช่า" },
                        { key: "manage_meters_bills", label: "จดมิเตอร์ & สรุปบิล" },
                        { key: "manage_bills", label: "จัดการบิล" },
                        { key: "manage_finance_expenses", label: "จัดการการเงิน & รายจ่าย" },
                        { key: "access_tax", label: "จัดการข้อมูลภาษี" },
                        { key: "manage_finance_settings", label: "ตั้งค่าระบบบัญชี/การเงิน" },
                        { key: "manage_property_settings", label: "ตั้งค่าหอพัก" },
                        { key: "manage_staff_permissions", label: "จัดการสิทธิ์พนักงาน" },
                        { key: "billing_send_line", label: "ส่ง Line OA" },
                        { key: "billing_download_pdf", label: "ดาวน์โหลด PDF" },
                        { key: "billing_copy_summary", label: "คัดลอกสรุปบิล" }
                      ] as const;

                      const sortedItems = [...items].sort((a, b) => {
                        const hasA = !!staff.permissions[a.key];
                        const hasB = !!staff.permissions[b.key];
                        if (hasA && !hasB) return -1;
                        if (!hasA && hasB) return 1;
                        return 0;
                      });

                      return sortedItems.map(item => {
                        const hasPermission = !!staff.permissions[item.key];
                        return (
                          <span
                            key={item.key}
                            className={`text-[10px] px-2.5 py-1 rounded-lg font-bold border transition-colors flex items-center gap-1 ${
                              hasPermission
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                                : "bg-slate-100 text-slate-400 dark:bg-slate-950 border-slate-200 dark:border-slate-900"
                            }`}
                          >
                            <Check className={`w-3 h-3 ${hasPermission ? "opacity-100" : "opacity-20"}`} />
                            <span>{item.label}</span>
                          </span>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Staff Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-850">
                  <button
                    onClick={() => handleOpenEditModal(staff)}
                    className="h-8 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-250 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-[10px] flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                    <span>แก้ไขสิทธิ์</span>
                  </button>
                  <button
                    onClick={() => handleDeleteClick(staff.id)}
                    className="h-8 px-3 rounded-xl bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 text-rose-600 dark:text-rose-400 font-extrabold text-[10px] flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ลบ Staff</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center border-2 border-dashed border-slate-250 dark:border-slate-800/80 rounded-2xl max-w-xl mx-auto">
            <Users className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">ยังไม่มีรายชื่อ Staff ใน Workspace นี้</h4>
            <p className="text-[11px] text-slate-450 dark:text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
              คุณสามารถสร้างและจัดการบัญชีให้กับผู้ช่วยหรือผู้จดมิเตอร์ประจำหอพักของคุณได้ง่าย ๆ โดยคลิกปุ่ม **"เพิ่ม Staff ใหม่"** ด้านบนได้ทันทีครับ
            </p>
          </div>
        )}
      </div>

      {/* 5. SQL Patch Information Card */}
      {!isDemo && (
        <div className="bg-gradient-to-r from-amber-500/5 to-yellow-500/5 border border-amber-500/20 rounded-3xl p-5 space-y-4">
          <div className="flex gap-3">
            <Database className="w-6 h-6 text-amber-500 shrink-0" />
            <div>
              <h4 className="text-sm font-black text-slate-800 dark:text-slate-200">คู่มือการติดตั้งคอลัมน์สิทธิ์ในฐานข้อมูลจริง (Supabase SQL Setup)</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                เนื่องจากระบบเพิ่งติดตั้งฟังก์ชันกำหนดสิทธิ์อย่างละเอียดแบบ JSONB หากใช้งานในฐานข้อมูล Supabase แอดมินต้องทำการรันคำสั่ง SQL ด้านล่างนี้ในหน้า **SQL Editor** ของเครื่องตนเองเพื่อเพิ่มคอลัมน์ `permissions` เสียก่อนครับ
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-950 text-slate-300 font-mono text-[10px] rounded-xl relative border border-slate-800 overflow-x-auto select-all max-h-[150px]">
            <pre>{sqlScript}</pre>
            <button
              onClick={copySqlToClipboard}
              className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer transition-colors"
            >
              {sqlCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          {sqlCopied && (
            <span className="text-[10px] font-bold text-emerald-500 block">คัดลอกสคริปต์ SQL ลงคลิปบอร์ดแล้ว! นำไปรันในช่อง SQL Editor ของ Supabase Dashboard ได้ทันที</span>
          )}
        </div>
      )}

      {/* 6. Modal: Add Staff */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <form 
            onSubmit={handleAddStaffSubmit}
            className="w-full max-w-lg p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl relative shadow-2xl space-y-4 flex flex-col max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-500" />
                <span>เพิ่มบัญชี Staff ใหม่</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                สร้างบัญชีผู้ใช้งานระบบและกำหนดสิทธิ์เข้าทำงานส่วนต่าง ๆ
              </p>
            </div>

            {/* Inputs */}
            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">อีเมลสำหรับใช้เข้าสู่ระบบ (Email)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="staff@example.com"
                    className="w-full pl-9 pr-4 py-2 border rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border-slate-250 dark:border-slate-850 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-mono"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">รหัสผ่านเริ่มต้น (Default Password)</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showAddPassword ? "text" : "password"}
                    placeholder="ไม่ระบุ: ใช้รหัสผ่านดีฟอลต์ 123456"
                    className="w-full pl-9 pr-10 py-2 border rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border-slate-250 dark:border-slate-850 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-mono"
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddPassword(!showAddPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">ชื่อ - นามสกุลจริง (Full Name)</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น สมชาย แสนดี"
                  className="w-full px-4 py-2 border rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border-slate-250 dark:border-slate-850 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-bold"
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">เบอร์โทรศัพท์ (Phone Number)</label>
                <input
                  type="text"
                  placeholder="เช่น 0812345678"
                  className="w-full px-4 py-2 border rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border-slate-250 dark:border-slate-850 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-mono"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Permissions Toggles */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-850 space-y-3">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">กำหนดสิทธิ์ทีมงาน:</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* view_dashboard_stats */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "view_dashboard_stats")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.view_dashboard_stats
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>ดูแดชบอร์ดสถิติภาพรวม</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">ดูสถิติรายรับ-รายจ่าย ข้อมูลสรุปในหน้าแรก</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.view_dashboard_stats ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_rooms_tenants */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "manage_rooms_tenants")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.manage_rooms_tenants
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จัดการห้องพัก & ผู้เช่า</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">เพิ่ม/แก้ไขห้องพัก บันทึกสัญญาเช่า</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.manage_rooms_tenants ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_meters_bills */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "manage_meters_bills")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.manage_meters_bills
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จดเลขมิเตอร์ & สรุปบิลค่าเช่า</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">จดค่าน้ำ/ค่าไฟ และสรุปยอดบิล</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.manage_meters_bills ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_bills */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "manage_bills")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.manage_bills
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จัดการบิล</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">เข้าดูและจัดการบิลค่าเช่าทั้งหมด</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.manage_bills ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_finance_expenses */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "manage_finance_expenses")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.manage_finance_expenses
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จัดการการเงิน & รายจ่าย</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">บันทึกบิลรายจ่ายรายวัน ตรวจสอบสลิปโอน</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.manage_finance_expenses ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* access_tax */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "access_tax")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.access_tax
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จัดการข้อมูลภาษีหอพัก</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">ดูและพิมพ์รายงานภาษีหอพัก ภ.ง.ด. 90/94</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.access_tax ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_finance_settings */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "manage_finance_settings")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.manage_finance_settings
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>ตั้งค่าระบบบัญชีและการเงิน</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">กำหนดบัญชีธนาคาร และตั้งค่าวิธีรับเงินสำหรับการออกบิล</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.manage_finance_settings ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_property_settings */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "manage_property_settings")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.manage_property_settings
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>ตั้งค่าข้อมูลหอพัก</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">กำหนดอัตราส่วนกลาง ค่าปรับจ่ายล่าช้า อัตราค่าน้ำค่าไฟ และเงินประกัน</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.manage_property_settings ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_staff_permissions */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "manage_staff_permissions")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.manage_staff_permissions
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จัดการสิทธิ์พนักงาน (Staff)</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">เพิ่ม/ลบพนักงาน และกำหนดสิทธิ์การใช้งานระบบ</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.manage_staff_permissions ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* billing_send_line */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "billing_send_line")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.billing_send_line
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>ส่ง Line OA</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">ส่งใบแจ้งหนี้ผ่านทาง Line OA ประจำห้องพัก</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.billing_send_line ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* billing_download_pdf */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "billing_download_pdf")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.billing_download_pdf
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>ดาวน์โหลด PDF</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">ดาวน์โหลดเอกสารบิล/ใบเสร็จเป็น PDF</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.billing_download_pdf ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* billing_copy_summary */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("add", "billing_copy_summary")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    addPermissions.billing_copy_summary
                      ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>คัดลอกสรุปบิล</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">คัดลอกข้อความสรุปค่าเช่าส่งผู้เช่า</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${addPermissions.billing_copy_summary ? "opacity-100" : "opacity-0"}`} />
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-850">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-800 transition-all font-bold text-xs cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={formSubmitting}
                className="h-10 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-[0.98] disabled:opacity-30"
              >
                {formSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังสร้าง...</span>
                  </>
                ) : (
                  <span>สร้างบัญชี Staff</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 7. Modal: Edit Staff */}
      {showEditModal && selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <form 
            onSubmit={handleEditStaffSubmit}
            className="w-full max-w-lg p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl relative shadow-2xl space-y-4 flex flex-col max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-500" />
                <span>ปรับเปลี่ยนแก้ไขสิทธิ์ Staff</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                คุณกำลังแก้ไขข้อมูลของทีมงาน: **{selectedStaff.email}**
              </p>
            </div>

            {/* Inputs */}
            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">ชื่อ - นามสกุลจริง (Full Name)</label>
                <input
                  type="text"
                  required
                  placeholder="สมชาย แสนดี"
                  className="w-full px-4 py-2 border rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border-slate-250 dark:border-slate-850 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-bold"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">เบอร์โทรศัพท์ (Phone Number)</label>
                <input
                  type="text"
                  placeholder="0812345678"
                  className="w-full px-4 py-2 border rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border-slate-250 dark:border-slate-850 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-mono"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Permissions Toggles */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-850 space-y-3">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">ปรับสิทธิ์การเข้าทำรายการ:</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* view_dashboard_stats */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "view_dashboard_stats")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.view_dashboard_stats
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>ดูแดชบอร์ดสถิติภาพรวม</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">ดูสถิติรายรับ-รายจ่าย ข้อมูลสรุปในหน้าแรก</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.view_dashboard_stats ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_rooms_tenants */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "manage_rooms_tenants")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.manage_rooms_tenants
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จัดการห้องพัก & ผู้เช่า</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">เพิ่ม/แก้ไขห้องพัก บันทึกสัญญาเช่า</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.manage_rooms_tenants ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_meters_bills */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "manage_meters_bills")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.manage_meters_bills
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จดเลขมิเตอร์ & สรุปบิลค่าเช่า</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">จดค่าน้ำ/ค่าไฟ และดูสรุปยอดบิล</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.manage_meters_bills ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_bills */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "manage_bills")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.manage_bills
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จัดการบิล</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">เข้าดูและจัดการบิลค่าเช่าทั้งหมด</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.manage_bills ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_finance_expenses */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "manage_finance_expenses")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.manage_finance_expenses
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จัดการการเงิน & รายจ่าย</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">บันทึกบิลรายจ่ายรายวัน ตรวจสอบสลิปโอน</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.manage_finance_expenses ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* access_tax */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "access_tax")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.access_tax
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จัดการข้อมูลภาษีหอพัก</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">ดูและพิมพ์รายงานภาษีหอพัก ภ.ง.ด. 90/94</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.access_tax ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_finance_settings */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "manage_finance_settings")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.manage_finance_settings
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>ตั้งค่าระบบบัญชีและการเงิน</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">กำหนดบัญชีธนาคาร และตั้งค่าวิธีรับเงินสำหรับการออกบิล</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.manage_finance_settings ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_property_settings */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "manage_property_settings")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.manage_property_settings
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>ตั้งค่าข้อมูลหอพัก</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">กำหนดอัตราส่วนกลาง ค่าปรับจ่ายล่าช้า อัตราค่าน้ำค่าไฟ และเงินประกัน</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.manage_property_settings ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* manage_staff_permissions */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "manage_staff_permissions")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.manage_staff_permissions
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>จัดการสิทธิ์พนักงาน (Staff)</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">เพิ่ม/ลบพนักงาน และกำหนดสิทธิ์การใช้งานระบบ</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.manage_staff_permissions ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* billing_send_line */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "billing_send_line")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.billing_send_line
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>ส่ง Line OA</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">ส่งใบแจ้งหนี้ผ่านทาง Line OA ประจำห้องพัก</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.billing_send_line ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* billing_download_pdf */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "billing_download_pdf")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.billing_download_pdf
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>ดาวน์โหลด PDF</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">ดาวน์โหลดเอกสารบิล/ใบเสร็จเป็น PDF</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.billing_download_pdf ? "opacity-100" : "opacity-0"}`} />
                </button>

                {/* billing_copy_summary */}
                <button
                  type="button"
                  onClick={() => handlePermissionToggle("edit", "billing_copy_summary")}
                  className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    editPermissions.billing_copy_summary
                      ? "bg-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-950 dark:border-slate-850"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>คัดลอกสรุปบิล</span>
                    <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">คัดลอกข้อความสรุปค่าเช่าส่งผู้เช่า</span>
                  </div>
                  <Check className={`w-4 h-4 shrink-0 transition-opacity ${editPermissions.billing_copy_summary ? "opacity-100" : "opacity-0"}`} />
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-850">
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false)
                  setSelectedStaff(null)
                }}
                className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-800 transition-all font-bold text-xs cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={formSubmitting}
                className="h-10 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-extrabold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-[0.98] disabled:opacity-30"
              >
                {formSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <span>บันทึกการแก้ไข</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 8. Modal: Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl relative shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center border border-rose-500/20">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">ยืนยันลบบัญชีผู้ใช้ Staff?</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                การลบบัญชี Staff จะส่งผลให้ทีมงานคนดังกล่าวไม่สามารถล็อกอินเข้าสู่ระบบหอพัก HorSet ได้อีกต่อไป และไม่สามารถกู้ข้อมูลการทำงานคืนได้
              </p>
            </div>

            <div className="flex gap-2 font-bold text-xs pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setStaffIdToDelete(null)
                }}
                className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={formSubmitting}
                className="flex-1 h-10 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-rose-600/10"
              >
                {formSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "ยืนยันลบStaff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
