"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { 
  Building, 
  Landmark, 
  Shield, 
  Network, 
  User, 
  Settings, 
  RefreshCw,
  AlertCircle
} from "lucide-react"

import { getCurrentUserProfileClient } from "@/features/auth/client"
import { type StaffPermissions, DEFAULT_STAFF_PERMISSIONS, ADMIN_DEFAULT_PERMISSIONS } from "@/features/permissions/types"

// Lazy load or import setting tabs
import PropertySettingsTab from "@/components/settings/PropertySettingsTab"
import FinanceSettingsTab from "@/components/settings/FinanceSettingsTab"
import PermissionsTab from "@/components/settings/PermissionsTab"
import TestConnectionTab from "@/components/settings/TestConnectionTab"
import ProfileTab from "@/components/settings/ProfileTab"

function SettingsHubContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab") || "profile"

  const [activeTab, setActiveTab] = useState<string>(initialTab)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [userPermissions, setUserPermissions] = useState<StaffPermissions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  useEffect(() => {
    async function loadUserData() {
      setLoading(true)
      try {
        if (!isDemo) {
          const res = await getCurrentUserProfileClient()
          if (res.success && res.data) {
            const profile = res.data
            setCurrentUser(profile)
            
            // Load and parse permissions
            const isUserAdminOrSuper = profile.role === "admin" || profile.role === "super_admin"
            const defaultPerms = isUserAdminOrSuper ? ADMIN_DEFAULT_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS

            if (profile.permissions) {
              let perms = profile.permissions
              if (typeof perms === "string") {
                try {
                  perms = JSON.parse(perms)
                } catch {
                  perms = defaultPerms
                }
              }
              setUserPermissions({ ...defaultPerms, ...perms })
            } else {
              setUserPermissions(defaultPerms)
            }
          } else {
            setError("ไม่สามารถดึงข้อมูลสิทธิ์การใช้งานของคุณได้ กรุณาล็อกอินใหม่อีกครั้ง")
          }
        } else {
          // Demo Mode
          const userRole = document.cookie
            .split("; ")
            .find((row) => row.startsWith("horset_user_role="))
            ?.split("=")[1] || "admin"

          setCurrentUser({ role: userRole })
          setUserPermissions(ADMIN_DEFAULT_PERMISSIONS)
        }
      } catch (err) {
        console.error("Error loading user profile in settings hub:", err)
        setError("เกิดข้อผิดพลาดในการโหลดข้อมูลสิทธิ์พนักงาน")
      } finally {
        setLoading(false)
      }
    }
    loadUserData()
  }, [isDemo])

  // Sync state with url parameter
  useEffect(() => {
    const tabParam = searchParams.get("tab")
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [searchParams])

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    router.push(`/settings?tab=${tabId}`)
  }

  if (loading) {
    return (
      <div className="py-32 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span>กำลังเตรียมศูนย์กลางการตั้งค่าระบบ...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center max-w-xl mx-auto space-y-4 py-24 min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20 mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">ข้อผิดพลาดในการโหลดข้อมูล</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-bold">{error}</p>
      </div>
    )
  }

  // Define tabs definition with permissions checking
  const allTabs = [
    {
      id: "profile",
      name: "โปรไฟล์ & รหัสผ่าน",
      icon: User,
      description: "แก้ไขข้อมูลส่วนตัวและรหัสผ่านเพื่อความปลอดภัย",
      allowed: true // Always allowed for logged in users
    },
    {
      id: "property",
      name: "ตั้งค่าหอพัก",
      icon: Building,
      description: "อัตราค่าน้ำ/ค่าไฟ ค่าบริการรายเดือน ระยะเวลาสัญญา และอื่นๆ",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin" || !!userPermissions?.manage_property_settings
    },
    {
      id: "finance",
      name: "ตั้งค่าการเงิน & บัญชี",
      icon: Landmark,
      description: "บัญชีธนาคารรับเงิน QR Code พร้อมเพย์ และข้อมูลผู้เสียภาษี",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin" || !!userPermissions?.manage_finance_settings
    },
    {
      id: "permissions",
      name: "สิทธิ์การใช้งานพนักงาน",
      icon: Shield,
      description: "สร้างบัญชี Staff และกำหนดสิทธิ์การเข้าถึงข้อมูลอย่างละเอียด",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin" || !!userPermissions?.manage_staff_permissions
    },
    {
      id: "supabase",
      name: "ตรวจสอบเชื่อมต่อ Supabase",
      icon: Network,
      description: "ตรวจสอบความเสถียร สรุปสภาพแวดล้อม และสคริปต์ SQL Database",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin"
    }
  ]

  const allowedTabs = allTabs.filter(tab => tab.allowed)
  
  // Make sure if selected tab is not allowed, fallback to first allowed tab (profile)
  const currentTabAllowed = allowedTabs.some(tab => tab.id === activeTab)
  const resolvedActiveTab = currentTabAllowed ? activeTab : "profile"

  const renderActiveTabContent = () => {
    switch (resolvedActiveTab) {
      case "profile":
        return <ProfileTab />
      case "property":
        return <PropertySettingsTab />
      case "finance":
        return <FinanceSettingsTab />
      case "permissions":
        return <PermissionsTab />
      case "supabase":
        return <TestConnectionTab />
      default:
        return <ProfileTab />
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20 shadow-sm">
          <Settings className="w-6 h-6 animate-spin-slow" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 font-sans tracking-tight">
            ตั้งค่าระบบ (System Settings)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 font-bold">
            ปรับแต่งสิทธิ์การใช้งานพนักงาน ข้อมูลหอพัก บัญชีการรับเงิน และตั้งค่าความปลอดภัยโปรไฟล์ของคุณ
          </p>
        </div>
      </div>

      {/* Main Settings Panel */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        
        {/* Desktop Sidebar Tabs Selection */}
        <div className="w-full lg:w-80 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 p-4 rounded-3xl shadow-sm space-y-2 lg:sticky lg:top-24">
          <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block px-2.5 pb-2 border-b border-slate-100 dark:border-slate-850/80 mb-2">
            หมวดหมู่การตั้งค่า
          </span>
          
          {/* Mobile Tab List (horizontal scrolling) & Desktop Menu */}
          <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-2 pb-2 lg:pb-0 scrollbar-none font-bold">
            {allowedTabs.map((tab) => {
              const Icon = tab.icon
              const isSelected = resolvedActiveTab === tab.id

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`w-auto lg:w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl border text-xs sm:text-sm font-extrabold whitespace-nowrap lg:whitespace-normal text-left transition-all duration-200 cursor-pointer shrink-0 ${
                    isSelected
                      ? "bg-blue-600/10 dark:bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 shadow-sm shadow-blue-500/[0.02]"
                      : "bg-transparent hover:bg-slate-50 dark:hover:bg-slate-950 border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isSelected ? "text-blue-500" : "text-slate-400"}`} />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{tab.name}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal hidden lg:block truncate mt-0.5 max-w-[200px]">
                      {tab.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full min-w-0 bg-transparent">
          <div className="animate-fade-in duration-300">
            {renderActiveTabContent()}
          </div>
        </div>

      </div>
    </div>
  )
}

export default function SettingsHubPage() {
  return (
    <Suspense fallback={
      <div className="py-32 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span>กำลังเปิดหน้าตั้งค่าระบบ...</span>
      </div>
    }>
      <SettingsHubContent />
    </Suspense>
  )
}
