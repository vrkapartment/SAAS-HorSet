"use client"

import { useCallback, useEffect, useState } from "react"
import { getWorkspaceSubscription, type WorkspaceSubscriptionView } from "@/features/subscription/actions"

interface UseWorkspaceSubscriptionResult {
  subscription: WorkspaceSubscriptionView | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// Cache + in-flight dedup ต่อ workspace ในหน่วยความจำฝั่ง browser — กันไม่ให้หลาย component
// ที่เรียก hook นี้พร้อมกัน (เช่น PackageSettingsTab + PricingModal ตอนเปิดแท็บแพ็กเกจ) ยิง
// Server Action เดิมซ้ำซ้อนกันเอง (เทียบเคียงกับ getCurrentUserProfileClient ใน src/features/auth/client.ts)
const CACHE_TTL = 5000
let cachedResult: { workspaceId: string; res: Awaited<ReturnType<typeof getWorkspaceSubscription>>; timestamp: number } | null = null
let activeFetch: { workspaceId: string; promise: ReturnType<typeof getWorkspaceSubscription> } | null = null

function fetchWorkspaceSubscriptionCached(workspaceId: string, forceRefresh: boolean) {
  if (!forceRefresh && cachedResult && cachedResult.workspaceId === workspaceId && Date.now() - cachedResult.timestamp < CACHE_TTL) {
    return Promise.resolve(cachedResult.res)
  }
  if (!forceRefresh && activeFetch && activeFetch.workspaceId === workspaceId) {
    return activeFetch.promise
  }

  const promise = (async () => {
    try {
      const res = await getWorkspaceSubscription(workspaceId)
      cachedResult = { workspaceId, res, timestamp: Date.now() }
      return res
    } finally {
      activeFetch = null
    }
  })()

  if (!forceRefresh) {
    activeFetch = { workspaceId, promise }
  }
  return promise
}

/**
 * Custom hook สำหรับดึงสถานะ subscription ของ workspace ปัจจุบัน
 * ใช้ใน component ที่ต้องแสดงสถานะแผน/การชำระเงิน เช่น SubscriptionStatusBanner, หน้าตั้งค่าบิล
 */
export function useWorkspaceSubscription(workspaceId: string): UseWorkspaceSubscriptionResult {
  const [subscription, setSubscription] = useState<WorkspaceSubscriptionView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // เก็บ workspaceId ที่ fetch เสร็จล่าสุดไว้เทียบกับ workspaceId ปัจจุบัน — ถ้ายังไม่ตรงกันแปลว่า
  // ยัง "ต้องถือว่ากำลังโหลดอยู่" ป้องกัน UI เห็นช่วงสั้นๆ ที่ loading เป็น false แต่ subscription ยังเป็นค่าเก่า/null
  // (เกิดตอน workspaceId เปลี่ยนจากค่าว่างเป็นค่าจริงในการ render รอบเดียวกับที่ effect ยังไม่ทันรันซ้ำ)
  const [fetchedForId, setFetchedForId] = useState<string | null>(null)

  const fetchSubscription = useCallback(async (forceRefresh = false) => {
    if (!workspaceId) {
      setSubscription(null)
      setLoading(false)
      setError(null)
      setFetchedForId("")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetchWorkspaceSubscriptionCached(workspaceId, forceRefresh)
      if (res.success && res.data) {
        setSubscription(res.data)
      } else {
        setSubscription(null)
        setError(res.error || "ไม่สามารถดึงข้อมูลสถานะการใช้งานของหอพักได้")
      }
    } catch (err) {
      setSubscription(null)
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูลสถานะการใช้งานของหอพัก")
    } finally {
      setLoading(false)
      setFetchedForId(workspaceId)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  const refetch = useCallback(() => fetchSubscription(true), [fetchSubscription])

  const effectiveLoading = loading || fetchedForId !== workspaceId

  return { subscription, loading: effectiveLoading, error, refetch }
}