-- Database Patch: Add staff permissions to profiles table
-- This patch adds a 'permissions' JSONB column to the profiles table to easily control and adjust Staff capabilities.

-- 1. Add the column with a sensible default for existing/new staff
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS permissions JSONB 
DEFAULT '{"manage_rooms_tenants": true, "manage_meters_bills": true, "manage_finance_expenses": true, "access_tax": false}'::jsonb;

-- 2. Update existing admin & super_admin profiles to have all permissions by default
UPDATE public.profiles
SET permissions = '{"manage_rooms_tenants": true, "manage_meters_bills": true, "manage_finance_expenses": true, "access_tax": true}'::jsonb
WHERE role IN ('admin', 'super_admin');

-- 3. Comment to describe column usage
COMMENT ON COLUMN public.profiles.permissions IS 'Stores staff/user permissions as a JSON object: {"manage_rooms_tenants": boolean, "manage_meters_bills": boolean, "manage_finance_expenses": boolean, "access_tax": boolean}';
