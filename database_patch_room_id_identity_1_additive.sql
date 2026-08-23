-- Patch: room_id_identity — ส่วนที่ 1 จาก 2 "เพิ่มของใหม่เท่านั้น"
-- วันที่: 2026-08-23
--
-- ขั้นที่ 2-3 ของการรองรับ "เลขห้องซ้ำข้ามอาคาร" (ขั้นที่ 1 = database_patch_add_room_id_to_meters_bills.sql)
--
-- =========================================================================
-- ไฟล์นี้ปลอดภัยที่จะรัน "ก่อน" deploy โค้ดใหม่
-- =========================================================================
-- ทุกคำสั่งในไฟล์นี้เป็นการ "เพิ่ม" ล้วน ๆ — เพิ่มคอลัมน์ เพิ่ม index เพิ่ม unique constraint ตัวใหม่
-- โดย "ไม่ลบ" constraint ตัวเก่าและ "ไม่แตะ" RLS เดิม
--
-- ผลคือโค้ดเวอร์ชันเก่าที่ยังรันอยู่บน production ทำงานได้ครบ 100% ต่อไป:
--   · คอลัมน์ใหม่มี default / เป็น nullable → insert แบบเดิมที่ไม่ระบุคอลัมน์เหล่านี้ยังผ่าน
--   · unique เดิมยังอยู่ → upsert แบบเดิม (onConflict: workspace_id,invoice_id) ยังทำงาน
--   · RLS เดิมยังอยู่ → ผู้เช่ายังเห็นบิลของตัวเองเหมือนเดิม
-- และพอ deploy โค้ดใหม่แล้ว โค้ดใหม่ก็มีทุกอย่างที่ต้องใช้ครบแล้ว → ไม่มีช่วงที่ระบบพัง
--
-- ลำดับที่ถูกต้อง:
--   1) รันไฟล์นี้                          ← ไม่มีอะไรพัง
--   2) merge + รอ Vercel deploy เสร็จ       ← ไม่มีอะไรพัง
--   3) QA เฟส 1 (ทุกอย่างต้องเหมือนเดิมเป๊ะ)
--   4) รัน database_patch_room_id_identity_2_switch.sql  ← เปิดใช้ฟีเจอร์จริง
--   5) QA เฟส 2
--
-- ปลอดภัยที่จะรันซ้ำได้ (if not exists / pg_constraint guard)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. buildings.code — รหัสอาคารสั้น ๆ ใช้ประกอบเลขใบกำกับ (INV-202608-A-101)
-- =========================================================================
alter table public.buildings
  add column if not exists code text;

-- backfill เป็น A, B, C… เรียงตามลำดับการสร้างในแต่ละ workspace (เกิน 26 อาคารใช้เลขลำดับ)
--
-- ⚠️ ลำดับนี้เป็นแค่ค่าตั้งต้น อาจไม่ตรงกับป้ายจริงหน้าตึก — รหัสนี้จะไปปรากฏบนเลขใบกำกับ
-- ที่ผู้เช่าเห็น ให้เข้าไปแก้ในหน้า "จัดการอาคาร" ให้ตรงกับที่เรียกกันจริงหลัง deploy เสร็จ
with numbered as (
  select id,
         row_number() over (partition by workspace_id order by created_at, id) as rn
  from public.buildings
)
update public.buildings b
set code = case when n.rn <= 26 then chr(64 + n.rn::int) else n.rn::text end
from numbered n
where b.id = n.id
  and (b.code is null or btrim(b.code) = '');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'buildings_workspace_id_code_key') then
    alter table public.buildings
      add constraint buildings_workspace_id_code_key unique (workspace_id, code);
  end if;
end $$;

comment on column public.buildings.code is 'รหัสอาคารสั้น ๆ (A, B, …) ใช้ประกอบเลขใบกำกับให้ไม่ซ้ำเมื่อคนละอาคารใช้เลขห้องเดียวกัน';

-- =========================================================================
-- 2. meter_replacements.room_id — ขั้นที่ 1 เพิ่มให้แค่ meter_records กับ bills
-- =========================================================================
alter table public.meter_replacements
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

update public.meter_replacements m
set room_id = r.id
from public.rooms r
where m.room_id is null
  and m.workspace_id = r.workspace_id
  and m.room_number = r.room_number;

create index if not exists idx_meter_replacements_room_cycle on public.meter_replacements (room_id, billing_cycle);

comment on column public.meter_replacements.room_id is 'ตัวระบุห้องที่แท้จริง (rooms.id) — room_number คงไว้เป็น snapshot ของประวัติ';

-- =========================================================================
-- 3. bills.bill_kind — แยกบิลปกติออกจากบิลปิดรอบตอนย้ายห้อง
-- =========================================================================
-- ห้องเดียวกันในรอบบิลเดียวกันมีบิลสองใบได้จริง: ผู้เช่าเก่าย้ายออกกลางเดือน (ได้บิลปิดรอบ
-- แบบ prorate จาก transferTenantRoom) แล้วผู้เช่าใหม่ย้ายเข้าห้องเดิมในเดือนนั้น (ได้บิลปกติ)
--
-- ถ้าไม่แยก บิลปิดรอบจะถูกบิลปกติ upsert ทับทั้งแถว — ทั้งยอด prorate ทั้งชื่อผู้เช่าเก่าหายไป
-- เงียบ ๆ ซึ่งเป็นหลักฐานการเรียกเก็บเงินที่ผู้เช่าเก่าถืออยู่ในมือ
--
-- หมายเหตุ: เดิมสองใบนี้อยู่ร่วมกันได้เพราะ invoice_id ต่างกัน (ลงท้าย -TRANSFER) แต่การเช็ค
-- บิลเดิมใน createBill ใช้ maybeSingle() ซึ่งเจอ 2 แถวแล้ว error ทันที — เป็น bug ที่มีอยู่ก่อน
-- patch นี้ และแก้ไปพร้อมกันด้วยการให้ฝั่งโค้ดกรอง bill_kind = 'regular'
--
-- NOT NULL DEFAULT 'regular' สำคัญ: ทำให้ insert ของโค้ดเก่าที่ไม่ระบุคอลัมน์นี้ยังผ่านได้
alter table public.bills
  add column if not exists bill_kind text not null default 'regular';

update public.bills
set bill_kind = 'transfer_closing'
where bill_kind = 'regular'
  and invoice_id like '%-TRANSFER';

comment on column public.bills.bill_kind is 'ชนิดบิล: regular = บิลรอบปกติ, transfer_closing = บิลปิดรอบตอนย้ายห้อง (มีร่วมกันได้ในห้อง+รอบเดียวกัน)';

-- =========================================================================
-- 4. ตรวจก่อนเพิ่ม unique ตัวใหม่ — ทั้งสามคำสั่งต้องได้ 0 แถว
-- =========================================================================
-- ถ้าไม่ใช่ 0 แปลว่ามีข้อมูลที่ซ้ำกันอยู่แล้วตามคีย์ใหม่ การเพิ่ม constraint ในข้อ 5 จะ error
-- ให้ตรวจว่าแถวไหนซ้ำและทำไม ก่อนไปต่อ (ห้ามลบข้อมูลทิ้งโดยไม่รู้สาเหตุ)
--
-- select workspace_id, room_id, billing_cycle, count(*) from public.meter_records
--   where room_id is not null group by 1,2,3 having count(*) > 1;
--
-- select workspace_id, room_id, billing_cycle, bill_kind, count(*) from public.bills
--   where room_id is not null group by 1,2,3,4 having count(*) > 1;
--
-- select workspace_id, room_id, billing_cycle, meter_type, count(*) from public.meter_replacements
--   where room_id is not null group by 1,2,3,4 having count(*) > 1;

-- =========================================================================
-- 5. เพิ่ม unique ตัวใหม่ (ยังไม่ลบตัวเก่า)
-- =========================================================================
-- ของเก่ากับของใหม่อยู่ร่วมกันได้: ตอนนี้เลขห้องยังซ้ำไม่ได้ (rooms_workspace_id_room_number_key
-- ยังอยู่) ดังนั้นคีย์เก่ากับคีย์ใหม่จึงชี้แถวเดียวกันเสมอ ไม่มีทางขัดกัน
--
-- room_id เป็น nullable (on delete set null เพื่อให้ประวัติบิลของห้องที่ถูกลบยังอ่านได้จาก
-- room_number) แถวที่ room_id เป็น null จึงไม่ถูก unique คุ้มกัน — ปัจจุบันมีแค่ข้อมูลทดสอบ
-- และ code path ปกติเขียน room_id ครบทุกครั้ง

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meter_records_workspace_room_id_cycle_key') then
    alter table public.meter_records
      add constraint meter_records_workspace_room_id_cycle_key unique (workspace_id, room_id, billing_cycle);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bills_workspace_room_id_cycle_kind_key') then
    alter table public.bills
      add constraint bills_workspace_room_id_cycle_kind_key
      unique (workspace_id, room_id, billing_cycle, bill_kind);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meter_replacements_workspace_room_id_cycle_type_key') then
    alter table public.meter_replacements
      add constraint meter_replacements_workspace_room_id_cycle_type_key
      unique (workspace_id, room_id, billing_cycle, meter_type);
  end if;
end $$;

-- =========================================================================
-- 6. ตรวจผลหลังรัน
-- =========================================================================
-- constraint ที่ต้องมีเพิ่มขึ้นมา (ควรได้ 4 แถว):
--   select conname from pg_constraint where conname in (
--     'buildings_workspace_id_code_key',
--     'meter_records_workspace_room_id_cycle_key',
--     'bills_workspace_room_id_cycle_kind_key',
--     'meter_replacements_workspace_room_id_cycle_type_key'
--   );
--
-- constraint เก่าที่ต้อง "ยังอยู่" ในขั้นนี้ (ควรได้ 4 แถว — ถ้าหายไปแปลว่ารันไฟล์ 2 ไปแล้ว):
--   select conname from pg_constraint where conname in (
--     'meter_records_workspace_room_cycle_key',
--     'bills_workspace_id_invoice_id_key',
--     'meter_replacements_workspace_id_room_cycle_type_key',
--     'rooms_workspace_id_room_number_key'
--   );
--
-- รหัสอาคารที่ backfill ได้ (เอาไปเทียบกับป้ายจริงหน้าตึก แล้วแก้ในหน้าจัดการอาคาร):
--   select workspace_id, code, name from public.buildings order by workspace_id, code;
--
-- บิลที่ถูกจัดเป็นบิลปิดรอบย้ายห้อง (ปกติควรมีน้อยมากหรือไม่มีเลย):
--   select count(*) from public.bills where bill_kind = 'transfer_closing';
