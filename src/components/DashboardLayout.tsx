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
  Scroll,
  Settings,
  CheckCheck,
  Trash2,
  AlertTriangle
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
import PullToRefresh from "./PullToRefresh"
import { getNotificationsAction, type AppNotification } from "@/features/notification/actions"


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
  const [desktopOpen, setDesktopOpen] = useState(true)

  // โหลดพฤติกรรมการย่อขยายแถบเมนูในเครื่องผู้ใช้จาก localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("horset_desktop_sidebar_open")
      if (saved !== null) {
        setDesktopOpen(saved === "true")
      }
    }
  }, [])

  // ซิงค์ชื่อโปรไฟล์แถบเมนู/หัวกระดาษเมื่อมีการแก้ไขใน ProfileTab
  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      if (e.detail?.name) {
        setFullName(e.detail.name)
      }
    }
    window.addEventListener("profile-updated", handleProfileUpdate)
    return () => window.removeEventListener("profile-updated", handleProfileUpdate)
  }, [])


  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    setTouchStart({ x: touch.clientX, y: touch.clientY })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return
    const touch = e.touches[0]
    const diffX = touch.clientX - touchStart.x
    const diffY = touch.clientY - touchStart.y

    // ตรวจจับพฤติกรรมการปัดแนวขนาน (Horizontal Swipe) เป็นหลัก
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 70) {
      if (diffX > 0) {
        // Swipe ปัดซ้ายไปขวา: แสดง Sidebar (ตรวจเฉพาะเมื่อสไลด์จากขอบซ้ายจอมา เพื่อความลื่นไหลเป็นธรรมชาติ)
        if (touchStart.x < 100) {
          if (typeof window !== "undefined") {
            if (window.innerWidth < 768) {
              setMobileOpen(true)
            } else {
              setDesktopOpen(true)
              localStorage.setItem("horset_desktop_sidebar_open", "true")
            }
          }
        }
      } else {
        // Swipe ปัดขวาไปซ้าย: ซ่อน Sidebar
        if (typeof window !== "undefined") {
          if (window.innerWidth < 768) {
            if (mobileOpen) setMobileOpen(false)
          } else {
            if (desktopOpen) {
              setDesktopOpen(false)
              localStorage.setItem("horset_desktop_sidebar_open", "false")
            }
          }
        }
      }
      setTouchStart(null)
    }
  }

  const handleTouchEnd = () => {
    setTouchStart(null)
  }

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

  // ==========================================
  // ระบบการแจ้งเตือน (Notifications System)
  // ==========================================
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [readNotifications, setReadNotifications] = useState<string[]>([])
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "billing" | "system">("all")

  const fetchNotifications = async (silent = false) => {
    if (isDemo) {
      setNotifications([
        {
          id: "slip_demo_1",
          type: "slip",
          title: "มีสลิปโอนเงินใหม่",
          message: "ห้อง 102 ได้อัปโหลดสลิปสำหรับรอบบิล 2026-06 แล้ว กรุณาตรวจสอบความถูกต้อง",
          link: "/billing",
          timestamp: Date.now() - 1000 * 60 * 15,
          roomNumber: "102"
        },
        {
          id: "overdue_demo_2",
          type: "overdue",
          title: "บิลค้างชำระเกินกำหนด",
          message: "ห้อง 304 ค้างชำระค่าเช่ารอบ 2026-05 เกินกำหนดส่งมาแล้ว 24 วัน",
          link: "/billing",
          timestamp: Date.now() - 1000 * 60 * 60 * 3,
          roomNumber: "304"
        },
        {
          id: "line_oa_disconnected",
          type: "line_oa",
          title: "การเชื่อมต่อ LINE OA ขัดข้อง",
          message: "หอพักนี้ยังไม่ได้เชื่อมต่อหรือเปิดใช้งานโทเค็น LINE Messaging API กรุณาเข้าไปตั้งค่ารหัสสิทธิ์เพื่อให้ผู้เช่ารับข้อความบิลแจ้งเตือนได้",
          link: "/settings",
          timestamp: Date.now() - 1000 * 60 * 60 * 24
        }
      ])
      return
    }

    if (!silent) setNotificationsLoading(true)
    try {
      const res = await getNotificationsAction()
      if (res.success && res.data) {
        setNotifications(res.data)
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err)
    } finally {
      if (!silent) setNotificationsLoading(false)
    }
  }

  // โหลดรายการแจ้งเตือนที่อ่านแล้วจาก localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedRead = localStorage.getItem("horset_read_notifications")
      if (savedRead) {
        try {
          setReadNotifications(JSON.parse(savedRead))
        } catch (e) {
          console.error(e)
        }
      }
    }
  }, [])

  // โหลดรายการที่ละเว้นและเปิดระบบอัปเดตแจ้งเตือนเรียลไทม์ (Polling ทุก 15 วิ + Focus Sync) เมื่อเปลี่ยน Workspace
  useEffect(() => {
    if (typeof window !== "undefined" && currentWorkspace.id) {
      const savedDismissed = localStorage.getItem(`horset_dismissed_notifications_${currentWorkspace.id}`)
      if (savedDismissed) {
        try {
          setDismissedIds(JSON.parse(savedDismissed))
        } catch (e) {
          console.error(e)
        }
      } else {
        setDismissedIds([])
      }

      // ดึงข้อมูลแจ้งเตือนทันที
      fetchNotifications(false)

      // ตั้งเวลา Polling ดึงข้อมูลใหม่ทุกๆ 15 วินาทีเพื่ออัปเดตแจ้งเตือนทันทีโดยไม่ต้องกดรีเฟรช (ทำงานเงียบๆ ในพื้นหลัง)
      const intervalId = setInterval(() => {
        fetchNotifications(true)
      }, 15000)

      // ดึงข้อมูลทันทีเมื่อเปิดแท็บหรือหน้าจอเบราว์เซอร์กลับมาโฟกัสอีกครั้ง (ทำงานเงียบๆ ในพื้นหลัง)
      const handleWindowFocus = () => {
        fetchNotifications(true)
      }
      window.addEventListener("focus", handleWindowFocus)

      return () => {
        clearInterval(intervalId)
        window.removeEventListener("focus", handleWindowFocus)
      }
    }
  }, [currentWorkspace.id])

  // คลิกข้างนอกเพื่อปิดดรอปดาวน์แจ้งเตือน
  useEffect(() => {
    if (!isNotificationsOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest("#notifications-wrapper")) {
        setIsNotificationsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isNotificationsOpen])

  const markAsRead = (id: string) => {
    const updated = [...readNotifications]
    if (!updated.includes(id)) {
      updated.push(id)
      setReadNotifications(updated)
      localStorage.setItem("horset_read_notifications", JSON.stringify(updated))
    }
  }

  const markAllAsRead = () => {
    const updated = [...readNotifications]
    notifications.forEach(n => {
      if (!updated.includes(n.id)) {
        updated.push(n.id)
      }
    })
    setReadNotifications(updated)
    localStorage.setItem("horset_read_notifications", JSON.stringify(updated))
  }

  const dismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = [...dismissedIds, id]
    setDismissedIds(updated)
    localStorage.setItem(`horset_dismissed_notifications_${currentWorkspace.id}`, JSON.stringify(updated))
  }

  const formatNotificationTime = (timestamp: number) => {
    const diff = Date.now() - timestamp
    if (diff < 60000) return "เมื่อสักครู่"
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins} นาทีที่แล้ว`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} วันที่แล้ว`
    return new Date(timestamp).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit"
    })
  }

  const activeNotifications = notifications.filter(n => !dismissedIds.includes(n.id))
  const unreadCount = activeNotifications.filter(n => !readNotifications.includes(n.id)).length

  const filteredNotifications = activeNotifications.filter(n => {
    if (activeTab === "all") return true
    if (activeTab === "billing") return n.type === "slip" || n.type === "overdue"
    if (activeTab === "system") return n.type === "line_oa" || n.type === "lease"
    return true
  })

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
        if (!getCachedData(wsId, "bills_year_2026")) {
          getBills(undefined, "2026").then(res => {
            if (res.success && res.data) setCachedData(wsId, "bills_year_2026", res.data)
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
        if (!getCachedData(wsId, "bills_year_2026")) {
          getBills(undefined, "2026").then(res => {
            if (res.success && res.data) setCachedData(wsId, "bills_year_2026", res.data)
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
        if (!getCachedData(wsId, "bills_year_2026")) {
          getBills(undefined, "2026").then(res => {
            if (res.success && res.data) setCachedData(wsId, "bills_year_2026", res.data)
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
        if (!getCachedData(wsId, "bills_year_2026")) {
          getBills(undefined, "2026").then(res => {
            if (res.success && res.data) setCachedData(wsId, "bills_year_2026", res.data)
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
      name: t("nav.dashboard") || "Dashboard",
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
      name: t("nav.tenants") || "จัดการสัญญา ผู้เช่า",
      path: "/tenants",
      icon: Users,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: "จดมิเตอร์ และดูบิล",
      path: "/billing",
      icon: Scroll,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: "จัดการใบแจ้งหนี้",
      path: "/manage-bills",
      icon: Receipt,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: "บันทึกบิลค่าใช้จ่าย",
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
      name: "ตั้งค่าระบบ",
      path: "/settings",
      icon: Settings,
      roles: ["admin", "staff", "super_admin"]
    },
    {
      name: t("nav.super_admin") || "แผงควบคุม Super Admin",
      path: "/super-admin",
      icon: ShieldCheck,
      roles: ["super_admin"]
    }
  ]

  const hasPermissionForPath = (path: string) => {
    // ถ้าโปรไฟล์ยังโหลดไม่เสร็จ ให้คืนค่า false สำหรับเมนูทั่วไป เพื่อป้องกันแถบเมนูกระพริบขึ้นมาทั้งหมดตอน Refresh
    if (!isProfileLoaded) {
      if (path === "#profile" || path === "/login" || path === "/settings" || path.startsWith("/settings")) {
        return true
      }
      return false
    }

    // Super Admin เข้าได้หมดทุกอย่าง เฉพาะเมื่อได้รับอนุมัติสิทธิ์ Support ใน Workspace นั้นแล้ว เท่านั้น
    if (userRole === "super_admin") {
      if (supportStatus !== "approved") {
        return path === "/super-admin" || path === "#profile" || path === "/login" || path === "/settings" || path.startsWith("/settings")
      }
      return true
    }

    if (path === "/super-admin") {
      return false
    }

    if (path === "#profile" || path === "/login" || path === "/settings" || path.startsWith("/settings")) {
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
    if (path === "/manage-bills") {
      return !!userPermissions.manage_bills
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
    <div 
      className="h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      
      <Sidebar
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        desktopOpen={desktopOpen}
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
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden touch-pan-y overscroll-x-none">
        
        {/* Header แถบด้านบน */}
        <header className="relative z-30 flex items-center justify-between px-3 py-3 md:px-6 md:py-4 glass-panel border-b border-slate-200/80 dark:border-slate-900/60 shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  setMobileOpen(true)
                } else {
                  const newVal = !desktopOpen
                  setDesktopOpen(newVal)
                  localStorage.setItem("horset_desktop_sidebar_open", String(newVal))
                }
              }}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="truncate max-w-[130px] sm:max-w-none">
                  {pathname === "/dashboard" && (t("nav.dashboard") || "Dashboard")}
                  {pathname === "/rooms" && (t("nav.rooms") || "จัดการห้องพักและผู้เช่า")}
                  {pathname === "/billing" && "จดมิเตอร์ และดูบิล"}
                  {pathname === "/meter" && "จดมิเตอร์ และดูบิล"}
                  {pathname === "/manage-bills" && "จัดการใบแจ้งหนี้"}
                  {pathname === "/daily-bills" && "บันทึกบิลค่าใช้จ่าย (40(5) / 40(8))"}
                  {pathname === "/tax" && (t("nav.tax") || "ระบบรายงานภาษีอพาร์ทเมนท์ ภ.ง.ด.")}
                  {pathname === "/finance-settings" && (t("nav.finance") || "ตั้งค่าการเงินและบัญชีรับเงิน")}
                  {pathname === "/property-settings" && (t("nav.property_settings") || "ตั้งค่าข้อมูลหอพัก")}
                  {pathname === "/test-connection" && (t("nav.test_connection") || "เช็คระบบตรวจสอบการเชื่อมต่อ Supabase")}
                  {pathname && pathname.startsWith("/settings") && "ตั้งค่าระบบ"}
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

            {/* Notifications Dropdown */}
            <div id="notifications-wrapper" className="relative">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="relative p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-all duration-200 active:scale-95 cursor-pointer"
                aria-label="การแจ้งเตือน"
              >
                <BellRing className={`w-4 h-4 ${unreadCount > 0 ? "animate-bounce" : ""}`} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse shadow-md shadow-red-500/20">
                    {unreadCount}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="fixed inset-x-3 top-[68px] md:absolute md:inset-x-auto md:right-0 md:top-auto md:mt-2 w-auto md:w-[385px] max-h-[calc(100vh-100px)] md:max-h-[500px] overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl shadow-2xl z-50 transition-all duration-300 transform scale-100 origin-top-right flex flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-900/80 bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-xs text-slate-800 dark:text-slate-200">การแจ้งเตือน</h2>
                      {unreadCount > 0 && (
                        <span className="bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          ใหม่ {unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {activeNotifications.length > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="p-1 px-2 text-[10px] text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg flex items-center gap-1 transition-all font-semibold cursor-pointer"
                          title="อ่านทั้งหมด"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span>อ่านทั้งหมด</span>
                        </button>
                      )}
                      <button
                        onClick={() => setIsNotificationsOpen(false)}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 p-2 bg-slate-50/30 dark:bg-slate-900/10 border-b border-slate-100 dark:border-slate-900/60">
                    {[
                      { id: "all", label: "ทั้งหมด" },
                      { id: "billing", label: "บิล/เงินโอน" },
                      { id: "system", label: "ผู้เช่า/ระบบ" }
                    ].map(tab => {
                      const isActive = activeTab === tab.id
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as any)}
                          className={`flex-1 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 cursor-pointer ${
                            isActive
                              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/10"
                              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-900/40"
                          }`}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Notification List */}
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-900/60 custom-scrollbar">
                    {notificationsLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                        <span className="text-[11px] text-slate-500">กำลังโหลดการแจ้งเตือน...</span>
                      </div>
                    ) : filteredNotifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                        <div className="w-10 h-12 bg-slate-100 dark:bg-slate-900 rounded-xl flex items-center justify-center mb-2.5">
                          <BellRing className="w-4 h-4 text-slate-400" />
                        </div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">ไม่มีการแจ้งเตือนใหม่</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">เมื่อมีความเคลื่อนไหวของหอพัก ระบบจะแจ้งคุณที่นี่</p>
                      </div>
                    ) : (
                      filteredNotifications.map(notification => {
                        const isUnread = !readNotifications.includes(notification.id)
                        
                        let IconComponent = AlertCircle
                        let iconColorClass = ""
                        let bgColorClass = ""
                        let borderLeftClass = ""

                        if (notification.type === "slip") {
                          IconComponent = Scroll
                          iconColorClass = "text-emerald-500"
                          bgColorClass = "bg-emerald-500/10 dark:bg-emerald-500/20"
                          borderLeftClass = "border-l-4 border-l-emerald-500"
                        } else if (notification.type === "overdue") {
                          IconComponent = AlertTriangle
                          iconColorClass = "text-rose-500"
                          bgColorClass = "bg-rose-500/10 dark:bg-rose-500/20"
                          borderLeftClass = "border-l-4 border-l-rose-500"
                        } else if (notification.type === "line_oa") {
                          IconComponent = Settings
                          iconColorClass = "text-amber-500"
                          bgColorClass = "bg-amber-500/10 dark:bg-amber-500/20"
                          borderLeftClass = "border-l-4 border-l-amber-500"
                        } else if (notification.type === "lease") {
                          IconComponent = Users
                          iconColorClass = "text-blue-500"
                          bgColorClass = "bg-blue-500/10 dark:bg-blue-500/20"
                          borderLeftClass = "border-l-4 border-l-blue-500"
                        }

                        return (
                          <div
                            key={notification.id}
                            onClick={() => {
                              markAsRead(notification.id)
                              setIsNotificationsOpen(false)
                              safeNavigate(notification.link)
                            }}
                            className={`flex gap-2.5 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-all cursor-pointer relative group items-start ${borderLeftClass} ${
                              isUnread ? "bg-indigo-50/20 dark:bg-indigo-500/5" : ""
                            }`}
                          >
                            <div className={`p-1.5 rounded-lg shrink-0 ${bgColorClass} mt-0.5`}>
                              <IconComponent className={`w-3.5 h-3.5 ${iconColorClass}`} />
                            </div>
                            
                            <div className="flex-1 min-w-0 pr-4">
                              <div className="flex items-baseline justify-between gap-1">
                                <p className={`text-[11px] font-bold truncate ${isUnread ? "text-slate-800 dark:text-slate-200" : "text-slate-600 dark:text-slate-400"}`}>
                                  {notification.title}
                                </p>
                                <span className="text-[9px] text-slate-400 whitespace-nowrap">
                                  {formatNotificationTime(notification.timestamp)}
                                </span>
                              </div>
                              <p className={`text-[10px] mt-0.5 leading-normal ${isUnread ? "text-slate-600 dark:text-slate-300 font-medium" : "text-slate-500 dark:text-slate-400"}`}>
                                {notification.message}
                              </p>
                            </div>

                            {/* Unread indicator dot */}
                            {isUnread && (
                              <span className="absolute top-3.5 right-3 w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                            )}

                            {/* Dismiss button on hover */}
                            <button
                              onClick={(e) => dismissNotification(notification.id, e)}
                              className="absolute bottom-1 right-2 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 rounded transition-all duration-200 cursor-pointer"
                              title="ละเว้นแจ้งเตือน"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                  
                  {/* Footer */}
                  <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-900/60 bg-slate-50/30 dark:bg-slate-900/10 flex justify-between items-center text-[9px] text-slate-400">
                    <span>อัปเดตเรียลไทม์</span>
                    <button
                      onClick={() => fetchNotifications(false)}
                      className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold cursor-pointer"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${notificationsLoading ? "animate-spin" : ""}`} />
                      โหลดใหม่
                    </button>
                  </div>
                </div>
              )}
            </div>
            
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
        <main className={`flex-1 p-4 sm:p-6 md:p-8 ${(pathname === "/rooms" || pathname === "/settings" || pathname?.startsWith("/settings")) ? "max-w-none" : "max-w-7xl"} w-full mx-auto space-y-6 overflow-x-hidden touch-pan-y overscroll-x-none`}>
          <div className="w-full max-w-full overflow-hidden">
            <PullToRefresh>
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
            </PullToRefresh>
          </div>
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



    

    </div>
  )
}
