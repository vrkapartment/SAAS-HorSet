-- SQL Patch: เพิ่มสถานภาพผู้เสียภาษี + แยกที่อยู่ตามช่องย่อยของแบบฟอร์ม ภ.ง.ด. 90/94
-- (อาคาร/ห้องเลขที่/ชั้นที่/หมู่บ้าน/หมู่ที่/ตรอกซอย/แยก — เดิมระบบมีแค่ เลขที่/ถนน/ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์
--  ทำให้ต้องยัดข้อมูลอาคาร/หมู่บ้าน/ซอยไว้ในช่อง "เลขที่" ช่องเดียว พอไปกรอกแบบฟอร์มจริงเลยล้นเข้าไปช่องเดียวหมด)
-- Run this in your Supabase SQL Editor

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS taxpayer_status text CHECK (taxpayer_status IN ('individual', 'partnership')) DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS partner_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tax_address_building text,
  ADD COLUMN IF NOT EXISTS tax_address_room text,
  ADD COLUMN IF NOT EXISTS tax_address_floor text,
  ADD COLUMN IF NOT EXISTS tax_address_village text,
  ADD COLUMN IF NOT EXISTS tax_address_moo text,
  ADD COLUMN IF NOT EXISTS tax_address_soi text,
  ADD COLUMN IF NOT EXISTS tax_address_yaek text;
