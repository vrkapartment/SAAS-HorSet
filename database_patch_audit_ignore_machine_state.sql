-- Patch: audit_ignore_machine_state (ขั้นที่ 2.6 — ทำก่อนขั้นที่ 3 ที่ล็อกถาวร)
-- วันที่: 2026-09-09
--
-- ═══════════════════════════════════════════════════════════════════════
-- ไม่จดคอลัมน์ที่เป็น "สภาวะภายในของระบบ" ลง audit log
-- ═══════════════════════════════════════════════════════════════════════
--
-- ── ปัญหาที่ 1: log ท่วมด้วยแถวที่ไม่มีความหมาย ──
-- ผู้เช่าส่งสลิป 1 ใบผ่าน Rich menu ใน LINE ทำให้เกิด log 6-7 แถว
-- เพราะ tenants.slip_armed_at / slip_target_bill_id เป็นสวิตช์ที่ระบบใช้จำว่า
-- กำลังรอรูปสลิปของบิลใบไหน ถูกเขียน 3 ครั้งต่อสลิป 1 ใบ (เปิด → เลือกบิล → ปิด)
-- คูณจำนวนห้องที่ผู้เช่าคนนั้นเช่า
--
-- ผลคือแถวที่มีความหมายจริง (บิลเปลี่ยนสถานะ ค่าปรับขึ้น 200) จมหายไปในกองขยะ
-- ซึ่งทำให้ระบบกันโกงใช้ไม่ได้จริง เพราะไม่มีใครอ่าน log ที่อ่านไม่รู้เรื่อง
--
-- ── ปัญหาที่ 2 (ร้ายแรงกว่า): LINE user id หลุดลง log ──
-- workspaces.richmenu_admin_linked_uids เก็บ LINE user id ของแอดมินที่ผูกเมนูไว้
-- กฎปิดบังข้อมูลอ่อนไหวมองหาชื่อคอลัมน์ 'line_user_id' ตรง ๆ จึงไม่ครอบตัวนี้
-- → id ถูกเขียนลง log แบบเต็ม ๆ
--
-- และ guard ในไฟล์ขั้นที่ 3 ตรวจแค่ promptpay_id กับ tenant_phone จึงปล่อยผ่าน
-- ถ้าล็อกถาวรไปก่อน ข้อมูลนี้จะลบไม่ได้อีกเลย
--
-- ── โครงสร้างใหม่ ──
-- ย้ายรายการ "คอลัมน์ที่ไม่ต้องจด" ออกมาเป็นฟังก์ชันเล็ก ๆ ของตัวเอง
-- ครั้งต่อไปที่ต้องเพิ่ม/ลดคอลัมน์ จะแทนแค่ฟังก์ชันนั้น ไม่ต้องแตะ audit_capture
-- ทั้งก้อน (ลดโอกาสพิมพ์ตกหล่นในฟังก์ชันที่เป็นหัวใจของระบบหลักฐาน)
--
-- ปลอดภัยที่จะรันซ้ำได้ · ไม่แตะ trigger · ไม่แตะข้อมูลที่จดไปแล้ว
--
-- ⚠️ ไฟล์นี้ทำให้ "ของใหม่" ไม่ถูกจด แต่แถวที่จดไว้แล้วยังอยู่
--    ให้รัน database_patch_audit_cleanup_before_lock.sql ต่อ เพื่อล้างของเก่า
--    ก่อนล็อกถาวร
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
-- 1. รายการคอลัมน์ที่ไม่ต้องจด (ที่เดียวในระบบ)
-- ═══════════════════════════════════════════════════════════════════════
--
-- หลักการตัดสินว่าคอลัมน์ไหนควรอยู่ในรายการนี้:
--   ✅ ใส่ได้   — ค่าที่ "ระบบ" เขียนเองเพื่อจำสถานะการทำงาน ไม่ใช่คนตั้งใจแก้
--   ❌ ห้ามใส่  — ค่าที่คนกรอก/กดเปลี่ยนได้ แม้จะดูไม่สำคัญก็ต้องจด
--
-- ถ้าไม่แน่ใจ ให้จดไว้ก่อน — log ที่รกยังแก้ที่หน้าจอได้ แต่หลักฐานที่ไม่ได้จด
-- ย้อนกลับไปเอาไม่ได้

create or replace function public.audit_ignored_columns(_table text)
returns text[]
language sql
immutable
as $ignored$
  select case _table

    -- สวิตช์รับสลิปทาง LINE — ระบบเปิด/ปิดเองทุกครั้งที่ผู้เช่ากดปุ่ม
    -- (ดู armAllRooms / setTargetBill / disarm ใน src/features/notification/line-slip.ts)
    when 'tenants' then array[
      'updated_at', 'created_at',
      'slip_armed_at', 'slip_target_bill_id'
    ]

    -- ร่องรอยการติดตั้ง Rich menu ที่ LINE คืนค่ามาให้ ไม่ใช่การตั้งค่าของคน
    --
    -- ⚠️ richmenu_admin_linked_uids อยู่ในนี้เพราะเก็บ LINE user id ของแอดมิน
    --    ซึ่งเป็นข้อมูลส่วนบุคคลที่ไม่เกี่ยวกับการกันโกง
    --
    -- ตั้งใจ "ไม่" ใส่: richmenu_enabled, richmenu_admin_enabled,
    -- richmenu_image_url, richmenu_admin_image_url, richmenu_contact_uri,
    -- richmenu_liff_id — ทั้งหมดนี้คนกดเปลี่ยนเอง ต้องจด
    when 'workspaces' then array[
      'updated_at', 'created_at',
      'richmenu_id', 'richmenu_installed_at', 'richmenu_template_version',
      'richmenu_admin_id', 'richmenu_admin_installed_at',
      'richmenu_admin_template_version', 'richmenu_admin_linked_uids',
      'richmenu_admin_installed_image_url'
    ]

    else array['updated_at', 'created_at']
  end;
$ignored$;

-- ไม่ต้องให้ใครเรียกผ่าน API — audit_capture เป็น security definer จึงเรียกได้เอง
revoke execute on function public.audit_ignored_columns(text) from public;
revoke execute on function public.audit_ignored_columns(text) from anon;
revoke execute on function public.audit_ignored_columns(text) from authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 2. แทนฟังก์ชันจดบันทึก (เปลี่ยนเฉพาะบรรทัดที่อ่านรายการข้างบน)
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⚠️ ยังตั้งใจไม่มี EXCEPTION handler ครอบการเขียน log (fail-closed)
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

  -- คอลัมน์ที่ไม่ต้องจด — รายการอยู่ในฟังก์ชัน audit_ignored_columns ข้างบน
  _ignore     text[] := public.audit_ignored_columns(tg_table_name);
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
-- 3. ตรวจผล
-- ═══════════════════════════════════════════════════════════════════════
--
-- ต้องได้ 'ok' ทั้ง 6 แถว

select 'ฟังก์ชันรายการคอลัมน์ที่ไม่ต้องจด มีอยู่' as "รายการตรวจ",
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'audit_ignored_columns'
       ) then 'ok' else 'ไม่พบ' end as "ผล"

union all

select 'audit_capture เรียกใช้ฟังก์ชันนั้นแล้ว',
       case when pg_get_functiondef(p.oid) like '%audit_ignored_columns%'
            then 'ok' else 'ยังไม่อัปเดต' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'audit_capture'

union all

select 'สวิตช์รับสลิปของผู้เช่าถูกกันแล้ว',
       case when 'slip_armed_at' = any(public.audit_ignored_columns('tenants'))
             and 'slip_target_bill_id' = any(public.audit_ignored_columns('tenants'))
            then 'ok' else 'ยังไม่ถูกกัน' end

union all

select 'LINE user id ของแอดมินถูกกันแล้ว',
       case when 'richmenu_admin_linked_uids' = any(public.audit_ignored_columns('workspaces'))
            then 'ok' else 'ยังไม่ถูกกัน' end

union all

select 'ยังจดการตั้งค่าที่คนกดเปลี่ยนเอง (ต้องไม่ถูกกัน)',
       case when 'richmenu_admin_enabled' = any(public.audit_ignored_columns('workspaces'))
              or 'promptpay_id' = any(public.audit_ignored_columns('workspaces'))
            then 'ผิด — กันมากเกินไป' else 'ok' end

union all

select 'trigger ยังอยู่ครบ 7 ตัวและเปิดใช้งาน',
       case when count(*) = 7 then 'ok' else 'เหลือ ' || count(*) || ' ตัว — ต้องได้ 7' end
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and t.tgname like 'audit_%'
  and not t.tgisinternal and t.tgenabled = 'O';
