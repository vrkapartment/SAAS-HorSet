-- Patch: add_room_id_to_meters_bills
-- วันที่: 2026-08-21
--
-- ขั้นที่ 1 ของการรองรับ "เลขห้องซ้ำข้ามตึก"
--
-- ปัญหา: ทั้งระบบใช้ room_number เป็นตัวระบุห้อง ทั้งใน DB และฝั่งแอป
--   meter_records unique (workspace_id, room_number, billing_cycle)
--   bills         unique (workspace_id, invoice_id) โดย invoice_id = INV-{cycle}-{room_number}
-- ถ้าหอมี 2 ตึกและใช้เลข 101 ทั้งสองตึก สองห้องนั้นจะแชร์แถวเดียวกัน เขียนทับกันไปมา
--
-- ตัวระบุที่ถูกต้องคือ rooms.id ไม่ใช่ room_number — patch นี้จึงเพิ่ม room_id ลงทั้งสองตาราง
-- แล้ว backfill จากคู่ (workspace_id, room_number) ที่ยังไม่กำกวมในตอนนี้
--
-- ⚠️ ขั้นนี้ "ไม่เปลี่ยนพฤติกรรมใด ๆ" โดยเจตนา:
--   - ยังไม่แตะ unique constraint เดิม (ยังห้ามเลขห้องซ้ำอยู่เหมือนเดิม)
--   - แอปยังอ่าน/จับคู่ด้วย room_number ต่อไป
--   - เพิ่มแค่คอลัมน์ + ดัชนี เพื่อให้ขั้นถัดไปเปลี่ยนมาใช้ room_id ได้โดยไม่ต้อง migrate ข้อมูลอีก
-- ต้องรัน patch นี้ "ก่อน" ที่ข้อมูลจะมีเลขห้องซ้ำ ไม่เช่นนั้น backfill จะจับคู่ผิด
--
-- room_number ยังต้องอยู่ต่อไปในฐานะ snapshot ของประวัติ (เหมือน bills.tenant_name)
-- เพราะบิลเก่าต้องแสดงเลขห้อง ณ ตอนออกบิลได้ แม้ห้องจะถูกเปลี่ยนเลขหรือลบไปแล้ว
--
-- ตรวจก่อนรัน (ต้องได้ 0 แถว ถ้าไม่ใช่ 0 ให้แก้เลขห้องซ้ำก่อน แล้วค่อยรัน):
--   select workspace_id, room_number, count(*)
--   from public.rooms group by workspace_id, room_number having count(*) > 1;
--
-- ปลอดภัยที่จะรันซ้ำได้ (IF NOT EXISTS)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. เพิ่มคอลัมน์ room_id
-- =========================================================================
-- on delete set null (ไม่ใช่ cascade) เพราะการลบห้องต้องไม่ลบประวัติมิเตอร์/บิลทิ้ง
-- ตรงตามนโยบายห้าม hard delete ข้อมูลจริงของโปรเจค — room_number ที่เก็บไว้ยังบอกได้ว่าเป็นห้องไหน
alter table public.meter_records
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

alter table public.bills
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

-- =========================================================================
-- 2. Backfill จากคู่ (workspace_id, room_number)
-- =========================================================================
-- ปลอดภัยเฉพาะตอนที่ยังไม่มีเลขห้องซ้ำใน workspace เดียวกัน (ดูคำสั่งตรวจที่หัวไฟล์)
update public.meter_records m
set room_id = r.id
from public.rooms r
where m.room_id is null
  and m.workspace_id = r.workspace_id
  and m.room_number = r.room_number;

update public.bills b
set room_id = r.id
from public.rooms r
where b.room_id is null
  and b.workspace_id = r.workspace_id
  and b.room_number = r.room_number;

-- =========================================================================
-- 3. ดัชนีสำหรับการ join/lookup ในขั้นถัดไป
-- =========================================================================
create index if not exists idx_meter_records_room_cycle on public.meter_records (room_id, billing_cycle);
create index if not exists idx_bills_room_cycle on public.bills (room_id, billing_cycle);

-- =========================================================================
-- 4. Comments
-- =========================================================================
comment on column public.meter_records.room_id is 'ตัวระบุห้องที่แท้จริง (rooms.id) — ใช้แทน room_number ที่ซ้ำกันได้ข้ามตึก ส่วน room_number คงไว้เป็น snapshot ของประวัติ';
comment on column public.bills.room_id is 'ตัวระบุห้องที่แท้จริง (rooms.id) — ใช้แทน room_number ที่ซ้ำกันได้ข้ามตึก ส่วน room_number คงไว้เป็น snapshot ของประวัติ';

-- =========================================================================
-- 5. ตรวจผลหลังรัน — ทั้งสองคำสั่งควรได้ 0
-- =========================================================================
-- select count(*) from public.meter_records where room_id is null;
-- select count(*) from public.bills where room_id is null;
--   (ถ้าไม่ใช่ 0 คือมีแถวที่ room_number ไม่ตรงกับห้องใดในตาราง rooms — ห้องถูกลบหรือเปลี่ยนเลขไปแล้ว
--    แถวเหล่านั้นเป็นประวัติที่ยังอ่านได้จาก room_number ปล่อยเป็น null ได้ ไม่ต้องแก้)
