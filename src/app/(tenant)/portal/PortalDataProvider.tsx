"use client"

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { getTenantPortalData, getTenantPortalDataNoLoginAction } from "@/features/tenant/actions"

/**
 * โหลดข้อมูลพอร์ทัลผู้เช่าครั้งเดียวให้ทุกหน้าใต้ /portal ใช้ร่วมกัน
 *
 * อยู่ที่ layout เพราะใน App Router layout จะไม่ remount เวลาสลับไปมาระหว่างหน้าลูก
 * (/portal ↔ /portal/history) ข้อมูลจึงอยู่ต่อ ไม่ต้องยิง server action ซ้ำ
 * และ poll ทุก 30 วินาทีก็ทำที่เดียว ไม่ใช่หน้าละรอบ
 *
 * ผู้เช่าเข้าถึงหน้านี้ได้แบบไม่ต้อง login ผ่านลิงก์จาก LINE (workspace_id + room + token)
 * จึงอ่านพารามิเตอร์จาก URL ตรง ๆ แบบเดียวกับที่หน้า /portal เคยทำ
 */

type PortalResult =
  | Awaited<ReturnType<typeof getTenantPortalDataNoLoginAction>>
  | Awaited<ReturnType<typeof getTenantPortalData>>

type PortalDataValue = {
  /** ผลดิบจาก server action — แต่ละหน้าหยิบไปแปลงเอง */
  result: PortalResult | null
  /** true เฉพาะรอบโหลดแรกเท่านั้น การ poll เบื้องหลังไม่ทำให้จอกระพริบ */
  loading: boolean
  /** true = เข้ามาด้วยลิงก์จาก LINE (ไม่ได้ login) — ใช้ตัดสินว่าจะโชว์ปุ่มออกจากระบบไหม */
  isLoginFree: boolean
  reload: () => Promise<void>
}

const PortalDataContext = createContext<PortalDataValue | null>(null)

export function usePortalData(): PortalDataValue {
  const ctx = useContext(PortalDataContext)
  if (!ctx) {
    throw new Error("usePortalData ต้องอยู่ภายใต้ PortalDataProvider (layout ของ /portal)")
  }
  return ctx
}

/** ตัวระบุห้องที่อยู่ในลิงก์ — room_number เป็นรูปแบบเก่าที่ยังค้างอยู่ใน LINE ของผู้เช่า */
function readPortalParams() {
  if (typeof window === "undefined") {
    return { workspaceId: "", roomId: "", roomNumber: "", token: "" }
  }
  const params = new URLSearchParams(window.location.search)
  return {
    workspaceId: params.get("workspace_id") || "",
    roomId: params.get("room_id") || "",
    roomNumber: params.get("room_number") || "",
    token: params.get("token") || ""
  }
}

export default function PortalDataProvider({ children }: { children: React.ReactNode }) {
  const [result, setResult] = useState<PortalResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLoginFree, setIsLoginFree] = useState(false)
  const loadedOnceRef = useRef(false)

  const load = useCallback(async (isInitial: boolean) => {
    const { workspaceId, roomId, roomNumber, token } = readPortalParams()

    try {
      let res: PortalResult
      if (workspaceId && (roomId || roomNumber)) {
        setIsLoginFree(true)
        res = await getTenantPortalDataNoLoginAction(
          workspaceId,
          roomId ? { roomId } : { roomNumber },
          token
        )
      } else {
        setIsLoginFree(false)
        res = await getTenantPortalData()
      }
      setResult(res)
    } catch (e) {
      console.error("Error loading portal data:", e)
    } finally {
      if (isInitial) setLoading(false)
      loadedOnceRef.current = true
    }
  }, [])

  const reload = useCallback(async () => {
    await load(false)
  }, [load])

  // เริ่มโหลดใน callback ของ timer เพื่อไม่ให้ setState เกิดในจังหวะเดียวกับ render รอบแรก
  useEffect(() => {
    const bootstrap = setTimeout(() => { load(true) }, 0)

    // Poll ทุก 30s เพื่ออัปเดตสถานะบิลอัตโนมัติ (ไม่ใช้ Supabase Realtime ที่นี่ เพราะหน้านี้เข้าถึงได้
    // แบบไม่ต้อง login ด้วย token ซึ่งไม่มี RLS session ให้ subscribe ตรงจากเบราว์เซอร์ได้อย่างปลอดภัย)
    // หยุด poll เมื่อแท็บถูกซ่อน แล้วรีเฟรชทันทีเมื่อกลับมาเปิดดูอีกครั้ง
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(false)
    }, 30000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && loadedOnceRef.current) load(false)
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearTimeout(bootstrap)
      clearInterval(timer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [load])

  return (
    <PortalDataContext.Provider value={{ result, loading, isLoginFree, reload }}>
      {children}
    </PortalDataContext.Provider>
  )
}
