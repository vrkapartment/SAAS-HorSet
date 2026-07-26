-- Patch: add_building_utility_billing
-- วันที่: 2026-07-26
--
-- เพิ่มโหมด "หารค่าน้ำ-ไฟตามสัดส่วนยอดบิลจริงทั้งอาคาร" (ตามกฎหมายใหม่เรื่องห้ามคิดค่าน้ำ-ไฟ
-- เกินอัตราจริงที่หน่วยงานเรียกเก็บ) เป็นทางเลือกเพิ่มเติมนอกเหนือจากอัตราคงที่เดิม (fixed_rate)
-- เลือกได้อิสระต่อ workspace แยกไฟฟ้า/น้ำประปา ไม่กระทบ workspace ที่ไม่ได้เปิดใช้งาน (default เดิม)
--
-- 1. workspaces.electric_billing_mode / water_billing_mode — โหมดคำนวณต่อ utility
-- 2. building_utility_bills — ยอดบิลจริงทั้งอาคาร + หน่วยรวม ต่ออาคาร ต่อรอบบิล ต่อประเภทสาธารณูปโภค
--    (เจ้าของหอกรอกเอง 2 ตัวเลข ระบบคำนวณ rate_per_unit = total_amount / total_units)
-- 3. Backfill rooms.building_id ที่เป็น null ให้กับอาคารเดียวของ workspace นั้น (ครอบคลุม >99%
--    ของ workspace ที่มีอาคารเดียว เพราะ createRoom/createRoomsBatch/importRoomsFromCSV เดิม
--    ไม่เคยเซ็ต building_id ตอนสร้างห้องมาก่อน)
--
-- ปลอดภัยที่จะรันซ้ำได้ (IF NOT EXISTS / DROP POLICY IF EXISTS)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. workspaces: โหมดคำนวณค่าน้ำ-ไฟ
-- =========================================================================
alter table public.workspaces
  add column if not exists electric_billing_mode text default 'fixed_rate',
  add column if not exists water_billing_mode text default 'fixed_rate';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspaces_electric_billing_mode_check'
  ) then
    alter table public.workspaces
      add constraint workspaces_electric_billing_mode_check
      check (electric_billing_mode in ('fixed_rate', 'building_total'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workspaces_water_billing_mode_check'
  ) then
    alter table public.workspaces
      add constraint workspaces_water_billing_mode_check
      check (water_billing_mode in ('fixed_rate', 'building_total'));
  end if;
end $$;

comment on column public.workspaces.electric_billing_mode is 'fixed_rate = อัตราคงที่ต่อหน่วยที่เจ้าของหอตั้งเอง (เดิม) | building_total = หารตามสัดส่วนยอดบิลจริงทั้งอาคาร (ดู building_utility_bills)';
comment on column public.workspaces.water_billing_mode is 'เหมือน electric_billing_mode แต่สำหรับค่าน้ำประปา';

-- =========================================================================
-- 2. building_utility_bills
-- =========================================================================
create table if not exists public.building_utility_bills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete cascade,
  billing_cycle text not null,
  utility_type text not null check (utility_type in ('electric', 'water')),
  total_amount numeric not null,
  total_units numeric not null,
  rate_per_unit numeric not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, billing_cycle, utility_type)
);

comment on table public.building_utility_bills is 'ยอดบิลไฟฟ้า/น้ำประปาจริงทั้งอาคาร + จำนวนหน่วยรวม ต่อรอบบิล (กรอกโดยเจ้าของหอ/staff) ใช้คำนวณ rate_per_unit สำหรับโหมด building_total';

create index if not exists idx_building_utility_bills_workspace_id on public.building_utility_bills (workspace_id);
create index if not exists idx_building_utility_bills_building_cycle on public.building_utility_bills (building_id, billing_cycle);
create index if not exists idx_building_utility_bills_workspace_cycle on public.building_utility_bills (workspace_id, billing_cycle);

alter table public.building_utility_bills enable row level security;

drop policy if exists "Read building_utility_bills for admin/staff" on public.building_utility_bills;
drop policy if exists "Read building_utility_bills for tenants" on public.building_utility_bills;
drop policy if exists "Read building_utility_bills for super_admin" on public.building_utility_bills;
drop policy if exists "Manage building_utility_bills for admin/staff" on public.building_utility_bills;
drop policy if exists "Manage building_utility_bills for super_admin" on public.building_utility_bills;

create policy "Read building_utility_bills for admin/staff" on public.building_utility_bills for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

-- ผู้เช่าต้องอ่านได้ด้วย (ไม่ใช่แค่ admin/staff) เพื่อให้ portal ของผู้เช่าที่ login ปกติเห็น
-- "รายละเอียดใบแจ้งหนี้จริงจากหน่วยงาน" ได้ — เดิมไม่มี policy นี้ทำให้ query คืนแถวว่างเงียบๆ
-- (ไม่ error) สำหรับผู้เช่าที่ login จริง ต่างจาก flow no-login ที่ใช้ service-role client ข้าม RLS
create policy "Read building_utility_bills for tenants" on public.building_utility_bills for select
using (
  public.get_current_user_role() = 'tenant'
  and building_id = (
    select r.building_id
    from public.rooms r
    join public.tenants t on t.room_id = r.id
    where t.tenant_phone = public.get_current_user_phone()
    limit 1
  )
);

create policy "Read building_utility_bills for super_admin" on public.building_utility_bills for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = building_utility_bills.workspace_id and sg.status = 'approved')
);

create policy "Manage building_utility_bills for admin/staff" on public.building_utility_bills for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage building_utility_bills for super_admin" on public.building_utility_bills for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = building_utility_bills.workspace_id and sg.status = 'approved')
);

-- =========================================================================
-- 3. Backfill rooms.building_id ที่ยัง null (สำหรับ workspace ที่มีอาคารเดียว)
-- =========================================================================
update public.rooms r
set building_id = only_building.id
from (
  select workspace_id, (array_agg(id))[1] as id
  from public.buildings
  group by workspace_id
  having count(*) = 1
) only_building
where r.building_id is null
  and r.workspace_id = only_building.workspace_id;

-- =========================================================================
-- 4. bills.building_id — บันทึก building_id ของห้อง ณ ตอนออกบิล (snapshot)
-- =========================================================================
-- เก็บแบบ snapshot แยกจาก rooms.building_id เพราะห้องอาจถูกย้ายไปอาคารอื่นภายหลัง
-- (ผ่าน updateRoom) — บิลเก่าต้องอ้างอิงอาคารที่ถูกต้อง ณ ตอนออกบิลเสมอ ไม่ใช่อาคารปัจจุบันของห้อง
-- ไม่เช่นนั้น "รายละเอียดใบแจ้งหนี้จริงจากหน่วยงาน" ของบิลเก่าจะไปจับคู่กับยอดของอาคารผิด
alter table public.bills
  add column if not exists building_id uuid references public.buildings(id) on delete set null;

comment on column public.bills.building_id is 'Snapshot ของ rooms.building_id ณ ตอนออกบิล ใช้ lookup building_utility_bills ให้ตรงอาคารในอดีต แม้ห้องจะถูกย้ายอาคารในภายหลัง';

-- Backfill บิลเก่าที่ยังไม่มี building_id จาก building_id ปัจจุบันของห้อง (ดีที่สุดเท่าที่ทำได้ย้อนหลัง)
update public.bills b
set building_id = r.building_id
from public.rooms r
where b.building_id is null
  and b.room_number = r.room_number
  and b.workspace_id = r.workspace_id
  and r.building_id is not null;
