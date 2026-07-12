-- SQL Patch: เติม mapping ที่ขาดหายไปสำหรับ ภ.ง.ด. 94 ลงในทุก template ที่มีอยู่แล้ว (form_type = '94')
-- แก้ปัญหา 4 จุดที่ Super Admin แจ้ง: Radio Button1 (ยื่นปกติ), Radio Button4 (สถานภาพผู้มีเงินได้),
-- Text5.92 (= Text4.10.1 ค่าลดหย่อนส่วนตัว), Text2.20/Text2.25 (= ยอดภาษีที่ต้องชำระ ข้อ 19)
-- ดู logical key ใหม่เหล่านี้ที่ src/lib/pdfHelper.ts (PND_LOGICAL_KEYS["94"] + DEFAULT_PND94_MAPPING + computePnd94Values)
--
-- Idempotent: รันซ้ำได้ ใช้ ON CONFLICT กับ partial unique index เดิมจาก database_patch_tax_form_field_mappings.sql
-- หมายเหตุ: ใช้ชื่อ field ทางกายภาพเดียวกันกับทุก template ปี 94 ที่มีอยู่ ถ้าไฟล์ปีไหนใช้ field คนละชื่อ
-- ให้ไปแก้เฉพาะจุดผ่านหน้า "จัด mapping field" ของ template นั้น (แผงสรุปจะขึ้นเตือนเป็น "field ที่ไม่มีอยู่ในไฟล์นี้แล้ว")
-- Run this in your Supabase SQL Editor

-- 1. Text fields
INSERT INTO public.tax_form_field_mappings
  (template_id, logical_key, field_kind, physical_field_name, value_format)
SELECT t.id, v.logical_key, 'text', v.physical_field_name, v.value_format
FROM public.tax_form_templates t
CROSS JOIN (VALUES
  ('personal.personal_deduction_recap', 'Text5.92', 'plain_decimal'),
  ('summary.tax_due_recap_1',           'Text2.20', 'plain_decimal'),
  ('summary.tax_due_recap_2',           'Text2.25', 'plain_decimal')
) AS v(logical_key, physical_field_name, value_format)
WHERE t.form_type = '94'
ON CONFLICT (template_id, logical_key) WHERE field_kind = 'text' AND deleted_at IS NULL
DO UPDATE SET
  physical_field_name = EXCLUDED.physical_field_name,
  value_format = EXCLUDED.value_format,
  updated_at = timezone('utc'::text, now());

-- 2. Radio fields
INSERT INTO public.tax_form_field_mappings
  (template_id, logical_key, field_kind, physical_field_name, option_key, widget_index)
SELECT t.id, v.logical_key, 'radio', v.physical_field_name, v.option_key, v.widget_index
FROM public.tax_form_templates t
CROSS JOIN (VALUES
  ('personal.taxpayer_status', 'Radio Button4', 'individual', 0::smallint),
  ('personal.taxpayer_status', 'Radio Button4', 'partnership', 1::smallint),
  ('personal.filing_type',     'Radio Button1', 'normal',      0::smallint)
) AS v(logical_key, physical_field_name, option_key, widget_index)
WHERE t.form_type = '94'
ON CONFLICT (template_id, logical_key, option_key) WHERE field_kind = 'radio' AND deleted_at IS NULL
DO UPDATE SET
  physical_field_name = EXCLUDED.physical_field_name,
  widget_index = EXCLUDED.widget_index,
  updated_at = timezone('utc'::text, now());
