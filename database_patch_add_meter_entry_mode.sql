-- Patch: add_meter_entry_mode
-- วันที่: 2026-08-21
--
-- เพิ่ม "รูปแบบการจดมิเตอร์" ที่หน้า /billing (จดมิเตอร์ และดูบิล) ให้เลือกได้ต่อ workspace
-- แทนที่จะบังคับจดทีละสาธารณูปโภคทั้งหอเหมือนเดิม (ไฟ 1 รอบ แล้วน้ำอีก 1 รอบ)
--
-- เป็น 2 มิติอิสระต่อกัน:
-- 1. workspaces.meter_entry_utility — จดอะไร: 'electric' (เดิม) | 'water' | 'both' (ไฟ-น้ำพร้อมกันในแถวเดียว)
-- 2. workspaces.meter_entry_floor   — ขอบเขตชั้น: 'all' (ทุกชั้น) หรือชื่อชั้น เช่น '1', '2', 'B'
--
-- meter_entry_floor ไม่ใส่ check constraint เพราะชื่อชั้นเป็นข้อมูลของผู้ใช้เอง (rooms.floor เป็น text
-- และระบบมี fallback ตัดชั้นจากเลขห้องด้วย ดู getRoomFloor ใน src/features/room/utils.ts)
-- ถ้าชั้นที่จำไว้ไม่มีอยู่จริงในรอบบิล/อาคารที่เลือก ฝั่งแอปจะ fallback เป็น 'all' ให้เอง
--
-- ค่า default ตรงกับพฤติกรรมเดิมทั้งหมด → workspace ที่ไม่ได้แตะอะไรจะใช้งานเหมือนก่อนหน้านี้เป๊ะ
-- และแอปรองรับกรณี "ยังไม่รัน patch นี้" อยู่แล้ว (getFinanceSettings แยก query + fallback เป็น default)
--
-- ปลอดภัยที่จะรันซ้ำได้ (IF NOT EXISTS / pg_constraint guard)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. workspaces: รูปแบบการจดมิเตอร์
-- =========================================================================
alter table public.workspaces
  add column if not exists meter_entry_utility text default 'electric',
  add column if not exists meter_entry_floor text default 'all';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspaces_meter_entry_utility_check'
  ) then
    alter table public.workspaces
      add constraint workspaces_meter_entry_utility_check
      check (meter_entry_utility in ('electric', 'water', 'both'));
  end if;
end $$;

-- =========================================================================
-- 2. Backfill แถวเก่าที่คอลัมน์เป็น null (default ใช้กับ insert ใหม่เท่านั้น)
-- =========================================================================
update public.workspaces
set meter_entry_utility = 'electric'
where meter_entry_utility is null;

update public.workspaces
set meter_entry_floor = 'all'
where meter_entry_floor is null;

-- =========================================================================
-- 3. Comments
-- =========================================================================
comment on column public.workspaces.meter_entry_utility is 'รูปแบบการจดมิเตอร์ที่หน้า /billing: electric = จดไฟทีละรอบ (เดิม) | water = จดน้ำทีละรอบ | both = จดไฟและน้ำพร้อมกันในแถวเดียว';
comment on column public.workspaces.meter_entry_floor is 'ขอบเขตชั้นที่แสดงในแท็บจดเลขมิเตอร์: all = ทุกชั้น หรือชื่อชั้นตาม rooms.floor เช่น 1, 2, B (ถ้าชั้นที่จำไว้ไม่มีอยู่จริง แอปจะ fallback เป็น all)';
