-- =========================================================================
-- Database Patch: LINE OA Message Quota Cache (High 🟠)
-- =========================================================================

-- 1. Create cache table for storing LINE Messaging API responses
CREATE TABLE IF NOT EXISTS public.line_quota_cache (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Ensure single-row cache
  limit_count integer NOT NULL,
  consumed_count integer NOT NULL,
  remaining_count integer NOT NULL,
  percentage_used integer NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.line_quota_cache ENABLE ROW LEVEL SECURITY;

-- 3. Create Policy for Super Admin to view/manage cache directly if needed
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
COMMENT ON TABLE public.line_quota_cache IS 'Stores the cached LINE OA Messaging API quota data to prevent exceeding rate limits (cached for 10 minutes).';
