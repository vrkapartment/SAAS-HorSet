/**
 * Service Role Client ที่ "พก" ตัวตนของคนที่กดปุ่มไปให้ฐานข้อมูลรู้ด้วย
 *
 * ── ปัญหาที่แก้ ──
 * บาง Server Action ต้องเขียนผ่าน Service Role (เช่นบันทึกตั้งค่าหอ ที่พนักงาน
 * ผู้มีสิทธิ์ก็ทำได้ แต่ RLS ของตาราง workspaces อนุญาตแค่ admin) Service Role
 * ไม่มี JWT ติดไปด้วย ทำให้ auth.uid() ในฐานข้อมูลเป็น null และ trigger ที่จด
 * audit log จดได้แค่ว่า "ระบบ" ทำ — ซึ่งใช้ตรวจย้อนหลังไม่ได้เลย
 *
 * จุดที่อ่อนไหวที่สุดคือเลขพร้อมเพย์ (ปลายทางของเงินทุกบาท) ถ้าถูกแก้แล้วไม่รู้ว่า
 * ใครแก้ ระบบกันโกงก็ไม่มีความหมาย
 *
 * ── วิธีแก้ ──
 * ใส่ user id ลงใน request header ให้ PostgREST ส่งต่อถึง trigger
 * (trigger อ่านผ่าน current_setting('request.headers'))
 *
 * ── น้ำหนักของหลักฐาน ──
 * log ที่ได้จากทางนี้ถูกจดเป็น actor_source = 'server' ซึ่งต่ำกว่า 'jwt' หนึ่งขั้น
 * และหน้าจอต้องแยกป้ายให้เห็นชัด เพราะเป็นการ "แจ้ง" ไม่ใช่การ "พิสูจน์"
 *
 * ⚠️ ผู้เรียกต้องตรวจ session ให้เรียบร้อยก่อน แล้วส่ง user.id ที่ได้จาก
 *    supabase.auth.getUser() เท่านั้น — ห้ามรับ id จากฟอร์มหรือ query string
 *    เพราะจะกลายเป็นช่องให้ใส่ร้ายคนอื่นว่าเป็นคนแก้ตัวเลข
 *
 *    ค่านี้ปลอมได้เฉพาะผู้ที่ถือ SUPABASE_SERVICE_ROLE_KEY ซึ่งอยู่ฝั่งเซิร์ฟเวอร์
 *    เท่านั้น ไม่เคยถูกส่งถึงเบราว์เซอร์ — พนักงานทั่วไปจึงปลอมไม่ได้
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/** ชื่อ header ต้องตรงกับที่ audit_capture() ในฐานข้อมูลอ่าน (ตัวพิมพ์เล็กทั้งหมด) */
export const ACTOR_HEADER = "x-horset-actor"

/**
 * คืน Service Role Client หรือ null เมื่อยังไม่ได้ตั้งค่า key ฝั่งเซิร์ฟเวอร์
 *
 * ผู้เรียกต้องเตรียมทางถอยไว้เอง (ปกติคือใช้ client ของผู้ใช้ตามปกติ)
 * ที่ไม่ throw เพราะโหมดพัฒนา/พรีวิวบางเครื่องตั้งค่าเป็น placeholder ไว้
 */
export function createActorServiceClient(actorId: string | null | undefined): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key || key.includes("placeholder")) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: actorId ? { [ACTOR_HEADER]: actorId } : {}
    }
  })
}
