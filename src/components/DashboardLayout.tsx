"use client"

import React, { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
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
      const matched = workspaces.find((w) => w.id === activeWsId)
      if (matched) {
        setCurrentWorkspace(matched)
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
      name: "แดชบอร์ดภาพรวม",
      path: "/dashboard",
      icon: LayoutDashboard,
      roles: ["admin", "super_admin"]
    },
    {
      name: "จัดการห้องพัก",
      path: "/rooms",
      icon: Home,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: "จัดการผู้เช่า",
      path: "/tenants",
      icon: Users,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: "จดมิเตอร์ & จัดการบิล",
      path: "/billing",
      icon: Receipt,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: "จัดการภาษี ภ.ง.ด.",
      path: "/tax",
      icon: FileText,
      roles: ["admin", "super_admin"]
    },
    {
      name: "ตั้งค่าการเงิน",
      path: "/finance-settings",
      icon: Landmark,
      roles: ["admin", "super_admin"]
    },
    {
      name: "เช็คการเชื่อมต่อ Supabase",
      path: "/test-connection",
      icon: Database,
      roles: ["admin", "super_admin"]
    },
    {
      name: "แผงควบคุม Super Admin",
      path: "/super-admin",
      icon: ShieldCheck,
      roles: ["super_admin"]
    }
  ]

  const filteredMenu = menuItems.filter(item => item.roles.includes(userRole))

  const handleLogout = () => {
    document.cookie = "horset_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
    document.cookie = "horset_current_workspace_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
    router.push("/login")
  }

  return (
    <div className="min-h-screen flex bg-[#060a13] text-slate-100 font-sans">
      
      {/* Sidebar สำหรับหน้าจอขนาดใหญ่ (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 glass-panel border-r border-slate-900/60 p-6 z-20 shrink-0">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl shadow-lg shadow-blue-500/10">
            <Building className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-1">
              HorSet <span className="text-blue-500 font-semibold">หอเสร็จ</span>
            </h2>
            <p className="text-[10px] text-slate-400">ระบบบริหารจัดการหอพักแบบ SaaS</p>
          </div>
        </div>

        {/* ส่วนจัดการ Workspace สำหรับ Super Admin */}
        {userRole === "super_admin" && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-tr from-slate-950 to-slate-900 border border-slate-800 relative">
            <label className="text-[10px] text-slate-400 font-medium block mb-1.5 uppercase tracking-wider">เลือก Workspace ที่เข้าช่วยเหลือ</label>
            
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
                <span className="text-slate-500">สิทธิ์การช่วยเหลือ:</span>
                {supportStatus === "approved" && (
                  <span className="text-teal-400 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3" /> อนุมัติแล้ว
                  </span>
                )}
                {supportStatus === "pending" && (
                  <span className="text-amber-400 font-semibold animate-pulse flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> รอยืนยัน
                  </span>
                )}
                {(supportStatus === "revoked" || supportStatus === "none") && (
                  <span className="text-red-400 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> ไม่มีสิทธิ์
                  </span>
                )}
              </div>

              {(supportStatus === "none" || supportStatus === "revoked") && (
                <button
                  onClick={handleRequestSupport}
                  className="w-full mt-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-[10px] text-center transition-colors shadow-lg shadow-blue-600/10"
                >
                  ส่งคำขอเข้าช่วยเหลือระบบ
                </button>
              )}

              {supportStatus === "pending" && (
                <div className="text-[9px] text-slate-500 text-center mt-1">
                  รอยืนยันคำขอจากสิทธิ์ Admin หอพักนี้
                </div>
              )}
            </div>
          </div>
        )}

        {/* รายการเมนู */}
        <nav className="flex-1 space-y-1">
          {filteredMenu.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
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
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 shadow-inner">
              <User className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">
                {userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย"}
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

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
          >
            <LogOut className="w-4 h-4" />
            ออกจากระบบ
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
                <label className="text-[10px] text-slate-400 font-medium block mb-1.5 uppercase">เลือก Workspace</label>
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
                const isActive = pathname === item.path
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      router.push(item.path)
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
              <div className="flex items-center gap-3 px-2">
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-300" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">{userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : "คุณสมเจตน์"}</h4>
                  <span className="text-[9px] text-slate-500 uppercase">{userRole}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-red-400"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
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
                  {pathname === "/dashboard" && "หน้าแรกภาพรวมสถิติ"}
                  {pathname === "/rooms" && "ระบบจัดการห้องพัก"}
                  {pathname === "/tenants" && "ระบบจัดการข้อมูลสัญญาผู้เช่า"}
                  {pathname === "/billing" && "ระบบบันทึกจดมิเตอร์และจัดบิล"}
                  {pathname === "/meter" && "ระบบบันทึกจดมิเตอร์และจัดบิล"}
                  {pathname === "/tax" && "ระบบรายงานภาษีอพาร์ทเมนท์ ภ.ง.ด."}
                  {pathname === "/finance-settings" && "ตั้งค่าการเงินและบัญชีรับเงิน"}
                  {pathname === "/test-connection" && "เช็คระบบตรวจสอบการเชื่อมต่อ Supabase"}
                </span>
                
                {userRole === "super_admin" && (
                  <span className="text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    เข้าช่วยเหลือระบบ
                  </span>
                )}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* แสดงสถานะสิทธิ์เข้าช่วยเหลือสำหรับ Admin เพื่อความโปร่งใส */}
            {userRole === "admin" && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-900/40 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-500">สิทธิ์สนับสนุน:</span>
                {supportStatus === "approved" ? (
                  <button
                    onClick={() => handleDecideSupport(false)}
                    className="text-[10px] bg-teal-500/10 border border-teal-500/20 hover:bg-red-500/10 hover:border-red-500/20 text-teal-400 hover:text-red-400 font-bold px-2.5 py-0.5 rounded-lg transition-colors flex items-center gap-1"
                    title="คลิกเพื่อสั่งระงับสิทธิ์ชั่วคราว"
                  >
                    <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse" />
                    อนุญาตอยู่ (คลิกยกเลิก)
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-lg">
                    ปิดการเข้าถึง
                  </span>
                )}
              </div>
            )}

            <button className="relative p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-900/50 transition-colors">
              <BellRing className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
            </button>
            
            <div className="h-6 w-px bg-slate-900" />
            
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-300">อาคาร {currentWorkspace.name}</p>
              <p className="text-[10px] text-slate-500">รอบบิลปัจจุบัน • มิ.ย. 2026</p>
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

    </div>
  )
}
