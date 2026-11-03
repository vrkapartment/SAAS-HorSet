-- Patch: add_cancelled_contract_room_id
-- วันที่: 2026-11-03
--
-- ═══════════════════════════════════════════════════════════════════════
-- ผูกประวัติสัญญายกเลิกกับห้องด้วย rooms.id
-- ═══════════════════════════════════════════════════════════════════════
--
-- หน้าจดมิเตอร์/ดูบิลต้องแสดงเลขมิเตอร์ช่วงที่ผู้เช่าย้ายออกใช้ (closing_*_prev → closing_*_curr)
-- ในรอบที่ย้ายออก เพราะแถว meter_records ของรอบนั้นถูกตั้งให้เริ่มนับใหม่ที่เลขปิดห้อง
-- (กันผู้เช่าใหม่ถูกคิดหน่วยซ้ำ) เลขของผู้เช่าที่ย้ายออกจึงอยู่ที่นี่ที่เดียว
--
-- เดิมตารางนี้เก็บแค่ room_number ซึ่งซ้ำกันข้ามอาคารได้ จึงจับคู่กับห้องให้ถูกไม่ได้
-- เพิ่ม room_id และเติมของเดิมจาก tenants_old (สำเนาผู้เช่าตอนย้ายออก ซึ่งเก็บ room_id ไว้)
--
-- เพิ่มคอลัมน์อย่างเดียว — ไม่แตะยอดเงินหรือมิเตอร์ ปลอดภัยที่จะรันซ้ำ
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

alter table public.cancelled_contracts
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

comment on column public.cancelled_contracts.room_id is
  'ห้องที่ผู้เช่าย้ายออก (rooms.id) — ใช้แสดงเลขมิเตอร์ปิดห้องในหน้าจดมิเตอร์รอบที่ย้ายออก';

create index if not exists idx_cancelled_contracts_room_id
  on public.cancelled_contracts (room_id);

-- เติมของเดิม: ห้องจากสำเนาผู้เช่าตอนย้ายออก (แถวล่าสุดของผู้เช่ารายนั้นในหอเดียวกัน)
update public.cancelled_contracts c
set room_id = (
  select o.room_id
  from public.tenants_old o
  where o.tenant_id = c.tenant_id
    and o.workspace_id = c.workspace_id
    and o.room_id is not null
  order by o.moved_out_at desc
  limit 1
)
where c.room_id is null
  and c.tenant_id is not null;
