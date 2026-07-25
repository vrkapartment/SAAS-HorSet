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
