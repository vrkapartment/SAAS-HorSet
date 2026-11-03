-- Patch: add_checkout_settlement
-- วันที่: 2026-11-03
--
-- ═══════════════════════════════════════════════════════════════════════
-- รายละเอียดใบสรุปการย้ายออก/คืนเงินประกัน + เวลาที่ส่ง LINE
-- ═══════════════════════════════════════════════════════════════════════
--
-- ใบสรุปการย้ายออก (PDF / การ์ด LINE) ต้องแสดงที่มาของยอดหักทีละรายการ แต่เดิมตารางนี้เก็บแค่ยอดรวม:
--   - รายการหักที่ผู้ดูแลกรอกเอง (เช่น "ค่าล้างแอร์") ถูกรวมเป็น deducted_services_408 ก้อนเดียว ชื่อหาย
--   - จำนวนวันที่อยู่ / นโยบายคิดค่าเช่า / ยกเว้นค่าเช่าหรือไม่ ไม่ได้เก็บ
--
-- settlement (jsonb) = รายละเอียดตอนกดยืนยันคืนเงินประกัน รูปแบบอยู่ใน
--   src/features/tenant/checkout-settlement.ts (parseCheckoutSettlement)
--   ยอดเงินจริงยังเป็นคอลัมน์เดิม (deducted_*, actual_refund, forfeited_amount) — settlement ใช้แจกแจงเท่านั้น
--   ถ้าผลรวมใน settlement ไม่ตรงกับคอลัมน์ (เช่นแก้ประวัติย้อนหลัง) ใบสรุปจะแสดงยอดรวมจากคอลัมน์แทน
--
-- line_sent_at = เวลาที่ส่งใบสรุปทาง LINE ล่าสุด
--
-- เพิ่มคอลัมน์อย่างเดียว ปลอดภัยที่จะรันซ้ำ
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.cancelled_contracts
  add column if not exists settlement jsonb,
  add column if not exists line_sent_at timestamptz;

comment on column public.cancelled_contracts.settlement is
  'รายละเอียดใบสรุปการย้ายออก (ค่าเช่าตามสัดส่วน/ยกเว้น, ค่าน้ำ-ไฟ, รายการหักแต่ละรายการ) — ดู checkout-settlement.ts';
comment on column public.cancelled_contracts.line_sent_at is
  'เวลาที่ส่งใบสรุปการย้ายออกทาง LINE ล่าสุด (null = ยังไม่เคยส่ง)';
