-- Patch: audit_actor_from_server (ขั้นที่ 2.5 — ทำก่อนขั้นที่ 3 ที่ล็อกถาวร)
-- วันที่: 2026-09-08
--
-- ═══════════════════════════════════════════════════════════════════════
-- ทำให้ audit log รู้ว่า "ใครทำ" แม้ตอนที่โค้ดต้องเขียนผ่าน Service Role
-- ═══════════════════════════════════════════════════════════════════════
--
-- ── ปัญหาที่เจอจากการลองใช้หน้าจอจริง ──
-- แก้ "เลขพร้อมเพย์" ในหน้าตั้งค่าหอ แล้ว log ขึ้นว่า "ระบบ" ทำ ไม่มีชื่อคนแก้
--
-- สาเหตุ: saveFinanceSettings / saveTaxSettings / savePropertyLogoUrl ต้องเขียน
-- ผ่าน Service Role เพราะ RLS ของตาราง workspaces อนุญาตให้แก้ได้เฉพาะ admin ของหอ
-- ในขณะที่หน้าเหล่านั้นเปิดให้ staff ที่ได้รับสิทธิ์แก้ไขบันทึกได้ด้วย
-- Service Role ไม่มี JWT ติดไป จึงทำให้ auth.uid() เป็น null และ trigger ไม่รู้ว่าใครทำ
--
-- นี่คือจุดกันโกงอันดับหนึ่ง (เลขพร้อมเพย์คือปลายทางของเงินทุกบาท) ปล่อยไว้ไม่ได้
--
-- ── สิ่งที่ไฟล์นี้ทำ ──
-- เพิ่มชั้นสำรองในการหาตัวคนทำ:
--   ชั้นที่ 1  auth.uid() จาก JWT      => actor_source = 'jwt'      (พิสูจน์แล้ว)
--   ชั้นที่ 2  header x-horset-actor    => actor_source = 'server'   (เซิร์ฟเวอร์แจ้ง)
--   ไม่มีทั้งคู่                         => actor_source = 'unknown'  (ระบบ/ไม่ทราบ)
--
-- ── น้ำหนักหลักฐานของ 'server' ──
-- header ถูกใส่โดยโค้ดฝั่งเซิร์ฟเวอร์ หลังตรวจ session ด้วย supabase.auth.getUser()
-- แล้วเท่านั้น (ดู src/lib/supabase/service-actor.ts) ปลอมได้เฉพาะผู้ที่ถือ
-- SUPABASE_SERVICE_ROLE_KEY ซึ่งไม่เคยถูกส่งถึงเบราว์เซอร์ พนักงานทั่วไปจึงปลอมไม่ได้
--
-- แต่ยังต่ำกว่า 'jwt' หนึ่งขั้น เพราะเป็นการ "แจ้ง" ไม่ใช่การ "พิสูจน์ด้วยลายเซ็น"
-- หน้าจอจึงต้องแยกป้ายให้เห็นชัด ไม่กลืนเป็นอันเดียวกับ 'jwt'
--
-- ปลอดภัยที่จะรันซ้ำได้ · ไม่แตะข้อมูลที่จดไปแล้ว · ไม่แตะ trigger (แค่แทนฟังก์ชัน)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
-- 0. กันรันผิดลำดับ
-- ═══════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'audit_capture'
  ) then
    raise exception
      'ยังไม่มีฟังก์ชัน audit_capture — กรุณารัน database_patch_add_audit_logs.sql (ขั้นที่ 1) ก่อน';
  end if;
end
$guard$;


-- ═══════════════════════════════════════════════════════════════════════
-- 1. แทนฟังก์ชันจดบันทึก (เปลี่ยนเฉพาะส่วน "ใครทำ")
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⚠️ ยังตั้งใจไม่มี EXCEPTION handler ครอบการเขียน log (fail-closed)
--    ถ้าจดไม่ได้ การแก้ข้อมูลต้องล้มไปด้วย ไม่งั้นคนที่รู้จะจงใจทำให้ trigger พัง
--    เพื่อแก้ข้อมูลแบบไม่ทิ้งร่องรอย
--    (มี handler อยู่จุดเดียวคือตอนอ่าน header ซึ่งไม่เกี่ยวกับการเขียน log)

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
  _actor_src  text := 'unknown';
  _hdr        text;
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
  -- ชั้นที่ 1: JWT ของผู้ใช้ — เซ็นด้วยลายเซ็นดิจิทัล ปลอมไม่ได้
  if _actor is not null then
    _actor_src := 'jwt';
  else
    -- ชั้นที่ 2: header ที่โค้ดฝั่งเซิร์ฟเวอร์ใส่มาให้ หลังตรวจ session แล้ว
    -- (จำเป็นสำหรับ action ที่ต้องเขียนผ่าน Service Role เช่นบันทึกตั้งค่าหอ)
    --
    -- ครอบ exception ไว้เฉพาะการอ่าน header เท่านั้น — ถ้า header ไม่ใช่ JSON
    -- ที่อ่านได้ ก็แค่ถือว่าไม่มีตัวตนติดมา ไม่ทำให้การจด log ทั้งก้อนล้ม
    begin
      _hdr := current_setting('request.headers', true)::json ->> 'x-horset-actor';
    exception when others then
      _hdr := null;
    end;

    if _hdr ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      _actor := _hdr::uuid;
      _actor_src := 'server';
    end if;
  end if;

  if _actor is not null then
    select p.full_name, p.role into _actor_name, _actor_role
    from public.profiles p where p.id = _actor;

    -- id ที่ไม่มีตัวตนอยู่จริงในระบบ = header เชื่อถือไม่ได้
    -- ถอยไปเป็น 'unknown' ดีกว่าจดชื่อผิดคน (log ที่ชี้ผิดคนอันตรายกว่า log ที่ว่าง)
    if _actor_src = 'server' and _actor_role is null then
      _actor := null;
      _actor_name := null;
      _actor_src := 'unknown';
    end if;
  end if;

  insert into public.audit_logs (
    workspace_id, actor_id, actor_name, actor_role, actor_source,
    action, table_name, record_id, record_label, changed_fields, before, after
  ) values (
    _ws,
    _actor,
    _actor_name,
    _actor_role,
    _actor_src,
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
-- 2. อัปเดตคำอธิบายคอลัมน์ให้ตรงกับความจริงใหม่
-- ═══════════════════════════════════════════════════════════════════════

comment on column public.audit_logs.actor_source is
  'jwt = พิสูจน์ตัวตนจาก JWT ปลอมไม่ได้ / server = โค้ดฝั่งเซิร์ฟเวอร์แจ้งมาหลังตรวจ session (ปลอมได้เฉพาะผู้ถือ service role key) / unknown = ไม่มีตัวตนติดมา (cron, webhook, ลิงก์ผู้เช่า)';


-- ═══════════════════════════════════════════════════════════════════════
-- 3. ตรวจผล
-- ═══════════════════════════════════════════════════════════════════════
--
-- ต้องได้ 'ok' ทั้งสองแถว
-- หลังจากนั้นให้ไปกด "บันทึก" ในหน้าตั้งค่าการเงิน แล้วเปิดดูประวัติการแก้ไข
-- แถวใหม่ของ "ตั้งค่าหอ" ต้องขึ้นชื่อคนทำ พร้อมป้าย "เซิร์ฟเวอร์ยืนยัน" ไม่ใช่ "ระบบ"

select
  'ฟังก์ชันอ่าน header ได้แล้ว' as "รายการตรวจ",
  case when pg_get_functiondef(p.oid) like '%x-horset-actor%' then 'ok' else 'ยังไม่อัปเดต' end as "ผล"
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'audit_capture'

union all

select
  'trigger ยังอยู่ครบ 7 ตัวและเปิดใช้งาน' as "รายการตรวจ",
  case when count(*) = 7 then 'ok' else 'เหลือ ' || count(*) || ' ตัว — ต้องได้ 7' end as "ผล"
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and t.tgname like 'audit_%'
  and not t.tgisinternal
  and t.tgenabled = 'O';
