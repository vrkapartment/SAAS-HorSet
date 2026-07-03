-- =========================================================================
-- Database Patch: LINE Notifications Settings for Workspaces
-- =========================================================================

-- 1. Add admin notification columns and channel secret to workspace_line_settings if they don't exist
ALTER TABLE public.workspace_line_settings 
  ADD COLUMN IF NOT EXISTS admin_line_user_id text,
  ADD COLUMN IF NOT EXISTS admin_line_group_id text,
  ADD COLUMN IF NOT EXISTS channel_secret text;

-- 2. Add comments to describe columns
COMMENT ON COLUMN public.workspace_line_settings.admin_line_user_id IS 'LINE User ID of the Workspace Admin for direct personal slip notifications';
COMMENT ON COLUMN public.workspace_line_settings.admin_line_group_id IS 'LINE Group ID of the Workspace Admin Team for group slip notifications';
COMMENT ON COLUMN public.workspace_line_settings.channel_secret IS 'Securely stored LINE Channel Secret for verifying LINE webhooks per workspace';
