-- Patch: add_meter_records_updated_at
-- วันที่: 2026-08-24
--
-- =========================================================================
-- ทำไมต้องมี patch นี้
-- =========================================================================
-- ตาราง meter_records มีแค่ created_at ไม่มี updated_at ทั้งที่ตารางอื่นในระบบมีครบ
-- และ CLAUDE.md กำหนดว่าทุกตารางต้องมี id / created_at / updated_at
--
-- ผลที่เกิดขึ้นจริง: เลขมิเตอร์เป็นข้อมูลที่ "แก้ทับแถวเดิม" ได้ (saveMeterRecord ใช้ update
-- เมื่อมีแถวของห้อง+รอบนั้นอยู่แล้ว) พอไม่มี updated_at จึงไม่มีทางรู้ว่า
--   · เลขมิเตอร์ถูกแก้ครั้งล่าสุดเมื่อไหร่
--   · ถูกแก้ "หลัง" ออกบิลไปแล้วหรือไม่ — ซึ่งเป็นสาเหตุที่หน่วยในบิลไม่ตรงกับมิเตอร์
--
-- เคยทำให้ไล่ปัญหาผิดทางจริง: ตรวจว่าการบันทึกมิเตอร์รอบหนึ่งลงฐานข้อมูลไปแล้วหรือยัง
-- แต่ดูได้แค่ created_at ที่เป็นเวลาสร้างแถวครั้งแรก จึงแยกไม่ออกระหว่าง
-- "ยังไม่ได้บันทึก" กับ "บันทึกแล้วแต่ค่าเท่าเดิม"
--
-- ⚠️ patch นี้ไม่แตะข้อมูลเดิมและไม่เปลี่ยนพฤติกรรมของโค้ดที่รันอยู่
--    แถวเก่าจะได้ updated_at = created_at (ถือว่ายังไม่เคยถูกแก้หลังสร้าง ซึ่งเป็นข้อสันนิษฐาน
--    ที่ปลอดภัยที่สุด — ดีกว่าใส่ now() ที่จะทำให้ดูเหมือนทุกแถวถูกแก้วันนี้)
--
-- ปลอดภัยที่จะรันซ้ำได้ (if not exists / drop trigger if exists)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. เพิ่มคอลัมน์
-- =========================================================================
alter table public.meter_records
  add column if not exists updated_at timestamptz;

-- แถวเก่า: ตั้งเท่ากับ created_at (ไม่ใช่ now() — ดูเหตุผลด้านบน)
update public.meter_records
set updated_at = created_at
where updated_at is null;

alter table public.meter_records
  alter column updated_at set default now();

comment on column public.meter_records.updated_at is 'เวลาที่แก้เลขมิเตอร์ครั้งล่าสุด — ใช้ตรวจว่ามิเตอร์ถูกแก้หลังออกบิลไปแล้วหรือไม่';

-- =========================================================================
-- 2. trigger ให้อัปเดตอัตโนมัติ (ใช้ handle_updated_at() ที่มีอยู่แล้วในสคีมาหลัก)
-- =========================================================================
-- ต้องเป็น trigger ไม่ใช่ให้โค้ดส่งค่ามาเอง เพราะ saveMeterRecord เขียนหลายเส้นทาง
-- (update รายห้อง / upsert แบบกลุ่มใน saveAllBillsForCycle / สคริปต์ย้ายห้อง)
-- ถ้าพึ่งโค้ด จะมีเส้นทางที่ลืมส่งแล้วค่าเพี้ยนแบบเงียบ ๆ
drop trigger if exists set_meter_records_updated_at on public.meter_records;
create trigger set_meter_records_updated_at
  before update on public.meter_records
  for each row execute function public.handle_updated_at();

-- =========================================================================
-- 3. ตรวจผลหลังรัน
-- =========================================================================
-- คอลัมน์ต้องมี:
--   select column_name, is_nullable, column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'meter_records' and column_name = 'updated_at';
--
-- trigger ต้องมี:
--   select tgname from pg_trigger where tgname = 'set_meter_records_updated_at';
--
-- แถวเก่าต้องมี updated_at = created_at (ควรได้ 0 แถวที่ยังว่าง):
--   select count(*) from public.meter_records where updated_at is null;
--
-- ทดสอบว่า trigger ทำงาน: แก้เลขมิเตอร์ห้องใดห้องหนึ่งจากหน้าจดมิเตอร์
-- แล้ว updated_at ของแถวนั้นต้องขยับเป็นเวลาปัจจุบัน ส่วน created_at ต้องไม่เปลี่ยน
