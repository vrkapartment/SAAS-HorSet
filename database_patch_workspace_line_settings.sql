-- =========================================================================
-- Database Patch: Multi-Workspace LINE OA Integration (High 🟠)
-- =========================================================================

-- 1. Create table for storing LINE OA Messaging API settings and cache per workspace (multi-tenant)
CREATE TABLE IF NOT EXISTS public.workspace_line_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_access_token text,                       -- Securely stored LINE Channel Access Token
  liff_id text,                                    -- LINE LIFF ID for tenant registration
  limit_count integer NOT NULL DEFAULT 1000,
  consumed_count integer NOT NULL DEFAULT 0,
  remaining_count integer NOT NULL DEFAULT 1000,
  percentage_used integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.workspace_line_settings ENABLE ROW LEVEL SECURITY;

-- 3. Create Policy for Workspace Admins/Staff to view/manage their own settings
DROP POLICY IF EXISTS "Users can manage their own workspace line settings" ON public.workspace_line_settings;
CREATE POLICY "Users can manage their own workspace line settings"
ON public.workspace_line_settings FOR ALL
TO authenticated
USING (
  -- Allows admin/staff of this workspace, OR super_admin, to access
  workspace_id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
  OR 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- 4. Seed initial records from line_quota_cache if it exists and workspace exists
-- Let's populate the default workspace with the existing token from line_quota_cache if any
INSERT INTO public.workspace_line_settings (workspace_id, channel_access_token, limit_count, consumed_count, remaining_count, percentage_used, updated_at)
SELECT 
  'd290f1ee-6c54-4b01-90e6-d701748f0851'::uuid, 
  channel_access_token, 
  limit_count, 
  consumed_count, 
  remaining_count, 
  percentage_used, 
  updated_at 
FROM public.line_quota_cache 
WHERE id = 1
ON CONFLICT (workspace_id) DO NOTHING;

-- Comment to describe the table
COMMENT ON TABLE public.workspace_line_settings IS 'Stores the cached LINE OA Messaging API settings and quota data per workspace (multi-tenant).';
