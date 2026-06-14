"use client"

import React, { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Home,
  Users,
  Gauge,
  Receipt,
  FileText,
  BellRing,
  LogOut,
  Menu,
  X,
  User,
  Building,
  Landmark,
  Database
} from "lucide-react"

interface DashboardLayoutProps {
  children: React.ReactNode
  role: "admin" | "staff"
}

export default function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // ดึงบทบาทจริงจากคุกกี้ที่เก็บตอนล็อกอิน หรือใช้ค่า prop ที่ส่งมาเป็นค่าเริ่มต้น
  const [userRole, setUserRole] = useState<"admin" | "staff">(role)

  useEffect(() => {
    const mockRole = document.cookie
      .split("; ")
      .find((row) => row.startsWith("horset_user_role="))
      ?.split("=")[1];
    if (mockRole === "admin" || mockRole === "staff") {
      setUserRole(mockRole);
    }
  }, []);

  // เมนูนำทาง
  const menuItems = [
    {
      name: "แดชบอร์ดภาพรวม",
      path: "/dashboard",
      icon: LayoutDashboard,
      roles: ["admin"]
    },
    {
      name: "จัดการห้องพัก",
      path: "/rooms",
      icon: Home,
      roles: ["admin", "staff"]
    },
    {
      name: "จัดการผู้เช่า",
      path: "/tenants",
      icon: Users,
      roles: ["admin", "staff"]
    },
    {
      name: "จดมิเตอร์ & จัดการบิล",
      path: "/billing",
      icon: Receipt,
      roles: ["admin", "staff"]
    },
    {
      name: "จัดการภาษี ภ.ง.ด.",
      path: "/tax",
      icon: FileText,
      roles: ["admin"]
    },
    {
      name: "ตั้งค่าการเงิน",
      path: "/finance-settings",
      icon: Landmark,
      roles: ["admin"]
    },
    {
      name: "เช็คการเชื่อมต่อ Supabase",
      path: "/test-connection",
      icon: Database,
      roles: ["admin"]
    }
  ]

  const filteredMenu = menuItems.filter(item => item.roles.includes(userRole))

  const handleLogout = () => {
    // ลบคุกกี้บทบาทของระบบจำลอง
    document.cookie = "horset_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
    // นำทางกลับหน้า login
    router.push("/login")
  }

  return (
    <div className="min-h-screen flex bg-[#060a13] text-slate-100 font-sans">
      {/* Sidebar สำหรับหน้าจอขนาดใหญ่ (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 glass-panel border-r border-slate-900/60 p-6 z-20 shrink-0">
        <div className="flex items-center gap-3 mb-10">
          <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/10">
            <Building className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-wide">HorSet <span className="text-blue-500">หอเสร็จ</span></h2>
            <p className="text-[10px] text-slate-400">ระบบบริหารจัดการหอพัก</p>
          </div>
        </div>

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
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
              <User className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-200">
                {userRole === "admin" ? "คุณสมเจตน์ (เจ้าของ)" : "สมชาย (ผู้ช่วย)"}
              </h4>
              <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-bold mt-1 ${
                userRole === "admin" ? "bg-red-500/20 text-red-400" : "bg-teal-500/20 text-teal-400"
              }`}>
                {userRole === "admin" ? "ADMIN" : "STAFF"}
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
                  <h4 className="text-xs font-semibold">{userRole === "admin" ? "คุณสมเจตน์" : "สมชาย"}</h4>
                  <span className="text-[9px] text-slate-500 font-mono uppercase">{userRole}</span>
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
              <h1 className="text-sm font-semibold text-slate-200">
                {pathname === "/dashboard" && "หน้าแรกภาพรวม"}
                {pathname === "/rooms" && "ระบบจัดการห้องพัก"}
                {pathname === "/tenants" && "ระบบจัดการข้อมูลสัญญาผู้เช่า"}
                {pathname === "/meter" && "ระบบจดมิเตอร์และจัดการบิล"}
                {pathname === "/billing" && "ระบบจดมิเตอร์และจัดการบิล"}
                {pathname === "/tax" && "ระบบรายงานภาษีอพาร์ทเมนท์"}
                {pathname === "/finance-settings" && "ตั้งค่าการเงินและพร้อมเพย์"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-900/50 transition-colors">
              <BellRing className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
            </button>
            <div className="h-6 w-px bg-slate-900" />
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium text-slate-300">อาคาร แสนสุข แมนชั่น</p>
              <p className="text-[10px] text-slate-500">24 ห้องพัก • ยอดเก็บเงินรอบ มิ.ย.</p>
            </div>
          </div>
        </header>

        {/* ตัวเนื้อหาภายในหน้าเว็บ (Page Content Injection) */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  )
}
