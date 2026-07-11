"use client"

import { createContext, useContext } from "react"
import type { useSupportAccess } from "@/hooks/useSupportAccess"

type SupportAccessValue = ReturnType<typeof useSupportAccess>

export const SupportAccessContext = createContext<SupportAccessValue | undefined>(undefined)

export function useSupportAccessContext() {
  const context = useContext(SupportAccessContext)
  if (context === undefined) {
    throw new Error("useSupportAccessContext must be used within DashboardLayout")
  }
  return context
}