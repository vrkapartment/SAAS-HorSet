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

  const fetchSubscription = useCallback(async (forceRefresh = false) => {
    if (!workspaceId) {
      setSubscription(null)
      setLoading(false)
      setError(null)
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
    }
  }, [workspaceId])

  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  const refetch = useCallback(() => fetchSubscription(true), [fetchSubscription])

  return { subscription, loading, error, refetch }
}