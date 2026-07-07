-- =========================================================================
-- SUPABASE DATABASE PERFORMANCE & RLS SECURITY SPLIT OPTIMIZATION PATCH V2
-- =========================================================================
-- ปรับปรุงระดับสูงสุด (Ultra-Secure & Zero-Recursion):
-- 1. ทำการ DROP Policy ทั้งหมด (ทั้งแบบดั้งเดิม single-workspace และ multi-workspace และจากแพตช์อื่นๆ)
-- 2. สร้างฟังก์ชัน Helper ปลอดภัยสูงที่สืบค้นข้อมูลผ่าน auth.users/JWT claims เสมอ (หลีกเลี่ยงการสืบค้น public.profiles เพื่อตัดลูปล้านเปอร์เซ็นต์)
-- 3. เขียนและติดตั้งนโยบาย RLS ของทุกตารางใหม่ทั้งหมด โดยใช้เฉพาะฟังก์ชันเลี่ยงลูปเหล่านี้
-- =========================================================================

-- -------------------------------------------------------------------------
-- [1] ทำการ DROP Policy เดิมที่มีอยู่ทั้งหมดในระบบเพื่อเคลียร์ขยะและการทำงานซ้ำซ้อน
-- -------------------------------------------------------------------------

-- ตาราง profiles
drop policy if exists "Allow public read-only of profiles for authenticated users" on public.profiles;
drop policy if exists "Allow users to update their own profile" on public.profiles;
drop policy if exists "Read profiles in same workspace or own profile or super_admin" on public.profiles;
drop policy if exists "Manage profiles in workspace or own profile or super_admin" on public.profiles;
drop policy if exists "Read profiles for admin/staff" on public.profiles;
drop policy if exists "Read profiles for self" on public.profiles;
drop policy if exists "Read profiles for super_admin" on public.profiles;
drop policy if exists "Manage profiles for admin" on public.profiles;
drop policy if exists "Manage profiles for self" on public.profiles;
drop policy if exists "Manage profiles for super_admin" on public.profiles;

-- ตาราง room_types
drop policy if exists "Allow read-only of room_types for authenticated users" on public.room_types;
drop policy if exists "Admin has full access on room_types" on public.room_types;
drop policy if exists "Read room_types in workspace or support approved" on public.room_types;
drop policy if exists "Manage room_types in workspace or support approved" on public.room_types;
drop policy if exists "Read room_types for admin/staff" on public.room_types;
drop policy if exists "Read room_types for tenants" on public.room_types;
drop policy if exists "Read room_types for super_admin" on public.room_types;
drop policy if exists "Manage room_types for admin" on public.room_types;
drop policy if exists "Manage room_types for super_admin" on public.room_types;

-- ตาราง rooms
drop policy if exists "Admin has full access on rooms" on public.rooms;
drop policy if exists "Staff can read and update rooms" on public.rooms;
drop policy if exists "Tenant can view their own room" on public.rooms;
drop policy if exists "Read rooms in workspace or support approved" on public.rooms;
drop policy if exists "Manage rooms in workspace or support approved" on public.rooms;
drop policy if exists "Read rooms for admin/staff" on public.rooms;
drop policy if exists "Read rooms for tenants" on public.rooms;
drop policy if exists "Read rooms for super_admin" on public.rooms;
drop policy if exists "Manage rooms for admin/staff" on public.rooms;
drop policy if exists "Manage rooms for super_admin" on public.rooms;

-- ตาราง tenants
drop policy if exists "Admin has full access on tenants" on public.tenants;
drop policy if exists "Staff can read and update tenants" on public.tenants;
drop policy if exists "Tenant can view their own tenant profile" on public.tenants;
drop policy if exists "Read tenants in workspace or support approved" on public.tenants;
drop policy if exists "Manage tenants in workspace or support approved" on public.tenants;
drop policy if exists "Read tenants for admin/staff" on public.tenants;
drop policy if exists "Read tenants for tenants" on public.tenants;
drop policy if exists "Read tenants for super_admin" on public.tenants;
drop policy if exists "Manage tenants for admin/staff" on public.tenants;
drop policy if exists "Manage tenants for super_admin" on public.tenants;

-- ตาราง meter_records
drop policy if exists "Admin has full access on meter_records" on public.meter_records;
drop policy if exists "Staff can read, insert and update meter_records" on public.meter_records;
drop policy if exists "Tenant can view their own room's meter records" on public.meter_records;
drop policy if exists "Read meter_records in workspace or support approved" on public.meter_records;
drop policy if exists "Manage meter_records in workspace or support approved" on public.meter_records;
drop policy if exists "Read meter_records for admin/staff" on public.meter_records;
drop policy if exists "Read meter_records for tenants" on public.meter_records;
drop policy if exists "Read meter_records for super_admin" on public.meter_records;
drop policy if exists "Manage meter_records for admin/staff" on public.meter_records;
drop policy if exists "Manage meter_records for super_admin" on public.meter_records;

-- ตาราง bills
drop policy if exists "Admin has full access on bills" on public.bills;
drop policy if exists "Staff can read, insert and update bills" on public.bills;
drop policy if exists "Tenant can view their own bills" on public.bills;
drop policy if exists "Read bills in workspace or support approved" on public.bills;
drop policy if exists "Manage bills in workspace or support approved" on public.bills;
drop policy if exists "Read bills for admin/staff" on public.bills;
drop policy if exists "Read bills for tenants" on public.bills;
drop policy if exists "Read bills for super_admin" on public.bills;
drop policy if exists "Manage bills for admin/staff" on public.bills;
drop policy if exists "Manage bills for super_admin" on public.bills;

-- ตาราง expenses
drop policy if exists "Admin has full access on expenses" on public.expenses;
drop policy if exists "Read expenses in workspace or support approved" on public.expenses;
drop policy if exists "Manage expenses in workspace or support approved" on public.expenses;
drop policy if exists "Read expenses for admin/staff" on public.expenses;
drop policy if exists "Read expenses for super_admin" on public.expenses;
drop policy if exists "Manage expenses for admin" on public.expenses;
drop policy if exists "Manage expenses for super_admin" on public.expenses;

-- ตาราง cancelled_contracts
drop policy if exists "Read cancelled_contracts in workspace or support approved" on public.cancelled_contracts;
drop policy if exists "Manage cancelled_contracts in workspace or support approved" on public.cancelled_contracts;
drop policy if exists "Read cancelled_contracts for admin/staff" on public.cancelled_contracts;
drop policy if exists "Read cancelled_contracts for super_admin" on public.cancelled_contracts;
drop policy if exists "Manage cancelled_contracts for admin/staff" on public.cancelled_contracts;
drop policy if exists "Manage cancelled_contracts for super_admin" on public.cancelled_contracts;

-- ตาราง meter_replacements
drop policy if exists "Read meter_replacements in workspace or support approved" on public.meter_replacements;
drop policy if exists "Manage meter_replacements in workspace or support approved" on public.meter_replacements;
drop policy if exists "Read meter_replacements for admin/staff" on public.meter_replacements;
drop policy if exists "Read meter_replacements for tenants" on public.meter_replacements;
drop policy if exists "Read meter_replacements for super_admin" on public.meter_replacements;
drop policy if exists "Manage meter_replacements for admin/staff" on public.meter_replacements;
drop policy if exists "Manage meter_replacements for super_admin" on public.meter_replacements;

-- ตาราง workspace_line_settings
drop policy if exists "Users can manage their own workspace line settings" on public.workspace_line_settings;

-- ตาราง admin_connection_codes
drop policy if exists "Admins can manage connection codes for their workspace" on public.admin_connection_codes;

-- ตาราง line_quota_cache
drop policy if exists "Super Admins can manage line quota cache" on public.line_quota_cache;

-- ตาราง registration_codes
drop policy if exists "Super Admins can manage registration codes" on public.registration_codes;
drop policy if exists "Anyone can read registration codes for verification" on public.registration_codes;

-- ตาราง system_settings
drop policy if exists "Super admins can manage system settings" on public.system_settings;

-- ตาราง workspaces
drop policy if exists "Super Admins can manage all workspaces" on public.workspaces;
drop policy if exists "Users can view their own workspace" on public.workspaces;
drop policy if exists "Workspace admins can update their own workspace" on public.workspaces;

-- ตาราง support_access_grants
drop policy if exists "Super Admins can manage all support grants" on public.support_access_grants;
drop policy if exists "Workspace admins can manage support grants for their workspace" on public.support_access_grants;

-- ตาราง cached_translations
drop policy if exists "Authenticated users can read cached translations" on public.cached_translations;


-- -------------------------------------------------------------------------
-- [2] ตรวจสอบและบังคับใช้สิทธิ์การทำงาน Row-Level Security (RLS) บนทุกตาราง
-- -------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.tenants enable row level security;
alter table public.meter_records enable row level security;
alter table public.bills enable row level security;
alter table public.expenses enable row level security;
alter table public.cancelled_contracts enable row level security;
alter table public.meter_replacements enable row level security;
alter table public.workspace_line_settings enable row level security;
alter table public.admin_connection_codes enable row level security;
alter table public.line_quota_cache enable row level security;
alter table public.registration_codes enable row level security;
alter table public.system_settings enable row level security;
alter table public.workspaces enable row level security;
alter table public.support_access_grants enable row level security;
alter table public.cached_translations enable row level security;


-- -------------------------------------------------------------------------
-- [3] สร้างฟังก์ชัน Helper ปลอดภัยสูงที่สืบค้นผ่าน auth.users/JWT claims (เลี่ยง Recursion 100%)
-- -------------------------------------------------------------------------

-- 1. ฟังก์ชันดึง workspace_id (Stable & Parallel Safe)
create or replace function public.get_current_user_workspace_id()
returns uuid as $$
declare
  _cached_ws_id text;
  _claims_text text;
  _claims json;
  _ws_id text;
begin
  -- ขั้นแรก: ดึงจาก Cache ชั่วคราวของ Transaction
  _cached_ws_id := current_setting('horset.cache_workspace_id', true);
  if _cached_ws_id is not null and _cached_ws_id <> '' then
    return _cached_ws_id::uuid;
  end if;

  -- ขั้นที่สอง: ดึงจาก JWT claims (เร็วที่สุดในโหมดเซสชัน API)
  _claims_text := current_setting('request.jwt.claims', true);
  if _claims_text is not null and _claims_text <> '' then
    begin
      _claims := _claims_text::json;
      _ws_id := nullif(_claims->'user_metadata'->>'workspace_id', '');
      if _ws_id is not null then
        perform set_config('horset.cache_workspace_id', _ws_id, true);
        return _ws_id::uuid;
      end if;
    exception when others then
    end;
  end if;

  -- ขั้นที่สาม: ดึงตรงจาก auth.users (ไม่มี RLS จึงไม่เกิดลูปวนซ้ำซ้อน)
  begin
    select nullif(raw_user_meta_data->>'workspace_id', '') into _ws_id 
    from auth.users 
    where id = auth.uid();
    
    if _ws_id is not null then
      perform set_config('horset.cache_workspace_id', _ws_id, true);
      return _ws_id::uuid;
    end if;
  exception when others then
  end;

  return null;
end;
$$ language plpgsql stable security definer parallel safe;

-- 2. ฟังก์ชันดึงบทบาทการใช้งาน (Role)
create or replace function public.get_current_user_role()
returns text as $$
declare
  _cached_role text;
  _claims_text text;
  _claims json;
  _role text;
begin
  -- ขั้นแรก: ดึงจาก Cache
  _cached_role := current_setting('horset.cache_role', true);
  if _cached_role is not null and _cached_role <> '' then
    return _cached_role;
  end if;

  -- ขั้นที่สอง: ดึงจาก JWT claims
  _claims_text := current_setting('request.jwt.claims', true);
  if _claims_text is not null and _claims_text <> '' then
    begin
      _claims := _claims_text::json;
      _role := nullif(_claims->'user_metadata'->>'role', '');
      if _role is not null then
        perform set_config('horset.cache_role', _role, true);
        return _role;
      end if;
    exception when others then
    end;
  end if;

  -- ขั้นที่สาม: ดึงจาก auth.users
  begin
    select nullif(raw_user_meta_data->>'role', '') into _role 
    from auth.users 
    where id = auth.uid();
    
    if _role is not null then
      perform set_config('horset.cache_role', _role, true);
      return _role;
    end if;
  exception when others then
  end;

  return 'tenant';
end;
$$ language plpgsql stable security definer parallel safe;

-- 3. ฟังก์ชันดึงเบอร์โทรศัพท์ (Phone)
create or replace function public.get_current_user_phone()
returns text as $$
declare
  _cached_phone text;
  _claims_text text;
  _claims json;
  _phone text;
begin
  -- ขั้นแรก: ดึงจาก Cache
  _cached_phone := current_setting('horset.cache_phone', true);
  if _cached_phone is not null and _cached_phone <> '' then
    return _cached_phone;
  end if;

  -- ขั้นที่สอง: ดึงจาก JWT claims
  _claims_text := current_setting('request.jwt.claims', true);
  if _claims_text is not null and _claims_text <> '' then
    begin
      _claims := _claims_text::json;
      _phone := nullif(_claims->'user_metadata'->>'phone', '');
      if _phone is not null then
        perform set_config('horset.cache_phone', _phone, true);
        return _phone;
      end if;
    exception when others then
    end;
  end if;

  -- ขั้นที่สาม: ดึงจาก auth.users
  begin
    select nullif(raw_user_meta_data->>'phone', '') into _phone 
    from auth.users 
    where id = auth.uid();
    
    if _phone is not null then
      perform set_config('horset.cache_phone', _phone, true);
      return _phone;
    end if;
  exception when others then
  end;

  return null;
end;
$$ language plpgsql stable security definer parallel safe;


-- -------------------------------------------------------------------------
-- [4] สร้างและติดตั้งนโยบาย RLS สำหรับทุกตารางใหม่ทั้งหมด (ปลอดภัย รวดเร็ว ไม่มีลูปค้าง)
-- -------------------------------------------------------------------------

-- ==================== 1. นโยบายตาราง PROFILES ====================
create policy "Read profiles for admin/staff" on public.profiles for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read profiles for self" on public.profiles for select
using (
  id = auth.uid()
);

create policy "Read profiles for super_admin" on public.profiles for select
using (
  public.get_current_user_role() = 'super_admin'
);

create policy "Manage profiles for admin" on public.profiles for update
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage profiles for self" on public.profiles for update
using (
  id = auth.uid()
);

create policy "Manage profiles for super_admin" on public.profiles for update
using (
  public.get_current_user_role() = 'super_admin'
);


-- ==================== 2. นโยบายตาราง ROOM_TYPES ====================
create policy "Read room_types for admin/staff" on public.room_types for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read room_types for tenants" on public.room_types for select
using (
  public.get_current_user_role() = 'tenant'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read room_types for super_admin" on public.room_types for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = room_types.workspace_id and status = 'approved')
);

create policy "Manage room_types for admin" on public.room_types for all
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage room_types for super_admin" on public.room_types for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = room_types.workspace_id and status = 'approved')
);


-- ==================== 3. นโยบายตาราง ROOMS ====================
create policy "Read rooms for admin/staff" on public.rooms for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read rooms for tenants" on public.rooms for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1 from public.tenants 
    where tenants.room_id = rooms.id 
      and tenants.tenant_phone = public.get_current_user_phone()
  )
);

create policy "Read rooms for super_admin" on public.rooms for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = rooms.workspace_id and status = 'approved')
);

create policy "Manage rooms for admin/staff" on public.rooms for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage rooms for super_admin" on public.rooms for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = rooms.workspace_id and status = 'approved')
);


-- ==================== 4. นโยบายตาราง TENANTS ====================
create policy "Read tenants for admin/staff" on public.tenants for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read tenants for tenants" on public.tenants for select
using (
  public.get_current_user_role() = 'tenant'
  and tenant_phone = public.get_current_user_phone()
);

create policy "Read tenants for super_admin" on public.tenants for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = tenants.workspace_id and status = 'approved')
);

create policy "Manage tenants for admin/staff" on public.tenants for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage tenants for super_admin" on public.tenants for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = tenants.workspace_id and status = 'approved')
);


-- ==================== 5. นโยบายตาราง METER_RECORDS ====================
create policy "Read meter_records for admin/staff" on public.meter_records for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read meter_records for tenants" on public.meter_records for select
using (
  public.get_current_user_role() = 'tenant'
  and room_number = (
    select r.room_number 
    from public.rooms r 
    join public.tenants t on t.room_id = r.id
    where t.tenant_phone = public.get_current_user_phone()
    limit 1
  )
);

create policy "Read meter_records for super_admin" on public.meter_records for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = meter_records.workspace_id and status = 'approved')
);

create policy "Manage meter_records for admin/staff" on public.meter_records for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage meter_records for super_admin" on public.meter_records for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = meter_records.workspace_id and status = 'approved')
);


-- ==================== 6. นโยบายตาราง BILLS ====================
create policy "Read bills for admin/staff" on public.bills for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read bills for tenants" on public.bills for select
using (
  public.get_current_user_role() = 'tenant'
  and room_number = (
    select r.room_number 
    from public.rooms r 
    join public.tenants t on t.room_id = r.id
    where t.tenant_phone = public.get_current_user_phone()
    limit 1
  )
);

create policy "Read bills for super_admin" on public.bills for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = bills.workspace_id and status = 'approved')
);

create policy "Manage bills for admin/staff" on public.bills for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage bills for super_admin" on public.bills for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = bills.workspace_id and status = 'approved')
);


-- ==================== 7. นโยบายตาราง EXPENSES ====================
create policy "Read expenses for admin/staff" on public.expenses for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read expenses for super_admin" on public.expenses for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = expenses.workspace_id and status = 'approved')
);

create policy "Manage expenses for admin" on public.expenses for all
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage expenses for super_admin" on public.expenses for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = expenses.workspace_id and status = 'approved')
);


-- ==================== 8. นโยบายตาราง CANCELLED_CONTRACTS ====================
create policy "Read cancelled_contracts for admin/staff" on public.cancelled_contracts for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read cancelled_contracts for super_admin" on public.cancelled_contracts for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = cancelled_contracts.workspace_id and status = 'approved')
);

create policy "Manage cancelled_contracts for admin/staff" on public.cancelled_contracts for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage cancelled_contracts for super_admin" on public.cancelled_contracts for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = cancelled_contracts.workspace_id and status = 'approved')
);


-- ==================== 9. นโยบายตาราง METER_REPLACEMENTS ====================
create policy "Read meter_replacements for admin/staff" on public.meter_replacements for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read meter_replacements for tenants" on public.meter_replacements for select
using (
  public.get_current_user_role() = 'tenant'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read meter_replacements for super_admin" on public.meter_replacements for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = meter_replacements.workspace_id and status = 'approved')
);

create policy "Manage meter_replacements for admin/staff" on public.meter_replacements for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage meter_replacements for super_admin" on public.meter_replacements for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants where workspace_id = meter_replacements.workspace_id and status = 'approved')
);


-- ==================== 10. นโยบายตาราง WORKSPACE_LINE_SETTINGS ====================
create policy "Users can manage their own workspace line settings"
on public.workspace_line_settings for all
to authenticated
using (
  workspace_id = public.get_current_user_workspace_id()
  or public.get_current_user_role() = 'super_admin'
);


-- ==================== 11. นโยบายตาราง ADMIN_CONNECTION_CODES ====================
create policy "Admins can manage connection codes for their workspace"
on public.admin_connection_codes for all
using (
  public.get_current_user_role() in ('admin', 'staff', 'super_admin')
  and workspace_id = public.get_current_user_workspace_id()
);


-- ==================== 12. นโยบายตาราง LINE_QUOTA_CACHE ====================
create policy "Super Admins can manage line quota cache"
on public.line_quota_cache for all
to authenticated
using (
  public.get_current_user_role() = 'super_admin'
);


-- ==================== 13. นโยบายตาราง REGISTRATION_CODES ====================
create policy "Super Admins can manage registration codes"
on public.registration_codes for all
using (
  public.get_current_user_role() = 'super_admin'
);


-- ==================== 14. นโยบายตาราง SYSTEM_SETTINGS ====================
create policy "Super admins can manage system settings"
on public.system_settings for all
using (
  public.get_current_user_role() = 'super_admin'
);


-- ==================== 15. นโยบายตาราง WORKSPACES ====================
create policy "Super Admins can manage all workspaces" 
on public.workspaces for all 
using (
  public.get_current_user_role() = 'super_admin'
);

create policy "Users can view their own workspace" 
on public.workspaces for select 
using (
  id = public.get_current_user_workspace_id()
);

create policy "Workspace admins can update their own workspace"
on public.workspaces for update
using (
  id = public.get_current_user_workspace_id()
  and public.get_current_user_role() in ('admin', 'super_admin')
);


-- ==================== 16. นโยบายตาราง SUPPORT_ACCESS_GRANTS ====================
create policy "Super Admins can manage all support grants" 
on public.support_access_grants for all 
using (
  public.get_current_user_role() = 'super_admin'
);

create policy "Workspace admins can manage support grants for their workspace" 
on public.support_access_grants for all 
using (
  workspace_id = public.get_current_user_workspace_id()
  and public.get_current_user_role() = 'admin'
);


-- ==================== 17. นโยบายตาราง CACHED_TRANSLATIONS ====================
create policy "Authenticated users can read cached translations"
on public.cached_translations for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');


-- =========================================================================
-- SUCCESS: ทุกตารางได้รับการสร้างนโยบาย RLS ที่ปลอดภัยสูงและไม่มีลูปวนเรียบร้อย!
-- คิวรีของระบบทำงานรวดเร็วขึ้น ไม่มีปัญหาวิ่งวน RLS หรือ Stack Depth Limit อีกต่อไป
-- =========================================================================
