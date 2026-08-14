"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Rocket, Loader2, AlertCircle } from "lucide-react"
import { completeGoogleWorkspaceRegistrationAction } from "@/features/auth/actions"
import { getCurrentUserProfileClient } from "@/features/auth/client"

export default function CompleteWorkspacePage() {
  const router = useRouter()
  const [checkingSession, setCheckingSession] = useState(true)
  const [propertyName, setPropertyName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkSession() {
      const res = await getCurrentUserProfileClient(true)
      if (!res.success) {
        router.replace("/register")
        return
      }
      setCheckingSession(false)
    }
    checkSession()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!propertyName.trim()) {
      setError("กรุณากรอกชื่อหอพัก/อพาร์ทเมนต์ของคุณ")
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await completeGoogleWorkspaceRegistrationAction(propertyName.trim())
    if (res.success) {
      router.push("/dashboard")
    } else {
      setSubmitting(false)
      setError(res.error || "สร้างหอพักใหม่ไม่สำเร็จ")
    }
  }

  if (checkingSession) {
    return (
      <main className="dark min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </main>
    )
  }

  return (
    <main className="dark relative min-h-screen flex flex-col justify-center items-center p-4 overflow-hidden bg-slate-950">
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="text-center z-10 mb-8 flex flex-col items-center">
        <div className="inline-flex items-center justify-center p-2 bg-slate-900/60 border border-slate-800/80 rounded-2xl shadow-xl shadow-blue-500/10 mb-3 w-16 h-16">
          <img src="/icon-512x512.png" className="w-12 h-12 object-contain" alt="HorSet Logo" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white">
          HorSet <span className="text-blue-500 font-semibold">(หอเสร็จ)</span>
        </h1>
      </div>

      <div className="w-full max-w-md z-10 glass-panel p-8 rounded-3xl shadow-2xl relative">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-t-3xl" />

        <h2 className="text-xl font-medium text-slate-200 mb-2 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-indigo-400" /> ตั้งค่าหอพักของคุณ
        </h2>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          เข้าสู่ระบบด้วย Google สำเร็จแล้ว อีกขั้นตอนเดียวก่อนเริ่มใช้งาน — กรอกชื่อหอพัก/อพาร์ทเมนต์ของคุณ
        </p>

        {error && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              placeholder="ชื่อหอพัก/อพาร์ทเมนต์ของคุณ"
              className="w-full h-12 pl-10 pr-4 bg-slate-900/60 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> กำลังสร้างหอพัก...
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4" /> เริ่มต้นใช้งานฟรี 30 วัน
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  )
}
