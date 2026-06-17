"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Shield, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)

  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  // Check if there is an active session (validating reset token session)
  useEffect(() => {
    if (isDemo) {
      setSessionChecked(true)
      return
    }

    const supabase = createClient()
    let isMounted = true
    let timeoutId: NodeJS.Timeout

    // Listen for auth state changes (e.g. when PKCE code exchange completes successfully)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return

      if (session) {
        setError(null)
        setSessionChecked(true)
        if (timeoutId) clearTimeout(timeoutId)
      }
    })

    // Also check current session immediately (in case it is already exchanged or we are using Implicit grant flow)
    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!isMounted) return

        if (session) {
          setError(null)
          setSessionChecked(true)
        } else {
          // Check if there is a PKCE 'code' query parameter in the URL
          const hasCode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code")
          
          if (hasCode) {
            // Wait for 3.5 seconds to allow client-side PKCE code exchange to finish
            timeoutId = setTimeout(async () => {
              if (!isMounted) return
              const { data: { session: currentSession } } = await supabase.auth.getSession()
              if (!currentSession) {
                setError("ไม่พบสิทธิ์การกู้คืนรหัสผ่าน หรือเซสชันกู้คืนรหัสผ่านของคุณหมดอายุแล้ว กรุณากรอกแบบฟอร์มลืมรหัสผ่านเพื่อรับอีเมลใหม่อีกครั้ง")
                setSessionChecked(true)
              }
            }, 3500)
          } else {
            // No code in URL, and no active session - invalid recovery access
            setError("ไม่พบสิทธิ์การกู้คืนรหัสผ่าน หรือเซสชันกู้คืนรหัสผ่านของคุณหมดอายุแล้ว กรุณากรอกแบบฟอร์มลืมรหัสผ่านเพื่อรับอีเมลใหม่อีกครั้ง")
            setSessionChecked(true)
          }
        }
      } catch (err) {
        setError("เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์เข้าถึง")
        setSessionChecked(true)
      }
    }

    checkInitialSession()

    return () => {
      isMounted = false
      subscription.unsubscribe()
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [isDemo])

  const getPasswordStrength = () => {
    if (!password) return { label: "ยังไม่ได้ระบุ", color: "text-slate-500", percent: 0 }
    if (password.length < 6) return { label: "สั้นเกินไป (ต้องไม่ต่ำกว่า 6 ตัวอักษร)", color: "text-red-400", percent: 25 }
    
    // Check complexity
    const hasLetters = /[a-zA-Z]/.test(password)
    const hasNumbers = /\d/.test(password)
    const hasSpecial = /[^a-zA-Z\d]/.test(password)

    if (hasLetters && hasNumbers && hasSpecial && password.length >= 8) {
      return { label: "แข็งแกร่งมาก", color: "text-teal-400", percent: 100 }
    }
    if (hasLetters && hasNumbers) {
      return { label: "ปานกลาง", color: "text-blue-400", percent: 65 }
    }
    return { label: "ค่อนข้างง่ายเกินไป", color: "text-amber-400", percent: 45 }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    // ตรวจสอบความถูกต้องเบื้องต้น
    if (password.length < 6) {
      setLoading(false)
      setError("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร")
      return
    }

    if (password !== confirmPassword) {
      setLoading(false)
      setError("รหัสผ่านใหม่และรหัสผ่านยืนยันไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง")
      return
    }

    if (isDemo) {
      // จำลองในโหมด Demo
      setTimeout(() => {
        setLoading(false)
        setSuccess("อัปเดตรหัสผ่านใหม่เรียบร้อยแล้ว! (จำลองการเปลี่ยนรหัสผ่านสำเร็จ)")
        setTimeout(() => {
          router.push("/login")
        }, 2500)
      }, 1500)
    } else {
      // ทำงานร่วมกับ Supabase Auth จริง
      try {
        const supabase = createClient()
        
        // อัปเดตรหัสผ่านผู้ใช้งานใหม่
        const { error: updateError } = await supabase.auth.updateUser({
          password: password,
        })

        setLoading(false)

        if (updateError) {
          setError(updateError.message)
        } else {
          setSuccess("เปลี่ยนรหัสผ่านผู้ใช้งานสำเร็จ! ระบบจะพาท่านย้อนกลับไปยังหน้าเข้าสู่ระบบ")
          
          // ทำการออกจากระบบจากเซสชันกู้คืน เพื่อให้เข้าสู่ระบบใหม่อย่างสมบูรณ์
          await supabase.auth.signOut()

          setTimeout(() => {
            router.push("/login")
          }, 2500)
        }
      } catch (err) {
        setLoading(false)
        setError("ไม่สามารถอัปเดตรหัสผ่านใหม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง")
      }
    }
  }

  const strength = getPasswordStrength()

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
          ระบบกู้คืนและกำหนดรหัสผ่านใหม่ของผู้ใช้
        </p>
      </div>

      {/* การ์ดฟอร์มแก้ไขรหัสผ่าน */}
      <div className="w-full max-w-md z-10 glass-panel p-8 rounded-3xl shadow-2xl relative">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-t-3xl" />

        <form onSubmit={handleSubmit} className="space-y-5">
          <h2 className="text-xl font-medium text-slate-200 flex items-center gap-2 mb-2">
            <Lock className="w-5 h-5 text-blue-400" /> ตั้งรหัสผ่านใหม่
          </h2>

          {/* แสดงกล่อง Error */}
          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs flex items-start gap-2 leading-relaxed">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* แสดงกล่อง Success */}
          {success && (
            <div className="p-4 bg-teal-500/10 border border-teal-500/25 text-teal-400 rounded-xl text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4.5 h-4.5 mt-0.5 shrink-0 text-teal-500" />
              <span className="leading-normal">{success}</span>
            </div>
          )}

          {!success && sessionChecked && (!error || password !== "") && (
            <>
              {/* ช่องรหัสผ่านใหม่ */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">รหัสผ่านใหม่ (New Password)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Lock className="w-4 h-4 text-slate-500" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="รหัสผ่านใหม่อย่างน้อย 6 หลัก"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 transition-colors text-sm font-mono"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-400 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* แทบแสดงระดับความแข็งแรงของรหัสผ่าน */}
              {password && (
                <div className="space-y-1 py-1">
                  <div className="flex justify-between items-center text-[10px] font-semibold">
                    <span className="text-slate-500">ความปลอดภัยของรหัส:</span>
                    <span className={strength.color}>{strength.label}</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        strength.percent <= 25 ? "bg-red-500" : strength.percent <= 45 ? "bg-amber-500" : strength.percent <= 65 ? "bg-blue-500" : "bg-teal-500"
                      }`}
                      style={{ width: `${strength.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* ยืนยันรหัสผ่านใหม่ */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">ยืนยันรหัสผ่านใหม่อีกครั้ง (Confirm Password)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Lock className="w-4 h-4 text-slate-500" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="ยืนยันรหัสผ่านให้ตรงกัน"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-200 transition-colors text-sm font-mono"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="w-full glow-btn bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/15 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    บันทึกรหัสผ่านและอัปเดต <Eye className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          )}

          {/* กำลังตรวจสอบสิทธิ์เซสชัน */}
          {!sessionChecked && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-500">กำลังตรวจสอบสิทธิ์กู้คืนความปลอดภัย...</p>
            </div>
          )}

          {/* ปุ่มกรณีที่ไม่ผ่านสิทธิ์เซสชัน */}
          {error && !success && password === "" && (
            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="w-full bg-slate-900 border border-slate-800 text-slate-300 py-3 px-4 rounded-xl text-xs hover:bg-slate-850 hover:text-white transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              ขอลิงก์รีเซ็ตรหัสผ่านใหม่อีกครั้ง <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>
    </main>
  )
}
