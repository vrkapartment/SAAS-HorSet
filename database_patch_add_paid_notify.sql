-- Patch: add_paid_notify
-- วันที่: 2026-09-06
--
-- แจ้งเตือนผู้เช่าทาง LINE เมื่อบิลถูกปิดเป็น "ชำระเงินแล้ว"
--
-- เดิมไม่ว่า SlipOK จะตรวจสลิปผ่านเอง หรือแอดมินกดยืนยันการชำระเงินเอง ระบบแจ้งแต่แอดมิน
-- ผู้เช่าไม่เคยรู้เลยว่าจ่ายสำเร็จแล้ว ต้องเข้ามาเช็คในพอร์ทัลเอง
--
-- ข้อความปรับเองได้ต่อหอ โดยใช้ตัวแปรในรูปแบบ {{TENANT_NAME}} ฯลฯ (ดู paid-message.ts
-- ซึ่งเป็นที่เดียวที่นิยามว่ามีตัวแปรอะไรบ้าง) ว่าง = ใช้ข้อความต้นแบบของระบบ
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS ทุกคอลัมน์)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- สวิตช์เปิด/ปิดต่อหอ — หอที่ไม่อยากรบกวนผู้เช่าปิดได้
alter table public.workspace_line_settings
  add column if not exists paid_notify_enabled boolean not null default true;

-- ข้อความที่เจ้าหอปรับเอง (ว่าง/null = ใช้ข้อความต้นแบบใน paid-message.ts)
alter table public.workspace_line_settings
  add column if not exists paid_notify_template text;

comment on column public.workspace_line_settings.paid_notify_enabled is
  'false = ไม่ส่งแจ้งเตือนผู้เช่าเมื่อบิลถูกปิดเป็นชำระแล้ว';
comment on column public.workspace_line_settings.paid_notify_template is
  'ข้อความแจ้งผู้เช่าตอนชำระเงินสำเร็จ ใช้ตัวแปร {{TENANT_NAME}} {{WORKSPACE_NAME}} {{ROOM_NUMBER}} {{BILLING_CYCLE}} {{AMOUNT}} {{PAID_AT}} — ว่างหมายถึงใช้ข้อความต้นแบบของระบบ';
