-- =========================================================================
-- HorSet Multi-Workspace (Multi-Tenancy) & Support Access SQL Schema
-- Copy and paste this script into your Supabase SQL Editor to set up.
-- =========================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Create Workspaces Table
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Seed Default Workspaces (For existing users/data)
insert into public.workspaces (id, name) values
('d290f1ee-6c54-4b01-90e6-d701748f0851', 'แสนสุข แมนชั่น (Default Workspace)'),
('e390f1ee-6c54-4b01-90e6-d701748f0852', 'ร่มรื่น เรสซิเดนท์ (Demo Workspace 2)')
on conflict (id) do nothing;

-- 2. Modify profiles Table to Support 'super_admin' Role and 'workspace_id'
-- First, drop the existing role check constraint
alter table public.profiles drop constraint if exists profiles_role_check;

-- Add updated role check constraint (including 'super_admin')
alter table public.profiles add constraint profiles_role_check check (role in ('super_admin', 'admin', 'staff', 'tenant'));

-- Add workspace_id to profiles
alter table public.profiles add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

-- Associate existing admin/staff with default workspace
update public.profiles 
set workspace_id = 'd290f1ee-6c54-4b01-90e6-d701748f0851' 
where workspace_id is null;

-- 3. Add workspace_id Column to All Tenant-Specific Tables
alter table public.room_types add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.rooms add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.tenants add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.meter_records add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.bills add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.expenses add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Associate existing rows with Default Workspace
update public.room_types set workspace_id = 'd290f1ee-6c54-4b01-90e6-d701748f0851' where workspace_id is null;
update public.rooms set workspace_id = 'd290f1ee-6c54-4b01-90e6-d701748f0851' where workspace_id is null;
update public.tenants set workspace_id = 'd290f1ee-6c54-4b01-90e6-d701748f0851' where workspace_id is null;
update public.meter_records set workspace_id = 'd290f1ee-6c54-4b01-90e6-d701748f0851' where workspace_id is null;
update public.bills set workspace_id = 'd290f1ee-6c54-4b01-90e6-d701748f0851' where workspace_id is null;
update public.expenses set workspace_id = 'd290f1ee-6c54-4b01-90e6-d701748f0851' where workspace_id is null;

-- 4. Create Support Access Grants Table
create table if not exists public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null unique,
  requested_by uuid references public.profiles(id) on delete set null,
  granted_by uuid references public.profiles(id) on delete set null,
  status text check (status in ('pending', 'approved', 'revoked')) not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- =========================================================================
-- 5. Trigger to Automatically Populate workspace_id on New Inserts
-- =========================================================================
create or replace function public.populate_workspace_id()
returns trigger as $$
begin
  if new.workspace_id is null then
    -- Find the creator's workspace_id from profiles
    new.workspace_id := (select workspace_id from public.profiles where id = auth.uid() limit 1);
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Attach BEFORE INSERT triggers to tables
drop trigger if exists trg_room_types_workspace on public.room_types;
create trigger trg_room_types_workspace
  before insert on public.room_types
  for each row execute procedure public.populate_workspace_id();

drop trigger if exists trg_rooms_workspace on public.rooms;
create trigger trg_rooms_workspace
  before insert on public.rooms
  for each row execute procedure public.populate_workspace_id();

drop trigger if exists trg_tenants_workspace on public.tenants;
create trigger trg_tenants_workspace
  before insert on public.tenants
  for each row execute procedure public.populate_workspace_id();

drop trigger if exists trg_meter_records_workspace on public.meter_records;
create trigger trg_meter_records_workspace
  before insert on public.meter_records
  for each row execute procedure public.populate_workspace_id();

drop trigger if exists trg_bills_workspace on public.bills;
create trigger trg_bills_workspace
  before insert on public.bills
  for each row execute procedure public.populate_workspace_id();

drop trigger if exists trg_expenses_workspace on public.expenses;
create trigger trg_expenses_workspace
  before insert on public.expenses
  for each row execute procedure public.populate_workspace_id();


-- =========================================================================
-- 6. Set up Row Level Security (RLS) & Policies
-- =========================================================================

-- Enable RLS on new tables
alter table public.workspaces enable row level security;
alter table public.support_access_grants enable row level security;

-- Drop all old policies to avoid duplicate name conflicts
drop policy if exists "Admin has full access on room_types" on public.room_types;
drop policy if exists "Allow read-only of room_types for authenticated users" on public.room_types;
drop policy if exists "Admin has full access on rooms" on public.rooms;
drop policy if exists "Staff can read and update rooms" on public.rooms;
drop policy if exists "Tenant can view their own room" on public.rooms;
drop policy if exists "Admin has full access on tenants" on public.tenants;
drop policy if exists "Staff can read and update tenants" on public.tenants;
drop policy if exists "Tenant can view their own tenant profile" on public.tenants;
drop policy if exists "Admin has full access on meter_records" on public.meter_records;
drop policy if exists "Staff can read, insert and update meter_records" on public.meter_records;
drop policy if exists "Tenant can view their own room's meter records" on public.meter_records;
drop policy if exists "Admin has full access on bills" on public.bills;
drop policy if exists "Staff can read, insert and update bills" on public.bills;
drop policy if exists "Tenant can view their own bills" on public.bills;
drop policy if exists "Admin has full access on expenses" on public.expenses;

-- Drop new multi-workspace policies if they already exist (to make script re-runnable)
drop policy if exists "Super Admins can manage all workspaces" on public.workspaces;
drop policy if exists "Users can view their own workspace" on public.workspaces;
drop policy if exists "Super Admins can manage all support grants" on public.support_access_grants;
drop policy if exists "Workspace admins can manage support grants for their workspace" on public.support_access_grants;
drop policy if exists "Read room_types in workspace or support approved" on public.room_types;
drop policy if exists "Manage room_types in workspace or support approved" on public.room_types;
drop policy if exists "Read rooms in workspace or support approved" on public.rooms;
drop policy if exists "Manage rooms in workspace or support approved" on public.rooms;
drop policy if exists "Read tenants in workspace or support approved" on public.tenants;
drop policy if exists "Manage tenants in workspace or support approved" on public.tenants;
drop policy if exists "Read meter_records in workspace or support approved" on public.meter_records;
drop policy if exists "Manage meter_records in workspace or support approved" on public.meter_records;
drop policy if exists "Read bills in workspace or support approved" on public.bills;
drop policy if exists "Manage bills in workspace or support approved" on public.bills;
drop policy if exists "Read expenses in workspace or support approved" on public.expenses;
drop policy if exists "Manage expenses in workspace or support approved" on public.expenses;


-- ==================== WORKSPACES POLICIES ====================
create policy "Super Admins can manage all workspaces" 
on public.workspaces for all 
using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
);

create policy "Users can view their own workspace" 
on public.workspaces for select 
using (
  id = (select workspace_id from public.profiles where id = auth.uid())
);

-- ==================== SUPPORT GRANTS POLICIES ====================
create policy "Super Admins can manage all support grants" 
on public.support_access_grants for all 
using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
);

create policy "Workspace admins can manage support grants for their workspace" 
on public.support_access_grants for all 
using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ==================== ROOM TYPES POLICIES ====================
create policy "Read room_types in workspace or support approved" 
on public.room_types for select 
using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = room_types.workspace_id and status = 'approved')
  )
);

create policy "Manage room_types in workspace or support approved" 
on public.room_types for all 
using (
  (workspace_id = (select workspace_id from public.profiles where id = auth.uid()) and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = room_types.workspace_id and status = 'approved')
  )
);

-- ==================== ROOMS POLICIES ====================
create policy "Read rooms in workspace or support approved" 
on public.rooms for select 
using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = rooms.workspace_id and status = 'approved')
  )
  or (
    -- Tenants can view their own room
    exists (
      select 1 from public.tenants 
      where tenants.room_id = rooms.id 
        and tenants.tenant_phone = (select phone from public.profiles where profiles.id = auth.uid() limit 1)
    )
  )
);

create policy "Manage rooms in workspace or support approved" 
on public.rooms for all 
using (
  (workspace_id = (select workspace_id from public.profiles where id = auth.uid()) and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff')))
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = rooms.workspace_id and status = 'approved')
  )
);

-- ==================== TENANTS POLICIES ====================
create policy "Read tenants in workspace or support approved" 
on public.tenants for select 
using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = tenants.workspace_id and status = 'approved')
  )
  or (
    -- Tenants can view their own tenant profile
    tenant_phone = (select phone from public.profiles where profiles.id = auth.uid() limit 1)
  )
);

create policy "Manage tenants in workspace or support approved" 
on public.tenants for all 
using (
  (workspace_id = (select workspace_id from public.profiles where id = auth.uid()) and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff')))
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = tenants.workspace_id and status = 'approved')
  )
);

-- ==================== METER RECORDS POLICIES ====================
create policy "Read meter_records in workspace or support approved" 
on public.meter_records for select 
using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = meter_records.workspace_id and status = 'approved')
  )
  or (
    -- Tenants can view their own meter records
    room_number = (
      select r.room_number 
      from public.rooms r 
      join public.tenants t on t.room_id = r.id
      join public.profiles p on p.phone = t.tenant_phone
      where p.id = auth.uid() 
      limit 1
    )
  )
);

create policy "Manage meter_records in workspace or support approved" 
on public.meter_records for all 
using (
  (workspace_id = (select workspace_id from public.profiles where id = auth.uid()) and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff')))
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = meter_records.workspace_id and status = 'approved')
  )
);

-- ==================== BILLS POLICIES ====================
create policy "Read bills in workspace or support approved" 
on public.bills for select 
using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = bills.workspace_id and status = 'approved')
  )
  or (
    -- Tenants can view their own bills
    room_number = (
      select r.room_number 
      from public.rooms r 
      join public.tenants t on t.room_id = r.id
      join public.profiles p on p.phone = t.tenant_phone
      where p.id = auth.uid() 
      limit 1
    )
  )
);

create policy "Manage bills in workspace or support approved" 
on public.bills for all 
using (
  (workspace_id = (select workspace_id from public.profiles where id = auth.uid()) and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff')))
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = bills.workspace_id and status = 'approved')
  )
);

-- ==================== EXPENSES POLICIES ====================
create policy "Read expenses in workspace or support approved" 
on public.expenses for select 
using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = expenses.workspace_id and status = 'approved')
  )
);

create policy "Manage expenses in workspace or support approved" 
on public.expenses for all 
using (
  (workspace_id = (select workspace_id from public.profiles where id = auth.uid()) and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  or (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
    and exists (select 1 from public.support_access_grants where workspace_id = expenses.workspace_id and status = 'approved')
  )
);

-- =========================================================================
-- 7. Trigger for profiles: sync workspace_id during new user sign up
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  default_ws_id uuid;
begin
  -- Get default workspace or create a default one
  select id into default_ws_id from public.workspaces order by created_at limit 1;
  
  insert into public.profiles (id, email, role, full_name, phone, workspace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'tenant'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'workspace_id')::uuid, default_ws_id)
  );
  return new;
end;
$$ language plpgsql security definer;


-- =========================================================================
-- 8. Create Registration Secret Codes Table
-- =========================================================================
create table if not exists public.registration_codes (
  code text primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  role text check (role in ('admin', 'staff', 'tenant')) not null default 'tenant',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  is_used boolean not null default false,
  used_by_email text
);

-- Enable RLS
alter table public.registration_codes enable row level security;

-- Drop policies if they exist (safe now because table exists)
drop policy if exists "Super Admins can manage registration codes" on public.registration_codes;
drop policy if exists "Anyone can read registration codes for verification" on public.registration_codes;

-- Policies for registration_codes
create policy "Super Admins can manage registration codes"
on public.registration_codes for all
using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
);

create policy "Anyone can read registration codes for verification"
on public.registration_codes for select
using (true);

