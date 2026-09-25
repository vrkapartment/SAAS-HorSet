-- Patch: tenant_bills_rls_own_only
-- วันที่: 2026-09-25
--
-- =========================================================================
-- ทำไมต้องมี patch นี้
-- =========================================================================
-- policy เดิม "Read bills for tenants" (database_patch_room_id_identity_2_switch.sql) ให้ผู้เช่าที่ login
-- อ่านบิล "ทุกใบของห้องที่ตัวเองอยู่ตอนนี้" — รวมบิลของผู้เช่าคนก่อน ๆ ของห้องนั้นด้วย
-- หน้า Portal กรองออกให้ก็จริง แต่ผู้เช่าที่ login เรียก Supabase API ตรงด้วย session ของตัวเองได้
-- จึงอ่านบิลเก่าของคนอื่นได้ทั้งหมด (ชื่อ ยอดเงิน สลิป)
--
-- policy ใหม่: อ่านได้เฉพาะบิลที่
--   1. อยู่ห้องปัจจุบันของตัวเอง
--   2. ชื่อในบิลตรงกับตัวเอง
--   3. รอบบิล >= เดือนที่ตัวเองเริ่มอยู่ห้องนี้
--      (ย้ายเข้าห้องนี้ผ่านการย้ายห้อง → ใช้วันที่ย้ายเข้าครั้งล่าสุด, ไม่เคยย้าย → lease_start)
--
-- บิลของห้องเก่า (ก่อนย้ายห้อง) ไม่เปิดผ่าน RLS — แอปอ่านให้ฝั่ง server หลังยืนยันตัวตนแล้ว
-- ด้วยกติกาเดียวกัน (src/features/tenant/portal-access.ts → fetchTenantVisibleBills)
--
-- ⚠️ ไม่แตะข้อมูล แก้แค่ policy อ่านบิลของ role tenant (admin / staff / super_admin ไม่เปลี่ยน)
-- ปลอดภัยที่จะรันซ้ำได้
--
-- ต้องรันหลัง: database_patch_room_id_identity_2_switch.sql, database_patch_add_tenant_room_transfers.sql
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- วันที่ผู้เช่าย้ายเข้าห้องนี้ครั้งล่าสุด (null = ไม่เคยย้ายเข้าห้องนี้ด้วยการย้ายห้อง)
-- security definer เพราะผู้เช่าไม่มีสิทธิ์อ่าน tenant_room_transfers เอง
create or replace function public.tenant_room_move_in_date(p_tenant_id uuid, p_room_id uuid)
returns date as $$
  select max(transfer_date)
  from public.tenant_room_transfers
  where tenant_id = p_tenant_id and to_room_id = p_room_id;
$$ language sql stable security definer set search_path = public;

revoke all on function public.tenant_room_move_in_date(uuid, uuid) from public;
grant execute on function public.tenant_room_move_in_date(uuid, uuid) to authenticated;

drop policy if exists "Read bills for tenants" on public.bills;
create policy "Read bills for tenants" on public.bills for select
using (
  public.get_current_user_role() = 'tenant'
  and exists (
    select 1 from public.tenants t
    where t.tenant_phone = public.get_current_user_phone()
      and t.room_id = bills.room_id
      and t.tenant_name = bills.tenant_name
      and bills.billing_cycle >= to_char(
        coalesce(public.tenant_room_move_in_date(t.id, t.room_id), t.lease_start, t.created_at::date),
        'YYYY-MM'
      )
  )
);
