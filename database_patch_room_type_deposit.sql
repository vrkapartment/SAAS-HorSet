-- SQL Patch to add deposit_amount column to room_types table
-- Run this in your Supabase SQL Editor to enable persistent cloud storage for room type deposits.

ALTER TABLE public.room_types ADD COLUMN IF NOT exists deposit_amount numeric DEFAULT NULL;

-- Comment: This is completely safe, backward-compatible, and integrates with the client-side fallback system.
