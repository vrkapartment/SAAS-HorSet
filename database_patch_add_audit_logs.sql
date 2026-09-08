-- Patch: add_audit_logs (ขั้นที่ 1 จาก 2)
-- วันที่: 2026-09-08
--
-- ═══════════════════════════════════════════════════════════════════════
-- ระบบ Audit Log สำหรับกันโกง / ตรวจย้อนหลังว่าใครแก้เลข
-- ═══════════════════════════════════════════════════════════════════════
--
-- ขั้นที่ 1 (ไฟล์นี้): ตาราง + RLS + ฟังก์ชันจดบันทึก + ติด trigger "แค่ตาราง bills"
-- ขั้นที่ 2 (ไฟล์ถัดไป): ติด trigger อีก 6 ตาราง + ล็อกไม่ให้ลบ log (REVOKE)
--
-- ทำไมแบ่ง 2 ขั้น:
--   1. trigger เป็นแบบ fail-closed — ถ้ามันพัง การบันทึกบิล/มิเตอร์จะล้มทั้งรายการ
--      ติดทีละตารางแล้วทดสอบก่อน ปลอดภัยกว่าติด 7 ตัวพร้อมกัน
--   2. REVOKE ทำเป็นขั้นสุดท้าย เพราะหลัง REVOKE จะลบ log ไม่ได้อีกเลย
--      ถ้ากฎกรองข้อมูลอ่อนไหวผิด แล้วเลขพร้อมเพย์เต็ม ๆ ถูกเขียนลงไป จะแก้ไม่ได้
--      จึงเว้นช่วงตรวจสอบไว้ก่อนล็อกถาวร
--
-- ปลอดภัยที่จะรันซ้ำได้
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
-- 1. ตารางเก็บ log
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),

  -- หอพักที่เหตุการณ์นี้เกิดขึ้น (ใช้กรองและใช้ใน RLS)
  workspace_id  uuid,

  -- ใครทำ — เก็บ snapshot ชื่อกับบทบาทไว้ด้วย เพราะถ้าคนนั้นถูกลบบัญชีภายหลัง
  -- log ต้องยังบอกได้ว่าใครทำ ไม่กลายเป็น uuid ลอย ๆ ที่หาต้นตอไม่ได้
  actor_id      uuid,
  actor_name    text,
  actor_role    text,

  -- น้ำหนักของหลักฐาน — สำคัญมาก ต้องแสดงในหน้า log ด้วย
  --   'jwt'     = ยืนยันจาก JWT ที่เซ็นด้วยลายเซ็นดิจิทัล ปลอมไม่ได้
  --   'unknown' = เขียนผ่าน service-role ซึ่งไม่มีตัวตนติดมา (เช่น cron, webhook,
  --               หรือ super-admin action ที่ยังย้ายไป JWT ไม่ได้)
  actor_source  text not null default 'unknown',

  action        text not null,   -- INSERT | UPDATE | DELETE
  table_name    text not null,
  record_id     uuid,

  -- ป้ายอ่านง่ายของแถวนั้น เช่น "ห้อง 134 · รอบ 2026-08"
  -- เก็บไว้ตอนเกิดเหตุ เพราะแถวต้นทางอาจถูกลบหรือแก้ไปแล้วตอนมาอ่าน log
  record_label  text,

  changed_fields text[],
  before        jsonb,
  after         jsonb
);

comment on table public.audit_logs is
  'บันทึกการแก้ข้อมูลสำหรับตรวจสอบย้อนหลัง — เขียนได้จาก trigger เท่านั้น ห้ามแก้/ลบ';
comment on column public.audit_logs.actor_source is
  'jwt = ยืนยันตัวตนจาก JWT ปลอมไม่ได้ / unknown = เขียนผ่าน service-role ไม่มีตัวตน';

create index if not exists audit_logs_workspace_time_idx
  on public.audit_logs (workspace_id, created_at desc);
create index if not exists audit_logs_record_idx
  on public.audit_logs (table_name, record_id);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);


-- ═══════════════════════════════════════════════════════════════════════
-- 2. สิทธิ์และ RLS
-- ═══════════════════════════════════════════════════════════════════════
--
-- ตอนนี้ให้แค่ SELECT — การเขียนทำผ่าน trigger ที่เป็น SECURITY DEFINER
-- จึงไม่ต้อง grant INSERT ให้ role ใดเลย
--
-- ⚠️ REVOKE UPDATE/DELETE/TRUNCATE อยู่ในไฟล์ขั้นที่ 2 (ดูเหตุผลด้านบน)

alter table public.audit_logs enable row level security;

grant select on public.audit_logs to authenticated;

-- แอดมินเห็น log ของหอตัวเอง
drop policy if exists "audit_select_workspace_admin" on public.audit_logs;
create policy "audit_select_workspace_admin"
  on public.audit_logs for select
  using (
    workspace_id = get_current_user_workspace_id()
    and get_current_user_role() = 'admin'
  );

-- ทีมงานเห็นได้เฉพาะหอที่เจ้าของหอกดอนุมัติสิทธิ์เข้าช่วยเหลือแล้ว
-- (กฎเดียวกับ bills / rooms / tenants / expenses / meter_records)
drop policy if exists "audit_select_super_admin_needs_grant" on public.audit_logs;
create policy "audit_select_super_admin_needs_grant"
  on public.audit_logs for select
  using (
    get_current_user_role() = 'super_admin'
    and exists (
      select 1 from public.support_access_grants g
      where g.workspace_id = audit_logs.workspace_id
        and g.status = 'approved'
    )
  );

-- ตั้งใจไม่มี policy สำหรับ staff — staff ไม่ต้องเห็นประวัติการแก้ไขของใคร


-- ═══════════════════════════════════════════════════════════════════════
-- 3. ฟังก์ชันจดบันทึก
-- ═══════════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER เพื่อให้ trigger เขียน audit_logs ได้ แม้จะ REVOKE INSERT
-- ออกจากทุก role แล้วในขั้นที่ 2 — ผลคือ "เขียน log ได้ทางเดียวคือผ่าน trigger"
--
-- ⚠️ ตั้งใจไม่มี EXCEPTION handler (fail-closed)
--    ถ้าจดไม่ได้ การแก้ข้อมูลต้องล้มไปด้วย ไม่งั้นคนที่รู้จะจงใจทำให้ trigger พัง
--    เพื่อแก้ข้อมูลแบบไม่ทิ้งร่องรอย

create or replace function public.audit_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $audit$
declare
  _old        jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  _new        jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  _row        jsonb := case when tg_op = 'DELETE' then _old else _new end;

  -- คอลัมน์ที่ไม่ต้องจด (เปลี่ยนทุกครั้งอยู่แล้ว ไม่ได้บอกอะไร)
  _ignore     text[] := array['updated_at', 'created_at'];
  -- คอลัมน์ที่จดว่า "เปลี่ยน" ได้ แต่ห้ามเก็บค่าจริง
  _mask_full  text[] := array['tenant_phone', 'line_user_id', 'channel_access_token', 'channel_secret'];
  -- คอลัมน์ที่เก็บได้แค่ 4 ตัวท้าย
  _mask_tail  text[] := array['promptpay_id', 'tax_id'];
  -- ตารางที่จดได้เฉพาะบางคอลัมน์ (ที่เหลือเป็นข้อมูลส่วนบุคคล ไม่เกี่ยวกับการกันโกง)
  _allow_only text[];

  _changed    text[] := array[]::text[];
  _b          jsonb := '{}'::jsonb;
  _a          jsonb := '{}'::jsonb;

  _key        text;
  _ov         jsonb;
  _nv         jsonb;

  _ws         uuid;
  _label      text;
  _actor      uuid := auth.uid();
  _actor_name text;
  _actor_role text;
begin
  -- profiles มีทั้งอีเมล ชื่อ เบอร์โทร — จดเฉพาะสิ่งที่เกี่ยวกับสิทธิ์
  if tg_table_name = 'profiles' then
    _allow_only := array['role', 'permissions', 'workspace_id'];
  end if;

  -- ── หาว่าคอลัมน์ไหนเปลี่ยน แล้วเก็บเฉพาะคอลัมน์นั้น ──
  for _key in select jsonb_object_keys(_old || _new) loop
    continue when _key = any(_ignore);
    continue when _allow_only is not null and not (_key = any(_allow_only));

    _ov := _old -> _key;
    _nv := _new -> _key;
    continue when _ov is not distinct from _nv;

    _changed := array_append(_changed, _key);

    if _key = any(_mask_full) then
      _b := _b || jsonb_build_object(_key, case when _ov is null then null else '(ซ่อนไว้)' end);
      _a := _a || jsonb_build_object(_key, case when _nv is null then null else '(ซ่อนไว้)' end);
    elsif _key = any(_mask_tail) then
      _b := _b || jsonb_build_object(_key,
        case when _ov is null or _ov = 'null'::jsonb then null
             else '•••' || right(_ov #>> '{}', 4) end);
      _a := _a || jsonb_build_object(_key,
        case when _nv is null or _nv = 'null'::jsonb then null
             else '•••' || right(_nv #>> '{}', 4) end);
    else
      -- jsonb ก้อนใหญ่ (extra_expenses, utility_segments, permissions) อาจโตได้
      -- ถ้าเกิน 2 KB เก็บแค่ว่าเปลี่ยน ไม่เก็บค่า เพื่อไม่ให้แถว log บวมจนอ่านไม่ไหว
      _b := _b || jsonb_build_object(_key,
        case when length(coalesce(_ov::text, '')) > 2048 then to_jsonb('(ข้อมูลยาวเกิน)'::text) else _ov end);
      _a := _a || jsonb_build_object(_key,
        case when length(coalesce(_nv::text, '')) > 2048 then to_jsonb('(ข้อมูลยาวเกิน)'::text) else _nv end);
    end if;
  end loop;

  -- ไม่มีอะไรเปลี่ยนที่ต้องจด (เช่นแก้แต่ updated_at) — ไม่ต้องเขียน log
  if tg_op = 'UPDATE' and array_length(_changed, 1) is null then
    return null;
  end if;

  -- ── หา workspace ของแถวนี้ ──
  if tg_table_name = 'workspaces' then
    _ws := (_row ->> 'id')::uuid;
  else
    _ws := nullif(_row ->> 'workspace_id', '')::uuid;
  end if;

  -- ── ป้ายอ่านง่าย ──
  _label := case tg_table_name
    when 'bills'         then 'ห้อง ' || coalesce(_row ->> 'room_number', '-') ||
                              ' · รอบ ' || coalesce(_row ->> 'billing_cycle', '-')
    when 'meter_records' then 'ห้อง ' || coalesce(_row ->> 'room_number', '-') ||
                              ' · รอบ ' || coalesce(_row ->> 'billing_cycle', '-')
    when 'rooms'         then 'ห้อง ' || coalesce(_row ->> 'room_number', '-')
    when 'expenses'      then coalesce(_row ->> 'title', '(ไม่มีชื่อรายการ)')
    when 'workspaces'    then coalesce(_row ->> 'name', '-')
    when 'profiles'      then 'ผู้ใช้บทบาท ' || coalesce(_row ->> 'role', '-')
    when 'tenants'       then (
      select 'ห้อง ' || coalesce(r.room_number, '-')
      from public.rooms r where r.id = nullif(_row ->> 'room_id', '')::uuid
    )
    else null
  end;

  -- ── ใครทำ ──
  -- auth.uid() มีค่าเฉพาะเมื่อเขียนผ่าน JWT ของผู้ใช้ ซึ่งปลอมไม่ได้
  -- ถ้าเป็น null แปลว่าเขียนผ่าน service-role (cron / webhook / บาง action)
  if _actor is not null then
    select p.full_name, p.role into _actor_name, _actor_role
    from public.profiles p where p.id = _actor;
  end if;

  insert into public.audit_logs (
    workspace_id, actor_id, actor_name, actor_role, actor_source,
    action, table_name, record_id, record_label, changed_fields, before, after
  ) values (
    _ws,
    _actor,
    _actor_name,
    _actor_role,
    case when _actor is not null then 'jwt' else 'unknown' end,
    tg_op,
    tg_table_name,
    nullif(_row ->> 'id', '')::uuid,
    _label,
    case when tg_op = 'UPDATE' then _changed else null end,
    case when tg_op = 'INSERT' then null else _b end,
    case when tg_op = 'DELETE' then null else _a end
  );

  return null;  -- AFTER trigger ไม่สนค่าที่คืน
end
$audit$;


-- ═══════════════════════════════════════════════════════════════════════
-- 4. ติด trigger — ขั้นนี้แค่ตาราง bills เท่านั้น
-- ═══════════════════════════════════════════════════════════════════════
--
-- ทดสอบให้ผ่านก่อน แล้วค่อยติดอีก 6 ตารางในไฟล์ขั้นที่ 2

drop trigger if exists audit_bills on public.bills;
create trigger audit_bills
  after insert or update or delete on public.bills
  for each row execute function public.audit_capture();


-- ═══════════════════════════════════════════════════════════════════════
-- 5. ตรวจผล
-- ═══════════════════════════════════════════════════════════════════════

select
  'ตาราง audit_logs'                              as "รายการ",
  (select count(*) from public.audit_logs)::text  as "ค่า"
union all
select 'trigger ที่ติดแล้ว',
       string_agg(tgname, ', ')
from pg_trigger where tgname like 'audit_%' and not tgisinternal
union all
select 'policy ของ audit_logs',
       string_agg(policyname, ', ')
from pg_policies where schemaname = 'public' and tablename = 'audit_logs';


-- ═══════════════════════════════════════════════════════════════════════
-- ถอนออกทันทีถ้าพบปัญหา — รันบรรทัดนี้แยก
-- ═══════════════════════════════════════════════════════════════════════
--   drop trigger if exists audit_bills on public.bills;
