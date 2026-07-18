"use client"

import React, { useState } from "react"
import { usePathname } from "next/navigation"
import DashboardLayout from "@/components/DashboardLayout"

// เดิม /billing, /manage-bills, /meter เคยอยู่คนละ route group "(staff)" ทำให้ DashboardLayout
// unmount/remount ใหม่ทุกครั้งที่สลับไปมากับหน้าใน (admin) — รวมมาไว้กลุ่มเดียวกันเพื่อให้
// DashboardLayout (และ realtime subscriptions ข้างใน) mount ค้างอยู่ตลอดการ nav ข้ามหน้าเหล่านี้
const STAFF_ONLY_PATHS = ["/billing", "/manage-bills", "/meter"]

export default function AdminRouteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Dashboard/Billing/Manage Bills จำเดือนที่เลือกไว้ร่วมกันผ่าน sessionStorage คีย์ "dashboard_month"/"dashboard_year"
  // เพื่อให้สลับหน้าไปมาแล้วยังดูเดือนเดิมต่อเนื่อง — แต่ layout นี้ mount ครั้งเดียวตอนเข้าสู่ระบบใหม่/reload จริงๆ
  // เท่านั้น (ไม่ remount ตอนสลับหน้าภายในกลุ่มนี้ ตามคอมเมนต์ด้านบน) จึงเป็นจุดที่เหมาะสมที่สุดในการรีเซ็ตค่าที่จำไว้
  // ให้เป็นเดือนปัจจุบันเสมอทุกครั้งที่เริ่ม session ใหม่ ไม่ให้ค้างเดือนเก่าจาก session ก่อนหน้าไปตลอดกาล
  // ใช้ lazy useState initializer (ไม่ใช่ useEffect) เพราะต้องรันตอน render ของ parent ก่อนที่ children
  // (หน้า dashboard/billing/manage-bills) จะ mount และอ่านค่า sessionStorage นี้ไปใช้ — ถ้าใช้ useEffect
  // จะรันหลัง effect ของ children เสมอ (React ยิง effect จากลูกขึ้นบน) ทำให้ reset ช้าไปหนึ่งจังหวะ
  useState(() => {
    if (typeof window !== "undefined") {
      const now = new Date()
      sessionStorage.setItem("dashboard_month", String(now.getMonth() + 1).padStart(2, "0"))
      sessionStorage.setItem("dashboard_year", String(now.getFullYear()))
    }
    return null
  })
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
