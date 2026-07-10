"use client"

import { useCallback, useEffect, useState } from "react"
import { getWorkspaceSubscription, type WorkspaceSubscriptionView } from "@/features/subscription/actions"

interface UseWorkspaceSubscriptionResult {
  subscription: WorkspaceSubscriptionView | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Custom hook สำหรับดึงสถานะ subscription ของ workspace ปัจจุบัน
 * ใช้ใน component ที่ต้องแสดงสถานะแผน/การชำระเงิน เช่น SubscriptionStatusBanner, หน้าตั้งค่าบิล
 */
export function useWorkspaceSubscription(workspaceId: string): UseWorkspaceSubscriptionResult {
  const [subscription, setSubscription] = useState<WorkspaceSubscriptionView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSubscription = useCallback(async () => {
    if (!workspaceId) {
      setSubscription(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await getWorkspaceSubscription(workspaceId)
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

  return { subscription, loading, error, refetch: fetchSubscription }
}