-- =========================================================================
-- SUPABASE DATABASE PERFORMANCE & RLS RECURSION ELIMINATION PATCH (V2)
-- =========================================================================
-- สคริปต์ปรับปรุงความเร็วการโหลดหน้า Dashboard และขจัดอาการ "ค้างโหลด / Sidebar ไม่ขึ้น"
-- อัปเกรดฟังก์ชัน RLS Helpers ให้ดึงข้อมูลจาก JWT Claims หรือ ตารางระบบ auth.users เท่านั้น
-- โดยไม่มีการเรียกสืบค้นตาราง public.profiles ในขั้นตอน Fallback เพื่อขจัดโอกาสการเกิด Recursion 100%
-- ป้องกันอาการค้างรอคอยคำตอบ (Hanging Request) หลังล็อกอินใหม่ได้อย่างเด็ดขาด
-- =========================================================================

-- 1. สร้าง Trigger ฟังก์ชันเพื่อซิงค์ข้อมูลโปรไฟล์ไปยัง auth.users.raw_user_meta_data
-- =========================================================================
create or replace function public.sync_profile_to_user_metadata()
returns trigger as $$
begin
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'role', coalesce(new.role, 'tenant'),
      'workspace_id', new.workspace_id
    )
  where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

-- ติดตั้ง Trigger เข้ากับตาราง profiles (ทำงานเมื่อมีการแก้ไข role หรือ workspace_id)
drop trigger if exists on_profile_change_sync_metadata on public.profiles;
create trigger on_profile_change_sync_metadata
after insert or update of role, workspace_id on public.profiles
for each row execute function public.sync_profile_to_user_metadata();


-- 2. รันซิงค์ข้อมูลผู้ใช้งานเดิมในระบบย้อนหลัง (Retroactive Sync)
-- เพื่อให้ผู้ใช้เดิมที่เคยลงทะเบียนไปแล้วมีข้อมูล role และ workspace_id ใน auth.users ทันที
-- =========================================================================
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || 
  jsonb_build_object(
    'role', coalesce(p.role, 'tenant'),
    'workspace_id', p.workspace_id
  )
from public.profiles p
where u.id = p.id;


-- 3. ปรับปรุงฟังก์ชัน get_current_user_workspace_id ให้ทำงานอย่างรวดเร็วสูงสุดและไร้ Recursion
-- =========================================================================
create or replace function public.get_current_user_workspace_id()
returns uuid as $$
declare
  _claims json;
  _ws_id text;
begin
  -- ขั้นตอนที่ A: ดึงจาก JWT claims (เร็วที่สุด 0.01ms ใน memory)
  _claims := current_setting('request.jwt.claims', true)::json;
  _ws_id := nullif(_claims->'user_metadata'->>'workspace_id', '');
  
  if _ws_id is not null then
    return _ws_id::uuid;
  end if;

  -- ขั้นตอนที่ B: กรณีไม่มีใน JWT ให้ดึงตรงจากตารางระบบ auth.users
  -- ซึ่งตาราง auth.users ไม่มี RLS บังคับและปลอดภัยจากการเกิด Recursion 100%
  select nullif(raw_user_meta_data->>'workspace_id', '') into _ws_id 
  from auth.users 
  where id = auth.uid();
  
  return nullif(_ws_id, '')::uuid;
exception
  when others then
    return null;
end;
$$ language plpgsql stable security definer parallel safe;


-- 4. ปรับปรุงฟังก์ชัน get_current_user_role ให้ทำงานอย่างรวดเร็วสูงสุดและไร้ Recursion
-- =========================================================================
create or replace function public.get_current_user_role()
returns text as $$
declare
  _claims json;
  _role text;
begin
  -- ขั้นตอนที่ A: ดึงจาก JWT claims (เร็วที่สุด 0.01ms ใน memory)
  _claims := current_setting('request.jwt.claims', true)::json;
  _role := nullif(_claims->'user_metadata'->>'role', '');
  
  if _role is not null then
    return _role;
  end if;

  -- ขั้นตอนที่ B: กรณีไม่มีใน JWT ให้ดึงตรงจากตารางระบบ auth.users
  -- ซึ่งตาราง auth.users ไม่มี RLS บังคับและปลอดภัยจากการเกิด Recursion 100%
  select nullif(raw_user_meta_data->>'role', '') into _role 
  from auth.users 
  where id = auth.uid();
  
  return coalesce(nullif(_role, ''), 'tenant');
exception
  when others then
    return 'tenant';
end;
$$ language plpgsql stable security definer parallel safe;
