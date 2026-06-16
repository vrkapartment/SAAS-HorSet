-- =========================================================================
-- 1. ADD MISSING 'base_rent' COLUMN TO ROOMS TABLE
-- =========================================================================
alter table public.rooms add column if not exists base_rent numeric not null default 0;

-- =========================================================================
-- 2. CREATE / UPDATE SECURITY DEFINER HELPERS
-- =========================================================================
create or replace function public.get_current_user_workspace_id()
returns uuid as $$
  select workspace_id from public.profiles where id = auth.uid();
$$ language sql security definer;

create or replace function public.get_current_user_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer;

create or replace function public.get_current_user_phone()
returns text as $$
  select phone from public.profiles where id = auth.uid();
$$ language sql security definer;

-- =========================================================================
-- 3. OPTIMIZE BEFORE INSERT WORKSPACE POPULATING TRIGGER
-- =========================================================================
create or replace function public.populate_workspace_id()
returns trigger as $$
begin
  if new.workspace_id is null then
    -- Find the creator's workspace_id using fast security definer helper
    new.workspace_id := public.get_current_user_workspace_id();
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- =========================================================================
-- 4. RECREATE OPTIMIZED POLICIES FOR WORKSPACES & SUPPORT GRANTS
-- =========================================================================
drop policy if exists "Super Admins can manage all workspaces" on public.workspaces;
drop policy if exists "Users can view their own workspace" on public.workspaces;
drop policy if exists "Workspace admins can update their own workspace" on public.workspaces;

create policy "Super Admins can manage all workspaces" 
on public.workspaces for all 
using (
  public.get_current_user_role() = 'super_admin'
);

create policy "Users can view their own workspace" 
on public.workspaces for select 
using (
  id = public.get_current_user_workspace_id()
);

create policy "Workspace admins can update their own workspace"
on public.workspaces for update
using (
  id = public.get_current_user_workspace_id()
  and public.get_current_user_role() in ('admin', 'super_admin')
);

drop policy if exists "Super Admins can manage all support grants" on public.support_access_grants;
drop policy if exists "Workspace admins can manage support grants for their workspace" on public.support_access_grants;

create policy "Super Admins can manage all support grants" 
on public.support_access_grants for all 
using (
  public.get_current_user_role() = 'super_admin'
);

create policy "Workspace admins can manage support grants for their workspace" 
on public.support_access_grants for all 
using (
  workspace_id = public.get_current_user_workspace_id()
  and public.get_current_user_role() = 'admin'
);

-- =========================================================================
-- 5. RECREATE OPTIMIZED POLICIES FOR ROOM TYPES & ROOMS
-- =========================================================================
drop policy if exists "Read room_types in workspace or support approved" on public.room_types;
drop policy if exists "Manage room_types in workspace or support approved" on public.room_types;

create policy "Read room_types in workspace or support approved" 
on public.room_types for select 
using (
  workspace_id = public.get_current_user_workspace_id()
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = room_types.workspace_id and status = 'approved')
  )
);

create policy "Manage room_types in workspace or support approved" 
on public.room_types for all 
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() = 'admin')
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = room_types.workspace_id and status = 'approved')
  )
);

drop policy if exists "Read rooms in workspace or support approved" on public.rooms;
drop policy if exists "Manage rooms in workspace or support approved" on public.rooms;

create policy "Read rooms in workspace or support approved" 
on public.rooms for select 
using (
  workspace_id = public.get_current_user_workspace_id()
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = rooms.workspace_id and status = 'approved')
  )
  or (
    exists (
      select 1 from public.tenants 
      where tenants.room_id = rooms.id 
        and tenants.tenant_phone = public.get_current_user_phone()
    )
  )
);

create policy "Manage rooms in workspace or support approved" 
on public.rooms for all 
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() in ('admin', 'staff'))
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = rooms.workspace_id and status = 'approved')
  )
);

-- =========================================================================
-- 6. RECREATE OPTIMIZED POLICIES FOR TENANTS & METER RECORDS
-- =========================================================================
drop policy if exists "Read tenants in workspace or support approved" on public.tenants;
drop policy if exists "Manage tenants in workspace or support approved" on public.tenants;

create policy "Read tenants in workspace or support approved" 
on public.tenants for select 
using (
  workspace_id = public.get_current_user_workspace_id()
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = tenants.workspace_id and status = 'approved')
  )
  or (
    tenant_phone = public.get_current_user_phone()
  )
);

create policy "Manage tenants in workspace or support approved" 
on public.tenants for all 
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() in ('admin', 'staff'))
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = tenants.workspace_id and status = 'approved')
  )
);

drop policy if exists "Read meter_records in workspace or support approved" on public.meter_records;
drop policy if exists "Manage meter_records in workspace or support approved" on public.meter_records;

create policy "Read meter_records in workspace or support approved" 
on public.meter_records for select 
using (
  workspace_id = public.get_current_user_workspace_id()
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = meter_records.workspace_id and status = 'approved')
  )
  or (
    room_number = (
      select r.room_number 
      from public.rooms r 
      join public.tenants t on t.room_id = r.id
      where t.tenant_phone = public.get_current_user_phone()
      limit 1
    )
  )
);

create policy "Manage meter_records in workspace or support approved" 
on public.meter_records for all 
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() in ('admin', 'staff'))
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = meter_records.workspace_id and status = 'approved')
  )
);

-- =========================================================================
-- 7. RECREATE OPTIMIZED POLICIES FOR BILLS & EXPENSES
-- =========================================================================
drop policy if exists "Read bills in workspace or support approved" on public.bills;
drop policy if exists "Manage bills in workspace or support approved" on public.bills;

create policy "Read bills in workspace or support approved" 
on public.bills for select 
using (
  workspace_id = public.get_current_user_workspace_id()
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = bills.workspace_id and status = 'approved')
  )
  or (
    room_number = (
      select r.room_number 
      from public.rooms r 
      join public.tenants t on t.room_id = r.id
      where t.tenant_phone = public.get_current_user_phone()
      limit 1
    )
  )
);

create policy "Manage bills in workspace or support approved" 
on public.bills for all 
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() in ('admin', 'staff'))
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = bills.workspace_id and status = 'approved')
  )
);

drop policy if exists "Read expenses in workspace or support approved" on public.expenses;
drop policy if exists "Manage expenses in workspace or support approved" on public.expenses;

create policy "Read expenses in workspace or support approved" 
on public.expenses for select 
using (
  workspace_id = public.get_current_user_workspace_id()
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = expenses.workspace_id and status = 'approved')
  )
);

create policy "Manage expenses in workspace or support approved" 
on public.expenses for all 
using (
  (workspace_id = public.get_current_user_workspace_id() and public.get_current_user_role() = 'admin')
  or (
    public.get_current_user_role() = 'super_admin'
    and exists (select 1 from public.support_access_grants where workspace_id = expenses.workspace_id and status = 'approved')
  )
);
