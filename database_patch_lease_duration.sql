-- Database Patch: Add default lease contract settings to workspaces table
-- This patch adds 'lease_duration' and 'lease_expiry_action' columns to the workspaces table.

-- 1. Add lease_duration with a default value of 6 months
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS lease_duration INTEGER DEFAULT 6;

-- 2. Add lease_expiry_action with a default value of 'renew' ('renew' = ต่อสัญญาใหม่, 'original' = ฉบับเดิม)
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS lease_expiry_action VARCHAR(50) DEFAULT 'renew'
CHECK (lease_expiry_action IN ('renew', 'original'));

-- 3. Comment to describe column usages
COMMENT ON COLUMN public.workspaces.lease_duration IS 'Default lease duration in months for new tenant contracts';
COMMENT ON COLUMN public.workspaces.lease_expiry_action IS 'Default action upon lease contract expiry: renew (ต่อสัญญาใหม่) or original (ฉบับเดิม)';
