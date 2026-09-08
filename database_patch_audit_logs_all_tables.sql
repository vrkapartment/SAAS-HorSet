-- Patch: audit_logs_all_tables (ขั้นที่ 2 จาก 3)
-- วันที่: 2026-09-08
--
-- ═══════════════════════════════════════════════════════════════════════
-- ติด trigger audit อีก 6 ตาราง (bills ติดไปแล้วในขั้นที่ 1)
-- ═══════════════════════════════════════════════════════════════════════
--
-- ต้องรัน database_patch_add_audit_logs.sql (ขั้นที่ 1) และผ่าน QA ก่อน
--
-- ⚠️ ขั้นนี้ยังไม่ REVOKE — ขั้นที่ 3 ค่อยล็อก
--    เพราะกฎกรองข้อมูลอ่อนไหว (promptpay_id, tenant_phone, permissions)
--    ทดสอบได้เฉพาะตอนที่ trigger ติดบน workspaces/tenants/profiles แล้ว
--    ถ้า REVOKE ไปพร้อมกันแล้วพบว่ากรองผิด จะลบข้อมูลที่รั่วออกไม่ได้อีกเลย
--
-- ปลอดภัยที่จะรันซ้ำได้
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new
-- ═══════════════════════════════════════════════════════════════════════


-- ── กันพลาด: ต้องมีของจากขั้นที่ 1 ก่อน ──────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'audit_capture'
  ) then
    raise exception 'ยังไม่ได้รันขั้นที่ 1 — กรุณารัน database_patch_add_audit_logs.sql ก่อน';
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════
-- ติด trigger เรียงตามความเสี่ยงจากน้อยไปมาก
-- ═══════════════════════════════════════════════════════════════════════
--
-- เรียงแบบนี้เพื่อให้ถ้าพัง จะพังกับของที่กระทบงานประจำวันน้อยที่สุดก่อน
-- (expenses/rooms ใช้นาน ๆ ครั้ง ส่วน meter_records ใช้ทุกเดือน)

-- 1. รายจ่าย — ใช้นาน ๆ ครั้ง เสี่ยงต่ำสุด
drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses
  after insert or update or delete on public.expenses
  for each row execute function public.audit_capture();

-- 2. ห้องพัก — base_rent คือค่าเช่า จึงเป็นข้อมูลการเงิน
drop trigger if exists audit_rooms on public.rooms;
create trigger audit_rooms
  after insert or update or delete on public.rooms
  for each row execute function public.audit_capture();

-- 3. มิเตอร์ — จุดโกงคลาสสิกที่สุด (แก้เลขย้อนหลัง)
drop trigger if exists audit_meter_records on public.meter_records;
create trigger audit_meter_records
  after insert or update or delete on public.meter_records
  for each row execute function public.audit_capture();

-- 4. ผู้เช่า — มีเงินประกัน และมี PII ที่ต้องถูกกรอง (tenant_phone, line_user_id)
drop trigger if exists audit_tenants on public.tenants;
create trigger audit_tenants
  after insert or update or delete on public.tenants
  for each row execute function public.audit_capture();

-- 5. ตั้งค่าหอ — promptpay_id / เรตค่าน้ำไฟ / tax_id (ต้องถูกกรองเป็น 4 ตัวท้าย)
drop trigger if exists audit_workspaces on public.workspaces;
create trigger audit_workspaces
  after insert or update or delete on public.workspaces
  for each row execute function public.audit_capture();

-- 6. โปรไฟล์/สิทธิ์ — จดเฉพาะ role / permissions / workspace_id
--
--    ⚠️ ตารางนี้เสี่ยงสุดในชุด เพราะ audit_capture() อ่าน profiles เพื่อหาชื่อคนทำ
--       การ INSERT/UPDATE profiles จะยิง trigger แล้ว trigger ไป SELECT profiles
--       — ปลอดภัย เพราะ SELECT ไม่ยิง trigger จึงไม่วนซ้ำ
--       แต่ติดไว้ท้ายสุดเพื่อให้ทดสอบตัวอื่นผ่านก่อน
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.audit_capture();


-- ═══════════════════════════════════════════════════════════════════════
-- ตรวจผล
-- ═══════════════════════════════════════════════════════════════════════

select
  c.relname                                as "ตาราง",
  t.tgname                                 as "trigger",
  case when t.tgenabled = 'O' then 'ทำงาน' else 'ปิดอยู่ ⚠️' end as "สถานะ"
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where t.tgname like 'audit_%' and not t.tgisinternal
order by c.relname;


-- ═══════════════════════════════════════════════════════════════════════
-- ถอนออกทั้งหมดทันทีถ้าพบปัญหา — รันบล็อกนี้แยก
-- ═══════════════════════════════════════════════════════════════════════
--   drop trigger if exists audit_expenses      on public.expenses;
--   drop trigger if exists audit_rooms         on public.rooms;
--   drop trigger if exists audit_meter_records on public.meter_records;
--   drop trigger if exists audit_tenants       on public.tenants;
--   drop trigger if exists audit_workspaces    on public.workspaces;
--   drop trigger if exists audit_profiles      on public.profiles;
--   -- (ถอน bills ด้วยถ้าต้องการ)
--   drop trigger if exists audit_bills         on public.bills;
