"use client"

import { useSyncExternalStore } from "react"

// Tailwind breakpoint `md` = 48rem (768px) — ตรวจแล้วว่า globals.css ไม่ได้ override breakpoint
// (@theme ในไฟล์นั้นกำหนดแค่สีกับฟอนต์) จึงใช้ค่าเริ่มต้นของ Tailwind ได้ตรง ๆ
const MD_BREAKPOINT_QUERY = "(min-width: 48rem)"

function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(MD_BREAKPOINT_QUERY)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(MD_BREAKPOINT_QUERY).matches
}

function getServerSnapshot(): null {
  return null
}

/**
 * บอกว่า viewport ปัจจุบันอยู่ระดับ desktop (>= Tailwind `md`) หรือไม่
 *
 * คืน `null` ตอน SSR และช่วง hydration เพื่อให้ผู้เรียกยัง render ทั้งสองเวอร์ชัน (mobile/desktop) ไปก่อน
 * เหมือนพฤติกรรมเดิมที่ปล่อยให้ CSS ซ่อนฝั่งที่ไม่ใช้ แล้วค่อยตัดฝั่งที่ไม่ได้แสดงออกจาก React tree
 * เมื่อรู้ขนาดจริง — กัน hydration mismatch และกันการกระพริบเป็น layout ผิดฝั่ง
 *
 * ใช้ useSyncExternalStore แทน useState + useEffect เพราะเป็นการอ่าน external store (matchMedia) จริง ๆ
 * และไม่ต้อง setState ใน effect ซึ่งจะทำให้เกิด cascading render รอบพิเศษทุกครั้งที่ mount
 */
export function useIsDesktop(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, getSnapshot, getServerSnapshot)
}
