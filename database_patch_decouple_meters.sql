-- SQL Patch: Drop NOT NULL constraints on meter_records columns
-- This allows electricity and water meter readings to be saved independently (storing empty values as NULL instead of crashing)

-- 1. Drop NOT NULL constraint for elec_curr
ALTER TABLE public.meter_records ALTER COLUMN elec_curr DROP NOT NULL;

-- 2. Drop NOT NULL constraint for water_curr
ALTER TABLE public.meter_records ALTER COLUMN water_curr DROP NOT NULL;

-- 3. Ensure index is configured
CREATE INDEX IF NOT EXISTS idx_meter_records_cycle_room ON public.meter_records (billing_cycle, room_number);
