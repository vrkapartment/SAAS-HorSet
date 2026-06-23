-- SQL Patch: Create public.meter_replacements table
-- Supports recording mid-month meter replacements for electricity and water meters

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.meter_replacements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  billing_cycle text NOT NULL,
  meter_type text NOT NULL CHECK (meter_type IN ('electric', 'water')),
  old_final_reading numeric NOT NULL,
  new_start_reading numeric NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT meter_replacements_workspace_id_room_cycle_type_key UNIQUE (workspace_id, room_number, billing_cycle, meter_type)
);

-- 2. Add Row Level Security (RLS)
ALTER TABLE public.meter_replacements ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if any
DROP POLICY IF EXISTS "Read meter_replacements in workspace or support approved" ON public.meter_replacements;
DROP POLICY IF EXISTS "Manage meter_replacements in workspace or support approved" ON public.meter_replacements;

-- 4. Create SELECT Policy
CREATE POLICY "Read meter_replacements in workspace or support approved" 
ON public.meter_replacements FOR SELECT 
USING (
  workspace_id = public.get_current_user_workspace_id()
  OR (
    public.get_current_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM public.support_access_grants 
      WHERE workspace_id = meter_replacements.workspace_id AND status = 'approved'
    )
  )
);

-- 5. Create ALL (Manage) Policy for Admin/Staff
CREATE POLICY "Manage meter_replacements in workspace or support approved" 
ON public.meter_replacements FOR ALL 
USING (
  (workspace_id = public.get_current_user_workspace_id() AND public.get_current_user_role() IN ('admin', 'staff'))
  OR (
    public.get_current_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM public.support_access_grants 
      WHERE workspace_id = meter_replacements.workspace_id AND status = 'approved'
    )
  )
);

-- 6. Trigger to automatically populate workspace_id on insert
DROP TRIGGER IF EXISTS trigger_populate_workspace_id_meter_replacements ON public.meter_replacements;
CREATE TRIGGER trigger_populate_workspace_id_meter_replacements
  BEFORE INSERT ON public.meter_replacements
  FOR EACH ROW EXECUTE PROCEDURE public.populate_workspace_id();

-- 7. Index for fast queries
CREATE INDEX IF NOT EXISTS idx_meter_replacements_cycle ON public.meter_replacements (billing_cycle);
CREATE INDEX IF NOT EXISTS idx_meter_replacements_room ON public.meter_replacements (workspace_id, room_number);
