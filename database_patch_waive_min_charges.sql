-- =========================================================================
-- DATABASE PATCH: Waive minimum electricity and water charges for individual rooms
-- =========================================================================
-- This patch adds 'waive_electric_min' and 'waive_water_min' columns to the 'rooms' table.
-- Copy and run this script in the Supabase SQL Editor.

-- 1. Add waive_electric_min column if it does not exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rooms' AND column_name = 'waive_electric_min'
    ) THEN
        ALTER TABLE public.rooms ADD COLUMN waive_electric_min BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 2. Add waive_water_min column if it does not exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rooms' AND column_name = 'waive_water_min'
    ) THEN
        ALTER TABLE public.rooms ADD COLUMN waive_water_min BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. Update existing records to ensure they have default values (false) instead of null
UPDATE public.rooms SET waive_electric_min = FALSE WHERE waive_electric_min IS NULL;
UPDATE public.rooms SET waive_water_min = FALSE WHERE waive_water_min IS NULL;

-- 4. Comment on columns for documentation
COMMENT ON COLUMN public.rooms.waive_electric_min IS 'Waive minimum electricity unit charge for this room (true = waive, false = calculate normally)';
COMMENT ON COLUMN public.rooms.waive_water_min IS 'Waive minimum water unit charge for this room (true = waive, false = calculate normally)';
