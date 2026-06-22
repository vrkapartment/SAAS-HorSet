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
