-- Patch: add_staff_read_tenant_room_transfers
-- วันที่: 2026-09-25
--
-- =========================================================================
-- ทำไมต้องมี patch นี้
-- =========================================================================
-- เดิมตาราง tenant_room_transfers อ่านได้แค่ admin / super_admin (ดู database_patch_add_tenant_room_transfers.sql)
-- แต่ Staff ใช้หน้าบิลกับหน้าจัดการบิล ซึ่งต้องอ่านประวัติการย้ายห้อง 2 เรื่อง:
--
--   1. ชื่อผู้เช่ารายเดือน (src/features/tenant/occupancy.ts)
--      ถ้าอ่านไม่ได้ ผู้เช่าที่ย้ายห้องจะไปโผล่ในห้องใหม่ย้อนหลังทุกเดือน
--      เคสจริง: นุ้ยย้าย 135 → 141 วันที่ 2026-08-07 แต่ห้อง 141 เดือน มิ.ย.–ก.ค. แสดงชื่อนุ้ย
--
--   2. ค่าน้ำ-ไฟห้องเดิมที่ยกมารวมในบิลห้องใหม่ (fetchTransferSegments ใน src/features/billing/actions.ts)
--      RLS ไม่ error แต่คืนแถวว่าง → Staff กดออกบิลห้องที่มีผู้เช่าย้ายเข้ามา
--      ค่าน้ำ-ไฟส่วนห้องเดิมหายไปจากบิลเงียบ ๆ
--
-- ให้สิทธิ์ "อ่านอย่างเดียว" เฉพาะแถวที่ห้องต้นทางหรือห้องปลายทางอยู่ในอาคารที่ Staff ดูแล
-- (กติกาเดียวกับ bills / meter_records / tenants ใน database_patch_add_staff_building_access.sql)
-- การบันทึกย้ายห้องยังจำกัดเฉพาะ admin เหมือนเดิม
--
-- ⚠️ patch นี้เพิ่ม policy อย่างเดียว ไม่แตะข้อมูล ไม่แก้ policy เดิม
-- ปลอดภัยที่จะรันซ้ำได้ (drop policy if exists)
--
-- ต้องรันหลัง: database_patch_add_tenant_room_transfers.sql, database_patch_add_staff_building_access.sql
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

drop policy if exists "Read tenant_room_transfers for staff" on public.tenant_room_transfers;
create policy "Read tenant_room_transfers for staff" on public.tenant_room_transfers for select
using (
  public.get_current_user_role() = 'staff'
  and workspace_id = public.get_current_user_workspace_id()
  and (
    public.staff_has_building_access(public.get_room_building_id(tenant_room_transfers.from_room_id))
    or public.staff_has_building_access(public.get_room_building_id(tenant_room_transfers.to_room_id))
  )
);
