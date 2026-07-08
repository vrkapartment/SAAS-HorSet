-- ลบข้อมูลซ้ำก่อน (ถ้ามี) เก็บแถวล่าสุดไว้ ก่อน apply constraint
DELETE FROM public.meter_records a USING public.meter_records b
WHERE a.id < b.id
  AND a.workspace_id = b.workspace_id
  AND a.room_number = b.room_number
  AND a.billing_cycle = b.billing_cycle;

ALTER TABLE public.meter_records
  DROP CONSTRAINT IF EXISTS meter_records_workspace_room_cycle_key;
ALTER TABLE public.meter_records
  ADD CONSTRAINT meter_records_workspace_room_cycle_key
  UNIQUE (workspace_id, room_number, billing_cycle);

NOTIFY pgrst, 'reload schema';
