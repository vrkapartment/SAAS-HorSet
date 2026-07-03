-- =========================================================================
-- Database Patch: Toggle Admin Notifications
-- =========================================================================

-- 1. Add admin_notification_active column to workspace_line_settings if it doesn't exist
ALTER TABLE public.workspace_line_settings 
  ADD COLUMN IF NOT EXISTS admin_notification_active boolean NOT NULL DEFAULT true;

-- 2. Add comment to describe column
COMMENT ON COLUMN public.workspace_line_settings.admin_notification_active IS 'Flag to toggle on/off admin notification alerts without deleting settings';
