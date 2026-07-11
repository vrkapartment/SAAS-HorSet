-- SQL Patch: ตาราง tax_form_templates + storage bucket 'tax-templates'
-- ให้ Super Admin อัปโหลด/อัปเดตไฟล์ PDF template ของแบบฟอร์ม ภ.ง.ด. 90 และ ภ.ง.ด. 94
-- Run this in your Supabase SQL Editor

-- 1. ตารางเก็บ reference ไฟล์ template (global, ไม่ผูก workspace_id)
CREATE TABLE IF NOT EXISTS public.tax_form_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  form_type text NOT NULL CHECK (form_type IN ('90', '94')),
  tax_year text,                 -- NULL สำหรับ '90' (template เดียวใช้ข้ามทุกปี), บังคับมีค่าสำหรับ '94'
  file_url text NOT NULL,
  file_name text,
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- กันอัปโหลดซ้ำต่อปีภาษีสำหรับ ภ.ง.ด. 94 (ปีภาษีถูกพิมพ์ตายตัวในฟอร์ม ต้องมีแค่ 1 template ต่อปี)
CREATE UNIQUE INDEX IF NOT EXISTS tax_form_templates_94_year_uidx
  ON public.tax_form_templates (tax_year)
  WHERE form_type = '94';

ALTER TABLE public.tax_form_templates ENABLE ROW LEVEL SECURITY;

-- Super admin เท่านั้นที่ insert/update/delete ได้
DROP POLICY IF EXISTS "Super admins can manage tax form templates" ON public.tax_form_templates;
CREATE POLICY "Super admins can manage tax form templates" ON public.tax_form_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- Admin/Staff ทุก workspace อ่านได้ (จำเป็นตอนกด Download PDF)
DROP POLICY IF EXISTS "Authenticated users can read tax form templates" ON public.tax_form_templates;
CREATE POLICY "Authenticated users can read tax form templates" ON public.tax_form_templates
  FOR SELECT TO authenticated USING (true);

-- Trigger อัปเดต updated_at อัตโนมัติ (reuse ฟังก์ชันเดิมถ้ามีอยู่แล้วจาก patch อื่น)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tax_form_templates_updated_at ON public.tax_form_templates;
CREATE TRIGGER set_tax_form_templates_updated_at
BEFORE UPDATE ON public.tax_form_templates
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 2. Storage bucket ใหม่สำหรับไฟล์ template (แยกจาก payment-slips เพราะไฟล์ใหญ่กว่า 1MB และต้องจำกัดสิทธิ์เขียนเฉพาะ super_admin)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tax-templates', 'tax-templates', true, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- อ่านได้ทุกคน (ไฟล์ต้อง fetch ได้ตอน generate PDF ฝั่ง client ของ Admin/Staff)
DROP POLICY IF EXISTS "Public read tax templates" ON storage.objects;
CREATE POLICY "Public read tax templates"
ON storage.objects FOR SELECT
USING (bucket_id = 'tax-templates');

-- เขียน/แก้ไข/ลบ ได้เฉพาะ super_admin เท่านั้น
DROP POLICY IF EXISTS "Super admins manage tax templates storage" ON storage.objects;
CREATE POLICY "Super admins manage tax templates storage"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'tax-templates'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
)
WITH CHECK (
  bucket_id = 'tax-templates'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
);