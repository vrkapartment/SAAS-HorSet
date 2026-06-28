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
  Building,
  LayoutDashboard,
  Home,
  Scroll,
  Receipt,
  Coins,
  FileText,
  Landmark,
  Send,
  Download,
  Settings
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

export default function PermissionsTab() {
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
WHERE role IN ('admin', 'super_admin');`

  // Check demo mode
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  // 1. Authenticate user & load roles
  useEffect(() => {
    async function initPage() {
      try {
        const res = await getCurrentUserProfileClient()
        if (!res.success || !res.data) {
          setError("กรุณาเข้าสู่ระบบก่อนใช้งานหน้านี้")
          setLoading(false)
          return
        }

        const profile = res.data
        if (profile.role !== "admin" && profile.role !== "super_admin") {
          setError("เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถจัดการสิทธิ์ได้")
          setLoading(false)
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

  const handlePermissionChange = (type: "add" | "edit", field: keyof StaffPermissions, value?: boolean) => {
    const setPerms = type === "add" ? setAddPermissions : setEditPermissions
    setPerms(prev => {
      const targetValue = value !== undefined ? value : !prev[field]
      const next = { ...prev, [field]: targetValue }
      
      // If view permission is turned off, also turn off edit permission
      if (field === "manage_rooms_tenants" && !targetValue) next.manage_rooms_tenants_edit = false
      if (field === "manage_meters_bills" && !targetValue) next.manage_meters_bills_edit = false
      if (field === "manage_bills" && !targetValue) next.manage_bills_edit = false
      if (field === "manage_finance_expenses" && !targetValue) next.manage_finance_expenses_edit = false
      if (field === "access_tax" && !targetValue) next.access_tax_edit = false
      if (field === "manage_finance_settings" && !targetValue) next.manage_finance_settings_edit = false
      if (field === "manage_property_settings" && !targetValue) next.manage_property_settings_edit = false
      if (field === "manage_staff_permissions" && !targetValue) next.manage_staff_permissions_edit = false
      
      // If edit permission is turned on, make sure view permission is also turned on
      if (field === "manage_rooms_tenants_edit" && targetValue) next.manage_rooms_tenants = true
      if (field === "manage_meters_bills_edit" && targetValue) next.manage_meters_bills = true
      if (field === "manage_bills_edit" && targetValue) next.manage_bills = true
      if (field === "manage_finance_expenses_edit" && targetValue) next.manage_finance_expenses = true
      if (field === "access_tax_edit" && targetValue) next.access_tax = true
      if (field === "manage_finance_settings_edit" && targetValue) next.manage_finance_settings = true
      if (field === "manage_property_settings_edit" && targetValue) next.manage_property_settings = true
      if (field === "manage_staff_permissions_edit" && targetValue) next.manage_staff_permissions = true

      return next
    })
  }

  const renderPermissionsSettings = (type: "add" | "edit") => {
    const permissions = type === "add" ? addPermissions : editPermissions

    // List of modules that support separate View vs Edit permissions
    const modules = [
      {
        key: "manage_rooms_tenants",
        editKey: "manage_rooms_tenants_edit",
        name: "จัดการห้องพัก และข้อมูลผู้เช่า",
        description: "เข้าดูรายชื่อห้องพัก รายละเอียด และประวัติข้อมูลผู้เช่าทั้งหมด",
        editDescription: "เพิ่ม แก้ไขข้อมูลห้อง ทำสัญญาเช่า หรือทำรายการย้ายออก",
        icon: Home,
      },
      {
        key: "manage_meters_bills",
        editKey: "manage_meters_bills_edit",
        name: "จดเลขมิเตอร์ & สรุปบิลค่าเช่า",
        description: "เข้าดูมิเตอร์น้ำ/ไฟ และดูรายงานคำนวณสรุปค่าใช้จ่ายประจำเดือน",
        editDescription: "กรอกเลขอัตรามิเตอร์ และสร้างสรุปบิลเก็บเงินผู้เช่า",
        icon: Scroll,
      },
      {
        key: "manage_bills",
        editKey: "manage_bills_edit",
        name: "จัดการใบแจ้งหนี้",
        description: "เข้าดูใบแจ้งหนี้ค่าเช่า ตรวจสอบสถานะการจ่ายเงินของผู้เช่า",
        editDescription: "ยืนยันยอดโอน แก้ไข หรือยกเลิกใบแจ้งหนี้ค่าเช่า",
        icon: Receipt,
      },
      {
        key: "manage_finance_expenses",
        editKey: "manage_finance_expenses_edit",
        name: "จัดการบิล รายจ่ายรายวัน",
        description: "เข้าดูประวัติบันทึกค่าใช้จ่าย และบิลเงินออกประจำหอพัก",
        editDescription: "บันทึกเพิ่มรายการรายจ่ายรายวัน หรือแก้ไขบิลรายจ่าย",
        icon: Coins,
      },
      {
        key: "access_tax",
        editKey: "access_tax_edit",
        name: "จัดการภาษี ภ.ง.ด.",
        description: "เข้าดูรายงานสรุปรายได้สะสมเพื่อวัตถุประสงค์ในการคำนวณภาษี",
        editDescription: "เพิ่ม/แก้ไข และบันทึกข้อมูลยื่นแบบรายการภาษีเงินได้",
        icon: FileText,
      },
      {
        key: "manage_finance_settings",
        editKey: "manage_finance_settings_edit",
        name: "ตั้งค่าระบบการเงิน",
        description: "เข้าดูการตั้งค่าบัญชีธนาคาร และวิธีการชำระเงินของหอพัก",
        editDescription: "แก้ไข เพิ่ม หรือลบการตั้งค่าบัญชีรับโอนเงิน/พร้อมเพย์",
        icon: Landmark,
      },
      {
        key: "manage_property_settings",
        editKey: "manage_property_settings_edit",
        name: "ตั้งค่าข้อมูลหอพัก",
        description: "เข้าดูอัตราราคาน้ำ/ไฟ ค่าบริการรายเดือน และข้อมูลหอพัก",
        editDescription: "ปรับเปลี่ยนเรตราคาน้ำไฟ แก้ไขค่าบริการ และรายละเอียดตึก",
        icon: Building,
      },
      {
        key: "manage_staff_permissions",
        editKey: "manage_staff_permissions_edit",
        name: "จัดการสิทธิ์พนักงาน (Staff)",
        description: "เข้าดูรายชื่อพนักงาน ข้อมูลติดต่อ และระดับสิทธิ์ของพนักงาน",
        editDescription: "เพิ่มลบพนักงาน หรือปรับสิทธิ์การทำงานของทีมงานในหอพัก",
        icon: Shield,
      },
    ] as const

    return (
      <div className="space-y-5">
        {/* Section 1: Main Pages/Modules with View/Edit toggles */}
        <div className="bg-slate-50 dark:bg-slate-950/40 p-5 rounded-3xl border border-slate-150 dark:border-slate-850 space-y-4">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-850">
            <span className="text-xs sm:text-sm font-black text-slate-500 dark:text-slate-400 uppercase flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-500" />
              <span>สิทธิ์การเข้าใช้งานรายหน้าต่าง ๆ</span>
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">
              * ต้องให้สิทธิ์ "เข้าดูหน้า" ก่อน จึงจะปรับสิทธิ์แก้ไขได้
            </span>
          </div>

          <div className="space-y-4">
            {/* Dashboard Stats Row (View Only) */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-sm">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20 shrink-0 mt-0.5">
                  <LayoutDashboard className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-200">ดูแดชบอร์ดสถิติภาพรวม</h4>
                  <p className="text-xs sm:text-sm text-slate-440 dark:text-slate-500 mt-1 leading-relaxed">
                    เข้าดูหน้าแดชบอร์ด รายได้ค้างจ่าย และสถิติสถานะผู้เช่า (จำกัดดูอย่างเดียวเท่านั้น)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4.5 self-end sm:self-auto shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-slate-500">เปิดเข้าดู</span>
                  <button
                    type="button"
                    onClick={() => handlePermissionChange(type, "view_dashboard_stats")}
                    className={`w-14 h-7 rounded-full p-1 transition-colors cursor-pointer focus:outline-none ${
                      permissions.view_dashboard_stats ? "bg-emerald-500" : "bg-slate-250 dark:bg-slate-800"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                      permissions.view_dashboard_stats ? "translate-x-7" : "translate-x-0"
                    }`} />
                  </button>
                </div>
                <div className="w-28 text-center">
                  <span className="text-xs px-3 py-1 rounded-md font-bold bg-slate-100 dark:bg-slate-950 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-900">
                    ดูได้อย่างเดียว
                  </span>
                </div>
              </div>
            </div>

            {/* Modular Pages */}
            {modules.map((m) => {
              const hasView = !!permissions[m.key]
              const hasEdit = !!permissions[m.editKey]

              return (
                <div 
                  key={m.key} 
                  className={`p-4 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-sm ${
                    hasView 
                      ? "bg-white dark:bg-slate-900 border-blue-500/20 shadow-sm shadow-blue-500/[0.02]" 
                      : "bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-850/80 opacity-75"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 mt-0.5 transition-colors ${
                      hasView 
                        ? "bg-blue-500/10 text-blue-500 border-blue-500/20" 
                        : "bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-950 dark:border-slate-900"
                    }`}>
                      <m.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-200 flex flex-wrap items-center gap-2">
                        <span>{m.name}</span>
                        {hasView && (
                          <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded font-extrabold uppercase ${
                            hasEdit 
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          }`}>
                            {hasEdit ? "แก้ไขได้" : "ดูอย่างเดียว"}
                          </span>
                        )}
                      </h4>
                      <p className="text-xs sm:text-sm text-slate-450 dark:text-slate-500 mt-1 leading-relaxed">
                        {hasEdit ? m.editDescription : m.description}
                      </p>
                    </div>
                  </div>

                  {/* Dual Action Toggles */}
                  <div className="flex items-center gap-5 self-end sm:self-auto shrink-0">
                    {/* View Toggle */}
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-slate-500">เข้าหน้าเว็บ</span>
                      <button
                        type="button"
                        onClick={() => handlePermissionChange(type, m.key)}
                        className={`w-14 h-7 rounded-full p-1 transition-colors cursor-pointer focus:outline-none ${
                          hasView ? "bg-blue-600" : "bg-slate-250 dark:bg-slate-800"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                          hasView ? "translate-x-7" : "translate-x-0"
                        }`} />
                      </button>
                    </div>

                    {/* Edit Selector (View Only vs Edit/Write) */}
                    <div className="flex items-center gap-2.5 w-32 font-bold">
                      <span className={`text-xs sm:text-sm ${
                        hasView ? "text-slate-400 dark:text-slate-500" : "text-slate-300 dark:text-slate-700"
                      }`}>
                        การทำงาน
                      </span>
                      <button
                        type="button"
                        disabled={!hasView}
                        onClick={() => handlePermissionChange(type, m.editKey)}
                        className={`px-3 py-1 text-[10px] sm:text-xs font-extrabold rounded-lg border transition-all cursor-pointer ${
                          !hasView 
                            ? "bg-slate-50 text-slate-300 dark:bg-slate-950 dark:text-slate-750 border-slate-150 dark:border-slate-900 cursor-not-allowed"
                            : hasEdit
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 hover:bg-emerald-500/15 dark:text-emerald-400"
                              : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-850 hover:bg-slate-200"
                        }`}
                      >
                        {!hasView ? "ไม่มีสิทธิ์เข้าถึง" : hasEdit ? "เขียน/แก้ไขได้" : "ดูได้อย่างเดียว"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Section 2: Special Actions (Send Line, PDF download, Copy summary) */}
        <div className="bg-slate-50 dark:bg-slate-950/40 p-5 rounded-3xl border border-slate-150 dark:border-slate-850 space-y-4">
          <span className="text-xs sm:text-sm font-black text-slate-500 dark:text-slate-400 uppercase flex items-center gap-2 border-b border-slate-200 dark:border-slate-850 pb-2.5">
            <ShieldAlert className="w-5 h-5 text-indigo-500" />
            <span>สิทธิ์การทำรายการพิเศษ</span>
          </span>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* billing_send_line */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-500 flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 truncate">ส่งบิล Line OA</h5>
                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">ส่งบิลให้ผู้เช่าทางแชทไลน์</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handlePermissionChange(type, "billing_send_line")}
                className={`w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none shrink-0 ${
                  permissions.billing_send_line ? "bg-teal-500" : "bg-slate-250 dark:bg-slate-800"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                  permissions.billing_send_line ? "translate-x-6" : "translate-x-0"
                }`} />
              </button>
            </div>

            {/* billing_download_pdf */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 truncate">ดาวน์โหลด PDF</h5>
                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">เซฟไฟล์ใบแจ้งหนี้เป็น PDF</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handlePermissionChange(type, "billing_download_pdf")}
                className={`w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none shrink-0 ${
                  permissions.billing_download_pdf ? "bg-indigo-500" : "bg-slate-250 dark:bg-slate-800"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                  permissions.billing_download_pdf ? "translate-x-6" : "translate-x-0"
                }`} />
              </button>
            </div>

            {/* billing_copy_summary */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                  <Copy className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 truncate">คัดลอกข้อความสรุป</h5>
                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">ก๊อปปี้สรุปบิลไปส่งในแชทอื่น</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handlePermissionChange(type, "billing_copy_summary")}
                className={`w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer focus:outline-none shrink-0 ${
                  permissions.billing_copy_summary ? "bg-amber-500" : "bg-slate-250 dark:bg-slate-800"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                  permissions.billing_copy_summary ? "translate-x-6" : "translate-x-0"
                }`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-500 text-xs">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
        <span>กำลังเตรียมข้อมูลการจัดการสิทธิ์พนักงาน...</span>
      </div>
    )
  }

  if (error && !currentUser) {
    return (
      <div className="p-6 text-center max-w-xl mx-auto space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20 mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">ไม่สามารถเข้าใช้งานสิทธิ์ได้</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 p-6 rounded-3xl border border-blue-500/20 shadow-sm backdrop-blur-md">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
            <Shield className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <span>ระบบจัดการสิทธิ์การใช้งาน (Staff Permissions)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            กำหนดบทบาทและสิทธิ์ของ Staff ประจำหอพักได้อย่างละเอียด เพื่อควบคุมสิทธิ์ในการเข้าถึงหน้าข้อมูลห้องพัก บิลค่าเช่า การเงิน และส่วนข้อมูลภาษี
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="h-12 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-500/10 active:scale-[0.98] shrink-0 self-stretch sm:self-auto justify-center"
        >
          <UserPlus className="w-5 h-5" />
          <span>เพิ่ม Staff ใหม่</span>
        </button>
      </div>

      {/* 2. Alert & Result Boxes */}
      {error && (
        <div className="p-4.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs sm:text-sm font-bold flex items-center gap-2.5">
          <AlertCircle className="w-5.5 h-5.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs sm:text-sm font-bold flex items-center gap-2.5">
          <CheckCircle2 className="w-5.5 h-5.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* 3. Stats Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex items-center gap-4">
          <div className="w-14 h-12.5 rounded-2xl bg-blue-500/10 text-blue-500 dark:text-blue-400 flex items-center justify-center border border-blue-500/20">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-slate-500 uppercase">Staff ทั้งหมด</span>
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{staffList.length} คน</h3>
          </div>
        </div>

        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex items-center gap-4">
          <div className="w-14 h-12.5 rounded-2xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-slate-500 uppercase">สิทธิ์การทำงานละเอียด</span>
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">7 ด้านแยกอิสระ</h3>
          </div>
        </div>

        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex items-center gap-4">
          <div className="w-14 h-12.5 rounded-2xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-slate-500 uppercase">บทบาทปัจจุบันของคุณ</span>
            <h3 className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {currentUser?.role === "super_admin" ? "SUPER ADMIN" : "WORKSPACE ADMIN"}
            </h3>
          </div>
        </div>
      </div>

      {/* 4. Active Staff Members Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl p-6 shadow-sm">
        <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2.5">
          <span>รายชื่อ Staff ประจำ Workspace ของคุณ</span>
          {loading && <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />}
        </h3>

        {staffList.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {staffList.map((staff) => (
              <div 
                key={staff.id} 
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/20 hover:border-slate-300 dark:hover:border-slate-800 transition-all flex flex-col justify-between gap-4"
              >
                {/* Staff Basic Info */}
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <h4 className="text-base font-black text-slate-800 dark:text-slate-200">
                      {staff.full_name || <span className="text-slate-450 italic">ไม่มีข้อมูลชื่อ</span>}
                    </h4>
                    <div className="flex flex-col gap-2 mt-2.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-mono font-bold">
                      <span className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400" />
                        {staff.email}
                      </span>
                      {staff.phone && (
                        <span className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-slate-400" />
                          {staff.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-teal-600 bg-teal-500/10 dark:text-teal-400 dark:bg-teal-500/5 border border-teal-500/20 px-3 py-1 rounded-full uppercase shrink-0">
                    STAFF
                  </span>
                </div>

                {/* Staff Permissions Visual List */}
                <div className="pt-3.5 border-t border-slate-200 dark:border-slate-850 space-y-2">
                  <span className="text-[11px] sm:text-xs font-black text-slate-400 dark:text-slate-500 uppercase block mb-1">
                    สิทธิ์ที่ได้รับมอบหมาย:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const items = [
                        { key: "view_dashboard_stats", editKey: null, label: "ดูสถิติภาพรวม" },
                        { key: "manage_rooms_tenants", editKey: "manage_rooms_tenants_edit", label: "จัดการห้องพัก & ผู้เช่า" },
                        { key: "manage_meters_bills", editKey: "manage_meters_bills_edit", label: "จดมิเตอร์ & สรุปบิล" },
                        { key: "manage_bills", editKey: "manage_bills_edit", label: "จัดการใบแจ้งหนี้" },
                        { key: "manage_finance_expenses", editKey: "manage_finance_expenses_edit", label: "จัดการรายจ่าย" },
                        { key: "access_tax", editKey: "access_tax_edit", label: "จัดการภาษี ภ.ง.ด." },
                        { key: "manage_finance_settings", editKey: "manage_finance_settings_edit", label: "ตั้งค่าบัญชี/การเงิน" },
                        { key: "manage_property_settings", editKey: "manage_property_settings_edit", label: "ตั้งค่าหอพัก" },
                        { key: "manage_staff_permissions", editKey: "manage_staff_permissions_edit", label: "จัดการสิทธิ์พนักงาน" },
                        { key: "billing_send_line", editKey: null, label: "ส่ง Line OA" },
                        { key: "billing_download_pdf", editKey: null, label: "ดาวน์โหลด PDF" },
                        { key: "billing_copy_summary", editKey: null, label: "คัดลอกสรุปบิล" }
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
                        const hasEdit = item.editKey ? !!staff.permissions[item.editKey] : false;
                        
                        let displayLabel = item.label;
                        if (hasPermission && item.editKey) {
                          displayLabel += hasEdit ? " (แก้ไขได้)" : " (ดูอย่างเดียว)";
                        }

                        return (
                          <span
                            key={item.key}
                            className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition-colors flex items-center gap-1.5 ${
                              hasPermission
                                ? hasEdit
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                                  : "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400"
                                : "bg-slate-100 text-slate-400 dark:bg-slate-950 border-slate-200 dark:border-slate-900"
                            }`}
                          >
                            <Check className={`w-3.5 h-3.5 ${hasPermission ? "opacity-100" : "opacity-20"}`} />
                            <span>{displayLabel}</span>
                          </span>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Staff Actions */}
                <div className="flex justify-end gap-2.5 pt-3.5 border-t border-slate-200 dark:border-slate-850">
                  <button
                    onClick={() => handleOpenEditModal(staff)}
                    className="h-10 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-250 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4 text-slate-500" />
                    <span>แก้ไขสิทธิ์</span>
                  </button>
                  <button
                    onClick={() => handleDeleteClick(staff.id)}
                    className="h-10 px-4 rounded-xl bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 text-rose-600 dark:text-rose-400 font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>ลบ Staff</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center border-2 border-dashed border-slate-250 dark:border-slate-800/80 rounded-2xl max-w-xl mx-auto">
            <Users className="w-14 h-14 text-slate-400 mx-auto mb-3" />
            <h4 className="text-sm sm:text-base font-black text-slate-700 dark:text-slate-300">ยังไม่มีรายชื่อ Staff ใน Workspace นี้</h4>
            <p className="text-xs sm:text-sm text-slate-450 dark:text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed font-bold">
              คุณสามารถสร้างและจัดการบัญชีให้กับผู้ช่วยหรือผู้จดมิเตอร์ประจำหอพักของคุณได้ง่าย ๆ โดยคลิกปุ่ม **"เพิ่ม Staff ใหม่"** ด้านบนได้ทันทีครับ
            </p>
          </div>
        )}
      </div>

      {/* 5. SQL Patch Information Card */}
      {!isDemo && (
        <div className="bg-gradient-to-r from-amber-500/5 to-yellow-500/5 border border-amber-500/20 rounded-3xl p-6 space-y-4">
          <div className="flex gap-3.5">
            <Database className="w-7 h-7 text-amber-500 shrink-0" />
            <div>
              <h4 className="text-base font-black text-slate-800 dark:text-slate-200">คู่มือการติดตั้งคอลัมน์สิทธิ์ในฐานข้อมูลจริง (Supabase SQL Setup)</h4>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                เนื่องจากระบบเพิ่งติดตั้งฟังก์ชันกำหนดสิทธิ์อย่างละเอียดแบบ JSONB หากใช้งานในฐานข้อมูล Supabase แอดมินต้องทำการรันคำสั่ง SQL ด้านล่างนี้ในหน้า **SQL Editor** ของเครื่องตนเองเพื่อเพิ่มคอลัมน์ `permissions` เสียก่อนครับ
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-950 text-slate-300 font-mono text-xs sm:text-sm rounded-xl relative border border-slate-800 overflow-x-auto select-all max-h-[180px]">
            <pre>{sqlScript}</pre>
            <button
              onClick={copySqlToClipboard}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer transition-colors"
            >
              {sqlCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          {sqlCopied && (
            <span className="text-xs sm:text-sm font-bold text-emerald-500 block">คัดลอกสคริปต์ SQL ลงคลิปบอร์ดแล้ว! นำไปรันในช่อง SQL Editor ของ Supabase Dashboard ได้ทันที</span>
          )}
        </div>
      )}

      {/* 6. Modal: Add Staff */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <form 
            onSubmit={handleAddStaffSubmit}
            className="w-full max-w-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl relative shadow-2xl space-y-4 flex flex-col max-h-[90vh] overflow-y-auto"
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
                <div className="relative font-bold">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="staff@example.com"
                    className="w-full pl-9 pr-4 py-2 border rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border-slate-250 dark:border-slate-850 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-mono font-bold"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">รหัสผ่านเริ่มต้น (Default Password)</label>
                <div className="relative font-bold">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showAddPassword ? "text" : "password"}
                    placeholder="ไม่ระบุ: ใช้รหัสผ่านดีฟอลต์ 123456"
                    className="w-full pl-9 pr-10 py-2 border rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border-slate-250 dark:border-slate-850 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-mono font-bold"
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
                  className="w-full px-4 py-2 border rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border-slate-250 dark:border-slate-850 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-mono font-bold"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Permissions Toggles */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-850 space-y-3">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block font-bold">กำหนดสิทธิ์ทีมงาน:</span>
              {renderPermissionsSettings("add")}
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
            className="w-full max-w-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl relative shadow-2xl space-y-4 flex flex-col max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => {
                setShowEditModal(false)
                setSelectedStaff(null)
              }}
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
            <div className="space-y-3.5 font-bold">
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
                  className="w-full px-4 py-2 border rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border-slate-250 dark:border-slate-850 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-mono font-bold"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Permissions Toggles */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-850 space-y-3">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block font-bold">ปรับสิทธิ์การเข้าทำรายการ:</span>
              {renderPermissionsSettings("edit")}
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
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
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
                className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-all cursor-pointer font-bold"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={formSubmitting}
                className="flex-1 h-10 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-rose-600/10 font-bold"
              >
                {formSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "ยืนยันลบ Staff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
