"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Prevent hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="w-9 h-9 rounded-xl bg-slate-900/10 border border-slate-800/10" />
    )
  }

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="p-2 text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-slate-200/50 dark:hover:bg-slate-900/50 rounded-xl transition-all duration-300 border border-transparent hover:border-slate-300/30 dark:hover:border-slate-800/30 shadow-sm flex items-center justify-center"
      title={isDark ? "สลับเป็นโหมดสว่าง (Light Mode)" : "สลับเป็นโหมดมืด (Dark Mode)"}
    >
      {isDark ? (
        <Sun className="w-4.5 h-4.5 text-amber-400 animate-[spin_12s_linear_infinite]" />
      ) : (
        <Moon className="w-4.5 h-4.5 text-slate-700 hover:text-indigo-600 transition-colors" />
      )}
    </button>
  )
}
