-- SQL Patch: แก้ไข RLS policy การ UPDATE ตาราง workspaces ที่ทำให้ Super Admin
-- (ซึ่งมี profiles.workspace_id เป็น NULL) ไม่สามารถบันทึกการตั้งค่าการเงินของ workspace ใดๆ ได้เลย
-- แบบเงียบๆ (ไม่มี error แจ้ง เพราะ Postgres/Supabase ไม่ throw error เมื่อ UPDATE จับคู่ได้ 0 แถว)
--
-- Policy เดิม "Workspace admins can update their own workspace" เช็คว่า
--   id = (select workspace_id from profiles where id = auth.uid())
-- ซึ่งสำหรับ super_admin ที่ profiles.workspace_id เป็น NULL แล้ว เงื่อนไขนี้จะไม่ true กับ workspace ไหนเลย
-- (NULL = ค่าอะไรก็ตาม จะได้ NULL/false เสมอ) ต้องมี policy แยกที่อนุญาต super_admin เข้าถึงได้ทุก workspace
-- แบบไม่ผูกกับ workspace_id ของตัวเอง — เพิ่มไว้ให้ชัดเจนและ idempotent (รันซ้ำได้ปลอดภัย)
-- Run this in your Supabase SQL Editor

drop policy if exists "Workspace admins can update their own workspace" on public.workspaces;
drop policy if exists "Super Admins can manage all workspaces" on public.workspaces;

-- Super Admin จัดการได้ทุก workspace ไม่ผูกกับ workspace_id ของตัวเอง
create policy "Super Admins can manage all workspaces"
on public.workspaces for all
using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
)
with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
);

-- Admin ทั่วไปแก้ไขได้เฉพาะ workspace ของตัวเองเท่านั้น
create policy "Workspace admins can update their own workspace"
on public.workspaces for update
using (
  id = (select workspace_id from public.profiles where id = auth.uid())
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
  id = (select workspace_id from public.profiles where id = auth.uid())
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
