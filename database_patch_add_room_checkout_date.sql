-- Patch: add_room_checkout_date
-- วันที่: 2026-11-03
--
-- ═══════════════════════════════════════════════════════════════════════
-- เก็บ "วันที่แจ้งย้ายออก" ไว้กับห้อง
-- ═══════════════════════════════════════════════════════════════════════
--
-- ปัญหาเดิม: การแจ้งย้ายออกเปลี่ยนแค่ rooms.status เป็น 'Pending_Refund' ไม่ได้จำว่าแจ้งรอบไหน
--   หน้าจดมิเตอร์/ดูบิลจึงขึ้นแถบ "แจ้งย้ายออกในรอบบิลนี้" ทุกรอบที่เปิดดู รวมถึงรอบก่อนหน้า
--   ที่ผู้เช่ายังอยู่ปกติ — ดูหรือจดมิเตอร์ย้อนหลังของห้องนั้นไม่ได้เลย
--
-- rooms.checkout_date = วันย้ายออกที่ผู้ดูแลกรอกตอนแจ้งย้ายออก
--   หน้าจดมิเตอร์/ดูบิลแสดงแถบตั้งแต่รอบของวันนี้เป็นต้นไป รอบก่อนหน้าแสดงมิเตอร์ตามปกติ
--
-- trigger ดูแลให้ค่าไม่ค้าง:
--   - ห้องเปลี่ยนเป็น 'Pending_Refund' โดยไม่ได้ส่งวันที่มา (เช่นยกเลิกการคืนห้อง) → ใช้วันนี้ (เวลาไทย)
--   - ห้องเปลี่ยนออกจาก 'Pending_Refund' (ยกเลิกการแจ้งย้ายออก / คืนเงินประกันเสร็จ) → ล้างค่า
--
-- ⚠️ ต้องรันไฟล์นี้ใน Supabase "ก่อน" deploy โค้ดชุดนี้ — โค้ดใหม่เขียนคอลัมน์ checkout_date
--    ถ้ายังไม่มีคอลัมน์ การแจ้งย้ายออกในหน้า /rooms จะล้ม
--
-- ปลอดภัยที่จะรันซ้ำได้ (IF NOT EXISTS / CREATE OR REPLACE / backfill เฉพาะแถวที่ยังว่าง)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new


-- ═══════════════════════════════════════════════════════════════════════
-- 1. คอลัมน์
-- ═══════════════════════════════════════════════════════════════════════

alter table public.rooms
  add column if not exists checkout_date date;

comment on column public.rooms.checkout_date is
  'วันย้ายออกที่แจ้งไว้ (มีค่าเฉพาะตอน status = Pending_Refund) — หน้าจดมิเตอร์/ดูบิลขึ้นแถบแจ้งย้ายออกตั้งแต่รอบของวันนี้';


-- ═══════════════════════════════════════════════════════════════════════
-- 2. trigger กันค่าค้าง
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.sync_room_checkout_date()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.status = 'Pending_Refund' then
    if old.status is distinct from 'Pending_Refund' and new.checkout_date is null then
      new.checkout_date := (now() at time zone 'Asia/Bangkok')::date;
    end if;
  else
    new.checkout_date := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_rooms_sync_checkout_date on public.rooms;
create trigger trg_rooms_sync_checkout_date
  before update of status, checkout_date on public.rooms
  for each row execute procedure public.sync_room_checkout_date();


-- ═══════════════════════════════════════════════════════════════════════
-- 3. backfill ห้องที่รอคืนเงินประกันอยู่ตอนนี้
-- ═══════════════════════════════════════════════════════════════════════
--
-- ใช้เวลาที่สถานะเปลี่ยนเป็น Pending_Refund ครั้งล่าสุดจาก audit_logs
-- ห้องที่หาไม่เจอ (ไม่มี log) ปล่อยว่าง — หน้าจอจะขึ้นแถบทุกรอบเหมือนพฤติกรรมเดิม

update public.rooms r
set checkout_date = sub.changed_on
from (
  select distinct on (record_id)
    record_id,
    (created_at at time zone 'Asia/Bangkok')::date as changed_on
  from public.audit_logs
  where table_name = 'rooms'
    and action = 'UPDATE'
    and after ->> 'status' = 'Pending_Refund'
  order by record_id, created_at desc
) sub
where r.id = sub.record_id
  and r.status = 'Pending_Refund'
  and r.checkout_date is null;
