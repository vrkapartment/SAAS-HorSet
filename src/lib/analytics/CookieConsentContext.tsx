"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

export type ConsentStatus = "granted" | "denied" | "pending"

interface CookieConsentContextType {
  status: ConsentStatus
  grant: () => void
  deny: () => void
}

const COOKIE_NAME = "horset_cookie_consent"

const CookieConsentContext = createContext<CookieConsentContextType | undefined>(undefined)

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

function setCookie(name: string, value: string, days = 180) {
  if (typeof document === "undefined") return
  const date = new Date()
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
  const isSecure = typeof location !== "undefined" && location.protocol === "https:"
  document.cookie = `${name}=${value}; path=/; expires=${date.toUTCString()}${isSecure ? "; Secure" : ""}; SameSite=Lax`
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConsentStatus>("pending")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = getCookie(COOKIE_NAME)
    if (saved === "granted" || saved === "denied") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(saved)
    }
    setMounted(true)
  }, [])

  const grant = () => {
    setCookie(COOKIE_NAME, "granted")
    setStatus("granted")
  }

  const deny = () => {
    setCookie(COOKIE_NAME, "denied")
    setStatus("denied")
  }

  return (
    <CookieConsentContext.Provider value={{ status: mounted ? status : "pending", grant, deny }}>
      {children}
    </CookieConsentContext.Provider>
  )
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext)
  if (!context) {
    throw new Error("useCookieConsent must be used within a CookieConsentProvider")
  }
  return context
}
