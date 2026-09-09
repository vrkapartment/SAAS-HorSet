-- Patch: audit_fix_ignored_columns (แก้ความผิดพลาดของไฟล์ 2.6)
-- วันที่: 2026-09-09
--
-- ═══════════════════════════════════════════════════════════════════════
-- แก้รายการคอลัมน์ที่ไม่ต้องจด ให้ตรงกับตารางที่คอลัมน์นั้นอยู่จริง
-- ═══════════════════════════════════════════════════════════════════════
--
-- ── ความผิดพลาดที่แก้ ──
-- ไฟล์ database_patch_audit_ignore_machine_state.sql ใส่คอลัมน์ richmenu_*
-- ไว้ใต้ตาราง 'workspaces' โดยเข้าใจผิด
--
-- ความจริง: คอลัมน์ richmenu_* ทั้งหมดอยู่บนตาราง workspace_line_settings
-- (ดู database_patch_add_line_admin_richmenu.sql — alter table
--  public.workspace_line_settings) และตารางนั้น "ไม่ได้ติด trigger audit"
--
-- ผลของความผิดพลาด: รายการเหล่านั้นไม่เคยตรงกับอะไรเลย (inert)
-- ไม่ได้ทำให้ระบบเสียหาย แต่ทำให้เข้าใจผิดว่าเคยมีช่องรั่ว LINE user id
-- ซึ่งไม่จริง — คอลัมน์นั้นไม่มีทางเข้ามาอยู่ใน audit_logs ตั้งแต่ต้น
--
-- ── สิ่งที่ไฟล์นี้ทำ ──
--   1. คืนรายการของ 'workspaces' ให้เหลือเฉพาะที่ถูกต้อง
--   2. ย้ายรายการ richmenu_* ไปไว้ใต้ 'workspace_line_settings' เผื่ออนาคต
--      ถ้าตัดสินใจติด trigger ให้ตารางนั้น จะได้ไม่ต้องมาไล่หาใหม่
--   3. คงรายการของ 'tenants' ไว้เหมือนเดิม (สวิตช์รับสลิป — ตรวจแล้วถูกต้อง
--      คอลัมน์ slip_armed_at / slip_target_bill_id อยู่บน tenants จริง
--      และเป็นต้นเหตุที่ทำให้สลิป 1 ใบเกิด log 7 แถว)
--
-- ไม่กระทบข้อมูลที่จดไว้แล้ว · ไม่แตะ trigger · รันซ้ำได้
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปรันใน Supabase SQL Editor
-- https://supabase.com/dashboard/project/qumimpfrebffooagpqgt/sql/new
-- ═══════════════════════════════════════════════════════════════════════


create or replace function public.audit_ignored_columns(_table text)
returns text[]
language sql
immutable
as $ignored$
  select case _table

    -- สวิตช์รับสลิปทาง LINE — ระบบเปิด/ปิดเองทุกครั้งที่ผู้เช่ากดปุ่ม
    -- เขียน 3 ครั้งต่อสลิป 1 ใบ (เปิดโหมด > เลือกบิล > ปิดโหมด) คูณจำนวนห้องที่เช่า
    -- (ดู armAllRooms / setTargetBill / disarm ใน src/features/notification/line-slip.ts)
    when 'tenants' then array[
      'updated_at', 'created_at',
      'slip_armed_at', 'slip_target_bill_id'
    ]

    -- ⚠️ ตารางนี้ยังไม่ได้ติด trigger audit — รายการข้างล่างจึงยังไม่มีผลอะไร
    --
    -- เตรียมไว้เผื่อวันหนึ่งตัดสินใจ audit ตารางนี้ (มีเหตุผลให้ทำ เพราะเก็บ
    -- channel_access_token ซึ่งถ้าถูกสลับจะเปลี่ยนปลายทางการแจ้งเตือนทั้งหมด)
    --
    -- richmenu_admin_linked_uids เก็บ LINE user id ของแอดมิน เป็นข้อมูลส่วนบุคคล
    -- และชื่อคอลัมน์ไม่ตรงกับ line_user_id จึงจะรอดกฎซ่อนความลับถ้าไม่กันไว้
    --
    -- ตั้งใจ "ไม่" ใส่: richmenu_enabled, richmenu_admin_enabled,
    -- richmenu_image_url, richmenu_admin_image_url, richmenu_contact_uri,
    -- richmenu_liff_id — ทั้งหมดนี้คนกดเปลี่ยนเอง ต้องจด
    when 'workspace_line_settings' then array[
      'updated_at', 'created_at',
      'richmenu_id', 'richmenu_installed_at', 'richmenu_template_version',
      'richmenu_admin_id', 'richmenu_admin_installed_at',
      'richmenu_admin_template_version', 'richmenu_admin_linked_uids',
      'richmenu_admin_installed_image_url'
    ]

    else array['updated_at', 'created_at']
  end;
$ignored$;

revoke execute on function public.audit_ignored_columns(text) from public;
revoke execute on function public.audit_ignored_columns(text) from anon;
revoke execute on function public.audit_ignored_columns(text) from authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- ตรวจผล
-- ═══════════════════════════════════════════════════════════════════════
--
-- ต้องได้ 'ok' ทั้ง 4 แถว

select 'สวิตช์รับสลิปของผู้เช่ายังถูกกันอยู่' as "รายการตรวจ",
       case when 'slip_armed_at' = any(public.audit_ignored_columns('tenants'))
             and 'slip_target_bill_id' = any(public.audit_ignored_columns('tenants'))
            then 'ok' else 'ผิด' end as "ผล"

union all

select 'workspaces กลับมาเป็นรายการที่ถูกต้อง (2 คอลัมน์)',
       case when array_length(public.audit_ignored_columns('workspaces'), 1) = 2
            then 'ok' else 'ผิด' end

union all

select 'ยังจดการตั้งค่าที่คนกดเปลี่ยนเอง (ต้องไม่ถูกกัน)',
       case when 'promptpay_id' = any(public.audit_ignored_columns('workspaces'))
              or 'logo_url' = any(public.audit_ignored_columns('workspaces'))
            then 'ผิด — กันมากเกินไป' else 'ok' end

union all

select 'audit_capture ยังเรียกใช้ฟังก์ชันนี้อยู่',
       case when pg_get_functiondef(p.oid) like '%audit_ignored_columns%'
            then 'ok' else 'ผิด' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'audit_capture';
