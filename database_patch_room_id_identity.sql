-- Patch: room_id_identity
-- วันที่: 2026-08-21
--
-- ขั้นที่ 2-3 ของการรองรับ "เลขห้องซ้ำข้ามอาคาร" (ขั้นที่ 1 = database_patch_add_room_id_to_meters_bills.sql)
--
-- เปลี่ยนตัวระบุห้องจาก room_number เป็น room_id ในทุก unique constraint และทุก RLS policy ของผู้เช่า
-- แล้วปลดล็อกให้สร้างห้องเลขซ้ำข้ามอาคารได้เป็นขั้นสุดท้าย
--
-- ⚠️ ต้องรัน patch นี้ "พร้อมกับ" การ deploy โค้ดที่จับคู่ด้วย room_id แล้ว
--    ถ้ารัน SQL ก่อนแล้วโค้ดเก่ายังใช้ onConflict แบบเดิม การ upsert บิล/มิเตอร์จะ error ทันที
--
-- ลำดับในไฟล์นี้สำคัญ: ข้อ 6 (ปลดล็อก rooms) ต้องอยู่ท้ายสุดเสมอ
-- ตราบใดที่ rooms_workspace_id_room_number_key ยังอยู่ เลขห้องซ้ำเกิดขึ้นไม่ได้
-- ข้อ 1-5 จึงไม่เปลี่ยนพฤติกรรมอะไรเลย ทดสอบได้ว่าไม่มีอะไรพังก่อนเปิดใช้จริง
--
-- ปลอดภัยที่จะรันซ้ำได้ (if not exists / if exists / pg_constraint guard)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. buildings.code — รหัสอาคารสั้น ๆ ใช้ประกอบเลขใบกำกับ (INV-202608-A-101)
-- =========================================================================
alter table public.buildings
  add column if not exists code text;

-- backfill เป็น A, B, C… เรียงตามลำดับการสร้างในแต่ละ workspace (เกิน 26 อาคารใช้เลขลำดับ)
-- แอดมินแก้ได้ทีหลังในหน้าจัดการอาคาร ให้ตรงกับป้ายจริงหน้าตึก
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
-- 3. สลับ unique constraint ให้ใช้ room_id
-- =========================================================================
-- room_id เป็น nullable (on delete set null เพื่อให้ประวัติบิลของห้องที่ถูกลบยังอ่านได้จาก room_number)
-- แถวที่ room_id เป็น null จึงไม่ถูก unique คุ้มกัน — ปัจจุบันมีแค่ข้อมูลทดสอบ (Test_UID, test API Ver)
-- และ code path ปกติเขียน room_id ครบทุกครั้ง

alter table public.meter_records
  drop constraint if exists meter_records_workspace_room_cycle_key;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meter_records_workspace_room_id_cycle_key') then
    alter table public.meter_records
      add constraint meter_records_workspace_room_id_cycle_key unique (workspace_id, room_id, billing_cycle);
  end if;
end $$;

-- bills: invoice_id เลิกเป็น conflict key เหลือเป็นเลขอ้างอิงที่พิมพ์บนบิลเท่านั้น
alter table public.bills
  drop constraint if exists bills_workspace_id_invoice_id_key;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bills_workspace_room_id_cycle_key') then
    alter table public.bills
      add constraint bills_workspace_room_id_cycle_key unique (workspace_id, room_id, billing_cycle);
  end if;
end $$;

alter table public.meter_replacements
  drop constraint if exists meter_replacements_workspace_id_room_cycle_type_key;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meter_replacements_workspace_room_id_cycle_type_key') then
    alter table public.meter_replacements
      add constraint meter_replacements_workspace_room_id_cycle_type_key
      unique (workspace_id, room_id, billing_cycle, meter_type);
  end if;
end $$;

-- =========================================================================
-- 4. RLS ผู้เช่า — เทียบ room_id ตรง ๆ ผ่าน tenants.room_id
-- =========================================================================
-- เดิม (patch fix_tenant_rls_scope) เทียบ workspace_id + room_number ซึ่งจะกำกวมทันทีที่เลขห้องซ้ำได้
-- room_id เป็น uuid ที่ unique ทั้งระบบ จึงไม่ต้องเทียบ workspace_id อีก และ predicate สั้นลงมาก

drop policy if exists "Read meter_records for tenants" on public.meter_records;
create policy "Read meter_records for tenants" on public.meter_records for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1 from public.tenants t
    where t.tenant_phone = public.get_current_user_phone()
      and t.room_id = meter_records.room_id
  )
);

drop policy if exists "Read bills for tenants" on public.bills;
create policy "Read bills for tenants" on public.bills for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1 from public.tenants t
    where t.tenant_phone = public.get_current_user_phone()
      and t.room_id = bills.room_id
  )
);

drop policy if exists "Read meter_replacements for tenants" on public.meter_replacements;
create policy "Read meter_replacements for tenants" on public.meter_replacements for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1 from public.tenants t
    where t.tenant_phone = public.get_current_user_phone()
      and t.room_id = meter_replacements.room_id
  )
);

-- =========================================================================
-- 5. ตรวจก่อนปลดล็อก — ต้องได้ 0 แถวทั้งสามคำสั่ง
-- =========================================================================
-- ถ้าไม่ใช่ 0 หมายถึงยังมีแถวที่ room_id ว่างอยู่นอกเหนือจากข้อมูลทดสอบ ให้ตรวจก่อนไปข้อ 6
--
-- select count(*) from public.meter_records m join public.rooms r
--   on r.workspace_id = m.workspace_id and r.room_number = m.room_number where m.room_id is null;
-- select count(*) from public.bills b join public.rooms r
--   on r.workspace_id = b.workspace_id and r.room_number = b.room_number where b.room_id is null;
-- select count(*) from public.meter_replacements x join public.rooms r
--   on r.workspace_id = x.workspace_id and r.room_number = x.room_number where x.room_id is null;

-- =========================================================================
-- 6. ⚠️ ขั้นสุดท้าย — ปลดล็อกให้เลขห้องซ้ำข้ามอาคารได้
-- =========================================================================
-- เปลี่ยนกฎจาก "ห้ามเลขห้องซ้ำในหอ" เป็น "ห้ามเลขห้องซ้ำในอาคารเดียวกัน"
-- กฎใหม่นี้ยังทำให้ INV-{รอบบิล}-{รหัสอาคาร}-{เลขห้อง} ไม่ซ้ำโดยอัตโนมัติ
--
-- หมายเหตุ: ห้องที่ building_id เป็น null จะไม่ถูกกฎใหม่คุ้มกัน (null ไม่ conflict กันใน Postgres)
-- ตรวจแล้วว่าปัจจุบันทุกห้องมี building_id ครบ (68/68) และ createRoom/createRoomsBatch/CSV import
-- เติม building_id ให้ทุกเส้นทางแล้ว

alter table public.rooms
  drop constraint if exists rooms_workspace_id_room_number_key;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_workspace_building_room_number_key') then
    alter table public.rooms
      add constraint rooms_workspace_building_room_number_key
      unique (workspace_id, building_id, room_number);
  end if;
end $$;

-- =========================================================================
-- 7. ตรวจผลหลังรัน
-- =========================================================================
-- constraint ที่ต้องมี (ควรได้ 5 แถว):
--   select conname from pg_constraint where conname in (
--     'buildings_workspace_id_code_key',
--     'meter_records_workspace_room_id_cycle_key',
--     'bills_workspace_room_id_cycle_key',
--     'meter_replacements_workspace_room_id_cycle_type_key',
--     'rooms_workspace_building_room_number_key'
--   );
--
-- constraint เดิมที่ต้องหายไปแล้ว (ควรได้ 0 แถว):
--   select conname from pg_constraint where conname in (
--     'meter_records_workspace_room_cycle_key',
--     'bills_workspace_id_invoice_id_key',
--     'meter_replacements_workspace_id_room_cycle_type_key',
--     'rooms_workspace_id_room_number_key'
--   );
--
-- รหัสอาคารที่ backfill ได้:
--   select workspace_id, code, name from public.buildings order by workspace_id, code;
