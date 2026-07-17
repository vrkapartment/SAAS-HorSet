"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { MailCheck, ShieldCheck, Loader2, AlertCircle } from "lucide-react"
import { confirmEmailAction } from "@/features/auth/actions"

export default function ConfirmEmailPage() {
  const router = useRouter()
  const [code, setCode] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      setCode(params.get("code"))
    }
  }, [])

  const handleConfirm = async () => {
    if (!code) {
      setError("ลิงก์ยืนยันอีเมลไม่ถูกต้องหรือหมดอายุ กรุณาขอส่งอีเมลยืนยันใหม่")
      return
    }
    setConfirming(true)
    setError(null)
    const res = await confirmEmailAction(code)
    if (res.success) {
      router.push("/login?confirmed=1")
    } else {
      setConfirming(false)
      router.push("/login?confirm_error=1")
    }
  }

  return (
    <main className="relative min-h-screen flex flex-col justify-center items-center p-4 overflow-hidden bg-slate-950">
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="text-center z-10 mb-8 flex flex-col items-center">
        <div className="inline-flex items-center justify-center p-2 bg-slate-900/60 border border-slate-800/80 rounded-2xl shadow-xl shadow-blue-500/10 mb-3 w-16 h-16">
          <img src="/icon-512x512.png" className="w-12 h-12 object-contain" alt="HorSet Logo" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-blue-400">
          HorSet <span className="text-blue-500 font-semibold">(หอเสร็จ)</span>
        </h1>
      </div>

      <div className="w-full max-w-md z-10 glass-panel p-8 rounded-3xl shadow-2xl relative text-center">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-t-3xl" />

        <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
          <MailCheck className="w-7 h-7 text-blue-400" />
        </div>

        <h2 className="text-xl font-medium text-slate-200 mb-2">ยืนยันอีเมลของคุณ</h2>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          กดปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งานระบบ — เพื่อความปลอดภัย ระบบจะยืนยันตัวตนก็ต่อเมื่อคุณกดปุ่มนี้ด้วยตัวเองเท่านั้น
        </p>

        {error && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || !code}
          className="w-full h-12 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all cursor-pointer"
        >
          {confirming ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> กำลังยืนยัน...
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" /> ยืนยันอีเมล
            </>
          )}
        </button>

        {!code && (
          <p className="text-xs text-slate-500 mt-4">
            ไม่พบลิงก์ยืนยันที่ถูกต้อง กรุณาเปิดลิงก์จากอีเมลที่ระบบส่งให้อีกครั้ง
          </p>
        )}
      </div>
    </main>
  )
}
