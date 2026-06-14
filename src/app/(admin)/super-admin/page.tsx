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
  Clock,
  Lock,
  Edit,
  X,
  Key,
  Copy
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

  // สำหรับฟังก์ชันคัดลอกรหัสเชิญชวน (Premium Clipboard Utility)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

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
        setError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้: " + err.message + " กำลังรันระบบจำลองการทำงานภายในเครื่อง...")
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

  // ฟังก์ชันคัดลอกรหัสเชิญชวนไปยัง Clipboard
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 1500)
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

  // คำนวณค่าสถิติหลักของระบบ
  const totalWorkspaces = workspaces.length
  const totalAccounts = profiles.length
  const activeInviteKeys = registrationCodes.filter(
    (c) => !c.is_used && new Date(c.expires_at) >= new Date()
  ).length

  return (
    <DashboardLayout role="super_admin">
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 p-2 sm:p-4 md:p-6 lg:p-8 space-y-8 transition-colors duration-300">
        
        {/* หัวข้อ แนะนำผู้ดูแลระบบ */}
        <div className="relative p-6 md:p-8 rounded-2xl overflow-hidden bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/50 shadow-md">
          {/* Ambient overlay glow for depth */}
          <div className="absolute top-0 right-0 w-[300px] h-[150px] bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-transparent rounded-full blur-[80px] pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400 font-bold rounded-full text-xs uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" /> แผงควบคุมระบบควบคุมหลัก
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                Super Admin Console
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm max-w-2xl leading-relaxed">
                ระบบจัดการส่วนควบคุมหลักแบบรวมศูนย์ ตรวจสอบและดูแลข้อมูลพื้นที่ทำงาน (Workspace) บริหารจัดการสิทธิ์การเข้าถึง บัญชีผู้ใช้ ตลอดจนออกรหัสเชิญชวนในการเข้าลงทะเบียนใช้งาน
              </p>
            </div>
            
            <button
              onClick={loadData}
              className="px-5 py-3 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-all text-xs font-semibold flex items-center gap-2 shadow-sm shrink-0 self-start md:self-center hover:-translate-y-0.5 active:scale-95 duration-200 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-500" : ""}`} /> 
              รีเฟรชข้อมูลระบบ
            </button>
          </div>
        </div>

        {/* PREMIUM STATS PANEL GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Workspaces */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-6 shadow-sm flex items-center justify-between hover:shadow-md hover:border-blue-500/30 dark:hover:border-blue-500/30 transition-all duration-300 hover:-translate-y-0.5">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">พื้นที่ทำงานทั้งหมด</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{totalWorkspaces}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">หอพักและแมนชั่นสังกัด</span>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-100 dark:border-blue-800/40">
              <Building className="w-6 h-6" />
            </div>
          </div>

          {/* Card 2: Profiles */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-6 shadow-sm flex items-center justify-between hover:shadow-md hover:border-indigo-500/30 dark:hover:border-indigo-500/30 transition-all duration-300 hover:-translate-y-0.5">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">บัญชีในระบบรวม</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{totalAccounts}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">ผู้ใช้, แอดมิน และผู้ช่วย</span>
            </div>
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-800/40">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* Card 3: Active keys */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-6 shadow-sm flex items-center justify-between hover:shadow-md hover:border-emerald-500/30 dark:hover:border-emerald-500/30 transition-all duration-300 hover:-translate-y-0.5">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">รหัสเชิญชวนพร้อมใช้งาน</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{activeInviteKeys}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">คีย์ลงทะเบียนที่มีอายุคงเหลือ</span>
            </div>
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-100 dark:border-emerald-800/40">
              <Key className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* แสดงผลแจ้งเตือนสถานะสำเร็จ / ข้อผิดพลาด */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-red-800 dark:text-red-400 rounded-2xl text-xs md:text-sm flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-1">
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}
        {success && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400 rounded-2xl text-xs md:text-sm flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="font-medium">{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* คอลัมน์ซ้าย: จัดการพื้นที่ทำงาน (Workspace Management) */}
          <div className="lg:col-span-7 space-y-8">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200/40 dark:border-blue-800/40">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">พื้นที่ทำงานทั้งหมด (Workspaces)</h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500">จัดการข้อมูล จำลองเข้าช่วยเหลือ และตั้งชื่อพื้นที่ทำงานของแต่ละตึก</p>
                  </div>
                </div>
              </div>

              {/* ค้นหา Workspace */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <Search className="w-4 h-4 text-slate-400" />
                </span>
                <input
                  type="text"
                  placeholder="ค้นหาชื่อหอพักหรือพื้นที่ทำงานในระบบ..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-200 transition-all text-xs"
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
                      className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{ws.name}</h4>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
                          <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">ID: {ws.id.substring(0, 8)}...</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> สร้างเมื่อ: {new Date(ws.created_at).toLocaleDateString("th-TH")}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 sm:shrink-0 pt-2 sm:pt-0 border-t border-slate-100 dark:border-slate-800 sm:border-0">
                        {/* ป้ายแสดงสิทธิ์การเข้าช่วยเหลือ */}
                        {status === "approved" ? (
                          <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/30 dark:border-emerald-800/30 text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-1 rounded-lg flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                            อนุมัติช่วยเหลือแล้ว
                          </span>
                        ) : status === "pending" ? (
                          <span className="text-[10px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200/30 dark:border-amber-800/30 text-amber-600 dark:text-amber-400 font-semibold px-2 py-1 rounded-lg animate-pulse flex items-center gap-1">
                            ⏳ รอยืนยันคำขอ
                          </span>
                        ) : (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold px-2 py-1 rounded-lg">
                            ✕ ไม่มีสิทธิ์ช่วยเหลือ
                          </span>
                        )}

                        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                          <button
                            onClick={() => {
                              setEditingWorkspace(ws)
                              setEditingWorkspaceName(ws.name)
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-blue-600 dark:text-blue-400 rounded-xl flex items-center gap-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                            title="แก้ไขชื่อ Workspace"
                          >
                            <Edit className="w-3.5 h-3.5" /> <span className="hidden sm:inline">แก้ไข</span>
                          </button>

                          <button
                            onClick={() => handleDeleteWorkspace(ws.id, ws.name)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-white hover:bg-red-50 dark:bg-slate-900 dark:hover:bg-red-950/20 border border-slate-200 dark:border-slate-800 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                            title="ลบ Workspace"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">ลบ</span>
                          </button>

                          <button
                            onClick={() => handleEnterWorkspace(ws)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer ${
                              status === "approved"
                                ? "bg-blue-600 hover:bg-blue-500 text-white shadow shadow-blue-600/10"
                                : "bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            }`}
                          >
                            สลับหอ <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {filteredWorkspaces.length === 0 && (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-xs">
                    ไม่พบข้อมูลพื้นที่ทำงานของตึกที่ระบุในฐานข้อมูล
                  </div>
                )}
              </div>
            </div>

            {/* ฟอร์มเพิ่ม Workspace */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-6 shadow-sm">
              <form onSubmit={handleAddWorkspace} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">สร้างพื้นที่ทำงานหอพักใหม่ (Add Workspace)</h3>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    placeholder="ระบุชื่อหอพัก/ตึกใหม่ เช่น แสนสุข แมนชั่น ตึกซี..."
                    className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 text-xs transition-colors"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={addingWorkspace}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm hover:shadow shadow-blue-600/10 hover:-translate-y-0.5 active:scale-95 duration-200 cursor-pointer"
                  >
                    {addingWorkspace ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4" /> สร้างพื้นที่ทำงาน
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* คอลัมน์ขวา: จัดการบัญชีและบทบาทผู้ใช้งาน (User & Role Provisoning) */}
          <div className="lg:col-span-5 space-y-8">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200/40 dark:border-indigo-800/40">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">มอบบทบาท/สิทธิ์ (Add User Role)</h2>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">เพิ่มผู้ใช้รายบุคคล กำหนด Workspace สังกัด และระดับสิทธิ์ควบคุมหลัก</p>
                </div>
              </div>

              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">พื้นที่ทำงานสังกัด (Workspace)</label>
                  <select
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-colors"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">อีเมลสำหรับเข้าสู่ระบบ</label>
                    <input
                      type="email"
                      required
                      placeholder="name@email.com"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-xs transition-colors"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">รหัสผ่านบัญชีผู้ใช้</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="อย่างน้อย 6 ตัวอักษร"
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-xs transition-colors"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ชื่อ-นามสกุลจริง</label>
                    <input
                      type="text"
                      placeholder="ระบุชื่อภาษาไทย..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-xs transition-colors"
                      value={newUserFullName}
                      onChange={(e) => setNewUserFullName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">เบอร์โทรศัพท์ติดต่อ</label>
                    <input
                      type="text"
                      placeholder="เช่น 081XXXXXXX"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-100 text-xs transition-colors"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ระดับสิทธิ์ของระบบ (Role)</label>
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
                        className={`py-2 px-1 text-center rounded-xl text-[10px] font-bold border transition-all duration-200 cursor-pointer ${
                          newUserRole === item.role
                            ? "bg-indigo-600 border-indigo-500 text-white shadow shadow-indigo-600/10 hover:-translate-y-0.5 active:scale-95"
                            : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:-translate-y-0.5 active:scale-95"
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
                  className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow shadow-indigo-600/10 hover:-translate-y-0.5 active:scale-95 duration-200 cursor-pointer"
                >
                  {addingUser ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" /> สร้างบัญชีและมอบสิทธิ์การใช้งาน
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* ส่วนควบคุมสร้าง Secret Code สำหรับสมัครสมาชิก */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200/40 dark:border-blue-800/40">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">รหัสเชิญชวนลงทะเบียน (Secret Code)</h2>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">ออกรหัสจำกัดสังกัดตึกและระดับสิทธิ์ล่วงหน้า มีอายุจำกัด 2 ชั่วโมง</p>
                </div>
              </div>

              <form onSubmit={handleGenerateCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">พื้นที่ทำงานปลายทาง (Locked Workspace)</label>
                  <select
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-colors"
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
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">สิทธิ์ที่จะได้รับเมื่อสมัคร (Designated Role)</label>
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
                        className={`py-2 px-1 text-center rounded-xl text-[10px] font-bold border transition-all duration-200 cursor-pointer ${
                          genRole === item.role
                            ? "bg-blue-600 border-blue-500 text-white shadow shadow-blue-600/10 hover:-translate-y-0.5 active:scale-95"
                            : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:-translate-y-0.5 active:scale-95"
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
                  className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow shadow-blue-600/10 hover:-translate-y-0.5 active:scale-95 duration-200 cursor-pointer"
                >
                  {generatingCode ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> สร้างรหัสเชิญชวน (จำกัดสิทธิ์ 2 ชม.)
                    </>
                  )}
                </button>
              </form>

              {/* รายการรหัสเชิญชวน */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">รายการรหัสควบคุมที่เปิดใช้งาน</h3>
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {registrationCodes.map((item) => {
                    const wsName = workspaces.find((w) => w.id === item.workspace_id)?.name || "ตึกที่ถูกลบ"
                    const isExpired = new Date(item.expires_at) < new Date()
                    return (
                      <div
                        key={item.code}
                        className="p-3.5 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200/40 dark:border-blue-800/40 px-2 py-0.5 rounded text-xs select-all tracking-wider">
                              {item.code}
                            </span>
                            <span className="text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 font-bold uppercase tracking-wider">
                              {item.role}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-semibold">
                            ตึกสังกัด: {wsName}
                          </p>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> หมดอายุ: {new Date(item.expires_at).toLocaleTimeString("th-TH")}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.is_used ? (
                            <span className="text-[9px] bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg font-bold">
                              ใช้แล้ว ({item.used_by_email?.split("@")[0]})
                            </span>
                          ) : isExpired ? (
                            <span className="text-[9px] bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 border border-red-100 dark:border-red-900/30 px-2 py-0.5 rounded-lg font-bold">
                              หมดอายุ
                            </span>
                          ) : (
                            <span className="text-[9px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 px-2 py-0.5 rounded-lg font-semibold animate-pulse">
                              พร้อมใช้งาน
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCopyCode(item.code)}
                            className="p-1.5 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                            title="คัดลอกรหัส"
                          >
                            {copiedCode === item.code ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-75 duration-200" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 animate-in fade-in duration-200" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteCode(item.code)}
                            className="p-1.5 text-red-500 hover:text-red-400 bg-white hover:bg-red-50 dark:bg-slate-900 dark:hover:bg-red-950/20 rounded-lg border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                            title="ลบ Code"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {registrationCodes.length === 0 && (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
                      ยังไม่มีรหัสเชิญชวนลงทะเบียนในระบบ
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* แผงตารางด้านล่าง: รายชื่อผู้ใช้งานสิทธิ์ต่างๆ */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-6 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200/40 dark:border-indigo-800/40">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">บัญชีรายชื่อผู้ใช้งานทั้งหมด</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">ตรวจสอบผู้ใช้งานทั้งหมดในแอปพลิเคชัน คัดกรองบทบาท แยกตามตึก และถอนสิทธิ์หลักได้อย่างปลอดภัย</p>
              </div>
            </div>

            {/* ค้นหาโปรไฟล์ */}
            <div className="w-full md:w-80 relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <Search className="w-4 h-4 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="ค้นหาด้วย อีเมล, ชื่อ, หรือสิทธิ์..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-850 dark:text-slate-200 transition-all text-xs"
                value={searchProfile}
                onChange={(e) => setSearchProfile(e.target.value)}
              />
            </div>
          </div>

          {/* Desktop View: Data Table (hidden md:table -> wrapped inside hidden md:block) */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200/60 dark:border-slate-800">
                  <th className="p-4">อีเมลผู้ใช้งาน</th>
                  <th className="p-4">ชื่อผู้เช่า/ผู้ช่วย</th>
                  <th className="p-4">เบอร์โทร</th>
                  <th className="p-4">สิทธิ์การเข้าถึง</th>
                  <th className="p-4">สังกัดตึก (Workspace)</th>
                  <th className="p-4 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredProfiles.map((p) => {
                  const wsName = workspaces.find((w) => w.id === p.workspace_id)?.name || "ไม่มีสังกัด (Global / Super Admin)"
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/25 transition-colors">
                      <td className="p-4 font-semibold text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          {p.email}
                        </div>
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-300 font-medium">
                        {p.full_name || "-"}
                      </td>
                      <td className="p-4 text-slate-500 dark:text-slate-400 font-mono">
                        {p.phone ? (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" /> {p.phone}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          p.role === "super_admin"
                            ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/40 dark:border-indigo-800/40"
                            : p.role === "admin"
                            ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200/40 dark:border-red-800/40"
                            : p.role === "staff"
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40"
                            : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/40 dark:border-blue-800/40"
                        }`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-300 font-semibold">
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
                            className="p-1.5 text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                            title="แก้ไขโปรไฟล์ / สิทธิ์"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {p.role !== "super_admin" && (
                            <button
                              onClick={() => handleDeleteProfile(p.id, p.email)}
                              className="p-1.5 text-red-500 hover:text-red-400 bg-slate-50 hover:bg-red-55 dark:bg-slate-900 dark:hover:bg-red-950/20 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
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
                    <td colSpan={6} className="text-center p-12 text-slate-400 dark:text-slate-500 text-xs">
                      ไม่พบข้อมูลรายชื่อบัญชีผู้ใช้ใดๆ ในระบบ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile View: Card-based List (block md:hidden) */}
          <div className="block md:hidden space-y-4">
            {filteredProfiles.map((p) => {
              const wsName = workspaces.find((w) => w.id === p.workspace_id)?.name || "ไม่มีสังกัด (Global / Super Admin)"
              return (
                <div 
                  key={p.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50 shadow-sm space-y-4 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-300"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 text-xs">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[170px] select-all">{p.email}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-450 font-semibold">
                        {p.full_name || "ไม่ระบุชื่อ นามสกุล"}
                      </p>
                    </div>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                      p.role === "super_admin"
                        ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/40 dark:border-indigo-800/40"
                        : p.role === "admin"
                        ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200/40 dark:border-red-800/40"
                        : p.role === "staff"
                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40"
                        : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/40 dark:border-blue-800/40"
                    }`}>
                      {p.role}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 dark:text-slate-500">เบอร์โทรศัพท์:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {p.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" /> {p.phone}
                          </span>
                        ) : (
                          "-"
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 dark:text-slate-500">สังกัดหอพัก:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{wsName}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-end gap-2.5">
                    <button
                      onClick={() => {
                        setEditingProfile(p)
                        setEditingProfileRole(p.role)
                        setEditingProfileWorkspaceId(p.workspace_id)
                        setEditingProfileFullName(p.full_name || "")
                        setEditingProfilePhone(p.phone || "")
                      }}
                      className="flex-1 max-w-[130px] min-h-[44px] py-2 px-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Edit className="w-4 h-4" /> แก้ไขสิทธิ์
                    </button>
                    {p.role !== "super_admin" && (
                      <button
                        onClick={() => handleDeleteProfile(p.id, p.email)}
                        className="flex-1 max-w-[130px] min-h-[44px] py-2 px-3 text-xs font-semibold text-red-600 dark:text-red-400 bg-slate-50 hover:bg-red-50 dark:bg-slate-900 dark:hover:bg-red-950/20 rounded-xl border border-slate-200 dark:border-slate-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" /> ถอนสิทธิ์
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {filteredProfiles.length === 0 && (
              <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 text-slate-400 dark:text-slate-500 text-xs">
                ไม่พบข้อมูลรายชื่อบัญชีผู้ใช้ในระบบ
              </div>
            )}
          </div>
        </div>

        {/* Workspace Edit Modal */}
        {editingWorkspace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md transition-all duration-300">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-750 shadow-2xl relative space-y-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-blue-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200/40 dark:border-blue-800/40">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">แก้ไขพื้นที่ทำงาน (Edit Workspace)</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">เปลี่ยนชื่อหอพักหรืออาคารเพื่อความถูกต้องในการตรวจสอบ</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingWorkspace(null)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateWorkspaceName} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ชื่อพื้นที่ทำงาน/ชื่อตึกหอพัก</label>
                  <input
                    type="text"
                    required
                    placeholder="ระบุชื่อหอพักที่ต้องการแก้ไข..."
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 text-xs transition-colors"
                    value={editingWorkspaceName}
                    onChange={(e) => setEditingWorkspaceName(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingWorkspace(null)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                  >
                    ยกเลิกและปิดหน้าต่าง
                  </button>
                  <button
                    type="submit"
                    disabled={updatingWorkspace}
                    className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-blue-600/10 cursor-pointer hover:-translate-y-0.5 active:scale-95 duration-200"
                  >
                    {updatingWorkspace ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      "บันทึกข้อมูลการเปลี่ยนแปลง"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Profile Edit Modal */}
        {editingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md transition-all duration-300">
            <div className="w-full max-w-lg bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-750 shadow-2xl relative space-y-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-indigo-500/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200/40 dark:border-indigo-800/40">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">แก้ไขข้อมูลผู้ใช้งานและสิทธิ์ (Edit Profile)</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">จัดการบัญชีอีเมล: {editingProfile.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ชื่อ-นามสกุลจริง</label>
                    <input
                      type="text"
                      placeholder="ระบุชื่อภาษาไทย..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 dark:text-slate-100 text-xs transition-colors"
                      value={editingProfileFullName}
                      onChange={(e) => setEditingProfileFullName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">เบอร์โทรศัพท์ติดต่อ</label>
                    <input
                      type="text"
                      placeholder="เช่น 081XXXXXXX"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 dark:text-slate-100 text-xs transition-colors"
                      value={editingProfilePhone}
                      onChange={(e) => setEditingProfilePhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">พื้นที่ทำงานสังกัด (Workspace)</label>
                  <select
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs transition-colors"
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
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">ระดับสิทธิ์ในการจัดการหลัก (Role)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                        className={`py-2 px-1 text-center rounded-xl text-[10px] font-bold border transition-all duration-200 cursor-pointer ${
                          editingProfileRole === item.role
                            ? "bg-indigo-600 border-indigo-500 text-white shadow shadow-indigo-600/10 hover:-translate-y-0.5 active:scale-95"
                            : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-705 dark:hover:text-slate-200 hover:-translate-y-0.5 active:scale-95"
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
                    className="flex-1 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                  >
                    ยกเลิกและปิดหน้าต่าง
                  </button>
                  <button
                    type="submit"
                    disabled={updatingProfile}
                    className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-indigo-600/10 cursor-pointer hover:-translate-y-0.5 active:scale-95 duration-200"
                  >
                    {updatingProfile ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      "บันทึกข้อมูลการเปลี่ยนแปลง"
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
