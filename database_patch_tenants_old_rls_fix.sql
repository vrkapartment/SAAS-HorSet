-- Database Patch: Re-apply RLS policies on tenants_old (fix "ผู้เช่าเก่า/ย้ายออก" showing 0 รายชื่อ)
-- สาเหตุ: ตรวจสอบพบว่าข้อมูลใน public.tenants_old มีอยู่จริงและถูก workspace_id ถูกต้อง
-- แต่ตาราง ENABLE ROW LEVEL SECURITY ไว้แล้วโดยไม่มี Policy สำหรับ SELECT ทำงานอยู่จริง
-- (เกิดจาก database_patch_tenants_old.sql ที่มีอยู่เดิมไม่เคยถูกรันจนครบในโปรเจกต์นี้)
-- ผลคือ RLS บล็อกทุกแถวแบบเงียบๆ (ไม่ error แค่ได้ 0 แถวเสมอ) ให้กับทุก role รวมถึง admin/staff
-- Run this in your Supabase SQL Editor.

-- 1. ยืนยันว่า RLS เปิดอยู่ (idempotent)
ALTER TABLE public.tenants_old ENABLE ROW LEVEL SECURITY;

-- 2. ลบ Policy เดิม (เผื่อมีอยู่แบบเสียหรือไม่สมบูรณ์) แล้วสร้างใหม่ให้ชัดเจน
DROP POLICY IF EXISTS "Read tenants_old in workspace or support approved" ON public.tenants_old;
CREATE POLICY "Read tenants_old in workspace or support approved"
ON public.tenants_old FOR SELECT
USING (
  workspace_id = public.get_current_user_workspace_id()
  OR (
    public.get_current_user_role() = 'super_admin'
    AND EXISTS (SELECT 1 FROM public.support_access_grants WHERE workspace_id = tenants_old.workspace_id AND status = 'approved')
  )
);

DROP POLICY IF EXISTS "Manage tenants_old in workspace or support approved" ON public.tenants_old;
CREATE POLICY "Manage tenants_old in workspace or support approved"
ON public.tenants_old FOR ALL
USING (
  (workspace_id = public.get_current_user_workspace_id() AND public.get_current_user_role() IN ('admin', 'staff'))
  OR (
    public.get_current_user_role() = 'super_admin'
    AND EXISTS (SELECT 1 FROM public.support_access_grants WHERE workspace_id = tenants_old.workspace_id AND status = 'approved')
  )
);

-- 3. ตรวจสอบว่า Policy ถูกสร้างสำเร็จ (ควรเห็น 2 แถว: SELECT และ ALL)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tenants_old';
