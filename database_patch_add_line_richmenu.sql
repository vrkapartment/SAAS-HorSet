-- Patch: add_line_richmenu
-- วันที่: 2026-09-05
--
-- เพิ่มคอลัมน์สำหรับจัดการ LINE Rich Menu ของแต่ละหอพักในตาราง public.workspace_line_settings
--
-- ทำไมต้องเก็บ state ไว้: LINE ไม่มี API แก้ rich menu ที่สร้างไว้แล้ว มีแค่ "สร้างใหม่" กับ "ลบ"
-- ดังนั้นทุกครั้งที่เจ้าหอเปลี่ยนเบอร์ติดต่อหรือเปลี่ยนภาพ ระบบต้องสร้างเมนูใบใหม่แล้วสลับให้
-- ผู้ติดตามทุกคน จึงต้องจำไว้ว่า
--   1. เมนูใบไหนกำลังใช้อยู่ (เพื่อลบใบเก่าทิ้ง ไม่ให้บวมชน limit 1,000 เมนูต่อ channel)
--   2. ค่าอะไรถูก "ฝัง" ลงเมนูไปแล้ว (เพื่อเทียบกับค่าปัจจุบันแล้วเตือนว่าเมนูใน LINE ล้าสมัย)
--
-- ภาพเมนูเก็บใน bucket payment-slips ที่เปิด public อยู่แล้ว (prefix line-richmenu/) แบบเดียวกับ
-- โลโก้หอพัก จึงไม่ต้องสร้าง bucket หรือ policy ใหม่
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS ทุกคอลัมน์)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- richMenuId ที่ LINE คืนมาตอนสร้าง — ใช้ระบุว่าใบไหนต้องลบตอนติดตั้งใหม่
alter table public.workspace_line_settings
  add column if not exists richmenu_id text;

-- URL ภาพเมนูที่เจ้าหออัปโหลดเอง (ว่าง = ใช้ภาพต้นแบบที่แถมมากับระบบ)
alter table public.workspace_line_settings
  add column if not exists richmenu_image_url text;

-- เวลาที่ติดตั้ง/อัปเดตเมนูสำเร็จครั้งล่าสุด — แสดงในหน้าตั้งค่าให้เจ้าหอรู้ว่าแก้ไขล่าสุดตอนไหน
alter table public.workspace_line_settings
  add column if not exists richmenu_installed_at timestamptz;

-- ปุ่ม "ติดต่อหอพัก" ที่ฝังลงเมนูไปจริง (tel:...) เอามาเทียบกับ workspaces.tax_phone ปัจจุบัน
alter table public.workspace_line_settings
  add column if not exists richmenu_contact_uri text;

-- LIFF ID ที่ฝังลงลิงก์ในเมนูไปจริง เอามาเทียบกับ liff_id ปัจจุบัน
alter table public.workspace_line_settings
  add column if not exists richmenu_liff_id text;

-- สวิตช์เปิด/ปิดของหอพักที่ไม่ต้องการใช้เมนูล่าง
--
-- ปิด = ยกเลิกเมนูเริ่มต้นของ channel (ผู้เช่าไม่เห็นปุ่ม) แต่ "ไม่ลบ" ตัวเมนูบน LINE
-- และไม่ลบภาพที่อัปโหลดไว้ จึงกดเปิดกลับได้ทันทีโดยไม่ต้องอัปโหลดภาพใหม่
-- (คนละอย่างกับปุ่ม "ลบเมนูออกจาก LINE ถาวร" ซึ่งลบตัวเมนูทิ้งจริง ๆ)
alter table public.workspace_line_settings
  add column if not exists richmenu_enabled boolean not null default true;

comment on column public.workspace_line_settings.richmenu_id is
  'richMenuId ของ LINE ที่กำลังตั้งเป็นเมนูเริ่มต้นของ channel นี้ (null = ยังไม่ติดตั้ง)';
comment on column public.workspace_line_settings.richmenu_image_url is
  'ภาพเมนูที่เจ้าหออัปโหลดเอง — ว่างหมายถึงใช้ภาพต้นแบบของระบบ (public/line-richmenu/)';
comment on column public.workspace_line_settings.richmenu_contact_uri is
  'ค่าปุ่มติดต่อที่ฝังลงเมนูไปแล้ว ใช้ตรวจว่าเมนูใน LINE ล้าสมัยกว่าข้อมูลในระบบหรือยัง';
comment on column public.workspace_line_settings.richmenu_enabled is
  'false = หอพักปิดการใช้งานเมนูล่าง (ยกเลิก default menu ของ channel แต่ไม่ลบเมนูและภาพทิ้ง)';
