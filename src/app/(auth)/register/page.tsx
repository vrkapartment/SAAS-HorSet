"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Script from "next/script"
import { Shield, Key, Mail, CheckCircle2, Lock, ArrowRight, User, Phone, Sparkles, AlertCircle, Building2, Rocket, RefreshCw } from "lucide-react"
import { registerWithSecretCodeAction, registerNewWorkspaceAction, resendConfirmationEmailAction } from "@/features/auth/actions"
import { signInWithGoogle } from "@/features/auth/client"

// Declare types for Cloudflare Turnstile on the window object
declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: any) => string
      remove: (widgetId?: string) => void
      reset: (widgetId?: string) => void
    }
    onloadTurnstileCallback?: () => void
  }
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

type RegisterTab = "new" | "code"

function RegisterPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [activeTab, setActiveTab] = useState<RegisterTab>("new")

  // ฟอร์มสมัครหอพักใหม่ (Self-Serve, ไม่ต้องใช้รหัสเชิญ)
  const [regEmail, setRegEmail] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [regFullName, setRegFullName] = useState("")
  const [regPhone, setRegPhone] = useState("")
  const [propertyName, setPropertyName] = useState("")
  const [newTabSubmitted, setNewTabSubmitted] = useState(false)

  // ฟอร์มสมัครด้วยรหัสเชิญชวน (เดิม)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [secretCode, setSecretCode] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const turnstileContainerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  // ตรวจสอบว่าระบบอยู่ในโหมดจำลอง (Demo Mode) หรือไม่
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"

  // อ่าน query param เพื่อตั้งค่า tab เริ่มต้น และ prefill รหัสเชิญชวนจากลิงก์ที่ Super Admin ส่งมา
  useEffect(() => {
    const tabParam = searchParams.get("tab")
    const codeParam = searchParams.get("code")

    if (tabParam === "code" || codeParam) {
      setActiveTab("code")
      if (codeParam) setSecretCode(codeParam)
    } else if (tabParam === "new") {
      setActiveTab("new")
    }
  }, [searchParams])

  const switchTab = (tab: RegisterTab) => {
    setActiveTab(tab)
    setError(null)
    setSuccess(null)
  }

  // Initializing Cloudflare Turnstile widget
  useEffect(() => {
    const renderWidget = () => {
      if (typeof window !== "undefined" && window.turnstile && turnstileContainerRef.current && !widgetIdRef.current) {
        try {
          const id = window.turnstile.render(turnstileContainerRef.current, {
            sitekey: turnstileSiteKey,
            callback: (token: string) => {
              setTurnstileToken(token)
              setError(null)
            },
            "error-callback": () => {
              setError("Cloudflare Turnstile ตรวจสอบล้มเหลว กรุณารีเฟรชหน้าจอ")
              setTurnstileToken(null)
            },
            "expired-callback": () => {
              setError("โทเค็นตรวจสอบความปลอดภัยหมดอายุ กรุณากดตรวจสอบอีกครั้ง")
              setTurnstileToken(null)
            },
            theme: "dark",
          })
          widgetIdRef.current = id
        } catch (err) {
          console.error("Turnstile render error:", err)
        }
      }
    }

    if (typeof window !== "undefined") {
      if (window.turnstile) {
        renderWidget()
      } else {
        window.onloadTurnstileCallback = renderWidget
      }
    }

    return () => {
      // Clean up on unmount
      if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current)
          widgetIdRef.current = null
        } catch (e) {}
      }
    }
  }, [turnstileSiteKey])

  const resetTurnstile = () => {
    if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current) {
      window.turnstile.reset(widgetIdRef.current)
      setTurnstileToken(null)
    }
  }

  // ------- ฟอร์มสมัครหอพักใหม่ (Self-Serve) -------
  const handleSubmitNewWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (!turnstileToken && !isDemo) {
      setLoading(false)
      setError("กรุณาผ่านการตรวจสอบบอท (Cloudflare Turnstile) ก่อนสมัครสมาชิก")
      return
    }

    if (regPassword.length < 6) {
      setError("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร")
      setLoading(false)
      return
    }

    if (!propertyName.trim()) {
      setError("กรุณากรอกชื่อหอพัก/อพาร์ทเมนต์ของคุณ")
      setLoading(false)
      return
    }

    if (isDemo) {
      // จำลองการสร้าง Workspace ใหม่ในโหมด Demo ผ่าน Cookies
      setTimeout(() => {
        const defaultProfs = [
          {
            id: "u1",
            email: "admin@horset.com",
            full_name: "คุณสมเจตน์ (เจ้าของ)",
            phone: "0812345678",
            role: "admin",
            workspace_id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
            created_at: new Date().toISOString()
          }
        ]
        const localProfiles = getCookie("horset_profiles")
        const profs = localProfiles ? JSON.parse(decodeURIComponent(localProfiles)) : defaultProfs

        const exists = profs.some((p: any) => p.email.toLowerCase() === regEmail.trim().toLowerCase())
        if (exists) {
          setLoading(false)
          setError("อีเมลนี้ถูกใช้งานในระบบแล้ว กรุณาเข้าสู่ระบบ หรือใช้อีเมลอื่นในการสมัคร")
          return
        }

        const newWorkspaceId = crypto.randomUUID()
        profs.push({
          id: crypto.randomUUID(),
          email: regEmail.trim(),
          full_name: regFullName.trim() || null,
          phone: regPhone.trim() || null,
          role: "admin",
          workspace_id: newWorkspaceId,
          workspace_name: propertyName.trim(),
          created_at: new Date().toISOString()
        })
        setCookie("horset_profiles", encodeURIComponent(JSON.stringify(profs)))

        setLoading(false)
        setSuccess(`✓ [Demo] สร้างหอพัก "${propertyName.trim()}" และสมัครสมาชิกสำเร็จ! กำลังนำทางไปหน้าเข้าสู่ระบบ...`)
        setTimeout(() => {
          router.push(`/login?email=${encodeURIComponent(regEmail)}`)
        }, 2000)
      }, 1200)
      return
    }

    try {
      const res = await registerNewWorkspaceAction({
        email: regEmail.trim(),
        password: regPassword,
        fullName: regFullName.trim(),
        phone: regPhone.trim(),
        propertyName: propertyName.trim(),
        captchaToken: turnstileToken || undefined
      })

      setLoading(false)
      if (res.success) {
        setSuccess(res.message || "สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันตัวตนก่อนเข้าสู่ระบบ")
        setNewTabSubmitted(true)
      } else {
        setError(res.error || "เกิดข้อผิดพลาดในการลงทะเบียน โปรดลองอีกครั้ง")
        resetTurnstile()
      }
    } catch (err) {
      setLoading(false)
      setError("ไม่สามารถติดต่อเซิร์ฟเวอร์ระบบสมัครสมาชิกได้")
      resetTurnstile()
    }
  }

  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)

  const handleGoogleSignIn = async () => {
    if (isDemo) {
      setError("โหมด Demo ยังไม่รองรับการสมัครสมาชิกด้วย Google")
      return
    }
    setGoogleLoading(true)
    setError(null)
    const { error: oauthError } = await signInWithGoogle("register_workspace")
    if (oauthError) {
      setGoogleLoading(false)
      setError(oauthError.message)
    }
    // สำเร็จแล้วเบราว์เซอร์จะถูก redirect ไป Google เอง ไม่ต้องทำอะไรต่อที่นี่
  }

  const handleResend = async () => {
    setResendLoading(true)
    setResendMessage(null)
    const res = await resendConfirmationEmailAction(regEmail.trim())
    setResendLoading(false)
    setResendMessage(res.success ? (res.message || "ส่งอีเมลอีกครั้งแล้ว") : (res.error || "ส่งอีเมลไม่สำเร็จ"))
  }

  // ------- ฟอร์มสมัครด้วยรหัสเชิญชวน (เดิม) -------
  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    // ตรวจสอบความปลอดภัย Turnstile
    if (!turnstileToken && !isDemo) {
      setLoading(false)
      setError("กรุณาผ่านการตรวจสอบบอท (Cloudflare Turnstile) ก่อนสมัครสมาชิก")
      return
    }

    // ตรวจสอบความถูกต้องเบื้องต้น
    if (password.length < 6) {
      setError("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร")
      setLoading(false)
      return
    }

    const cleanedCode = secretCode.trim().toUpperCase()

    if (isDemo) {
      // ค้นหารหัสใน Cookies
      const localCodes = getCookie("horset_registration_codes")
      const codes = localCodes ? JSON.parse(decodeURIComponent(localCodes)) : []
      const foundCode = codes.find((c: any) => c.code === cleanedCode)

      if (!foundCode) {
        setTimeout(() => {
          setLoading(false)
          setError("ไม่พบรหัสเชิญชวนนี้ในระบบ กรุณาตรวจสอบความถูกต้อง")
        }, 800)
        return
      }

      if (foundCode.is_used) {
        setTimeout(() => {
          setLoading(false)
          setError("รหัสเชิญชวนนี้ถูกใช้งานไปแล้ว")
        }, 800)
        return
      }

      if (new Date(foundCode.expires_at) < new Date()) {
        setTimeout(() => {
          setLoading(false)
          setError("รหัสเชิญชวนนี้หมดอายุแล้ว (รหัสเชิญชวนมีอายุการใช้งาน 2 ชั่วโมง)")
        }, 800)
        return
      }

      // ดึงโปรไฟล์เดิมหรือตั้งต้น
      const defaultProfs = [
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

      const localProfiles = getCookie("horset_profiles")
      const profs = localProfiles ? JSON.parse(decodeURIComponent(localProfiles)) : defaultProfs

      const exists = profs.some((p: any) => p.email.toLowerCase() === email.trim().toLowerCase())
      if (exists) {
        setTimeout(() => {
          setLoading(false)
          setError("อีเมลนี้ได้รับการลงทะเบียนในระบบเรียบร้อยแล้ว")
        }, 800)
        return
      }

      // สมัครสมาชิกในโหมด Demo สำเร็จ
      setTimeout(() => {
        // 1. เพิ่มโปรไฟล์จำลองใหม่
        const newProfile = {
          id: crypto.randomUUID(),
          email: email.trim(),
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          role: foundCode.role,
          workspace_id: foundCode.workspace_id,
          created_at: new Date().toISOString()
        }
        profs.push(newProfile)
        setCookie("horset_profiles", encodeURIComponent(JSON.stringify(profs)))

        // 2. ปรับปรุงสถานะรหัสเชิญชวนว่าใช้แล้ว
        const updatedCodes = codes.map((c: any) =>
          c.code === cleanedCode ? { ...c, is_used: true, used_by_email: email.trim() } : c
        )
        setCookie("horset_registration_codes", encodeURIComponent(JSON.stringify(updatedCodes)))

        setLoading(false)
        setSuccess("✓ [Demo] สมัครสมาชิกและระบุสังกัดตึกเรียบร้อยแล้ว! กำลังนำทางไปหน้าเข้าสู่ระบบ...")

        // ย้ายไปหน้า Login หลังแสดงผลสำเร็จ
        setTimeout(() => {
          router.push(`/login?email=${encodeURIComponent(email)}`)
        }, 2000)
      }, 1200)
    } else {
      // ใช้งานจริงกับ Supabase Actions
      try {
        const res = await registerWithSecretCodeAction({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          phone: phone.trim(),
          secretCode: cleanedCode,
          captchaToken: turnstileToken || undefined
        })

        setLoading(false)
        if (res.success) {
          setSuccess("✓ " + (res.message || "สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันตัวตนก่อนเข้าสู่ระบบ"))
          setTimeout(() => {
            router.push(`/login?email=${encodeURIComponent(email)}`)
          }, 3000)
        } else {
          setError(res.error || "เกิดข้อผิดพลาดในการลงทะเบียน โปรดลองอีกครั้ง")
          resetTurnstile()
        }
      } catch (err) {
        setLoading(false)
        setError("ไม่สามารถติดต่อเซิร์ฟเวอร์ระบบสมัครสมาชิกได้")
        resetTurnstile()
      }
    }
  }

  return (
    <main className="relative min-h-screen flex flex-col justify-center items-center p-4 overflow-hidden bg-slate-950">
      {/* Script ของ Cloudflare Turnstile */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback"
        strategy="afterInteractive"
      />

      {/* วงกลมแสงเรืองหลังฉาก (Glow Background) */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* โลโก้และหัวข้อโปรเจกต์ */}
      <div className="text-center z-10 mb-6">
        <div className="inline-flex items-center justify-center p-3 bg-gradient-to-tr from-indigo-600 to-purple-500 rounded-2xl shadow-lg shadow-indigo-500/20 mb-3 animate-pulse">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-indigo-400">
          HorSet
        </h1>
        <p className="text-slate-400 mt-2 text-sm max-w-xs mx-auto">
          ระบบ SaaS บริหารจัดการหอพักและอพาร์ทเมนต์ครบวงจร
        </p>
      </div>

      {/* การ์ดฟอร์มสมัครสมาชิก */}
      <div className="w-full max-w-lg z-10 glass-panel p-8 rounded-3xl shadow-2xl relative">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-t-3xl" />

        {/* Tab สลับระหว่างสมัครหอพักใหม่ กับ มีรหัสเชิญ */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => switchTab("new")}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg text-center transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "new" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Rocket className="w-3.5 h-3.5" /> สมัครหอพักใหม่
          </button>
          <button
            type="button"
            onClick={() => switchTab("code")}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg text-center transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "code" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Key className="w-3.5 h-3.5" /> มีรหัสเชิญ
          </button>
        </div>

        {/* ---------------- TAB: สมัครหอพักใหม่ (Self-Serve) ---------------- */}
        {activeTab === "new" && (
          <>
            {newTabSubmitted && !isDemo ? (
              // แสดงกล่อง "ตรวจสอบอีเมลของคุณ" แทนฟอร์ม หลังสมัครสำเร็จ (เพราะต้องยืนยันอีเมลก่อนเข้าสู่ระบบ)
              <div className="space-y-4 text-center py-4">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-teal-500/10 border border-teal-500/25 rounded-2xl">
                  <CheckCircle2 className="w-7 h-7 text-teal-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-200">ตรวจสอบอีเมลของคุณ</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                  {success}
                </p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resendLoading ? "animate-spin" : ""}`} />
                  ส่งอีเมลยืนยันอีกครั้ง
                </button>
                {resendMessage && (
                  <p className="text-[11px] text-slate-500">{resendMessage}</p>
                )}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    ยืนยันแล้ว? ไปหน้าเข้าสู่ระบบ
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitNewWorkspace} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-2">
                  <h2 className="text-xl font-medium text-slate-200 flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-indigo-400" /> สมัครหอพักใหม่ (เจ้าของกิจการ)
                  </h2>
                </div>

                {isDemo ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-[11px] flex items-center gap-2">
                    <span>⚠️ โหมดจำลอง (บันทึกผ่าน Cookies)</span>
                  </div>
                ) : (
                  <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-xl text-[11px] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping" />
                    <span>สร้างหอพักของคุณเองพร้อมทดลองใช้ฟรี 30 วัน</span>
                  </div>
                )}

                {error && (
                  <div className="p-3.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs flex items-start gap-2 animate-shake">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
                {success && (
                  <div className="p-3.5 bg-teal-500/10 border border-teal-500/25 text-teal-400 rounded-xl text-xs flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <span>{success}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold flex items-center gap-1">
                    ชื่อหอพัก/อพาร์ทเมนต์ <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <Building2 className="w-4 h-4 text-indigo-400" />
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="เช่น แสนสุข แมนชั่น"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-indigo-500/30 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 placeholder-slate-600 transition-all text-sm"
                      value={propertyName}
                      onChange={(e) => setPropertyName(e.target.value)}
                    />
                  </div>
                </div>

                <hr className="border-slate-900 my-2" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">ชื่อ-นามสกุลจริง</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <User className="w-4 h-4 text-slate-500" />
                      </span>
                      <input
                        type="text"
                        required
                        placeholder="เช่น สมชาย มีสุข"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors text-sm"
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">เบอร์โทรศัพท์มือถือ</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Phone className="w-4 h-4 text-slate-500" />
                      </span>
                      <input
                        type="text"
                        required
                        placeholder="08xxxxxxxx"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors text-sm"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">อีเมลหลัก</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Mail className="w-4 h-4 text-slate-500" />
                      </span>
                      <input
                        type="email"
                        required
                        placeholder="name@example.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors text-sm"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">รหัสผ่านสำหรับเข้าสู่ระบบ</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Key className="w-4 h-4 text-slate-500" />
                      </span>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors text-sm"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {!isDemo && (
                  <div className="space-y-1.5 flex justify-center py-1">
                    <div ref={turnstileContainerRef} className="cf-turnstile" />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full glow-btn bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-600/15 transition-all mt-4"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      เริ่มต้นใช้งานฟรี 30 วัน <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {!isDemo && (
                  <>
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex-1 h-px bg-slate-800" />
                      <span className="text-[11px] text-slate-500">หรือ</span>
                      <div className="flex-1 h-px bg-slate-800" />
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={googleLoading || loading}
                      className="w-full bg-white hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-sm transition-colors cursor-pointer"
                    >
                      {googleLoading ? (
                        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                      ) : (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
                            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.5 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.4 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z"/>
                            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.4 15.5 18.8 12 24 12c3.1 0 5.8 1.1 8 3l6-6C34.4 5.1 29.5 3 24 3 16.3 3 9.7 7.3 6.3 14.7z"/>
                            <path fill="#4CAF50" d="M24 45c5.3 0 10.1-2 13.7-5.3l-6.3-5.3C29.4 36 26.9 37 24 37c-5.3 0-9.8-3.4-11.4-8.1l-6.5 5C9.5 40.6 16.2 45 24 45z"/>
                            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.3 5.3C40.9 36 44 30.4 44 24c0-1.2-.1-2.4-.4-3.5z"/>
                          </svg>
                          สมัครหอพักใหม่ด้วย Google
                        </>
                      )}
                    </button>
                  </>
                )}
              </form>
            )}
          </>
        )}

        {/* ---------------- TAB: มีรหัสเชิญชวน (เดิม) ---------------- */}
        {activeTab === "code" && (
          <form onSubmit={handleSubmitCode} className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-2">
              <h2 className="text-xl font-medium text-slate-200 flex items-center gap-2">
                <Lock className="w-5 h-5 text-indigo-400" /> สมัครสมาชิกใหม่ด้วยรหัสคำเชิญ
              </h2>
            </div>

            {/* บาจแสดงสถานะระบบ */}
            {isDemo ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-[11px] flex items-center gap-2">
                <span>⚠️ โหมดจำลอง (ตรวจสอบรหัสผ่าน Cookies)</span>
              </div>
            ) : (
              <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-xl text-[11px] flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping" />
                <span>สมัครสมาชิกและยืนยันผ่านระบบ Supabase Core</span>
              </div>
            )}

            {/* แสดงสถานะสำเร็จหรือข้อผิดพลาด */}
            {error && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs flex items-start gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="p-3.5 bg-teal-500/10 border border-teal-500/25 text-teal-400 rounded-xl text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            {/* บังคับใส่ Secret Invite Code */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold flex items-center gap-1">
                รหัสเชิญชวนพิเศษ <span className="text-red-400">* (บังคับใส่และห้ามหมดอายุ)</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Key className="w-4 h-4 text-indigo-400 font-bold" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="กรอกรหัสเชิญชวน เช่น HS-XXXXXX"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-indigo-500/30 rounded-xl focus:outline-none focus:border-indigo-500 text-indigo-300 font-mono font-bold placeholder-indigo-500/50 transition-all text-sm uppercase tracking-wide"
                  value={secretCode}
                  onChange={(e) => setSecretCode(e.target.value)}
                />
              </div>
              <p className="text-[10px] text-slate-500">
                * รหัสที่ Super Admin ออกให้ จะเชื่อมโยงสิทธิ์แอดมินหรือผู้ช่วยเข้าตึกที่ล็อคไว้โดยเฉพาะ มีอายุการใช้งาน 2 ชั่วโมง
              </p>
            </div>

            <hr className="border-slate-900 my-2" />

            {/* ข้อมูลส่วนตัวผู้ใช้ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">ชื่อ-นามสกุลจริง</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <User className="w-4 h-4 text-slate-500" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="เช่น สมชาย มีสุข"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors text-sm"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">เบอร์โทรศัพท์มือถือ</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Phone className="w-4 h-4 text-slate-500" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="08xxxxxxxx"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors text-sm"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">อีเมลหลัก</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Mail className="w-4 h-4 text-slate-500" />
                  </span>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">รหัสผ่านสำหรับเข้าสู่ระบบ</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Key className="w-4 h-4 text-slate-500" />
                  </span>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 transition-colors text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* วิดเจ็ต Cloudflare Turnstile */}
            {!isDemo && (
              <div className="space-y-1.5 flex justify-center py-1">
                <div ref={turnstileContainerRef} className="cf-turnstile" />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full glow-btn bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-600/15 transition-all mt-4"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  สมัครสมาชิกใหม่ด้วยรหัสและเข้าร่วมตึก <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="text-center pt-4">
          <p className="text-xs text-slate-500">
            มีบัญชีผู้ใช้งานในระบบอยู่แล้วใช่หรือไม่?{" "}
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors hover:underline"
            >
              ย้อนกลับหน้าเข้าสู่ระบบปกติ
            </button>
          </p>
        </div>
      </div>
    </main>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <main className="relative min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </main>
    }>
      <RegisterPageContent />
    </Suspense>
  )
}
