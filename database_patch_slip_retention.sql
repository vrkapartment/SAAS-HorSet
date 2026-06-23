-- SQL Patch to add slip_retention_months column to workspaces table
-- Run this in your Supabase SQL Editor to enable slip retention configuration.

-- 1. เพิ่มคอลัมน์ slip_retention_months โดยให้มีค่าเริ่มต้นเป็น 1 (ลบไฟล์สลิปหมดอายุเมื่อครบ 1 เดือน)
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS slip_retention_months integer DEFAULT 1;

-- 2. ปรับเปลี่ยนค่าเริ่มต้นสำหรับ Workspace ที่จะสร้างขึ้นใหม่ในอนาคตให้เป็น 1 เดือน (สำหรับฐานข้อมูลเดิมที่เคยรันไปแล้ว)
ALTER TABLE public.workspaces ALTER COLUMN slip_retention_months SET DEFAULT 1;

-- Comment: การตั้งค่าเริ่มต้นเป็น 1 เดือนจะช่วยเซฟพื้นที่จัดเก็บข้อมูล (Storage) ของบัญชีฟรี Supabase ทันทีเมื่อผู้ใช้สมัครเปิดหอพักใหม่ ป้องกันการลืมเปิดระบบทำความสะอาดไฟล์
