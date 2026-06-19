// Types and constants for permissions management.
// This file does NOT have "use server" so it can safely export objects and types.

export interface StaffPermissions {
  manage_rooms_tenants: boolean
  manage_meters_bills: boolean
  manage_finance_expenses: boolean
  access_tax: boolean
}

export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = {
  manage_rooms_tenants: true,
  manage_meters_bills: true,
  manage_finance_expenses: true,
  access_tax: false
}
