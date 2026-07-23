-- Patch: add_super_admin_line_settings
-- วันที่: 2026-07-23
--
-- เพิ่มตาราง public.super_admin_line_settings เพื่อให้ Super Admin ของ HorSet เอง (ไม่ใช่เจ้าของหอ)
-- ตั้งค่า LINE OA ของทีมงาน HorSet สำหรับรับการแจ้งเตือนระดับระบบ เช่น มีหอพักสมัครใหม่, subscription
-- ของหอพักไหนถูกล็อกสิทธิ์, หรือสลิปจ่ายเงิน subscription ตรวจสอบไม่ผ่านครบจำนวนครั้ง retry แล้ว
--
-- คนละตารางกับ public.workspace_line_settings (ของแต่ละหอพักเอง) โดยเจตนา — เป็น single-row config
-- ไม่ผูก workspace_id ใดๆ มิเรอร์ pattern เดียวกับ public.line_quota_cache
--
-- ปลอดภัยที่จะรันซ้ำได้ (CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS ก่อน CREATE POLICY)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

create table if not exists public.super_admin_line_settings (
  id integer primary key default 1 check (id = 1),
  channel_access_token text,
  admin_line_user_id text,
  admin_line_group_id text,
  notification_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.super_admin_line_settings enable row level security;

drop policy if exists "Super Admins can manage super admin line settings" on public.super_admin_line_settings;
create policy "Super Admins can manage super admin line settings"
  on public.super_admin_line_settings for all
  using (public.get_current_user_role() = 'super_admin');
