-- Step 1: เช็คก่อนว่ามีข้อมูลซ้ำจริงไหม (ไม่ลบอะไร แค่ดู)
SELECT workspace_id, room_number, billing_cycle, count(*)
FROM public.meter_records
GROUP BY workspace_id, room_number, billing_cycle
HAVING count(*) > 1;

-- Step 2: ถ้ามีซ้ำจริง ค่อยลบ โดยเทียบจาก created_at (เวลาจริง) ไม่ใช่ id
DELETE FROM public.meter_records a USING public.meter_records b
WHERE a.created_at < b.created_at
  AND a.workspace_id = b.workspace_id
  AND a.room_number = b.room_number
  AND a.billing_cycle = b.billing_cycle;

-- Step 3: เพิ่ม constraint (ไม่ลบข้อมูล)
ALTER TABLE public.meter_records
  DROP CONSTRAINT IF EXISTS meter_records_workspace_room_cycle_key;
ALTER TABLE public.meter_records
  ADD CONSTRAINT meter_records_workspace_room_cycle_key
  UNIQUE (workspace_id, room_number, billing_cycle);

NOTIFY pgrst, 'reload schema';
