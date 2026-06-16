"use client"

import React, { createContext, useContext, useState, useCallback } from "react"

// โครงสร้างของข้อมูลที่จะจัดเก็บใน Cache
interface CacheEntry<T = any> {
  data: T
  timestamp: number // เวลาที่บันทึกข้อมูล (มิลลิวินาที)
}

interface WorkspaceCache {
  [cacheKey: string]: CacheEntry
}

interface WorkspaceDataContextType {
  /**
   * ดึงข้อมูลจาก Cache ในหน่วยความจำอย่างปลอดภัยตาม Workspace และ Key
   * @param workspaceId ID ของ Workspace ปัจจุบัน
   * @param key ชื่อประเภทของข้อมูล เช่น 'rooms', 'finance_settings', 'bills_2026-06'
   * @param ttl ระยะเวลาที่ข้อมูลสามารถอยู่ใน cache ได้ (หน่วยมิลลิวินาที, ค่าเริ่มต้น 5 นาที)
   */
  getCachedData: <T = any>(workspaceId: string, key: string, ttl?: number) => T | null

  /**
   * บันทึกข้อมูลลงใน Cache
   * @param workspaceId ID ของ Workspace ปัจจุบัน
   * @param key ชื่อประเภทของข้อมูล
   * @param data ข้อมูลที่ต้องการบันทึก
   */
  setCachedData: <T = any>(workspaceId: string, key: string, data: T) => void

  /**
   * ลบ Cache ทั้งหมดของ Workspace ปัจจุบัน (เช่น ตอนกดปุ่ม Refresh เพื่อดึงข้อมูลใหม่)
   * @param workspaceId ID ของ Workspace ปัจจุบัน
   */
  clearWorkspaceCache: (workspaceId: string) => void

  /**
   * ล้าง Cache ทั้งหมดในระบบ (เช่น ตอนเปลี่ยนบัญชี หรือ Logout)
   */
  clearAllCache: () => void
}

const WorkspaceDataContext = createContext<WorkspaceDataContextType | undefined>(undefined)

const DEFAULT_TTL = 5 * 60 * 1000 // 5 นาทีเป็นค่าเริ่มต้นในระดับ Production

export function WorkspaceDataProvider({ children }: { children: React.ReactNode }) {
  const [cache, setCache] = useState<WorkspaceCache>({})

  // ดึงข้อมูลจาก Cache แบบแยก partition ตาม Workspace และ Key เพื่อป้องกันข้อมูลรั่วไหลข้าม Workspace
  const getCachedData = useCallback(<T = any>(
    workspaceId: string,
    key: string,
    ttl: number = DEFAULT_TTL
  ): T | null => {
    if (!workspaceId) return null
    const cacheKey = `${workspaceId}_${key}`
    const entry = cache[cacheKey]

    if (!entry) return null

    // ตรวจสอบอายุของ Cache (Time-To-Live)
    const isExpired = Date.now() - entry.timestamp > ttl
    if (isExpired) {
      // ลบ cache ที่หมดอายุแบบ lazy
      setCache((prev) => {
        const next = { ...prev }
        delete next[cacheKey]
        return next
      })
      return null
    }

    return entry.data as T
  }, [cache])

  // บันทึกข้อมูลลงใน Cache ด้วยรหัส Workspace ผสมกับ Key อย่างปลอดภัย
  const setCachedData = useCallback(<T = any>(
    workspaceId: string,
    key: string,
    data: T
  ) => {
    if (!workspaceId) return
    const cacheKey = `${workspaceId}_${key}`
    
    setCache((prev) => ({
      ...prev,
      [cacheKey]: {
        data,
        timestamp: Date.now()
      }
    }))
  }, [])

  // ล้าง Cache ทั้งหมดของ Workspace หนึ่งๆ (เช่น ตอนที่ต้องการดึงข้อมูลล่าสุด)
  const clearWorkspaceCache = useCallback((workspaceId: string) => {
    if (!workspaceId) return
    setCache((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((cacheKey) => {
        if (cacheKey.startsWith(`${workspaceId}_`)) {
          delete next[cacheKey]
        }
      })
      return next
    })
  }, [])

  // ล้าง Cache ทั้งหมดของแอปพลิเคชัน
  const clearAllCache = useCallback(() => {
    setCache({})
  }, [])

  return (
    <WorkspaceDataContext.Provider
      value={{
        getCachedData,
        setCachedData,
        clearWorkspaceCache,
        clearAllCache
      }}
    >
      {children}
    </WorkspaceDataContext.Provider>
  )
}

export function useWorkspaceData() {
  const context = useContext(WorkspaceDataContext)
  if (context === undefined) {
    throw new Error("useWorkspaceData must be used within a WorkspaceDataProvider")
  }
  return context
}
