-- Patch: SaaS Subscription (HorSet เก็บเงินค่าใช้บริการจากเจ้าของหอพัก)
-- เพิ่ม: saas_plans, buildings, workspace_subscriptions, saas_payments, saas_payment_retry_queue
-- ทุก statement ใช้ IF NOT EXISTS / ON CONFLICT DO NOTHING เพื่อให้ run ซ้ำได้อย่างปลอดภัย

-- =========================================================================
-- 1. saas_plans — นิยามแผนการใช้งาน (Trial/Starter/Pro/Business)
-- =========================================================================
create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('trial', 'starter', 'pro', 'business')),
  name text not null,
  price_monthly numeric not null default 0,
  price_yearly numeric,
  max_rooms integer, -- null = ไม่จำกัด
  max_staff integer, -- null = ไม่จำกัด
  max_buildings integer, -- null = ไม่จำกัด
  features jsonb not null default '{}'::jsonb, -- { line_notify, tax_export, slipok_auto_verify }
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.saas_plans (code, name, price_monthly, price_yearly, max_rooms, max_staff, max_buildings, features)
values
  ('trial', 'ทดลองใช้ฟรี', 0, 0, null, null, null, '{"line_notify": true, "tax_export": true, "slipok_auto_verify": true}'::jsonb),
  ('starter', 'Starter', 279, 2790, 30, 1, 1, '{"line_notify": true, "tax_export": false, "slipok_auto_verify": false}'::jsonb),
  ('pro', 'Pro', 579, 5790, 100, 5, 1, '{"line_notify": true, "tax_export": true, "slipok_auto_verify": true}'::jsonb),
  ('business', 'Business', 1479, null, 500, null, null, '{"line_notify": true, "tax_export": true, "slipok_auto_verify": true}'::jsonb)
on conflict (code) do nothing;

create or replace function public.handle_saas_plans_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_saas_plans_updated_at on public.saas_plans;
create trigger set_saas_plans_updated_at
before update on public.saas_plans
for each row execute function public.handle_saas_plans_updated_at();

alter table public.saas_plans enable row level security;

drop policy if exists "Anyone authenticated can read saas plans" on public.saas_plans;
create policy "Anyone authenticated can read saas plans"
on public.saas_plans for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

drop policy if exists "Super admins can manage saas plans" on public.saas_plans;
create policy "Super admins can manage saas plans"
on public.saas_plans for all
using (public.get_current_user_role() = 'super_admin');


-- =========================================================================
-- 2. buildings — จัดกลุ่มห้องพักเป็นหลายอาคารภายใน workspace เดียว (Multi-property แบบเบา)
-- =========================================================================
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_buildings_workspace_id on public.buildings (workspace_id);

-- สร้างอาคารหลักให้ทุก workspace ที่มีอยู่แล้ว เพื่อให้ห้องเดิมทั้งหมดมีอาคารสังกัด
insert into public.buildings (workspace_id, name)
select w.id, 'อาคารหลัก'
from public.workspaces w
where not exists (select 1 from public.buildings b where b.workspace_id = w.id)
on conflict do nothing;

alter table public.rooms add column if not exists building_id uuid references public.buildings(id) on delete set null;

-- ผูกห้องเดิมทั้งหมดเข้ากับอาคารหลักของ workspace ตัวเอง
update public.rooms r
set building_id = b.id
from public.buildings b
where r.building_id is null and b.workspace_id = r.workspace_id and b.name = 'อาคารหลัก';

create index if not exists idx_rooms_building_id on public.rooms (building_id);

create or replace function public.handle_buildings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_buildings_updated_at on public.buildings;
create trigger set_buildings_updated_at
before update on public.buildings
for each row execute function public.handle_buildings_updated_at();

alter table public.buildings enable row level security;

drop policy if exists "Read buildings in workspace or support approved" on public.buildings;
create policy "Read buildings in workspace or support approved"
on public.buildings for select
using (
  workspace_id = public.get_current_user_workspace_id()
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = buildings.workspace_id and status = 'approved')
  )
);

drop policy if exists "Manage buildings in workspace or support approved" on public.buildings;
create policy "Manage buildings in workspace or support approved"
on public.buildings for all
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() in ('admin', 'staff'))
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = buildings.workspace_id and status = 'approved')
  )
);


-- =========================================================================
-- 3. workspace_subscriptions — สถานะแผน/รอบบิลของแต่ละ workspace (1:1)
-- =========================================================================
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

create index if not exists idx_workspace_subscriptions_status on public.workspace_subscriptions (status);

-- สร้างแถว trial 30 วันให้ทุก workspace ที่มีอยู่แล้วและยังไม่มี subscription (ใช้แผน pro เป็นสิทธิ์ระหว่าง trial)
insert into public.workspace_subscriptions (workspace_id, plan_id, status, trial_ends_at)
select w.id, (select id from public.saas_plans where code = 'pro'), 'trial', now() + interval '30 days'
from public.workspaces w
where not exists (select 1 from public.workspace_subscriptions s where s.workspace_id = w.id)
on conflict (workspace_id) do nothing;

create or replace function public.handle_workspace_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_workspace_subscriptions_updated_at on public.workspace_subscriptions;
create trigger set_workspace_subscriptions_updated_at
before update on public.workspace_subscriptions
for each row execute function public.handle_workspace_subscriptions_updated_at();

-- สร้างแถว trial ให้ workspace ใหม่ทุกครั้งที่ถูกสร้าง (ต่อยอด flow เดียวกับ handle_new_user ใน schema_multi_workspace.sql)
create or replace function public.handle_new_workspace_subscription()
returns trigger as $$
begin
  insert into public.workspace_subscriptions (workspace_id, plan_id, status, trial_ends_at)
  values (
    new.id,
    (select id from public.saas_plans where code = 'pro'),
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

alter table public.workspace_subscriptions enable row level security;

drop policy if exists "Read own workspace subscription" on public.workspace_subscriptions;
create policy "Read own workspace subscription"
on public.workspace_subscriptions for select
using (
  workspace_id = public.get_current_user_workspace_id()
  or public.get_current_user_role() = 'super_admin'
);

drop policy if exists "Super admins can manage workspace subscriptions" on public.workspace_subscriptions;
create policy "Super admins can manage workspace subscriptions"
on public.workspace_subscriptions for all
using (public.get_current_user_role() = 'super_admin');

-- หมายเหตุ: ไม่มี policy insert/update ให้ role admin/staff โดยตรง — การเปลี่ยนแผน/ต่ออายุ
-- ต้องผ่าน Server Action ที่ใช้ Service Role Client เท่านั้น (หลังตรวจสอบสลิปผ่าน SlipOK)


-- =========================================================================
-- 4. saas_payments — ประวัติการจ่ายเงินค่า subscription ของแต่ละ workspace
-- =========================================================================
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

create index if not exists idx_saas_payments_workspace_id on public.saas_payments (workspace_id);

alter table public.saas_payments enable row level security;

drop policy if exists "Read own workspace saas payments" on public.saas_payments;
create policy "Read own workspace saas payments"
on public.saas_payments for select
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() = 'admin')
  or public.get_current_user_role() = 'super_admin'
);

drop policy if exists "Workspace admins can upload saas payment slips" on public.saas_payments;
create policy "Workspace admins can upload saas payment slips"
on public.saas_payments for insert
with check (
  workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() = 'admin'
);

drop policy if exists "Super admins can manage saas payments" on public.saas_payments;
create policy "Super admins can manage saas payments"
on public.saas_payments for all
using (public.get_current_user_role() = 'super_admin');


-- =========================================================================
-- 5. saas_payment_retry_queue — retry อัตโนมัติเมื่อ SlipOK ตอบ error ชั่วคราว (1009/1010)
-- =========================================================================
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

create index if not exists idx_saas_payment_retry_queue_due
  on public.saas_payment_retry_queue (status, next_retry_at)
  where status = 'pending';

alter table public.saas_payment_retry_queue enable row level security;

-- ตารางนี้เข้าถึงได้เฉพาะผ่าน Service Role Client เท่านั้น (Server Action ตอนอัปโหลดสลิป + Cron Job)
-- ไม่มี policy ให้ client ปกติ (anon/authenticated) เข้าถึงได้เลย เหมือน slipok_retry_queue เดิม