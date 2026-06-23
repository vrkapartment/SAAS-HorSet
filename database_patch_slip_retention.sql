-- SQL Patch to add slip_retention_months column to workspaces table
-- Run this in your Supabase SQL Editor to enable slip retention configuration.

ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS slip_retention_months integer DEFAULT 0;

-- Comment: This is completely safe, backward-compatible, and defaults to 0 (which represents keeping slips forever / no auto-deletion).
