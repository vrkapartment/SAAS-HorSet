-- Create cached_translations table
CREATE TABLE IF NOT EXISTS public.cached_translations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_text text NOT NULL,
  target_language varchar(10) NOT NULL,
  translated_text text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(source_text, target_language)
);

-- Enable RLS
ALTER TABLE public.cached_translations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read from cached_translations
CREATE POLICY "Authenticated users can read cached translations" ON public.cached_translations
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Let service role handle insert, or we can use anon/auth depending on how we insert.
-- We will use the service role key from the API route to bypass RLS for insertions.
