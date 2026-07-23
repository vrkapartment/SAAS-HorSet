-- Patch: add_saas_payments_manual_review
-- วันที่: 2026-07-23
--
-- เพิ่มคอลัมน์สำหรับให้ Super Admin ตรวจสอบสลิปจ่ายเงิน subscription ด้วยตนเอง (manual review) เมื่อ SlipOK
-- ตรวจสอบผิดพลาดหรือค้างสถานะ "รอตรวจสอบ" — ใช้คู่กับ manuallyReviewSaasPaymentAction() ใน
-- src/features/subscription/actions.ts
--
-- manual_review_note = หมายเหตุที่ Super Admin กรอกตอนอนุมัติ/ปฏิเสธ (ถ้ามี)
-- reviewed_by/reviewed_at = ใครและเมื่อไหร่ที่ตรวจสอบด้วยตนเอง (audit trail สำหรับรายการเกี่ยวกับเงิน)
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.saas_payments
  add column if not exists manual_review_note text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;
