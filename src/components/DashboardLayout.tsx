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
  const isDark = mounted ? resolvedTheme === "dark" : true

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
  const [supportStatus, setSupportStatus] = useState<string>(() => {
    if (typeof window === "undefined") return "none"
    const savedWsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
    const savedStatus = getCookie(`horset_support_status_${savedWsId}`)
    return savedStatus || "none"
  })
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
            setCookie(`horset_support_status_${activeWsId}`, grantData.status)
            // สำหรับสิทธิ์ Admin: ถ้าเป็น Pending ให้เด้ง Pop-up
            if (grantData.status === "pending" && currentRole === "admin") {
              setShowSupportModal(true)
            }
          } else {
            setSupportStatus("none")
            setCookie(`horset_support_status_${activeWsId}`, "none")
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

  // ดึงและอัปเดตสถานะสิทธิ์ช่วยเหลือแบบ Real-time Polling (ตรวจสอบความเปลี่ยนแปลงทุก 3 วินาที)
  useEffect(() => {
    if (!currentWorkspace.id) return

    const checkStatus = async () => {
      try {
        let nextStatus = "none"

        if (!isDemo) {
          const supabase = createClient()
          const { data: grantData, error } = await supabase
            .from("support_access_grants")
            .select("status")
            .eq("workspace_id", currentWorkspace.id)
            .maybeSingle()

          if (error) {
            console.error("Error polling support status:", error)
            return
          }
          nextStatus = grantData?.status || "none"
        } else {
          // ในโหมด Demo ใช้ค่าจาก Cookie เพื่อซิงก์สถานะข้ามแท็บ
          nextStatus = getCookie(`horset_support_status_${currentWorkspace.id}`) || "none"
        }

        // อัปเดต state เมื่อสถานะมีความเปลี่ยนแปลงจริงเท่านั้น
        setSupportStatus((prevStatus) => {
          if (prevStatus === nextStatus) return prevStatus

          // [สำหรับ Admin] ถ้าพบสิทธิ์เป็น pending ให้แสดงป๊อปอัปอนุมัติทันทีโดยไม่ต้องเปลี่ยนหน้า
          if (nextStatus === "pending" && userRole === "admin") {
            setShowSupportModal(true)
          }

          // [สำหรับ Admin] ถ้าสิทธิ์เปลี่ยนจาก pending เป็นอย่างอื่นแล้ว ให้ปิดป๊อปอัปทันที
          if (nextStatus !== "pending" && prevStatus === "pending" && userRole === "admin") {
            setShowSupportModal(false)
          }

          return nextStatus
        })

        // บันทึกลงคุกกี้เพื่อให้ซิงก์กันข้ามการ Remount หน้าเว็บ
        setCookie(`horset_support_status_${currentWorkspace.id}`, nextStatus)
      } catch (err) {
        console.error("Failed to poll support status:", err)
      }
    }

    // เรียกดึงข้อมูลครั้งแรกทันที
    checkStatus()

    // ตั้ง Polling interval ทุก 3 วินาที
    const interval = setInterval(checkStatus, 3000)

    return () => clearInterval(interval)
  }, [currentWorkspace.id, userRole, isDemo])

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
    // (ซ่อนเฉพาะตอนที่อยู่ที่หน้า /super-admin เพื่อป้องกันการกระพริบหายไปของแท็บขณะสลับหน้าระหว่างทำงานใน Workspace)
    if (userRole === "super_admin" && supportStatus !== "approved" && pathname === "/super-admin") {
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
