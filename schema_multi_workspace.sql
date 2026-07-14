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
create or replace function public.handle_new_user()
returns trigger as $$
declare
  default_ws_id uuid;
begin
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

create policy "Read meter_replacements for tenants" on public.meter_replacements for select
using (
  public.get_current_user_role() = 'tenant'
  and workspace_id = public.get_current_user_workspace_id()
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
