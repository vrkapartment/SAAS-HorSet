"use client"

import React from "react"
import DashboardLayout from "@/components/DashboardLayout"

export default function StaffRouteLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout role="staff">
      {children}
    </DashboardLayout>
  )
}
