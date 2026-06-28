"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function TestConnectionPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/settings?tab=supabase")
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="text-center font-bold text-slate-500 animate-pulse text-sm">
        กำลังนำคุณไปยังหน้าตั้งค่าระบบ...
      </div>
    </div>
  )
}
