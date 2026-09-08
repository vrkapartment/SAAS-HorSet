-- Patch: audit_logs_lock (ขั้นที่ 3 จาก 3 — ขั้นสุดท้าย)
-- วันที่: 2026-09-08
--
-- ═══════════════════════════════════════════════════════════════════════
-- ล็อก audit_logs ให้ "เขียนได้ทางเดียวคือผ่าน trigger" และลบไม่ได้
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⚠️⚠️ อ่านก่อนรัน — ขั้นนี้ย้อนกลับได้ยากในทางปฏิบัติ
--
-- หลังรันไฟล์นี้:
--   - ไม่มี role ใดที่แอปใช้ (anon / authenticated / service_role) แก้หรือลบ log ได้
--   - แม้แต่ service-role ที่ bypass RLS ก็ทำไม่ได้ เพราะเป็นการถอนสิทธิ์ระดับตาราง
--     ซึ่งอยู่เหนือ RLS (RLS ป้องกัน TRUNCATE ไม่ได้เลย จึงต้องกันที่ระดับนี้)
--   - เขียน log ได้เฉพาะผ่าน trigger audit_capture() ซึ่งเป็น SECURITY DEFINER
--     ทำงานในสิทธิ์เจ้าของฟังก์ชัน (postgres) จึงไม่ถูกกระทบจากการ REVOKE
--
-- สิ่งที่ยังทำได้อยู่ (ยอมรับตั้งแต่ออกแบบ):
--   - role postgres ผ่าน Supabase SQL Editor ยังลบได้ — เป็นทางออกฉุกเฉินที่จำเป็น
--     และทิ้งร่องรอยคนละชั้น (ต้องเข้าถึง dashboard ไม่ใช่ช่องทางที่แอปเปิดไว้)
--
-- ต้องรันขั้นที่ 1 และ 2 ให้ครบ + ผ่าน QA เรื่องการกรองความลับก่อน
-- (ไฟล์นี้จะหยุดทำงานเองถ้า trigger ยังไม่ครบ 7 ตัว)
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
    or (after  -> 'line_user_id' is not null and (after  ->> 'line_user_id') <> '(ซ่อนไว้)');

  if _leaks > 0 then
    raise exception
      'พบ % แถวที่มีข้อมูลอ่อนไหวไม่ถูกกรอง — ห้ามล็อกตอนนี้ '
      'ให้ลบแถวเหล่านั้น (ยังลบได้เพราะยังไม่ REVOKE) แล้วแก้ audit_capture() ก่อน',
      _leaks;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════
-- ล็อก
-- ═══════════════════════════════════════════════════════════════════════
--
-- ถอน INSERT ด้วย: trigger เขียนได้อยู่แล้วในสิทธิ์เจ้าของฟังก์ชัน
-- ผลคือแอปสร้างแถว log ปลอมไม่ได้ ต้องเกิดจากการแก้ข้อมูลจริงเท่านั้น

revoke insert, update, delete, truncate on public.audit_logs from anon;
revoke insert, update, delete, truncate on public.audit_logs from authenticated;
revoke insert, update, delete, truncate on public.audit_logs from service_role;

-- คงสิทธิ์อ่านไว้ (RLS คุมว่าใครเห็นแถวไหน)
grant select on public.audit_logs to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- ตรวจผล
-- ═══════════════════════════════════════════════════════════════════════

select
  grantee                                                  as "role",
  string_agg(privilege_type, ', ' order by privilege_type)  as "สิทธิ์ที่เหลือ",
  case
    when bool_or(privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))
      then 'ยังเขียน/ลบได้ ⚠️'
    when bool_or(privilege_type = 'SELECT')
      then 'อ่านได้เท่านั้น ✅'
    else 'ไม่มีสิทธิ์เลย'
  end                                                      as "สรุป"
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'audit_logs'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee
order by grantee;
