-- Patch: add_super_admin_line_connection
-- วันที่: 2026-07-23
--
-- ทำให้ Super Admin เชื่อมต่อ LINE User ID ของตัวเองได้ง่ายแบบเดียวกับ workspace admin (พิมพ์รหัส 6 หลัก
-- ในแชท LINE OA แล้วระบบผูกบัญชีให้อัตโนมัติ) แทนการต้องไปคัดลอก LINE User ID มาวางเองแบบ manual
--
-- 1. เพิ่ม channel_secret ให้ super_admin_line_settings (คอลัมน์เดิมยังไม่มี ต่างจาก workspace_line_settings
--    ที่มีอยู่แล้ว) — ใช้ตรวจสอบ signature ของ webhook LINE ของ Super Admin เอง
-- 2. สร้างตาราง super_admin_connection_codes มิเรอร์ public.admin_connection_codes แต่ตัด workspace_id
--    ออกไปเลย (คนละแนวคิดกับของ workspace ที่ผูกกับ workspace_id เสมอ) — single-scope สำหรับ Super Admin
--    เท่านั้น ใช้คู่กับ generateSuperAdminConnectionCodeAction() ใน src/features/super-admin/actions.ts
--    และ scope=super_admin ใน src/app/api/webhook/line/route.ts
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.super_admin_line_settings
  add column if not exists channel_secret text;

create table if not exists public.super_admin_connection_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  is_used boolean not null default false
);

create index if not exists idx_super_admin_connection_codes_code_unused
  on public.super_admin_connection_codes (code) where is_used = false;

alter table public.super_admin_connection_codes enable row level security;

drop policy if exists "Super Admins can manage their own connection codes" on public.super_admin_connection_codes;
create policy "Super Admins can manage their own connection codes"
  on public.super_admin_connection_codes for all
  using (public.get_current_user_role() = 'super_admin');
