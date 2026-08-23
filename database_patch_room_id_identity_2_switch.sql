-- Patch: room_id_identity — ส่วนที่ 2 จาก 2 "สวิตช์เปิดใช้จริง"
-- วันที่: 2026-08-23
--
-- =========================================================================
-- ⚠️ ห้ามรันไฟล์นี้จนกว่าจะครบ 3 ข้อ
-- =========================================================================
--   1) รัน database_patch_room_id_identity_1_additive.sql แล้ว
--   2) deploy โค้ดที่จับคู่ห้องด้วย room_id ขึ้น production แล้ว (commit f44133b ขึ้นไป)
--   3) QA เฟส 1 ผ่านแล้ว — ยืนยันว่าทุกอย่างทำงานเหมือนเดิมเป๊ะ
--
-- เหตุผลที่ต้องรอ: ไฟล์นี้ "ลบ" unique เดิมและ "ปลดล็อก" ให้สร้างเลขห้องซ้ำได้
-- ถ้ารันตอนที่โค้ดเก่ายังรันอยู่ การ upsert บิล/มิเตอร์ของโค้ดเก่าจะ error ทันที
-- (โค้ดเก่าใช้ onConflict: workspace_id,invoice_id ซึ่งข้อ 1 ด้านล่างลบทิ้ง)
--
-- ลำดับในไฟล์นี้สำคัญ: ข้อ 3 (ปลดล็อก rooms) ต้องอยู่ท้ายสุดเสมอ
-- ตราบใดที่ rooms_workspace_id_room_number_key ยังอยู่ เลขห้องซ้ำเกิดขึ้นไม่ได้
-- ข้อ 1-2 จึงยังไม่เปลี่ยนพฤติกรรมอะไรเลย
--
-- ปลอดภัยที่จะรันซ้ำได้ (if exists / pg_constraint guard)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 0. ตรวจก่อนเริ่ม — ต้องมี constraint ใหม่ครบ 4 ตัวจากไฟล์ที่ 1 ก่อน
-- =========================================================================
do $$
declare
  found_count int;
begin
  select count(*) into found_count
  from pg_constraint
  where conname in (
    'buildings_workspace_id_code_key',
    'meter_records_workspace_room_id_cycle_key',
    'bills_workspace_room_id_cycle_kind_key',
    'meter_replacements_workspace_room_id_cycle_type_key'
  );

  if found_count < 4 then
    raise exception 'ยังไม่ได้รัน database_patch_room_id_identity_1_additive.sql ให้ครบ (พบ constraint ใหม่ %/4) — หยุดก่อน อย่ารันไฟล์นี้', found_count;
  end if;
end $$;

-- =========================================================================
-- 1. ลบ unique เดิมที่ยังคีย์ด้วย room_number
-- =========================================================================
-- ต้องลบก่อนปลดล็อก rooms ในข้อ 3 ไม่งั้นสร้างห้อง 101 ในอาคารที่สองได้ แต่จดมิเตอร์
-- รอบเดียวกันไม่ได้ (ติด unique เดิมที่คีย์ด้วยเลขห้อง) ซึ่งจะเป็นสภาพที่งงที่สุด
--
-- bills: invoice_id เลิกเป็น conflict key เหลือเป็นเลขอ้างอิงที่พิมพ์บนบิลเท่านั้น

alter table public.meter_records
  drop constraint if exists meter_records_workspace_room_cycle_key;

alter table public.bills
  drop constraint if exists bills_workspace_id_invoice_id_key;

alter table public.meter_replacements
  drop constraint if exists meter_replacements_workspace_id_room_cycle_type_key;

-- =========================================================================
-- 2. RLS ผู้เช่า — เทียบ room_id ตรง ๆ ผ่าน tenants.room_id
-- =========================================================================
-- เดิม (patch fix_tenant_rls_scope) เทียบ workspace_id + room_number ซึ่งจะกำกวมทันทีที่เลขห้องซ้ำได้
-- room_id เป็น uuid ที่ unique ทั้งระบบ จึงไม่ต้องเทียบ workspace_id อีก และ predicate สั้นลงมาก
--
-- ต้องทำ "ก่อน" ข้อ 3 เสมอ — ถ้าปลดล็อกเลขห้องซ้ำก่อนแล้ว policy ยังเทียบเลขห้องอยู่
-- ผู้เช่าห้อง 101 ตึก A จะอ่านบิลของห้อง 101 ตึก B ได้ในช่วงคาบเกี่ยวนั้น

drop policy if exists "Read meter_records for tenants" on public.meter_records;
create policy "Read meter_records for tenants" on public.meter_records for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1 from public.tenants t
    where t.tenant_phone = public.get_current_user_phone()
      and t.room_id = meter_records.room_id
  )
);

drop policy if exists "Read bills for tenants" on public.bills;
create policy "Read bills for tenants" on public.bills for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1 from public.tenants t
    where t.tenant_phone = public.get_current_user_phone()
      and t.room_id = bills.room_id
  )
);

drop policy if exists "Read meter_replacements for tenants" on public.meter_replacements;
create policy "Read meter_replacements for tenants" on public.meter_replacements for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1 from public.tenants t
    where t.tenant_phone = public.get_current_user_phone()
      and t.room_id = meter_replacements.room_id
  )
);

-- =========================================================================
-- 3. ⚠️ ขั้นสุดท้าย — ปลดล็อกให้เลขห้องซ้ำข้ามอาคารได้
-- =========================================================================
-- เปลี่ยนกฎจาก "ห้ามเลขห้องซ้ำในหอ" เป็น "ห้ามเลขห้องซ้ำในอาคารเดียวกัน"
-- กฎใหม่นี้ยังทำให้ INV-{รอบบิล}-{รหัสอาคาร}-{เลขห้อง} ไม่ซ้ำโดยอัตโนมัติ
--
-- หมายเหตุ: ห้องที่ building_id เป็น null จะไม่ถูกกฎใหม่คุ้มกัน (null ไม่ conflict กันใน Postgres)
-- ตรวจแล้วว่าปัจจุบันทุกห้องมี building_id ครบ และ createRoom/createRoomsBatch/CSV import
-- เติม building_id ให้ทุกเส้นทางแล้ว
--
-- ตรวจก่อนรัน (ควรได้ 0):
--   select count(*) from public.rooms where building_id is null;

alter table public.rooms
  drop constraint if exists rooms_workspace_id_room_number_key;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_workspace_building_room_number_key') then
    alter table public.rooms
      add constraint rooms_workspace_building_room_number_key
      unique (workspace_id, building_id, room_number);
  end if;
end $$;

-- =========================================================================
-- 4. ตรวจผลหลังรัน
-- =========================================================================
-- constraint ที่ต้องมี (ควรได้ 5 แถว):
--   select conname from pg_constraint where conname in (
--     'buildings_workspace_id_code_key',
--     'meter_records_workspace_room_id_cycle_key',
--     'bills_workspace_room_id_cycle_kind_key',
--     'meter_replacements_workspace_room_id_cycle_type_key',
--     'rooms_workspace_building_room_number_key'
--   );
--
-- constraint เดิมที่ต้องหายไปแล้ว (ควรได้ 0 แถว):
--   select conname from pg_constraint where conname in (
--     'meter_records_workspace_room_cycle_key',
--     'bills_workspace_id_invoice_id_key',
--     'meter_replacements_workspace_id_room_cycle_type_key',
--     'rooms_workspace_id_room_number_key'
--   );
--
-- ทดสอบว่าเปิดใช้จริงแล้ว: สร้างห้องเลขซ้ำในอาคารที่สองจากหน้าจัดการห้องพัก ต้องสร้างได้
-- และสร้างเลขซ้ำ "ในอาคารเดิม" ต้องยังถูกปฏิเสธ
