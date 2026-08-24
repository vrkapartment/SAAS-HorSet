------------------------------------------------------------------------------
-- HorSet — ติดตั้งฐานข้อมูลใหม่ตั้งแต่ต้น (schema + patch ทุกไฟล์ รวมเป็นไฟล์เดียว)
------------------------------------------------------------------------------
--
-- ไฟล์นี้สร้างอัตโนมัติจาก scripts/build-staging-sql.mjs — ห้ามแก้ไฟล์นี้ตรง ๆ
-- ถ้าต้องแก้ ให้แก้ไฟล์ต้นทางแล้วรัน `npm run build:sql` ใหม่
--
-- ใช้กับ: ฐานข้อมูลเปล่าที่เพิ่งสร้าง (เช่น Supabase project สำหรับ staging/ทดสอบ)
--
-- ⚠️ ห้ามรันกับ production ที่มีข้อมูลอยู่แล้ว — ให้รัน patch แยกไฟล์ทีละตัวตามปกติ
--    ทุกคำสั่งเขียนแบบรันซ้ำได้ (if not exists) แต่ชุด identity_2 มีการ DROP constraint
--    ซึ่งถ้ารันตอนโค้ดเวอร์ชันเก่ายังทำงานอยู่ การออกบิลจะพังทันที
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปวางใน Supabase SQL Editor แล้วกด Run ครั้งเดียว
--         ถ้าเจอ error ให้ดูว่า error อยู่ในส่วนของไฟล์ไหน (มีหัวข้อคั่นไว้ทุกไฟล์)
--
-- รวม 20 ไฟล์:
--   1. schema_multi_workspace.sql  (สคีมาหลัก)
--   2. database_patch_fix_handle_new_user_workspace_fallback.sql
--   3. database_patch_add_vat_pp30.sql
--   4. database_patch_add_pp30_output_vat_manual.sql
--   5. database_patch_add_building_utility_billing.sql
--   6. database_patch_add_staff_building_access.sql
--   7. database_patch_add_tenant_room_transfers.sql
--   8. database_patch_add_meter_entry_mode.sql
--   9. database_patch_add_room_id_to_meters_bills.sql
--   10. database_patch_fix_tenant_rls_scope.sql
--   11. database_patch_room_id_identity_1_additive.sql
--   12. database_patch_room_id_identity_2_switch.sql
--   13. database_patch_room_id_identity_3_close_null_building_gap.sql
--   14. database_patch_add_bill_snapshot.sql
--   15. database_patch_add_saas_payments_manual_review.sql
--   16. database_patch_add_saas_payments_archived_drive_url.sql
--   17. database_patch_add_super_admin_line_settings.sql
--   18. database_patch_add_super_admin_line_connection.sql
--   19. database_patch_add_super_admin_line_quota_behavior.sql
--   20. database_patch_add_workspace_google_drive_settings.sql
------------------------------------------------------------------------------


------------------------------------------------------------------------------
-- [1/20]  schema_multi_workspace.sql
------------------------------------------------------------------------------

-- =========================================================================
-- HorSet SaaS Multi-Workspace Database Schema (Consolidated Master Schema)
-- =========================================================================
-- This script contains the complete, up-to-date master schema for HorSet.
-- Copy and paste this script into your Supabase SQL Editor to set up the entire
-- database from scratch (including all patches, optimizations, triggers, 
-- indexes, and ultra-secure split RLS policies).
-- =========================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =========================================================================
-- 1. Create Core Tables
-- =========================================================================

-- Workspaces Table (Multi-Tenancy)
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  checkout_policy varchar(50) default 'DAILY_PRORATE',
  deposit_amount numeric default 0,
  advance_rent numeric default 0,
  late_penalty_rate numeric default 0,
  tax_firstname text,
  tax_lastname text,
  tax_id text,
  tax_address text,
  tax_phone text,
  promptpay_type text check (promptpay_type in ('phone', 'national_id')) default 'phone',
  promptpay_id text,
  promptpay_name text,
  common_fee numeric default 50,
  water_rate numeric default 18,
  electric_rate numeric default 7,
  water_min_checked boolean default true,
  water_min_unit numeric default 3,
  electric_min_checked boolean default true,
  electric_min_unit numeric default 10,
  deposit_type text check (deposit_type in ('months', 'fixed')) default 'months',
  taxpayer_status text check (taxpayer_status in ('individual', 'partnership')) default 'individual',
  partner_count integer default 1,
  tax_address_building text,
  tax_address_room text,
  tax_address_floor text,
  tax_address_village text,
  tax_address_moo text,
  tax_address_soi text,
  tax_address_yaek text,
  lease_duration integer default 6,
  lease_expiry_action varchar(50) default 'renew' check (lease_expiry_action in ('renew', 'original')),
  slip_retention_months integer default 1,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Profiles Table (Linked to Supabase Auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role text check (role in ('super_admin', 'admin', 'staff', 'tenant')) not null default 'tenant',
  full_name text,
  phone text,
  tfa_enabled boolean not null default false,
  workspace_id uuid references public.workspaces(id) on delete set null,
  permissions jsonb default '{"view_dashboard_stats": false, "manage_rooms_tenants": true, "manage_meters_bills": true, "manage_finance_expenses": false, "access_tax": false, "manage_finance_settings": false, "manage_staff_permissions": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- SaaS Plans Table (trial, starter, pro, business)
create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('trial', 'starter', 'pro', 'business')),
  name text not null,
  price_monthly numeric not null default 0,
  price_yearly numeric,
  max_rooms integer, -- null = unlimited
  max_staff integer, -- null = unlimited
  max_buildings integer, -- null = unlimited
  features jsonb not null default '{}'::jsonb, -- { line_notify, tax_export, slipok_auto_verify }
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Buildings Table
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Room Types Table
create table if not exists public.room_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  default_rent numeric not null default 0,
  deposit_amount numeric default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint room_types_workspace_id_name_key unique (workspace_id, name)
);

-- Rooms Table
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  room_number text not null,
  room_type_id uuid references public.room_types(id) on delete set null,
  status text check (status in ('occupied', 'available', 'Pending_Refund')) not null default 'available',
  base_rent numeric not null default 0,
  extra_expenses jsonb default '[]'::jsonb,
  floor text,
  building_id uuid references public.buildings(id) on delete set null,
  waive_electric_min boolean default false,
  waive_water_min boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint rooms_workspace_id_room_number_key unique (workspace_id, room_number)
);

-- Tenants Table
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
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
create table if not exists public.meter_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  room_number text not null,
  billing_cycle text not null,
  elec_prev numeric not null default 0,
  elec_curr numeric, -- nullable to support mid-month decouple/replacements
  water_prev numeric not null default 0,
  water_curr numeric, -- nullable to support mid-month decouple/replacements
  created_at timestamptz not null default now(),
  constraint meter_records_workspace_room_cycle_key unique (workspace_id, room_number, billing_cycle)
);

-- Bills Table
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  room_number text not null,
  tenant_name text not null,
  amount numeric not null default 0,
  status text check (status in ('unpaid', 'pending', 'paid')) not null default 'unpaid',
  billing_cycle text not null,
  slip_url text,
  electric_units numeric not null default 0,
  water_units numeric not null default 0,
  penalty_amount numeric not null default 0,
  late_days integer not null default 0,
  other_service_amount numeric not null default 0,
  invoice_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint bills_workspace_id_invoice_id_key unique (workspace_id, invoice_id)
);

-- Expenses Table
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  title text not null,
  amount numeric not null default 0,
  tax_year text not null,
  category text check (category in ('40_5', '40_8')),
  created_at timestamptz not null default now()
);

-- Cancelled Contracts Table (Historical records of checked out tenants)
create table if not exists public.cancelled_contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  tenant_id uuid,
  room_number varchar(50),
  tenant_name varchar(255),
  cancellation_date varchar(50),
  deposit_amount numeric default 0,
  refunded_amount numeric default 0,
  actual_refund numeric default 0,
  forfeited_amount numeric default 0,
  deducted_rent_405 numeric default 0,
  deducted_utilities_408 numeric default 0,
  deducted_services_408 numeric default 0,
  created_at timestamptz default now()
);

-- Support Access Grants Table
create table if not exists public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null unique,
  requested_by uuid references public.profiles(id) on delete set null,
  granted_by uuid references public.profiles(id) on delete set null,
  status text check (status in ('pending', 'approved', 'revoked')) not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Tenants Old Table (Archived tenant profiles)
create table if not exists public.tenants_old (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  tenant_id uuid,
  room_id uuid,
  room_number varchar(50),
  tenant_name varchar(255) not null,
  tenant_phone varchar(50),
  line_user_id varchar(255),
  lease_start date,
  lease_end date,
  moved_out_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Bills Deleted Table (Audit log and archive for deleted bills)
create table if not exists public.bills_deleted (
  id uuid primary key default gen_random_uuid(),
  original_bill_id uuid,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  room_number text,
  tenant_name text,
  amount numeric,
  status text,
  billing_cycle text,
  slip_url text,
  electric_units numeric,
  water_units numeric,
  penalty_amount numeric,
  late_days integer,
  other_service_amount numeric,
  invoice_id text,
  bill_created_at timestamptz,
  bill_updated_at timestamptz,
  deleted_at timestamptz default now()
);

-- Meter Replacements Table
create table if not exists public.meter_replacements (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  room_number text not null,
  billing_cycle text not null,
  meter_type text not null check (meter_type in ('electric', 'water')),
  old_final_reading numeric not null,
  new_start_reading numeric not null,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint meter_replacements_workspace_id_room_cycle_type_key unique (workspace_id, room_number, billing_cycle, meter_type)
);

-- Workspace LINE Settings Table
create table if not exists public.workspace_line_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  channel_access_token text,
  liff_id text,
  limit_count integer not null default 1000,
  consumed_count integer not null default 0,
  remaining_count integer not null default 1000,
  percentage_used integer not null default 0,
  bot_name text default 'LINE OA ของหอพัก',
  bot_basic_id text default '@line_oa',
  admin_line_user_id text,
  admin_line_group_id text,
  channel_secret text,
  admin_notification_active boolean not null default true,
  disabled_admin_line_user_ids text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Workspace SlipOK Settings Table
create table if not exists public.workspace_slipok_settings (
  workspace_id uuid references public.workspaces(id) on delete cascade primary key,
  branch_id text,
  api_key_encrypted text,
  enabled boolean default true,
  check_amount boolean default true,
  check_receiver boolean default true,
  auto_disable_on_quota_exceeded boolean default true,
  monthly_package_quota numeric not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Admin LINE Connection Codes Table
create table if not exists public.admin_connection_codes (
  code text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  is_used boolean not null default false
);

-- LINE Quota Cache Table (Global limit tracking fallback)
create table if not exists public.line_quota_cache (
  id integer primary key default 1 check (id = 1),
  channel_access_token text,
  limit_count integer not null default 1000,
  consumed_count integer not null default 0,
  remaining_count integer not null default 1000,
  percentage_used integer not null default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Registration Secret Codes Table
create table if not exists public.registration_codes (
  code text primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  role text check (role in ('admin', 'staff', 'tenant')) not null default 'tenant',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  is_used boolean not null default false,
  used_by_email text
);

-- System Settings Table
create table if not exists public.system_settings (
  id uuid default gen_random_uuid() primary key,
  key text not null unique,
  value text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Cached Translations Table
create table if not exists public.cached_translations (
  id uuid default gen_random_uuid() primary key,
  source_text text not null,
  target_language varchar(10) not null,
  translated_text text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(source_text, target_language)
);

-- Tax Form Templates Table (Global definitions of PDF form schemas)
create table if not exists public.tax_form_templates (
  id uuid default gen_random_uuid() primary key,
  form_type text not null check (form_type in ('90', '94')),
  tax_year text,                 -- NULL for '90' template, required for '94'
  file_url text not null,
  file_name text,
  is_bundled_default boolean not null default false,
  updated_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tax Form Field Mappings Table (Form physical field <-> logical property)
create table if not exists public.tax_form_field_mappings (
  id uuid default gen_random_uuid() primary key,
  template_id uuid not null references public.tax_form_templates(id) on delete cascade,
  logical_key text not null,
  field_kind text not null check (field_kind in ('text', 'radio')),
  physical_field_name text not null,
  option_key text,
  widget_index smallint,
  value_format text check (value_format in ('raw', 'comb', 'plain_decimal')),
  updated_by uuid references public.profiles(id),
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint chk_text_fields check (
    field_kind <> 'text' or (option_key is null and widget_index is null and value_format is not null)
  ),
  constraint chk_radio_fields check (
    field_kind <> 'radio' or (option_key is not null and widget_index is not null)
  )
);

-- SlipOK Retry Queue Table (Handles temporary bank issues auto-recovery)
create table if not exists public.slipok_retry_queue (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  workspace_id uuid not null,
  slip_url text not null,
  amount numeric,
  status text not null check (status in ('pending', 'succeeded', 'failed', 'cancelled')) default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_retry_at timestamptz not null,
  last_error_code integer,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SaaS Payments Table (SaaS subscription payment invoices)
create table if not exists public.saas_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id uuid not null references public.saas_plans(id),
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')) default 'monthly',
  amount numeric not null,
  slip_image_url text,
  status text not null check (status in ('pending', 'verified', 'failed')) default 'pending',
  slipok_response jsonb,
  payment_method text not null check (payment_method in ('slipok_manual', 'gateway')) default 'slipok_manual',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- SaaS Payment Retry Queue Table
create table if not exists public.saas_payment_retry_queue (
  id uuid primary key default gen_random_uuid(),
  saas_payment_id uuid not null references public.saas_payments(id) on delete cascade,
  workspace_id uuid not null,
  slip_url text not null,
  amount numeric,
  status text not null check (status in ('pending', 'succeeded', 'failed', 'cancelled')) default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_retry_at timestamptz not null,
  last_error_code integer,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Workspace Subscriptions Table
create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  plan_id uuid not null references public.saas_plans(id),
  status text not null check (status in ('trial', 'active', 'past_due', 'read_only', 'cancelled')) default 'trial',
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')) default 'monthly',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =========================================================================
-- 2. Create Comments
-- =========================================================================
comment on table public.cancelled_contracts is 'Stores historical lease termination and forfeited/refunded deposit tax records';
comment on table public.tenants_old is 'Stores archived/historical tenant records who have checked out or moved out';
comment on table public.bills_deleted is 'Stores archived bills that were deleted, for recovery/audit purposes';
comment on table public.admin_connection_codes is 'Temporary 5-minute codes to allow LINE Admins to bind their LINE UID automatically by sending the code to the bot';
comment on table public.workspace_line_settings is 'Stores the cached LINE OA Messaging API settings and quota data per workspace (multi-tenant).';
comment on table public.line_quota_cache is 'Stores the cached LINE OA Messaging API quota data and configuration (securely managed by Super Admins).';
comment on column public.profiles.permissions is 'Stores staff/user permissions as a JSON object';
comment on column public.workspaces.lease_duration is 'Default lease duration in months for new tenant contracts';
comment on column public.workspaces.lease_expiry_action is 'Default action upon lease contract expiry: renew or original';


-- =========================================================================
-- 3. Create General Triggers, Triggers functions, and Seeding
-- =========================================================================

-- Trigger to Automatically Populate workspace_id on New Inserts
create or replace function public.populate_workspace_id()
returns trigger as $$
begin
  if new.workspace_id is null then
    new.workspace_id := public.get_current_user_workspace_id();
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

drop trigger if exists trg_cancelled_contracts_workspace on public.cancelled_contracts;
create trigger trg_cancelled_contracts_workspace
  before insert on public.cancelled_contracts
  for each row execute procedure public.populate_workspace_id();

drop trigger if exists trg_tenants_old_workspace on public.tenants_old;
create trigger trg_tenants_old_workspace
  before insert on public.tenants_old
  for each row execute procedure public.populate_workspace_id();

drop trigger if exists trg_bills_deleted_workspace on public.bills_deleted;
create trigger trg_bills_deleted_workspace
  before insert on public.bills_deleted
  for each row execute procedure public.populate_workspace_id();

drop trigger if exists trigger_populate_workspace_id_meter_replacements on public.meter_replacements;
create trigger trigger_populate_workspace_id_meter_replacements
  before insert on public.meter_replacements
  for each row execute procedure public.populate_workspace_id();


-- updated_at Trigger helpers
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_tax_form_templates_updated_at on public.tax_form_templates;
create trigger set_tax_form_templates_updated_at
  before update on public.tax_form_templates
  for each row execute function public.handle_updated_at();

drop trigger if exists set_tax_form_field_mappings_updated_at on public.tax_form_field_mappings;
create trigger set_tax_form_field_mappings_updated_at
  before update on public.tax_form_field_mappings
  for each row execute function public.handle_updated_at();

drop trigger if exists set_system_settings_updated_at on public.system_settings;
create trigger set_system_settings_updated_at
  before update on public.system_settings
  for each row execute function public.handle_updated_at();

drop trigger if exists set_saas_plans_updated_at on public.saas_plans;
create trigger set_saas_plans_updated_at
  before update on public.saas_plans
  for each row execute function public.handle_updated_at();

drop trigger if exists set_buildings_updated_at on public.buildings;
create trigger set_buildings_updated_at
  before update on public.buildings
  for each row execute function public.handle_updated_at();

drop trigger if exists set_workspace_subscriptions_updated_at on public.workspace_subscriptions;
create trigger set_workspace_subscriptions_updated_at
  before update on public.workspace_subscriptions
  for each row execute function public.handle_updated_at();


-- Trigger for profiles: sync workspace_id during new user sign up
-- หมายเหตุ: ห้ามเดา workspace อื่นมาใช้แทนเด็ดขาดถ้า metadata ไม่ได้ส่ง workspace_id มา (เคยมี fallback ไปผูกกับ
-- workspace แรกสุดของระบบซึ่งเป็นช่องโหว่ข้อมูลข้ามหอพัก) ให้เป็น NULL แทน — คอลัมน์นี้ nullable อยู่แล้วและ RLS
-- จะกันไม่ให้เห็นข้อมูลของหอพักไหนเลยถ้าเป็น NULL (fail-safe)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, full_name, phone, workspace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'tenant'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    (new.raw_user_meta_data->>'workspace_id')::uuid
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- Trigger for workspaces: automatically create a default subscription & main building on new workspace creation
create or replace function public.handle_new_workspace_subscription()
returns trigger as $$
begin
  insert into public.workspace_subscriptions (workspace_id, plan_id, status, trial_ends_at)
  values (
    new.id,
    (select id from public.saas_plans where code = 'starter' limit 1),
    'trial',
    now() + interval '30 days'
  )
  on conflict (workspace_id) do nothing;

  insert into public.buildings (workspace_id, name)
  values (new.id, 'อาคารหลัก')
  on conflict do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_new_workspace_subscription on public.workspaces;
create trigger trg_new_workspace_subscription
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace_subscription();


-- =========================================================================
-- 4. Create Performance Indexes
-- =========================================================================
-- Prevent full table scans on multi-tenant columns
create index if not exists idx_profiles_workspace_id on public.profiles (workspace_id);
create index if not exists idx_room_types_workspace_id on public.room_types (workspace_id);
create index if not exists idx_rooms_workspace_id on public.rooms (workspace_id);
create index if not exists idx_tenants_workspace_id on public.tenants (workspace_id);
create index if not exists idx_meter_records_workspace_id on public.meter_records (workspace_id);
create index if not exists idx_bills_workspace_id on public.bills (workspace_id);
create index if not exists idx_expenses_workspace_id on public.expenses (workspace_id);
create index if not exists idx_cancelled_contracts_workspace_id on public.cancelled_contracts (workspace_id);
create index if not exists idx_tenants_old_workspace_id on public.tenants_old (workspace_id);
create index if not exists idx_bills_deleted_workspace_id on public.bills_deleted (workspace_id);

-- Lookup optimization indexes
create index if not exists idx_tenants_room_id on public.tenants (room_id);
create index if not exists idx_tenants_phone on public.tenants (tenant_phone);
create index if not exists idx_rooms_room_type_id on public.rooms (room_type_id);
create index if not exists idx_rooms_floor on public.rooms (floor);
create index if not exists idx_rooms_building_id on public.rooms (building_id);
create index if not exists idx_buildings_workspace_id on public.buildings (workspace_id);
create index if not exists idx_meter_records_cycle_room on public.meter_records (billing_cycle, room_number);
create index if not exists idx_bills_cycle_room on public.bills (billing_cycle, room_number);
create index if not exists idx_tenants_old_tenant_id on public.tenants_old (tenant_id);
create index if not exists idx_bills_deleted_original_bill_id on public.bills_deleted (original_bill_id);
create index if not exists idx_meter_replacements_cycle on public.meter_replacements (billing_cycle);
create index if not exists idx_meter_replacements_room on public.meter_replacements (workspace_id, room_number);
create index if not exists idx_workspace_subscriptions_status on public.workspace_subscriptions (status);
create index if not exists idx_saas_payments_workspace_id on public.saas_payments (workspace_id);
create index if not exists tax_form_field_mappings_template_idx on public.tax_form_field_mappings (template_id) where deleted_at is null;

-- Partial index for active retry queues
create index if not exists idx_slipok_retry_queue_due on public.slipok_retry_queue (status, next_retry_at) where status = 'pending';
create index if not exists idx_saas_payment_retry_queue_due on public.saas_payment_retry_queue (status, next_retry_at) where status = 'pending';
create index if not exists idx_admin_connection_codes_code_unused on public.admin_connection_codes (code) where is_used = false;

-- Unique partial indexes
create unique index if not exists tax_form_templates_94_year_uidx on public.tax_form_templates (tax_year) where form_type = '94';
create unique index if not exists tax_form_field_mappings_text_uidx on public.tax_form_field_mappings (template_id, logical_key) where field_kind = 'text' and deleted_at is null;
create unique index if not exists tax_form_field_mappings_radio_uidx on public.tax_form_field_mappings (template_id, logical_key, option_key) where field_kind = 'radio' and deleted_at is null;


-- =========================================================================
-- 5. Seed Core Configuration Data
-- =========================================================================

-- Seed Default Workspaces
insert into public.workspaces (id, name) values
  ('d290f1ee-6c54-4b01-90e6-d701748f0851', 'แสนสุข แมนชั่น (Default Workspace)'),
  ('e390f1ee-6c54-4b01-90e6-d701748f0852', 'ร่มรื่น เรสซิเดนท์ (Demo Workspace 2)')
on conflict (id) do nothing;

-- Seed Default SaaS Plans
insert into public.saas_plans (code, name, price_monthly, price_yearly, max_rooms, max_staff, max_buildings, features)
values
  ('trial', 'ทดลองใช้ฟรี', 0, 0, null, null, null, '{"line_notify": true, "tax_export": true, "slipok_auto_verify": true}'::jsonb),
  ('starter', 'Starter', 279, 2790, 30, 1, 1, '{"line_notify": true, "tax_export": false, "slipok_auto_verify": false}'::jsonb),
  ('pro', 'Pro', 579, 5790, 100, 5, 1, '{"line_notify": true, "tax_export": true, "slipok_auto_verify": true}'::jsonb),
  ('business', 'Business', 1479, null, 500, null, null, '{"line_notify": true, "tax_export": true, "slipok_auto_verify": true}'::jsonb)
on conflict (code) do update set 
  price_monthly = excluded.price_monthly, 
  price_yearly = excluded.price_yearly,
  features = excluded.features;

-- Seed Default Building for existing workspaces
insert into public.buildings (workspace_id, name)
select w.id, 'อาคารหลัก'
from public.workspaces w
where not exists (select 1 from public.buildings b where b.workspace_id = w.id)
on conflict do nothing;

-- Ensure existing rooms are connected to default building
update public.rooms r
set building_id = b.id
from public.buildings b
where r.building_id is null and b.workspace_id = r.workspace_id and b.name = 'อาคารหลัก';


-- =========================================================================
-- 6. Setup Row Level Security (RLS) & Secure Non-Recursive Split Helpers
-- =========================================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.room_types enable level security;
alter table public.rooms enable row level security;
alter table public.tenants enable row level security;
alter table public.meter_records enable row level security;
alter table public.bills enable row level security;
alter table public.expenses enable row level security;
alter table public.cancelled_contracts enable row level security;
alter table public.support_access_grants enable row level security;
alter table public.tenants_old enable row level security;
alter table public.bills_deleted enable row level security;
alter table public.meter_replacements enable row level security;
alter table public.workspace_line_settings enable row level security;
alter table public.workspace_slipok_settings enable row level security;
alter table public.admin_connection_codes enable row level security;
alter table public.line_quota_cache enable row level security;
alter table public.registration_codes enable row level security;
alter table public.system_settings enable row level security;
alter table public.workspaces enable row level security;
alter table public.cached_translations enable row level security;
alter table public.tax_form_templates enable row level security;
alter table public.tax_form_field_mappings enable row level security;
alter table public.slipok_retry_queue enable row level security;
alter table public.saas_payments enable row level security;
alter table public.saas_payment_retry_queue enable row level security;
alter table public.workspace_subscriptions enable row level security;

-- High-performance RLS Security Definer helpers (Prevents public.profiles recursion completely)
create or replace function public.get_current_user_workspace_id()
returns uuid as $$
declare
  _cached_ws_id text;
  _claims_text text;
  _claims json;
  _ws_id text;
begin
  _cached_ws_id := current_setting('horset.cache_workspace_id', true);
  if _cached_ws_id is not null and _cached_ws_id <> '' then
    return _cached_ws_id::uuid;
  end if;

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

create or replace function public.get_current_user_role()
returns text as $$
declare
  _cached_role text;
  _claims_text text;
  _claims json;
  _role text;
begin
  _cached_role := current_setting('horset.cache_role', true);
  if _cached_role is not null and _cached_role <> '' then
    return _cached_role;
  end if;

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

create or replace function public.get_current_user_phone()
returns text as $$
declare
  _cached_phone text;
  _claims_text text;
  _claims json;
  _phone text;
begin
  _cached_phone := current_setting('horset.cache_phone', true);
  if _cached_phone is not null and _cached_phone <> '' then
    return _cached_phone;
  end if;

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


-- Drop old policies to guarantee no duplicates
drop policy if exists "Read profiles for admin/staff" on public.profiles;
drop policy if exists "Read profiles for self" on public.profiles;
drop policy if exists "Read profiles for super_admin" on public.profiles;
drop policy if exists "Manage profiles for admin" on public.profiles;
drop policy if exists "Manage profiles for self" on public.profiles;
drop policy if exists "Manage profiles for super_admin" on public.profiles;

drop policy if exists "Read room_types for admin/staff" on public.room_types;
drop policy if exists "Read room_types for tenants" on public.room_types;
drop policy if exists "Read room_types for super_admin" on public.room_types;
drop policy if exists "Manage room_types for admin" on public.room_types;
drop policy if exists "Manage room_types for super_admin" on public.room_types;

drop policy if exists "Read rooms for admin/staff" on public.rooms;
drop policy if exists "Read rooms for tenants" on public.rooms;
drop policy if exists "Read rooms for super_admin" on public.rooms;
drop policy if exists "Manage rooms for admin/staff" on public.rooms;
drop policy if exists "Manage rooms for super_admin" on public.rooms;

drop policy if exists "Read tenants for admin/staff" on public.tenants;
drop policy if exists "Read tenants for tenants" on public.tenants;
drop policy if exists "Read tenants for super_admin" on public.tenants;
drop policy if exists "Manage tenants for admin/staff" on public.tenants;
drop policy if exists "Manage tenants for super_admin" on public.tenants;

drop policy if exists "Read meter_records for admin/staff" on public.meter_records;
drop policy if exists "Read meter_records for tenants" on public.meter_records;
drop policy if exists "Read meter_records for super_admin" on public.meter_records;
drop policy if exists "Manage meter_records for admin/staff" on public.meter_records;
drop policy if exists "Manage meter_records for super_admin" on public.meter_records;

drop policy if exists "Read bills for admin/staff" on public.bills;
drop policy if exists "Read bills for tenants" on public.bills;
drop policy if exists "Read bills for super_admin" on public.bills;
drop policy if exists "Manage bills for admin/staff" on public.bills;
drop policy if exists "Manage bills for super_admin" on public.bills;

drop policy if exists "Read expenses for admin/staff" on public.expenses;
drop policy if exists "Read expenses for super_admin" on public.expenses;
drop policy if exists "Manage expenses for admin" on public.expenses;
drop policy if exists "Manage expenses for super_admin" on public.expenses;

drop policy if exists "Read cancelled_contracts for admin/staff" on public.cancelled_contracts;
drop policy if exists "Read cancelled_contracts for super_admin" on public.cancelled_contracts;
drop policy if exists "Manage cancelled_contracts for admin/staff" on public.cancelled_contracts;
drop policy if exists "Manage cancelled_contracts for super_admin" on public.cancelled_contracts;

drop policy if exists "Read tenants_old in workspace or support approved" on public.tenants_old;
drop policy if exists "Manage tenants_old in workspace or support approved" on public.tenants_old;

drop policy if exists "Read bills_deleted in workspace or support approved" on public.bills_deleted;
drop policy if exists "Manage bills_deleted in workspace or support approved" on public.bills_deleted;

drop policy if exists "Read meter_replacements for admin/staff" on public.meter_replacements;
drop policy if exists "Read meter_replacements for tenants" on public.meter_replacements;
drop policy if exists "Read meter_replacements for super_admin" on public.meter_replacements;
drop policy if exists "Manage meter_replacements for admin/staff" on public.meter_replacements;
drop policy if exists "Manage meter_replacements for super_admin" on public.meter_replacements;

drop policy if exists "Users can manage their own workspace line settings" on public.workspace_line_settings;

drop policy if exists "Admins can manage connection codes for their workspace" on public.admin_connection_codes;

drop policy if exists "Super Admins can manage line quota cache" on public.line_quota_cache;

drop policy if exists "Super Admins can manage registration codes" on public.registration_codes;
drop policy if exists "Anyone can read registration codes for verification" on public.registration_codes;

drop policy if exists "Super admins can manage system settings" on public.system_settings;

drop policy if exists "Super Admins can manage all workspaces" on public.workspaces;
drop policy if exists "Users can view their own workspace" on public.workspaces;
drop policy if exists "Workspace admins can update their own workspace" on public.workspaces;

drop policy if exists "Super Admins can manage all support grants" on public.support_access_grants;
drop policy if exists "Workspace admins can manage support grants for their workspace" on public.support_access_grants;

drop policy if exists "Authenticated users can read cached translations" on public.cached_translations;

drop policy if exists "Super admins can manage tax form templates" on public.tax_form_templates;
drop policy if exists "Authenticated users can read tax form templates" on public.tax_form_templates;

drop policy if exists "Super admins can manage tax form field mappings" on public.tax_form_field_mappings;
drop policy if exists "Authenticated users can read tax form field mappings" on public.tax_form_field_mappings;

drop policy if exists "Anyone authenticated can read saas plans" on public.saas_plans;
drop policy if exists "Super admins can manage saas plans" on public.saas_plans;

drop policy if exists "Read buildings in workspace or support approved" on public.buildings;
drop policy if exists "Manage buildings in workspace or support approved" on public.buildings;

drop policy if exists "Read own workspace subscription" on public.workspace_subscriptions;
drop policy if exists "Super admins can manage workspace subscriptions" on public.workspace_subscriptions;

drop policy if exists "Read own workspace saas payments" on public.saas_payments;
drop policy if exists "Workspace admins can upload saas payment slips" on public.saas_payments;
drop policy if exists "Super admins can manage saas payments" on public.saas_payments;


-- ==================== 1. profiles Policies ====================
create policy "Read profiles for admin/staff" on public.profiles for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read profiles for self" on public.profiles for select
using (id = auth.uid());

create policy "Read profiles for super_admin" on public.profiles for select
using (public.get_current_user_role() = 'super_admin');

create policy "Manage profiles for admin" on public.profiles for update
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage profiles for self" on public.profiles for update
using (id = auth.uid());

create policy "Manage profiles for super_admin" on public.profiles for update
using (public.get_current_user_role() = 'super_admin');


-- ==================== 2. room_types Policies ====================
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
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = room_types.workspace_id and sg.status = 'approved')
);

create policy "Manage room_types for admin" on public.room_types for all
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage room_types for super_admin" on public.room_types for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = room_types.workspace_id and sg.status = 'approved')
);


-- ==================== 3. rooms Policies ====================
create policy "Read rooms for admin/staff" on public.rooms for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read rooms for tenants" on public.rooms for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1 from public.tenants t
    where t.room_id = rooms.id 
      and t.tenant_phone = public.get_current_user_phone()
  )
);

create policy "Read rooms for super_admin" on public.rooms for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = rooms.workspace_id and sg.status = 'approved')
);

create policy "Manage rooms for admin/staff" on public.rooms for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage rooms for super_admin" on public.rooms for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = rooms.workspace_id and sg.status = 'approved')
);


-- ==================== 4. tenants Policies ====================
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
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = tenants.workspace_id and sg.status = 'approved')
);

create policy "Manage tenants for admin/staff" on public.tenants for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage tenants for super_admin" on public.tenants for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = tenants.workspace_id and sg.status = 'approved')
);


-- ==================== 5. meter_records Policies ====================
create policy "Read meter_records for admin/staff" on public.meter_records for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

-- ผูกสิทธิ์กับห้องที่ผู้เช่าเช่าอยู่จริง โดยเทียบทั้ง workspace_id และ room_number พร้อมกัน
-- ถ้าเทียบแค่ room_number ผู้เช่าห้อง 101 ของหอหนึ่งจะอ่านมิเตอร์ห้อง 101 ของหออื่นได้ทุกหอ
-- และใช้ exists แทน limit 1 เพื่อให้ผู้เช่าที่เช่าหลายห้องเห็นครบทุกห้องของตัวเอง
create policy "Read meter_records for tenants" on public.meter_records for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1
    from public.tenants t
    join public.rooms r on r.id = t.room_id
    where t.tenant_phone = public.get_current_user_phone()
      and r.workspace_id = meter_records.workspace_id
      and r.room_number = meter_records.room_number
  )
);

create policy "Read meter_records for super_admin" on public.meter_records for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = meter_records.workspace_id and sg.status = 'approved')
);

create policy "Manage meter_records for admin/staff" on public.meter_records for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage meter_records for super_admin" on public.meter_records for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = meter_records.workspace_id and sg.status = 'approved')
);


-- ==================== 6. bills Policies ====================
create policy "Read bills for admin/staff" on public.bills for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

-- เทียบทั้ง workspace_id และ room_number เหมือน meter_records — บิลมีชื่อผู้เช่าและยอดเงิน
-- ถ้าเทียบแค่ room_number ผู้เช่าจะอ่านบิลของห้องเลขเดียวกันในหออื่นได้ (เป็นเรื่อง PDPA)
create policy "Read bills for tenants" on public.bills for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1
    from public.tenants t
    join public.rooms r on r.id = t.room_id
    where t.tenant_phone = public.get_current_user_phone()
      and r.workspace_id = bills.workspace_id
      and r.room_number = bills.room_number
  )
);

create policy "Read bills for super_admin" on public.bills for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = bills.workspace_id and sg.status = 'approved')
);

create policy "Manage bills for admin/staff" on public.bills for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage bills for super_admin" on public.bills for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = bills.workspace_id and sg.status = 'approved')
);


-- ==================== 7. expenses Policies ====================
create policy "Read expenses for admin/staff" on public.expenses for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read expenses for super_admin" on public.expenses for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = expenses.workspace_id and sg.status = 'approved')
);

create policy "Manage expenses for admin" on public.expenses for all
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage expenses for super_admin" on public.expenses for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = expenses.workspace_id and sg.status = 'approved')
);


-- ==================== 8. cancelled_contracts Policies ====================
create policy "Read cancelled_contracts for admin/staff" on public.cancelled_contracts for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read cancelled_contracts for super_admin" on public.cancelled_contracts for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = cancelled_contracts.workspace_id and sg.status = 'approved')
);

create policy "Manage cancelled_contracts for admin/staff" on public.cancelled_contracts for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage cancelled_contracts for super_admin" on public.cancelled_contracts for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = cancelled_contracts.workspace_id and sg.status = 'approved')
);


-- ==================== 9. tenants_old Policies ====================
create policy "Read tenants_old in workspace or support approved" on public.tenants_old for select
using (
  workspace_id = public.get_current_user_workspace_id()
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants sg where sg.workspace_id = tenants_old.workspace_id and sg.status = 'approved')
  )
);

create policy "Manage tenants_old in workspace or support approved" on public.tenants_old for all
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() in ('admin', 'staff'))
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants sg where sg.workspace_id = tenants_old.workspace_id and sg.status = 'approved')
  )
);


-- ==================== 10. bills_deleted Policies ====================
create policy "Read bills_deleted in workspace or support approved" on public.bills_deleted for select
using (
  workspace_id = public.get_current_user_workspace_id()
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants sg where sg.workspace_id = bills_deleted.workspace_id and sg.status = 'approved')
  )
);

create policy "Manage bills_deleted in workspace or support approved" on public.bills_deleted for all
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() in ('admin', 'staff'))
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants sg where sg.workspace_id = bills_deleted.workspace_id and sg.status = 'approved')
  )
);


-- ==================== 11. meter_replacements Policies ====================
create policy "Read meter_replacements for admin/staff" on public.meter_replacements for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

-- กรองถึงระดับห้อง ไม่ใช่แค่ workspace — เดิมผู้เช่าเห็นประวัติเปลี่ยนมิเตอร์ของทุกห้องในหอตัวเอง
create policy "Read meter_replacements for tenants" on public.meter_replacements for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1
    from public.tenants t
    join public.rooms r on r.id = t.room_id
    where t.tenant_phone = public.get_current_user_phone()
      and r.workspace_id = meter_replacements.workspace_id
      and r.room_number = meter_replacements.room_number
  )
);

create policy "Read meter_replacements for super_admin" on public.meter_replacements for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = meter_replacements.workspace_id and sg.status = 'approved')
);

create policy "Manage meter_replacements for admin/staff" on public.meter_replacements for all
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage meter_replacements for super_admin" on public.meter_replacements for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = meter_replacements.workspace_id and sg.status = 'approved')
);


-- ==================== 12. workspace_line_settings Policies ====================
create policy "Users can manage their own workspace line settings" on public.workspace_line_settings for all
using (
  workspace_id = public.get_current_user_workspace_id()
  or public.get_current_user_role() = 'super_admin'
);


-- ==================== 13. workspace_slipok_settings Policies ====================
create policy "Workspace admins can manage slipok settings" on public.workspace_slipok_settings for all
using (
  workspace_id = public.get_current_user_workspace_id()
  or public.get_current_user_role() = 'super_admin'
);


-- ==================== 14. admin_connection_codes Policies ====================
create policy "Admins can manage connection codes for their workspace" on public.admin_connection_codes for all
using (
  public.get_current_user_role() in ('admin', 'staff', 'super_admin')
  and workspace_id = public.get_current_user_workspace_id()
);


-- ==================== 15. line_quota_cache Policies ====================
create policy "Super Admins can manage line quota cache" on public.line_quota_cache for all
using (public.get_current_user_role() = 'super_admin');


-- ==================== 16. registration_codes Policies ====================
create policy "Super Admins can manage registration codes" on public.registration_codes for all
using (public.get_current_user_role() = 'super_admin');

create policy "Anyone can read registration codes for verification" on public.registration_codes for select
using (true);


-- ==================== 17. system_settings Policies ====================
create policy "Super admins can manage system settings" on public.system_settings for all
using (public.get_current_user_role() = 'super_admin');


-- ==================== 18. workspaces Policies ====================
create policy "Super Admins can manage all workspaces" on public.workspaces for all 
using (public.get_current_user_role() = 'super_admin');

create policy "Users can view their own workspace" on public.workspaces for select 
using (id = public.get_current_user_workspace_id());

create policy "Workspace admins can update their own workspace" on public.workspaces for update
using (
  id = public.get_current_user_workspace_id()
  and public.get_current_user_role() in ('admin', 'super_admin')
);


-- ==================== 19. support_access_grants Policies ====================
create policy "Super Admins can manage all support grants" on public.support_access_grants for all 
using (public.get_current_user_role() = 'super_admin');

create policy "Workspace admins can manage support grants for their workspace" on public.support_access_grants for all 
using (
  workspace_id = public.get_current_user_workspace_id()
  and public.get_current_user_role() = 'admin'
);


-- ==================== 20. cached_translations Policies ====================
create policy "Authenticated users can read cached translations" on public.cached_translations for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');


-- ==================== 21. tax_form_templates Policies ====================
create policy "Super admins can manage tax form templates" on public.tax_form_templates for all
using (public.get_current_user_role() = 'super_admin');

create policy "Authenticated users can read tax form templates" on public.tax_form_templates for select
using (true);


-- ==================== 22. tax_form_field_mappings Policies ====================
create policy "Super admins can manage tax form field mappings" on public.tax_form_field_mappings for all
using (public.get_current_user_role() = 'super_admin');

create policy "Authenticated users can read tax form field mappings" on public.tax_form_field_mappings for select
using (true);


-- ==================== 23. saas_plans Policies ====================
create policy "Anyone authenticated can read saas plans" on public.saas_plans for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "Super admins can manage saas plans" on public.saas_plans for all
using (public.get_current_user_role() = 'super_admin');


-- ==================== 24. buildings Policies ====================
create policy "Read buildings in workspace or support approved" on public.buildings for select
using (
  workspace_id = public.get_current_user_workspace_id()
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants sg where sg.workspace_id = buildings.workspace_id and sg.status = 'approved')
  )
);

create policy "Manage buildings in workspace or support approved" on public.buildings for all
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() in ('admin', 'staff'))
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants sg where sg.workspace_id = buildings.workspace_id and sg.status = 'approved')
  )
);


-- ==================== 25. workspace_subscriptions Policies ====================
create policy "Read own workspace subscription" on public.workspace_subscriptions for select
using (
  workspace_id = public.get_current_user_workspace_id()
  or public.get_current_user_role() = 'super_admin'
);

create policy "Super admins can manage workspace subscriptions" on public.workspace_subscriptions for all
using (public.get_current_user_role() = 'super_admin');


-- ==================== 26. saas_payments Policies ====================
create policy "Read own workspace saas payments" on public.saas_payments for select
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() = 'admin')
  or public.get_current_user_role() = 'super_admin'
);

create policy "Workspace admins can upload saas payment slips" on public.saas_payments for insert
with check (
  workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() = 'admin'
);

create policy "Super admins can manage saas payments" on public.saas_payments for all
using (public.get_current_user_role() = 'super_admin');

-- Note: Tables public.slipok_retry_queue and public.saas_payment_retry_queue 
-- do not have client policies as they are strictly operated by the Service Role.


------------------------------------------------------------------------------
-- [2/20]  database_patch_fix_handle_new_user_workspace_fallback.sql
------------------------------------------------------------------------------

-- Patch: fix_handle_new_user_workspace_fallback
-- วันที่: 2026-07-17
--
-- ปัญหา: trigger handle_new_user() เดิม ถ้า metadata ตอนสมัครสมาชิกไม่มี key workspace_id มาเลย
-- จะ fallback ไปผูก profiles.workspace_id กับ workspace แรกสุดที่เคยสร้างในระบบทั้งหมดโดยอัตโนมัติแบบเงียบ ๆ
-- (select id from public.workspaces order by created_at limit 1) — เป็นช่องโหว่ข้อมูลข้ามหอพัก (cross-tenant)
-- ถ้ามี code path ไหนในอนาคตพลาดไม่ส่ง workspace_id มา
--
-- แก้ไข: เอา fallback ออก ให้ workspace_id เป็น NULL แทนเมื่อไม่มีค่าส่งมา (คอลัมน์นี้ nullable อยู่แล้ว
-- ref public.workspaces(id) on delete set null) RLS จะกันไม่ให้ profile ที่มี workspace_id = NULL
-- มองเห็นข้อมูลของหอพักไหนเลย (fail-safe แทน fail-open)
--
-- ปลอดภัยที่จะรันซ้ำได้ (CREATE OR REPLACE FUNCTION เป็น idempotent) และไม่กระทบ flow ที่มีอยู่ เพราะทุก
-- code path ที่สร้างบัญชีผู้ใช้จริงในระบบ (self-serve register, สมัครด้วยรหัสเชิญ, Admin เพิ่ม staff,
-- Super Admin สร้าง user) ส่ง workspace_id มาถูกต้องอยู่แล้วทุกจุด
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, full_name, phone, workspace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'tenant'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    (new.raw_user_meta_data->>'workspace_id')::uuid
  );
  return new;
end;
$$ language plpgsql security definer;


------------------------------------------------------------------------------
-- [3/20]  database_patch_add_vat_pp30.sql
------------------------------------------------------------------------------

-- ============================================================================
-- Migration: เพิ่มระบบ VAT + ภ.พ.30 + snapshot การยื่น ภ.ง.ด.90/94
--
-- ดัดแปลงจาก import-temp/exported-feature/supabase/migration-vat.sql (v2 — เขียนตรงกับ
-- schema จริงของ SAAS HorSet แล้ว) ต่างจากไฟล์ต้นฉบับ 2 จุด:
--   1) ใช้ trigger function public.handle_updated_at() ที่มีอยู่แล้ว (schema_multi_workspace.sql)
--      แทนการสร้าง public.set_updated_at() ซ้ำ
--   2) เพิ่มตาราง pit_filings ใหม่ (ไม่มีในไฟล์ต้นฉบับ) — เก็บ snapshot ตัวเลข ภ.ง.ด.90/94
--      ณ ตอนกดยื่นแบบ เพื่อไม่ให้ตัวเลขของปีที่ยื่นไปแล้วเปลี่ยนถ้ามีการแก้ settings ภายหลัง
--      (settings ยังแก้ได้อิสระเสมอ ไม่มีการล็อกหน้าจอ — README แนะนำแนวทางนี้)
--
-- ⚠️ อ่านก่อนรัน
--   1) ทุกคำสั่งเป็น ADD COLUMN / CREATE TABLE เท่านั้น — ไม่มี DROP, ไม่มี ALTER TYPE
--      จึงไม่ทำลายข้อมูลเดิม
--   2) เขียนให้รันซ้ำได้ (idempotent) ด้วย IF NOT EXISTS
--   3) รันใน staging ก่อนเสมอ
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ตั้งค่า VAT + กติกาหักค่าใช้จ่าย/ภาษีขั้นต่ำ — ต่อยอดบน workspaces ที่มีอยู่แล้ว
-- ---------------------------------------------------------------------------

alter table public.workspaces add column if not exists vat_registered boolean not null default false;
-- เดือนที่การจดทะเบียนมีผล เก็บเป็นวันที่ 1 ของเดือน (เช่น 2026-07-01)
-- ⚠️ ต้องมีค่าเมื่อ vat_registered = true ไม่งั้นระบบจะคิด VAT ย้อนหลังทั้งฐานข้อมูล
alter table public.workspaces add column if not exists vat_registered_from date;
alter table public.workspaces add column if not exists vat_rate numeric(5, 4) not null default 0.0700
  check (vat_rate >= 0 and vat_rate <= 1);
alter table public.workspaces add column if not exists vat_threshold numeric(14, 2) not null default 1800000.00;
alter table public.workspaces add column if not exists vat_opening_credit numeric(14, 2) not null default 0;

-- โหมดหักค่าใช้จ่ายรายตะกร้า (ปัจจุบัน tax/page.tsx เก็บเป็น local state ล้วน ไม่เคย persist —
-- ย้ายมาเก็บที่นี่เพื่อให้ตั้งค่าคงอยู่ข้าม session ได้ ไม่ชนกับคอลัมน์เดิมใดๆ)
alter table public.workspaces add column if not exists expense_a_mode text not null default 'lump'
  check (expense_a_mode in ('lump', 'actual'));
alter table public.workspaces add column if not exists expense_a_lump_rate numeric(5, 4) not null default 0.3000;
alter table public.workspaces add column if not exists expense_b_mode text not null default 'lump'
  check (expense_b_mode in ('lump', 'actual'));
alter table public.workspaces add column if not exists expense_b_lump_rate numeric(5, 4) not null default 0.6000;

-- false (ค่าเริ่มต้น) = หักค่าใช้จ่ายจริง (actual mode) เกินรายได้ของตะกร้าได้ ส่วนเกินไปหักลบกับตะกร้าอื่น
-- ก่อนคำนวณภาษี ตรงกับแกนคำนวณเดิม (thaiTax.ts/pdfHelper.ts) และแนวทางยื่นจริง — true = จำกัดยอดหักไม่ให้
-- เกินรายได้ต่อตะกร้า (โหมดระมัดระวังกว่า)
alter table public.workspaces add column if not exists cap_expense_per_bucket boolean not null default false;

comment on column public.workspaces.cap_expense_per_bucket is
  'false (ค่าเริ่มต้น) = หักค่าใช้จ่ายจริงเกินรายได้ของตะกร้าได้ ส่วนเกินไปหักลบกับตะกร้าอื่นก่อนคำนวณภาษี — true = จำกัดยอดหักไม่ให้เกินรายได้ต่อตะกร้า';

-- ภาษีขั้นต่ำ 0.5% (ม.48(2)) — แกนคำนวณเดิม (src/lib/thaiTax.ts) มีอยู่แล้วแบบ hardcode
-- 120,000 คงที่ทั้งสองแบบ + exempt-below 5,000 — คอลัมน์เหล่านี้ทำให้ปรับได้จาก settings แทน hardcode
-- ในอนาคต (ยังไม่ได้ต่อเข้า thaiTax.ts ในรอบนี้ — engine เดิมยังคง hardcode 120,000 ไว้เหมือนเดิม
-- คอลัมน์นี้ใช้กับ lib/tax/pit.ts ชุดใหม่ที่เกี่ยวกับ VAT/ภ.พ.30 เท่านั้น)
alter table public.workspaces add column if not exists min_tax_enabled boolean not null default true;
alter table public.workspaces add column if not exists min_tax_rate numeric(6, 5) not null default 0.00500;
alter table public.workspaces add column if not exists min_tax_threshold_pnd90 numeric(14, 2) not null default 120000.00;
alter table public.workspaces add column if not exists min_tax_threshold_pnd94 numeric(14, 2) not null default 60000.00;
alter table public.workspaces add column if not exists min_tax_exempt_below numeric(14, 2) not null default 5000.00;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspaces_vat_registered_requires_from'
  ) then
    alter table public.workspaces add constraint workspaces_vat_registered_requires_from
      check (vat_registered = false or vat_registered_from is not null);
  end if;
end $$;

comment on constraint workspaces_vat_registered_requires_from on public.workspaces is
  'จดทะเบียน VAT แล้วต้องระบุเดือนที่มีผล ไม่งั้นระบบจะคิด VAT ย้อนหลังทั้งหมด';

-- ---------------------------------------------------------------------------
-- 2. เพิ่มคอลัมน์ VAT ให้ตารางรายรับ/ค่าใช้จ่ายเดิม
--
--    หลักการ: เก็บ base และ vat "แยกคอลัมน์" ห้ามเก็บยอดรวมแล้วถอดตอนคำนวณ
--    ตะกร้า A (ค่าเช่า 40(5)) ไม่มีคอลัมน์ VAT เลย — เพราะ vat ต้องเป็น 0 เสมอ
--    (ค่าเช่าไม่ได้อยู่ใน bills เป็นแถวของตัวเอง อยู่ใน rooms.base_rent — ไม่ต้องแตะ)
-- ---------------------------------------------------------------------------

-- รายรับฝั่ง 40(8): ค่าน้ำไฟ/ส่วนกลาง/ค่าปรับ/บริการอื่นๆ ทั้งหมดอยู่ในบิลเดียวกันนี้
-- ค่านี้ถูกคิด/บันทึกจริงตอนออกบิลใน createBill()/saveAllBillsForCycle() (src/features/billing/actions.ts)
-- เมื่อ workspace จด VAT แล้วและถึงเดือนที่มีผล — บวกเพิ่มเข้ายอดบิลจริง ไม่ใช่ถอดจากยอดเดิม
alter table public.bills add column if not exists vat_amount numeric(14, 2) not null default 0;

-- ค่าใช้จ่าย / ภาษีซื้อ — ตาราง expenses มีอยู่แล้ว มี category ('40_5' | '40_8') ตรงกับตะกร้า A/B พอดี
alter table public.expenses add column if not exists vat_amount numeric(14, 2) not null default 0;
alter table public.expenses add column if not exists claim_input_vat boolean not null default true;

comment on column public.expenses.claim_input_vat is
  'false = ใบกำกับนี้ขอเครดิตภาษีซื้อไม่ได้ จะไม่ถูกนับใน ภ.พ.30';

-- ---------------------------------------------------------------------------
-- 3. บันทึกการยื่น ภ.พ.30
--
--    เก็บเฉพาะ "สิ่งที่ผู้ใช้ป้อน" (ภาษีซื้อที่กรอกเอง, วันที่ยื่น, หมายเหตุ)
--    ⚠️ ห้ามเก็บ credit_brought / net / carry_forward เป็นคอลัมน์
--       เพราะถ้าผู้ใช้ย้อนไปแก้ใบกำกับเดือนก่อน สายเครดิตของทุกเดือนถัดไปต้องคิดใหม่
--       ให้คำนวณสดด้วย buildPP30Series() เสมอ
-- ---------------------------------------------------------------------------

create table if not exists public.pp30_filings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- เดือนภาษี เก็บเป็นวันที่ 1 ของเดือน
  period date not null,

  -- null = ใช้ยอดจากสมุดค่าใช้จ่าย (expenses.vat_amount)
  input_vat_manual numeric(14, 2),
  filed_at date,
  paid_amount numeric(14, 2),
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, period)
);

create index if not exists pp30_filings_workspace_period_idx
  on public.pp30_filings (workspace_id, period desc);

-- ---------------------------------------------------------------------------
-- 4. ค่าลดหย่อนอื่น — แยกช่องครึ่งปี/สิ้นปี
--    ตรวจแล้ว: schema จริงไม่มีตารางค่าลดหย่อนเดิมที่เก็บยอดเดียว จึงไม่มีของเก่าให้ backfill
-- ---------------------------------------------------------------------------

create table if not exists public.tax_deductions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tax_year smallint not null,
  name text not null,
  amount_pnd94 numeric(14, 2) not null default 0,
  amount_pnd90 numeric(14, 2) not null default 0,
  note text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tax_deductions_workspace_year_idx
  on public.tax_deductions (workspace_id, tax_year);

-- ---------------------------------------------------------------------------
-- 5. บันทึกการยื่น ภ.ง.ด.90/94 + snapshot ตัวเลข ณ ตอนยื่น (ใหม่ — ไม่มีในไฟล์ export ต้นฉบับ)
--
--    หลักการ (ตาม README แนะนำ — ทางเลือก (ก)): settings แก้ได้อิสระตลอดเวลา ไม่มีการล็อกหน้าจอ
--    แต่รายงานของปีที่ "ยื่นแล้ว" จะอ่านค่าจาก snapshot นี้เสมอแทนการคำนวณสดจาก settings ปัจจุบัน
--    snapshot เป็นผลคำนวณจริงจาก src/lib/thaiTax.ts (engine เดิมที่ใช้ยื่นจริง) ณ วินาทีที่กดยื่น
-- ---------------------------------------------------------------------------

create table if not exists public.pit_filings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tax_year smallint not null,
  form text not null check (form in ('90', '94')),
  filed_at date not null,
  tax_paid numeric(14, 2),
  withholding_tax numeric(14, 2),
  note text,
  -- ผลคำนวณเต็มชุด (จาก thaiTax.ts) ณ ตอนกดยื่น — ใช้แสดงผลย้อนหลังแทนคำนวณสด
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, tax_year, form)
);

create index if not exists pit_filings_workspace_year_idx
  on public.pit_filings (workspace_id, tax_year desc);

-- ---------------------------------------------------------------------------
-- 6. RLS — mirror ของ pattern จริงที่ใช้กับตาราง public.expenses
--    (get_current_user_role() / get_current_user_workspace_id() + ข้อยกเว้น
--     support_access_grants สำหรับ super_admin ที่ได้รับอนุมัติ)
-- ---------------------------------------------------------------------------

alter table public.pp30_filings enable row level security;
alter table public.tax_deductions enable row level security;
alter table public.pit_filings enable row level security;

drop policy if exists "Read pp30_filings for admin/staff" on public.pp30_filings;
create policy "Read pp30_filings for admin/staff" on public.pp30_filings for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

drop policy if exists "Read pp30_filings for super_admin" on public.pp30_filings;
create policy "Read pp30_filings for super_admin" on public.pp30_filings for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = pp30_filings.workspace_id and sg.status = 'approved')
);

drop policy if exists "Manage pp30_filings for admin" on public.pp30_filings;
create policy "Manage pp30_filings for admin" on public.pp30_filings for all
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

drop policy if exists "Manage pp30_filings for super_admin" on public.pp30_filings;
create policy "Manage pp30_filings for super_admin" on public.pp30_filings for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = pp30_filings.workspace_id and sg.status = 'approved')
);

drop policy if exists "Read tax_deductions for admin/staff" on public.tax_deductions;
create policy "Read tax_deductions for admin/staff" on public.tax_deductions for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

drop policy if exists "Read tax_deductions for super_admin" on public.tax_deductions;
create policy "Read tax_deductions for super_admin" on public.tax_deductions for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = tax_deductions.workspace_id and sg.status = 'approved')
);

drop policy if exists "Manage tax_deductions for admin" on public.tax_deductions;
create policy "Manage tax_deductions for admin" on public.tax_deductions for all
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

drop policy if exists "Manage tax_deductions for super_admin" on public.tax_deductions;
create policy "Manage tax_deductions for super_admin" on public.tax_deductions for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = tax_deductions.workspace_id and sg.status = 'approved')
);

drop policy if exists "Read pit_filings for admin/staff" on public.pit_filings;
create policy "Read pit_filings for admin/staff" on public.pit_filings for select
using (
  public.get_current_user_role() in ('admin', 'staff')
  and workspace_id = public.get_current_user_workspace_id()
);

drop policy if exists "Read pit_filings for super_admin" on public.pit_filings;
create policy "Read pit_filings for super_admin" on public.pit_filings for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = pit_filings.workspace_id and sg.status = 'approved')
);

drop policy if exists "Manage pit_filings for admin" on public.pit_filings;
create policy "Manage pit_filings for admin" on public.pit_filings for all
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

drop policy if exists "Manage pit_filings for super_admin" on public.pit_filings;
create policy "Manage pit_filings for super_admin" on public.pit_filings for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = pit_filings.workspace_id and sg.status = 'approved')
);

-- ---------------------------------------------------------------------------
-- 7. trigger อัปเดต updated_at — ใช้ public.handle_updated_at() ที่มีอยู่แล้ว
--    (schema_multi_workspace.sql) ไม่สร้างฟังก์ชันซ้ำ (ต่างจากไฟล์ export ต้นฉบับที่เผื่อไว้เป็น
--    set_updated_at() ของตัวเอง)
-- ---------------------------------------------------------------------------

drop trigger if exists pp30_filings_updated_at on public.pp30_filings;
create trigger pp30_filings_updated_at
  before update on public.pp30_filings
  for each row execute function public.handle_updated_at();

drop trigger if exists pit_filings_updated_at on public.pit_filings;
create trigger pit_filings_updated_at
  before update on public.pit_filings
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 8. PDF mapping ของ ภ.พ.30 — DB-backed template override (mirror tax_form_templates /
--    tax_form_field_mappings ที่ใช้กับ 90/94 อยู่แล้ว)
--
--    ⚠️ สร้างเป็นตารางแยกใหม่ ไม่ได้ไปแก้ CHECK constraint ของ tax_form_templates เดิม
--       (form_type in ('90','94')) เพื่อไม่ให้กระทบระบบ mapping ของ 90/94 ที่ทำงานอยู่แล้วเลย
--    ไม่ต้อง seed แถวเริ่มต้นที่นี่ — ตาม pattern เดียวกับ tax_form_templates เดิม (ไม่มี seed data
--    ในตารางนั้นเช่นกัน) generatePp30Pdf() จะ fallback ไปใช้ไฟล์ bundled ที่
--    public/templates/PP30_Template.pdf + DEFAULT_PP30_MAPPING (hardcode ใน pdfHelper.ts)
--    เมื่อยังไม่มีแถวใน pp30_form_templates ของ workspace/ปีนั้น
-- ---------------------------------------------------------------------------

create table if not exists public.pp30_form_templates (
  id uuid default gen_random_uuid() primary key,
  tax_year text, -- null = ใช้ template นี้ทุกปีจนกว่าจะมีของปีนั้นเจาะจง
  file_url text not null,
  file_name text,
  is_bundled_default boolean not null default false,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pp30_form_field_mappings (
  id uuid default gen_random_uuid() primary key,
  template_id uuid not null references public.pp30_form_templates(id) on delete cascade,
  logical_key text not null,
  field_kind text not null check (field_kind in ('text', 'radio')),
  physical_field_name text not null,
  option_key text,
  widget_index smallint,
  value_format text check (value_format in ('raw', 'comb', 'plain_decimal')),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_pp30_text_fields check (
    field_kind <> 'text' or (option_key is null and widget_index is null and value_format is not null)
  ),
  constraint chk_pp30_radio_fields check (
    field_kind <> 'radio' or (option_key is not null and widget_index is not null)
  )
);

alter table public.pp30_form_templates enable row level security;
alter table public.pp30_form_field_mappings enable row level security;

-- เฉพาะ super_admin จัดการ mapping ได้ (mirror สิทธิ์ของ tax_form_templates/tax_form_field_mappings เดิม)
drop policy if exists "Manage pp30_form_templates for super_admin" on public.pp30_form_templates;
create policy "Manage pp30_form_templates for super_admin" on public.pp30_form_templates for all
using (public.get_current_user_role() = 'super_admin');

drop policy if exists "Read pp30_form_templates for all staff" on public.pp30_form_templates;
create policy "Read pp30_form_templates for all staff" on public.pp30_form_templates for select
using (public.get_current_user_role() in ('admin', 'staff', 'super_admin'));

drop policy if exists "Manage pp30_form_field_mappings for super_admin" on public.pp30_form_field_mappings;
create policy "Manage pp30_form_field_mappings for super_admin" on public.pp30_form_field_mappings for all
using (public.get_current_user_role() = 'super_admin');

drop policy if exists "Read pp30_form_field_mappings for all staff" on public.pp30_form_field_mappings;
create policy "Read pp30_form_field_mappings for all staff" on public.pp30_form_field_mappings for select
using (public.get_current_user_role() in ('admin', 'staff', 'super_admin'));


------------------------------------------------------------------------------
-- [4/20]  database_patch_add_pp30_output_vat_manual.sql
------------------------------------------------------------------------------

-- Patch: add_pp30_output_vat_manual
-- วันที่: 2026-07-30
--
-- เพิ่มคอลัมน์ public.pp30_filings.output_vat_manual — ให้ผู้ใช้กรอกยอด "ภาษีขาย" ของเดือนนั้นเอง
-- แทนยอดที่คำนวณอัตโนมัติจากบิลได้ (mirror ของ input_vat_manual ที่มีอยู่แล้วสำหรับภาษีซื้อ)
-- null (ค่าเริ่มต้น) = ใช้ยอดที่คำนวณจากบิลจริงตามปกติ ดู buildPP30Series() ใน src/lib/tax/pp30.ts
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.pp30_filings
  add column if not exists output_vat_manual numeric(14, 2);


------------------------------------------------------------------------------
-- [5/20]  database_patch_add_building_utility_billing.sql
------------------------------------------------------------------------------

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


------------------------------------------------------------------------------
-- [6/20]  database_patch_add_staff_building_access.sql
------------------------------------------------------------------------------

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


------------------------------------------------------------------------------
-- [7/20]  database_patch_add_tenant_room_transfers.sql
------------------------------------------------------------------------------

-- Patch: add_tenant_room_transfers
-- วันที่: 2026-07-25
--
-- เพิ่มฟีเจอร์ "ย้ายห้อง" (Room Transfer) แบบเต็มรูปแบบ:
--   1. tenants.deposit_paid — เก็บยอดเงินประกันจริงที่เก็บจากผู้เช่าแต่ละคน (ground truth)
--      แทนการคำนวณสดจาก workspaces.deposit_amount/deposit_type ทุกครั้งที่คืนเงิน
--      เป็น null ได้ = ยังไม่ migrate/ไม่ทราบ ให้ fallback ไปคำนวณสดแบบเดิม
--   2. tenant_room_transfers — ประวัติการย้ายห้อง (audit trail) ใช้คู่กับ
--      transferTenantRoom() ใน src/features/tenant/transfer-actions.ts
--
-- Backfill: คำนวณ deposit_paid ของผู้เช่าที่มีห้องอยู่ทุกคน (where deposit_paid is null)
-- ด้วยสูตรเดียวกับที่ UI คำนวณสดอยู่ตอนนี้ ป้องกันไม่ให้ยอดเงินประกันเปลี่ยนแปลงสำหรับผู้เช่าเดิม
--
-- ปลอดภัยที่จะรันซ้ำได้ (IF NOT EXISTS / where deposit_paid is null)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. tenants.deposit_paid
-- =========================================================================
alter table public.tenants
  add column if not exists deposit_paid numeric;

comment on column public.tenants.deposit_paid is 'ยอดเงินประกันจริงที่เก็บจากผู้เช่ารายนี้ (ground truth) — null แปลว่ายังไม่ migrate ให้ fallback คำนวณสดจาก workspaces/room_types';

-- =========================================================================
-- 2. tenant_room_transfers (ประวัติการย้ายห้อง)
-- =========================================================================
create table if not exists public.tenant_room_transfers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  tenant_name text not null,
  from_room_id uuid references public.rooms(id) on delete set null,
  from_room_number text not null,
  to_room_id uuid references public.rooms(id) on delete set null,
  to_room_number text not null,
  billing_cycle text not null,
  transfer_date date not null,
  deposit_paid_before numeric not null default 0,
  deposit_topup_amount numeric not null default 0,
  deposit_paid_after numeric not null default 0,
  closing_elec_prev numeric,
  closing_elec_curr numeric,
  closing_water_prev numeric,
  closing_water_curr numeric,
  closing_bill_id uuid references public.bills(id) on delete set null,
  starting_elec_reading numeric,
  starting_water_reading numeric,
  line_notification_sent boolean not null default false,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.tenant_room_transfers is 'ประวัติการย้ายห้องของผู้เช่า (audit trail) — สร้างโดย transferTenantRoom() ใน src/features/tenant/transfer-actions.ts';

drop trigger if exists trg_tenant_room_transfers_workspace on public.tenant_room_transfers;
create trigger trg_tenant_room_transfers_workspace
  before insert on public.tenant_room_transfers
  for each row execute procedure public.populate_workspace_id();

create index if not exists idx_tenant_room_transfers_workspace_id on public.tenant_room_transfers (workspace_id);
create index if not exists idx_tenant_room_transfers_tenant_id on public.tenant_room_transfers (tenant_id);

-- =========================================================================
-- 3. RLS — Admin/Super Admin เท่านั้น (ไม่รวม Staff เพราะเป็นข้อมูลการเงิน/สัญญา)
-- =========================================================================
alter table public.tenant_room_transfers enable row level security;

drop policy if exists "Read tenant_room_transfers for admin" on public.tenant_room_transfers;
drop policy if exists "Read tenant_room_transfers for super_admin" on public.tenant_room_transfers;
drop policy if exists "Manage tenant_room_transfers for admin" on public.tenant_room_transfers;
drop policy if exists "Manage tenant_room_transfers for super_admin" on public.tenant_room_transfers;

create policy "Read tenant_room_transfers for admin" on public.tenant_room_transfers for select
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Read tenant_room_transfers for super_admin" on public.tenant_room_transfers for select
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = tenant_room_transfers.workspace_id and sg.status = 'approved')
);

create policy "Manage tenant_room_transfers for admin" on public.tenant_room_transfers for all
using (
  public.get_current_user_role() = 'admin'
  and workspace_id = public.get_current_user_workspace_id()
);

create policy "Manage tenant_room_transfers for super_admin" on public.tenant_room_transfers for all
using (
  public.get_current_user_role() = 'super_admin'
  and exists (select 1 from public.support_access_grants sg where sg.workspace_id = tenant_room_transfers.workspace_id and sg.status = 'approved')
);

-- =========================================================================
-- 4. Backfill deposit_paid สำหรับผู้เช่าเดิมที่มีห้องอยู่ (รันครั้งเดียว, ปลอดภัยรันซ้ำ)
-- =========================================================================
update public.tenants t
set deposit_paid = case
  when w.deposit_type = 'fixed' then coalesce(rt.deposit_amount, w.deposit_amount, 0)
  else coalesce(r.base_rent, 0) * coalesce(w.deposit_amount, 0)
end
from public.rooms r
join public.workspaces w on w.id = r.workspace_id
left join public.room_types rt on rt.id = r.room_type_id
where t.room_id = r.id
  and t.deposit_paid is null;


------------------------------------------------------------------------------
-- [8/20]  database_patch_add_meter_entry_mode.sql
------------------------------------------------------------------------------

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


------------------------------------------------------------------------------
-- [9/20]  database_patch_add_room_id_to_meters_bills.sql
------------------------------------------------------------------------------

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


------------------------------------------------------------------------------
-- [10/20]  database_patch_fix_tenant_rls_scope.sql
------------------------------------------------------------------------------

-- Patch: fix_tenant_rls_scope
-- วันที่: 2026-08-21
--
-- ปิดช่องที่ผู้เช่าอ่านข้อมูลของหอพักอื่นได้ และของห้องอื่นในหอเดียวกันได้
-- ขัดกับกฎของโปรเจคที่ระบุว่า "ห้าม Tenant เข้าถึงข้อมูลห้องอื่นโดยเด็ดขาด"
--
-- ปัญหาเดิม
-- --------
-- 1. meter_records / bills — policy ฝั่งผู้เช่าจับคู่ด้วย room_number เพียว ๆ ไม่กรอง workspace_id:
--
--      and room_number = (
--        select r.room_number from rooms r join tenants t on t.room_id = r.id
--        where t.tenant_phone = public.get_current_user_phone() limit 1
--      )
--
--    ผู้เช่าห้อง 101 ของหอ A จึงอ่านมิเตอร์และบิลของห้อง 101 ในหอ B ได้ทุกหอที่มีเลขห้องนี้
--    (บิลมีทั้งชื่อผู้เช่าและยอดเงิน — เป็นเรื่อง PDPA ไม่ใช่แค่ข้อมูลรั่วเฉย ๆ)
--
--    limit 1 ยังเป็นบั๊กในตัวเอง: ผู้เช่าที่เช่า 2 ห้องจะเห็นได้แค่ห้องเดียวแบบสุ่ม
--
-- 2. meter_replacements — policy ฝั่งผู้เช่ากรองแค่ workspace_id ไม่กรองห้อง
--    ผู้เช่าจึงเห็นประวัติเปลี่ยนมิเตอร์ของ "ทุกห้อง" ในหอตัวเอง ไม่ใช่แค่ห้องตัวเอง
--
-- ความเสี่ยงตอนรัน patch นี้
-- -------------------------
-- ต่ำมาก: ตรวจแล้วว่าตอนนี้ยังไม่มี profile ที่ role = 'tenant' เลยแม้แต่คนเดียว
-- และ portal ที่ผู้เช่าเปิดจากลิงก์ LINE ใช้ service role key ซึ่งไม่ผ่าน RLS อยู่แล้ว
-- จึงไม่มี session ไหนที่พึ่ง policy เหล่านี้อยู่ — แต่ช่องจะเปิดทันทีที่สร้างบัญชีผู้เช่าคนแรก
--
-- แนวทางแก้
-- ---------
-- ผูกสิทธิ์กับ "ห้องที่ผู้เช่าคนนั้นเช่าอยู่จริง" ผ่าน tenants → rooms โดยเทียบทั้ง
-- workspace_id และ room_number พร้อมกัน และใช้ exists แทน limit 1 เพื่อให้ผู้เช่าที่เช่าหลายห้อง
-- เห็นได้ครบทุกห้องของตัวเอง (ห้องเหล่านั้นเป็นของเขาเองอยู่แล้ว ไม่ใช่การเปิดสิทธิ์เพิ่ม)
--
-- จงใจไม่ใช้ get_current_user_workspace_id() กับผู้เช่า เพราะถ้า profiles.workspace_id
-- ของผู้เช่าเป็น null policy จะปฏิเสธทุกอย่าง — การไล่ผ่าน tenants → rooms เชื่อถือได้กว่า
--
-- ปลอดภัยที่จะรันซ้ำได้ (drop policy if exists ก่อน create)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. meter_records — ผู้เช่าเห็นได้เฉพาะห้องของตัวเอง ในหอของตัวเอง
-- =========================================================================
drop policy if exists "Read meter_records for tenants" on public.meter_records;

create policy "Read meter_records for tenants" on public.meter_records for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1
    from public.tenants t
    join public.rooms r on r.id = t.room_id
    where t.tenant_phone = public.get_current_user_phone()
      and r.workspace_id = meter_records.workspace_id
      and r.room_number = meter_records.room_number
  )
);

-- =========================================================================
-- 2. bills — ผู้เช่าเห็นได้เฉพาะบิลของห้องตัวเอง ในหอของตัวเอง
-- =========================================================================
drop policy if exists "Read bills for tenants" on public.bills;

create policy "Read bills for tenants" on public.bills for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1
    from public.tenants t
    join public.rooms r on r.id = t.room_id
    where t.tenant_phone = public.get_current_user_phone()
      and r.workspace_id = bills.workspace_id
      and r.room_number = bills.room_number
  )
);

-- =========================================================================
-- 3. meter_replacements — เดิมเห็นทุกห้องในหอ ให้เหลือเฉพาะห้องตัวเอง
-- =========================================================================
-- ตรวจแล้วว่า getTenantPortalData ไม่ได้อ่านตารางนี้เลย การรัดให้แคบลงจึงไม่กระทบหน้าจอใด
drop policy if exists "Read meter_replacements for tenants" on public.meter_replacements;

create policy "Read meter_replacements for tenants" on public.meter_replacements for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1
    from public.tenants t
    join public.rooms r on r.id = t.room_id
    where t.tenant_phone = public.get_current_user_phone()
      and r.workspace_id = meter_replacements.workspace_id
      and r.room_number = meter_replacements.room_number
  )
);

-- =========================================================================
-- 4. ตรวจผลหลังรัน
-- =========================================================================
-- ต้องได้ 3 แถว และคอลัมน์ qual ของทุกแถวต้องมีคำว่า workspace_id อยู่ด้วย
--
-- select tablename, policyname, qual
-- from pg_policies
-- where schemaname = 'public'
--   and policyname in (
--     'Read meter_records for tenants',
--     'Read bills for tenants',
--     'Read meter_replacements for tenants'
--   );


------------------------------------------------------------------------------
-- [11/20]  database_patch_room_id_identity_1_additive.sql
------------------------------------------------------------------------------

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


------------------------------------------------------------------------------
-- [12/20]  database_patch_room_id_identity_2_switch.sql
------------------------------------------------------------------------------

-- Patch: room_id_identity — ส่วนที่ 2 จาก 2 "สวิตช์เปิดใช้จริง"
-- วันที่: 2026-08-23
--
-- =========================================================================
-- ⚠️ ห้ามรันไฟล์นี้จนกว่าจะครบ 3 ข้อ
-- =========================================================================
--   1) รัน database_patch_room_id_identity_1_additive.sql แล้ว
--   2) deploy โค้ดที่จับคู่ห้องด้วย room_id ขึ้น production แล้ว (commit f44133b ขึ้นไป)
--   3) QA เฟส 1 ผ่านแล้ว — ยืนยันว่าทุกอย่างทำงานเหมือนเดิมเป๊ะ
--
-- เหตุผลที่ต้องรอ: ไฟล์นี้ "ลบ" unique เดิมและ "ปลดล็อก" ให้สร้างเลขห้องซ้ำได้
-- ถ้ารันตอนที่โค้ดเก่ายังรันอยู่ การ upsert บิล/มิเตอร์ของโค้ดเก่าจะ error ทันที
-- (โค้ดเก่าใช้ onConflict: workspace_id,invoice_id ซึ่งข้อ 1 ด้านล่างลบทิ้ง)
--
-- ลำดับในไฟล์นี้สำคัญ: ข้อ 3 (ปลดล็อก rooms) ต้องอยู่ท้ายสุดเสมอ
-- ตราบใดที่ rooms_workspace_id_room_number_key ยังอยู่ เลขห้องซ้ำเกิดขึ้นไม่ได้
-- ข้อ 1-2 จึงยังไม่เปลี่ยนพฤติกรรมอะไรเลย
--
-- ปลอดภัยที่จะรันซ้ำได้ (if exists / pg_constraint guard)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 0. ตรวจก่อนเริ่ม — ต้องมี constraint ใหม่ครบ 4 ตัวจากไฟล์ที่ 1 ก่อน
-- =========================================================================
do $$
declare
  found_count int;
begin
  select count(*) into found_count
  from pg_constraint
  where conname in (
    'buildings_workspace_id_code_key',
    'meter_records_workspace_room_id_cycle_key',
    'bills_workspace_room_id_cycle_kind_key',
    'meter_replacements_workspace_room_id_cycle_type_key'
  );

  if found_count < 4 then
    raise exception 'ยังไม่ได้รัน database_patch_room_id_identity_1_additive.sql ให้ครบ (พบ constraint ใหม่ %/4) — หยุดก่อน อย่ารันไฟล์นี้', found_count;
  end if;
end $$;

-- =========================================================================
-- 1. ลบ unique เดิมที่ยังคีย์ด้วย room_number
-- =========================================================================
-- ต้องลบก่อนปลดล็อก rooms ในข้อ 3 ไม่งั้นสร้างห้อง 101 ในอาคารที่สองได้ แต่จดมิเตอร์
-- รอบเดียวกันไม่ได้ (ติด unique เดิมที่คีย์ด้วยเลขห้อง) ซึ่งจะเป็นสภาพที่งงที่สุด
--
-- bills: invoice_id เลิกเป็น conflict key เหลือเป็นเลขอ้างอิงที่พิมพ์บนบิลเท่านั้น

alter table public.meter_records
  drop constraint if exists meter_records_workspace_room_cycle_key;

alter table public.bills
  drop constraint if exists bills_workspace_id_invoice_id_key;

alter table public.meter_replacements
  drop constraint if exists meter_replacements_workspace_id_room_cycle_type_key;

-- =========================================================================
-- 2. RLS ผู้เช่า — เทียบ room_id ตรง ๆ ผ่าน tenants.room_id
-- =========================================================================
-- เดิม (patch fix_tenant_rls_scope) เทียบ workspace_id + room_number ซึ่งจะกำกวมทันทีที่เลขห้องซ้ำได้
-- room_id เป็น uuid ที่ unique ทั้งระบบ จึงไม่ต้องเทียบ workspace_id อีก และ predicate สั้นลงมาก
--
-- ต้องทำ "ก่อน" ข้อ 3 เสมอ — ถ้าปลดล็อกเลขห้องซ้ำก่อนแล้ว policy ยังเทียบเลขห้องอยู่
-- ผู้เช่าห้อง 101 ตึก A จะอ่านบิลของห้อง 101 ตึก B ได้ในช่วงคาบเกี่ยวนั้น

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
-- 3. ⚠️ ขั้นสุดท้าย — ปลดล็อกให้เลขห้องซ้ำข้ามอาคารได้
-- =========================================================================
-- เปลี่ยนกฎจาก "ห้ามเลขห้องซ้ำในหอ" เป็น "ห้ามเลขห้องซ้ำในอาคารเดียวกัน"
-- กฎใหม่นี้ยังทำให้ INV-{รอบบิล}-{รหัสอาคาร}-{เลขห้อง} ไม่ซ้ำโดยอัตโนมัติ
--
-- หมายเหตุ: ห้องที่ building_id เป็น null จะไม่ถูกกฎใหม่คุ้มกัน (null ไม่ conflict กันใน Postgres)
-- ตรวจแล้วว่าปัจจุบันทุกห้องมี building_id ครบ และ createRoom/createRoomsBatch/CSV import
-- เติม building_id ให้ทุกเส้นทางแล้ว
--
-- ตรวจก่อนรัน (ควรได้ 0):
--   select count(*) from public.rooms where building_id is null;

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
-- 4. ตรวจผลหลังรัน
-- =========================================================================
-- constraint ที่ต้องมี (ควรได้ 5 แถว):
--   select conname from pg_constraint where conname in (
--     'buildings_workspace_id_code_key',
--     'meter_records_workspace_room_id_cycle_key',
--     'bills_workspace_room_id_cycle_kind_key',
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
-- ทดสอบว่าเปิดใช้จริงแล้ว: สร้างห้องเลขซ้ำในอาคารที่สองจากหน้าจัดการห้องพัก ต้องสร้างได้
-- และสร้างเลขซ้ำ "ในอาคารเดิม" ต้องยังถูกปฏิเสธ


------------------------------------------------------------------------------
-- [13/20]  database_patch_room_id_identity_3_close_null_building_gap.sql
------------------------------------------------------------------------------

-- Patch: room_id_identity — ส่วนที่ 3 "ปิดช่องห้องที่ไม่มีอาคาร"
-- วันที่: 2026-08-23
--
-- =========================================================================
-- ปัญหาที่ patch นี้แก้
-- =========================================================================
-- ไฟล์ที่ 2 เปลี่ยนกฎกันเลขห้องซ้ำจาก
--     unique (workspace_id, room_number)              ← ดักเลขซ้ำโดยไม่สนอาคาร
-- เป็น
--     unique (workspace_id, building_id, room_number)  ← ดักเลขซ้ำเฉพาะในอาคารเดียวกัน
--
-- แต่ Postgres ไม่ถือว่า null ชนกันใน unique constraint ห้องที่ building_id เป็น null
-- จึงไม่ถูกกฎใหม่คุ้มกันเลย — สร้างเลขห้องซ้ำกันได้ไม่จำกัดในหอเดียวกัน
--
-- ก่อนหน้านี้ไม่เป็นปัญหาเพราะกฎเก่าดักไว้อยู่แล้ว การเปลี่ยนกฎในไฟล์ 2 จึงเปิดช่องนี้ขึ้นมา
-- (ฝั่งโค้ดแก้แล้วให้ปฏิเสธการสร้างห้องที่ไม่มีอาคาร — ดู resolveBuildingIdStrict
--  ใน src/features/room/actions.ts — patch นี้เป็นด่านที่สองในระดับฐานข้อมูล)
--
-- ปลอดภัยที่จะรันซ้ำได้ (if not exists)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. ดูก่อนว่ามีห้องที่ไม่มีอาคารอยู่แล้วหรือไม่ และซ้ำกันอยู่หรือเปล่า
-- =========================================================================
-- ห้องที่ไม่มีอาคาร (ถ้ามี ควรเข้าไปกำหนดอาคารให้ในหน้าจัดการห้องพัก):
--   select id, room_number, status, created_at from public.rooms
--   where building_id is null order by room_number;
--
-- เลขห้องที่ซ้ำกันอยู่แล้วในกลุ่มที่ไม่มีอาคาร (ต้องได้ 0 แถว ไม่งั้นข้อ 2 จะ error):
--   select workspace_id, room_number, count(*) from public.rooms
--   where building_id is null group by 1,2 having count(*) > 1;
--
-- ถ้าข้อบนได้แถวออกมา ให้แก้ข้อมูลก่อน — กำหนดอาคารให้ห้องเหล่านั้น หรือลบห้องที่สร้างซ้ำ
-- โดยไม่ตั้งใจออก (ตรวจก่อนว่าห้องนั้นไม่มีผู้เช่า/บิล/มิเตอร์ผูกอยู่)

-- =========================================================================
-- 2. partial unique index — คุมเลขห้องซ้ำในกลุ่มที่ยังไม่มีอาคาร
-- =========================================================================
-- ทำเป็น partial index (where building_id is null) ไม่ใช่ constraint ธรรมดา เพราะต้องการคุม
-- "เฉพาะแถวที่ building_id เป็น null" เท่านั้น ส่วนแถวที่มีอาคารแล้วให้
-- rooms_workspace_building_room_number_key จากไฟล์ 2 ดูแลตามปกติ
--
-- ผลรวมของสองตัวนี้: ทุกห้องถูกคุมเสมอ ไม่มีช่องว่างเหลือ
--   · มีอาคาร     → ห้ามเลขซ้ำในอาคารเดียวกัน
--   · ไม่มีอาคาร  → ห้ามเลขซ้ำในหอเดียวกัน (เข้มกว่า ซึ่งถูกต้องเพราะยังไม่รู้ว่าอยู่อาคารไหน)
--
-- จงใจไม่ตั้ง building_id เป็น NOT NULL เพราะ foreign key เป็น `on delete set null`
-- ถ้าตั้ง NOT NULL การลบอาคารจะ error ทันทีแทนที่จะปล่อยห้องเป็นกำพร้า ซึ่งเป็นการเปลี่ยน
-- พฤติกรรมการลบอาคารที่ควรตัดสินใจแยกเรื่อง ไม่ควรพ่วงมากับ patch แก้บั๊กนี้

create unique index if not exists rooms_workspace_room_number_no_building_key
  on public.rooms (workspace_id, room_number)
  where building_id is null;

comment on index public.rooms_workspace_room_number_no_building_key is
  'กันเลขห้องซ้ำสำหรับห้องที่ยังไม่ได้กำหนดอาคาร — คู่กับ rooms_workspace_building_room_number_key ที่คุมห้องที่มีอาคารแล้ว';

-- =========================================================================
-- 3. ตรวจผลหลังรัน
-- =========================================================================
-- index ต้องมี (ควรได้ 1 แถว):
--   select indexname from pg_indexes
--   where indexname = 'rooms_workspace_room_number_no_building_key';
--
-- ทดสอบจริง: ลองสร้างห้องเลขเดิมสองครั้งโดยไม่เลือกอาคาร — ครั้งที่สองต้องถูกปฏิเสธ
-- (ฝั่งโค้ดจะปฏิเสธก่อนถึงฐานข้อมูลอยู่แล้ว ถ้าหอมีมากกว่าหนึ่งอาคาร)


------------------------------------------------------------------------------
-- [14/20]  database_patch_add_bill_snapshot.sql
------------------------------------------------------------------------------

-- Patch: add_bill_snapshot
-- วันที่: 2026-08-24
--
-- =========================================================================
-- ทำไมต้องมี patch นี้
-- =========================================================================
-- ตาราง bills เก็บแค่ "ยอดรวม" กับ "จำนวนหน่วยน้ำ-ไฟ" ไม่ได้เก็บองค์ประกอบที่ประกอบกันเป็น
-- ยอดนั้นเลย (ค่าเช่า อัตราค่าน้ำ-ไฟ ค่าส่วนกลาง เลขมิเตอร์ก่อน-หลัง ค่าใช้จ่ายเสริม)
--
-- ทุกครั้งที่ต้องแสดงรายการย่อยของบิล ระบบจึงต้อง "เดา" องค์ประกอบจากค่า config ปัจจุบัน
-- แล้วสองที่เดาไม่ตรงกัน:
--
--   · ใบ PDF  คำนวณค่าเช่าย้อนจากยอดรวม (amount - ค่าไฟ - ค่าน้ำ - ...) เพื่อบังคับให้บรรทัด
--             บวกกันได้เท่ายอดรวมพอดี → บรรทัด "ค่าเช่าห้องพัก" กลายเป็นเศษที่เหลือ
--             ไม่ใช่ค่าเช่าจริงของห้อง ทันทีที่มีอะไรไม่ตรง
--   · Portal  แสดงค่าเช่าจาก config ห้องปัจจุบัน แต่แสดงจำนวนหน่วยจากบิล → รายการย่อย
--             บวกกันไม่ได้เท่ายอดรวม และเคยเจอกรณีแสดง "2053 - 2120 จำนวน 0 หน่วย"
--             ซึ่งขัดแย้งกันเองในบรรทัดเดียว
--
-- เกิดขึ้นจริงเมื่อออกบิลก่อนกรอกมิเตอร์เสร็จ แล้วมากรอกมิเตอร์ทีหลังโดยไม่ออกบิลใหม่
--
-- patch นี้ให้บิลเก็บ snapshot ขององค์ประกอบทั้งหมด ณ ตอนออกบิล เพื่อให้ใบแจ้งหนี้เป็น
-- "ภาพนิ่ง" ที่อธิบายที่มาของทุกตัวเลขได้ และตรงกันทุกช่องทางที่แสดง
--
-- =========================================================================
-- ปลอดภัยที่จะรันเมื่อไหร่ก็ได้ — เพิ่มคอลัมน์ nullable ล้วน ๆ
-- =========================================================================
-- ทุกคอลัมน์เป็น nullable ไม่มี NOT NULL ไม่มี default:
--   · โค้ดเดิมที่ยังรันอยู่ insert/update โดยไม่ระบุคอลัมน์เหล่านี้ได้ตามปกติ
--   · บิลเก่าที่ออกไปแล้วจะมีค่าเป็น null ทั้งหมด ซึ่งฝั่งโค้ดใช้เป็นสัญญาณว่า
--     "ใบนี้ไม่มี snapshot" แล้วถอยไปใช้พฤติกรรมเดิม → บิลเก่าแสดงผลไม่เปลี่ยนไปจากทุกวันนี้
--
-- ⚠️ จงใจไม่ backfill ข้อมูลเก่า — องค์ประกอบ ณ ตอนที่ออกบิลนั้นไม่มีใครเก็บไว้ การเดาย้อนหลัง
-- จากค่า config ปัจจุบันจะได้ตัวเลขที่ "ดูน่าเชื่อแต่ไม่จริง" ลงในเอกสารการเงิน ซึ่งแย่กว่า
-- การยอมรับว่าใบเก่าไม่มีข้อมูลนี้
--
-- ⚠️ patch นี้ไม่แตะ bills.amount จึงไม่กระทบ QR พร้อมเพย์
--    QR อ่านยอดจาก bills.amount ตรง ๆ ไม่ได้คำนวณจากรายการย่อย (portal/page.tsx: totalAmount)
--
-- ปลอดภัยที่จะรันซ้ำได้ (add column if not exists)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. ค่าเช่าห้องพัก ณ ตอนออกบิล
-- =========================================================================
-- เก็บค่าที่ใช้คิดจริง ไม่ใช่ค่า config ปัจจุบันของห้อง — ห้องอาจถูกเปลี่ยนค่าเช่าหรือเปลี่ยน
-- ประเภทห้องหลังออกบิลไปแล้ว ใบที่ผู้เช่าถืออยู่ต้องยังแสดงตัวเลขเดิม
alter table public.bills
  add column if not exists base_rent numeric;

-- =========================================================================
-- 2. ยอดค่าไฟ/ค่าน้ำที่คิดจริง + อัตราที่ใช้
-- =========================================================================
-- เก็บ "ยอดที่คิด" แยกจาก "อัตรา" เพราะยอดอาจไม่เท่ากับ (หน่วย × อัตรา) ตรง ๆ — มีกรณีคิด
-- ขั้นต่ำ (ใช้ 3 หน่วยแต่คิดขั้นต่ำ 10 หน่วย) การเก็บยอดไว้ตรง ๆ ทำให้ไม่ต้องเดาย้อนว่าใบนั้น
-- เข้าเงื่อนไขขั้นต่ำหรือไม่ ซึ่งการตั้งค่าขั้นต่ำก็เปลี่ยนได้ภายหลังเช่นกัน
alter table public.bills
  add column if not exists electric_amount numeric,
  add column if not exists water_amount numeric,
  add column if not exists electric_rate numeric,
  add column if not exists water_rate numeric;

-- =========================================================================
-- 3. ค่าส่วนกลาง ณ ตอนออกบิล
-- =========================================================================
alter table public.bills
  add column if not exists common_fee numeric;

-- =========================================================================
-- 4. เลขมิเตอร์ก่อน-หลัง ที่ใช้คิดใบนี้
-- =========================================================================
-- ปัจจุบันหน้าแสดงบิลไปอ่านเลขมิเตอร์สดจากตาราง meter_records ซึ่งอาจถูกแก้หลังออกบิลแล้ว
-- ทำให้เห็น "เลขมิเตอร์ชุดใหม่" คู่กับ "จำนวนหน่วยชุดเก่า" ในบรรทัดเดียวกัน
alter table public.bills
  add column if not exists elec_prev numeric,
  add column if not exists elec_curr numeric,
  add column if not exists water_prev numeric,
  add column if not exists water_curr numeric;

-- =========================================================================
-- 5. ค่าใช้จ่ายเสริมรายห้อง ณ ตอนออกบิล
-- =========================================================================
-- rooms.extra_expenses แก้ได้ตลอดเวลา บิลที่ออกไปแล้วต้องคงรายการเดิมที่คิดเงินไปจริง
alter table public.bills
  add column if not exists extra_expenses jsonb;

-- =========================================================================
-- 6. คำอธิบายคอลัมน์
-- =========================================================================
comment on column public.bills.base_rent is 'snapshot: ค่าเช่าห้องที่คิดจริงตอนออกบิล (null = บิลเก่าที่ออกก่อนมี snapshot)';
comment on column public.bills.electric_amount is 'snapshot: ยอดค่าไฟที่คิดจริง (รวมกรณีคิดขั้นต่ำแล้ว)';
comment on column public.bills.water_amount is 'snapshot: ยอดค่าน้ำที่คิดจริง (รวมกรณีคิดขั้นต่ำแล้ว)';
comment on column public.bills.electric_rate is 'snapshot: อัตราค่าไฟต่อหน่วยที่ใช้ตอนออกบิล';
comment on column public.bills.water_rate is 'snapshot: อัตราค่าน้ำต่อหน่วยที่ใช้ตอนออกบิล';
comment on column public.bills.common_fee is 'snapshot: ค่าส่วนกลางที่คิดตอนออกบิล';
comment on column public.bills.elec_prev is 'snapshot: เลขมิเตอร์ไฟครั้งก่อนที่ใช้คิดใบนี้';
comment on column public.bills.elec_curr is 'snapshot: เลขมิเตอร์ไฟครั้งนี้ที่ใช้คิดใบนี้';
comment on column public.bills.water_prev is 'snapshot: เลขมิเตอร์น้ำครั้งก่อนที่ใช้คิดใบนี้';
comment on column public.bills.water_curr is 'snapshot: เลขมิเตอร์น้ำครั้งนี้ที่ใช้คิดใบนี้';
comment on column public.bills.extra_expenses is 'snapshot: ค่าใช้จ่ายเสริมรายห้องที่คิดในใบนี้ [{name, amount}]';

-- =========================================================================
-- 7. ตรวจผลหลังรัน
-- =========================================================================
-- คอลัมน์ต้องครบ 11 ตัว:
--   select column_name, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'bills'
--     and column_name in ('base_rent','electric_amount','water_amount','electric_rate',
--                         'water_rate','common_fee','elec_prev','elec_curr','water_prev',
--                         'water_curr','extra_expenses')
--   order by column_name;
--   → ทุกแถวต้องเป็น is_nullable = YES
--
-- บิลเก่าต้องยังเป็น null ทั้งหมด (ยังไม่มีการ backfill):
--   select count(*) as บิลทั้งหมด,
--          count(base_rent) as มี_snapshot_แล้ว
--   from public.bills;
--   → หลังรัน patch ทันที: มี_snapshot_แล้ว = 0
--   → หลังออกบิลใบใหม่: ตัวเลขนี้จะเริ่มเพิ่มขึ้น

-- =========================================================================
-- 8. เพิ่มเติม: การคิดขั้นต่ำ ณ ตอนออกบิล
-- =========================================================================
-- คำอธิบายบนใบแจ้งหนี้ ("ค่าไฟฟ้า (ขั้นต่ำ 10 หน่วย)" และคอลัมน์อัตราที่แสดง "-" แทนอัตรา)
-- เป็นข้อมูล ณ ตอนออกบิลเหมือนกับตัวเลขเงิน
--
-- เดิมฝั่งพิมพ์ใบคำนวณเงื่อนไขนี้ใหม่จากการตั้งค่าปัจจุบัน:
--     isElecMin = !waiveElectricMin && electricMinChecked && electricUnits <= electricMinUnit
-- ทำให้ถ้าเปลี่ยนการตั้งค่าขั้นต่ำหลังออกบิลไปแล้ว ใบเดิมจะได้ "ยอดถูกแต่ป้ายผิด"
-- เช่นยอด 70 บาทที่มาจากขั้นต่ำ 10 หน่วย แต่ป้ายไม่ขึ้นคำว่าขั้นต่ำ หรือขึ้นเลขหน่วยผิด
--
-- เก็บ "ผลลัพธ์" (คิดขั้นต่ำหรือไม่) ไม่ใช่ "เงื่อนไขตั้งต้น" ทั้งชุด — ด้วยเหตุผลเดียวกับที่
-- ข้อ 2 เก็บยอดที่คิดแทนอัตรา: ฝั่งอ่านไม่ต้องคิดสูตรซ้ำ จึงไม่มีทางคิดต่างจากตอนออกบิล
-- (ค่า *_min_unit เก็บไว้ด้วยเพราะต้องใช้เติมตัวเลขในข้อความป้าย)
alter table public.bills
  add column if not exists elec_min_applied boolean,
  add column if not exists water_min_applied boolean,
  add column if not exists electric_min_unit numeric,
  add column if not exists water_min_unit numeric;

comment on column public.bills.elec_min_applied is 'snapshot: ใบนี้คิดค่าไฟแบบขั้นต่ำหรือไม่ (ใช้เลือกข้อความป้ายบนใบแจ้งหนี้)';
comment on column public.bills.water_min_applied is 'snapshot: ใบนี้คิดค่าน้ำแบบขั้นต่ำหรือไม่';
comment on column public.bills.electric_min_unit is 'snapshot: จำนวนหน่วยขั้นต่ำค่าไฟที่ใช้ตอนออกบิล (สำหรับข้อความ "ขั้นต่ำ N หน่วย")';
comment on column public.bills.water_min_unit is 'snapshot: จำนวนหน่วยขั้นต่ำค่าน้ำที่ใช้ตอนออกบิล';

-- ตรวจ (ต้องได้ 4 แถว ทุกแถว is_nullable = YES):
--   select column_name, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'bills'
--     and column_name in ('elec_min_applied','water_min_applied','electric_min_unit','water_min_unit');


------------------------------------------------------------------------------
-- [15/20]  database_patch_add_saas_payments_manual_review.sql
------------------------------------------------------------------------------

-- Patch: add_saas_payments_manual_review
-- วันที่: 2026-07-23
--
-- เพิ่มคอลัมน์สำหรับให้ Super Admin ตรวจสอบสลิปจ่ายเงิน subscription ด้วยตนเอง (manual review) เมื่อ SlipOK
-- ตรวจสอบผิดพลาดหรือค้างสถานะ "รอตรวจสอบ" — ใช้คู่กับ manuallyReviewSaasPaymentAction() ใน
-- src/features/subscription/actions.ts
--
-- manual_review_note = หมายเหตุที่ Super Admin กรอกตอนอนุมัติ/ปฏิเสธ (ถ้ามี)
-- reviewed_by/reviewed_at = ใครและเมื่อไหร่ที่ตรวจสอบด้วยตนเอง (audit trail สำหรับรายการเกี่ยวกับเงิน)
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.saas_payments
  add column if not exists manual_review_note text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;


------------------------------------------------------------------------------
-- [16/20]  database_patch_add_saas_payments_archived_drive_url.sql
------------------------------------------------------------------------------

-- Patch: add_saas_payments_archived_drive_url
-- วันที่: 2026-07-21
--
-- เพิ่มคอลัมน์ใหม่ใน public.saas_payments เพื่อเก็บลิงก์ไฟล์สลิปที่ archive ขึ้น Google Drive
-- ก่อนลบไฟล์จริงออกจาก Supabase Storage bucket 'payment-slips' (cron cleanup-slips)
-- ใช้ IF NOT EXISTS จึงปลอดภัยที่จะรันซ้ำได้ (idempotent)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.saas_payments
  add column if not exists archived_drive_url text null;


------------------------------------------------------------------------------
-- [17/20]  database_patch_add_super_admin_line_settings.sql
------------------------------------------------------------------------------

-- Patch: add_super_admin_line_settings
-- วันที่: 2026-07-23
--
-- เพิ่มตาราง public.super_admin_line_settings เพื่อให้ Super Admin ของ HorSet เอง (ไม่ใช่เจ้าของหอ)
-- ตั้งค่า LINE OA ของทีมงาน HorSet สำหรับรับการแจ้งเตือนระดับระบบ เช่น มีหอพักสมัครใหม่, subscription
-- ของหอพักไหนถูกล็อกสิทธิ์, หรือสลิปจ่ายเงิน subscription ตรวจสอบไม่ผ่านครบจำนวนครั้ง retry แล้ว
--
-- คนละตารางกับ public.workspace_line_settings (ของแต่ละหอพักเอง) โดยเจตนา — เป็น single-row config
-- ไม่ผูก workspace_id ใดๆ มิเรอร์ pattern เดียวกับ public.line_quota_cache
--
-- ปลอดภัยที่จะรันซ้ำได้ (CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS ก่อน CREATE POLICY)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

create table if not exists public.super_admin_line_settings (
  id integer primary key default 1 check (id = 1),
  channel_access_token text,
  admin_line_user_id text,
  admin_line_group_id text,
  notification_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.super_admin_line_settings enable row level security;

drop policy if exists "Super Admins can manage super admin line settings" on public.super_admin_line_settings;
create policy "Super Admins can manage super admin line settings"
  on public.super_admin_line_settings for all
  using (public.get_current_user_role() = 'super_admin');


------------------------------------------------------------------------------
-- [18/20]  database_patch_add_super_admin_line_connection.sql
------------------------------------------------------------------------------

-- Patch: add_super_admin_line_connection
-- วันที่: 2026-07-23
--
-- ทำให้ Super Admin เชื่อมต่อ LINE User ID ของตัวเองได้ง่ายแบบเดียวกับ workspace admin (พิมพ์รหัส 6 หลัก
-- ในแชท LINE OA แล้วระบบผูกบัญชีให้อัตโนมัติ) แทนการต้องไปคัดลอก LINE User ID มาวางเองแบบ manual
--
-- 1. เพิ่ม channel_secret ให้ super_admin_line_settings (คอลัมน์เดิมยังไม่มี ต่างจาก workspace_line_settings
--    ที่มีอยู่แล้ว) — ใช้ตรวจสอบ signature ของ webhook LINE ของ Super Admin เอง
-- 2. สร้างตาราง super_admin_connection_codes มิเรอร์ public.admin_connection_codes แต่ตัด workspace_id
--    ออกไปเลย (คนละแนวคิดกับของ workspace ที่ผูกกับ workspace_id เสมอ) — single-scope สำหรับ Super Admin
--    เท่านั้น ใช้คู่กับ generateSuperAdminConnectionCodeAction() ใน src/features/super-admin/actions.ts
--    และ scope=super_admin ใน src/app/api/webhook/line/route.ts
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.super_admin_line_settings
  add column if not exists channel_secret text;

create table if not exists public.super_admin_connection_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  is_used boolean not null default false
);

create index if not exists idx_super_admin_connection_codes_code_unused
  on public.super_admin_connection_codes (code) where is_used = false;

alter table public.super_admin_connection_codes enable row level security;

drop policy if exists "Super Admins can manage their own connection codes" on public.super_admin_connection_codes;
create policy "Super Admins can manage their own connection codes"
  on public.super_admin_connection_codes for all
  using (public.get_current_user_role() = 'super_admin');


------------------------------------------------------------------------------
-- [19/20]  database_patch_add_super_admin_line_quota_behavior.sql
------------------------------------------------------------------------------

-- Patch: add_super_admin_line_quota_behavior
-- วันที่: 2026-07-23
--
-- เพิ่มตัวเลือกให้ Super Admin กำหนดพฤติกรรมเมื่อโควต้าข้อความ LINE หมด (คงเหลือ 0):
--   'skip'        (ค่า default) — ข้ามการส่งและปิดการแจ้งเตือนอัตโนมัติ ปลอดภัยจากค่าใช้จ่ายเกินโควต้า
--   'send_anyway' — ยิงส่งต่อไปตามปกติแม้โควต้าฟรีหมดแล้ว (ยอมรับความเสี่ยงค่าใช้จ่ายส่วนเกินถ้าแพ็กเกจคิดเงิน)
-- ใช้คู่กับ sendLineSuperAdminNotificationAction()/getSuperAdminLineQuotaAction() ใน
-- src/features/notification/actions.ts และ src/features/super-admin/actions.ts
--
-- ปลอดภัยที่จะรันซ้ำได้ (ADD COLUMN IF NOT EXISTS)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.super_admin_line_settings
  add column if not exists quota_exceeded_behavior text not null default 'skip'
    check (quota_exceeded_behavior in ('skip', 'send_anyway'));


------------------------------------------------------------------------------
-- [20/20]  database_patch_add_workspace_google_drive_settings.sql
------------------------------------------------------------------------------

-- Patch: add_workspace_google_drive_settings
-- วันที่: 2026-07-23
--
-- เพิ่มตาราง public.workspace_google_drive_settings เพื่อให้แต่ละ workspace (หอพัก) เชื่อมต่อ
-- Google Drive ของตัวเองได้ สำหรับ archive สลิปค่าเช่า (bills.slip_url) ก่อนลบออกจาก storage
-- คนละเรื่องกับ system_settings.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN ซึ่งเป็นบัญชี Drive กลางของ HorSet
-- เอง (ใช้ archive สลิป subscription เท่านั้น) — ทุก workspace ใช้ OAuth Client ID/Secret ตัวเดียวกัน
-- ของ HorSet (system_settings.GOOGLE_DRIVE_OAUTH_CLIENT_ID/SECRET) แค่คนละ refresh_token/โฟลเดอร์
--
-- โครงสร้างมิเรอร์จาก public.workspace_line_settings ที่มีอยู่แล้ว (workspace_id เป็น primary key)
--
-- ปลอดภัยที่จะรันซ้ำได้ (CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS ก่อน CREATE POLICY)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

create table if not exists public.workspace_google_drive_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  refresh_token text,        -- เข้ารหัสด้วย encryptText (src/lib/encryption.ts) ก่อนเก็บเสมอ
  folder_id text,            -- โฟลเดอร์หลักที่แอปสร้างให้อัตโนมัติตอนอัปโหลดครั้งแรก
  folder_name text,          -- ชื่อโฟลเดอร์ที่ workspace กำหนดเอง (ถ้าไม่ตั้งใช้ค่า default ของระบบ)
  updated_at timestamptz not null default now()
);

alter table public.workspace_google_drive_settings enable row level security;

drop policy if exists "Users can manage their own workspace google drive settings" on public.workspace_google_drive_settings;
create policy "Users can manage their own workspace google drive settings"
  on public.workspace_google_drive_settings for all
  using (
    workspace_id = public.get_current_user_workspace_id()
    or public.get_current_user_role() = 'super_admin'
  );

