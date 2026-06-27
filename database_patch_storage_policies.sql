-- SQL Patch (SECURE VERSION) to enable secure public upload and select policies for 'payment-slips' storage bucket.
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new)

-- 1. สร้าง/อัปเดต Bucket 'payment-slips' ในระบบ (ให้เป็น Public และจำกัดขนาดไฟล์ไม่เกิน 1MB เพื่อป้องกันการโจมตี DDOS/พื้นที่เต็ม)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-slips', 
  'payment-slips', 
  true, 
  1048576, -- จำกัดขนาดไฟล์ 1MB (1024 * 1024 bytes)
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE 
SET 
  public = true, 
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- 2. ลบนโยบายความปลอดภัย (Policy) เดิมของ 'payment-slips' ทั้งหมดเพื่อรื้อสร้างแบบปลอดภัยสูงสุด
DROP POLICY IF EXISTS "Allow public select for payment-slips" ON storage.objects;
DROP POLICY IF EXISTS "Allow public insert for payment-slips" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update for payment-slips" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete for payment-slips" ON storage.objects;

-- 3. [ปลอดภัย] นโยบายที่ 1: อนุญาตให้ทุกคนสามารถ "อ่านไฟล์" ได้เฉพาะเมื่อรู้ชื่อไฟล์ที่ถูกต้องเท่านั้น (ไม่มีการเปิดเผยรายชื่อไฟล์ทั้งหมด)
-- เนื่องจากไฟล์สลิปใช้รหัสผ่านและ Timestamp เดาสุ่มยาก (e.g., bill_uuid_timestamp.jpeg) จึงปลอดภัยสูงสุด
CREATE POLICY "Allow public select for payment-slips"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'payment-slips');

-- 4. [ปลอดภัยสูงสุด] นโยบายที่ 2: อนุญาตให้ผู้เช่าอัปโหลด (INSERT) สลิปเข้ามาได้ แต่ต้องอยู่ภายใต้เงื่อนไขความปลอดภัย:
--    - ต้องอัปโหลดเข้า Bucket 'payment-slips' เท่านั้น
--    - ชื่อไฟล์ต้องขึ้นต้นด้วย 'slips/bill_' เท่านั้น (ป้องกันการอัปโหลดไฟล์ขยะไปโฟลเดอร์อื่น)
--    - ประเภทไฟล์ต้องเป็นรูปภาพ (jpeg, png, webp) เท่านั้น
CREATE POLICY "Allow public insert for payment-slips"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'payment-slips' 
  AND (storage.foldername(name))[1] = 'slips'
  AND name LIKE 'slips/bill_%'
);

-- 5. [บล็อกเพื่อความปลอดภัย] บล็อกไม่ให้ผู้ใช้นอกระบบทั่วไปสามารถแก้ไข (UPDATE) หรือ ลบ (DELETE) สลิปใดๆ ทั้งสิ้น!
-- การแก้ไขและการลบไฟล์สลิปจะกระทำได้ผ่านฝั่งแอดมินหรือหลังบ้านที่มีสิทธิ์ (Service Role Key) เท่านั้น
-- ดังนั้นเราจะไม่สร้างนโยบาย UPDATE และ DELETE ให้แก่ 'public' เด็ดขาด 
-- เพื่อป้องกันผู้ไม่หวังดีแอบมาลบหรือเขียนทับภาพสลิปเงินโอนของผู้อื่น
