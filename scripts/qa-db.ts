/**
 * ตัวช่วยเชื่อมฐานข้อมูลสำหรับสคริปต์ QA ทุกตัว
 *
 * ⚠️ เหตุผลที่ต้องมีไฟล์นี้ ไม่ใช่แค่ลดโค้ดซ้ำ
 *
 * เคยเกิดจริง: สคริปต์วินิจฉัยเรียก .select("... updated_at ...") กับตารางที่ไม่มีคอลัมน์นั้น
 * PostgREST คืน error กลับมาพร้อม data = null แต่สคริปต์ไม่ได้เช็ค error จึงวนลูปบน array ว่าง
 * แล้วรายงานว่า "ไม่มีข้อมูลในตาราง" → เกือบทำให้เข้าใจว่าข้อมูล production หายไป
 *
 * การรายงานผิดว่าข้อมูลหาย อันตรายกว่าการไม่มีเครื่องมือตรวจเลย เพราะนำไปสู่การตัดสินใจ
 * กู้ข้อมูลที่ไม่จำเป็น ไฟล์นี้บังคับให้ทุก query ต้องผ่านการเช็ค error — ถ้า error ให้หยุด
 * ทันทีพร้อมบอกว่า query ไหนพัง ไม่ปล่อยให้เดินต่อด้วยข้อมูลว่าง
 */
import { readFileSync } from "node:fs"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/** โหลดค่าจาก .env.local แล้ว .env (ไม่ทับค่าที่ตั้งมาจาก environment แล้ว) */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
      }
    } catch { /* ไม่มีไฟล์ก็ข้าม */ }
  }
}

/**
 * สร้าง client สำหรับสคริปต์ QA
 *
 * ตั้ง QA_DB_URL / QA_DB_KEY เพื่อชี้ไปฐานข้อมูลอื่น (เช่น staging) แทน production ได้
 */
export function qaClient(): { db: SupabaseClient; label: string } {
  loadEnv()
  const url = process.env.QA_DB_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.QA_DB_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("ไม่พบ SUPABASE URL/KEY — ตั้งใน .env หรือส่ง QA_DB_URL / QA_DB_KEY มา")
    process.exit(1)
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return { db, label: url.replace(/https:\/\/([^.]+)\..*/, "$1") }
}

/**
 * บังคับเช็ค error ของทุก query — ใช้ครอบ query ทุกครั้ง
 *
 * ใช้:  const rooms = must("ห้องทั้งหมด", await db.from("rooms").select("id"))
 *
 * ถ้า query พัง (เช่นพิมพ์ชื่อคอลัมน์ผิด) จะหยุดพร้อมบอกว่า query ไหน แทนที่จะคืน array ว่าง
 * ให้สคริปต์เดินต่อแล้วสรุปผลผิด
 */
export function must<T>(what: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) {
    console.error(`\nquery ล้มเหลว: ${what}`)
    console.error(`  ${res.error.message}`)
    console.error(`\nหยุดทำงาน — ผลลัพธ์ที่ได้จากข้อมูลว่างจะทำให้สรุปผิด`)
    process.exit(2)
  }
  if (res.data === null) {
    console.error(`\nquery คืน null โดยไม่มี error: ${what}`)
    process.exit(2)
  }
  return res.data
}

/** จำนวนหน่วยที่ใช้ รองรับมิเตอร์หมุนครบรอบ (curr < prev) — ต้องตรงกับ getUnits ฝั่งแอป */
export function meterUnits(curr: number, prev: number): number {
  return curr >= prev ? curr - prev : (10000 - prev) + curr
}
