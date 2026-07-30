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
