"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Shield, Key, Mail, CheckCircle2, Lock, ArrowRight } from "lucide-react"
import { loginAction } from "@/features/auth/actions"
import { createClient } from "@/lib/supabase/client"
import { clearCachedUserProfile } from "@/features/auth/client"
import { useWorkspaceData } from "@/context/WorkspaceDataContext"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show2FA, setShow2FA] = useState(false)
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<"admin" | "staff" | "tenant" | "super_admin" | null>(null)

  // ตรวจสอบว่าระบบอยู่ในโหมดจำลอง (Demo Mode) หรือไม่
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  const { clearAllCache } = useWorkspaceData()

  // ดึงค่า email จาก URL Parameter ในกรณีที่มาจากการสมัครสมาชิกหน้า Register และทำความสะอาด Cache ทั้งหมด
  useEffect(() => {
    clearAllCache()
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const emailParam = params.get("email")
      if (emailParam) {
        setEmail(emailParam)
      }
    }
  }, [clearAllCache])

  const handleAutofill = (role: "admin" | "staff" | "tenant") => {
    setSelectedRole(role)
    setError(null)
    if (role === "admin") {
      setEmail("admin@horset.com")
      setPassword("admin1234")
    } else if (role === "staff") {
      setEmail("staff_somchai@horset.com")
      setPassword("staff1234")
    } else {
      setEmail("tenant_room101@horset.com")
      setPassword("tenant1234")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    clearCachedUserProfile()

    if (isDemo) {
      // ค้นหาผู้ใช้จากรายการจำลอง
      const mockProfs: any[] = [
        { email: "admin@example.com", role: "admin", workspace_id: "d290f1ee-6c54-4b01-90e6-d701748f0851" },
        { email: "staff@example.com", role: "staff", workspace_id: "d290f1ee-6c54-4b01-90e6-d701748f0851" },
        { email: "tenant@example.com", role: "tenant", workspace_id: "d290f1ee-6c54-4b01-90e6-d701748f0851" }
      ]
      const foundProfile = mockProfs.find((p: any) => p.email.toLowerCase() === email.trim().toLowerCase())

      let role = selectedRole
      let workspaceId = "d290f1ee-6c54-4b01-90e6-d701748f0851"

      if (foundProfile) {
        role = foundProfile.role
        workspaceId = foundProfile.workspace_id || ""
      } else if (!role) {
        if (email.includes("admin")) {
          role = "admin"
        } else if (email.includes("staff")) {
          role = "staff"
        } else {
          role = "tenant"
        }
      }

      // จำลองการโหลด
      setTimeout(() => {
        setLoading(false)
        if (role === "admin" && !show2FA) {
          // แอดมินต้องเปิดหน้า 2FA
          setShow2FA(true)
          setSelectedRole(role)
        } else {
          // บทบาทอื่นนำทางไปหน้าหลักโดยตรง
          if (role) {
            document.cookie = `horset_user_role=${role}; path=/; max-age=86400`
          }
          if (workspaceId) {
            document.cookie = `horset_current_workspace_id=${workspaceId}; path=/; max-age=86400`
          }
          navigateToDashboardWithRole(role)
        }
      }, 1200)
    } else {
      // ใช้งานจริงเชื่อมต่อ Supabase Auth
      try {
        const res = await loginAction(email, password)
        setLoading(false)
        if (res.success && res.data) {
          const role = res.data.role as "admin" | "staff" | "tenant" | "super_admin"
          setSelectedRole(role)
          
          if (role === "admin" && res.data.tfaEnabled && !show2FA) {
            setShow2FA(true)
          } else {
            // ดึง workspace_id ล่าสุดของผู้ใช้ที่ล็อกอินจริงมาเก็บใน cookie
            const supabase = createClient()
            const { data: profData } = await supabase
              .from("profiles")
              .select("workspace_id")
              .eq("id", res.data.userId)
              .single()
            
            if (profData?.workspace_id) {
              document.cookie = `horset_current_workspace_id=${profData.workspace_id}; path=/; max-age=86400`
            }
            
            navigateToDashboardWithRole(role)
          }
        } else {
          setError(res.error || "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
        }
      } catch (err) {
        setLoading(false)
        setError("ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้")
      }
    }
  }

  const handleVerify2FA = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    setTimeout(() => {
      setLoading(false)
      if (otp.length === 6) {
        if (selectedRole) {
          document.cookie = `horset_user_role=${selectedRole}; path=/; max-age=86400`
        }
        
        // ถ้าเป็น Demo Mode ให้เซ็ต workspace_id ใน cookie เป็นแสนสุข แมนชั่น
        if (isDemo) {
          const defaultWs = "d290f1ee-6c54-4b01-90e6-d701748f0851"
          document.cookie = `horset_current_workspace_id=${defaultWs}; path=/; max-age=86400`
        }
        
        navigateToDashboardWithRole(selectedRole)
      }
    }, 1200)
  }

  const navigateToDashboardWithRole = (role: "admin" | "staff" | "tenant" | "super_admin" | null) => {
    const targetRole = role || selectedRole
    if (targetRole === "super_admin") {
      router.push("/super-admin")
    } else if (targetRole === "admin") {
      router.push("/dashboard")
    } else if (targetRole === "staff") {
      router.push("/meter")
    } else {
      router.push("/portal")
    }
  }

  const navigateToDashboard = () => {
    navigateToDashboardWithRole(selectedRole)
  }

  return (
    <main className="relative min-h-screen flex flex-col justify-center items-center p-4 overflow-hidden bg-slate-950">
      {/* วงกลมแสงเรืองหลังฉาก (Glow Background) */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* โลโก้และหัวข้อโปรเจกต์ */}
      <div className="text-center z-10 mb-8">
        <div className="inline-flex items-center justify-center p-3 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl shadow-lg shadow-blue-500/20 mb-3 animate-pulse">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-blue-400">
          HorSet <span className="text-blue-500 font-semibold">(หอเสร็จ)</span>
        </h1>
        <p className="text-slate-400 mt-2 text-sm max-w-xs mx-auto">
          ระบบ SaaS บริหารจัดการหอพักและอพาร์ทเมนต์ครบวงจร
        </p>
      </div>

      {/* การ์ดฟอร์มเข้าสู่ระบบ */}
      <div className="w-full max-w-md z-10 glass-panel p-8 rounded-3xl shadow-2xl relative">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-t-3xl" />
        
        {!show2FA ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <h2 className="text-xl font-medium text-slate-200 mb-2 flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-400" /> เข้าสู่ระบบผู้ใช้
            </h2>

            {/* บาจแสดงสถานะเชื่อมต่อ Supabase */}
            {isDemo ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-[11px] flex items-center gap-2 mb-4">
                <span>⚠️ โหมดจำลอง (ยังไม่ได้เชื่อมต่อ Supabase)</span>
              </div>
            ) : (
              <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-xl text-[11px] flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping" />
                <span>เชื่อมต่อฐานข้อมูล Supabase แล้ว</span>
              </div>
            )}

            {/* แสดง Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">อีเมลผู้ใช้งาน</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Mail className="w-4 h-4 text-slate-500" />
                </span>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 transition-colors text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-400 font-medium">รหัสผ่าน</label>
                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors hover:underline"
                >
                  ลืมรหัสผ่าน?
                </button>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Key className="w-4 h-4 text-slate-500" />
                </span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 transition-colors text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full glow-btn bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/15"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  เข้าสู่ระบบ <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <p className="text-xs text-slate-500">
                ยังไม่มีบัญชีผู้ใช้งานใช่หรือไม่?{" "}
                <button
                  type="button"
                  onClick={() => router.push("/register")}
                  className="text-blue-400 hover:text-blue-300 font-medium transition-colors hover:underline"
                >
                  สมัครสมาชิกใหม่ด้วยรหัสคำเชิญ (Secret Code)
                </button>
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerify2FA} className="space-y-6">
            <div className="text-center space-y-2">
              <Shield className="w-12 h-12 text-blue-500 mx-auto animate-bounce" />
              <h2 className="text-xl font-semibold text-slate-100">ยืนยันตัวตนสองขั้นตอน (2FA)</h2>
              <p className="text-xs text-slate-400 max-w-[280px] mx-auto">
                กรอกรหัสความปลอดภัย 6 หลักจากแอปพลิเคชัน Authenticator ของคุณ (เช่น Google Authenticator)
              </p>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                maxLength={6}
                pattern="\d{6}"
                required
                placeholder="000000"
                className="w-full tracking-[1em] text-center font-mono py-3 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-100 transition-colors text-2xl"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <p className="text-[10px] text-slate-500 text-center font-mono">ทดสอบ: กรอกเลขใดๆ ก็ได้ให้ครบ 6 หลักเพื่อผ่านหน้าจอ</p>
            </div>

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full glow-btn bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  ยืนยันรหัสความปลอดภัย <CheckCircle2 className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShow2FA(false)}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ย้อนกลับหน้าเข้าสู่ระบบปกติ
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
