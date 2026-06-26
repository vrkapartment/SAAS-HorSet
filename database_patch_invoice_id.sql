-- SQL Patch to add invoice_id column and uniqueness per workspace to bills table
-- Run this in your Supabase SQL Editor to apply database changes.

-- 1. Add the invoice_id column (allowing NULLs initially)
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS invoice_id text;

-- 2. Backfill existing bills with a unique invoice_id based on billing cycle and room number
-- This ensures that any existing records have unique invoice_ids before we apply the UNIQUE constraint
UPDATE public.bills 
SET invoice_id = 'INV-' || replace(billing_cycle, '-', '') || '-' || room_number 
WHERE invoice_id IS NULL;

-- 3. Add composite unique constraint per workspace
-- Drop if it already exists to prevent duplication errors
ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_workspace_id_invoice_id_key;
ALTER TABLE public.bills ADD CONSTRAINT bills_workspace_id_invoice_id_key UNIQUE (workspace_id, invoice_id);

-- 4. Reload schema to make sure PostgREST is aware of the new column immediately
NOTIFY pgrst, 'reload schema';

-- Comment: Safe, backward-compatible patch that prepares existing data and enforces workspace-level uniqueness of Invoice IDs.
