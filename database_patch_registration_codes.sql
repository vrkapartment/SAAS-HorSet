-- =========================================================================
-- Security Patch: Secure Registration Codes & Prevent Data Leak (High 🟠)
-- =========================================================================

-- 1. Create or replace the verification function as SECURITY DEFINER
-- This allows unauthenticated users to verify a specific code securely through RPC
-- without needing direct SELECT access to the entire registration_codes table.
create or replace function public.verify_registration_code(input_code text)
returns table (
  code text,
  workspace_id uuid,
  role text,
  created_at timestamptz,
  expires_at timestamptz,
  is_used boolean,
  used_by_email text
) as $$
begin
  return query
  select 
    rc.code,
    rc.workspace_id,
    rc.role,
    rc.created_at,
    rc.expires_at,
    rc.is_used,
    rc.used_by_email
  from public.registration_codes rc
  where rc.code = input_code;
end;
$$ language plpgsql security definer;

-- 2. Drop the overly broad select policy on registration_codes (using(true))
drop policy if exists "Anyone can read registration codes for verification" on public.registration_codes;

-- 3. Ensure RLS is active on registration_codes
alter table public.registration_codes enable row level security;

-- 4. Verify Super Admin policy is correctly set (manage all codes)
drop policy if exists "Super Admins can manage registration codes" on public.registration_codes;
create policy "Super Admins can manage registration codes"
on public.registration_codes for all
using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
);
