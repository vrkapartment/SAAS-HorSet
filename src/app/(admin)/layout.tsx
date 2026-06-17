"use client"

import React from "react"
import { usePathname } from "next/navigation"
import DashboardLayout from "@/components/DashboardLayout"

export default function AdminRouteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Determine starting role based on the path.
  // "/super-admin" pages start as "super_admin", other admin pages start as "admin"
  const role = pathname?.includes("/super-admin") ? "super_admin" : "admin"

  return (
    <DashboardLayout role={role}>
      {children}
    </DashboardLayout>
  )
}
