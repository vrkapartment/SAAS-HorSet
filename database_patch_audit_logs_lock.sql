-- Patch: audit_logs_lock (ขั้นที่ 3 จาก 3 — ขั้นสุดท้าย)
-- วันที่: 2026-09-08
--
-- ═══════════════════════════════════════════════════════════════════════
-- ล็อก audit_logs ให้ "เขียนได้ทางเดียวคือผ่าน trigger" และลบไม่ได้
-- ═══════════════════════════════════════════════════════════════════════
--
-- หลังรันไฟล์นี้:
--   - ไม่มี role ใดที่แอปใช้ (anon / authenticated / service_role) แก้หรือลบ log ได้
--   - แม้แต่ service-role ที่ bypass RLS ก็ทำไม่ได้ เพราะเป็นการถอนสิทธิ์ระดับตาราง
--     ซึ่งอยู่เหนือ RLS (RLS ป้องกัน TRUNCATE ไม่ได้เลย จึงต้องกันที่ระดับนี้)
--   - เขียน log ได้เฉพาะผ่าน trigger audit_capture() ซึ่งเป็น SECURITY DEFINER
--     ทำงานในสิทธิ์เจ้าของฟังก์ชัน จึงไม่ถูกกระทบจากการ REVOKE (ตัวกันพลาด 5 ตรวจให้)
--
-- ── ย้อนกลับได้ไหม ──
-- ได้ ไฟล์นี้เปลี่ยนแค่สิทธิ์ระดับตาราง คืนสภาพเดิมได้ด้วยคำสั่งนี้ใน SQL Editor:
--
--   grant insert, update, delete, truncate on public.audit_logs to service_role;
--   grant insert, update, delete, truncate on public.audit_logs to authenticated;
--   grant insert, update, delete, truncate on public.audit_logs to anon;
--
-- (REVOKE ข้างล่างระบุแค่ 4 สิทธิ์นี้ ไม่แตะ select / references / trigger
--  จึงคืนได้ตรงสภาพเดิม)
--
-- สิ่งที่ไฟล์นี้เปลี่ยนจริง ๆ ไม่ใช่ "ทำไม่ได้อีกเลย" แต่คือ "ทำได้เฉพาะทางที่ยากกว่า":
-- ยกการลบหลักฐานออกจากมือทุกคนที่ไม่มีรหัส Supabase — พนักงาน แอดมิน super admin
-- และโค้ดในแอปทุกเส้นทาง รวมถึงบั๊กที่เขียนพลาด ทำไม่ได้ทั้งหมด
--
-- ความเสี่ยงที่เหลือ (ยอมรับตั้งแต่ออกแบบ):
--   - role postgres ผ่าน Supabase SQL Editor ยังลบและปลดล็อกได้ — เป็นทางออก
--     ฉุกเฉินที่จำเป็น และเป็นช่องทางคนละชั้น (ต้องเข้าถึง dashboard
--     ไม่ใช่ช่องทางที่แอปเปิดไว้)
--   - ถ้าต้องการอุดจุดนี้ ต้องใช้กลไกคนละแบบ เช่นส่ง log ออกไปเก็บนอกฐานข้อมูล
--
-- ต้องรันไฟล์เหล่านี้ให้ครบก่อน + ผ่าน QA เรื่องการกรองความลับ:
--   1. database_patch_add_audit_logs.sql
--   2. database_patch_audit_logs_all_tables.sql
--   3. database_patch_audit_actor_from_server.sql
--   4. database_patch_audit_ignore_machine_state.sql
--   5. database_patch_audit_cleanup_before_lock.sql
--
-- ไฟล์นี้มีตัวกันพลาด 5 ชั้นที่จะหยุดทำงานเองถ้ายังไม่พร้อม (ดูด้านล่าง)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
-- ตัวกันพลาด 1 — trigger ต้องครบ 7 ตัวก่อนล็อก
-- ═══════════════════════════════════════════════════════════════════════
--
-- ถ้าล็อกตอน trigger ยังไม่ครบ จะเหลือตารางที่แก้ได้โดยไม่ทิ้งร่องรอย
-- แล้วเราจะเข้าใจผิดว่าระบบคุมครบแล้ว

do $$
declare
  _expected text[] := array[
    'audit_bills', 'audit_expenses', 'audit_rooms', 'audit_meter_records',
    'audit_tenants', 'audit_workspaces', 'audit_profiles'
  ];
  _found  text[];
  _missing text[];
begin
  select coalesce(array_agg(tgname order by tgname), array[]::text[])
    into _found
  from pg_trigger
  where tgname = any(_expected) and not tgisinternal and tgenabled = 'O';

  select coalesce(array_agg(e order by e), array[]::text[])
    into _missing
  from unnest(_expected) e
  where not (e = any(_found));

  if array_length(_missing, 1) is not null then
    raise exception
      'ยังติด trigger ไม่ครบ (ขาด: %) — กรุณารันขั้นที่ 2 ให้เสร็จและผ่าน QA ก่อนล็อก',
      array_to_string(_missing, ', ');
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════
-- ตัวกันพลาด 2 — ต้องมี log จากทั้ง 7 ตารางแล้ว (พิสูจน์ว่าเคยทดสอบจริง)
-- ═══════════════════════════════════════════════════════════════════════
--
-- เตือนอย่างเดียว ไม่บล็อก — บางตารางอาจยังไม่มีเหตุการณ์เกิดขึ้นจริง
-- แต่ถ้าตารางที่มีความลับ (workspaces / tenants / profiles) ยังไม่เคยถูกจด
-- แปลว่ายังไม่ได้ทดสอบกฎกรอง ซึ่งอันตรายที่จะล็อกตอนนี้

do $$
declare _untested text[];
begin
  select coalesce(array_agg(t order by t), array[]::text[])
    into _untested
  from unnest(array['workspaces', 'tenants', 'profiles']) t
  where not exists (select 1 from public.audit_logs where table_name = t);

  if array_length(_untested, 1) is not null then
    raise exception
      'ตารางที่มีข้อมูลอ่อนไหวยังไม่เคยถูกจด log เลย (%) — ยังไม่ได้ทดสอบกฎกรองความลับ '
      'กรุณาแก้ข้อมูลในตารางเหล่านั้นแล้วตรวจว่า promptpay_id/tenant_phone ถูกซ่อน ก่อนล็อก',
      array_to_string(_untested, ', ');
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════
-- ตัวกันพลาด 3 — ต้องไม่มีความลับหลุดอยู่ใน log ตอนนี้
-- ═══════════════════════════════════════════════════════════════════════
--
-- ตรวจหาค่าที่ "ควรถูกซ่อนแต่ไม่ถูกซ่อน" — ถ้าเจอ ต้องแก้ก่อนล็อก
-- ไม่งั้นข้อมูลนั้นจะค้างอยู่ตลอดไปโดยลบไม่ได้

do $$
declare _leaks int;
begin
  select count(*) into _leaks
  from public.audit_logs
  where
    -- promptpay/tax_id ที่ไม่ได้ถูกแปลงเป็นรูป ••• 4 ตัวท้าย
    (before -> 'promptpay_id' is not null and (before ->> 'promptpay_id') not like '•••%')
    or (after  -> 'promptpay_id' is not null and (after  ->> 'promptpay_id') not like '•••%')
    or (before -> 'tax_id' is not null and (before ->> 'tax_id') not like '•••%')
    or (after  -> 'tax_id' is not null and (after  ->> 'tax_id') not like '•••%')
    -- เบอร์โทร/LINE UID ที่ไม่ได้ถูกซ่อน
    or (before -> 'tenant_phone' is not null and (before ->> 'tenant_phone') <> '(ซ่อนไว้)')
    or (after  -> 'tenant_phone' is not null and (after  ->> 'tenant_phone') <> '(ซ่อนไว้)')
    or (before -> 'line_user_id' is not null and (before ->> 'line_user_id') <> '(ซ่อนไว้)')
    or (after  -> 'line_user_id' is not null and (after  ->> 'line_user_id') <> '(ซ่อนไว้)')
    -- LINE UID ของแอดมินที่ผูกเมนูล่างไว้
    --
    -- ตอนนี้เป็นการกันไว้เผื่ออนาคตเท่านั้น ไม่ใช่ช่องรั่วที่มีอยู่จริง:
    -- คอลัมน์นี้อยู่บนตาราง workspace_line_settings ซึ่งไม่ได้ติด trigger
    -- จึงไม่มีทางเข้ามาอยู่ใน log ได้ในสภาพปัจจุบัน
    --
    -- เก็บการตรวจไว้เพราะถ้าวันหนึ่งเพิ่ม trigger ให้ตารางนั้น (ซึ่งมีเหตุผล —
    -- มันเก็บ channel_access_token ที่ถ้าถูกสลับจะเปลี่ยนปลายทางการแจ้งเตือน)
    -- ชื่อคอลัมน์นี้ไม่ตรงกับ line_user_id จึงจะรอดกฎซ่อนความลับ
    or (before ? 'richmenu_admin_linked_uids')
    or (after  ? 'richmenu_admin_linked_uids');

  if _leaks > 0 then
    raise exception
      'พบ % แถวที่มีข้อมูลอ่อนไหวไม่ถูกกรอง — ห้ามล็อกตอนนี้ '
      'ให้รัน database_patch_audit_ignore_machine_state.sql แล้วต่อด้วย '
      'database_patch_audit_cleanup_before_lock.sql ก่อน (ยังลบได้เพราะยังไม่ REVOKE)',
      _leaks;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════
-- ตัวกันพลาด 4 — กฎ "คอลัมน์ที่ไม่ต้องจด" ต้องถูกติดตั้งแล้ว
-- ═══════════════════════════════════════════════════════════════════════
--
-- ถ้ายังไม่ได้ติดตั้ง log จะเต็มไปด้วยสวิตช์ภายในของระบบ (สลิปใบเดียว = 7 แถว)
-- แล้วเรื่องจริงจะจมหาย ซึ่งทำให้ระบบกันโกงใช้ไม่ได้จริง
-- ต้องกันไว้ก่อนล็อก เพราะหลังล็อกแล้วล้างของเก่าออกไม่ได้

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'audit_capture'
      and pg_get_functiondef(p.oid) like '%audit_ignored_columns%'
  ) then
    raise exception
      'audit_capture ยังไม่ได้ใช้ audit_ignored_columns — '
      'กรุณารัน database_patch_audit_ignore_machine_state.sql ก่อนล็อก';
  end if;

  if exists (
    select 1 from public.audit_logs
    where table_name in ('tenants', 'workspaces')
      and changed_fields is not null
      and array_length(changed_fields, 1) > 0
      and changed_fields <@ public.audit_ignored_columns(table_name)
  ) then
    raise exception
      'ยังมีแถวสภาวะภายในของระบบค้างอยู่ใน log — '
      'กรุณารัน database_patch_audit_cleanup_before_lock.sql ก่อนล็อก';
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════
-- ตัวกันพลาด 5 — ล็อกแล้ว trigger ต้องยังเขียน log ได้
-- ═══════════════════════════════════════════════════════════════════════
--
-- นี่คือความเสี่ยงร้ายแรงที่สุดของไฟล์นี้
--
-- audit_capture เป็น fail-closed โดยตั้งใจ (ถ้าจดไม่ได้ การแก้ข้อมูลต้องล้ม)
-- ดังนั้นถ้าการ REVOKE ทำให้ trigger เขียนไม่ได้ ผลไม่ใช่ "log ขาดหาย"
-- แต่คือ "บันทึกบิล/มิเตอร์/ผู้เช่า ไม่ได้ทั้งระบบ"
--
-- เหตุผลที่ควรปลอดภัย: audit_capture เป็น SECURITY DEFINER จึงทำงานในสิทธิ์
-- ของเจ้าของฟังก์ชัน ไม่ใช่สิทธิ์ของ role ที่เรียก และถ้าเจ้าของฟังก์ชันเป็น
-- เจ้าของตาราง audit_logs ด้วย สิทธิ์นั้นมาจากความเป็นเจ้าของ ซึ่ง REVOKE
-- ข้างล่างไม่ได้แตะเลย (ถอนจาก anon / authenticated / service_role เท่านั้น)
--
-- แต่ต้องพิสูจน์ ไม่ใช่เชื่อ — จึงตรวจเงื่อนไขทั้งสองข้อก่อนล็อก

do $$
declare
  _fn_owner    name;
  _tbl_owner   name;
  _is_secdef   boolean;
begin
  select pg_get_userbyid(p.proowner), p.prosecdef
    into _fn_owner, _is_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'audit_capture';

  select pg_get_userbyid(c.relowner)
    into _tbl_owner
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'audit_logs';

  if not coalesce(_is_secdef, false) then
    raise exception
      'audit_capture ไม่ใช่ SECURITY DEFINER — ถ้าล็อกตอนนี้ trigger จะเขียน log ไม่ได้ '
      'และเพราะ trigger เป็น fail-closed ระบบจะบันทึกข้อมูลไม่ได้ทั้งระบบ';
  end if;

  if _fn_owner is distinct from _tbl_owner then
    raise exception
      'เจ้าของฟังก์ชัน audit_capture (%) ไม่ใช่เจ้าของตาราง audit_logs (%) — '
      'สิทธิ์เขียนของ trigger จึงอาจมาจาก grant ที่ไฟล์นี้กำลังจะถอน ห้ามล็อก',
      _fn_owner, _tbl_owner;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════
-- ล็อก
-- ═══════════════════════════════════════════════════════════════════════
--
-- ถอน INSERT ด้วย: trigger เขียนได้อยู่แล้วในสิทธิ์เจ้าของฟังก์ชัน (ตรวจแล้วข้างบน)
-- ผลคือแอปสร้างแถว log ปลอมไม่ได้ ต้องเกิดจากการแก้ข้อมูลจริงเท่านั้น

revoke insert, update, delete, truncate on public.audit_logs from anon;
revoke insert, update, delete, truncate on public.audit_logs from authenticated;
revoke insert, update, delete, truncate on public.audit_logs from service_role;

-- คงสิทธิ์อ่านไว้ (RLS คุมว่าใครเห็นแถวไหน)
grant select on public.audit_logs to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- ตรวจผล
-- ═══════════════════════════════════════════════════════════════════════
--
-- ไล่จากรายชื่อ role เป็นหลัก (left join) ไม่ใช่จากตารางสิทธิ์
-- เพราะ role ที่ถูกถอนสิทธิ์หมดจะ "ไม่มีแถว" ในตารางสิทธิ์เลย
-- ถ้าไล่จากตารางสิทธิ์ ผลลัพธ์จะขาดไปเฉย ๆ ซึ่งแยกไม่ออกจาก query เขียนผิด
--
-- ต้องได้:
--   anon           = ไม่มีสิทธิ์เลย ✅
--   authenticated  = อ่านได้เท่านั้น ✅
--   service_role   = อ่านได้เท่านั้น ✅

select
  r.role                                                        as "role",
  coalesce(string_agg(g.privilege_type, ', ' order by g.privilege_type), '(ไม่มี)')
                                                                as "สิทธิ์ที่เหลือ",
  case
    when bool_or(g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))
      then 'ยังเขียน/ลบได้ ⚠️'
    when bool_or(g.privilege_type = 'SELECT')
      then 'อ่านได้เท่านั้น ✅'
    else 'ไม่มีสิทธิ์เลย ✅'
  end                                                           as "สรุป"
from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
left join information_schema.role_table_grants g
  on g.grantee = r.role
 and g.table_schema = 'public'
 and g.table_name = 'audit_logs'
group by r.role
order by r.role;


-- ═══════════════════════════════════════════════════════════════════════
-- หลังรันเสร็จ ต้องทดลองใช้จริงอีกครั้ง
-- ═══════════════════════════════════════════════════════════════════════
--
-- การ REVOKE ไม่ควรกระทบการจด log เพราะ trigger ทำงานในสิทธิ์เจ้าของฟังก์ชัน
-- (SECURITY DEFINER, เจ้าของคือ postgres) แต่ต้องพิสูจน์ ไม่ใช่เชื่อ
--
--   1. ไปแก้ค่าปรับในบิลใบใดใบหนึ่ง แล้วกดบันทึก
--      → ต้องบันทึกได้ปกติ (ถ้า error แปลว่าล็อกกระทบการเขียน ต้องแจ้งทันที)
--   2. เปิด ตั้งค่า › ประวัติการแก้ไข
--      → ต้องเห็นแถวใหม่ พร้อมชื่อคุณและป้าย "ยืนยันตัวตน"
--
-- ถ้าข้อ 1 ล้ม ให้คืนสิทธิ์ชั่วคราวด้วยคำสั่งนี้ใน SQL Editor แล้วแจ้งทันที:
--   grant insert on public.audit_logs to service_role;
