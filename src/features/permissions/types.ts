// Types and constants for permissions management.
// This file does NOT have "use server" so it can safely export objects and types.

export interface StaffPermissions {
  view_dashboard_stats: boolean       // ดูแดชบอร์ดภาพรวมสถิติ (/dashboard)
  manage_rooms_tenants: boolean       // จัดการห้องพักและผู้เช่า (/rooms, /tenants)
  manage_meters_bills: boolean        // จดมิเตอร์ & จัดการบิล (/billing, /meter)
  manage_bills: boolean               // จัดการบิล (/manage-bills)
  manage_finance_expenses: boolean    // จัดการบิลรายจ่ายรายวัน (/daily-bills)
  access_tax: boolean                 // จัดการภาษี ภ.ง.ด. (/tax)
  manage_finance_settings: boolean    // ตั้งค่าการเงิน (/finance-settings)
  manage_property_settings: boolean   // ตั้งค่าหอพัก (/property-settings)
  manage_staff_permissions: boolean   // จัดการสิทธิ์ & Staff (/permissions)
  billing_send_line: boolean          // ส่ง Line OA
  billing_download_pdf: boolean       // ดาวน์โหลด PDF
  billing_copy_summary: boolean       // คัดลอกสรุปบิล
}

export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = {
  view_dashboard_stats: false,
  manage_rooms_tenants: true,
  manage_meters_bills: true,
  manage_bills: true,
  manage_finance_expenses: false,
  access_tax: false,
  manage_finance_settings: false,
  manage_property_settings: false,
  manage_staff_permissions: false,
  billing_send_line: true,
  billing_download_pdf: true,
  billing_copy_summary: true
}

export const ADMIN_DEFAULT_PERMISSIONS: StaffPermissions = {
  view_dashboard_stats: true,
  manage_rooms_tenants: true,
  manage_meters_bills: true,
  manage_bills: true,
  manage_finance_expenses: true,
  access_tax: true,
  manage_finance_settings: true,
  manage_property_settings: true,
  manage_staff_permissions: true,
  billing_send_line: true,
  billing_download_pdf: true,
  billing_copy_summary: true
}
