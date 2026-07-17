-- Patch: fix_handle_new_user_workspace_fallback
-- วันที่: 2026-07-17
--
-- ปัญหา: trigger handle_new_user() เดิม ถ้า metadata ตอนสมัครสมาชิกไม่มี key workspace_id มาเลย
-- จะ fallback ไปผูก profiles.workspace_id กับ workspace แรกสุดที่เคยสร้างในระบบทั้งหมดโดยอัตโนมัติแบบเงียบ ๆ
-- (select id from public.workspaces order by created_at limit 1) — เป็นช่องโหว่ข้อมูลข้ามหอพัก (cross-tenant)
-- ถ้ามี code path ไหนในอนาคตพลาดไม่ส่ง workspace_id มา
--
-- แก้ไข: เอา fallback ออก ให้ workspace_id เป็น NULL แทนเมื่อไม่มีค่าส่งมา (คอลัมน์นี้ nullable อยู่แล้ว
-- ref public.workspaces(id) on delete set null) RLS จะกันไม่ให้ profile ที่มี workspace_id = NULL
-- มองเห็นข้อมูลของหอพักไหนเลย (fail-safe แทน fail-open)
--
-- ปลอดภัยที่จะรันซ้ำได้ (CREATE OR REPLACE FUNCTION เป็น idempotent) และไม่กระทบ flow ที่มีอยู่ เพราะทุก
-- code path ที่สร้างบัญชีผู้ใช้จริงในระบบ (self-serve register, สมัครด้วยรหัสเชิญ, Admin เพิ่ม staff,
-- Super Admin สร้าง user) ส่ง workspace_id มาถูกต้องอยู่แล้วทุกจุด
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, full_name, phone, workspace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'tenant'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    (new.raw_user_meta_data->>'workspace_id')::uuid
  );
  return new;
end;
$$ language plpgsql security definer;
