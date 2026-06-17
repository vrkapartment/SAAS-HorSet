"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Script from "next/script"
import { Shield, Key, Mail, CheckCircle2, Lock, ArrowRight, User, Phone, Sparkles, AlertCircle } from "lucide-react"
import { registerWithSecretCodeAction } from "@/features/auth/actions"

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

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [secretCode, setSecretCode] = useState("")
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileContainerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  // ตรวจสอบว่าระบบอยู่ในโหมดจำลอง (Demo Mode) หรือไม่
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"

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

  const handleSubmit = async (e: React.FormEvent) => {
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
          setSuccess("✓ " + (res.message || "สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลหรือเข้าสู่ระบบทันที"))
          setTimeout(() => {
            router.push(`/login?email=${encodeURIComponent(email)}`)
          }, 3000)
        } else {
          setError(res.error || "เกิดข้อผิดพลาดในการลงทะเบียน โปรดลองอีกครั้ง")
          // รีเซ็ตวิดเจ็ตเพื่อความปลอดภัยกรณีเกิดข้อผิดพลาด
          if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current) {
            window.turnstile.reset(widgetIdRef.current)
            setTurnstileToken(null)
          }
        }
      } catch (err) {
        setLoading(false)
        setError("ไม่สามารถติดต่อเซิร์ฟเวอร์ระบบสมัครสมาชิกได้")
        // รีเซ็ตวิดเจ็ตเพื่อความปลอดภัยกรณีเกิดข้อผิดพลาด
        if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current)
          setTurnstileToken(null)
        }
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
          HorSet <span className="text-indigo-500 font-semibold">(หอเสร็จ)</span>
        </h1>
        <p className="text-slate-400 mt-2 text-sm max-w-xs mx-auto">
          ระบบ SaaS บริหารจัดการหอพักและอพาร์ทเมนต์ครบวงจร
        </p>
      </div>

      {/* การ์ดฟอร์มสมัครสมาชิก */}
      <div className="w-full max-w-lg z-10 glass-panel p-8 rounded-3xl shadow-2xl relative">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-t-3xl" />
        
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="text-center pt-2">
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
        </form>
      </div>
    </main>
  )
}
