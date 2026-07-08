-- Database Patch: Create bills_deleted table for archiving bills before hard delete
-- เหตุผล: deleteBill() เดิมลบข้อมูลบิลถาวรโดยไม่มีการสำรอง ขัดกับกติกา soft-delete ของโปรเจกต์
-- (ห้ามลบข้อมูลจริง ต้องสำรองไว้ก่อนเสมอ) โค้ดฝั่ง Server Action ถูกแก้ให้สำรองมาที่ตารางนี้ก่อนลบจริงแล้ว
-- Run this in your Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.bills_deleted (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_bill_id UUID,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    room_number TEXT,
    tenant_name TEXT,
    amount NUMERIC,
    status TEXT,
    billing_cycle TEXT,
    slip_url TEXT,
    electric_units NUMERIC,
    water_units NUMERIC,
    penalty_amount NUMERIC,
    late_days INTEGER,
    other_service_amount NUMERIC,
    invoice_id TEXT,
    bill_created_at TIMESTAMPTZ,
    bill_updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index สำหรับค้นหาตาม workspace_id และบิลต้นฉบับ
CREATE INDEX IF NOT EXISTS bills_deleted_workspace_id_idx ON public.bills_deleted(workspace_id);
CREATE INDEX IF NOT EXISTS bills_deleted_original_bill_id_idx ON public.bills_deleted(original_bill_id);

COMMENT ON TABLE public.bills_deleted IS 'Stores archived bills that were deleted, for recovery/audit purposes';

-- เปิด Row Level Security
ALTER TABLE public.bills_deleted ENABLE ROW LEVEL SECURITY;

-- Trigger เติม workspace_id อัตโนมัติหากไม่ได้ระบุมา (เผื่อไว้ แม้โค้ดปัจจุบันจะส่งมาตรงๆ อยู่แล้ว)
DROP TRIGGER IF EXISTS trg_bills_deleted_workspace ON public.bills_deleted;
CREATE TRIGGER trg_bills_deleted_workspace
  BEFORE INSERT ON public.bills_deleted
  FOR EACH ROW EXECUTE PROCEDURE public.populate_workspace_id();

-- Policy: อ่านได้เฉพาะ workspace ตัวเอง หรือ super_admin ที่ได้รับอนุมัติ support access
DROP POLICY IF EXISTS "Read bills_deleted in workspace or support approved" ON public.bills_deleted;
CREATE POLICY "Read bills_deleted in workspace or support approved"
ON public.bills_deleted FOR SELECT
USING (
  workspace_id = public.get_current_user_workspace_id()
  OR (
    public.get_current_user_role() = 'super_admin'
    AND EXISTS (SELECT 1 FROM public.support_access_grants WHERE workspace_id = bills_deleted.workspace_id AND status = 'approved')
  )
);

-- Policy: เขียน (สำรองข้อมูล) ได้เฉพาะ admin/staff ของ workspace ตัวเอง หรือ super_admin ที่ได้รับอนุมัติ
DROP POLICY IF EXISTS "Manage bills_deleted in workspace or support approved" ON public.bills_deleted;
CREATE POLICY "Manage bills_deleted in workspace or support approved"
ON public.bills_deleted FOR ALL
USING (
  (workspace_id = public.get_current_user_workspace_id() AND public.get_current_user_role() IN ('admin', 'staff'))
  OR (
    public.get_current_user_role() = 'super_admin'
    AND EXISTS (SELECT 1 FROM public.support_access_grants WHERE workspace_id = bills_deleted.workspace_id AND status = 'approved')
  )
);

-- ตรวจสอบว่า Policy ถูกสร้างสำเร็จ (ควรเห็น 2 แถว: SELECT และ ALL)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'bills_deleted';
