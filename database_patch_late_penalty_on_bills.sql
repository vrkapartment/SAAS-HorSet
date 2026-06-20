-- SQL Patch to add penalty_amount column to bills table
-- Run this in your Supabase SQL Editor to enable persistent cloud storage for late payment penalties.

ALTER TABLE public.bills ADD COLUMN IF NOT exists penalty_amount numeric DEFAULT 0;
ALTER TABLE public.bills ADD COLUMN IF NOT exists late_days integer DEFAULT 0;

-- Comment: This is completely safe, backward-compatible, and integrates with the client-side system.
