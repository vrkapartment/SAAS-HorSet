-- Patch: fix_tenant_rls_scope
-- วันที่: 2026-08-21
--
-- ปิดช่องที่ผู้เช่าอ่านข้อมูลของหอพักอื่นได้ และของห้องอื่นในหอเดียวกันได้
-- ขัดกับกฎของโปรเจคที่ระบุว่า "ห้าม Tenant เข้าถึงข้อมูลห้องอื่นโดยเด็ดขาด"
--
-- ปัญหาเดิม
-- --------
-- 1. meter_records / bills — policy ฝั่งผู้เช่าจับคู่ด้วย room_number เพียว ๆ ไม่กรอง workspace_id:
--
--      and room_number = (
--        select r.room_number from rooms r join tenants t on t.room_id = r.id
--        where t.tenant_phone = public.get_current_user_phone() limit 1
--      )
--
--    ผู้เช่าห้อง 101 ของหอ A จึงอ่านมิเตอร์และบิลของห้อง 101 ในหอ B ได้ทุกหอที่มีเลขห้องนี้
--    (บิลมีทั้งชื่อผู้เช่าและยอดเงิน — เป็นเรื่อง PDPA ไม่ใช่แค่ข้อมูลรั่วเฉย ๆ)
--
--    limit 1 ยังเป็นบั๊กในตัวเอง: ผู้เช่าที่เช่า 2 ห้องจะเห็นได้แค่ห้องเดียวแบบสุ่ม
--
-- 2. meter_replacements — policy ฝั่งผู้เช่ากรองแค่ workspace_id ไม่กรองห้อง
--    ผู้เช่าจึงเห็นประวัติเปลี่ยนมิเตอร์ของ "ทุกห้อง" ในหอตัวเอง ไม่ใช่แค่ห้องตัวเอง
--
-- ความเสี่ยงตอนรัน patch นี้
-- -------------------------
-- ต่ำมาก: ตรวจแล้วว่าตอนนี้ยังไม่มี profile ที่ role = 'tenant' เลยแม้แต่คนเดียว
-- และ portal ที่ผู้เช่าเปิดจากลิงก์ LINE ใช้ service role key ซึ่งไม่ผ่าน RLS อยู่แล้ว
-- จึงไม่มี session ไหนที่พึ่ง policy เหล่านี้อยู่ — แต่ช่องจะเปิดทันทีที่สร้างบัญชีผู้เช่าคนแรก
--
-- แนวทางแก้
-- ---------
-- ผูกสิทธิ์กับ "ห้องที่ผู้เช่าคนนั้นเช่าอยู่จริง" ผ่าน tenants → rooms โดยเทียบทั้ง
-- workspace_id และ room_number พร้อมกัน และใช้ exists แทน limit 1 เพื่อให้ผู้เช่าที่เช่าหลายห้อง
-- เห็นได้ครบทุกห้องของตัวเอง (ห้องเหล่านั้นเป็นของเขาเองอยู่แล้ว ไม่ใช่การเปิดสิทธิ์เพิ่ม)
--
-- จงใจไม่ใช้ get_current_user_workspace_id() กับผู้เช่า เพราะถ้า profiles.workspace_id
-- ของผู้เช่าเป็น null policy จะปฏิเสธทุกอย่าง — การไล่ผ่าน tenants → rooms เชื่อถือได้กว่า
--
-- ปลอดภัยที่จะรันซ้ำได้ (drop policy if exists ก่อน create)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. meter_records — ผู้เช่าเห็นได้เฉพาะห้องของตัวเอง ในหอของตัวเอง
-- =========================================================================
drop policy if exists "Read meter_records for tenants" on public.meter_records;

create policy "Read meter_records for tenants" on public.meter_records for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1
    from public.tenants t
    join public.rooms r on r.id = t.room_id
    where t.tenant_phone = public.get_current_user_phone()
      and r.workspace_id = meter_records.workspace_id
      and r.room_number = meter_records.room_number
  )
);

-- =========================================================================
-- 2. bills — ผู้เช่าเห็นได้เฉพาะบิลของห้องตัวเอง ในหอของตัวเอง
-- =========================================================================
drop policy if exists "Read bills for tenants" on public.bills;

create policy "Read bills for tenants" on public.bills for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1
    from public.tenants t
    join public.rooms r on r.id = t.room_id
    where t.tenant_phone = public.get_current_user_phone()
      and r.workspace_id = bills.workspace_id
      and r.room_number = bills.room_number
  )
);

-- =========================================================================
-- 3. meter_replacements — เดิมเห็นทุกห้องในหอ ให้เหลือเฉพาะห้องตัวเอง
-- =========================================================================
-- ตรวจแล้วว่า getTenantPortalData ไม่ได้อ่านตารางนี้เลย การรัดให้แคบลงจึงไม่กระทบหน้าจอใด
drop policy if exists "Read meter_replacements for tenants" on public.meter_replacements;

create policy "Read meter_replacements for tenants" on public.meter_replacements for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1
    from public.tenants t
    join public.rooms r on r.id = t.room_id
    where t.tenant_phone = public.get_current_user_phone()
      and r.workspace_id = meter_replacements.workspace_id
      and r.room_number = meter_replacements.room_number
  )
);

-- =========================================================================
-- 4. ตรวจผลหลังรัน
-- =========================================================================
-- ต้องได้ 3 แถว และคอลัมน์ qual ของทุกแถวต้องมีคำว่า workspace_id อยู่ด้วย
--
-- select tablename, policyname, qual
-- from pg_policies
-- where schemaname = 'public'
--   and policyname in (
--     'Read meter_records for tenants',
--     'Read bills for tenants',
--     'Read meter_replacements for tenants'
--   );
