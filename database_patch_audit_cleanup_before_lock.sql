-- Patch: audit_cleanup_before_lock (ขั้นที่ 2.7 — ขั้นสุดท้ายก่อนล็อกถาวร)
-- วันที่: 2026-09-09
--
-- ═══════════════════════════════════════════════════════════════════════
-- ล้าง log ที่จดไว้ก่อนแก้กฎ ให้เหลือแต่ของที่มีความหมาย
-- ═══════════════════════════════════════════════════════════════════════
--
-- ไฟล์ก่อนหน้า (audit_ignore_machine_state) ทำให้ "ของใหม่" ไม่ถูกจด
-- แต่แถวที่จดไว้แล้วยังอยู่ ไฟล์นี้ล้างของเก่าออก
--
-- ── ทำไมต้องล้างก่อนล็อก ──
-- ขั้นที่ 3 (database_patch_audit_logs_lock.sql) จะ REVOKE สิทธิ์ลบแบบถาวร
-- หลังจากนั้นแอปลบ log ไม่ได้อีกเลย ซึ่งเป็นเรื่องที่ต้องการ
-- แต่แปลว่าต้องแน่ใจก่อนว่าไม่มีอะไรที่ไม่ควรอยู่ในนั้นค้างไว้
--
-- ── ลบอะไร ──
--   1. แถวที่ทุกคอลัมน์ที่เปลี่ยนเป็นสภาวะภายในของระบบ (สวิตช์รับสลิป,
--      ร่องรอยการติดตั้ง Rich menu) — ไม่มีความหมายในการตรวจย้อนหลัง
--   2. คีย์ richmenu_admin_linked_uids (LINE user id ของแอดมิน) ที่ปนอยู่ในแถว
--      ซึ่งมีของจริงด้วย — ตัดออกเฉพาะคีย์นั้น ไม่ลบทั้งแถว
--
-- ── ไม่ลบอะไร ──
-- ทุกแถวที่มีคอลัมน์ซึ่งคนกดเปลี่ยนเองอยู่ในนั้น แม้จะปนกับของระบบก็เก็บไว้
-- (เกณฑ์คือ "ทุกคอลัมน์ที่เปลี่ยน" ต้องเป็นของระบบทั้งหมดจึงจะลบ)
--
-- ⚠️ ก่อนรันไฟล์นี้ ควรรัน query พรีวิวก่อนเพื่อดูว่าจะลบอะไรบ้าง (อยู่ในแชท)
--
-- ปลอดภัยที่จะรันซ้ำได้ (รันรอบสองจะไม่มีอะไรให้ลบ)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
-- 0. กันรันผิดลำดับ
-- ═══════════════════════════════════════════════════════════════════════
--
-- ต้องรัน audit_ignore_machine_state ก่อน ไม่งั้นจะล้างของเก่าทิ้ง
-- แล้ว trigger ก็จดของแบบเดิมกลับมาใหม่ทันที เสียเวลาเปล่า

do $guard$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'audit_ignored_columns'
  ) then
    raise exception
      'ยังไม่มีฟังก์ชัน audit_ignored_columns — กรุณารัน database_patch_audit_ignore_machine_state.sql ก่อน';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'audit_capture'
      and pg_get_functiondef(p.oid) like '%audit_ignored_columns%'
  ) then
    raise exception
      'audit_capture ยังไม่ได้เรียกใช้ audit_ignored_columns — กรุณารันไฟล์ก่อนหน้าให้ครบก่อน';
  end if;
end
$guard$;


-- ═══════════════════════════════════════════════════════════════════════
-- 1. ลบแถวที่เป็นสภาวะภายในของระบบล้วน ๆ
-- ═══════════════════════════════════════════════════════════════════════
--
-- <@ อ่านว่า "อยู่ในเซ็ตของ" — เงื่อนไขนี้เป็นจริงเมื่อทุกคอลัมน์ที่เปลี่ยน
-- อยู่ในรายการที่ไม่ต้องจด แปลว่าถ้ากฎใหม่มีผลตอนนั้น แถวนี้จะไม่เกิดขึ้นเลย

delete from public.audit_logs
where action = 'UPDATE'
  and changed_fields is not null
  and array_length(changed_fields, 1) > 0
  and changed_fields <@ public.audit_ignored_columns(table_name);


-- ═══════════════════════════════════════════════════════════════════════
-- 2. ตัด LINE user id ของแอดมินออกจากแถวที่เหลือ
-- ═══════════════════════════════════════════════════════════════════════
--
-- แถวที่มาถึงขั้นนี้คือแถวที่มีของจริงปนอยู่ด้วย จึงห้ามลบทั้งแถว
-- ตัดเฉพาะคอลัมน์ที่ไม่ต้องจด แล้วเก็บส่วนที่เป็นหลักฐานไว้ครบ
--
-- ⚠️ ต้องดูใน before/after ไม่ใช่แค่ changed_fields
--    เพราะเหตุการณ์ "เพิ่ม" กับ "ลบ" จดทั้งแถวโดยที่ changed_fields เป็น null
--    ถ้าดูแค่ changed_fields จะพลาด LINE user id ที่ติดอยู่ในแถวประเภทนั้น
--
-- ตัวดำเนินการที่ใช้:
--   jsonb - text[]   ลบทุกคีย์ในลิสต์ออกจาก jsonb
--   jsonb ?| text[]  จริงเมื่อมีคีย์ใดคีย์หนึ่งในลิสต์อยู่ใน jsonb

update public.audit_logs a
set changed_fields = case
      when a.changed_fields is null then null
      else (
        select array_agg(f)
        from unnest(a.changed_fields) f
        where not (f = any(public.audit_ignored_columns(a.table_name)))
      )
    end,
    before = case when a.before is null then null
                  else a.before - public.audit_ignored_columns(a.table_name) end,
    after  = case when a.after  is null then null
                  else a.after  - public.audit_ignored_columns(a.table_name) end
where a.table_name in ('tenants', 'workspaces')
  and (
    (a.changed_fields is not null and exists (
      select 1 from unnest(a.changed_fields) f
      where f = any(public.audit_ignored_columns(a.table_name))
    ))
    or (a.before is not null and a.before ?| public.audit_ignored_columns(a.table_name))
    or (a.after  is not null and a.after  ?| public.audit_ignored_columns(a.table_name))
  );


-- ═══════════════════════════════════════════════════════════════════════
-- 3. ตรวจผล
-- ═══════════════════════════════════════════════════════════════════════
--
-- ทุกแถวที่เขียนว่า "ต้องได้ 0" ต้องเป็น 0 ถึงจะไปขั้นที่ 3 (ล็อกถาวร) ได้

select 'แถวสภาวะภายในที่เหลืออยู่ (ต้องได้ 0)' as "รายการตรวจ",
       count(*)::text as "ผล"
from public.audit_logs
where action = 'UPDATE'
  and changed_fields is not null
  and array_length(changed_fields, 1) > 0
  and changed_fields <@ public.audit_ignored_columns(table_name)

union all

-- ครอบทั้ง 3 ที่ที่ค่าอาจซ่อนอยู่ (รายการคอลัมน์ที่เปลี่ยน, ค่าก่อน, ค่าหลัง)
select 'แถวที่ยังมี LINE user id ของแอดมิน (ต้องได้ 0)',
       count(*)::text
from public.audit_logs
where (changed_fields is not null and 'richmenu_admin_linked_uids' = any(changed_fields))
   or (before is not null and before ? 'richmenu_admin_linked_uids')
   or (after  is not null and after  ? 'richmenu_admin_linked_uids')

union all

select 'แถวที่ยังมีคอลัมน์สภาวะภายในติดอยู่ (ต้องได้ 0)',
       count(*)::text
from public.audit_logs
where table_name in ('tenants', 'workspaces')
  and (
    (changed_fields is not null and exists (
      select 1 from unnest(changed_fields) f
      where f = any(public.audit_ignored_columns(table_name))
    ))
    or (before is not null and before ?| public.audit_ignored_columns(table_name))
    or (after  is not null and after  ?| public.audit_ignored_columns(table_name))
  )

union all

select 'แถวที่มีคอลัมน์ที่เปลี่ยนเป็นศูนย์ (ต้องได้ 0)',
       count(*)::text
from public.audit_logs
where action = 'UPDATE'
  and (changed_fields is null or array_length(changed_fields, 1) is null)

union all

select 'log ที่เหลือทั้งหมด', count(*)::text from public.audit_logs

union all

select 'เหลือ · ' || table_name, count(*)::text
from public.audit_logs
group by table_name

order by 1;
