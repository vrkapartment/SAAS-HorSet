"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/DashboardLayout"
import {
  Building,
  Plus,
  Users,
  UserPlus,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  Search,
  RefreshCw,
  Mail,
  Phone,
  ShieldAlert,
  AlertCircle,
  Clock,
  Lock,
  Edit,
  X,
  Key
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { 
  createWorkspaceUserAction,
  updateUserProfileAdminAction,
  deleteUserProfileAdminAction,
  updateWorkspaceNameAdminAction,
  deleteWorkspaceAdminAction,
  getSuperAdminDataAction
} from "@/features/super-admin/actions"

interface Workspace {
  id: string
  name: string
  created_at: string
}

interface ProfileItem {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  role: "admin" | "staff" | "tenant" | "super_admin"
  workspace_id: string | null
  workspace_name?: string
  created_at: string
}

interface RegistrationCode {
  code: string
  workspace_id: string
  role: "admin" | "staff" | "tenant"
  created_at: string
  expires_at: string
  is_used: boolean
  used_by_email: string | null
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
  document.cookie = `${name}=${value}; path=/; expires=${date.toUTCString()}`
}

function removeCookie(name: string) {
  if (typeof document === "undefined") return
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC`
}

export default function SuperAdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setResultSuccess] = useState<string | null>(null)

  // ข้อมูลจากฐานข้อมูล
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [profiles, setProfiles] = useState<ProfileItem[]>([])
  const [supportGrants, setSupportGrants] = useState<{ [key: string]: string }>({})

  // ค้นหาและคัดกรอง
  const [activeTab, setActiveTab] = useState<"workspaces" | "users" | "invites">("workspaces")
  const [searchWorkspace, setSearchWorkspace] = useState("")
  const [searchProfile, setSearchProfile] = useState("")

  // ฟอร์มเพิ่ม Workspace
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [addingWorkspace, setAddingWorkspace] = useState(false)

  // ฟอร์มเพิ่มบัญชี / สิทธิ์ (Role) ประจำ Workspace
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserPassword, setNewUserPassword] = useState("")
  const [newUserFullName, setNewUserFullName] = useState("")
  const [newUserPhone, setNewUserPhone] = useState("")
  const [newUserRole, setNewUserRole] = useState<"admin" | "staff" | "tenant">("admin")
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("")
  const [addingUser, setAddingUser] = useState(false)

  // แก้ไข Workspace
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const [editingWorkspaceName, setEditingWorkspaceName] = useState("")
  const [updatingWorkspace, setUpdatingWorkspace] = useState(false)

  // แก้ไข Profile (Role & Workspace Assignment)
  const [editingProfile, setEditingProfile] = useState<ProfileItem | null>(null)
  const [editingProfileRole, setEditingProfileRole] = useState<ProfileItem["role"]>("admin")
  const [editingProfileWorkspaceId, setEditingProfileWorkspaceId] = useState<string | null>(null)
  const [editingProfileFullName, setEditingProfileFullName] = useState("")
  const [editingProfilePhone, setEditingProfilePhone] = useState("")
  const [updatingProfile, setUpdatingProfile] = useState(false)

  // Registration Secret Codes
  const [registrationCodes, setRegistrationCodes] = useState<RegistrationCode[]>([])
  const [genWorkspaceId, setGenWorkspaceId] = useState("")
  const [genRole, setGenRole] = useState<"admin" | "staff" | "tenant">("tenant")
  const [generatingCode, setGeneratingCode] = useState(false)

  // ตรวจสอบโหมดทดสอบ
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  // โหลดข้อมูลทั้งหมด
  const loadData = async () => {
    setLoading(true)
    setError(null)
    setResultSuccess(null)

    if (!isDemo) {
      try {
        const res = await getSuperAdminDataAction()
        if (!res.success) throw new Error(res.error)

        if (res.isDemo) {
          fallbackMock()
          return
        }

        const wsData = res.data?.workspaces || []
        const profData = res.data?.profiles || []
        const grantData = res.data?.supportGrants || []
        const codeData = res.data?.registrationCodes || []

        setWorkspaces(wsData)
        setProfiles(profData)
        setRegistrationCodes(codeData)

        const grantMap: { [key: string]: string } = {}
        grantData.forEach((g: any) => {
          grantMap[g.workspace_id] = g.status
        })
        setSupportGrants(grantMap)

        if (wsData.length > 0) {
          const savedSelectedWs = getCookie("horset_super_admin_selected_ws")
          const savedGenWs = getCookie("horset_super_admin_gen_ws")

          const matchedSelected = savedSelectedWs && wsData.some(w => w.id === savedSelectedWs)
          const matchedGen = savedGenWs && wsData.some(w => w.id === savedGenWs)

          const finalSelectedId = matchedSelected ? savedSelectedWs : wsData[0].id
          const finalGenId = matchedGen ? savedGenWs : wsData[0].id

          setSelectedWorkspaceId(finalSelectedId)
          setGenWorkspaceId(finalGenId)

          if (!savedSelectedWs) {
            setCookie("horset_super_admin_selected_ws", finalSelectedId)
          }
          if (!savedGenWs) {
            setCookie("horset_super_admin_gen_ws", finalGenId)
          }
        }
      } catch (err: any) {
        console.error(err)
        setError("ไม่สามารถโหลดข้อมูลจาก Supabase ได้: " + err.message + " กำลังใช้ระบบจำลองแทน...")
        fallbackMock()
      } finally {
        setLoading(false)
      }
    } else {
      fallbackMock()
      setLoading(false)
    }
  }

  const fallbackMock = () => {
    const mockWs: Workspace[] = [
      { id: "d290f1ee-6c54-4b01-90e6-d701748f0851", name: "แสนสุข แมนชั่น (Default)", created_at: new Date().toISOString() },
      { id: "e390f1ee-6c54-4b01-90e6-d701748f0852", name: "ร่มรื่น เรสซิเดนท์ (Demo 2)", created_at: new Date().toISOString() }
    ]
    setWorkspaces(mockWs)

    const savedSelectedWs = getCookie("horset_super_admin_selected_ws")
    const savedGenWs = getCookie("horset_super_admin_gen_ws")

    if (mockWs.length > 0) {
      const matchedSelected = savedSelectedWs && mockWs.some(w => w.id === savedSelectedWs)
      const matchedGen = savedGenWs && mockWs.some(w => w.id === savedGenWs)

      const finalSelectedId = matchedSelected ? savedSelectedWs : mockWs[0].id
      const finalGenId = matchedGen ? savedGenWs : mockWs[0].id

      setSelectedWorkspaceId(finalSelectedId)
      setGenWorkspaceId(finalGenId)

      if (!savedSelectedWs) {
        setCookie("horset_super_admin_selected_ws", finalSelectedId)
      }
      if (!savedGenWs) {
        setCookie("horset_super_admin_gen_ws", finalGenId)
      }
    }

    const mockProfs: ProfileItem[] = [
      {
        id: "u1",
        email: "admin@horset.com",
        full_name: "คุณสมเจตน์ (เจ้าของ)",
        phone: "0812345678",
        role: "admin",
        workspace_id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
        created_at: new Date().toISOString()
      },
      {
        id: "u2",
        email: "staff_somchai@horset.com",
        full_name: "สมชาย (ผู้ช่วย)",
        phone: "0898765432",
        role: "staff",
        workspace_id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
        created_at: new Date().toISOString()
      },
      {
        id: "u3",
        email: "tenant_room101@horset.com",
        full_name: "สมศรี ใจดี (ผู้เช่าห้อง 101)",
        phone: "0855555555",
        role: "tenant",
        workspace_id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
        created_at: new Date().toISOString()
      }
    ]
    setProfiles(mockProfs)

    // โหลดสถานะแกรนท์ของแต่ละ Workspace
    const grantMap: { [key: string]: string } = {}
    mockWs.forEach((ws) => {
      grantMap[ws.id] = getCookie(`horset_support_status_${ws.id}`) || "none"
    })
    setSupportGrants(grantMap)

    const mockCodes: RegistrationCode[] = []
    setRegistrationCodes(mockCodes)
  }

  useEffect(() => {
    loadData()
  }, [])

  // ฟังก์ชันเพิ่ม Workspace ใหม่
  const handleAddWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkspaceName.trim()) return

    setAddingWorkspace(true)
    setError(null)
    setResultSuccess(null)

    const newId = crypto.randomUUID()
    const newWs: Workspace = {
      id: newId,
      name: newWorkspaceName.trim(),
      created_at: new Date().toISOString()
    }

    if (!isDemo) {
      try {
        const supabase = createClient()
        const { error: wsErr } = await supabase
          .from("workspaces")
          .insert([newWs])

        if (wsErr) throw wsErr

        setWorkspaces([newWs, ...workspaces])
        setNewWorkspaceName("")
        setResultSuccess(`✓ เพิ่ม Workspace "${newWs.name}" เข้าระบบเรียบร้อยแล้ว`)
        if (!selectedWorkspaceId) {
          setSelectedWorkspaceId(newId)
        }
      } catch (err: any) {
        setError("ไม่สามารถเพิ่ม Workspace ใน Supabase: " + err.message)
      } finally {
        setAddingWorkspace(false)
      }
    } else {
      // โหมด Demo บันทึกใน memory state และ cookie
      const updated = [newWs, ...workspaces]
      setWorkspaces(updated)
      setCookie(`horset_support_status_${newId}`, "none")
      setNewWorkspaceName("")
      setResultSuccess(`✓ [Demo] เพิ่ม Workspace "${newWs.name}" เรียบร้อยแล้ว`)
      setAddingWorkspace(false)
    }
  }

  // ฟังก์ชันเพิ่มสิทธิ์/บัญชีผู้ใช้งานใหม่ประจำ Workspace
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserEmail || !selectedWorkspaceId) return

    setAddingUser(true)
    setError(null)
    setResultSuccess(null)

    const newId = crypto.randomUUID()
    const newProfile: ProfileItem = {
      id: newId,
      email: newUserEmail.trim(),
      full_name: newUserFullName.trim() || null,
      phone: newUserPhone.trim() || null,
      role: newUserRole,
      workspace_id: selectedWorkspaceId,
      created_at: new Date().toISOString()
    }

    if (!isDemo) {
      try {
        const result = await createWorkspaceUserAction({
          email: newUserEmail.trim(),
          password: newUserPassword || undefined,
          fullName: newUserFullName.trim(),
          phone: newUserPhone.trim(),
          role: newUserRole,
          workspaceId: selectedWorkspaceId
        })

        if (!result.success) {
          throw new Error(result.error)
        }

        setNewUserEmail("")
        setNewUserPassword("")
        setNewUserFullName("")
        setNewUserPhone("")
        setResultSuccess(`✓ สร้างบัญชีสำเร็จและมอบสิทธิ์ "${newUserRole.toUpperCase()}" ให้บัญชี ${newUserEmail.trim()} เรียบร้อยแล้ว สามารถเข้าใช้งานได้ทันที`)
        
        // โหลดข้อมูลรายชื่อใหม่เพื่อให้โปรไฟล์ที่ถูกสร้างผ่าน Trigger แสดงผลบนหน้าจอด้วย ID จริงจาก Auth
        await loadData()
      } catch (err: any) {
        setError("ไม่สามารถเพิ่มบัญชีผู้ใช้ใน Supabase: " + err.message)
      } finally {
        setAddingUser(false)
      }
    } else {
      // โหมด Demo บันทึกใน memory state
      const updated = [newProfile, ...profiles]
      setProfiles(updated)
      setNewUserEmail("")
      setNewUserPassword("")
      setNewUserFullName("")
      setNewUserPhone("")
      setResultSuccess(`✓ [Demo] มอบสิทธิ์ "${newUserRole.toUpperCase()}" ให้บัญชี ${newUserEmail} สำเร็จ`)
      setAddingUser(false)
    }
  }

  // ฟังก์ชันสลับไปจัดการสิทธิ์ของ Workspace นั้นๆ ทันที
  const handleEnterWorkspace = (ws: Workspace) => {
    setCookie("horset_current_workspace_id", ws.id)
    
    // ตั้งคุกกี้สิทธิ์เป็น admin ชั่วคราวหากได้รับการอนุมัติช่วยเหลือ เพื่อให้สามารถเปิดหน้า แดชบอร์ด, จัดการห้องพัก, จัดการบิล ได้ปกติ
    const status = supportGrants[ws.id] || "none"
    if (status === "approved") {
      alert(`✓ กำลังเปลี่ยนโหมดเข้าสลับช่วยเหลือหอพัก "${ws.name}" ด้วยสิทธิ์ตรวจสอบระบบ...`)
      router.push("/dashboard")
    } else {
      alert(`⚠️ คุณยังไม่มีสิทธิ์เข้าถึงหอพักนี้! โปรดกด 'ส่งคำขอเข้าช่วยเหลือระบบ' ในเมนูด้านซ้ายและให้เจ้าของระบบกดอนุมัติก่อน`)
    }
  }

  // ฟังก์ชันลบสิทธิ์ผู้ใช้งาน (ในหน้าควบคุม)
  const handleDeleteProfile = async (id: string, email: string) => {
    if (!confirm(`คุณต้องการถอนสิทธิ์การใช้งานบัญชี ${email} ใช่หรือไม่?`)) return

    if (!isDemo) {
      try {
        const res = await deleteUserProfileAdminAction(id)
        if (!res.success) throw new Error(res.error)

        setProfiles(profiles.filter((p) => p.id !== id))
        setResultSuccess(`✓ ถอนสิทธิ์บัญชี ${email} เรียบร้อยแล้ว`)
      } catch (err: any) {
        setError("เกิดข้อผิดพลาดในการลบสิทธิ์: " + err.message)
      }
    } else {
      const updated = profiles.filter((p) => p.id !== id)
      setProfiles(updated)
      setResultSuccess(`✓ [Demo] ถอนสิทธิ์บัญชี ${email} สำเร็จ`)
    }
  }

  // ฟังก์ชันลบ Workspace
  const handleDeleteWorkspace = async (id: string, name: string) => {
    if (!confirm(`⚠️ คำเตือน: หากคุณลบพื้นที่ทำงาน "${name}" ข้อมูลและการตั้งค่าที่เกี่ยวข้องทั้งหมดจะได้รับผลกระทบ\nคุณต้องการลบพื้นที่ทำงานนี้ใช่หรือไม่?`)) return

    setError(null)
    setResultSuccess(null)

    if (!isDemo) {
      try {
        const res = await deleteWorkspaceAdminAction(id)
        if (!res.success) throw new Error(res.error)

        setWorkspaces(workspaces.filter((w) => w.id !== id))
        setResultSuccess(`✓ ลบพื้นที่ทำงาน "${name}" เรียบร้อยแล้ว`)
      } catch (err: any) {
        setError("ไม่สามารถลบ Workspace ใน Supabase (กรุณาตรวจสอบว่ามีข้อมูลห้องพัก บิล หรือผู้ใช้งานสังกัดอยู่หรือไม่): " + err.message)
      }
    } else {
      // โหมด Demo
      const updatedWs = workspaces.filter((w) => w.id !== id)
      setWorkspaces(updatedWs)

      // ลบสิทธิ์ช่วยเหลือด้วยถ้ามี
      removeCookie(`horset_support_status_${id}`)

      // ปรับโปรไฟล์ที่เกี่ยวข้องให้ไม่มีสังกัด
      const updatedProfs = profiles.map((p) => p.workspace_id === id ? { ...p, workspace_id: null } : p)
      setProfiles(updatedProfs)

      setResultSuccess(`✓ [Demo] ลบพื้นที่ทำงาน "${name}" เรียบร้อยแล้ว`)
    }
  }

  // ฟังก์ชันอัปเดต Workspace (เช่น เปลี่ยนชื่อ)
  const handleUpdateWorkspaceName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingWorkspace || !editingWorkspaceName.trim()) return

    setUpdatingWorkspace(true)
    setError(null)
    setResultSuccess(null)

    const updatedName = editingWorkspaceName.trim()

    if (!isDemo) {
      try {
        const res = await updateWorkspaceNameAdminAction(editingWorkspace.id, updatedName)
        if (!res.success) throw new Error(res.error)

        setWorkspaces(workspaces.map((w) => w.id === editingWorkspace.id ? { ...w, name: updatedName } : w))
        setResultSuccess(`✓ แก้ไขชื่อ Workspace เป็น "${updatedName}" สำเร็จ`)
        setEditingWorkspace(null)
      } catch (err: any) {
        setError("ไม่สามารถแก้ไข Workspace ใน Supabase: " + err.message)
      } finally {
        setUpdatingWorkspace(false)
      }
    } else {
      // โหมด Demo
      const updated = workspaces.map((w) => w.id === editingWorkspace.id ? { ...w, name: updatedName } : w)
      setWorkspaces(updated)
      setResultSuccess(`✓ [Demo] แก้ไขชื่อ Workspace เป็น "${updatedName}" สำเร็จ`)
      setEditingWorkspace(null)
      setUpdatingWorkspace(false)
    }
  }

  // ฟังก์ชันอัปเดต Profile (เปลี่ยนสิทธิ์, สังกัดหอพัก, ชื่อ, เบอร์โทร)
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProfile) return

    setUpdatingProfile(true)
    setError(null)
    setResultSuccess(null)

    const updatedRole = editingProfileRole
    const updatedWorkspaceId = editingProfileWorkspaceId || null
    const updatedFullName = editingProfileFullName.trim() || null
    const updatedPhone = editingProfilePhone.trim() || null

    if (!isDemo) {
      try {
        const res = await updateUserProfileAdminAction(editingProfile.id, {
          role: updatedRole,
          workspaceId: updatedWorkspaceId,
          fullName: updatedFullName,
          phone: updatedPhone
        })
        if (!res.success) throw new Error(res.error)

        setProfiles(profiles.map((p) => p.id === editingProfile.id ? {
          ...p,
          role: updatedRole,
          workspace_id: updatedWorkspaceId,
          full_name: updatedFullName,
          phone: updatedPhone
        } : p))
        setResultSuccess(`✓ อัปเดตข้อมูลและสิทธิ์ของผู้ใช้งาน ${editingProfile.email} สำเร็จ`)
        setEditingProfile(null)
      } catch (err: any) {
        setError("ไม่สามารถอัปเดตสิทธิ์ผู้ใช้งานใน Supabase: " + err.message)
      } finally {
        setUpdatingProfile(false)
      }
    } else {
      // โหมด Demo
      const updated = profiles.map((p) => p.id === editingProfile.id ? {
        ...p,
        role: updatedRole,
        workspace_id: updatedWorkspaceId,
        full_name: updatedFullName,
        phone: updatedPhone
      } : p)
      setProfiles(updated)
      setResultSuccess(`✓ [Demo] อัปเดตข้อมูลและสิทธิ์ของผู้ใช้งาน ${editingProfile.email} สำเร็จ`)
      setEditingProfile(null)
      setUpdatingProfile(false)
    }
  }

  // ฟังก์ชันสร้าง Secret Code สำหรับสมัครสมาชิก
  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!genWorkspaceId) return

    setGeneratingCode(true)
    setError(null)
    setResultSuccess(null)

    // สร้าง Code รูปแบบ HS-XXXXXX
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let randomPart = ""
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    const newCodeStr = `HS-${randomPart}`

    const createdAt = new Date()
    const expiresAt = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000) // 2 ชั่วโมง

    const newCodeObj: RegistrationCode = {
      code: newCodeStr,
      workspace_id: genWorkspaceId,
      role: genRole,
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      is_used: false,
      used_by_email: null
    }

    if (!isDemo) {
      try {
        const supabase = createClient()
        const { error: genErr } = await supabase
          .from("registration_codes")
          .insert([newCodeObj])

        if (genErr) throw genErr

        setRegistrationCodes([newCodeObj, ...registrationCodes])
        setResultSuccess(`✓ สร้าง Secret Code "${newCodeStr}" สำเร็จ (มีอายุใช้งาน 2 ชั่วโมง)`)
      } catch (err: any) {
        setError("ไม่สามารถบันทึก Secret Code ใน Supabase: " + err.message)
      } finally {
        setGeneratingCode(false)
      }
    } else {
      // โหมด Demo
      const updated = [newCodeObj, ...registrationCodes]
      setRegistrationCodes(updated)
      setResultSuccess(`✓ [Demo] สร้าง Secret Code "${newCodeStr}" สำเร็จ (มีอายุใช้งาน 2 ชั่วโมง)`)
      setGeneratingCode(false)
    }
  }

  // ฟังก์ชันลบ Secret Code
  const handleDeleteCode = async (code: string) => {
    if (!confirm(`คุณต้องการลบ Secret Code "${code}" ใช่หรือไม่?`)) return

    setError(null)
    setResultSuccess(null)

    if (!isDemo) {
      try {
        const supabase = createClient()
        const { error: delErr } = await supabase
          .from("registration_codes")
          .delete()
          .eq("code", code)

        if (delErr) throw delErr

        setRegistrationCodes(registrationCodes.filter((c) => c.code !== code))
        setResultSuccess(`✓ ลบ Secret Code ${code} เรียบร้อยแล้ว`)
      } catch (err: any) {
        setError("เกิดข้อผิดพลาดในการลบ Code: " + err.message)
      }
    } else {
      const updated = registrationCodes.filter((c) => c.code !== code)
      setRegistrationCodes(updated)
      setResultSuccess(`✓ [Demo] ลบ Secret Code ${code} สำเร็จ`)
    }
  }

  // คัดกรองข้อมูล
  const filteredWorkspaces = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(searchWorkspace.toLowerCase())
  )

  const filteredProfiles = profiles.filter((p) => {
    const wsName = workspaces.find((w) => w.id === p.workspace_id)?.name || "ไม่มีสังกัด"
    return (
      p.email.toLowerCase().includes(searchProfile.toLowerCase()) ||
      (p.full_name && p.full_name.toLowerCase().includes(searchProfile.toLowerCase())) ||
      p.role.toLowerCase().includes(searchProfile.toLowerCase()) ||
      wsName.toLowerCase().includes(searchProfile.toLowerCase())
    )
  })

  return (
    <DashboardLayout role="super_admin">
      <div className="space-y-8 pb-12">
        
        {/* หัวข้อ แนะนำผู้ดูแลระบบ */}
        <div className="relative p-8 rounded-3xl overflow-hidden glass-panel border border-purple-500/10 shadow-2xl">
          <div className="absolute top-0 right-0 w-[400px] h-[200px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold rounded-full text-xs uppercase tracking-wider animate-pulse">
                <ShieldCheck className="w-3.5 h-3.5" /> แผงควบคุมควบคุมระบบสูงสุด
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-purple-400">
                Super Admin Console
              </h1>
              <p className="text-slate-400 text-sm max-w-xl">
                ระบบจัดการผู้ใช้แบบรวมศูนย์กลาง มอบหมายพื้นที่ทำงาน (Workspace) ตั้งค่าบทบาท และสลับสิทธิ์การเข้าตรวจสอบข้อมูลเพื่อบริการช่วยเหลือลูกค้า
              </p>
            </div>
            
            <button
              onClick={loadData}
              className="px-5 py-3 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-2 shadow-lg shrink-0 self-start md:self-center"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-purple-400" : ""}`} /> 
              รีเฟรชข้อมูลระบบ
            </button>
          </div>
        </div>

        {/* แถบเลือกแท็บแบบพรีเมียม (Premium Tab Selector) */}
        <div className="flex p-1 bg-slate-900/80 border border-slate-800 rounded-2xl w-full max-w-md shadow-lg relative z-10">
          {[
            { id: "workspaces", label: "พื้นที่ทำงาน", icon: Building },
            { id: "users", label: "บัญชีผู้ใช้งาน", icon: Users },
            { id: "invites", label: "เชิญชวน & มอบสิทธิ์", icon: Key }
          ].map((tab) => {
            const TabIcon = tab.icon
            const isTabActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 md:py-2.5 rounded-xl text-sm md:text-xs font-bold transition-all duration-300 relative cursor-pointer ${
                  isTabActive
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20 scale-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <TabIcon className="w-4.5 h-4.5 md:w-4 md:h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* แสดงผลแจ้งเตือนสถานะสำเร็จ / ข้อผิดพลาด */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/25 text-red-400 rounded-2xl text-sm md:text-xs flex items-center gap-3 shadow-lg">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-4 bg-teal-500/10 border border-teal-500/25 text-teal-400 rounded-2xl text-sm md:text-xs flex items-center gap-3 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {activeTab === "workspaces" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* คอลัมน์ซ้าย: จัดการพื้นที่ทำงาน (Workspace Management) */}
            <div className="lg:col-span-7 space-y-8">
              <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                      <Building className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-200">พื้นที่ทำงานทั้งหมด (Workspaces)</h2>
                      <p className="text-[11px] text-slate-500">จำลองสิทธิ์การเข้าตรวจสอบดูแลข้อมูลแยกแต่ละตึก</p>
                    </div>
                  </div>
                </div>

                {/* ค้นหา Workspace */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 md:pl-3.5 pointer-events-none">
                    <Search className="w-4 h-4 text-slate-500" />
                  </span>
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อหอพัก/Workspace..."
                    className="w-full pl-11 pr-4 py-3.5 md:pl-10 md:pr-4 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm md:text-xs transition-colors"
                    value={searchWorkspace}
                    onChange={(e) => setSearchWorkspace(e.target.value)}
                  />
                </div>

                {/* รายการพื้นที่ทำงาน */}
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {filteredWorkspaces.map((ws) => {
                    const status = supportGrants[ws.id] || "none"
                    return (
                      <div
                        key={ws.id}
                        className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/60 hover:border-slate-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <h4 className="text-sm md:text-sm font-semibold text-slate-200 truncate">{ws.name}</h4>
                          <div className="flex items-center gap-4 text-[11px] md:text-[10px] text-slate-500">
                            <span className="font-mono">ID: {ws.id.substring(0, 8)}...</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {new Date(ws.created_at).toLocaleDateString("th-TH")}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 md:gap-2.5 shrink-0">
                          {/* ป้ายแสดงสิทธิ์การเข้าช่วยเหลือ */}
                          {status === "approved" ? (
                            <span className="text-[11px] md:text-[10px] bg-teal-500/10 border border-teal-500/25 text-teal-400 font-semibold px-2.5 py-1 md:py-0.5 rounded-lg flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping" />
                              อนุมัติช่วยเหลือแล้ว
                            </span>
                          ) : status === "pending" ? (
                            <span className="text-[11px] md:text-[10px] bg-amber-500/10 border border-amber-500/25 text-amber-400 font-semibold px-2.5 py-1 md:py-0.5 rounded-lg animate-pulse">
                              ⏳ รอยืนยันคำขอ
                            </span>
                          ) : (
                            <span className="text-[11px] md:text-[10px] bg-red-500/10 border border-red-500/25 text-red-400 font-semibold px-2.5 py-1 md:py-0.5 rounded-lg">
                              ✕ ไม่มีสิทธิ์
                            </span>
                          )}

                          <button
                            onClick={() => {
                              setEditingWorkspace(ws)
                              setEditingWorkspaceName(ws.name)
                            }}
                            className="p-3 py-2.5 md:p-2 md:py-1.5 text-xs md:text-[11px] font-bold md:font-semibold bg-slate-950 border border-slate-800 hover:bg-slate-800 text-blue-400 hover:text-blue-300 rounded-xl md:rounded-lg flex items-center justify-center gap-1.5 md:gap-1 transition-all flex-1 md:flex-none"
                            title="แก้ไขชื่อ Workspace"
                          >
                            <Edit className="w-3.5 h-3.5" /> <span className="md:inline">แก้ไข</span>
                          </button>

                          <button
                            onClick={() => handleDeleteWorkspace(ws.id, ws.name)}
                            className="p-3 py-2.5 md:p-2 md:py-1.5 text-xs md:text-[11px] font-bold md:font-semibold bg-slate-950 border border-slate-800 hover:bg-slate-800 text-red-400 hover:text-red-300 rounded-xl md:rounded-lg flex items-center justify-center gap-1.5 md:gap-1 transition-all flex-1 md:flex-none"
                            title="ลบ Workspace"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> <span className="md:inline">ลบ</span>
                          </button>

                          <button
                            onClick={() => handleEnterWorkspace(ws)}
                            className={`p-3 py-2.5 md:p-2 md:py-1.5 text-xs md:text-[11px] font-bold md:font-semibold rounded-xl md:rounded-lg flex items-center justify-center gap-1.5 md:gap-1 transition-all w-full md:w-auto ${
                              status === "approved"
                                ? "bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/10"
                                : "bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            สลับหอ <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {filteredWorkspaces.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-sm md:text-xs">
                      ไม่พบข้อมูลหอพักที่ค้นหา
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* คอลัมน์ขวา: ฟอร์มเพิ่ม Workspace */}
            <div className="lg:col-span-5 space-y-8">
              <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl">
                <form onSubmit={handleAddWorkspace} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-semibold text-slate-200">สร้างพื้นที่ทำงานหอพักใหม่ (Add Workspace)</h3>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      required
                      placeholder="เช่น ตึก บานเย็น คอร์ท, แสนสบาย เพลส..."
                      className="w-full px-4 py-3.5 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm md:text-xs transition-colors"
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={addingWorkspace}
                      className="px-5 py-3.5 md:py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm md:text-xs font-bold md:font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-blue-600/10 shrink-0"
                    >
                      {addingWorkspace ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-4 h-4" /> เพิ่มหอพัก
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-600/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-200">บัญชีรายชื่อสิทธิ์ผู้ใช้งานทั้งหมด</h2>
                  <p className="text-[11px] text-slate-500">สแกนบทบาททั้งหมด แยกแต่ละตึก และจัดการถอนสิทธิ์ระบบหลัก</p>
                </div>
              </div>

              {/* ค้นหาโปรไฟล์ */}
              <div className="w-full md:w-80 relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 md:pl-3.5 pointer-events-none">
                  <Search className="w-4 h-4 text-slate-500" />
                </span>
                <input
                  type="text"
                  placeholder="ค้นหาด้วย อีเมล, ชื่อ-นามสกุล, หรือสิทธิ์..."
                  className="w-full pl-11 pr-4 py-3.5 md:pl-10 md:pr-4 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 text-sm md:text-xs transition-colors"
                  value={searchProfile}
                  onChange={(e) => setSearchProfile(e.target.value)}
                />
              </div>
            </div>

            {/* ตารางโปรไฟล์ */}
            <div className="overflow-x-auto rounded-2xl border border-slate-900">
              <table className="w-full text-left text-sm md:text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-900">
                    <th className="p-4">อีเมลผู้ใช้งาน</th>
                    <th className="p-4">ชื่อผู้เช่า/ผู้ช่วย</th>
                    <th className="p-4">เบอร์โทร</th>
                    <th className="p-4">สิทธิ์การเข้าถึง</th>
                    <th className="p-4">สังกัดตึก (Workspace)</th>
                    <th className="p-4 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 bg-slate-950/20">
                  {filteredProfiles.map((p) => {
                    const wsName = workspaces.find((w) => w.id === p.workspace_id)?.name || "ไม่มีสังกัด (Global / Super Admin)"
                    return (
                      <tr key={p.id} className="hover:bg-slate-900/25 transition-colors">
                        <td className="p-4 font-semibold text-slate-200">
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-500" />
                            {p.email}
                          </div>
                        </td>
                        <td className="p-4 text-slate-300">
                          {p.full_name || "-"}
                        </td>
                        <td className="p-4 text-slate-400 font-mono">
                          {p.phone ? (
                            <div className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-500" /> {p.phone}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            p.role === "super_admin"
                              ? "bg-purple-500/20 text-purple-400 border border-purple-500/10"
                              : p.role === "admin"
                              ? "bg-red-500/20 text-red-400 border border-red-500/10"
                              : p.role === "staff"
                              ? "bg-teal-500/20 text-teal-400 border border-teal-500/10"
                              : "bg-blue-500/20 text-blue-400 border border-blue-500/10"
                          }`}>
                            {p.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4 text-slate-300 font-medium">
                          {wsName}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setEditingProfile(p)
                                setEditingProfileRole(p.role)
                                setEditingProfileWorkspaceId(p.workspace_id)
                                setEditingProfileFullName(p.full_name || "")
                                setEditingProfilePhone(p.phone || "")
                              }}
                              className="p-3 md:p-1.5 text-purple-400 hover:text-purple-300 bg-purple-500/5 hover:bg-purple-500/15 rounded-xl md:rounded-lg border border-purple-500/10 transition-colors"
                              title="แก้ไขโปรไฟล์ / สิทธิ์"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {p.role !== "super_admin" && (
                              <button
                                onClick={() => handleDeleteProfile(p.id, p.email)}
                                className="p-3 md:p-1.5 text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/15 rounded-xl md:rounded-lg border border-red-500/10 transition-colors"
                                title="ถอนสิทธิ์ผู้ใช้งาน"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}

                  {filteredProfiles.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-slate-500 text-sm md:text-xs">
                        ไม่พบข้อมูลรายชื่อบัญชีผู้ใช้ในระบบ
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "invites" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* คอลัมน์ซ้าย: จัดการบัญชีและบทบาทผู้ใช้งาน (User & Role Provisioning) */}
            <div className="lg:col-span-6 space-y-8">
              <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-6">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-purple-600/10 text-purple-400 rounded-xl border border-purple-500/20">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-200">มอบบทบาท/สิทธิ์ (Add User Role)</h2>
                    <p className="text-[11px] text-slate-500">กำหนดบัญชีผู้ใช้งานระบุ Workspace และระดับสิทธิ์</p>
                  </div>
                </div>

                <form onSubmit={handleAddUser} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">สังกัดหอพัก (Workspace)</label>
                    <select
                      className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl focus:outline-none focus:border-purple-500 text-sm md:text-xs transition-colors"
                      value={selectedWorkspaceId}
                      onChange={(e) => {
                        const val = e.target.value
                        setSelectedWorkspaceId(val)
                        setCookie("horset_super_admin_selected_ws", val)
                      }}
                    >
                      {workspaces.map((ws) => (
                        <option key={ws.id} value={ws.id}>
                          {ws.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-medium">อีเมลใช้งานสำหรับเข้าสู่ระบบ</label>
                      <input
                        type="email"
                        required
                        placeholder="name@horset.com"
                        className="w-full px-4 py-3.5 md:px-3.5 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-sm md:text-xs transition-colors"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-medium">รหัสผ่านสำหรับเข้าสู่ระบบ</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-4 md:pl-3.5 pointer-events-none text-slate-500">
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                        <input
                          type="password"
                          required
                          minLength={6}
                          placeholder="รหัสผ่านอย่างน้อย 6 ตัว"
                          className="w-full pl-11 pr-4 py-3.5 md:pl-9 md:pr-3.5 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-sm md:text-xs transition-colors"
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-medium">ชื่อ-นามสกุล</label>
                      <input
                        type="text"
                        placeholder="เช่น สมใจ รักษ์ดี"
                        className="w-full px-4 py-3.5 md:px-3.5 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-sm md:text-xs transition-colors"
                        value={newUserFullName}
                        onChange={(e) => setNewUserFullName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-medium">เบอร์โทรศัพท์</label>
                      <input
                        type="text"
                        placeholder="08xxxxxxxx"
                        className="w-full px-4 py-3.5 md:px-3.5 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-sm md:text-xs transition-colors"
                        value={newUserPhone}
                        onChange={(e) => setNewUserPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium block">ระดับสิทธิ์ในระบบ (Role)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { role: "admin", label: "แอดมิน (เจ้าของ)" },
                        { role: "staff", label: "ผู้ช่วย (สต๊าฟ)" },
                        { role: "tenant", label: "ผู้เช่าตึก" }
                      ].map((item) => (
                        <button
                          key={item.role}
                          type="button"
                          onClick={() => setNewUserRole(item.role as any)}
                          className={`py-3 px-2 md:py-2 md:px-1 text-center rounded-xl text-sm md:text-[10px] font-bold md:font-semibold border transition-all ${
                            newUserRole === item.role
                              ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/10"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={addingUser || !selectedWorkspaceId}
                    className="w-full mt-2 glow-btn bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold md:font-semibold py-3.5 md:py-2.5 rounded-xl text-sm md:text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-purple-600/10"
                  >
                    {addingUser ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" /> สร้างบัญชีและมอบสิทธิ์
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* คอลัมน์ขวา: ส่วนควบคุมสร้าง Secret Code สำหรับสมัครสมาชิก */}
            <div className="lg:col-span-6 space-y-8">
              <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-6">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-indigo-600/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-200">สร้างรหัสเชิญชวน (Secret Invite Code)</h2>
                    <p className="text-[11px] text-slate-500">รหัสลงทะเบียนล็อคสังกัดตึก มีอายุจำกัด 2 ชม.</p>
                  </div>
                </div>

                <form onSubmit={handleGenerateCode} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">สังกัดตึกที่กำหนด (Locked Workspace)</label>
                    <select
                      className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl focus:outline-none focus:border-indigo-500 text-sm md:text-xs transition-colors"
                      value={genWorkspaceId}
                      onChange={(e) => {
                        const val = e.target.value
                        setGenWorkspaceId(val)
                        setCookie("horset_super_admin_gen_ws", val)
                      }}
                    >
                      {workspaces.map((ws) => (
                        <option key={ws.id} value={ws.id}>
                          {ws.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium block">ระดับสิทธิ์เมื่อสมัครสำเร็จ (Designated Role)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { role: "admin", label: "แอดมิน (เจ้าของ)" },
                        { role: "staff", label: "ผู้ช่วย (สต๊าฟ)" },
                        { role: "tenant", label: "ผู้เช่าตึก" }
                      ].map((item) => (
                        <button
                          key={item.role}
                          type="button"
                          onClick={() => setGenRole(item.role as any)}
                          className={`py-3 px-2 md:py-2 md:px-1 text-center rounded-xl text-sm md:text-[10px] font-bold md:font-semibold border transition-all ${
                            genRole === item.role
                              ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={generatingCode || !genWorkspaceId}
                    className="w-full mt-2 glow-btn bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold md:font-semibold py-3.5 md:py-2.5 rounded-xl text-sm md:text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-indigo-600/10"
                  >
                    {generatingCode ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4" /> สร้าง Secret Code (มีอายุ 2 ชม.)
                      </>
                    )}
                  </button>
                </form>

                {/* รายการรหัสเชิญชวน */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-semibold text-slate-300">รายการรหัสเชิญชวนทั้งหมด</h3>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {registrationCodes.map((item) => {
                      const wsName = workspaces.find((w) => w.id === item.workspace_id)?.name || "ตึกที่ถูกลบ"
                      const isExpired = new Date(item.expires_at) < new Date()
                      return (
                        <div
                          key={item.code}
                          className="p-4 md:p-3 rounded-xl bg-slate-950/60 border border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm md:text-xs"
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded text-sm md:text-xs select-all">
                                {item.code}
                              </span>
                              <span className="text-[11px] md:text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 font-bold">
                                {item.role.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-xs md:text-[10px] text-slate-400 truncate">
                              ตึก: {wsName}
                            </p>
                            <p className="text-[11px] md:text-[9px] text-slate-500 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 md:w-3 md:h-3" /> หมดอายุ: {new Date(item.expires_at).toLocaleTimeString("th-TH")}
                            </p>
                          </div>

                          <div className="flex flex-col sm:flex-row md:flex-row items-stretch sm:items-center gap-2 shrink-0">
                            {item.is_used ? (
                              <span className="text-[10px] md:text-[9px] bg-teal-500/10 border border-teal-500/25 text-teal-400 font-semibold px-2 py-1 md:py-0.5 rounded-lg text-center">
                                ใช้แล้ว ({item.used_by_email?.split("@")[0]})
                              </span>
                            ) : isExpired ? (
                              <span className="text-[10px] md:text-[9px] bg-red-500/10 border border-red-500/25 text-red-400 font-semibold px-2 py-1 md:py-0.5 rounded-lg text-center">
                                หมดอายุ
                              </span>
                            ) : (
                              <span className="text-[10px] md:text-[9px] bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-semibold px-2 py-1 md:py-0.5 rounded-lg animate-pulse text-center">
                                พร้อมใช้
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteCode(item.code)}
                              className="p-3 md:p-1.5 text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/15 rounded-xl md:rounded-lg border border-red-500/10 transition-colors w-full md:w-auto flex items-center justify-center gap-1.5"
                              title="ลบ Code"
                            >
                              <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                              <span className="md:hidden text-xs font-bold">ลบรหัสนี้</span>
                            </button>
                          </div>
                        </div>
                      )
                    })}

                    {registrationCodes.length === 0 && (
                      <div className="text-center py-6 text-slate-500 text-sm md:text-xs">
                        ยังไม่มีรหัสเชิญชวนในระบบ
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Workspace Edit Modal */}
        {editingWorkspace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-300">
            <div className="w-full max-w-md glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl relative space-y-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-blue-600/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-200">แก้ไขพื้นที่ทำงาน (Edit Workspace)</h3>
                    <p className="text-[10px] text-slate-500">เปลี่ยนชื่อหอพักหรือตึกในระบบ</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingWorkspace(null)}
                  className="p-2 md:p-1.5 hover:bg-slate-900 text-slate-400 hover:text-slate-200 rounded-xl border border-slate-800/80 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateWorkspaceName} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-medium">ชื่อพื้นที่ทำงาน/ชื่อตึก</label>
                  <input
                    type="text"
                    required
                    placeholder="ระบุชื่อหอพัก..."
                    className="w-full px-4 py-3.5 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 text-sm md:text-xs transition-colors"
                    value={editingWorkspaceName}
                    onChange={(e) => setEditingWorkspaceName(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingWorkspace(null)}
                    className="flex-1 py-3 md:py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-sm md:text-xs font-bold md:font-semibold transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={updatingWorkspace}
                    className="flex-1 py-3 md:py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm md:text-xs font-bold md:font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-blue-600/10"
                  >
                    {updatingWorkspace ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      "บันทึกการเปลี่ยนแปลง"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Profile Edit Modal */}
        {editingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-300">
            <div className="w-full max-w-lg glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl relative space-y-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-purple-600/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-purple-600/10 text-purple-400 rounded-xl border border-purple-500/20">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-200">แก้ไขข้อมูลผู้ใช้งานและสิทธิ์ (Edit Profile)</h3>
                    <p className="text-[10px] text-slate-500">จัดการอีเมล: {editingProfile.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="p-2 md:p-1.5 hover:bg-slate-900 text-slate-400 hover:text-slate-200 rounded-xl border border-slate-800/80 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">ชื่อ-นามสกุล</label>
                    <input
                      type="text"
                      placeholder="เช่น สมใจ รักษ์ดี"
                      className="w-full px-4 py-3.5 md:px-3.5 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-sm md:text-xs transition-colors"
                      value={editingProfileFullName}
                      onChange={(e) => setEditingProfileFullName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">เบอร์โทรศัพท์</label>
                    <input
                      type="text"
                      placeholder="08xxxxxxxx"
                      className="w-full px-4 py-3.5 md:px-3.5 md:py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-sm md:text-xs transition-colors"
                      value={editingProfilePhone}
                      onChange={(e) => setEditingProfilePhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-medium block">สังกัดหอพัก (Workspace)</label>
                  <select
                    className="w-full px-4 py-3.5 md:px-3 md:py-2.5 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl focus:outline-none focus:border-purple-500 text-sm md:text-xs transition-colors"
                    value={editingProfileWorkspaceId || ""}
                    onChange={(e) => setEditingProfileWorkspaceId(e.target.value || null)}
                  >
                    <option value="">ไม่มีสังกัด (Global / Super Admin)</option>
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-medium block">ระดับสิทธิ์ในระบบ (Role)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { role: "super_admin", label: "Super Admin" },
                      { role: "admin", label: "แอดมิน (เจ้าของ)" },
                      { role: "staff", label: "ผู้ช่วย (สต๊าฟ)" },
                      { role: "tenant", label: "ผู้เช่าตึก" }
                    ].map((item) => (
                      <button
                        key={item.role}
                        type="button"
                        onClick={() => setEditingProfileRole(item.role as any)}
                        className={`py-3 px-2 md:py-2 md:px-1 text-center rounded-xl text-sm md:text-[10px] font-bold md:font-semibold border transition-all ${
                          editingProfileRole === item.role
                            ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/10"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingProfile(null)}
                    className="flex-1 py-3 md:py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-sm md:text-xs font-bold md:font-semibold transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={updatingProfile}
                    className="flex-1 py-3 md:py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm md:text-xs font-bold md:font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-purple-600/10"
                  >
                    {updatingProfile ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      "บันทึกการเปลี่ยนแปลง"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}
