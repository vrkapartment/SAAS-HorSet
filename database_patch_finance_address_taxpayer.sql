-- SQL Patch: เพิ่มสถานภาพผู้เสียภาษี (สำหรับกำหนดค่าลดหย่อนส่วนตัวของแบบ ภ.ง.ด. 90/94 ให้ถูกต้อง)
-- หมายเหตุ: ที่อยู่ผู้เสียภาษีไม่ต้องเพิ่มคอลัมน์ใหม่ เพราะระบบมี parseAddress()/formatAddress()
-- (src/components/settings/FinanceSettingsTab.tsx) แยกที่อยู่เป็นช่องย่อยอยู่แล้ว เพียงแต่บันทึกรวมเป็น
-- ข้อความเดียวในคอลัมน์ tax_address เดิม — ฝั่งอ่านสามารถ parse กลับเป็นช่องย่อยได้โดยไม่ต้องเพิ่ม schema
-- Run this in your Supabase SQL Editor

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS taxpayer_status text CHECK (taxpayer_status IN ('individual', 'partnership')) DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS partner_count integer DEFAULT 1;