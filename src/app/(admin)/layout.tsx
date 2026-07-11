"use client"

import React from "react"
import { usePathname } from "next/navigation"
import DashboardLayout from "@/components/DashboardLayout"

// เดิม /billing, /manage-bills, /meter เคยอยู่คนละ route group "(staff)" ทำให้ DashboardLayout
// unmount/remount ใหม่ทุกครั้งที่สลับไปมากับหน้าใน (admin) — รวมมาไว้กลุ่มเดียวกันเพื่อให้
// DashboardLayout (และ realtime subscriptions ข้างใน) mount ค้างอยู่ตลอดการ nav ข้ามหน้าเหล่านี้
const STAFF_ONLY_PATHS = ["/billing", "/manage-bills", "/meter"]

export default function AdminRouteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Determine starting role based on the path.
  // "/super-admin" pages start as "super_admin", staff-only pages start as "staff", others as "admin"
  const role = pathname?.includes("/super-admin")
    ? "super_admin"
    : STAFF_ONLY_PATHS.some((p) => pathname?.startsWith(p))
      ? "staff"
      : "admin"

  return (
    <DashboardLayout role={role}>
      {children}
    </DashboardLayout>
  )
}
