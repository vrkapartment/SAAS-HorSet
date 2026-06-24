-- Database Patch: Create tenants_old table for historical/archived tenant records
-- Run this in your Supabase SQL Editor to enable persistent storage for archived tenants.

CREATE TABLE IF NOT EXISTS public.tenants_old (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    tenant_id UUID,
    room_id UUID,
    room_number VARCHAR(50),
    tenant_name VARCHAR(255) NOT NULL,
    tenant_phone VARCHAR(50),
    line_user_id VARCHAR(255),
    lease_start DATE,
    lease_end DATE,
    moved_out_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries by workspace_id and tenant_id
CREATE INDEX IF NOT EXISTS tenants_old_workspace_id_idx ON public.tenants_old(workspace_id);
CREATE INDEX IF NOT EXISTS tenants_old_tenant_id_idx ON public.tenants_old(tenant_id);

COMMENT ON TABLE public.tenants_old IS 'Stores archived/historical tenant records who have checked out or moved out';

-- Enable Row Level Security (RLS)
ALTER TABLE public.tenants_old ENABLE ROW LEVEL SECURITY;

-- Trigger to automatically populate workspace_id on inserts if not explicitly provided
DROP TRIGGER IF EXISTS trg_tenants_old_workspace ON public.tenants_old;
CREATE TRIGGER trg_tenants_old_workspace
  BEFORE INSERT ON public.tenants_old
  FOR EACH ROW EXECUTE PROCEDURE public.populate_workspace_id();

-- Policies for tenants_old:

-- 1. Read Policy: Users can select old tenants belonging to their workspace, or super_admins with approved support grants.
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

-- 2. Manage Policy: Admins/Staff of the workspace can manage old tenants, or super_admins with approved support grants.
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
