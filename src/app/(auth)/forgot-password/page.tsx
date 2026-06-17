"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Script from "next/script"
import { Shield, Mail, ArrowRight, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

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

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileContainerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA" // Test key from Cloudflare

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
      setError("กรุณาผ่านการตรวจสอบบอท (Cloudflare Turnstile) ก่อนส่งแบบฟอร์ม")
      return
    }

    if (isDemo) {
      // จำลองในโหมด Demo
      setTimeout(() => {
        setLoading(false)
        setSuccess("จำลองการส่งลิงก์เปลี่ยนรหัสผ่านสำเร็จ! (ระบบไม่ได้เชื่อมต่อ Supabase จริง)")
      }, 1500)
    } else {
      // โหมดเชื่อมต่อ Supabase Auth
      try {
        const supabase = createClient()
        
        // ส่งลิงก์ไปยังอีเมลของผู้ใช้ พร้อมแนบ Token ของ Captcha ป้องกันการ Pump
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/update-password`,
          captchaToken: turnstileToken || undefined,
        })

        setLoading(false)

        if (resetError) {
          setError(resetError.message)
          // รีเซ็ตวิดเจ็ตเพื่อความปลอดภัยกรณีเกิดข้อผิดพลาด
          if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current) {
            window.turnstile.reset(widgetIdRef.current)
            setTurnstileToken(null)
          }
        } else {
          setSuccess("ระบบได้ส่งลิงก์เปลี่ยนรหัสผ่านไปยังอีเมลของคุณเรียบร้อยแล้ว กรุณาเข้าเช็คกล่องจดหมายของคุณ")
        }
      } catch (err) {
        setLoading(false)
        setError("เกิดข้อผิดพลาดที่ไม่คาดคิดในการดำเนินการ")
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
          ระบบกู้คืนและตั้งค่ารหัสผ่านผู้ใช้งานใหม่
        </p>
      </div>

      {/* การ์ดฟอร์มขอเปลี่ยนรหัสผ่าน */}
      <div className="w-full max-w-md z-10 glass-panel p-8 rounded-3xl shadow-2xl relative">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-t-3xl" />

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium text-slate-200 flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-400" /> ลืมรหัสผ่าน?
            </h2>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> กลับหน้าเข้าสู่ระบบ
            </button>
          </div>

          {/* บาจแสดงสถานะเชื่อมต่อ Supabase */}
          {isDemo ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-[11px]">
              <span>⚠️ โหมดจำลอง (ไม่ได้ใช้ Supabase และ Turnstile จริง)</span>
            </div>
          ) : (
            <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-xl text-[11px] flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping" />
              <span>ป้องกันสปามและบอทด้วย Cloudflare Turnstile</span>
            </div>
          )}

          {/* แสดงผลลัพธ์ Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* แสดงผลลัพธ์ Success */}
          {success && (
            <div className="p-4 bg-teal-500/10 border border-teal-500/25 text-teal-400 rounded-xl text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4.5 h-4.5 mt-0.5 shrink-0 text-teal-500" />
              <span className="leading-normal">{success}</span>
            </div>
          )}

          {!success && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">ระบุอีเมลผู้ใช้งานของคุณ</label>
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
                <p className="text-[10px] text-slate-500">ระบบจะทำการจัดส่งลิงก์เพื่อรีเซ็ตรหัสผ่านไปยังกล่องจดหมายอีเมลนี้</p>
              </div>

              {/* วิดเจ็ต Cloudflare Turnstile (ซ่อนในโหมด Demo) */}
              {!isDemo && (
                <div className="space-y-1.5 flex justify-center py-2">
                  <div ref={turnstileContainerRef} className="cf-turnstile" />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full glow-btn bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/15 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    ส่งลิงก์ขอรีเซ็ตรหัสผ่าน <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          )}
        </form>
      </div>
    </main>
  )
}
