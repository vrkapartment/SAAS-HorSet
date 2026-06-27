-- SQL Patch to enable public upload and select policies for 'payment-slips' storage bucket.
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new)

-- 1. สร้าง Bucket 'payment-slips' หากยังไม่มีในระบบ (โดยตั้งค่าให้เป็น Public และจำกัดขนาดไฟล์ไม่เกิน 1MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-slips', 
  'payment-slips', 
  true, 
  1048576, -- 1MB (1024 * 1024 bytes)
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE 
SET 
  public = true, 
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- 2. ลบนโยบายความปลอดภัย (Policy) เดิมของ 'payment-slips' เพื่อป้องกันการชนกัน
DROP POLICY IF EXISTS "Allow public select for payment-slips" ON storage.objects;
DROP POLICY IF EXISTS "Allow public insert for payment-slips" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update for payment-slips" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete for payment-slips" ON storage.objects;

-- 3. นโยบายที่ 1: อนุญาตให้ "ทุกคน" (รวมถึงผู้ใช้นอกระบบ / anon) สามารถเข้าถึงและอ่านไฟล์รูปภาพได้
CREATE POLICY "Allow public select for payment-slips"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'payment-slips');

-- 4. นโยบายที่ 2: อนุญาตให้ "ทุกคน" สามารถอัปโหลดไฟล์สลิปใหม่เข้ามาเก็บในระบบได้ (สำคัญมากเพื่อให้หน้า Portal แนบสลิปผ่าน)
CREATE POLICY "Allow public insert for payment-slips"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'payment-slips');

-- 5. นโยบายที่ 3: อนุญาตให้ "ทุกคน" สามารถอัปเดตไฟล์สลิปใน Bucket นี้ได้ (สำหรับการบันทึกทับหรือแก้ไขสลิป)
CREATE POLICY "Allow public update for payment-slips"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'payment-slips');

-- 6. นโยบายที่ 4: อนุญาตให้ "ทุกคน" (หรือ Server) ลบสลิปเก่าออกได้ (จำเป็นมากสำหรับการทำความสะอาดลบสลิปที่หมดอายุโดยระบบหลังบ้าน)
CREATE POLICY "Allow public delete for payment-slips"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'payment-slips');
