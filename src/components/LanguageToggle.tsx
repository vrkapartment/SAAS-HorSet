"use client"

import * as React from "react"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { Globe } from "lucide-react"

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="w-14 h-9 rounded-xl bg-slate-900/10 border border-slate-800/10" />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "th" ? "en" : "th")}
      className="flex items-center gap-1.5 px-2.5 py-2 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-200/50 dark:hover:bg-slate-900/50 rounded-xl transition-all duration-300 border border-transparent hover:border-slate-300/30 dark:hover:border-slate-800/30 shadow-sm text-xs font-bold"
      title={locale === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
    >
      <Globe className="w-4 h-4" />
      <span className="uppercase tracking-wider font-semibold">{locale}</span>
    </button>
  )
}
