-- Patch: add_saas_payments_archived_drive_url
-- วันที่: 2026-07-21
--
-- เพิ่มคอลัมน์ใหม่ใน public.saas_payments เพื่อเก็บลิงก์ไฟล์สลิปที่ archive ขึ้น Google Drive
-- ก่อนลบไฟล์จริงออกจาก Supabase Storage bucket 'payment-slips' (cron cleanup-slips)
-- ใช้ IF NOT EXISTS จึงปลอดภัยที่จะรันซ้ำได้ (idempotent)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.saas_payments
  add column if not exists archived_drive_url text null;
