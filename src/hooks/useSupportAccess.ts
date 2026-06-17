import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

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
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:"
  document.cookie = `${name}=${value}; path=/; expires=${date.toUTCString()}${isSecure ? "; Secure" : ""}; SameSite=Lax`
}

export function useSupportAccess(
  currentWorkspace: Workspace,
  userRole: "admin" | "staff" | "super_admin",
  isDemo: boolean
) {
  const router = useRouter()

  const [supportStatus, setSupportStatus] = useState<string>(() => {
    if (typeof window === "undefined") return "none"
    const savedWsId = getCookie("horset_current_workspace_id") || "d290f1ee-6c54-4b01-90e6-d701748f0851"
    const savedStatus = getCookie(`horset_support_status_${savedWsId}`)
    return savedStatus || "none"
  })

  const [showSupportModal, setShowSupportModal] = useState(false)

  // Polling logic
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
          nextStatus = getCookie(`horset_support_status_${currentWorkspace.id}`) || "none"
        }

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

        setCookie(`horset_support_status_${currentWorkspace.id}`, nextStatus)
      } catch (err) {
        console.error("Failed to poll support status:", err)
      }
    }

    checkStatus()

    const interval = setInterval(checkStatus, 3000)

    return () => clearInterval(interval)
  }, [currentWorkspace.id, userRole, isDemo])

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

  return {
    supportStatus,
    setSupportStatus,
    showSupportModal,
    setShowSupportModal,
    handleRequestSupport,
    handleDecideSupport,
    handleExitSupport
  }
}
