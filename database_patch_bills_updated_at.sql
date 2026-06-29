-- SQL Patch to add updated_at column to public.bills table
-- Copy and paste this script into your Supabase SQL Editor and run it to enable Real-Time notification timestamps for uploaded slips.

-- 1. เพิ่มคอลัมน์ updated_at เข้ามาในตาราง bills โดยให้มีค่าเริ่มต้นเป็นเวลาปัจจุบัน (now)
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. ตั้งค่าคอมเมนต์คำอธิบายให้คอลัมน์ใหม่
COMMENT ON COLUMN public.bills.updated_at IS 'บันทึกเวลาที่อัปเดตสลิปหรือสถานะล่าสุด เพื่อแสดงผลแจ้งเตือนแบบ Real-Time';
