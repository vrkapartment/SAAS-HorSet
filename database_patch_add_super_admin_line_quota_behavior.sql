-- Patch: add_super_admin_line_quota_behavior
-- วันที่: 2026-07-23
--
-- เพิ่มตัวเลือกให้ Super Admin กำหนดพฤติกรรมเมื่อโควต้าข้อความ LINE หมด (คงเหลือ 0):
--   'skip'        (ค่า default) — ข้ามการส่งและปิดการแจ้งเตือนอัตโนมัติ ปลอดภัยจากค่าใช้จ่ายเกินโควต้า
--   'send_anyway' — ยิงส่งต่อไปตามปกติแม้โควต้าฟรีหมดแล้ว (ยอมรับความเสี่ยงค่าใช้จ่ายส่วนเกินถ้าแพ็กเกจคิดเงิน)
-- ใช้คู่กับ sendLineSuperAdminNotificationAction()/getSuperAdminLineQuotaAction() ใน
-- src/features/notification/actions.ts และ src/features/super-admin/actions.ts
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.super_admin_line_settings
  add column if not exists quota_exceeded_behavior text not null default 'skip'
    check (quota_exceeded_behavior in ('skip', 'send_anyway'));
