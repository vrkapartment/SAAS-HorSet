"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/translations/LanguageProvider"

export default function MeterRedirectPage() {
  const router = useRouter()
  const { t } = useLanguage()

  useEffect(() => {
    router.replace("/billing")
  }, [router])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 text-sm font-medium animate-pulse">
          {t("meter.redirecting")}
        </p>
      </div>
    </div>
  )
}
