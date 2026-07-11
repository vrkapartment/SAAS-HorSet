-- Patch: เปลี่ยนสิทธิ์ระหว่างทดลองใช้ฟรี (trial) จากเดิมที่ให้สิทธิ์ระดับ Pro เป็นสิทธิ์ระดับ Starter แทน
-- (แก้ต้นทางใน database_patch_saas_subscription.sql ไว้แล้วสำหรับ workspace ใหม่ในอนาคต
--  ไฟล์นี้ใช้แก้ workspace ที่ตอนนี้ยัง trial อยู่ ให้เปลี่ยนไปใช้สิทธิ์ Starter ทันที)

-- 1. อัปเดตฟังก์ชันที่สร้าง subscription ให้ workspace ใหม่ ให้ผูกกับแผน Starter แทน Pro
create or replace function public.handle_new_workspace_subscription()
returns trigger as $$
begin
  insert into public.workspace_subscriptions (workspace_id, plan_id, status, trial_ends_at)
  values (
    new.id,
    (select id from public.saas_plans where code = 'starter'),
    'trial',
    now() + interval '30 days'
  )
  on conflict (workspace_id) do nothing;

  insert into public.buildings (workspace_id, name)
  values (new.id, 'อาคารหลัก')
  on conflict do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- 2. เปลี่ยน workspace ที่ตอนนี้ยังอยู่ในสถานะ trial ให้ผูกกับแผน Starter แทน Pro
-- (ไม่กระทบ workspace ที่จ่ายเงินแล้ว/อยู่ในสถานะอื่น เช่น active, past_due, read_only, cancelled)
update public.workspace_subscriptions
set plan_id = (select id from public.saas_plans where code = 'starter')
where status = 'trial';
