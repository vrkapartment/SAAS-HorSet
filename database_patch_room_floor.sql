-- =========================================================================
-- DATABASE PATCH: ADD ROOM FLOOR Persistent Support
-- =========================================================================
-- Description: เพิ่มคอลัมน์ floor ในตาราง public.rooms และอัปเดตข้อมูลชั้นเบื้องต้นสำหรับห้องที่เคยถูกสร้างแล้ว
-- =========================================================================

-- 1. เพิ่มคอลัมน์ floor ในตาราง rooms (ถ้ายังไม่มี)
alter table public.rooms add column if not exists floor text;

-- 2. สร้าง Index สำหรับการค้นหาและจัดเรียงข้อมูลแยกตามชั้นให้เร็วขึ้น (Performance Optimization)
create index if not exists idx_rooms_floor on public.rooms (floor);

-- 3. อัปเดตข้อมูลชั้นเริ่มต้น (Floor Migration) สำหรับห้องพักที่เคยถูกสร้างไว้แล้ว
-- ดึงตัวเลขจากหมายเลขห้องพัก (เช่น '101' -> '1', '1205' -> '12', 'A-302' -> '3')
update public.rooms
set floor = 
  case 
    -- ถ้าล้างตัวอักษรแล้วมีตัวเลข 3 ตัว เช่น 101, B204 -> ใช้ตัวแรกหลักร้อย
    when length(regexp_replace(room_number, '\D', '', 'g')) = 3 then substring(regexp_replace(room_number, '\D', '', 'g') from 1 for 1)
    -- ถ้าล้างตัวอักษรแล้วมีตัวเลข 4 ตัว เช่น 1102, C1205 -> ใช้ 2 ตัวแรกหลักพันและร้อย
    when length(regexp_replace(room_number, '\D', '', 'g')) = 4 then substring(regexp_replace(room_number, '\D', '', 'g') from 1 for 2)
    -- ถ้าเป็นแบบอื่น ให้ดึงตัวแรกสุดของหมายเลขห้องพัก
    else coalesce(substring(room_number from 1 for 1), '1')
  end
where floor is null;
