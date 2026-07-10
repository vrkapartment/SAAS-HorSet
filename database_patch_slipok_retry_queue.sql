-- Patch: SlipOK Auto-Retry Queue
-- ใช้สำหรับเข้าคิวตรวจสอบสลิปซ้ำอัตโนมัติ เมื่อ SlipOK ตอบ error ชั่วคราวจากฝั่งธนาคาร
-- (code 1009: ข้อมูลธนาคารขัดข้องชั่วคราว, code 1010: สลิปจากธนาคารนี้ต้องรอสักครู่ก่อนตรวจสอบได้)
-- Cron job จะดึงรายการที่ครบเวลา (next_retry_at <= now()) มาตรวจซ้ำทุก 5 นาที สูงสุด 3 ครั้ง
-- ก่อน run ให้ตรวจสอบว่ายังไม่มีตารางนี้อยู่ก่อน (IF NOT EXISTS ป้องกัน run ซ้ำพัง)

create table if not exists public.slipok_retry_queue (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  workspace_id uuid not null,
  slip_url text not null,
  amount numeric,
  status text not null check (status in ('pending', 'succeeded', 'failed', 'cancelled')) default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_retry_at timestamptz not null,
  last_error_code integer,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_slipok_retry_queue_due
  on public.slipok_retry_queue (status, next_retry_at)
  where status = 'pending';

alter table public.slipok_retry_queue enable row level security;

-- ตารางนี้ถูกเข้าถึงเฉพาะผ่าน Service Role Client เท่านั้น (Server Action ตอนอัปโหลดสลิป + Cron Job)
-- ไม่มี policy ให้ client ปกติ (anon/authenticated) เข้าถึงได้เลย จึงไม่ต้องเปิด policy เพิ่ม