-- Database Patch: Add Extra Monthly Expenses to Rooms
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS extra_expenses jsonb DEFAULT '[]'::jsonb;
