-- SQL Patch: ตาราง tax_form_field_mappings + คอลัมน์ is_bundled_default บน tax_form_templates
-- เก็บการ map "ชื่อ field ทางกายภาพในไฟล์ PDF" <-> "ความหมายเชิงตรรกะ" แยกต่อ template
-- เพื่อให้ Super Admin แก้ mapping ได้เองผ่านหน้าเว็บเวลาอัปโหลด template ใหม่ ไม่ต้องแก้โค้ด
-- Run this in your Supabase SQL Editor

-- 1. เพิ่มคอลัมน์ทำเครื่องหมายไฟล์ default ที่ bundle มากับระบบ (ให้มี template_id เดียวกันหมดทุกไฟล์ ไม่ต้อง special-case)
ALTER TABLE public.tax_form_templates
  ADD COLUMN IF NOT EXISTS is_bundled_default boolean NOT NULL DEFAULT false;

-- 2. ตาราง mapping
CREATE TABLE IF NOT EXISTS public.tax_form_field_mappings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.tax_form_templates(id) ON DELETE CASCADE,
  logical_key text NOT NULL,              -- เช่น 'item.14', 'address.road', 'rent.gross'
  field_kind text NOT NULL CHECK (field_kind IN ('text', 'radio')),
  physical_field_name text NOT NULL,      -- ชื่อ AcroForm field/radio group จริงในไฟล์ เช่น 'Text87.15'
  option_key text,                        -- เฉพาะ radio: ตัวเลือกเชิงความหมาย เช่น 'percentage'/'actual', 'due'/'overpaid'
  widget_index smallint,                  -- เฉพาะ radio: widget index (0/1/2..) ของตัวเลือกนั้นในไฟล์นี้
  value_format text CHECK (value_format IN ('raw', 'comb', 'plain_decimal')), -- เฉพาะ text field
  updated_by uuid REFERENCES public.profiles(id),
  deleted_at timestamp with time zone,    -- soft delete ตามธรรมเนียมโปรเจค
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT chk_text_fields CHECK (
    field_kind <> 'text' OR (option_key IS NULL AND widget_index IS NULL AND value_format IS NOT NULL)
  ),
  CONSTRAINT chk_radio_fields CHECK (
    field_kind <> 'radio' OR (option_key IS NOT NULL AND widget_index IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tax_form_field_mappings_text_uidx
  ON public.tax_form_field_mappings (template_id, logical_key)
  WHERE field_kind = 'text' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tax_form_field_mappings_radio_uidx
  ON public.tax_form_field_mappings (template_id, logical_key, option_key)
  WHERE field_kind = 'radio' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tax_form_field_mappings_template_idx
  ON public.tax_form_field_mappings (template_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.tax_form_field_mappings ENABLE ROW LEVEL SECURITY;

-- Super admin เท่านั้นที่ insert/update/delete ได้ (เหมือน tax_form_templates เป๊ะ)
DROP POLICY IF EXISTS "Super admins can manage tax form field mappings" ON public.tax_form_field_mappings;
CREATE POLICY "Super admins can manage tax form field mappings" ON public.tax_form_field_mappings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- Admin/Staff ทุก workspace อ่านได้ (จำเป็นตอนกด Download PDF จริง)
DROP POLICY IF EXISTS "Authenticated users can read tax form field mappings" ON public.tax_form_field_mappings;
CREATE POLICY "Authenticated users can read tax form field mappings" ON public.tax_form_field_mappings
  FOR SELECT TO authenticated USING (true);

-- Trigger อัปเดต updated_at อัตโนมัติ (reuse ฟังก์ชันเดิมจาก database_patch_tax_form_templates.sql)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tax_form_field_mappings_updated_at ON public.tax_form_field_mappings;
CREATE TRIGGER set_tax_form_field_mappings_updated_at
BEFORE UPDATE ON public.tax_form_field_mappings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
