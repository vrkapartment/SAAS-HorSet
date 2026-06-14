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
  Key,
  Copy,
  Check,
  Globe,
  Terminal,
  ChevronRight,
  FileText
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

export default function SuperAdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setResultSuccess] = useState<string | null>(null)

  // ข้อมูลจากฐานข้อมูล
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [profiles, setProfiles] = useState<ProfileItem[]>([])
  const [supportGrants, setSupportGrants] = useState<{ [key: string]: string }>({})

  // คืนค่าคัดลอกรหัสเชิญชวนสำเร็จชั่วคราว
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // ค้นหาและคัดกรอง
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

  // ฟังก์ชันช่วยคัดลอกลง Clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCode(text)
    setTimeout(() => setCopiedCode(null), 2000)
  }

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
          const savedSelectedWs = localStorage.getItem("horset_super_admin_selected_ws")
          const savedGenWs = localStorage.getItem("horset_super_admin_gen_ws")

          const matchedSelected = savedSelectedWs && wsData.some(w => w.id === savedSelectedWs)
          const matchedGen = savedGenWs && wsData.some(w => w.id === savedGenWs)

          const finalSelectedId = matchedSelected ? savedSelectedWs : wsData[0].id
          const finalGenId = matchedGen ? savedGenWs : wsData[0].id

          setSelectedWorkspaceId(finalSelectedId)
          setGenWorkspaceId(finalGenId)

          if (!savedSelectedWs) {
            localStorage.setItem("horset_super_admin_selected_ws", finalSelectedId)
          }
          if (!savedGenWs) {
            localStorage.setItem("horset_super_admin_gen_ws", finalGenId)
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
    // โหลดจาก localStorage
    const localWorkspaces = localStorage.getItem("horset_workspaces")
    const mockWs: Workspace[] = localWorkspaces
      ? JSON.parse(localWorkspaces)
      : [
          { id: "d290f1ee-6c54-4b01-90e6-d701748f0851", name: "แสนสุข แมนชั่น (Default)", created_at: new Date().toISOString() },
          { id: "e390f1ee-6c54-4b01-90e6-d701748f0852", name: "ร่มรื่น เรสซิเดนท์ (Demo 2)", created_at: new Date().toISOString() }
        ]
    setWorkspaces(mockWs)

    const savedSelectedWs = localStorage.getItem("horset_super_admin_selected_ws")
    const savedGenWs = localStorage.getItem("horset_super_admin_gen_ws")

    if (mockWs.length > 0) {
      const matchedSelected = savedSelectedWs && mockWs.some(w => w.id === savedSelectedWs)
      const matchedGen = savedGenWs && mockWs.some(w => w.id === savedGenWs)

      const finalSelectedId = matchedSelected ? savedSelectedWs : mockWs[0].id
      const finalGenId = matchedGen ? savedGenWs : mockWs[0].id

      setSelectedWorkspaceId(finalSelectedId)
      setGenWorkspaceId(finalGenId)

      if (!savedSelectedWs) {
        localStorage.setItem("horset_super_admin_selected_ws", finalSelectedId)
      }
      if (!savedGenWs) {
        localStorage.setItem("horset_super_admin_gen_ws", finalGenId)
      }
    }

    const localProfiles = localStorage.getItem("horset_profiles")
    const mockProfs: ProfileItem[] = localProfiles
      ? JSON.parse(localProfiles)
      : [
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
      grantMap[ws.id] = localStorage.getItem(`horset_support_status_${ws.id}`) || "none"
    })
    setSupportGrants(grantMap)

    // โหลดข้อมูลรหัสเชิญชวนแบบจำลอง
    const localCodes = localStorage.getItem("horset_registration_codes")
    const mockCodes: RegistrationCode[] = localCodes ? JSON.parse(localCodes) : []
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
      // โหมด Demo บันทึกลง localStorage
      const updated = [newWs, ...workspaces]
      setWorkspaces(updated)
      localStorage.setItem("horset_workspaces", JSON.stringify(updated))
      localStorage.setItem(`horset_support_status_${newId}`, "none")
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
      // โหมด Demo บันทึกลง localStorage
      const updated = [newProfile, ...profiles]
      setProfiles(updated)
      localStorage.setItem("horset_profiles", JSON.stringify(updated))
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
    localStorage.setItem("horset_current_workspace_id", ws.id)
    document.cookie = `horset_current_workspace_id=${ws.id}; path=/; max-age=86400`
    
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
      localStorage.setItem("horset_profiles", JSON.stringify(updated))
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
      localStorage.setItem("horset_workspaces", JSON.stringify(updatedWs))

      // ลบสิทธิ์ช่วยเหลือด้วยถ้ามี
      localStorage.removeItem(`horset_support_status_${id}`)

      // ปรับโปรไฟล์ที่เกี่ยวข้องให้ไม่มีสังกัด
      const updatedProfs = profiles.map((p) => p.workspace_id === id ? { ...p, workspace_id: null } : p)
      setProfiles(updatedProfs)
      localStorage.setItem("horset_profiles", JSON.stringify(updatedProfs))

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
      localStorage.setItem("horset_workspaces", JSON.stringify(updated))
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
      localStorage.setItem("horset_profiles", JSON.stringify(updated))
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
      localStorage.setItem("horset_registration_codes", JSON.stringify(updated))
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
      localStorage.setItem("horset_registration_codes", JSON.stringify(updated))
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
      <div className="relative space-y-8 pb-16 overflow-hidden">
        
        {/* Background Glowing Ambient Orbs */}
        <div className="absolute top-[-10%] right-[-15%] w-[600px] h-[600px] bg-purple-500/5 dark:bg-purple-600/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-[20%] left-[-15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-[40%] right-[-10%] w-[350px] h-[350px] bg-violet-500/5 dark:bg-violet-600/5 rounded-full blur-[90px] pointer-events-none" />

        {/* Header Console Banner */}
        <div className="relative p-8 rounded-3xl overflow-hidden backdrop-blur-md bg-slate-900/60 border border-purple-500/20 shadow-[0_8px_32px_rgba(147,51,234,0.1)] transition-all hover:border-purple-500/30">
          <div className="absolute top-0 right-0 w-[400px] h-[200px] bg-purple-600/15 rounded-full blur-[100px] pointer-events-none" />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold rounded-full text-xs uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400 animate-pulse" /> 
                ระบบจัดการส่วนควบคุมหลัก • Super Admin
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-purple-400">
                Super Admin Control Panel
              </h1>
              <p className="text-slate-400 text-sm max-w-xl leading-relaxed">
                แผงควบคุมหลักแบบพรีเมียม เพื่อจัดการพื้นที่ทำงาน (Workspace) ดูแลระดับสิทธิ์การเข้าถึง และออกรหัสเชิญชวนอย่างมีประสิทธิภาพและปลอดภัยสูงสุด
              </p>
            </div>
            
            <button
              onClick={loadData}
              disabled={loading}
              className="px-5 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-purple-500/40 hover:bg-slate-900 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shrink-0 self-start lg:self-center hover:-translate-y-0.5 active:scale-95 duration-300 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-purple-400 ${loading ? "animate-spin" : ""}`} /> 
              รีเฟรชข้อมูลระบบ
            </button>
          </div>
        </div>

        {/* Banner Toast Alerts */}
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-xs flex items-center gap-3 shadow-lg shadow-rose-500/5 animate-in fade-in slide-in-from-top-1 duration-300">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}
        {success && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs flex items-center gap-3 shadow-lg shadow-emerald-500/5 animate-in fade-in slide-in-from-top-1 duration-300">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold">{success}</span>
          </div>
        )}

        {/* Main Workspaces and Provisioning Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
          
          {/* LEFT COLUMN: Workspace Management (lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-8">
            
            <div className="backdrop-blur-md bg-slate-900/60 p-6 rounded-3xl border border-slate-800/80 shadow-2xl space-y-6">
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-600/10 text-purple-400 rounded-2xl border border-purple-500/20">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-100">พื้นที่ทำงานทั้งหมด (Workspaces)</h2>
                    <p className="text-[11px] text-slate-500">ตรวจสอบ แก้ไข และเข้าสิทธิ์ช่วยเหลือดูแลในตึกต่างๆ</p>
                  </div>
                </div>
              </div>

              {/* Workspace Search Input */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <Search className="w-4 h-4 text-slate-500" />
                </span>
                <input
                  type="text"
                  placeholder="ค้นหาชื่อหอพัก/Workspace..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 text-slate-200 transition-all text-xs placeholder-slate-500"
                  value={searchWorkspace}
                  onChange={(e) => setSearchWorkspace(e.target.value)}
                />
              </div>

              {/* Workspace Scrollable List */}
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-purple-500/20 scrollbar-track-transparent">
                {filteredWorkspaces.map((ws) => {
                  const status = supportGrants[ws.id] || "none"
                  return (
                    <div
                      key={ws.id}
                      className="p-4 rounded-2xl bg-slate-950/30 border border-slate-900/80 hover:border-purple-500/20 hover:bg-slate-950/60 transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-200 truncate">{ws.name}</h4>
                          
                          {/* Active state micro-indicators */}
                          {status === "approved" ? (
                            <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 shrink-0">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                              อนุมัติช่วยเหลือ
                            </span>
                          ) : status === "pending" ? (
                            <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-lg animate-pulse shrink-0">
                              ⏳ รอยืนยันคำขอ
                            </span>
                          ) : (
                            <span className="text-[9px] bg-slate-800 border border-slate-700/60 text-slate-400 font-bold px-2 py-0.5 rounded-lg shrink-0">
                              ✕ ไม่มีสิทธิ์
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
                          <span>ID: {ws.id.substring(0, 8)}...</span>
                          <span className="flex items-center gap-1 font-sans">
                            <Clock className="w-3 h-3 text-slate-500" /> {new Date(ws.created_at).toLocaleDateString("th-TH")}
                          </span>
                        </div>
                      </div>

                      {/* Workspace Controls */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => {
                            setEditingWorkspace(ws)
                            setEditingWorkspaceName(ws.name)
                          }}
                          className="p-2 py-1.5 text-[11px] font-semibold bg-slate-950 border border-slate-800/80 hover:border-purple-500/30 hover:bg-purple-500/5 text-purple-400 hover:text-purple-300 rounded-xl flex items-center gap-1 transition-all hover:-translate-y-0.5 active:scale-95 duration-200"
                          title="แก้ไขชื่อ Workspace"
                        >
                          <Edit className="w-3.5 h-3.5" /> แก้ไข
                        </button>

                        <button
                          onClick={() => handleDeleteWorkspace(ws.id, ws.name)}
                          className="p-2 py-1.5 text-[11px] font-semibold bg-slate-950 border border-slate-800/80 hover:border-rose-500/30 hover:bg-rose-500/5 text-rose-400 hover:text-rose-300 rounded-xl flex items-center gap-1 transition-all hover:-translate-y-0.5 active:scale-95 duration-200"
                          title="ลบ Workspace"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> ลบ
                        </button>

                        <button
                          onClick={() => handleEnterWorkspace(ws)}
                          className={`p-2 py-1.5 text-[11px] font-bold rounded-xl flex items-center gap-1 transition-all hover:-translate-y-0.5 active:scale-95 duration-250 ${
                            status === "approved"
                              ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:via-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-purple-600/25"
                              : "bg-slate-950 border border-slate-800/80 hover:bg-slate-850 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          สลับหอ <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {filteredWorkspaces.length === 0 && (
                  <div className="text-center py-12 rounded-2xl bg-slate-950/20 border border-slate-900 border-dashed text-slate-500 text-xs space-y-2">
                    <Building className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
                    <p>ไม่พบข้อมูลหอพักที่ต้องการค้นหา</p>
                  </div>
                )}
              </div>
            </div>

            {/* Create Workspace Panel Form */}
            <div className="backdrop-blur-md bg-slate-900/60 p-6 rounded-3xl border border-slate-800/80 shadow-2xl">
              <form onSubmit={handleAddWorkspace} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-semibold text-slate-200">สร้างพื้นที่ทำงานหอพักใหม่ (Add Workspace)</h3>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    placeholder="เช่น ตึก บานเย็น คอร์ท, แสนสบาย เพลส..."
                    className="flex-1 px-4 py-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-xs transition-colors"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={addingWorkspace}
                    className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all hover:-translate-y-0.5 active:scale-95 shadow-lg shadow-purple-600/10 shrink-0"
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

          {/* RIGHT COLUMN: Provisioning and Secret Invitation Codes (lg:col-span-5) */}
          <div className="lg:col-span-5 space-y-8">
            
            {/* Create User & Role Form */}
            <div className="backdrop-blur-md bg-slate-900/60 p-6 rounded-3xl border border-slate-800/80 shadow-2xl space-y-6">
              <div className="flex items-center gap-2.5">
                <div className="p-3 bg-purple-600/10 text-purple-400 rounded-2xl border border-purple-500/20">
                  <UserPlus className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">มอบสิทธิ์และบทบาท (Add User)</h2>
                  <p className="text-[11px] text-slate-500">สร้างผู้ใช้งานใหม่พร้อมระบุระดับความปลอดภัย</p>
                </div>
              </div>

              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-medium">สังกัดหอพัก (Workspace)</label>
                  <select
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl focus:outline-none focus:border-purple-500 text-xs transition-colors"
                    value={selectedWorkspaceId}
                    onChange={(e) => {
                      const val = e.target.value
                      setSelectedWorkspaceId(val)
                      localStorage.setItem("horset_super_admin_selected_ws", val)
                    }}
                  >
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">อีเมลผู้ใช้</label>
                    <input
                      type="email"
                      required
                      placeholder="name@horset.com"
                      className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-xs transition-colors"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">กำหนดรหัสผ่าน</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="อย่างน้อย 6 ตัว"
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-xs transition-colors"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">ชื่อ-นามสกุล</label>
                    <input
                      type="text"
                      placeholder="เช่น สมใจ รักษ์ดี"
                      className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-xs transition-colors"
                      value={newUserFullName}
                      onChange={(e) => setNewUserFullName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">เบอร์โทรศัพท์</label>
                    <input
                      type="text"
                      placeholder="08xxxxxxxx"
                      className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-xs transition-colors"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-medium block">ระดับสิทธิ์ (Role)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { role: "admin", label: "แอดมิน (เจ้าของ)" },
                      { role: "staff", label: "ผู้ช่วย (สต๊าฟ)" },
                      { role: "tenant", label: "ผู้เช่าหอ" }
                    ].map((item) => (
                      <button
                        key={item.role}
                        type="button"
                        onClick={() => setNewUserRole(item.role as any)}
                        className={`py-2 px-1 text-center rounded-xl text-[10px] font-bold border transition-all duration-200 ${
                          newUserRole === item.role
                            ? "bg-gradient-to-r from-purple-600 to-indigo-600 border-purple-500 text-white shadow-lg shadow-purple-600/15"
                            : "bg-slate-950 border-slate-800/85 text-slate-400 hover:text-slate-200 hover:bg-slate-900"
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
                  className="w-full mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all hover:-translate-y-0.5 active:scale-95 shadow-lg shadow-purple-600/20"
                >
                  {addingUser ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" /> สร้างบัญชีผู้ใช้และสิทธิ์
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Secret Invitation Codes Section */}
            <div className="backdrop-blur-md bg-slate-900/60 p-6 rounded-3xl border border-slate-800/80 shadow-2xl space-y-6">
              <div className="flex items-center gap-2.5">
                <div className="p-3 bg-indigo-600/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
                  <Key className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">ออกรหัสลงทะเบียน (Secret Code)</h2>
                  <p className="text-[11px] text-slate-500">รหัสสมัครสมาชิกสำหรับผู้เข้าใช้หอพัก (หมดอายุ 2 ชม.)</p>
                </div>
              </div>

              <form onSubmit={handleGenerateCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-medium">ตึกที่ผูกมัด (Locked Workspace)</label>
                  <select
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl focus:outline-none focus:border-indigo-500 text-xs transition-colors"
                    value={genWorkspaceId}
                    onChange={(e) => {
                      const val = e.target.value
                      setGenWorkspaceId(val)
                      localStorage.setItem("horset_super_admin_gen_ws", val)
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
                  <label className="text-[11px] text-slate-400 font-medium block">สิทธิ์ที่ได้รับเมื่อลงทะเบียน (Designated Role)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { role: "admin", label: "แอดมิน (เจ้าของ)" },
                      { role: "staff", label: "ผู้ช่วย (สต๊าฟ)" },
                      { role: "tenant", label: "ผู้เช่าหอ" }
                    ].map((item) => (
                      <button
                        key={item.role}
                        type="button"
                        onClick={() => setGenRole(item.role as any)}
                        className={`py-2 px-1 text-center rounded-xl text-[10px] font-bold border transition-all duration-200 ${
                          genRole === item.role
                            ? "bg-gradient-to-r from-indigo-600 to-blue-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/15"
                            : "bg-slate-950 border-slate-800/85 text-slate-400 hover:text-slate-200 hover:bg-slate-900"
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
                  className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all hover:-translate-y-0.5 active:scale-95 shadow-lg shadow-indigo-600/20"
                >
                  {generatingCode ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> ออกรหัสลงทะเบียน (HS-XXXXXX)
                    </>
                  )}
                </button>
              </form>

              {/* Invitation Code List */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-slate-300">รหัสเชิญชวนในระบบ</h3>
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-indigo-500/20 scrollbar-track-transparent">
                  {registrationCodes.map((item) => {
                    const wsName = workspaces.find((w) => w.id === item.workspace_id)?.name || "ตึกที่ถูกลบ"
                    const isExpired = new Date(item.expires_at) < new Date()
                    return (
                      <div
                        key={item.code}
                        className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-900 flex items-center justify-between gap-3 text-xs hover:border-indigo-500/10 transition-all duration-200"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-lg text-xs select-all">
                              {item.code}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(item.code)}
                              className="p-1 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-md transition-all hover:border-indigo-500/30"
                              title="คัดลอกรหัส"
                            >
                              {copiedCode === item.code ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <span className="text-[9px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 font-bold">
                              {item.role.toUpperCase()}
                            </span>
                          </div>
                          
                          <p className="text-[10px] text-slate-400 truncate">
                            ตึก: {wsName}
                          </p>
                          <p className="text-[9px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" /> หมดอายุ: {new Date(item.expires_at).toLocaleTimeString("th-TH")}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.is_used ? (
                            <span className="text-[9px] bg-teal-500/10 border border-teal-500/25 text-teal-400 font-bold px-2 py-0.5 rounded-lg">
                              ใช้แล้ว ({item.used_by_email?.split("@")[0]})
                            </span>
                          ) : isExpired ? (
                            <span className="text-[9px] bg-rose-500/10 border border-rose-500/25 text-rose-400 font-bold px-2 py-0.5 rounded-lg">
                              หมดอายุ
                            </span>
                          ) : (
                            <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold px-2 py-0.5 rounded-lg animate-pulse">
                              พร้อมใช้
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteCode(item.code)}
                            className="p-2 text-rose-400 hover:text-rose-300 bg-rose-500/5 hover:bg-rose-500/15 rounded-xl border border-rose-500/10 transition-colors"
                            title="ลบ Code"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {registrationCodes.length === 0 && (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      ยังไม่มีรหัสเชิญชวนในระบบ
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* BOTTOM SECTION: Full User Registry Directory */}
        <div className="backdrop-blur-md bg-slate-900/60 p-6 rounded-3xl border border-slate-800/80 shadow-2xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-600/10 text-purple-400 rounded-2xl border border-purple-500/20">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">บัญชีรายชื่อสิทธิ์ผู้ใช้งานทั้งหมด</h2>
                <p className="text-[11px] text-slate-500">ตรวจสอบสิทธิ์ระดับ Global สังกัด Workspace และถอนสิทธิ์ระบบหลัก</p>
              </div>
            </div>

            {/* Profile search queries */}
            <div className="w-full md:w-80 relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <Search className="w-4 h-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="ค้นหาด้วย อีเมล, ชื่อ-นามสกุล, หรือสิทธิ์..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 text-slate-200 transition-colors text-xs placeholder-slate-500"
                value={searchProfile}
                onChange={(e) => setSearchProfile(e.target.value)}
              />
            </div>
          </div>

          {/* TABLE RESPONSIVE TRANSFORMATION (Part 4, Rule 5 of UXUI.md) */}
          
          {/* 1. Desktop View Table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-900">
            <table className="w-full text-left text-xs border-collapse">
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
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/10"
                            : p.role === "staff"
                            ? "bg-teal-500/20 text-teal-400 border border-teal-500/10"
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/10"
                        }`}>
                          {p.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-4 text-slate-300 font-semibold">
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
                            className="p-1.5 text-purple-400 hover:text-purple-300 bg-purple-500/5 hover:bg-purple-500/15 rounded-lg border border-purple-500/10 transition-colors"
                            title="แก้ไขโปรไฟล์ / สิทธิ์"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {p.role !== "super_admin" && (
                            <button
                              onClick={() => handleDeleteProfile(p.id, p.email)}
                              className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-500/5 hover:bg-rose-500/15 rounded-lg border border-rose-500/10 transition-colors"
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
              </tbody>
            </table>
          </div>

          {/* 2. Mobile View Card List */}
          <div className="block md:hidden space-y-4">
            {filteredProfiles.map((p) => {
              const wsName = workspaces.find((w) => w.id === p.workspace_id)?.name || "ไม่มีสังกัด (Global / Super Admin)"
              return (
                <div 
                  key={p.id} 
                  className="p-4 rounded-2xl bg-slate-950/40 border border-slate-900 hover:border-purple-500/20 transition-all duration-300 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-slate-200 font-semibold break-all text-xs">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        {p.email}
                      </div>
                      {p.full_name && (
                        <p className="text-xs text-slate-300">{p.full_name}</p>
                      )}
                    </div>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${
                      p.role === "super_admin"
                        ? "bg-purple-500/20 text-purple-400 border border-purple-500/10"
                        : p.role === "admin"
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/10"
                        : p.role === "staff"
                        ? "bg-teal-500/20 text-teal-400 border border-teal-500/10"
                        : "bg-blue-500/20 text-blue-400 border border-blue-500/10"
                    }`}>
                      {p.role.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-slate-900/60 pt-2.5 text-slate-400">
                    <div>
                      <span className="text-[9px] text-slate-500 block">สังกัดตึก (Workspace)</span>
                      <span className="text-slate-300 font-medium">{wsName}</span>
                    </div>
                    {p.phone && (
                      <div>
                        <span className="text-[9px] text-slate-500 block">เบอร์โทรศัพท์</span>
                        <span className="text-slate-300 font-mono">{p.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-900/60 pt-3">
                    <button
                      onClick={() => {
                        setEditingProfile(p)
                        setEditingProfileRole(p.role)
                        setEditingProfileWorkspaceId(p.workspace_id)
                        setEditingProfileFullName(p.full_name || "")
                        setEditingProfilePhone(p.phone || "")
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-purple-400 hover:text-purple-300 bg-purple-500/5 hover:bg-purple-500/15 rounded-xl border border-purple-500/10 transition-all active:scale-95"
                    >
                      <Edit className="w-3.5 h-3.5" /> แก้ไขสิทธิ์
                    </button>
                    {p.role !== "super_admin" && (
                      <button
                        onClick={() => handleDeleteProfile(p.id, p.email)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 bg-rose-500/5 hover:bg-rose-500/15 rounded-xl border border-rose-500/10 transition-all active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> ถอนสิทธิ์
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {filteredProfiles.length === 0 && (
            <div className="text-center py-10 text-slate-500 text-xs">
              ไม่พบข้อมูลรายชื่อบัญชีผู้ใช้ในระบบ
            </div>
          )}
        </div>

        {/* Modal: Edit Workspace Name */}
        {editingWorkspace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-300">
            <div className="w-full max-w-md backdrop-blur-md bg-slate-900/90 p-6 rounded-3xl border border-slate-800 shadow-2xl relative space-y-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-purple-600/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-3 bg-purple-600/10 text-purple-400 rounded-2xl border border-purple-500/20">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-200">แก้ไขพื้นที่ทำงาน (Edit Workspace)</h3>
                    <p className="text-[10px] text-slate-500">เปลี่ยนชื่อหอพักหรืออาคารในระบบ</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingWorkspace(null)}
                  className="p-1.5 hover:bg-slate-900 text-slate-400 hover:text-slate-200 rounded-xl border border-slate-800/80 transition-all"
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
                    className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-xs transition-colors"
                    value={editingWorkspaceName}
                    onChange={(e) => setEditingWorkspaceName(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingWorkspace(null)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={updatingWorkspace}
                    className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-purple-600/10"
                  >
                    {updatingWorkspace ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      "บันทึกข้อมูล"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Profile & Role Access */}
        {editingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-300">
            <div className="w-full max-w-lg backdrop-blur-md bg-slate-900/90 p-6 rounded-3xl border border-slate-800 shadow-2xl relative space-y-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-purple-600/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-3 bg-purple-600/10 text-purple-400 rounded-2xl border border-purple-500/20">
                    <Users className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-200">แก้ไขข้อมูลผู้ใช้งานและสิทธิ์</h3>
                    <p className="text-[10px] text-slate-500">จัดการอีเมล: {editingProfile.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="p-1.5 hover:bg-slate-900 text-slate-400 hover:text-slate-200 rounded-xl border border-slate-800/80 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">ชื่อ-นามสกุล</label>
                    <input
                      type="text"
                      placeholder="เช่น สมใจ รักษ์ดี"
                      className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-xs transition-colors"
                      value={editingProfileFullName}
                      onChange={(e) => setEditingProfileFullName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-medium">เบอร์โทรศัพท์</label>
                    <input
                      type="text"
                      placeholder="08xxxxxxxx"
                      className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:outline-none focus:border-purple-500 text-slate-200 text-xs transition-colors"
                      value={editingProfilePhone}
                      onChange={(e) => setEditingProfilePhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-medium block">สังกัดหอพัก (Workspace)</label>
                  <select
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl focus:outline-none focus:border-purple-500 text-xs transition-colors"
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
                      { role: "admin", label: "แอดมิน" },
                      { role: "staff", label: "ผู้ช่วย" },
                      { role: "tenant", label: "ผู้เช่าตึก" }
                    ].map((item) => (
                      <button
                        key={item.role}
                        type="button"
                        onClick={() => setEditingProfileRole(item.role as any)}
                        className={`py-2 px-1 text-center rounded-xl text-[10px] font-bold border transition-all duration-200 ${
                          editingProfileRole === item.role
                            ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/15"
                            : "bg-slate-900 border-slate-800/85 text-slate-400 hover:text-slate-200 hover:bg-slate-850"
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
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={updatingProfile}
                    className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-purple-600/10"
                  >
                    {updatingProfile ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      "บันทึกข้อมูล"
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
