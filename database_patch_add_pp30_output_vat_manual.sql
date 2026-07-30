-- Patch: add_pp30_output_vat_manual
-- วันที่: 2026-07-30
--
-- เพิ่มคอลัมน์ public.pp30_filings.output_vat_manual — ให้ผู้ใช้กรอกยอด "ภาษีขาย" ของเดือนนั้นเอง
-- แทนยอดที่คำนวณอัตโนมัติจากบิลได้ (mirror ของ input_vat_manual ที่มีอยู่แล้วสำหรับภาษีซื้อ)
-- null (ค่าเริ่มต้น) = ใช้ยอดที่คำนวณจากบิลจริงตามปกติ ดู buildPP30Series() ใน src/lib/tax/pp30.ts
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.pp30_filings
  add column if not exists output_vat_manual numeric(14, 2);
