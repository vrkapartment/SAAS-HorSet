-- Database Patch: Add checkout policy and tax partitions for checkout deposit refund system

-- 1. Alter rooms status check constraint to support 'Pending_Refund' state
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_status_check CHECK (status IN ('occupied', 'available', 'Pending_Refund'));

-- 2. Add checkout_policy column to workspaces
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS checkout_policy VARCHAR(50) DEFAULT 'DAILY_PRORATE';

-- 3. Add tax partition columns to cancelled_contracts
ALTER TABLE public.cancelled_contracts ADD COLUMN IF NOT EXISTS deducted_rent_405 NUMERIC DEFAULT 0;
ALTER TABLE public.cancelled_contracts ADD COLUMN IF NOT EXISTS deducted_utilities_408 NUMERIC DEFAULT 0;
ALTER TABLE public.cancelled_contracts ADD COLUMN IF NOT EXISTS deducted_services_408 NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.workspaces.checkout_policy IS 'Mid-month checkout deposit deduction policy (DAILY_PRORATE or FULL_MONTH)';
COMMENT ON COLUMN public.cancelled_contracts.deducted_rent_405 IS 'Deducted rental income 40(5) from deposit check-out';
COMMENT ON COLUMN public.cancelled_contracts.deducted_utilities_408 IS 'Deducted water and electric utility income 40(8) from deposit check-out';
COMMENT ON COLUMN public.cancelled_contracts.deducted_services_408 IS 'Deducted other services or damages income 40(8) from deposit check-out';
