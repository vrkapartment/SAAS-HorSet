-- =========================================================================
-- Database Patch: LINE OA Message Quota Cache & Settings (High 🟠)
-- =========================================================================

-- 1. Create cache table for storing LINE OA Messaging API settings and cache
CREATE TABLE IF NOT EXISTS public.line_quota_cache (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Ensure single-row configuration
  channel_access_token text,                       -- Securely stored LINE Channel Access Token
  limit_count integer NOT NULL DEFAULT 1000,
  consumed_count integer NOT NULL DEFAULT 0,
  remaining_count integer NOT NULL DEFAULT 1000,
  percentage_used integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add column if table already existed from previous version
ALTER TABLE public.line_quota_cache ADD COLUMN IF NOT EXISTS channel_access_token text;

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.line_quota_cache ENABLE ROW LEVEL SECURITY;

-- 3. Create Policy for Super Admin to view/manage cache and settings directly
DROP POLICY IF EXISTS "Super Admins can manage line quota cache" ON public.line_quota_cache;
CREATE POLICY "Super Admins can manage line quota cache"
ON public.line_quota_cache FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Comment to describe the table
COMMENT ON TABLE public.line_quota_cache IS 'Stores the cached LINE OA Messaging API quota data and configuration (securely managed by Super Admins).';
