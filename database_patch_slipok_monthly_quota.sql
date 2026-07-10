-- Patch: SlipOK Monthly Package Quota
-- ใช้เก็บ "เพดานแพ็กเกจ/เดือน" ที่แอดมินกรอกเอง (SlipOK API ไม่ได้ส่งค่าเพดานทั้งหมดมาให้)
-- เพื่อให้ระบบคำนวณ % โควต้าที่ใช้ไปแล้วมาแสดงเป็นแถบพลังในหน้าเชื่อมต่อ SlipOK ได้

alter table public.workspace_slipok_settings
  add column if not exists monthly_package_quota numeric not null default 0;
