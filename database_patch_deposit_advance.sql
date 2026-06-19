-- SQL Patch to add Deposit Amount and Advance Rent settings columns to workspaces table
-- Run this in your Supabase SQL Editor to enable persistent cloud storage for these values.

-- 1. Add deposit_amount column to workspaces
alter table public.workspaces add column if not exists deposit_amount numeric default 0;

-- 2. Add advance_rent column to workspaces
alter table public.workspaces add column if not exists advance_rent numeric default 0;

-- 3. Add late_penalty_rate column to workspaces (if not exists)
alter table public.workspaces add column if not exists late_penalty_rate numeric default 0;

-- Comment: This is completely safe and backward-compatible with any existing data.
