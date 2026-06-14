"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import th from "./th.json"
import en from "./en.json"

export type Locale = "th" | "en"

const translations = {
  th,
  en,
}

interface LanguageContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return
  const date = new Date()
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
  document.cookie = `${name}=${value}; path=/; expires=${date.toUTCString()}; Secure; SameSite=Lax`
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("th")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const savedLocale = getCookie("horset_locale") as Locale
    if (savedLocale === "th" || savedLocale === "en") {
      setLocaleState(savedLocale)
    }
    setMounted(true)
  }, [])

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale)
    setCookie("horset_locale", newLocale)
  }

  // Safe nested key lookup (e.g. t("common.login"))
  const t = (key: string): string => {
    if (!mounted) {
      // Fallback to Thai during SSR to maintain HTML structure match
      const dict = translations["th"] as any
      return getNestedValue(dict, key) || key
    }

    const dict = translations[locale] as any
    return getNestedValue(dict, key) || key
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

function getNestedValue(obj: any, path: string): string | null {
  const keys = path.split(".")
  let current = obj
  for (const k of keys) {
    if (current && typeof current === "object" && k in current) {
      current = current[k]
    } else {
      return null
    }
  }
  return typeof current === "string" ? current : null
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
