"use client"

import React, { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { ThemeToggle } from "./ThemeToggle"
import { LanguageToggle } from "./LanguageToggle"
import {
  LayoutDashboard,
  Home,
  Users,
  Receipt,
  FileText,
  BellRing,
  LogOut,
  Menu,
  X,
  User,
  Building,
  Landmark,
  Database,
  ShieldCheck,
  KeyRound,
  HelpCircle,
  Lock,
  Check,
  AlertCircle,
  RefreshCw,
  ChevronDown
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { getCurrentUserProfileAction, updateUserProfileAction } from "@/features/auth/actions"

interface DashboardLayoutProps {
  children: React.ReactNode
  role: "admin" | "staff" | "super_admin"
}

interface Workspace {
  id: string
  name: string
}

export default function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { t } = useLanguage()

  // ดึงบทบาทจริงจากคุกกี้ หรือใช้ค่า prop เป็นค่าเริ่มต้น
  const [userRole, setUserRole] = useState<"admin" | "staff" | "super_admin">(role)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([
    { id: "d290f1ee-6c54-4b01-90e6-d701748f0851", name: "แสนสุข แมนชั่น (Default)" },
    { id: "e390f1ee-6c54-4b01-90e6-d701748f0852", name: "ร่มรื่น เรสซิเดนท์ (Demo 2)" }
  ])
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace>({
    id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
    name: "แสนสุข แมนชั่น (Default)"
  })
  
  // สถานะการขอรับการสนับสนุน (Support Access Status)
  // 'pending' | 'approved' | 'revoked' | 'none'
  const [supportStatus, setSupportStatus] = useState<string>("none")
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  // สถานะตั้งค่าโปรไฟล์และเปลี่ยนรหัสผ่าน
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileName, setProfileName] = useState("")
  const [profilePhone, setProfilePhone] = useState("")
  const [profilePassword, setProfilePassword] = useState("")
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  // ตรวจสอบโหมดทดสอบ / เชื่อมต่อจริง
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  // โหลดสิทธิ์, Workspace, และสิทธิ์การเข้าดูแลระบบชั่วคราว
  useEffect(() => {
    // 1. ดึงสิทธิ์ผู้ใช้จากคุกกี้
    const mockRole = document.cookie
      .split("; ")
      .find((row) => row.startsWith("horset_user_role="))
      ?.split("=")[1];
    if (mockRole === "admin" || mockRole === "staff" || mockRole === "super_admin") {
      setUserRole(mockRole as any);
    }

    // 2. โหลดรายการ Workspace และอันที่เลือกอยู่
    const loadWorkspaceAndSupport = async () => {
      let activeWsId = "d290f1ee-6c54-4b01-90e6-d701748f0851"
      
      const savedWsId = localStorage.getItem("horset_current_workspace_id")
      if (savedWsId) {
        activeWsId = savedWsId
      } else {
        localStorage.setItem("horset_current_workspace_id", activeWsId)
      }

      if (!isDemo) {
        try {
          const supabase = createClient()
          
          // ดึง Workspaces จริงจากตาราง
          const { data: wsData, error: wsError } = await supabase
            .from("workspaces")
            .select("id, name")
          
          if (wsData && wsData.length > 0) {
            setWorkspaces(wsData)
            const matched = wsData.find((w) => w.id === activeWsId)
            if (matched) {
              setCurrentWorkspace(matched)
            } else {
              setCurrentWorkspace(wsData[0])
              activeWsId = wsData[0].id
              localStorage.setItem("horset_current_workspace_id", activeWsId)
            }
          }

          // ดึงสถานะ Support Access จาก Supabase
          const { data: grantData } = await supabase
            .from("support_access_grants")
            .select("status")
            .eq("workspace_id", activeWsId)
            .single()

          if (grantData) {
            setSupportStatus(grantData.status)
            // สำหรับสิทธิ์ Admin: ถ้าเป็น Pending ให้เด้ง Pop-up
            if (grantData.status === "pending" && mockRole === "admin") {
              setShowSupportModal(true)
            }
          } else {
            setSupportStatus("none")
          }
        } catch (err) {
          console.error("Supabase load error, fallback to localStorage", err)
          fallbackMock(activeWsId)
        }
      } else {
        fallbackMock(activeWsId)
      }
    }

    const fallbackMock = (activeWsId: string) => {
      const localWorkspaces = localStorage.getItem("horset_workspaces")
      const mockWs: Workspace[] = localWorkspaces
        ? JSON.parse(localWorkspaces)
        : [
            { id: "d290f1ee-6c54-4b01-90e6-d701748f0851", name: "แสนสุข แมนชั่น (Default)" },
            { id: "e390f1ee-6c54-4b01-90e6-d701748f0852", name: "ร่มรื่น เรสซิเดนท์ (Demo 2)" }
          ]
      setWorkspaces(mockWs)

      const matched = mockWs.find((w) => w.id === activeWsId)
      if (matched) {
        setCurrentWorkspace(matched)
      } else if (mockWs.length > 0) {
        setCurrentWorkspace(mockWs[0])
        localStorage.setItem("horset_current_workspace_id", mockWs[0].id)
      }
      
      // ดึงสถานะ Support จาก localStorage
      const savedStatus = localStorage.getItem(`horset_support_status_${activeWsId}`) || "none"
      setSupportStatus(savedStatus)
      
      if (savedStatus === "pending" && mockRole === "admin") {
        setShowSupportModal(true)
      }
    }

    loadWorkspaceAndSupport()
  }, [userRole, isDemo])

  // โหลดข้อมูลโปรไฟล์ของผู้ใช้เมื่อเปิดหน้าขึ้นมา
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!isDemo) {
        try {
          const res = await getCurrentUserProfileAction()
          if (res.success && res.data) {
            setFullName(res.data.full_name || "")
            setProfileName(res.data.full_name || "")
            setProfilePhone(res.data.phone || "")
          }
        } catch (err) {
          console.error("Error loading user profile:", err)
        }
      } else {
        const savedName = localStorage.getItem(`horset_demo_profile_name_${userRole}`)
        const savedPhone = localStorage.getItem(`horset_demo_profile_phone_${userRole}`)
        
        const defaultName = userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย"
        const defaultPhone = "089-999-9999"

        setFullName(savedName || defaultName)
        setProfileName(savedName || defaultName)
        setProfilePhone(savedPhone || defaultPhone)
      }
    }
    loadUserProfile()
  }, [userRole, isDemo])

  // จัดการบันทึกโปรไฟล์ & รหัสผ่านใหม่
  const handleUpdateProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileError(null)
    setProfileSuccess(null)

    if (profilePassword && profilePassword.length < 6) {
      setProfileError("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร")
      return
    }

    if (profilePassword !== profileConfirmPassword) {
      setProfileError("รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน")
      return
    }

    setProfileLoading(true)

    if (!isDemo) {
      try {
        const res = await updateUserProfileAction({
          fullName: profileName,
          phone: profilePhone,
          password: profilePassword || undefined
        })

        if (res.success) {
          setFullName(profileName)
          setProfileSuccess("✓ บันทึกข้อมูลโปรไฟล์และเปลี่ยนรหัสผ่านสำเร็จ!")
          setProfilePassword("")
          setProfileConfirmPassword("")
          setTimeout(() => {
            setShowProfileModal(false)
            setProfileSuccess(null)
          }, 1500)
        } else {
          setProfileError(res.error || "เกิดข้อผิดพลาดในการอัปเดตข้อมูล")
        }
      } catch (err) {
        setProfileError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์")
      } finally {
        setProfileLoading(false)
      }
    } else {
      // โหมดเดโม
      setTimeout(() => {
        localStorage.setItem(`horset_demo_profile_name_${userRole}`, profileName)
        localStorage.setItem(`horset_demo_profile_phone_${userRole}`, profilePhone)
        setFullName(profileName)
        setProfileSuccess("✓ [Demo Mode] อัปเดตข้อมูลและรหัสผ่านจำลองสำเร็จแล้ว!")
        setProfilePassword("")
        setProfileConfirmPassword("")
        setProfileLoading(false)
        setTimeout(() => {
          setShowProfileModal(false)
          setProfileSuccess(null)
        }, 1500)
      }, 1000)
    }
  }

  // ฟังก์ชันสลับ Workspace
  const handleSwitchWorkspace = (ws: Workspace) => {
    localStorage.setItem("horset_current_workspace_id", ws.id)
    // เก็บเป็นคุกกี้ด้วยเพื่อให้ server action อ่านได้สะดวก
    document.cookie = `horset_current_workspace_id=${ws.id}; path=/; max-age=86400`
    setCurrentWorkspace(ws)
    setShowDropdown(false)
    window.location.reload() // รีโหลดเพื่อรีเฟรชข้อมูลตารางทั้งหมดใน Workspace ใหม่
  }

  // ฟังก์ชันจัดการคำขอสิทธิ์เข้าถึง (สำหรับ Super Admin)
  const handleRequestSupport = async () => {
    if (!isDemo) {
      try {
        const supabase = createClient()
        const { error } = await supabase
          .from("support_access_grants")
          .upsert({
            workspace_id: currentWorkspace.id,
            status: "pending",
            updated_at: new Date().toISOString()
          }, { onConflict: "workspace_id" })

        if (!error) {
          setSupportStatus("pending")
          alert("✓ ส่งคำขอสิทธิ์สนับสนุนระบบไปยังเจ้าของหอพักเรียบร้อยแล้ว กรุณาแจ้งให้ Admin กดยอมรับในหน้าจอ")
        } else {
          alert("เกิดข้อผิดพลาดในการส่งคำขอ: " + error.message)
        }
      } catch (err) {
        console.error(err)
      }
    } else {
      localStorage.setItem(`horset_support_status_${currentWorkspace.id}`, "pending")
      setSupportStatus("pending")
      alert("✓ [Demo] ส่งคำขอสิทธิ์สนับสนุนระบบเรียบร้อยแล้ว! (เมื่อเข้าสู่ระบบด้วยสิทธิ์ Admin ของห้องพักนี้ จะเห็นป๊อปอัปให้กดอนุมัติ)")
    }
  }

  // ฟังก์ชันตัดสินใจคำขอสิทธิ์ (สำหรับ Admin)
  const handleDecideSupport = async (approved: boolean) => {
    const nextStatus = approved ? "approved" : "revoked"
    if (!isDemo) {
      try {
        const supabase = createClient()
        const { error } = await supabase
          .from("support_access_grants")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("workspace_id", currentWorkspace.id)

        if (!error) {
          setSupportStatus(nextStatus)
          setShowSupportModal(false)
        } else {
          alert("เกิดข้อผิดพลาด: " + error.message)
        }
      } catch (err) {
        console.error(err)
      }
    } else {
      localStorage.setItem(`horset_support_status_${currentWorkspace.id}`, nextStatus)
      setSupportStatus(nextStatus)
      setShowSupportModal(false)
    }
  }

  // เมนูนำทาง
  const menuItems = [
    {
      name: t("nav.dashboard") || "แดชบอร์ดภาพรวม",
      path: "/dashboard",
      icon: LayoutDashboard,
      roles: ["admin", "super_admin"]
    },
    {
      name: t("nav.rooms") || "จัดการห้องพัก",
      path: "/rooms",
      icon: Home,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: t("nav.tenants") || "จัดการผู้เช่า",
      path: "/tenants",
      icon: Users,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: t("nav.billing") || "จดมิเตอร์ & จัดการบิล",
      path: "/billing",
      icon: Receipt,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: t("nav.tax") || "จัดการภาษี ภ.ง.ด.",
      path: "/tax",
      icon: FileText,
      roles: ["admin", "super_admin"]
    },
    {
      name: t("nav.finance") || "ตั้งค่าการเงิน",
      path: "/finance-settings",
      icon: Landmark,
      roles: ["admin", "super_admin"]
    },
    {
      name: t("nav.test_connection") || "เช็คการเชื่อมต่อ Supabase",
      path: "/test-connection",
      icon: Database,
      roles: ["admin", "super_admin"]
    },
    {
      name: t("nav.super_admin") || "แผงควบคุม Super Admin",
      path: "/super-admin",
      icon: ShieldCheck,
      roles: ["super_admin"]
    },
    {
      name: t("nav.profile") || "แก้ไขโปรไฟล์ & รหัสผ่าน",
      path: "#profile",
      icon: KeyRound,
      roles: ["admin", "staff", "super_admin"],
      onClick: () => {
        setProfileError(null)
        setProfileSuccess(null)
        setShowProfileModal(true)
      }
    }
  ]

  const filteredMenu = menuItems.filter(item => item.roles.includes(userRole))

  const handleLogout = () => {
    document.cookie = "horset_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
    document.cookie = "horset_current_workspace_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
    router.push("/login")
  }

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100 font-sans">
      
      {/* Sidebar สำหรับหน้าจอขนาดใหญ่ (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 glass-panel border-r border-slate-900/60 p-6 z-20 shrink-0">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl shadow-lg shadow-blue-500/10">
            <Building className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-1">
              {t("common.app_name")}
            </h2>
            <p className="text-[10px] text-slate-400">{t("dashboard.system_subtitle")}</p>
          </div>
        </div>

        {/* ส่วนจัดการ Workspace สำหรับ Super Admin */}
        {userRole === "super_admin" && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-tr from-slate-950 to-slate-900 border border-slate-800 relative">
            <label className="text-[10px] text-slate-400 font-medium block mb-1.5 uppercase tracking-wider">{t("dashboard.select_workspace")}</label>
            
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-between text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 py-2.5 px-3 rounded-xl border border-slate-800 transition-colors"
            >
              <span className="truncate max-w-[140px]">{currentWorkspace.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showDropdown && (
              <div className="absolute left-0 right-0 mt-2 mx-4 bg-slate-950 border border-slate-800 rounded-xl shadow-xl z-30 p-1.5 space-y-1">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSwitchWorkspace(ws)}
                    className={`w-full text-left text-xs py-2 px-3 rounded-lg transition-colors ${
                      currentWorkspace.id === ws.id
                        ? "bg-blue-600 text-white font-medium"
                        : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    }`}
                  >
                    {ws.name}
                  </button>
                ))}
              </div>
            )}

            {/* แสดงสถานะ Support Permission ของ Workspace ปัจจุบัน */}
            <div className="mt-3 pt-2.5 border-t border-slate-900 flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{t("dashboard.support_access")}</span>
                {supportStatus === "approved" && (
                  <span className="text-teal-400 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3" /> {t("dashboard.approved")}
                  </span>
                )}
                {supportStatus === "pending" && (
                  <span className="text-amber-400 font-semibold animate-pulse flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> {t("dashboard.pending")}
                  </span>
                )}
                {(supportStatus === "revoked" || supportStatus === "none") && (
                  <span className="text-red-400 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {t("dashboard.no_access")}
                  </span>
                )}
              </div>

              {(supportStatus === "none" || supportStatus === "revoked") && (
                <button
                  onClick={handleRequestSupport}
                  className="w-full mt-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-[10px] text-center transition-colors shadow-lg shadow-blue-600/10"
                >
                  {t("dashboard.request_support")}
                </button>
              )}

              {supportStatus === "pending" && (
                <div className="text-[9px] text-slate-500 text-center mt-1">
                  {t("dashboard.awaiting_admin_approval")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* รายการเมนู */}
        <nav className="flex-1 space-y-1">
          {filteredMenu.map((item) => {
            const Icon = item.icon
            const isActive = item.path !== "#profile" && pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => {
                  if (item.onClick) {
                    item.onClick()
                  } else {
                    router.push(item.path)
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                    : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                {item.name}
              </button>
            )
          })}
        </nav>

        {/* ข้อมูลโปรไฟล์ด้านล่าง */}
        <div className="pt-6 border-t border-slate-900 space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 shadow-inner">
                <User className="w-5 h-5 text-slate-300" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200 truncate max-w-[100px]" title={fullName}>
                  {fullName || (userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย")}
                </h4>
                <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-bold mt-1 ${
                  userRole === "super_admin"
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/20"
                    : userRole === "admin"
                    ? "bg-red-500/20 text-red-400 border border-red-500/20"
                    : "bg-teal-500/20 text-teal-400 border border-teal-500/20"
                }`}>
                  {userRole.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
          >
            <LogOut className="w-4 h-4" />
            {t("common.logout") || "ออกจากระบบ"}
          </button>
        </div>
      </aside>

      {/* โมเดล Sidebar สำหรับอุปกรณ์พกพา (Mobile Drawer) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex flex-col w-64 glass-panel h-full p-6 animate-slide-right">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-500" />
                <h2 className="text-md font-bold">HorSet หอเสร็จ</h2>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {userRole === "super_admin" && (
              <div className="mb-6 p-4 rounded-2xl bg-slate-950 border border-slate-900">
                <label className="text-[10px] text-slate-400 font-medium block mb-1.5 uppercase">{t("dashboard.select_workspace")}</label>
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="w-full flex items-center justify-between text-xs bg-slate-900 text-slate-200 py-2.5 px-3 rounded-xl border border-slate-800"
                >
                  <span className="truncate">{currentWorkspace.name}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {showDropdown && (
                  <div className="mt-2 bg-slate-950 border border-slate-800 rounded-xl p-1.5 space-y-1">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => handleSwitchWorkspace(ws)}
                        className={`w-full text-left text-xs py-2 px-3 rounded-lg ${
                          currentWorkspace.id === ws.id ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-900"
                        }`}
                      >
                        {ws.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <nav className="flex-1 space-y-1">
              {filteredMenu.map((item) => {
                const Icon = item.icon
                const isActive = item.path !== "#profile" && pathname === item.path
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      if (item.onClick) {
                        item.onClick()
                      } else {
                        router.push(item.path)
                      }
                      setMobileOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </button>
                )
              })}
            </nav>

            <div className="pt-6 border-t border-slate-900 space-y-4">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-300" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200 truncate max-w-[100px]" title={fullName}>
                      {fullName || (userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย")}
                    </h4>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">{userRole}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-red-400"
              >
                <LogOut className="w-4 h-4" />
                {t("common.logout") || "ออกจากระบบ"}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* พื้นที่เนื้อหาหลัก (Main Content Area) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* Header แถบด้านบน */}
        <header className="flex items-center justify-between px-6 py-4 glass-panel border-b border-slate-900/60 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900/50"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <span>
                  {pathname === "/dashboard" && (t("nav.dashboard") || "หน้าแรกภาพรวมสถิติ")}
                  {pathname === "/rooms" && (t("nav.rooms") || "ระบบจัดการห้องพัก")}
                  {pathname === "/tenants" && (t("nav.tenants") || "ระบบจัดการข้อมูลสัญญาผู้เช่า")}
                  {pathname === "/billing" && (t("nav.billing") || "ระบบบันทึกจดมิเตอร์และจัดบิล")}
                  {pathname === "/meter" && (t("nav.billing") || "ระบบบันทึกจดมิเตอร์และจัดบิล")}
                  {pathname === "/tax" && (t("nav.tax") || "ระบบรายงานภาษีอพาร์ทเมนท์ ภ.ง.ด.")}
                  {pathname === "/finance-settings" && (t("nav.finance") || "ตั้งค่าการเงินและบัญชีรับเงิน")}
                  {pathname === "/test-connection" && (t("nav.test_connection") || "เช็คระบบตรวจสอบการเชื่อมต่อ Supabase")}
                </span>
                
                {userRole === "super_admin" && (
                  <span className="text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {t("dashboard.support_mode")}
                  </span>
                )}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* แสดงสถานะสิทธิ์เข้าช่วยเหลือสำหรับ Admin เพื่อความโปร่งใส */}
            {userRole === "admin" && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-900/40 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-500">{t("dashboard.support_access")}</span>
                {supportStatus === "approved" ? (
                  <button
                    onClick={() => handleDecideSupport(false)}
                    className="text-[10px] bg-teal-500/10 border border-teal-500/20 hover:bg-red-500/10 hover:border-red-500/20 text-teal-400 hover:text-red-400 font-bold px-2.5 py-0.5 rounded-lg transition-colors flex items-center gap-1"
                    title="คลิกเพื่อสั่งระงับสิทธิ์ชั่วคราว"
                  >
                    <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse" />
                    {t("dashboard.authorized_revoke")}
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-lg">
                    {t("dashboard.access_revoked")}
                  </span>
                )}
              </div>
            )}

            <LanguageToggle />
            <ThemeToggle />

            <button className="relative p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-900/50 transition-colors">
              <BellRing className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
            </button>
            
            <div className="h-6 w-px bg-slate-900" />
            
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-300">{t("dashboard.building")} {currentWorkspace.name}</p>
              <p className="text-[10px] text-slate-500">{t("dashboard.current_cycle")}</p>
            </div>
          </div>
        </header>

        {/* ตัวเนื้อหาภายในหน้าเว็บ (Page Content Injection) */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>

      {/* ========================================== */}
      {/* POP-UP MODAL สำหรับ ADMIN กดยืนยันให้สิทธิ์เข้าถึง */}
      {/* ========================================== */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop ดำเบลอหรูหรา */}
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" />
          
          <div className="relative glass-panel w-full max-w-md p-8 rounded-3xl border border-blue-500/20 shadow-2xl shadow-blue-500/5 animate-scale-up">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 rounded-t-3xl" />
            
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20 text-blue-400">
                <Lock className="w-8 h-8" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-100">
                🔔 คำขอช่วยเหลือระบบ (Support Request)
              </h3>
              
              <p className="text-sm text-slate-400 leading-relaxed">
                เจ้าหน้าที่บริการลูกค้า <span className="text-blue-400 font-semibold">(Super Admin)</span> ร้องขอเชื่อมต่อสิทธิ์เพื่อตรวจสอบข้อมูลในหอพัก <span className="text-white font-medium">"{currentWorkspace.name}"</span> ของคุณชั่วคราว เพื่อความปลอดภัยสูงสุด โปรดยืนยันการให้สิทธิ์เข้าถึงนี้
              </p>

              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 text-left w-full space-y-2 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>ผู้ร้องขอ:</span>
                  <span className="text-slate-200 font-medium">HorSet Support Team (Super Admin)</span>
                </div>
                <div className="flex justify-between">
                  <span>ขอบเขตข้อมูล:</span>
                  <span className="text-slate-200 font-medium">อ่านและแก้ไขห้องพัก, สัญญา, มิเตอร์ และบิล</span>
                </div>
                <div className="flex justify-between">
                  <span>ความปลอดภัย:</span>
                  <span className="text-teal-400 font-semibold">คุณสามารถเพิกถอนสิทธิ์การเข้าถึงได้ตลอดเวลา</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full mt-4">
                <button
                  onClick={() => handleDecideSupport(false)}
                  className="py-3 px-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold rounded-xl text-sm transition-colors"
                >
                  ปฏิเสธ (Deny)
                </button>
                <button
                  onClick={() => handleDecideSupport(true)}
                  className="py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-600/20 transition-all"
                >
                  อนุมัติสิทธิ์ (Approve)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* POP-UP MODAL สำหรับแก้ไขโปรไฟล์และเปลี่ยนรหัสผ่าน */}
      {/* ========================================== */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop ดำเบลอหรูหรา */}
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => !profileLoading && setShowProfileModal(false)} />
          
          <div className="relative glass-panel w-full max-w-md p-8 rounded-3xl border border-blue-500/20 shadow-2xl shadow-blue-500/5 animate-scale-up">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-teal-500 rounded-t-3xl" />
            
            {/* Close button */}
            <button
              disabled={profileLoading}
              onClick={() => setShowProfileModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-full transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20 text-blue-400">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">
                    ตั้งค่าโปรไฟล์ & รหัสผ่าน
                  </h3>
                  <p className="text-xs text-slate-400">แก้ไขข้อมูลส่วนตัวและรหัสผ่านเพื่อความปลอดภัย</p>
                </div>
              </div>

              {profileError && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-xs text-red-400 animate-pulse">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}

              {profileSuccess && (
                <div className="p-3.5 bg-teal-500/10 border border-teal-500/20 rounded-xl flex items-center gap-2.5 text-xs text-teal-400">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfileSubmit} className="space-y-4">
                {/* Full name input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <span>ชื่อ-นามสกุล</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      disabled={profileLoading}
                      placeholder="กรอกชื่อ-นามสกุลจริง"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-900 focus:border-blue-500 rounded-xl text-xs text-slate-200 outline-none transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Phone number input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <span>เบอร์โทรศัพท์</span>
                  </label>
                  <div className="relative">
                    <AlertCircle className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="tel"
                      required
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      disabled={profileLoading}
                      placeholder="กรอกเบอร์โทรศัพท์มือถือ"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-900 focus:border-blue-500 rounded-xl text-xs text-slate-200 outline-none transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="h-px bg-slate-900 my-4" />

                <div className="space-y-1 bg-blue-500/5 p-3 rounded-2xl border border-blue-500/10 mb-2">
                  <p className="text-[10px] text-blue-400 font-semibold flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> แนะนำการเปลี่ยนรหัสผ่าน
                  </p>
                  <p className="text-[9px] text-slate-500 leading-normal">
                    กรอกข้อมูลด้านล่างเฉพาะเมื่อคุณต้องการแก้ไขรหัสผ่านใหม่เท่านั้น หากไม่ต้องการแก้ไข ให้ปล่อยว่างช่องรหัสผ่านไว้ได้เลยครับ
                  </p>
                </div>

                {/* New password input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400">
                    รหัสผ่านใหม่ (ระบุอย่างน้อย 6 ตัวอักษร)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      value={profilePassword}
                      onChange={(e) => setProfilePassword(e.target.value)}
                      disabled={profileLoading}
                      placeholder="ป้อนรหัสผ่านใหม่ หากต้องการเปลี่ยน"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-900 focus:border-blue-500 rounded-xl text-xs text-slate-200 outline-none transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Confirm new password input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400">
                    ยืนยันรหัสผ่านใหม่
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      value={profileConfirmPassword}
                      onChange={(e) => setProfileConfirmPassword(e.target.value)}
                      disabled={profileLoading}
                      placeholder="ป้อนรหัสผ่านใหม่อีกครั้งเพื่อยืนยัน"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-900 focus:border-blue-500 rounded-xl text-xs text-slate-200 outline-none transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full pt-4">
                  <button
                    type="button"
                    disabled={profileLoading}
                    onClick={() => setShowProfileModal(false)}
                    className="py-3 px-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold rounded-xl text-xs transition-colors disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={profileLoading}
                    className="py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {profileLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>กำลังบันทึก...</span>
                      </>
                    ) : (
                      <span>บันทึกข้อมูล</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
