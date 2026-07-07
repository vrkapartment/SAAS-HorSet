-- SQL Patch: Add logo_url column to workspaces and configure storage policies for property logos
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new)

-- 1. เพิ่มคอลัมน์ logo_url ในตาราง workspaces
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. สร้างนโยบายการจัดการรูป Logo ประจำหอพักใน Bucket 'payment-slips' สำหรับโฟลเดอร์ 'logos/'
-- ลบนโยบายเดิมหากมีอยู่ เพื่อสร้างใหม่ให้สมบูรณ์และปลอดภัย
DROP POLICY IF EXISTS "Allow authenticated manage for logos" ON storage.objects;

-- อนุญาตให้ผู้ที่ล็อกอินแล้ว (authenticated) สามารถจัดการไฟล์ในโฟลเดอร์ logos/ ได้ทั้งหมด (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Allow authenticated manage for logos"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'payment-slips'
  AND (storage.foldername(name))[1] = 'logos'
)
WITH CHECK (
  bucket_id = 'payment-slips'
  AND (storage.foldername(name))[1] = 'logos'
);
