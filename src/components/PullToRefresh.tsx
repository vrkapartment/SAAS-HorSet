"use client"

import React, { useState, useEffect, useRef } from "react"
import { RefreshCw } from "lucide-react"

interface PullToRefreshProps {
  children: React.ReactNode
  onRefresh?: () => Promise<void>
  disabled?: boolean
}

export default function PullToRefresh({
  children,
  onRefresh,
  disabled = false
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isPulling, setIsPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef(0)
  const activeTouchRef = useRef(false)

  // ดึง scroll container ขององค์ประกอบ
  const getScrollContainer = (): HTMLElement => {
    if (!containerRef.current) return document.documentElement
    // หาองค์ประกอบที่เป็นตัวเลื่อนแนวตั้งที่ใกล้ที่สุด
    let parent = containerRef.current.parentElement
    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        parent.scrollHeight > parent.clientHeight
      ) {
        return parent
      }
      parent = parent.parentElement
    }
    return document.documentElement
  }

  const handleTouchStart = (e: TouchEvent) => {
    if (disabled || refreshing) return

    const scrollContainer = getScrollContainer()
    const isAtTop = scrollContainer.scrollTop <= 1 // ค่าเผื่อเล็กน้อย

    if (isAtTop) {
      startYRef.current = e.touches[0].clientY
      activeTouchRef.current = true
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!activeTouchRef.current || disabled || refreshing) return

    const currentY = e.touches[0].clientY
    const dy = currentY - startYRef.current

    if (dy > 0) {
      // ดึงลงจากด้านบน: ปิดการทำงานเลื่อนปกติของเบราว์เซอร์เพื่อไม่ให้เกิดการเลื่อนซ้อนทับกัน
      if (e.cancelable) {
        e.preventDefault()
      }
      
      setIsPulling(true)
      
      // สูตรลดแรงต้าน (Resistance formula) เพื่อให้ดึงลงยากขึ้นเรื่อยๆ ยิ่งลึกยิ่งมีแรงหน่วง (ความลื่นไหลเป็นธรรมชาติ)
      const resistance = 0.45
      const pull = dy * resistance
      const maxPull = 90
      
      // คำนวณความสูงจำกัดด้วยความโค้งมนที่ราบรื่น
      const cappedPull = Math.min(pull, maxPull)
      setPullDistance(cappedPull)
    } else {
      // เลื่อนขึ้นปกติ: ปล่อยให้เบราว์เซอร์เลื่อนเอง
      activeTouchRef.current = false
      setIsPulling(false)
      setPullDistance(0)
    }
  };

  const handleTouchEnd = async () => {
    if (!activeTouchRef.current) return
    activeTouchRef.current = false
    setIsPulling(false)

    const threshold = 55 // จุดตัดสินใจเพื่อทำการ Refresh
    if (pullDistance >= threshold) {
      setRefreshing(true)
      setPullDistance(50) // ดึงค้างที่ความสูงของตัวหมุนขณะโหลดข้อมูล

      // สร้างเอฟเฟกต์สั่นสั้นๆ (Haptic Feedback) บนอุปกรณ์มือถือ (ถ้ามีระบบรองรับ)
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(12)
        } catch {
          // ignore sandbox limitation or security error
        }
      }

      try {
        if (onRefresh) {
          await onRefresh()
        } else {
          // หากไม่ได้ส่งฟังก์ชันมา ให้ทำการ Refresh หน้าจอทั้งหมด (Default)
          window.location.reload()
          // รอการโหลดหน้าจอใหม่ ซึ่งมักจะสลายหน้าเว็บเดิมอยู่แล้ว 
          // แต่เราใส่สัญญารอไว้เผื่อเบราว์เซอร์ทำการ cache
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      } catch (err) {
        console.error("Refresh failed:", err)
      } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      // หากดึงลงมาไม่ถึงระยะ threshold ให้เด้งกลับไปที่เดิมด้วยอนิเมชันที่นุ่มนวล
      setPullDistance(0)
    }
  };

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ใช้แบบ passive: false เพื่ออนุญาตให้สามารถเรียก preventDefault() ใน TouchMove ได้อย่างสมบูรณ์แบบ
    container.addEventListener("touchstart", handleTouchStart, { passive: true })
    container.addEventListener("touchmove", handleTouchMove, { passive: false })
    container.addEventListener("touchend", handleTouchEnd)

    return () => {
      container.removeEventListener("touchstart", handleTouchStart)
      container.removeEventListener("touchmove", handleTouchMove)
      container.removeEventListener("touchend", handleTouchEnd)
    }
  }, [pullDistance, disabled, refreshing])

  return (
    <div ref={containerRef} className="relative w-full min-h-full flex flex-col">
      {/* Pull down indicator (ตัวแจ้งเตือนการดึงและวงหมุนพรีเมียมสไตล์แก้ว) */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center justify-center"
          style={{
            top: `${pullDistance - 42}px`,
            opacity: refreshing ? 1 : Math.min(pullDistance / 50, 1),
            transform: `scale(${refreshing ? 1 : Math.min(pullDistance / 50, 1.05)})`,
            transition: isPulling ? "none" : "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
          }}
        >
          <div className="flex items-center gap-2 px-3 py-1.8 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-full shadow-xl border border-slate-200/80 dark:border-slate-800/80 text-blue-650 dark:text-blue-400 font-bold transition-all text-[11px] sm:text-[11px]">
            <RefreshCw
              className={`w-3.5 h-3.5 text-blue-500 dark:text-blue-400 ${refreshing ? "animate-spin" : ""}`}
              style={{
                transform: refreshing ? undefined : `rotate(${pullDistance * 4.5}deg)`
              }}
            />
            <span className="tracking-tight text-slate-700 dark:text-slate-300">
              {refreshing ? "กำลังอัปเดต..." : pullDistance >= 55 ? "ปล่อยเพื่อรีเฟรช" : "ดึงเพื่อรีเฟรช"}
            </span>
          </div>
        </div>
      )}

      {/* พื้นที่ของเนื้อหา (Content area) */}
      <div 
        className="w-full min-h-full flex-1 flex flex-col"
        style={{
          transform: pullDistance > 0 && isPulling ? `translateY(${pullDistance * 0.25}px)` : "none",
          transition: isPulling ? "none" : "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
        }}
      >
        {children}
      </div>
    </div>
  )
}
