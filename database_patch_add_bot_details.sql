-- =========================================================================
-- Database Patch: Add Bot Caching Columns to LINE Settings (High 🟠)
-- Run this in the Supabase SQL Editor if you already have workspace_line_settings
-- =========================================================================

-- 1. Add bot_name to workspace_line_settings if it doesn't exist
ALTER TABLE public.workspace_line_settings 
ADD COLUMN IF NOT EXISTS bot_name text DEFAULT 'LINE OA ของหอพัก';

-- 2. Add bot_basic_id to workspace_line_settings if it doesn't exist
ALTER TABLE public.workspace_line_settings 
ADD COLUMN IF NOT EXISTS bot_basic_id text DEFAULT '@line_oa';

-- 3. Update existing records with default values if they are null
UPDATE public.workspace_line_settings
SET 
  bot_name = COALESCE(bot_name, 'LINE OA ของหอพัก'),
  bot_basic_id = COALESCE(bot_basic_id, '@line_oa')
WHERE bot_name IS NULL OR bot_basic_id IS NULL;

-- 4. Comment columns
COMMENT ON COLUMN public.workspace_line_settings.bot_name IS 'Cached LINE Bot Display Name';
COMMENT ON COLUMN public.workspace_line_settings.bot_basic_id IS 'Cached LINE Bot Basic ID (e.g. @line_oa)';
