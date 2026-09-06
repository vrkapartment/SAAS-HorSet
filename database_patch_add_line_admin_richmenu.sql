-- Patch: add_line_admin_richmenu
-- วันที่: 2026-09-06
--
-- เพิ่มคอลัมน์สำหรับ "เมนูแอดมิน" ซึ่งเป็น LINE Rich Menu อีกใบที่ผูกเฉพาะรายบุคคล
--
-- ทำไมต้องมีเมนูใบที่สอง: เมนูผู้เช่าถูกตั้งเป็น default ของทั้ง channel (POST /v2/bot/user/all/richmenu)
-- ทุกคนที่แอด OA ของหอจึงได้เมนูผู้เช่าหมด รวมถึงเจ้าของหอที่แอดมาเพื่อรับแจ้งเตือนสลิป
-- ซึ่งกดปุ่มไหนก็เจอ "ยังไม่พบห้องพักที่ผูกกับบัญชี LINE นี้" เพราะไม่ใช่ผู้เช่า
--
-- LINE มี per-user link (POST /v2/bot/user/{userId}/richmenu/{richMenuId}) ที่ "ทับ" เมนู default
-- ได้เป็นรายคน เราจึงสร้างเมนูอีกใบแล้วผูกให้เฉพาะ UID ที่อยู่ใน admin_line_user_id
--
-- ตัวเมนูแอดมินไม่ให้อัปโหลดภาพเอง (ใช้ภาพต้นแบบของระบบเสมอ) จึงไม่มีคอลัมน์ image_url
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS ทุกคอลัมน์)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- richMenuId ของเมนูแอดมิน — คนละใบกับ richmenu_id (ซึ่งเป็นเมนูผู้เช่า/เมนู default)
alter table public.workspace_line_settings
  add column if not exists richmenu_admin_id text;

-- เวลาที่ติดตั้ง/อัปเดตเมนูแอดมินสำเร็จครั้งล่าสุด
alter table public.workspace_line_settings
  add column if not exists richmenu_admin_installed_at timestamptz;

-- ชื่อผังเมนูแอดมินที่ฝังไปจริง ใช้เทียบกับผังในโค้ดเพื่อเตือนว่าเมนูใน LINE ล้าสมัยแล้ว
alter table public.workspace_line_settings
  add column if not exists richmenu_admin_template_version text;

-- UID ที่ผูกเมนูแอดมินไว้จริงบน LINE (คั่นด้วย comma)
--
-- ต้องจำแยกจาก admin_line_user_id เพราะสองค่านี้หลุดจากกันได้: แอดมินใหม่ที่เพิ่งผูก UID
-- ยังไม่ถูก link เมนู หรือแอดมินที่ถูกลบไปแล้วอาจยัง unlink ไม่สำเร็จ (LINE ล่มชั่วคราว)
-- เอาไว้ให้หน้าตั้งค่าเทียบแล้วบอกได้ว่า "มีแอดมิน 2 คนที่ยังไม่ได้รับเมนู กดซิงก์"
alter table public.workspace_line_settings
  add column if not exists richmenu_admin_linked_uids text;

-- สวิตช์เปิด/ปิดเมนูผู้ดูแล แยกอิสระจาก richmenu_enabled (ซึ่งคุมเมนูผู้เช่า)
--
-- แยกกันเพราะมีเคสใช้จริง: หอที่ไม่อยากให้ผู้เช่ามีเมนูล่าง แต่เจ้าของหอยังอยากกดดูสรุป
-- ในแชทเองได้ — ถ้าใช้สวิตช์ร่วมกันจะทำแบบนั้นไม่ได้เลย
--
-- ปิด = ถอดเมนูออกจากแอดมินทุกคนและลบตัวเมนูทิ้ง (เมนูผู้ดูแลผูกรายบุคคล ไม่มี default
-- ให้ยกเลิกเหมือนเมนูผู้เช่า) เปิดกลับ = สร้างใหม่แล้วผูกให้ใหม่ ซึ่งไม่มีค่าอะไรให้เสีย
-- เพราะเมนูผู้ดูแลใช้ภาพต้นแบบของระบบเสมอ ไม่มีภาพที่หอพักอัปโหลดเองให้ต้องเก็บไว้
alter table public.workspace_line_settings
  add column if not exists richmenu_admin_enabled boolean not null default true;

comment on column public.workspace_line_settings.richmenu_admin_enabled is
  'false = ปิดเมนูผู้ดูแล (ถอดออกจากแอดมินทุกคน) — แยกอิสระจาก richmenu_enabled ที่คุมเมนูผู้เช่า';
comment on column public.workspace_line_settings.richmenu_admin_id is
  'richMenuId ของเมนูแอดมิน ผูกรายบุคคลให้ UID ใน admin_line_user_id (null = ยังไม่ติดตั้ง)';
comment on column public.workspace_line_settings.richmenu_admin_linked_uids is
  'UID ที่ผูกเมนูแอดมินไว้สำเร็จจริงบน LINE คั่นด้วย comma — ใช้เทียบกับ admin_line_user_id เพื่อรู้ว่าต้องซิงก์';
