-- =========================================================================
-- SUPABASE DATABASE PERFORMANCE & SPEEDUP OPTIMIZATION PATCH
-- =========================================================================
-- ปรับปรุงความเร็วในการคิวรีข้อมูลและประมวลผล Row-Level Security (RLS) ทั้งหมด
-- =========================================================================

-- 1. อัปเกรดฟังก์ชัน Security Definer ให้เป็น STABLE และ PARALLEL SAFE
-- ลดการดึงข้อมูล Profiles ซ้ำซ้อน (N+1 Query) ในแต่ละแถว จาก O(N) เหลือ O(1)
-- =========================================================================

create or replace function public.get_current_user_workspace_id()
returns uuid as $$
  select workspace_id from public.profiles where id = auth.uid();
$$ language sql stable security definer parallel safe;

create or replace function public.get_current_user_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer parallel safe;

create or replace function public.get_current_user_phone()
returns text as $$
  select phone from public.profiles where id = auth.uid();
$$ language sql stable security definer parallel safe;


-- 2. สร้าง B-TREE INDEXES บนคอลัมน์ workspace_id ทั้งหมด (Tenant Isolation Indexes)
-- ป้องกันการทำงานแบบ Full Table Scan ในขณะที่ RLS กำลังกรองข้อมูลหอพัก
-- =========================================================================

create index if not exists idx_profiles_workspace_id on public.profiles (workspace_id);
create index if not exists idx_room_types_workspace_id on public.room_types (workspace_id);
create index if not exists idx_rooms_workspace_id on public.rooms (workspace_id);
create index if not exists idx_tenants_workspace_id on public.tenants (workspace_id);
create index if not exists idx_meter_records_workspace_id on public.meter_records (workspace_id);
create index if not exists idx_bills_workspace_id on public.bills (workspace_id);
create index if not exists idx_expenses_workspace_id on public.expenses (workspace_id);


-- 3. สร้าง INDEXES สำหรับการ JOIN ความสัมพันธ์และเงื่อนไขการกรองข้อมูลห้องพัก
-- ป้องกันอาการหน่วงเวลาผู้เช่าล็อกอินหรือเชื่อมข้อมูลห้องพัก
-- =========================================================================

create index if not exists idx_tenants_room_id on public.tenants (room_id);
create index if not exists idx_tenants_phone on public.tenants (tenant_phone);
create index if not exists idx_rooms_room_type_id on public.rooms (room_type_id);

-- =========================================================================
-- SUCCESS: รันโค้ดชุดนี้ใน Supabase SQL Editor เพื่อเริ่มใช้งานความเร็วสูงสุด!
-- =========================================================================
