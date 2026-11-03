-- Patch: add_revert_checkout
-- วันที่: 2026-11-03
--
-- ═══════════════════════════════════════════════════════════════════════
-- "ยกเลิกการคืนห้อง/ย้ายออก" — ย้อนการคืนเงินประกันที่ยืนยันไปแล้ว
-- ═══════════════════════════════════════════════════════════════════════
--
-- ปัญหาเดิม: กดยืนยันคืนเงินประกันในหน้า /rooms แล้วถอยไม่ได้เลย
--   ถ้ากรอกเลขมิเตอร์ปิดห้องผิด ยอดหักค่าน้ำ-ไฟผิดถาวร และมิเตอร์ของรอบนั้น/รอบถัดไป
--   ถูกตั้งจากเลขที่ผิด ("แก้ไขประวัติ" แก้ได้แค่ตัวเลขเงิน ไม่แตะมิเตอร์)
--
-- การคืนห้องเขียน 4 จุด ฟังก์ชันนี้ย้อนครบทั้ง 4 จุดใน transaction เดียว:
--   1. cancelled_contracts  → ทำเครื่องหมาย reverted_at (ไม่ลบ — soft delete)
--   2. meter_records รอบที่ย้ายออก + รอบถัดไป → คืนค่าก่อนเกิดเหตุจาก audit_logs
--   3. tenants (ถูกลบไปแล้ว) → คืนแถวเดิมด้วย id เดิม จาก audit_logs + tenants_old
--      (audit_logs ซ่อนเบอร์โทร/LINE ไว้ จึงเอาสองฟิลด์นั้นจาก tenants_old)
--   4. rooms.status → 'Pending_Refund' ให้ผู้ดูแลกรอกมิเตอร์ที่ถูกแล้วคืนเงินใหม่
--      หรือกด "ยกเลิกการแจ้งย้ายออก" ที่มีอยู่แล้วเพื่อกลับเป็นมีผู้เช่า
--
-- ถ้าหลังคืนห้อง มีผู้เช่าห้องอื่น "ย้ายห้อง" เข้ามาอยู่แทน ฟังก์ชันจะย้อนการย้ายห้องนั้นก่อน
-- (ผู้เช่ากลับห้องเดิม เงินประกันกลับเป็นยอดก่อนเติม มิเตอร์สองห้องกลับเป็นค่าก่อนย้าย
--  ประวัติการย้ายทำเครื่องหมาย reverted_at — ยอดค่าน้ำ-ไฟห้องเดิมจึงไม่ไปโผล่ในบิลห้องใหม่)
-- หน้าจอต้องให้ผู้ดูแลยืนยันการย้ายกลับอีกรอบ: p_expected_transfer_id ต้องตรงกับที่ตรวจเจอ
--
-- ไม่ยอมทำ (คืนข้อความบอกเหตุผล ไม่ throw):
--   - มีบิลของห้องที่เกี่ยวข้องออกหลังเหตุการณ์ (ค่าน้ำ-ไฟจะถูกเก็บซ้ำหรือหาย)
--   - ผู้เช่าใหม่ทำสัญญาเข้าห้องนั้น (ไม่ใช่การย้ายห้อง) / ห้องเดิมของผู้ย้ายมีคนเข้าไปแล้ว
--   - ประวัติที่ไม่มีเลขมิเตอร์ปิดห้อง (บันทึกก่อนมีคอลัมน์ closing_*) — ย้อนมิเตอร์ไม่ได้
--
-- สิทธิ์: เรียกได้เฉพาะ service_role (จาก Server Action หลังยืนยันรหัสผ่านแอดมินแล้ว)
--   ห้ามเปิดให้ authenticated เรียกตรง ไม่งั้นข้ามขั้นยืนยันรหัสผ่านได้
--   ฟังก์ชันยังตรวจซ้ำเองว่า p_actor เป็น admin ของหอนั้นจริง
--
-- ⚠️ ต้องรันไฟล์นี้ใน Supabase "ก่อน" deploy โค้ดชุดนี้ — โค้ดใหม่กรอง reverted_at
--    ถ้าคอลัมน์ยังไม่มี หน้า /rooms, บิล และ portal จะอ่านข้อมูลไม่ได้
--
-- ปลอดภัยที่จะรันซ้ำได้ (IF NOT EXISTS / CREATE OR REPLACE)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new


-- ═══════════════════════════════════════════════════════════════════════
-- 1. คอลัมน์ "ยกเลิกแล้ว"
-- ═══════════════════════════════════════════════════════════════════════

alter table public.cancelled_contracts
  add column if not exists reverted_at timestamptz,
  add column if not exists reverted_by uuid references public.profiles(id) on delete set null;

comment on column public.cancelled_contracts.reverted_at is
  'เวลาที่ผู้ดูแลกดยกเลิกการคืนห้องนี้ (null = ยังมีผล) — แถวที่ยกเลิกแล้วไม่นับใน ภ.ง.ด. และไม่แสดงในประวัติ';

alter table public.tenant_room_transfers
  add column if not exists reverted_at timestamptz,
  add column if not exists reverted_by uuid references public.profiles(id) on delete set null;

comment on column public.tenant_room_transfers.reverted_at is
  'เวลาที่การย้ายห้องนี้ถูกย้อนกลับ (null = ยังมีผล) — แถวที่ย้อนแล้วต้องไม่ถูกยกเป็นรายการย่อยในบิล';

alter table public.tenants_old
  add column if not exists reverted_at timestamptz;

comment on column public.tenants_old.reverted_at is
  'เวลาที่ผู้เช่ารายนี้ถูกคืนกลับเข้าห้อง (ยกเลิกการคืนห้อง) — ไม่นับเป็นผู้เช่าเก่าอีก';


-- ═══════════════════════════════════════════════════════════════════════
-- 2. คืนแถวมิเตอร์หนึ่งแถวเป็นค่าก่อนเหตุการณ์
-- ═══════════════════════════════════════════════════════════════════════
--
-- หา log แรกของแถวนี้ที่เกิด "ตั้งแต่" เหตุการณ์ (คืนห้อง/ย้ายห้อง) แล้วเอาค่า before กลับ
-- log แรกหลังเหตุการณ์คือการเขียนของเหตุการณ์นั้นเอง (ย้ายออก/ย้ายห้องเขียนมิเตอร์เป็นขั้นท้าย)
--
-- elec_curr/water_curr: คืนค่าเดิมเฉพาะเมื่อตอนนี้ยังว่าง — ถ้าสตาฟจดเลขไว้หลังจากนั้น
-- เลขนั้นคือเลขจริงที่อ่านจากมิเตอร์ ใช้ได้ไม่ว่าใครอยู่ห้อง จึงเก็บไว้
--
-- คืนค่า: 'restored' | 'insert' (แถวถูกสร้างโดยเหตุการณ์ — ปล่อยไว้ หน้าออกบิลใช้ curr ของรอบก่อน
--         เป็น prev อยู่แล้ว) | 'no_audit' (ยังไม่ได้ติด audit trigger) | 'no_row'

create or replace function public.revert_meter_row_since(
  p_workspace_id uuid,
  p_room_id uuid,
  p_billing_cycle text,
  p_since timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  _row_id uuid;
  _action text;
  _b jsonb;
begin
  select id into _row_id
  from public.meter_records
  where workspace_id = p_workspace_id
    and room_id = p_room_id
    and billing_cycle = p_billing_cycle
  for update;

  if _row_id is null then
    return 'no_row';
  end if;

  select action, coalesce(before, '{}'::jsonb) into _action, _b
  from public.audit_logs
  where table_name = 'meter_records'
    and record_id = _row_id
    and created_at >= p_since
  order by created_at, id
  limit 1;

  if _action is null then
    return 'no_audit';
  end if;
  if _action <> 'UPDATE' then
    return lower(_action);
  end if;

  update public.meter_records set
    elec_prev  = case when _b ? 'elec_prev'  then (_b ->> 'elec_prev')::numeric  else elec_prev end,
    water_prev = case when _b ? 'water_prev' then (_b ->> 'water_prev')::numeric else water_prev end,
    elec_curr  = case when elec_curr is null and _b ? 'elec_curr'
                      then (_b ->> 'elec_curr')::numeric else elec_curr end,
    water_curr = case when water_curr is null and _b ? 'water_curr'
                      then (_b ->> 'water_curr')::numeric else water_curr end,
    occupancy_start_elec   = case when _b ? 'occupancy_start_elec'
                                  then (_b ->> 'occupancy_start_elec')::numeric else occupancy_start_elec end,
    occupancy_start_water  = case when _b ? 'occupancy_start_water'
                                  then (_b ->> 'occupancy_start_water')::numeric else occupancy_start_water end,
    occupancy_start_reason = case when _b ? 'occupancy_start_reason'
                                  then _b ->> 'occupancy_start_reason' else occupancy_start_reason end,
    occupancy_start_date   = case when _b ? 'occupancy_start_date'
                                  then (_b ->> 'occupancy_start_date')::date else occupancy_start_date end
  where id = _row_id;

  return 'restored';
end;
$fn$;

revoke execute on function public.revert_meter_row_since(uuid, uuid, text, timestamptz) from public;
revoke execute on function public.revert_meter_row_since(uuid, uuid, text, timestamptz) from anon;
revoke execute on function public.revert_meter_row_since(uuid, uuid, text, timestamptz) from authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 3. ยกเลิกการคืนห้อง (+ ย้อนการย้ายห้องที่เข้ามาทับ ถ้ามี)
-- ═══════════════════════════════════════════════════════════════════════
--
-- p_dry_run = true  → ตรวจอย่างเดียว คืนสิ่งที่จะเกิดขึ้นให้หน้าจอแสดงก่อนยืนยัน
-- p_dry_run = false → ทำจริง (p_expected_transfer_id ต้องตรงกับผลตรวจ — null ถ้าไม่มีการย้ายห้อง)
--
-- คืนค่า jsonb: { ok, error?, room_number, tenant_name, transfer: {...} | null }

create or replace function public.revert_checkout(
  p_contract_id uuid,
  p_actor uuid,
  p_dry_run boolean,
  p_expected_transfer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  _c        public.cancelled_contracts%rowtype;
  _old      public.tenants_old%rowtype;
  _room     public.rooms%rowtype;
  _occ      public.tenants%rowtype;
  _tr       public.tenant_room_transfers%rowtype;
  _actor_role text;
  _actor_ws   uuid;
  _ws       uuid;
  _co_cycle text;
  _n        int;
  _other    text;
  _bills    text;
  _res      text;
  _before   jsonb;
  _tj       jsonb;
  _transfer jsonb := null;
begin
  -- ── ตรวจประวัติ ──
  select * into _c from public.cancelled_contracts where id = p_contract_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ไม่พบประวัติการยกเลิกสัญญานี้');
  end if;
  _ws := _c.workspace_id;

  -- ── ตรวจสิทธิ์: ต้องเป็น admin ของหอนี้เท่านั้น ──
  select role, workspace_id into _actor_role, _actor_ws from public.profiles where id = p_actor;
  if _actor_role is distinct from 'admin' or _actor_ws is distinct from _ws then
    return jsonb_build_object('ok', false, 'error', 'เฉพาะผู้ดูแล (Admin) ของหอนี้เท่านั้นที่ยกเลิกการคืนห้องได้');
  end if;

  if _c.reverted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'รายการนี้ถูกยกเลิกการคืนห้องไปแล้ว');
  end if;
  if _c.tenant_id is null then
    return jsonb_build_object('ok', false, 'error',
      'ประวัตินี้ไม่ได้ผูกกับผู้เช่าในระบบ (บันทึกย้อนหลัง) จึงย้อนกลับไม่ได้');
  end if;
  if _c.closing_elec_prev is null or _c.closing_elec_curr is null
     or _c.closing_water_prev is null or _c.closing_water_curr is null then
    return jsonb_build_object('ok', false, 'error',
      'ประวัตินี้ไม่มีเลขมิเตอร์ตอนปิดห้อง (บันทึกก่อนระบบเก็บเลขมิเตอร์) จึงย้อนมิเตอร์ให้ถูกต้องไม่ได้');
  end if;
  if exists (select 1 from public.tenants where id = _c.tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'ผู้เช่ารายนี้ยังอยู่ในระบบ ไม่ต้องยกเลิกการคืนห้อง');
  end if;

  select * into _old
  from public.tenants_old
  where workspace_id = _ws and tenant_id = _c.tenant_id and reverted_at is null
  order by moved_out_at desc
  limit 1;
  if not found or _old.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'ไม่พบข้อมูลสำรองของผู้เช่ารายนี้ (tenants_old) จึงคืนผู้เช่ากลับไม่ได้');
  end if;

  select * into _room from public.rooms where id = _old.room_id and workspace_id = _ws for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ห้องเดิมของผู้เช่ารายนี้ถูกลบออกจากระบบไปแล้ว');
  end if;

  _co_cycle := substring(_c.cancellation_date from 1 for 7);

  -- ── ใครอยู่ในห้องนี้ตอนนี้ ──
  select count(*) into _n from public.tenants where room_id = _room.id;
  if _n > 1 then
    return jsonb_build_object('ok', false, 'error',
      format('ห้อง %s มีผู้เช่ามากกว่าหนึ่งรายในระบบ กรุณาตรวจสอบข้อมูลก่อน', _room.room_number));
  end if;

  if _n = 1 then
    select * into _occ from public.tenants where room_id = _room.id for update;

    select * into _tr
    from public.tenant_room_transfers
    where workspace_id = _ws
      and tenant_id = _occ.id
      and to_room_id = _room.id
      and reverted_at is null
      and created_at > _c.created_at
    order by created_at desc
    limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'error',
        format('ห้อง %s มีผู้เช่าใหม่ (%s) ทำสัญญาเข้ามาแล้ว — ต้องจัดการผู้เช่ารายนั้นก่อนจึงยกเลิกการคืนห้องได้',
               _room.room_number, _occ.tenant_name));
    end if;

    if exists (
      select 1 from public.tenant_room_transfers
      where workspace_id = _ws and tenant_id = _occ.id and reverted_at is null
        and created_at > _tr.created_at
    ) then
      return jsonb_build_object('ok', false, 'error',
        format('%s ย้ายห้องต่อหลายทอด ระบบย้อนให้อัตโนมัติไม่ได้ กรุณาจัดการด้วยมือ', _occ.tenant_name));
    end if;

    if _tr.from_room_id is null then
      return jsonb_build_object('ok', false, 'error',
        format('ห้องเดิมของ %s (ห้อง %s) ถูกลบออกจากระบบไปแล้ว จึงย้ายกลับไม่ได้', _occ.tenant_name, _tr.from_room_number));
    end if;

    perform 1 from public.rooms where id = _tr.from_room_id for update;

    select tenant_name into _other
    from public.tenants where room_id = _tr.from_room_id limit 1;
    if found then
      return jsonb_build_object('ok', false, 'error',
        format('ห้อง %s (ห้องเดิมของ %s) มีผู้เช่ารายอื่น (%s) เข้าไปอยู่แล้ว จึงย้ายกลับไม่ได้',
               _tr.from_room_number, _tr.tenant_name, _other));
    end if;

    -- บิลของห้องที่ผู้ย้ายออกมา ที่ออกหลังการย้าย
    select string_agg(coalesce(invoice_id, billing_cycle), ', ') into _bills
    from public.bills
    where workspace_id = _ws and room_id = _tr.from_room_id and created_at > _tr.created_at;
    if _bills is not null then
      return jsonb_build_object('ok', false, 'error',
        format('ห้อง %s มีบิลที่ออกหลังการย้ายห้องแล้ว (%s) — กรุณาลบบิลนั้นก่อน ไม่งั้นค่าน้ำ-ไฟจะถูกเก็บซ้ำ',
               _tr.from_room_number, _bills));
    end if;

    _transfer := jsonb_build_object(
      'id', _tr.id,
      'tenant_name', _tr.tenant_name,
      'from_room_number', _tr.from_room_number,
      'to_room_number', _tr.to_room_number,
      'transfer_date', _tr.transfer_date,
      'deposit_topup_amount', coalesce(_tr.deposit_topup_amount, 0)
    );
  end if;

  -- บิลของห้องที่คืน ที่ออกหลังการคืนห้อง (รวมบิลของผู้ที่ย้ายเข้ามา)
  select string_agg(coalesce(invoice_id, billing_cycle), ', ') into _bills
  from public.bills
  where workspace_id = _ws and room_id = _room.id and created_at > _c.created_at;
  if _bills is not null then
    return jsonb_build_object('ok', false, 'error',
      format('ห้อง %s มีบิลที่ออกหลังการคืนห้องแล้ว (%s) — กรุณาลบบิลนั้นก่อน ไม่งั้นค่าน้ำ-ไฟจะถูกเก็บซ้ำ',
             _room.room_number, _bills));
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'ok', true,
      'room_number', _room.room_number,
      'tenant_name', _old.tenant_name,
      'transfer', _transfer
    );
  end if;

  -- กันหน้าจอเก่า: ผู้ดูแลต้องยืนยันการย้ายกลับของรายการเดียวกับที่ระบบเจอตอนนี้
  if (_transfer ->> 'id')::uuid is distinct from p_expected_transfer_id then
    return jsonb_build_object('ok', false, 'error',
      'ข้อมูลห้องเปลี่ยนไประหว่างยืนยัน กรุณาปิดหน้าต่างแล้วกดยกเลิกการคืนห้องใหม่อีกครั้ง');
  end if;

  -- ═════ ทำจริง — ย้อนตามลำดับเวลากลับหลัง: การย้ายห้อง (ใหม่กว่า) ก่อน แล้วค่อยการคืนห้อง ═════

  if _transfer is not null then
    -- มิเตอร์ห้องปลายทาง (ห้องที่คืน) รอบที่ย้ายเข้า
    _res := public.revert_meter_row_since(_ws, _room.id, _tr.billing_cycle, _tr.created_at);
    if _res = 'no_audit' then
      update public.meter_records
      set occupancy_start_elec = null, occupancy_start_water = null,
          occupancy_start_reason = null, occupancy_start_date = null
      where workspace_id = _ws and room_id = _room.id and billing_cycle = _tr.billing_cycle
        and occupancy_start_reason = 'transfer_in';
    end if;

    -- มิเตอร์ห้องเดิมของผู้ย้าย รอบที่ย้าย + รอบถัดไป
    _res := public.revert_meter_row_since(_ws, _tr.from_room_id, _tr.billing_cycle, _tr.created_at);
    if _res = 'no_audit' then
      update public.meter_records
      set elec_prev = coalesce(_tr.closing_elec_prev, elec_prev),
          water_prev = coalesce(_tr.closing_water_prev, water_prev),
          occupancy_start_elec = null, occupancy_start_water = null,
          occupancy_start_reason = null, occupancy_start_date = null
      where workspace_id = _ws and room_id = _tr.from_room_id and billing_cycle = _tr.billing_cycle
        and occupancy_start_reason = 'transfer_out';
    end if;
    perform public.revert_meter_row_since(
      _ws, _tr.from_room_id,
      to_char((_tr.billing_cycle || '-01')::date + interval '1 month', 'YYYY-MM'),
      _tr.created_at
    );

    -- ผู้เช่ากลับห้องเดิม เงินประกันกลับเป็นยอดก่อนเติม
    update public.tenants
    set room_id = _tr.from_room_id,
        deposit_paid = case when deposit_paid is null then null
                            else deposit_paid - coalesce(_tr.deposit_topup_amount, 0) end,
        updated_at = now()
    where id = _occ.id;

    update public.rooms set status = 'occupied' where id = _tr.from_room_id;

    update public.tenant_room_transfers
    set reverted_at = now(), reverted_by = p_actor
    where id = _tr.id;
  end if;

  -- มิเตอร์ห้องที่คืน รอบที่ย้ายออก + รอบถัดไป
  _res := public.revert_meter_row_since(_ws, _room.id, _co_cycle, _c.created_at);
  if _res = 'no_audit' then
    update public.meter_records
    set elec_prev = _c.closing_elec_prev,
        water_prev = _c.closing_water_prev,
        occupancy_start_elec = null, occupancy_start_water = null,
        occupancy_start_reason = null, occupancy_start_date = null
    where workspace_id = _ws and room_id = _room.id and billing_cycle = _co_cycle
      and occupancy_start_reason = 'checkout';
  end if;
  perform public.revert_meter_row_since(
    _ws, _room.id,
    to_char((_co_cycle || '-01')::date + interval '1 month', 'YYYY-MM'),
    _c.created_at
  );

  -- คืนแถวผู้เช่าด้วย id เดิม (LINE / ลิงก์ portal / ประวัติที่อ้าง id นี้กลับมาใช้ได้)
  -- ค่าส่วนใหญ่มาจาก log ตอนลบ (ครบทุกคอลัมน์ เช่น deposit_paid) แต่ log ซ่อนเบอร์โทรกับ LINE
  -- จึงทับสองฟิลด์นั้น + ข้อมูลสัญญาด้วยสำเนาใน tenants_old
  select before into _before
  from public.audit_logs
  where table_name = 'tenants' and record_id = _c.tenant_id and action = 'DELETE'
  order by created_at desc
  limit 1;

  _tj := coalesce(_before, '{}'::jsonb) || jsonb_build_object(
    'id', _c.tenant_id,
    'workspace_id', _ws,
    'room_id', _room.id,
    'tenant_name', _old.tenant_name,
    'tenant_phone', _old.tenant_phone,
    'line_user_id', _old.line_user_id,
    'lease_start', _old.lease_start,
    'lease_end', _old.lease_end,
    'created_at', now(),
    'updated_at', now()
  );
  if not (_tj ? 'deposit_paid') or _tj -> 'deposit_paid' = 'null'::jsonb then
    _tj := _tj || jsonb_build_object('deposit_paid', _c.deposit_amount);
  end if;

  insert into public.tenants
  select * from jsonb_populate_record(null::public.tenants, _tj);

  update public.tenants_old set reverted_at = now() where id = _old.id;

  update public.rooms set status = 'Pending_Refund' where id = _room.id;

  update public.cancelled_contracts
  set reverted_at = now(), reverted_by = p_actor
  where id = _c.id;

  return jsonb_build_object(
    'ok', true,
    'room_number', _room.room_number,
    'tenant_name', _old.tenant_name,
    'transfer', _transfer
  );
end;
$fn$;

revoke execute on function public.revert_checkout(uuid, uuid, boolean, uuid) from public;
revoke execute on function public.revert_checkout(uuid, uuid, boolean, uuid) from anon;
revoke execute on function public.revert_checkout(uuid, uuid, boolean, uuid) from authenticated;
grant execute on function public.revert_checkout(uuid, uuid, boolean, uuid) to service_role;
