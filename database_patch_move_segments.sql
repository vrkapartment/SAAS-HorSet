-- Patch: move_segments
-- วันที่: 2026-08-24
--
-- =========================================================================
-- ทำไมต้องมี patch นี้
-- =========================================================================
-- แก้สองอาการที่เกิดจากเรื่องเดียวกัน: เหตุการณ์ "ย้าย" กับ "การจดมิเตอร์รายเดือน"
-- ใช้ที่เก็บข้อมูลร่วมกันอยู่ ทั้งที่เป็นข้อมูลสองชนิด
--
-- อาการที่ 1 — ย้ายออกแล้วมีผู้เช่าใหม่เข้ามาในเดือนเดียวกัน
--   ตอนย้ายออก ระบบเขียนเลขมิเตอร์ปิดห้องลงแถว meter_records ของรอบนั้นเลย
--   ค่าน้ำ-ไฟของผู้เช่าที่ย้ายออกถูกหักจากเงินประกันไปแล้ว (ไม่ได้ออกเป็นบิล)
--   แต่แถวมิเตอร์ยังมี elec_prev เป็นเลขตั้งต้นของ "ผู้เช่าคนเดิม"
--   → ปลายเดือนผู้เช่าคนใหม่ถูกออกบิลนับหน่วยตั้งแต่เลขของคนเดิม = จ่ายซ้ำหน่วยที่คนเดิม
--     จ่ายไปแล้วผ่านเงินประกัน และไม่มีอะไรในระบบฟ้องเลย
--
-- อาการที่ 2 — ย้ายห้องกลางเดือน
--   ระบบออก "บิลปิดรอบ" ของห้องเดิมเป็นอีกใบ (bill_kind = transfer_closing)
--   ผู้เช่าคนเดียวได้บิลสองใบในเดือนเดียว ต้องจ่ายสองรอบ และดูไม่ออกว่าใบไหนห้องไหน
--
-- ทางแก้: เก็บ "เลขมิเตอร์ตอนปิดห้อง" ไว้ที่เหตุการณ์ย้าย (ไม่ใช่ในแถวมิเตอร์รายเดือน)
-- แล้วยกค่าน้ำ-ไฟของห้องเดิมไปเป็น "รายการย่อย" ในบิลห้องใหม่ใบเดียว
--
-- ⚠️ patch นี้เพิ่มคอลัมน์เท่านั้น ไม่แก้/ลบข้อมูลเดิม และไม่เปลี่ยนพฤติกรรมโค้ดที่รันอยู่
--    (คอลัมน์ใหม่ทุกตัวมีค่า default ที่เท่ากับพฤติกรรมเดิม) บิลเก่าและใบ -TRANSFER
--    ที่ออกไปแล้วยังอยู่ครบและอ่านได้เหมือนเดิม
--
-- ปลอดภัยที่จะรันซ้ำได้ (add column if not exists ทุกข้อ)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new

-- =========================================================================
-- 1. bills.utility_segments — รายการของห้องเดิมที่ยกมารวมในบิลนี้
-- =========================================================================
-- เป็น array (ไม่ใช่ object เดียว) เพราะผู้เช่าย้ายห้องได้หลายครั้งในเดือนเดียว
-- เก็บเป็น jsonb แบบเดียวกับ bills.extra_expenses ที่ใช้อยู่แล้ว
--
-- แต่ละสมาชิกเก็บ "ยอดที่คิดเสร็จแล้ว" ทั้งอัตรา หน่วย และเงิน ไม่ใช่ข้อมูลตั้งต้น
-- เหตุผลอยู่ในหัวไฟล์ src/lib/billSegments.ts (สรุป: ตอนออกบิลปลายเดือน อัตราค่าไฟ
-- หรือการตั้งค่าขั้นต่ำอาจเปลี่ยนไปแล้วจากวันที่ผู้เช่าอยู่ห้องเดิมจริง)
alter table public.bills
  add column if not exists utility_segments jsonb default '[]'::jsonb;

comment on column public.bills.utility_segments is
  'รายการค่าน้ำ-ไฟ-ค่าเช่าของห้องเดิมที่ยกมารวมในบิลนี้ (ย้ายห้องกลางเดือน) — array ของ segment ที่คิดยอดเสร็จแล้ว ดู src/lib/billSegments.ts';

-- =========================================================================
-- 2. cancelled_contracts — เลขมิเตอร์ตอนปิดห้อง
-- =========================================================================
-- ตารางนี้เดิมเก็บแต่ตัวเลขเงินประกัน/เงินคืน ไม่มีเลขมิเตอร์เลย ทั้งที่ยอดหักค่าน้ำ-ไฟ
-- (utilities_deduction) คำนวณมาจากเลขมิเตอร์ → ตรวจย้อนหลังไม่ได้ว่ายอดนั้นมาจากเลขอะไร
--
-- และที่สำคัญกว่า: เป็นที่เดียวที่จะบอกผู้เช่าคนถัดไปได้ว่า "มิเตอร์ของคุณเริ่มที่เลขนี้"
-- ตอนย้ายเข้าห้องเดียวกันภายในเดือนเดียวกัน
alter table public.cancelled_contracts
  add column if not exists closing_elec_prev numeric,
  add column if not exists closing_elec_curr numeric,
  add column if not exists closing_water_prev numeric,
  add column if not exists closing_water_curr numeric;

comment on column public.cancelled_contracts.closing_elec_curr is
  'เลขมิเตอร์ไฟตอนปิดห้อง — ใช้เป็นเลขตั้งต้นของผู้เช่าคนถัดไปที่เข้าห้องนี้ในเดือนเดียวกัน';
comment on column public.cancelled_contracts.closing_water_curr is
  'เลขมิเตอร์น้ำตอนปิดห้อง — ใช้เป็นเลขตั้งต้นของผู้เช่าคนถัดไปที่เข้าห้องนี้ในเดือนเดียวกัน';

-- =========================================================================
-- 3. tenant_room_transfers — ยอดที่คิดไว้ของห้องเดิม + ตัวเลือกรวมค่าเช่า
-- =========================================================================
-- ตารางนี้มีเลขมิเตอร์ปิด/เปิดอยู่แล้ว (closing_*, starting_*) แต่ไม่มี "ยอดเงิน"
-- ที่คิดจากเลขนั้น เพราะเดิมยอดไปอยู่ในบิล -TRANSFER แยกใบ
--
-- พอเลิกออกบิลแยกใบ ยอดต้องเก็บที่นี่ เพราะที่นี่คือจุดที่รู้อัตราและการตั้งค่าขั้นต่ำ
-- ณ วันที่ย้ายจริง (ปลายเดือนตอนออกบิลอาจเปลี่ยนไปแล้ว)
alter table public.tenant_room_transfers
  add column if not exists closing_elec_units numeric,
  add column if not exists closing_elec_rate numeric,
  add column if not exists closing_elec_amount numeric,
  add column if not exists closing_elec_min_applied boolean,
  add column if not exists closing_water_units numeric,
  add column if not exists closing_water_rate numeric,
  add column if not exists closing_water_amount numeric,
  add column if not exists closing_water_min_applied boolean,
  add column if not exists include_old_room_rent boolean not null default false,
  add column if not exists old_room_rent_amount numeric;

comment on column public.tenant_room_transfers.closing_elec_min_applied is
  'ช่วงห้องเดิมคิดขั้นต่ำหรือไม่ — ระบบเขียน false เสมอโดยเจตนา ไม่ให้ผู้เช่าโดนขั้นต่ำสองครั้งในเดือนที่ย้ายห้อง (บิลห้องใหม่คิดขั้นต่ำของตัวเองอยู่แล้ว)';

comment on column public.tenant_room_transfers.include_old_room_rent is
  'true = รวมค่าเช่าห้องเดิม (ต้นเดือนถึงวันย้าย) ไว้ในบิลห้องใหม่ด้วย — ผู้ดูแลเลือกตอนย้าย';
comment on column public.tenant_room_transfers.old_room_rent_amount is
  'ค่าเช่าห้องเดิมที่คิดรวม ค่าเริ่มต้นมาจากนโยบายย้ายออกกลางเดือนของหอ (checkout_policy) แต่ผู้ดูแลแก้เองได้';

-- =========================================================================
-- 4. meter_records — หมุด "เลขตั้งต้นของผู้เช่าคนใหม่" เมื่อมีการย้ายกลางรอบ
-- =========================================================================
-- ทำไมต้องมีคอลัมน์นี้ ทั้งที่ elec_prev ก็คือเลขตั้งต้นอยู่แล้ว
--
-- หน้าออกบิลตัดสิน prev ของรอบนี้ด้วยลำดับนี้ (src/app/(admin)/billing/page.tsx):
--     1. curr ของ "รอบก่อนหน้า" ถ้ามี   ← ชนะทุกอย่าง
--     2. elec_prev ของแถวรอบนี้
-- กฎข้อ 1 มีเหตุผลของมัน (แก้เลขมิเตอร์เดือนก่อนย้อนหลังแล้วเดือนนี้ตามให้เอง) แต่ทำให้
-- การตั้ง elec_prev ใหม่กลางรอบ "ไม่มีผล" — พอสตาฟเปิดหน้าออกบิลแล้วกดบันทึก
-- prev จะเด้งกลับไปเป็นเลขของผู้เช่าคนเดิมทันที
--
-- ผลจริง: ผู้เช่าคนใหม่ที่ย้ายเข้าห้องเดิมภายในเดือนเดียวกัน ถูกคิดหน่วยตั้งแต่เลขของคนก่อน
-- และสตาฟแก้เองไม่ได้ด้วย เพราะช่องเลขก่อนหน้าถูกล็อก (แก้ได้เฉพาะเดือนแรกที่สมัคร —
-- ล็อกนี้ตั้งใจให้มี เพื่อกันแก้เลขมิเตอร์โดยไม่ตั้งใจ)
--
-- คอลัมน์นี้คือหมุดที่ "ชนะกฎข้อ 1" เฉพาะห้อง-รอบที่มีเหตุการณ์ย้ายจริงเท่านั้น
-- null = ไม่มีเหตุการณ์ = พฤติกรรมเดิมทุกอย่าง (ซึ่งเป็นกรณีของทุกแถวที่มีอยู่วันนี้)
alter table public.meter_records
  add column if not exists occupancy_start_elec numeric,
  add column if not exists occupancy_start_water numeric,
  add column if not exists occupancy_start_reason text,
  add column if not exists occupancy_start_date date;

comment on column public.meter_records.occupancy_start_elec is
  'เลขมิเตอร์ไฟตั้งต้นของผู้เช่าปัจจุบัน เมื่อห้องนี้เปลี่ยนผู้เช่ากลางรอบ — ชนะกฎ "prev = curr ของรอบก่อน" ในหน้าออกบิล';
comment on column public.meter_records.occupancy_start_reason is
  'เหตุที่ทำให้ต้องตั้งเลขตั้งต้นใหม่กลางรอบ: checkout (ย้ายออก) หรือ transfer_out (ย้ายไปห้องอื่น) หรือ transfer_in (ย้ายเข้าห้องนี้)';

-- =========================================================================
-- 5. ให้ PostgREST เห็นคอลัมน์ใหม่ทันที (ไม่ต้องรอ cache หมดอายุ)
-- =========================================================================
notify pgrst, 'reload schema';

-- =========================================================================
-- 6. ตรวจผลหลังรัน
-- =========================================================================
-- คอลัมน์ต้องมีครบ 19 ตัว:
--   select table_name, column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public'
--     and (
--       (table_name = 'bills' and column_name = 'utility_segments')
--       or (table_name = 'cancelled_contracts' and column_name like 'closing_%')
--       or (table_name = 'meter_records' and column_name like 'occupancy_start_%')
--       or (table_name = 'tenant_room_transfers'
--           and column_name in ('closing_elec_units','closing_elec_rate','closing_elec_amount',
--                               'closing_elec_min_applied','closing_water_units','closing_water_rate',
--                               'closing_water_amount','closing_water_min_applied',
--                               'include_old_room_rent','old_room_rent_amount'))
--     )
--   order by table_name, column_name;
--
-- บิลเดิมทุกใบต้องได้ utility_segments = [] (ไม่ใช่ null) จึงจะไม่มีใบไหนแสดงผลเปลี่ยน:
--   select count(*) filter (where utility_segments is null) as ยังเป็น_null,
--          count(*) filter (where utility_segments = '[]'::jsonb) as ว่างถูกต้อง
--   from public.bills;
--
-- หมายเหตุ: default ใช้กับแถวใหม่เท่านั้น แถวเดิมจะเป็น null ซึ่งฝั่งโค้ดรับได้
-- (parseUtilitySegments คืน array ว่างเมื่อไม่ใช่ array) จึงไม่ต้อง backfill
