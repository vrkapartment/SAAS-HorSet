-- =========================================================================
-- Database Patch: Admin LINE Connection Codes
-- =========================================================================

-- 1. Create admin_connection_codes table
CREATE TABLE IF NOT EXISTS public.admin_connection_codes (
  code text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  is_used boolean NOT NULL DEFAULT false
);

-- 2. Add indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_admin_connection_codes_code_unused 
  ON public.admin_connection_codes (code) 
  WHERE is_used = false;

-- 3. Enable RLS
ALTER TABLE public.admin_connection_codes ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
DROP POLICY IF EXISTS "Admins can manage connection codes for their workspace" ON public.admin_connection_codes;
CREATE POLICY "Admins can manage connection codes for their workspace"
ON public.admin_connection_codes FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- 5. Add comments
COMMENT ON TABLE public.admin_connection_codes IS 'Temporary 5-minute codes to allow LINE Admins to bind their LINE UID automatically by sending the code to the bot';
COMMENT ON COLUMN public.admin_connection_codes.code IS '6-digit random code used to pair LINE UID';
COMMENT ON COLUMN public.admin_connection_codes.workspace_id IS 'Associated workspace id';
COMMENT ON COLUMN public.admin_connection_codes.expires_at IS 'Expiration timestamp, strictly 5 minutes from creation';
COMMENT ON COLUMN public.admin_connection_codes.is_used IS 'Flag to mark code as consumed';
