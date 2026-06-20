-- HorSet Database Schema SQL
-- Copy and paste this script into your Supabase SQL Editor to set up the database.

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =========================================================================
-- 1. Create Tables First (to prevent dependency errors)
-- =========================================================================

-- Profiles Table (Linked to Supabase Auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role text check (role in ('admin', 'staff', 'tenant')) not null default 'tenant',
  full_name text,
  phone text,
  tfa_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Room Types Table (Air Conditioning, Fan, etc.)
create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_rent numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Rooms Table (Linked to Room Types)
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique,
  room_type_id uuid references public.room_types(id) on delete set null,
  status text check (status in ('occupied', 'available')) not null default 'available',
  base_rent numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Tenants Table (Linked to Rooms)
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete set null,
  tenant_name text not null,
  tenant_phone text,
  line_user_id text,
  lease_start date,
  lease_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Meter Records Table
create table public.meter_records (
  id uuid primary key default gen_random_uuid(),
  room_number text not null,
  billing_cycle text not null,
  elec_prev numeric not null default 0,
  elec_curr numeric not null default 0,
  water_prev numeric not null default 0,
  water_curr numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Bills Table
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  room_number text not null,
  tenant_name text not null,
  amount numeric not null default 0,
  status text check (status in ('unpaid', 'pending', 'paid')) not null default 'unpaid',
  billing_cycle text not null,
  slip_url text,
  electric_units numeric not null default 0,
  water_units numeric not null default 0,
  penalty_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Expenses Table
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric not null default 0,
  tax_year text not null,
  category text check (category in ('40_5', '40_8')),
  created_at timestamptz not null default now()
);

-- Seed Default Room Types
insert into public.room_types (name, default_rent) values
('ห้องแอร์', 4500),
('ห้องพัดลม', 3500)
on conflict (name) do update set default_rent = excluded.default_rent;

-- =========================================================================
-- 2. Enable Row Level Security (RLS) on All Tables
-- =========================================================================
alter table public.profiles enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.tenants enable row level security;
alter table public.meter_records enable row level security;
alter table public.bills enable row level security;
alter table public.expenses enable row level security;

-- =========================================================================
-- 3. Create Database Indexes
-- =========================================================================
create index idx_meter_records_cycle_room on public.meter_records (billing_cycle, room_number);
create index idx_bills_cycle_room on public.bills (billing_cycle, room_number);

-- =========================================================================
-- 4. Create RLS Policies
-- =========================================================================

-- Profiles Policies
create policy "Allow public read-only of profiles for authenticated users" 
on public.profiles for select 
using (auth.role() = 'authenticated');

create policy "Allow users to update their own profile" 
on public.profiles for update 
using (auth.uid() = id);

-- Room Types Policies
create policy "Allow read-only of room_types for authenticated users"
on public.room_types for select
using (auth.role() = 'authenticated');

create policy "Admin has full access on room_types"
on public.room_types for all
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

-- Rooms Policies
create policy "Admin has full access on rooms" 
on public.rooms for all 
using (
  exists (
    select 1 from public.profiles 
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

create policy "Staff can read and update rooms" 
on public.rooms for select 
using (
  exists (
    select 1 from public.profiles 
    where profiles.id = auth.uid() and profiles.role in ('admin', 'staff')
  )
);

create policy "Tenant can view their own room" 
on public.rooms for select 
using (
  exists (
    select 1 from public.tenants 
    where tenants.room_id = rooms.id 
      and tenants.tenant_phone = (
        select phone from public.profiles where profiles.id = auth.uid() limit 1
      )
  )
);

-- Tenants Policies
create policy "Admin has full access on tenants" 
on public.tenants for all 
using (
  exists (
    select 1 from public.profiles 
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

create policy "Staff can read and update tenants" 
on public.tenants for select 
using (
  exists (
    select 1 from public.profiles 
    where profiles.id = auth.uid() and profiles.role in ('admin', 'staff')
  )
);

create policy "Tenant can view their own tenant profile" 
on public.tenants for select 
using (
  tenant_phone = (
    select phone from public.profiles where profiles.id = auth.uid() limit 1
  )
);

-- Meter Records Policies
create policy "Admin has full access on meter_records" 
on public.meter_records for all 
using (
  exists (
    select 1 from public.profiles 
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

create policy "Staff can read, insert and update meter_records" 
on public.meter_records for all 
using (
  exists (
    select 1 from public.profiles 
    where profiles.id = auth.uid() and profiles.role in ('admin', 'staff')
  )
);

create policy "Tenant can view their own room's meter records" 
on public.meter_records for select 
using (
  room_number = (
    select r.room_number 
    from public.rooms r 
    join public.tenants t on t.room_id = r.id
    join public.profiles p on p.phone = t.tenant_phone
    where p.id = auth.uid() 
    limit 1
  )
);

-- Bills Policies
create policy "Admin has full access on bills" 
on public.bills for all 
using (
  exists (
    select 1 from public.profiles 
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

create policy "Staff can read, insert and update bills" 
on public.bills for all 
using (
  exists (
    select 1 from public.profiles 
    where profiles.id = auth.uid() and profiles.role in ('admin', 'staff')
  )
);

create policy "Tenant can view their own bills" 
on public.bills for select 
using (
  room_number = (
    select r.room_number 
    from public.rooms r 
    join public.tenants t on t.room_id = r.id
    join public.profiles p on p.phone = t.tenant_phone
    where p.id = auth.uid() 
    limit 1
  )
);

-- Expenses Policies
create policy "Admin has full access on expenses" 
on public.expenses for all 
using (
  exists (
    select 1 from public.profiles 
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

-- =========================================================================
-- 5. Triggers for profiles: sync with auth.users
-- =========================================================================

-- Automatically create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'tenant'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- =========================================================================
-- 6. Add Finance & Tax Setting Columns to workspaces Table
-- =========================================================================
alter table public.workspaces add column if not exists tax_firstname text;
alter table public.workspaces add column if not exists tax_lastname text;
alter table public.workspaces add column if not exists tax_id text;
alter table public.workspaces add column if not exists tax_address text;
alter table public.workspaces add column if not exists tax_phone text;
alter table public.workspaces add column if not exists promptpay_type text check (promptpay_type in ('phone', 'national_id')) default 'phone';
alter table public.workspaces add column if not exists promptpay_id text;
alter table public.workspaces add column if not exists promptpay_name text;
alter table public.workspaces add column if not exists common_fee numeric default 50;
alter table public.workspaces add column if not exists water_rate numeric default 18;
alter table public.workspaces add column if not exists electric_rate numeric default 7;
alter table public.workspaces add column if not exists water_min_checked boolean default true;
alter table public.workspaces add column if not exists water_min_unit numeric default 3;
alter table public.workspaces add column if not exists electric_min_checked boolean default true;
alter table public.workspaces add column if not exists electric_min_unit numeric default 10;

-- Drop policy if it exists
drop policy if exists "Workspace admins can update their own workspace" on public.workspaces;

-- Policies for workspaces update
create policy "Workspace admins can update their own workspace"
on public.workspaces for update
using (
  id = (select workspace_id from public.profiles where id = auth.uid())
  and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin'))
);

