"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function MeterRedirectPage() {
  const router = useRouter()
  
  useEffect(() => {
    router.replace("/billing")
  }, [router])

  return (
    <div className="min-h-screen bg-[#060a13] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 text-sm font-medium animate-pulse">
          กำลังย้ายไปหน้าจดมิเตอร์และจัดการบิลในหน้าเดียว...
        </p>
      </div>
    </div>
  )
}
