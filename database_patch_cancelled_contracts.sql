-- Database Patch: Create cancelled_contracts table for lease termination deposit forfeiture tax history
-- Run this in your Supabase SQL Editor to enable persistent cloud storage for cancelled contracts.

CREATE TABLE IF NOT EXISTS public.cancelled_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    tenant_id UUID,
    room_number VARCHAR(50),
    tenant_name VARCHAR(255),
    cancellation_date VARCHAR(50),
    deposit_amount NUMERIC DEFAULT 0,
    refunded_amount NUMERIC DEFAULT 0,
    actual_refund NUMERIC DEFAULT 0,
    forfeited_amount NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries by workspace_id
CREATE INDEX IF NOT EXISTS cancelled_contracts_workspace_id_idx ON public.cancelled_contracts(workspace_id);

COMMENT ON TABLE public.cancelled_contracts IS 'Stores historical lease termination and forfeited/refunded deposit tax records';

-- Enable Row Level Security (RLS)
ALTER TABLE public.cancelled_contracts ENABLE ROW LEVEL SECURITY;

-- Trigger to automatically populate workspace_id on inserts if not explicitly provided
DROP TRIGGER IF EXISTS trg_cancelled_contracts_workspace ON public.cancelled_contracts;
CREATE TRIGGER trg_cancelled_contracts_workspace
  BEFORE INSERT ON public.cancelled_contracts
  FOR EACH ROW EXECUTE PROCEDURE public.populate_workspace_id();

-- Policies for cancelled_contracts:

-- 1. Read Policy: Users can select contracts belonging to their workspace, or super_admins with approved support grants.
DROP POLICY IF EXISTS "Read cancelled_contracts in workspace or support approved" ON public.cancelled_contracts;
CREATE POLICY "Read cancelled_contracts in workspace or support approved" 
ON public.cancelled_contracts FOR SELECT 
USING (
  workspace_id = public.get_current_user_workspace_id()
  OR (
    public.get_current_user_role() = 'super_admin'
    AND EXISTS (SELECT 1 FROM public.support_access_grants WHERE workspace_id = cancelled_contracts.workspace_id AND status = 'approved')
  )
);

-- 2. Manage Policy: Admins/Staff of the workspace can manage contracts, or super_admins with approved support grants.
DROP POLICY IF EXISTS "Manage cancelled_contracts in workspace or support approved" ON public.cancelled_contracts;
CREATE POLICY "Manage cancelled_contracts in workspace or support approved" 
ON public.cancelled_contracts FOR ALL 
USING (
  (workspace_id = public.get_current_user_workspace_id() AND public.get_current_user_role() IN ('admin', 'staff'))
  OR (
    public.get_current_user_role() = 'super_admin'
    AND EXISTS (SELECT 1 FROM public.support_access_grants WHERE workspace_id = cancelled_contracts.workspace_id AND status = 'approved')
  )
);

