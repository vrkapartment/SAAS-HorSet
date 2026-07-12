-- SQL Patch: เพิ่มคอลัมน์ deposit_type ที่หายไปจากตาราง workspaces
--
-- สาเหตุที่แท้จริงของปัญหา "บันทึกที่อยู่/สถานภาพผู้เสียภาษีไม่เข้า Supabase": ฟังก์ชัน
-- saveFinanceSettings() ในโค้ดอ้างอิงคอลัมน์ deposit_type มาตั้งแต่แรก (เก็บว่าเงินประกันตั้งเป็น
-- "months" หรือ "fixed") แต่คอลัมน์นี้ไม่เคยถูกสร้างจริงในฐานข้อมูลนี้เลย (ไม่มีไฟล์ SQL patch ไหน
-- เคยเพิ่มคอลัมน์นี้มาก่อน) ทำให้การ UPDATE ที่รวมทุกฟิลด์ในคำสั่งเดียว (รวมที่อยู่แยกช่อง/สถานภาพ
-- ผู้เสียภาษีที่เพิ่งเพิ่มใหม่) พัง 100% ของทุกครั้งที่กดบันทึก แล้วร่วงไปใช้ query สำรอง (fallback)
-- ที่ตั้งใจเขียนไว้ให้ไม่รวมคอลัมน์นี้อยู่แล้ว (เผื่อกรณีคอลัมน์ยังไม่มี) — fallback นั้นไม่มีคอลัมน์ใหม่ๆ
-- (ที่อยู่แยกช่อง, สถานภาพผู้เสียภาษี) อยู่ด้วย จึงดูเหมือนบันทึกสำเร็จ แต่ข้อมูลใหม่ไม่ถูกเขียนจริง
-- Run this in your Supabase SQL Editor

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS deposit_type text CHECK (deposit_type IN ('months', 'fixed')) DEFAULT 'months';

-- รีเฟรช schema cache ของ PostgREST ให้รู้จักคอลัมน์ใหม่ทันที (เผื่อ auto-refresh ช้า)
NOTIFY pgrst, 'reload schema';
