-- Patch: add_workspace_google_drive_settings
-- วันที่: 2026-07-23
--
-- เพิ่มตาราง public.workspace_google_drive_settings เพื่อให้แต่ละ workspace (หอพัก) เชื่อมต่อ
-- Google Drive ของตัวเองได้ สำหรับ archive สลิปค่าเช่า (bills.slip_url) ก่อนลบออกจาก storage
-- คนละเรื่องกับ system_settings.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN ซึ่งเป็นบัญชี Drive กลางของ HorSet
-- เอง (ใช้ archive สลิป subscription เท่านั้น) — ทุก workspace ใช้ OAuth Client ID/Secret ตัวเดียวกัน
-- ของ HorSet (system_settings.GOOGLE_DRIVE_OAUTH_CLIENT_ID/SECRET) แค่คนละ refresh_token/โฟลเดอร์
--
-- โครงสร้างมิเรอร์จาก public.workspace_line_settings ที่มีอยู่แล้ว (workspace_id เป็น primary key)
--
-- ปลอดภัยที่จะรันซ้ำได้ (CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS ก่อน CREATE POLICY)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

create table if not exists public.workspace_google_drive_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  refresh_token text,        -- เข้ารหัสด้วย encryptText (src/lib/encryption.ts) ก่อนเก็บเสมอ
  folder_id text,            -- โฟลเดอร์หลักที่แอปสร้างให้อัตโนมัติตอนอัปโหลดครั้งแรก
  folder_name text,          -- ชื่อโฟลเดอร์ที่ workspace กำหนดเอง (ถ้าไม่ตั้งใช้ค่า default ของระบบ)
  updated_at timestamptz not null default now()
);

alter table public.workspace_google_drive_settings enable row level security;

drop policy if exists "Users can manage their own workspace google drive settings" on public.workspace_google_drive_settings;
create policy "Users can manage their own workspace google drive settings"
  on public.workspace_google_drive_settings for all
  using (
    workspace_id = public.get_current_user_workspace_id()
    or public.get_current_user_role() = 'super_admin'
  );
