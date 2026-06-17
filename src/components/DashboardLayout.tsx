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
import { getCurrentUserProfileClient, setCachedUserProfile, clearCachedUserProfile } from "@/features/auth/client"
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
  const isDark = mounted ? resolvedTheme === "dark" : false

  // ดึงบทบาทจริงจากคุกกี้ หรือใช้ค่า prop เป็นค่าเริ่มต้น
  const [userRole, setUserRole] = useState<"admin" | "staff" | "super_admin">(role)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace>({
    id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
    name: ""
  })
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  
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
  const [isProfileLoaded, setIsProfileLoaded] = useState(false)
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
      let currentRole = mockRole || role
      let profileWsId: string | null = null

      if (!isDemo) {
        try {
          const profileRes = await getCurrentUserProfileClient()
          if (profileRes.success && profileRes.data) {
            profileWsId = profileRes.data.workspace_id || null
            if (profileRes.data.role) {
              currentRole = profileRes.data.role
              setUserRole(profileRes.data.role as any)
            }
          }
        } catch (e) {
          console.error("Error loading user profile in DashboardLayout:", e)
        }
      }

      // ถ้าไม่ใช่ Super Admin และมี profileWsId ให้ใช้ของ Profile เสมอ
      if (currentRole !== "super_admin" && profileWsId) {
        activeWsId = profileWsId
        setCookie("horset_current_workspace_id", activeWsId)
      } else {
        // สำหรับ Super Admin หรือโหมด Demo ให้ใช้จากคุกกี้
        const savedWsId = getCookie("horset_current_workspace_id")
        if (savedWsId) {
          activeWsId = savedWsId
        } else {
          setCookie("horset_current_workspace_id", activeWsId)
        }
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
              setCookie("horset_current_workspace_id", activeWsId)
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
            if (grantData.status === "pending" && currentRole === "admin") {
              setShowSupportModal(true)
            }
          } else {
            setSupportStatus("none")
          }
        } catch (err) {
          console.error("Supabase load error, fallback to cookie/mock", err)
          fallbackMock(activeWsId)
        } finally {
          setWorkspaceLoading(false)
        }
      } else {
        fallbackMock(activeWsId)
        setWorkspaceLoading(false)
      }
    }

    const fallbackMock = (activeWsId: string) => {
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
      
      // ดึงสถานะ Support จาก cookie
      const savedStatus = getCookie(`horset_support_status_${activeWsId}`) || "none"
      setSupportStatus(savedStatus)
      
      if (savedStatus === "pending" && (mockRole || role) === "admin") {
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
          const res = await getCurrentUserProfileClient()
          if (res.success && res.data) {
            setFullName(res.data.full_name || res.data.email || "ผู้ดูแลระบบ")
            setProfileName(res.data.full_name || "")
            setProfilePhone(res.data.phone || "")
          }
        } catch (err) {
          console.error("Error loading user profile:", err)
        } finally {
          setIsProfileLoaded(true)
        }
      } else {
        const savedName = getCookie(`horset_demo_profile_name_${userRole}`)
        const savedPhone = getCookie(`horset_demo_profile_phone_${userRole}`)
        
        const defaultName = userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย"
        const defaultPhone = "089-999-9999"

        setFullName(savedName || defaultName)
        setProfileName(savedName || defaultName)
        setProfilePhone(savedPhone || defaultPhone)
        setIsProfileLoaded(true)
      }
    }
    loadUserProfile()
  }, [userRole, isDemo])

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
      setCookie(`horset_support_status_${currentWorkspace.id}`, "pending")
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
      setCookie(`horset_support_status_${currentWorkspace.id}`, nextStatus)
      setSupportStatus(nextStatus)
      setShowSupportModal(false)
    }
  }

  // ฟังก์ชันออกจากระบบ Workspace และยกเลิกสิทธิ์ช่วยเหลือ (สำหรับ Super Admin)
  const handleExitSupport = async () => {
    if (!confirm("คุณต้องการออกจากระบบและยกเลิกสิทธิ์เข้าช่วยเหลือสำหรับ Workspace นี้ใช่หรือไม่?")) {
      return
    }
    if (!isDemo) {
      try {
        const supabase = createClient()
        const { error } = await supabase
          .from("support_access_grants")
          .delete()
          .eq("workspace_id", currentWorkspace.id)

        if (!error) {
          setSupportStatus("none")
          router.push("/super-admin")
        } else {
          alert("เกิดข้อผิดพลาด: " + error.message)
        }
      } catch (err) {
        console.error(err)
      }
    } else {
      setCookie(`horset_support_status_${currentWorkspace.id}`, "none")
      setSupportStatus("none")
      router.push("/super-admin")
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
      name: "จัดการบิลรายจ่ายรายวัน",
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

  const filteredMenu = menuItems.filter(item => {
    // กรองตามสิทธิ์ปกติก่อน
    if (!item.roles.includes(userRole)) return false

    // หากเป็น Super Admin และไม่มีสิทธิ์ช่วยเหลือของ Workspace ปัจจุบัน ให้ซ่อนแท็บเกี่ยวกับตัวข้อมูลหอพัก/ผู้เช่า/บิล/ภาษี/การเงิน
    if (userRole === "super_admin" && supportStatus !== "approved") {
      const hiddenPaths = [
        "/dashboard",
        "/rooms",
        "/tenants",
        "/billing",
        "/daily-bills",
        "/tax",
        "/finance-settings"
      ]
      if (hiddenPaths.includes(item.path)) {
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
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      
      {/* Sidebar สำหรับหน้าจอขนาดใหญ่ (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 glass-panel border-r border-slate-200/80 dark:border-slate-900/60 p-6 z-20 shrink-0">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl shadow-lg shadow-blue-500/10">
            <Building className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-1">
              {t("common.app_name")}
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("dashboard.system_subtitle")}</p>
          </div>
        </div>

        {/* ส่วนจัดการ Workspace สำหรับ Super Admin */}
        {userRole === "super_admin" && (
          <div className="mb-6 p-4 rounded-2xl bg-slate-100 dark:bg-gradient-to-tr dark:from-slate-950 dark:to-slate-900 border border-slate-200 dark:border-slate-800 relative">
            <label className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block mb-1.5 uppercase tracking-wider">{t("dashboard.select_workspace")}</label>
            
            <button
              onClick={() => !workspaceLoading && setShowDropdown(!showDropdown)}
              disabled={workspaceLoading}
              className={`w-full flex items-center justify-between text-xs font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 transition-all ${
                workspaceLoading ? 'opacity-75 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {workspaceLoading && !isDemo ? (
                <span className="truncate max-w-[140px] flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  กำลังโหลด...
                </span>
              ) : (
                <span className="truncate max-w-[140px]">{currentWorkspace.name || "กำลังโหลด..."}</span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showDropdown && (
              <div className="absolute left-0 right-0 mt-2 mx-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-30 p-1.5 space-y-1">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSwitchWorkspace(ws)}
                    className={`w-full text-left text-xs py-2 px-3 rounded-lg transition-colors ${
                      currentWorkspace.id === ws.id
                        ? "bg-blue-600 text-white font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200"
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
                  className="w-full mt-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-[10px] text-left transition-colors shadow-lg shadow-blue-600/10"
                >
                  {t("dashboard.request_support")}
                </button>
              )}

              {supportStatus === "pending" && (
                <div className="text-[9px] text-slate-500 text-left px-1 mt-1">
                  {t("dashboard.awaiting_admin_approval")}
                </div>
              )}

              {supportStatus === "approved" && (
                <button
                  onClick={handleExitSupport}
                  className="w-full mt-1.5 py-2 px-4 bg-red-600/90 hover:bg-red-500 text-white font-medium rounded-lg text-[10px] text-left transition-colors shadow-lg shadow-red-600/10 flex items-center justify-between"
                >
                  <span>ออกจาก Workspace นี้</span>
                  <LogOut className="w-3.5 h-3.5" />
                </button>
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
                    safeNavigate(item.path)
                  }
                }}
                onMouseEnter={() => handlePrefetchPage(item.path)}
                onTouchStart={() => handlePrefetchPage(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/50 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                {item.name}
              </button>
            )
          })}
        </nav>

        {/* ข้อมูลโปรไฟล์ด้านล่าง */}
        <div className="pt-6 border-t border-slate-200 dark:border-slate-900 space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-inner">
                <User className="w-5 h-5 text-slate-500 dark:text-slate-300" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[100px] flex items-center min-h-[16px]" title={fullName}>
                  {!isProfileLoaded && !isDemo ? (
                    <span className="inline-block bg-slate-200 dark:bg-slate-800 rounded w-16 h-3 animate-pulse" />
                  ) : (
                    fullName || (userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย")
                  )}
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
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium text-left text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
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
              <div className="mb-6 p-4 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900">
                <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block mb-1.5 uppercase">{t("dashboard.select_workspace")}</label>
                <button
                  onClick={() => !workspaceLoading && setShowDropdown(!showDropdown)}
                  disabled={workspaceLoading}
                  className={`w-full flex items-center justify-between text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 transition-all ${
                    workspaceLoading ? 'opacity-75 cursor-not-allowed' : ''
                  }`}
                >
                  {workspaceLoading && !isDemo ? (
                    <span className="truncate flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      กำลังโหลด...
                    </span>
                  ) : (
                    <span className="truncate">{currentWorkspace.name || "กำลังโหลด..."}</span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {showDropdown && (
                  <div className="absolute left-0 right-0 mt-2 mx-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 space-y-1 z-30">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => handleSwitchWorkspace(ws)}
                        className={`w-full text-left text-xs py-2 px-3 rounded-lg ${
                          currentWorkspace.id === ws.id ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                        }`}
                      >
                        {ws.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* แสดงสถานะ Support Permission ของ Workspace ปัจจุบัน ในมือถือ */}
                <div className="mt-3 pt-2.5 border-t border-slate-900 flex flex-col gap-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t("dashboard.support_access") || "สิทธิ์การช่วยเหลือ"}</span>
                    {supportStatus === "approved" && (
                      <span className="text-teal-400 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> {t("dashboard.approved") || "ได้รับสิทธิ์"}
                      </span>
                    )}
                    {supportStatus === "pending" && (
                      <span className="text-amber-400 font-semibold animate-pulse flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> {t("dashboard.pending") || "กำลังรอ"}
                      </span>
                    )}
                    {(supportStatus === "revoked" || supportStatus === "none") && (
                      <span className="text-red-400 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {t("dashboard.no_access") || "ไม่มีสิทธิ์"}
                      </span>
                    )}
                  </div>

                  {(supportStatus === "none" || supportStatus === "revoked") && (
                    <button
                      onClick={handleRequestSupport}
                      className="w-full mt-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-[10px] text-left transition-colors shadow-lg shadow-blue-600/10"
                    >
                      {t("dashboard.request_support") || "ส่งคำขอเข้าช่วยเหลือระบบ"}
                    </button>
                  )}

                  {supportStatus === "pending" && (
                    <div className="text-[9px] text-slate-500 text-left px-1 mt-1">
                      {t("dashboard.awaiting_admin_approval") || "รอดำเนินการอนุมัติสิทธิ์"}
                    </div>
                  )}

                  {supportStatus === "approved" && (
                    <button
                      onClick={handleExitSupport}
                      className="w-full mt-1.5 py-2 px-4 bg-red-600/90 hover:bg-red-500 text-white font-medium rounded-lg text-[10px] text-left transition-colors shadow-lg shadow-red-600/10 flex items-center justify-between"
                    >
                      <span>ออกจาก Workspace นี้</span>
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
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
                        safeNavigate(item.path)
                      }
                      setMobileOpen(false)
                    }}
                    onMouseEnter={() => handlePrefetchPage(item.path)}
                    onTouchStart={() => handlePrefetchPage(item.path)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/50 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </button>
                )
              })}
            </nav>

            <div className="pt-6 border-t border-slate-200 dark:border-slate-900 space-y-4">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[100px] flex items-center min-h-[16px]" title={fullName}>
                      {!isProfileLoaded && !isDemo ? (
                        <span className="inline-block bg-slate-200 dark:bg-slate-800 rounded w-16 h-3 animate-pulse" />
                      ) : (
                        fullName || (userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย")
                      )}
                    </h4>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">{userRole}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-left text-red-400"
              >
                <LogOut className="w-4 h-4" />
                {t("common.logout") || "ออกจากระบบ"}
              </button>
            </div>
          </aside>
        </div>
      )}

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
                  {pathname === "/rooms" && (t("nav.rooms") || "ระบบจัดการห้องพัก")}
                  {pathname === "/tenants" && (t("nav.tenants") || "ระบบจัดการข้อมูลสัญญาผู้เช่า")}
                  {pathname === "/billing" && (t("nav.billing") || "ระบบบันทึกจดมิเตอร์และจัดบิล")}
                  {pathname === "/meter" && (t("nav.billing") || "ระบบบันทึกจดมิเตอร์และจัดบิล")}
                  {pathname === "/daily-bills" && "จัดการบิลรายจ่ายรายวัน (40(5) / 40(8))"}
                  {pathname === "/tax" && (t("nav.tax") || "ระบบรายงานภาษีอพาร์ทเมนท์ ภ.ง.ด.")}
                  {pathname === "/finance-settings" && (t("nav.finance") || "ตั้งค่าการเงินและบัญชีรับเงิน")}
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
          {/* Backdrop ล้ำสมัย ละมุนหรูหรา */}
          <div 
            className="absolute inset-0 bg-slate-900/30 dark:bg-slate-950/75 backdrop-blur-md transition-all duration-300"
            onClick={() => !profileLoading && setShowProfileModal(false)} 
          />
          
          <div className={`relative w-full max-w-md p-8 rounded-3xl border shadow-2xl animate-scale-up transition-colors duration-300 ${
            isDark 
              ? "bg-slate-900/98 border-slate-800/80 shadow-slate-950/80" 
              : "bg-white/98 border-slate-100 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.15)]"
          }`}>
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-teal-500 rounded-t-3xl animate-gradient-flow" />
            
            {/* Close button */}
            <button
              disabled={profileLoading}
              onClick={() => setShowProfileModal(false)}
              className="absolute top-5 right-5 p-2 rounded-full transition-all duration-200 disabled:opacity-50 hover:scale-105 active:scale-95 cursor-pointer text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col space-y-6">
              <div className="flex items-center gap-3.5">
                <div className={`p-3 rounded-2xl border transition-all duration-300 shadow-sm ${
                  isDark 
                    ? "bg-blue-600/10 border-blue-500/25 text-blue-400 shadow-blue-500/5" 
                    : "bg-gradient-to-tr from-blue-500/10 to-indigo-500/5 border-blue-100 text-blue-600 shadow-blue-500/10"
                }`}>
                  <User className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className={`text-xl font-black tracking-tight transition-colors ${
                    isDark ? "text-white" : "text-slate-850"
                  }`}>
                    ตั้งค่าโปรไฟล์ & รหัสผ่าน
                  </h3>
                  <p className={`text-xs mt-0.5 font-medium transition-colors ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}>
                    แก้ไขข้อมูลส่วนตัวและรหัสผ่านเพื่อความปลอดภัยของระบบ
                  </p>
                </div>
              </div>

              {profileError && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-xl flex items-center gap-3 text-xs text-rose-600 dark:text-rose-400 font-semibold animate-pulse shadow-sm">
                  <AlertCircle className="w-4.5 h-4.5 shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}

              {profileSuccess && (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl flex items-center gap-3 text-xs text-emerald-600 dark:text-emerald-400 font-bold shadow-sm">
                  <Check className="w-4.5 h-4.5 shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfileSubmit} className="space-y-4">
                {/* Full name input */}
                <div className="group relative flex flex-col space-y-1.5">
                  <label className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    isDark ? "text-slate-400 group-focus-within:text-blue-400" : "text-slate-500 group-focus-within:text-blue-600"
                  }`}>
                    ชื่อ-นามสกุล
                  </label>
                  <div className="relative">
                    <User className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors ${
                      isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                    }`} />
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      disabled={profileLoading}
                      placeholder="กรอกชื่อ-นามสกุลจริง"
                      className={`w-full pl-11 pr-4 py-3 rounded-xl text-xs outline-none transition-all disabled:opacity-50 border focus:ring-4 font-semibold ${
                        isDark 
                          ? "bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500 focus:ring-blue-500/15 placeholder-slate-600" 
                          : "bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 text-slate-850 focus:bg-white focus:border-blue-600 focus:ring-blue-500/8 placeholder-slate-400/80 shadow-sm"
                      }`}
                    />
                  </div>
                </div>

                {/* Phone number input */}
                <div className="group relative flex flex-col space-y-1.5">
                  <label className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    isDark ? "text-slate-400 group-focus-within:text-blue-400" : "text-slate-500 group-focus-within:text-blue-600"
                  }`}>
                    เบอร์โทรศัพท์
                  </label>
                  <div className="relative">
                    <AlertCircle className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors ${
                      isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                    }`} />
                    <input
                      type="tel"
                      required
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      disabled={profileLoading}
                      placeholder="กรอกเบอร์โทรศัพท์มือถือ"
                      className={`w-full pl-11 pr-4 py-3 rounded-xl text-xs outline-none transition-all disabled:opacity-50 border focus:ring-4 font-semibold ${
                        isDark 
                          ? "bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500 focus:ring-blue-500/15 placeholder-slate-600" 
                          : "bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 text-slate-850 focus:bg-white focus:border-blue-600 focus:ring-blue-500/8 placeholder-slate-400/80 shadow-sm"
                      }`}
                    />
                  </div>
                </div>

                {/* Beautiful fading gradient divider */}
                <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-800 to-transparent my-6" />

                {/* Interactive Premium Suggestion Card */}
                <div className={`space-y-1.5 p-4 rounded-r-2xl border-l-4 transition-all duration-300 mb-2 shadow-sm ${
                  isDark 
                    ? "bg-blue-950/10 border-blue-500/50 text-blue-400 shadow-blue-950/10" 
                    : "bg-gradient-to-r from-blue-50/50 to-indigo-50/30 border-blue-500 text-blue-700 shadow-blue-500/5"
                }`}>
                  <p className="text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wide">
                    <KeyRound className="w-3.5 h-3.5" /> แนะนำการเปลี่ยนรหัสผ่าน
                  </p>
                  <p className={`text-[10px] leading-relaxed font-medium ${
                    isDark ? "text-slate-400" : "text-slate-550"
                  }`}>
                    กรอกข้อมูลด้านล่างเฉพาะเมื่อต้องการแก้ไขรหัสผ่านใหม่เท่านั้น หากไม่ต้องการแก้ไข ให้ปล่อยว่างช่องรหัสผ่านไว้ได้เลยครับ
                  </p>
                </div>

                {/* New password input */}
                <div className="group relative flex flex-col space-y-1.5">
                  <label className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    isDark ? "text-slate-400 group-focus-within:text-blue-400" : "text-slate-500 group-focus-within:text-blue-600"
                  }`}>
                    รหัสผ่านใหม่ (ระบุอย่างน้อย 6 ตัวอักษร)
                  </label>
                  <div className="relative">
                    <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors ${
                      isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                    }`} />
                    <input
                      type="password"
                      value={profilePassword}
                      onChange={(e) => setProfilePassword(e.target.value)}
                      disabled={profileLoading}
                      placeholder="ป้อนรหัสผ่านใหม่ หากต้องการเปลี่ยน"
                      className={`w-full pl-11 pr-4 py-3 rounded-xl text-xs outline-none transition-all disabled:opacity-50 border focus:ring-4 font-semibold ${
                        isDark 
                          ? "bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500 focus:ring-blue-500/15 placeholder-slate-600" 
                          : "bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 text-slate-850 focus:bg-white focus:border-blue-600 focus:ring-blue-500/8 placeholder-slate-400/80 shadow-sm"
                      }`}
                    />
                  </div>
                </div>

                {/* Confirm new password input */}
                <div className="group relative flex flex-col space-y-1.5">
                  <label className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    isDark ? "text-slate-400 group-focus-within:text-blue-400" : "text-slate-500 group-focus-within:text-blue-600"
                  }`}>
                    ยืนยันรหัสผ่านใหม่
                  </label>
                  <div className="relative">
                    <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors ${
                      isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                    }`} />
                    <input
                      type="password"
                      value={profileConfirmPassword}
                      onChange={(e) => setProfileConfirmPassword(e.target.value)}
                      disabled={profileLoading}
                      placeholder="ป้อนรหัสผ่านใหม่อีกครั้งเพื่อยืนยัน"
                      className={`w-full pl-11 pr-4 py-3 rounded-xl text-xs outline-none transition-all disabled:opacity-50 border focus:ring-4 font-semibold ${
                        isDark 
                          ? "bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500 focus:ring-blue-500/15 placeholder-slate-600" 
                          : "bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 text-slate-850 focus:bg-white focus:border-blue-600 focus:ring-blue-500/8 placeholder-slate-400/80 shadow-sm"
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5 w-full pt-5">
                  <button
                    type="button"
                    disabled={profileLoading}
                    onClick={() => setShowProfileModal(false)}
                    className={`py-3 px-4 font-extrabold rounded-xl text-xs transition-all duration-250 disabled:opacity-50 border cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                      isDark 
                        ? "bg-slate-800/85 border-slate-700/80 hover:bg-slate-750 text-slate-300 hover:text-white" 
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800 hover:border-slate-300 shadow-sm"
                    }`}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={profileLoading}
                    className="py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-black rounded-xl text-xs shadow-[0_6px_20px_rgba(37,99,235,0.22)] hover:shadow-[0_8px_25px_rgba(37,99,235,0.42)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {profileLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
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
