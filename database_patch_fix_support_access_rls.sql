-- Patch: fix_support_access_rls
-- วันที่: 2026-09-08
--
-- ปิดช่องโหว่ 2 ข้อที่ตรวจพบจาก pg_policies:
--
--   1a. super admin กดอนุมัติสิทธิ์เข้าช่วยเหลือ "ให้ตัวเอง" ได้
--       policy เดิมของ support_access_grants เป็น ALL + USING (role='super_admin')
--       และไม่มี WITH CHECK เลย → ยิง update({status:'approved'}) จากเบราว์เซอร์ได้ตรง ๆ
--       ทำให้ด่านที่ตั้งใจให้เจ้าหอเป็นคนอนุญาต กลายเป็นแค่พิธี
--
--   1b. policy ของ workspaces และ profiles ฝั่ง super_admin ไม่ได้เช็ค grant
--       ต่างจาก bills / expenses / meter_records / rooms / tenants ที่เช็คถูกอยู่แล้ว
--       (workspaces เก็บ promptpay_id, profiles เก็บ permissions — สองจุดที่อ่อนไหวที่สุด)
--
-- ⚠️ ขอบเขตที่ patch นี้ทำได้จริง:
--   - 1a มีผลทันที เพราะ useSupportAccess เขียนตารางนี้จากเบราว์เซอร์ด้วย JWT ของผู้ใช้
--   - 1b ยังไม่มีผลกับเส้นทางที่ใช้ service-role (ซึ่ง bypass RLS) จึงเป็นการเตรียมทางไว้
--     การปิดช่องนั้นจริงต้องบังคับด่านฝั่ง server ใน super-admin action ด้วย (งานแยก)
--
-- ปลอดภัยที่จะรันซ้ำได้ (drop if exists ก่อน create ทุกตัว)
-- SQL ย้อนกลับอยู่ท้ายไฟล์
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new


-- ═══════════════════════════════════════════════════════════════════════
-- ส่วนที่ 0 — เก็บสำเนา policy เดิมไว้ก่อน (เผื่อต้องย้อนกลับ)
-- ═══════════════════════════════════════════════════════════════════════
-- ชื่อ policy บางตัวยาวเกินกว่าที่แสดงใน export ได้ครบ จึงเก็บลงตารางจริง
-- ไม่พึ่งการอ่านด้วยตา  ตารางนี้ลบทิ้งได้เมื่อมั่นใจแล้ว

create table if not exists public.rls_policy_backup_20260908 as
select
  now() as backed_up_at,
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('support_access_grants', 'workspaces', 'profiles');


-- ═══════════════════════════════════════════════════════════════════════
-- ส่วนที่ 1a — support_access_grants: แยกสิทธิ์ตามบทบาทให้ชัด
-- ═══════════════════════════════════════════════════════════════════════
--
-- กฎที่ต้องการ:
--   super admin  → ขอสิทธิ์ได้ (สร้าง/แก้เป็น 'pending' เท่านั้น) และยกเลิกคำขอตัวเองได้
--                  ** ตั้ง 'approved' ไม่ได้เด็ดขาด **
--   admin ของหอ   → ตัดสินใจได้ ('approved' / 'revoked')
--
-- RLS รวม policy ของคำสั่งเดียวกันแบบ OR กัน จึงต้องแยก WITH CHECK ให้แต่ละบทบาท
-- ไม่ให้ policy ตัวกว้างทำให้ตัวแคบไร้ความหมาย

-- ลบ policy เดิมทั้งหมดแบบไม่ต้องพึ่งชื่อ (ชื่อบางตัวยาวและถูกตัดตอน export)
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'support_access_grants'
  loop
    execute format('drop policy if exists %I on public.support_access_grants', p.policyname);
  end loop;
end $$;

-- ── อ่าน ──
create policy "grants_select_super_admin"
  on public.support_access_grants for select
  using (get_current_user_role() = 'super_admin');

create policy "grants_select_workspace_admin"
  on public.support_access_grants for select
  using (
    workspace_id = get_current_user_workspace_id()
    and get_current_user_role() = 'admin'
  );

-- ── สร้างคำขอ: super admin เท่านั้น และต้องเป็น 'pending' ──
create policy "grants_insert_super_admin_pending_only"
  on public.support_access_grants for insert
  with check (
    get_current_user_role() = 'super_admin'
    and status = 'pending'
  );

-- ── แก้: super admin แก้ได้แต่ต้องลงเอยเป็น 'pending' (ขอใหม่หลังถูกปฏิเสธ) ──
create policy "grants_update_super_admin_pending_only"
  on public.support_access_grants for update
  using (get_current_user_role() = 'super_admin')
  with check (
    get_current_user_role() = 'super_admin'
    and status = 'pending'
  );

-- ── แก้: admin ของหอนั้นเป็นคนตัดสิน ──
create policy "grants_update_workspace_admin_decide"
  on public.support_access_grants for update
  using (
    workspace_id = get_current_user_workspace_id()
    and get_current_user_role() = 'admin'
  )
  with check (
    workspace_id = get_current_user_workspace_id()
    and get_current_user_role() = 'admin'
    and status in ('approved', 'revoked', 'pending')
  );

-- ── ลบ: ทั้งสองฝ่ายเคลียร์ได้ (แอปใช้ตอน super admin กด "ออก") ──
create policy "grants_delete_super_admin"
  on public.support_access_grants for delete
  using (get_current_user_role() = 'super_admin');

create policy "grants_delete_workspace_admin"
  on public.support_access_grants for delete
  using (
    workspace_id = get_current_user_workspace_id()
    and get_current_user_role() = 'admin'
  );


-- ═══════════════════════════════════════════════════════════════════════
-- ส่วนที่ 1b — workspaces: super admin แก้/ลบ ต้องมี grant ที่อนุมัติแล้ว
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⚠️ ตั้งใจ "ไม่" บังคับ grant กับ SELECT และ INSERT:
--    - INSERT: สร้างหอใหม่ต้องทำได้ เพราะ grant ของหอที่ยังไม่มีตัวตนสร้างไม่ได้
--    - SELECT: คอนโซลทีมงานต้องเห็นรายชื่อหอทั้งหมดเพื่อเลือกเข้าไปช่วยเหลือ
--    การคุมที่มีความหมายคือ UPDATE/DELETE ซึ่งเป็นจุดที่แก้ promptpay_id ได้

drop policy if exists "Super Admins can manage all workspaces" on public.workspaces;

-- กันพลาดเงียบ: ถ้าลบ policy เดิมไม่สำเร็จ (ชื่อไม่ตรง) ต้องหยุดทันที
-- ไม่งั้น policy เก่าจะยังอยู่และรวมแบบ OR ทำให้ข้อจำกัดใหม่ไร้ผล
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspaces'
      and cmd = 'ALL' and policyname ilike '%super admin%'
  ) then
    raise exception
      'ลบ policy เดิมของ workspaces ไม่สำเร็จ — ชื่อไม่ตรง กรุณาส่งผลจาก: select policyname, cmd from pg_policies where tablename = ''workspaces'';';
  end if;
end $$;

create policy "workspaces_select_super_admin"
  on public.workspaces for select
  using (get_current_user_role() = 'super_admin');

create policy "workspaces_insert_super_admin"
  on public.workspaces for insert
  with check (get_current_user_role() = 'super_admin');

create policy "workspaces_update_super_admin_needs_grant"
  on public.workspaces for update
  using (
    get_current_user_role() = 'super_admin'
    and exists (
      select 1 from public.support_access_grants g
      where g.workspace_id = workspaces.id and g.status = 'approved'
    )
  )
  with check (
    get_current_user_role() = 'super_admin'
    and exists (
      select 1 from public.support_access_grants g
      where g.workspace_id = workspaces.id and g.status = 'approved'
    )
  );

create policy "workspaces_delete_super_admin_needs_grant"
  on public.workspaces for delete
  using (
    get_current_user_role() = 'super_admin'
    and exists (
      select 1 from public.support_access_grants g
      where g.workspace_id = workspaces.id and g.status = 'approved'
    )
  );


-- ═══════════════════════════════════════════════════════════════════════
-- ส่วนที่ 1b (ต่อ) — profiles: super admin แก้โปรไฟล์คนอื่นต้องมี grant
-- ═══════════════════════════════════════════════════════════════════════
--
-- policy "Manage profiles for self" (id = auth.uid()) ยังอยู่ตามเดิม
-- super admin จึงยังแก้โปรไฟล์ตัวเองได้เสมอ ไม่ต้องมี grant

drop policy if exists "Manage profiles for super_admin" on public.profiles;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd = 'UPDATE' and policyname ilike '%super_admin%'
  ) then
    raise exception
      'ลบ policy เดิมของ profiles ไม่สำเร็จ — ชื่อไม่ตรง กรุณาส่งผลจาก: select policyname, cmd from pg_policies where tablename = ''profiles'';';
  end if;
end $$;

create policy "profiles_update_super_admin_needs_grant"
  on public.profiles for update
  using (
    get_current_user_role() = 'super_admin'
    and exists (
      select 1 from public.support_access_grants g
      where g.workspace_id = profiles.workspace_id and g.status = 'approved'
    )
  )
  with check (
    get_current_user_role() = 'super_admin'
    and exists (
      select 1 from public.support_access_grants g
      where g.workspace_id = profiles.workspace_id and g.status = 'approved'
    )
  );


-- ═══════════════════════════════════════════════════════════════════════
-- ส่วนที่ 2 — ตรวจผล (query สุดท้ายของไฟล์ จะแสดงในหน้า SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════

select
  tablename                                  as "ตาราง",
  cmd                                        as "คำสั่ง",
  policyname                                 as "policy",
  coalesce(with_check, '(ไม่มี WITH CHECK)')  as "เงื่อนไขเขียน"
from pg_policies
where schemaname = 'public'
  and tablename in ('support_access_grants', 'workspaces', 'profiles')
order by tablename, cmd, policyname;


-- ═══════════════════════════════════════════════════════════════════════
-- SQL ย้อนกลับ (ถ้าจำเป็น) — คัดลอกส่วนนี้ไปรันแยก
-- ═══════════════════════════════════════════════════════════════════════
--
-- ค่าเดิมทั้งหมดถูกสำรองไว้ที่ public.rls_policy_backup_20260908
-- ดูด้วย: select * from public.rls_policy_backup_20260908;
--
-- -- ลบ policy ใหม่ทั้งหมด
-- do $$
-- declare p record;
-- begin
--   for p in select tablename, policyname from pg_policies
--            where schemaname='public'
--              and (policyname like 'grants_%'
--                   or policyname like 'workspaces_%super_admin%'
--                   or policyname like 'profiles_update_super_admin%')
--   loop
--     execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
--   end loop;
-- end $$;
--
-- -- คืน policy เดิม
-- create policy "Super Admins can manage all support grants"
--   on public.support_access_grants for all
--   using (get_current_user_role() = 'super_admin');
--
-- create policy "Workspace admins can manage support grants for their workspace"
--   on public.support_access_grants for all
--   using (workspace_id = get_current_user_workspace_id()
--          and get_current_user_role() = 'admin');
--
-- create policy "Super Admins can manage all workspaces"
--   on public.workspaces for all
--   using (exists (select 1 from profiles
--                  where profiles.id = auth.uid() and profiles.role = 'super_admin'))
--   with check (exists (select 1 from profiles
--                       where profiles.id = auth.uid() and profiles.role = 'super_admin'));
--
-- create policy "Manage profiles for super_admin"
--   on public.profiles for update
--   using (get_current_user_role() = 'super_admin');
