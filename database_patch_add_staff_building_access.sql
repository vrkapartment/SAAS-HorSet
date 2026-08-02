-- Patch: add_staff_building_access
-- วันที่: 2026-08-02
--
-- เพิ่มระบบ "จำกัดสิทธิ์ Staff ตามอาคาร" — Admin กำหนดได้ว่า Staff คนไหนเห็น/จัดการ
-- ห้องพัก ผู้เช่า มิเตอร์ และบิลได้เฉพาะอาคารใดบ้าง บังคับใช้ที่ระดับ RLS (ไม่ใช่แค่ UI)
-- เพื่อให้ staff ที่ถูกจำกัดไม่สามารถเห็นข้อมูลอาคารอื่นได้แม้จะเรียก Supabase ตรงๆ
--
--   1. staff_building_access — ตารางเก็บว่า staff คนไหนมีสิทธิ์อาคารไหนบ้าง
--      ไม่มีแถวเลย (0 rows) สำหรับ staff คนหนึ่ง = ไม่จำกัด (เห็นทุกอาคารเหมือนเดิม
--      ก่อนแพตช์นี้) มีอย่างน้อย 1 แถว = ถูกจำกัดเฉพาะอาคารที่มีแถวอยู่เท่านั้น
--      (มิเรอร์แนวคิด "null = unlimited" ที่ใช้กับ max_rooms/max_buildings ของแผน SaaS)
--   2. staff_has_building_access(building_id) — Security Definer helper สำหรับใช้ใน RLS
--   3. อัปเดต RLS policy ของ buildings, rooms, tenants, meter_records, meter_replacements, bills
--      ให้ Admin ไม่ถูกจำกัด (เหมือนเดิม) ส่วน Staff ถูกเช็คผ่าน staff_has_building_access()
--
-- ปลอดภัยที่จะรันซ้ำได้ (IF NOT EXISTS / DROP POLICY IF EXISTS ก่อนสร้างใหม่ทุกจุด)
--
-- แก้ไข (2026-08-02, รอบ 2): เวอร์ชันแรกทำให้เกิด "infinite recursion detected in policy"
-- บนตาราง tenants/rooms เพราะ policy ของ tenants เขียน subquery ตรงๆ ไปที่ rooms ในขณะที่
-- rooms เองก็มี policy เดิม ("Read rooms for tenants") ที่ subquery กลับไปที่ tenants อยู่แล้ว
-- ทำให้เกิดเป็น cycle rooms -> tenants -> rooms ที่ Postgres ปฏิเสธตั้งแต่ตอน plan query
-- (เกิดกับทุก role ไม่ใช่แค่ staff เพราะ Postgres ต้องขยาย policy ทั้งหมดของตารางไว้ก่อนเสมอ)
-- แก้โดยห่อการเช็ค building_id ของห้องด้วย SECURITY DEFINER function แทน (get_room_building_id /
-- get_room_building_id_by_number) ซึ่งจะข้าม RLS ของ rooms ไปเลยตอน query ภายในฟังก์ชัน
-- (มิเรอร์วิธีเดียวกับ get_current_user_workspace_id() ที่ query auth.users ตรงๆ อยู่แล้ว)
-- ไฟล์นี้รันซ้ำได้ปลอดภัย รันทับเวอร์ชันเดิมได้เลยไม่ต้อง rollback อะไรก่อน
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. staff_building_access
-- =========================================================================
create table if not exists public.staff_building_access (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint staff_building_access_unique unique (profile_id, building_id)
);

comment on table public.staff_building_access is 'จำกัดสิทธิ์ staff รายคนให้เห็น/จัดการเฉพาะอาคารที่ระบุ — ไม่มีแถว = ไม่จำกัด (เห็นทุกอาคาร)';

drop trigger if exists trg_staff_building_access_workspace on public.staff_building_access;
create trigger trg_staff_building_access_workspace
  before insert on public.staff_building_access
  for each row execute procedure public.populate_workspace_id();

create index if not exists idx_staff_building_access_profile on public.staff_building_access (profile_id);
create index if not exists idx_staff_building_access_building on public.staff_building_access (building_id);

alter table public.staff_building_access enable row level security;

drop policy if exists "Read staff_building_access for admin" on public.staff_building_access;
drop policy if exists "Read own staff_building_access" on public.staff_building_access;
drop policy if exists "Read staff_building_access for super_admin" on public.staff_building_access;
drop policy if exists "Manage staff_building_access for admin" on public.staff_building_access;
drop policy if exists "Manage staff_building_access for super_admin" on public.staff_building_access;

create policy "Read staff_building_access for admin" on public.staff_building_access for select
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read own staff_building_access" on public.staff_building_access for select
using (profile_id = auth.uid());

create policy "Read staff_building_access for super_admin" on public.staff_building_access for select
using (public.get_current_user_role() = 'super_admin');

create policy "Manage staff_building_access for admin" on public.staff_building_access for all
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage staff_building_access for super_admin" on public.staff_building_access for all
using (public.get_current_user_role() = 'super_admin');

-- =========================================================================
-- 2. Helper: staff_has_building_access(building_id)
-- =========================================================================
-- true ถ้า: ไม่ใช่ staff (admin/super_admin ไม่ถูกจำกัด), หรือ staff คนนี้ไม่มีแถวจำกัดใดๆ เลย
-- (= ไม่จำกัด ค่าเริ่มต้น), หรือมีแถวระบุ building_id นี้ไว้ตรงๆ
create or replace function public.staff_has_building_access(p_building_id uuid)
returns boolean as $$
declare
  _role text;
  _has_any_restriction boolean;
begin
  _role := public.get_current_user_role();
  if _role is distinct from 'staff' then
    return true;
  end if;

  if p_building_id is null then
    return true;
  end if;

  select exists(
    select 1 from public.staff_building_access where profile_id = auth.uid()
  ) into _has_any_restriction;

  if not _has_any_restriction then
    return true;
  end if;

  return exists(
    select 1 from public.staff_building_access
    where profile_id = auth.uid() and building_id = p_building_id
  );
end;
$$ language plpgsql stable security definer parallel safe;

-- =========================================================================
-- 2.1 Helper: get_room_building_id / get_room_building_id_by_number
-- =========================================================================
-- SECURITY DEFINER เพื่อให้ policy ของ tenants/meter_records/meter_replacements/bills
-- เช็ค building_id ของห้องได้โดย "ไม่ต้อง" query ตาราง rooms ตรงๆ (ซึ่งจะไปชน RLS ของ rooms
-- ที่มี policy อ้างอิงกลับมาที่ tenants อยู่แล้ว จนเกิด infinite recursion) ฟังก์ชันนี้ query
-- แบบข้าม RLS ไปเลย จึงตัดวงจร rooms <-> tenants ออกได้สนิท
create or replace function public.get_room_building_id(p_room_id uuid)
returns uuid as $$
  select building_id from public.rooms where id = p_room_id;
$$ language sql stable security definer parallel safe;

create or replace function public.get_room_building_id_by_number(p_workspace_id uuid, p_room_number text)
returns uuid as $$
  select building_id from public.rooms where workspace_id = p_workspace_id and room_number = p_room_number limit 1;
$$ language sql stable security definer parallel safe;

-- =========================================================================
-- 3. อัปเดต RLS: buildings, rooms, tenants, meter_records, meter_replacements, bills
--    Admin/Super Admin ไม่ถูกจำกัด (เหมือนเดิมทุกประการ) — Staff ถูกเช็คผ่าน helper ด้านบน
-- =========================================================================

-- ---- buildings ----
drop policy if exists "Read buildings in workspace or support approved" on public.buildings;
create policy "Read buildings in workspace or support approved" on public.buildings for select
using (
  (
    workspace_id = public.get_current_user_workspace_id()
    and (
      public.get_current_user_role() = 'admin'
      or (public.get_current_user_role() = 'staff' and public.staff_has_building_access(buildings.id))
    )
  )
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants sg where sg.workspace_id = buildings.workspace_id and sg.status = 'approved')
  )
);

drop policy if exists "Manage buildings in workspace or support approved" on public.buildings;
create policy "Manage buildings in workspace or support approved" on public.buildings for all
using (
  (
    workspace_id = public.get_current_user_workspace_id()
    and (
      public.get_current_user_role() = 'admin'
      or (public.get_current_user_role() = 'staff' and public.staff_has_building_access(buildings.id))
    )
  )
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants sg where sg.workspace_id = buildings.workspace_id and sg.status = 'approved')
  )
);

-- ---- rooms ----
drop policy if exists "Read rooms for admin/staff" on public.rooms;
create policy "Read rooms for admin/staff" on public.rooms for select
using (
  workspace_id = public.get_current_user_workspace_id()
  and (
    public.get_current_user_role() = 'admin'
    or (
      public.get_current_user_role() = 'staff'
      and (rooms.building_id is null or public.staff_has_building_access(rooms.building_id))
    )
  )
);

drop policy if exists "Manage rooms for admin/staff" on public.rooms;
create policy "Manage rooms for admin/staff" on public.rooms for all
using (
  workspace_id = public.get_current_user_workspace_id()
  and (
    public.get_current_user_role() = 'admin'
    or (
      public.get_current_user_role() = 'staff'
      and (rooms.building_id is null or public.staff_has_building_access(rooms.building_id))
    )
  )
);

-- ---- tenants (เช็คผ่าน get_room_building_id() แทน raw subquery กัน infinite recursion กับ rooms) ----
drop policy if exists "Read tenants for admin/staff" on public.tenants;
create policy "Read tenants for admin/staff" on public.tenants for select
using (
  workspace_id = public.get_current_user_workspace_id()
  and (
    public.get_current_user_role() = 'admin'
    or (
      public.get_current_user_role() = 'staff'
      and public.staff_has_building_access(public.get_room_building_id(tenants.room_id))
    )
  )
);

drop policy if exists "Manage tenants for admin/staff" on public.tenants;
create policy "Manage tenants for admin/staff" on public.tenants for all
using (
  workspace_id = public.get_current_user_workspace_id()
  and (
    public.get_current_user_role() = 'admin'
    or (
      public.get_current_user_role() = 'staff'
      and public.staff_has_building_access(public.get_room_building_id(tenants.room_id))
    )
  )
);

-- ---- meter_records (เช็คผ่าน get_room_building_id_by_number() แทน raw subquery) ----
drop policy if exists "Read meter_records for admin/staff" on public.meter_records;
create policy "Read meter_records for admin/staff" on public.meter_records for select
using (
  workspace_id = public.get_current_user_workspace_id()
  and (
    public.get_current_user_role() = 'admin'
    or (
      public.get_current_user_role() = 'staff'
      and public.staff_has_building_access(public.get_room_building_id_by_number(meter_records.workspace_id, meter_records.room_number))
    )
  )
);

drop policy if exists "Manage meter_records for admin/staff" on public.meter_records;
create policy "Manage meter_records for admin/staff" on public.meter_records for all
using (
  workspace_id = public.get_current_user_workspace_id()
  and (
    public.get_current_user_role() = 'admin'
    or (
      public.get_current_user_role() = 'staff'
      and public.staff_has_building_access(public.get_room_building_id_by_number(meter_records.workspace_id, meter_records.room_number))
    )
  )
);

-- ---- meter_replacements (รูปแบบเดียวกับ meter_records) ----
drop policy if exists "Read meter_replacements for admin/staff" on public.meter_replacements;
create policy "Read meter_replacements for admin/staff" on public.meter_replacements for select
using (
  workspace_id = public.get_current_user_workspace_id()
  and (
    public.get_current_user_role() = 'admin'
    or (
      public.get_current_user_role() = 'staff'
      and public.staff_has_building_access(public.get_room_building_id_by_number(meter_replacements.workspace_id, meter_replacements.room_number))
    )
  )
);

drop policy if exists "Manage meter_replacements for admin/staff" on public.meter_replacements;
create policy "Manage meter_replacements for admin/staff" on public.meter_replacements for all
using (
  workspace_id = public.get_current_user_workspace_id()
  and (
    public.get_current_user_role() = 'admin'
    or (
      public.get_current_user_role() = 'staff'
      and public.staff_has_building_access(public.get_room_building_id_by_number(meter_replacements.workspace_id, meter_replacements.room_number))
    )
  )
);

-- ---- bills (รูปแบบเดียวกับ meter_records) ----
drop policy if exists "Read bills for admin/staff" on public.bills;
create policy "Read bills for admin/staff" on public.bills for select
using (
  workspace_id = public.get_current_user_workspace_id()
  and (
    public.get_current_user_role() = 'admin'
    or (
      public.get_current_user_role() = 'staff'
      and public.staff_has_building_access(public.get_room_building_id_by_number(bills.workspace_id, bills.room_number))
    )
  )
);

drop policy if exists "Manage bills for admin/staff" on public.bills;
create policy "Manage bills for admin/staff" on public.bills for all
using (
  workspace_id = public.get_current_user_workspace_id()
  and (
    public.get_current_user_role() = 'admin'
    or (
      public.get_current_user_role() = 'staff'
      and public.staff_has_building_access(public.get_room_building_id_by_number(bills.workspace_id, bills.room_number))
    )
  )
);
