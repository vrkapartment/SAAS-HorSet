"use client"

import React, { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useTheme } from "next-themes"
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
  ChevronDown,
  Coins,
  Scroll
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { updateUserProfileAction } from "@/features/auth/actions"
import Sidebar from "./dashboard/Sidebar"
import SupportModal from "./dashboard/SupportModal"
import ProfileModal from "./dashboard/ProfileModal"
import { useSupportAccess } from "@/hooks/useSupportAccess"
import { getCurrentUserProfileClient, setCachedUserProfile, clearCachedUserProfile } from "@/features/auth/client"
import { type StaffPermissions, DEFAULT_STAFF_PERMISSIONS, ADMIN_DEFAULT_PERMISSIONS } from "@/features/permissions/types"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"
import { getRooms, getRoomTypes } from "@/features/room/actions"
import { getTenants } from "@/features/tenant/actions"
import { getFinanceSettings } from "@/features/finance/actions"
import { getBills } from "@/features/billing/actions"
import { getExpenses } from "@/features/expenses/actions"

interface DashboardLayoutProps {
  children: React.ReactNode
  role: "admin" | "staff" | "super_admin"
}

interface Workspace {
  id: string
  name: string
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

function setCookie(name: string, value: string, days = 7) {
  if (typeof document === "undefined") return
  const date = new Date()
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
  // On localhost/HTTP, we must not include Secure attribute or browsers will reject the cookie
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:"
  document.cookie = `${name}=${value}; path=/; expires=${date.toUTCString()}${isSecure ? "; Secure" : ""}; SameSite=Lax`
}

export default function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const safeNavigate = (path: string) => {
    if (typeof window !== "undefined" && (window as any).__hasUnsavedChanges) {
      const confirmLeave = window.confirm("คุณยังมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?")
      if (!confirmLeave) return
      ;(window as any).__hasUnsavedChanges = false
    }
    router.push(path)
  }
  const [mobileOpen, setMobileOpen] = useState(false)
  const { t } = useLanguage()
  const { getCachedData, setCachedData, clearAllCache } = useWorkspaceData()

  // Theme states
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  const isDark = mounted ? resolvedTheme === "dark" : true

  // ดึงบทบาทจริงจากคุกกี้ หรือใช้ค่า prop เป็นค่าเริ่มต้น
  const [userRole, setUserRole] = useState<"admin" | "staff" | "super_admin">(role)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace>({
    id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
    name: ""
  })
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  

  const [showDropdown, setShowDropdown] = useState(false)

  // สถานะตั้งค่าโปรไฟล์และเปลี่ยนรหัสผ่าน
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileName, setProfileName] = useState("")
  const [profilePhone, setProfilePhone] = useState("")
  const [profilePassword, setProfilePassword] = useState("")
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [isProfileLoaded, setIsProfileLoaded] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [userPermissions, setUserPermissions] = useState<StaffPermissions | null>(null)

  // ตรวจสอบโหมดทดสอบ / เชื่อมต่อจริง
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  // จัดการตรรกะสิทธิ์เข้าช่วยเหลือระบบด้วย Custom Hook (useSupportAccess)
  const {
    supportStatus,
    setSupportStatus,
    showSupportModal,
    setShowSupportModal,
    handleRequestSupport,
    handleDecideSupport,
    handleExitSupport
  } = useSupportAccess(currentWorkspace, userRole, isDemo)

  // โหลดสิทธิ์, ข้อมูลผู้ใช้, รายการ Workspace และสิทธิ์การช่วยเหลือระบบทั้งหมดในรอบเดียวเพื่อความเสถียรและเร็วสูงสุด
  useEffect(() => {
    const initUserData = async () => {
      // 1. ตรวจสอบบทบาทเบื้องต้นจาก cookie ก่อนเพื่อให้ปรับ state ได้อย่างรวดเร็ว
      const mockRole = document.cookie
        .split("; ")
        .find((row) => row.startsWith("horset_user_role="))
        ?.split("=")[1];
      
      let initialRole = role
      if (mockRole === "admin" || mockRole === "staff" || mockRole === "super_admin") {
        initialRole = mockRole as any
        setUserRole(initialRole)
      }

      let activeWsId = "d290f1ee-6c54-4b01-90e6-d701748f0851"
      let currentRole = initialRole
      let profileWsId: string | null = null

      if (!isDemo) {
        try {
          const res = await getCurrentUserProfileClient()
          if (res.success && res.data) {
            const profileData = res.data
            setFullName(profileData.full_name || profileData.email || "ผู้ดูแลระบบ")
            setProfileName(profileData.full_name || "")
            setProfilePhone(profileData.phone || "")
            
            if (profileData.role) {
              currentRole = profileData.role
              setUserRole(profileData.role as any)
            }

            profileWsId = profileData.workspace_id || null

            // โหลดสิทธิ์การเข้าถึงแบบละเอียด (Permissions)
            const isUserAdminOrSuper = profileData.role === "admin" || profileData.role === "super_admin"
            const defaultPerms = isUserAdminOrSuper ? ADMIN_DEFAULT_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS

            if (profileData.permissions) {
              let perms = profileData.permissions
              if (typeof perms === "string") {
                try {
                  perms = JSON.parse(perms)
                } catch {
                  perms = defaultPerms
                }
              }
              setUserPermissions({
                ...defaultPerms,
                ...perms
              })
            } else {
              setUserPermissions(defaultPerms)
            }
          }
        } catch (err) {
          console.error("Error loading user profile in DashboardLayout:", err)
        } finally {
          setIsProfileLoaded(true)
        }
      } else {
        // โหมด Demo
        const savedName = getCookie(`horset_demo_profile_name_${currentRole}`)
        const savedPhone = getCookie(`horset_demo_profile_phone_${currentRole}`)
        
        const defaultName = currentRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : currentRole === "admin" ? "คุณสมเจตน์" : "สมชาย"
        const defaultPhone = "089-999-9999"

        setFullName(savedName || defaultName)
        setProfileName(savedName || defaultName)
        setProfilePhone(savedPhone || defaultPhone)
        setUserPermissions(currentRole === "super_admin" || currentRole === "admin" ? ADMIN_DEFAULT_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS)
        setIsProfileLoaded(true)
      }

      // 2. จัดการเรื่องคุกกี้ Workspace
      if (currentRole !== "super_admin" && profileWsId) {
        activeWsId = profileWsId
        setCookie("horset_current_workspace_id", activeWsId)
      } else {
        const savedWsId = getCookie("horset_current_workspace_id")
        if (savedWsId) {
          activeWsId = savedWsId
        } else {
          setCookie("horset_current_workspace_id", activeWsId)
        }
      }

      // 3. โหลด Workspaces และ Support Access Status
      if (!isDemo) {
        try {
          const supabase = createClient()
          
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
              setCookie("horset_current_workspace_id", activeWsId)
            }
          }

          const { data: grantData } = await supabase
            .from("support_access_grants")
            .select("status")
            .eq("workspace_id", activeWsId)
            .single()

          if (grantData) {
            setSupportStatus(grantData.status)
            setCookie(`horset_support_status_${activeWsId}`, grantData.status)
            if (grantData.status === "pending" && currentRole === "admin") {
              setShowSupportModal(true)
            }
          } else {
            setSupportStatus("none")
            setCookie(`horset_support_status_${activeWsId}`, "none")
          }
        } catch (err) {
          console.error("Supabase load error inside DashboardLayout init:", err)
          fallbackMock(activeWsId, currentRole)
        } finally {
          setWorkspaceLoading(false)
        }
      } else {
        fallbackMock(activeWsId, currentRole)
        setWorkspaceLoading(false)
      }
    }

    const fallbackMock = (activeWsId: string, currentRole: string) => {
      const localWorkspaces = getCookie("horset_workspaces")
      const mockWs: Workspace[] = localWorkspaces
        ? JSON.parse(decodeURIComponent(localWorkspaces))
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
        setCookie("horset_current_workspace_id", mockWs[0].id)
      }
      
      const savedStatus = getCookie(`horset_support_status_${activeWsId}`) || "none"
      setSupportStatus(savedStatus)
      
      if (savedStatus === "pending" && currentRole === "admin") {
        setShowSupportModal(true)
      }
    }

    initUserData()
  }, [])



  // ฟังก์ชันช่วยสำหรับการทำ prefetch ข้อมูลรายหน้าเมื่อเอาเมาส์ไปชี้ปุ่ม (Hover-Triggered Prefetching)
  const handlePrefetchPage = (path: string) => {
    if (!currentWorkspace.id || isDemo) return
    const wsId = currentWorkspace.id

    switch (path) {
      case "/rooms":
        if (!getCachedData(wsId, "rooms")) {
          getRooms().then(res => {
            if (res.success && res.data) setCachedData(wsId, "rooms", res.data)
          }).catch(() => {})
        }
        if (!getCachedData(wsId, "room_types")) {
          getRoomTypes().then(res => {
            if (res.success && res.data) setCachedData(wsId, "room_types", res.data)
          }).catch(() => {})
        }
        break
      case "/tenants":
        if (!getCachedData(wsId, "tenants")) {
          getTenants().then(res => {
            if (res.success && res.data) setCachedData(wsId, "tenants", res.data)
          }).catch(() => {})
        }
        if (!getCachedData(wsId, "rooms")) {
          getRooms().then(res => {
            if (res.success && res.data) setCachedData(wsId, "rooms", res.data)
          }).catch(() => {})
        }
        break
      case "/billing":
        if (!getCachedData(wsId, "bills_all")) {
          getBills().then(res => {
            if (res.success && res.data) setCachedData(wsId, "bills_all", res.data)
          }).catch(() => {})
        }
        break
      case "/daily-bills":
        if (!getCachedData(wsId, "expenses_2026")) {
          getExpenses("2026", wsId).then(res => {
            if (res.success && res.data) setCachedData(wsId, "expenses_2026", res.data)
          }).catch(() => {})
        }
        break
      case "/tax":
        if (!getCachedData(wsId, "expenses_2026")) {
          getExpenses("2026", wsId).then(res => {
            if (res.success && res.data) setCachedData(wsId, "expenses_2026", res.data)
          }).catch(() => {})
        }
        if (!getCachedData(wsId, "finance_settings")) {
          getFinanceSettings(wsId).then(res => {
            if (res.success && res.data) setCachedData(wsId, "finance_settings", res.data)
          }).catch(() => {})
        }
        if (!getCachedData(wsId, "bills_all")) {
          getBills().then(res => {
            if (res.success && res.data) setCachedData(wsId, "bills_all", res.data)
          }).catch(() => {})
        }
        break
      case "/finance-settings":
      case "/property-settings":
        if (!getCachedData(wsId, "finance_settings")) {
          getFinanceSettings(wsId).then(res => {
            if (res.success && res.data) setCachedData(wsId, "finance_settings", res.data)
          }).catch(() => {})
        }
        break
      case "/dashboard":
        if (!getCachedData(wsId, "rooms")) {
          getRooms().then(res => {
            if (res.success && res.data) setCachedData(wsId, "rooms", res.data)
          }).catch(() => {})
        }
        if (!getCachedData(wsId, "tenants")) {
          getTenants().then(res => {
            if (res.success && res.data) setCachedData(wsId, "tenants", res.data)
          }).catch(() => {})
        }
        if (!getCachedData(wsId, "bills_all")) {
          getBills().then(res => {
            if (res.success && res.data) setCachedData(wsId, "bills_all", res.data)
          }).catch(() => {})
        }
        break
      default:
        break
    }
  }

  // ระบบ Background Prefetching (RAM Preloader) เพื่อโหลดข้อมูลล่วงหน้าของหน้าหลักๆ ทั้งหมดมาไว้ใน RAM
  // ซึ่งจะเริ่มทำงานแบบอัสซิงโครนัส 1.5 วินาทีหลังจาก Workspace โหลดเสร็จ เพื่อไม่ให้กีดกันการแสดงผลแรกเริ่มของหน้าจอ
  useEffect(() => {
    if (!currentWorkspace.id || isDemo) return
    const wsId = currentWorkspace.id

    const prefetchEverything = async () => {
      try {
        // 1. โหลดข้อมูลห้องพัก & ประเภทห้องล่วงหน้า
        if (!getCachedData(wsId, "rooms")) {
          getRooms().then(res => {
            if (res.success && res.data) setCachedData(wsId, "rooms", res.data)
          }).catch(() => {})
        }
        if (!getCachedData(wsId, "room_types")) {
          getRoomTypes().then(res => {
            if (res.success && res.data) setCachedData(wsId, "room_types", res.data)
          }).catch(() => {})
        }

        // 2. โหลดข้อมูลสัญญาผู้เช่าล่วงหน้า
        if (!getCachedData(wsId, "tenants")) {
          getTenants().then(res => {
            if (res.success && res.data) setCachedData(wsId, "tenants", res.data)
          }).catch(() => {})
        }

        // 3. โหลดตั้งค่าการเงินล่วงหน้า
        if (!getCachedData(wsId, "finance_settings")) {
          getFinanceSettings(wsId).then(res => {
            if (res.success && res.data) setCachedData(wsId, "finance_settings", res.data)
          }).catch(() => {})
        }

        // 4. โหลดข้อมูลบิลทั้งหมดล่วงหน้า
        if (!getCachedData(wsId, "bills_all")) {
          getBills().then(res => {
            if (res.success && res.data) setCachedData(wsId, "bills_all", res.data)
          }).catch(() => {})
        }

        // 5. โหลดข้อมูลค่าใช้จ่ายล่วงหน้า
        if (!getCachedData(wsId, "expenses_2026")) {
          getExpenses("2026", wsId).then(res => {
            if (res.success && res.data) setCachedData(wsId, "expenses_2026", res.data)
          }).catch(() => {})
        }
      } catch (err) {
        console.error("Background prefetching failed:", err)
      }
    }

    const prefetchTimer = setTimeout(() => {
      prefetchEverything()
    }, 1500)

    return () => clearTimeout(prefetchTimer)
  }, [currentWorkspace.id, isDemo])

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
        const res = (await updateUserProfileAction({
          fullName: profileName,
          phone: profilePhone,
          password: profilePassword || undefined
        })) as any

        if (res.success) {
          setFullName(profileName)
          if (res.data) {
            setCachedUserProfile(res.data)
          } else {
            await getCurrentUserProfileClient(true)
          }
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
        setCookie(`horset_demo_profile_name_${userRole}`, profileName)
        setCookie(`horset_demo_profile_phone_${userRole}`, profilePhone)
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
    setCookie("horset_current_workspace_id", ws.id)
    // เก็บเป็นคุกกี้ด้วยเพื่อให้ server action อ่านได้สะดวก
    document.cookie = `horset_current_workspace_id=${ws.id}; path=/; max-age=86400`
    setCurrentWorkspace(ws)
    setShowDropdown(false)
    window.location.reload() // รีโหลดเพื่อรีเฟรชข้อมูลตารางทั้งหมดใน Workspace ใหม่
  }

  // เมนูนำทาง
  const menuItems = [
    {
      name: t("nav.dashboard") || "หน้าแรก ภาพรวมสถิติ",
      path: "/dashboard",
      icon: LayoutDashboard,
      roles: ["admin", "super_admin"]
    },
    {
      name: t("nav.rooms") || "จัดการห้องพัก และผู้เช่า",
      path: "/rooms",
      icon: Home,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: t("nav.billing") || "จดมิเตอร์ & จัดการบิล",
      path: "/billing",
      icon: Receipt,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: "จัดการบิล รายจ่ายรายวัน",
      path: "/daily-bills",
      icon: Coins,
      roles: ["admin", "super_admin"]
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
      name: t("nav.property_settings") || "ตั้งค่าหอพัก",
      path: "/property-settings",
      icon: Building,
      roles: ["admin", "super_admin"]
    },
    {
      name: "จัดการสิทธิ์ & Staff",
      path: "/permissions",
      icon: Users,
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

  const hasPermissionForPath = (path: string) => {
    // ถ้าโปรไฟล์ยังโหลดไม่เสร็จ ให้คืนค่า false สำหรับเมนูทั่วไป เพื่อป้องกันแถบเมนูกระพริบขึ้นมาทั้งหมดตอน Refresh
    if (!isProfileLoaded) {
      if (path === "#profile" || path === "/login") {
        return true
      }
      return false
    }

    // Super Admin เข้าได้หมดทุกอย่าง เฉพาะเมื่อได้รับอนุมัติสิทธิ์ Support ใน Workspace นั้นแล้ว เท่านั้น
    if (userRole === "super_admin") {
      if (supportStatus !== "approved") {
        return path === "/super-admin" || path === "#profile" || path === "/login"
      }
      return true
    }

    if (path === "/super-admin") {
      return false
    }

    if (path === "#profile" || path === "/login") {
      return true
    }

    // สำหรับบทบาทอื่นๆ ดึงสิทธิ์จาก userPermissions ที่แอดมินตั้งค่าไว้ใน DB JSONB
    if (!userPermissions) return false

    if (path === "/dashboard") {
      return !!userPermissions.view_dashboard_stats
    }
    if (path === "/rooms" || path === "/tenants") {
      return !!userPermissions.manage_rooms_tenants
    }
    if (path === "/billing" || path === "/meter") {
      return !!userPermissions.manage_meters_bills
    }
    if (path === "/daily-bills") {
      return !!userPermissions.manage_finance_expenses
    }
    if (path === "/tax") {
      return !!userPermissions.access_tax
    }
    if (path === "/finance-settings") {
      return !!userPermissions.manage_finance_settings
    }
    if (path === "/property-settings") {
      return !!userPermissions.manage_property_settings
    }
    if (path === "/permissions") {
      return !!userPermissions.manage_staff_permissions
    }
    if (path === "/test-connection") {
      return !!userPermissions.manage_staff_permissions
    }

    return false
  }

  const isPathAllowed = () => {
    if (!pathname) return true
    // หากโปรไฟล์ยังโหลดไม่เสร็จ ให้สิทธิ์ผ่านไปก่อน (เพื่อป้องกันการแสดงผล Access Denied กระพริบขึ้นมาก่อนโหลดเสร็จ)
    if (!isProfileLoaded) return true
    return hasPermissionForPath(pathname)
  }

  const filteredMenu = menuItems.filter(item => {
    // ตรวจสอบสิทธิ์ของเส้นทางนี้โดยดูจากคอลัมน์ permissions โดยตรง (ตัดการดูสิทธิ์จากบทบาท Role ออกไป)
    if (!hasPermissionForPath(item.path)) return false

    // หากเป็น Super Admin และไม่มีสิทธิ์ช่วยเหลือของ Workspace ปัจจุบัน ให้ซ่อนแท็บอื่นๆ ทั้งหมด ตลอดเวลา
    if (userRole === "super_admin" && supportStatus !== "approved") {
      const allowedPaths = ["/super-admin", "#profile"]
      if (!allowedPaths.includes(item.path)) {
        return false
      }
    }

    return true
  })

  const handleLogout = () => {
    clearCachedUserProfile()
    clearAllCache()
    document.cookie = "horset_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
    document.cookie = "horset_current_workspace_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
    router.push("/login")
  }

  return (
    <div className="h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
      
      <Sidebar
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        userRole={userRole}
        workspaceLoading={workspaceLoading}
        showDropdown={showDropdown}
        setShowDropdown={setShowDropdown}
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        handleSwitchWorkspace={handleSwitchWorkspace}
        supportStatus={supportStatus}
        handleRequestSupport={handleRequestSupport}
        handleExitSupport={handleExitSupport}
        filteredMenu={filteredMenu}
        pathname={pathname}
        safeNavigate={safeNavigate}
        handlePrefetchPage={handlePrefetchPage}
        fullName={fullName}
        isProfileLoaded={isProfileLoaded}
        isDemo={isDemo}
        handleLogout={handleLogout}
        t={t}
      />

      {/* พื้นที่เนื้อหาหลัก (Main Content Area) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden">
        
        {/* Header แถบด้านบน */}
        <header className="flex items-center justify-between px-3 py-3 md:px-6 md:py-4 glass-panel border-b border-slate-200/80 dark:border-slate-900/60 shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900/50"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="truncate max-w-[130px] sm:max-w-none">
                  {pathname === "/dashboard" && (t("nav.dashboard") || "หน้าแรกภาพรวมสถิติ")}
                  {pathname === "/rooms" && (t("nav.rooms") || "จัดการห้องพักและผู้เช่า")}
                  {pathname === "/billing" && (t("nav.billing") || "ระบบบันทึกจดมิเตอร์และจัดบิล")}
                  {pathname === "/meter" && (t("nav.billing") || "ระบบบันทึกจดมิเตอร์และจัดบิล")}
                  {pathname === "/daily-bills" && "จัดการบิลรายจ่ายรายวัน (40(5) / 40(8))"}
                  {pathname === "/tax" && (t("nav.tax") || "ระบบรายงานภาษีอพาร์ทเมนท์ ภ.ง.ด.")}
                  {pathname === "/finance-settings" && (t("nav.finance") || "ตั้งค่าการเงินและบัญชีรับเงิน")}
                  {pathname === "/property-settings" && (t("nav.property_settings") || "ตั้งค่าข้อมูลหอพัก")}
                  {pathname === "/test-connection" && (t("nav.test_connection") || "เช็คระบบตรวจสอบการเชื่อมต่อ Supabase")}
                </span>
                
                {userRole === "super_admin" && (
                  <span className="text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap shrink-0">
                    {t("dashboard.support_mode")}
                  </span>
                )}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* แสดงสถานะสิทธิ์เข้าช่วยเหลือสำหรับ Admin เพื่อความโปร่งใส */}
            {userRole === "admin" && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500">{t("dashboard.support_access")}</span>
                {supportStatus === "approved" ? (
                  <button
                    onClick={() => handleDecideSupport(false)}
                    className="text-[10px] bg-teal-500/10 border border-teal-500/20 hover:bg-red-500/10 hover:border-red-500/20 text-teal-600 dark:text-teal-400 hover:text-red-600 dark:hover:text-red-400 font-bold px-2.5 py-0.5 rounded-lg transition-colors flex items-center gap-1"
                    title="คลิกเพื่อสั่งระงับสิทธิ์ชั่วคราว"
                  >
                    <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse" />
                    {t("dashboard.authorized_revoke")}
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-lg">
                    {t("dashboard.access_revoked")}
                  </span>
                )}
              </div>
            )}

            <LanguageToggle />
            <ThemeToggle />

            <button className="relative p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors">
              <BellRing className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
            </button>
            
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-900" />
            
            <div className="text-right hidden sm:block">
              {workspaceLoading && !isDemo ? (
                <div className="flex items-center gap-1.5 justify-end h-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-xs text-slate-500 animate-pulse font-medium">กำลังโหลดหอพัก...</span>
                </div>
              ) : (
                <p className="text-xs font-bold text-slate-800 dark:text-slate-300">
                  {t("dashboard.building")} {currentWorkspace.name || "กำลังโหลด..."}
                </p>
              )}
              <p className="text-[10px] text-slate-500">{t("dashboard.current_cycle")}</p>
            </div>
          </div>
        </header>

        {/* ตัวเนื้อหาภายในหน้าเว็บ (Page Content Injection) */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6 overflow-x-hidden">
          {isPathAllowed() ? (
            children
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
              <div className="glass-panel p-8 sm:p-12 rounded-3xl max-w-md border border-red-500/20 shadow-xl relative overflow-hidden bg-white/60 dark:bg-slate-950/60 backdrop-blur-xl">
                {/* Glowing red accent */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
                
                <div className="mx-auto w-16 h-16 bg-red-500/10 dark:bg-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mb-6 animate-pulse">
                  <Lock className="w-8 h-8" />
                </div>
                
                <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 mb-3">
                  คุณไม่มีสิทธิ์เข้าถึงหน้านี้
                </h2>
                
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                  สิทธิ์การใช้งานของพนักงาน (Staff) ของคุณถูกกำหนดไม่ให้เข้าถึงเมนูนี้ กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การเข้าใช้งาน
                </p>

                <div className="space-y-3">
                  {userPermissions?.manage_meters_bills && (
                    <button
                      onClick={() => safeNavigate("/billing")}
                      className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0"
                    >
                      ไปยังหน้าจดมิเตอร์ & จัดการบิล
                    </button>
                  )}
                  {userPermissions?.manage_rooms_tenants && (
                    <button
                      onClick={() => safeNavigate("/rooms")}
                      className="w-full py-3 px-4 bg-gradient-to-r from-slate-600 to-slate-800 hover:from-slate-500 hover:to-slate-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-500/20 transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0"
                    >
                      ไปยังหน้าจัดการห้องพักและผู้เช่า
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full py-2.5 px-4 text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-colors text-xs font-bold"
                  >
                    ออกจากระบบ (Logout)
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================== */}
      {/* POP-UP MODAL สำหรับ ADMIN กดยืนยันให้สิทธิ์เข้าถึง */}
      {/* ========================================== */}
      <SupportModal
        isOpen={showSupportModal}
        workspaceName={currentWorkspace.name}
        onDecide={handleDecideSupport}
      />

       {/* ========================================== */}
      {/* POP-UP MODAL สำหรับแก้ไขโปรไฟล์และเปลี่ยนรหัสผ่าน */}
      {/* ========================================== */}
      <ProfileModal
        isOpen={showProfileModal}
        isDark={isDark}
        profileLoading={profileLoading}
        onClose={() => setShowProfileModal(false)}
        profileName={profileName}
        setProfileName={setProfileName}
        profilePhone={profilePhone}
        setProfilePhone={setProfilePhone}
        profilePassword={profilePassword}
        setProfilePassword={setProfilePassword}
        profileConfirmPassword={profileConfirmPassword}
        setProfileConfirmPassword={setProfileConfirmPassword}
        profileError={profileError}
        profileSuccess={profileSuccess}
        onSubmit={handleUpdateProfileSubmit}
      />

    

    </div>
  )
}
