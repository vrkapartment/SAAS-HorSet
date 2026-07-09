// Types and constants for permissions management.
// This file does NOT have "use server" so it can safely export objects and types.

export interface StaffPermissions {
  view_dashboard_stats: boolean       // ดูแดชบอร์ดภาพรวมสถิติ (/dashboard)
  manage_rooms_tenants: boolean       // เข้าดูห้องพักและผู้เช่า (/rooms, /tenants)
  manage_rooms_tenants_edit: boolean  // เขียน/แก้ไขห้องพักและผู้เช่า
  manage_meters_bills: boolean        // เข้าดูหน้าจดมิเตอร์ & จัดการบิล (/billing, /meter)
  manage_meters_bills_edit: boolean   // เขียน/แก้ไขมิเตอร์ & บิล
  manage_bills: boolean               // เข้าดูหน้าจัดการใบแจ้งหนี้ (/manage-bills)
  manage_bills_edit: boolean          // เขียน/แก้ไขใบแจ้งหนี้
  manage_finance_expenses: boolean    // เข้าดูรายจ่ายรายวัน (/daily-bills)
  manage_finance_expenses_edit: boolean // เขียน/แก้ไขรายจ่ายรายวัน
  access_tax: boolean                 // เข้าดูหน้าภาษี ภ.ง.ด. (/tax)
  access_tax_edit: boolean            // เขียน/แก้ไขข้อมูลภาษี
  manage_finance_settings: boolean    // เข้าดูหน้าตั้งค่าการเงิน (/finance-settings)
  manage_finance_settings_edit: boolean // เขียน/แก้ไขการตั้งค่าการเงิน
  manage_property_settings: boolean   // เข้าดูหน้าตั้งค่าหอพัก (/property-settings)
  manage_property_settings_edit: boolean // เขียน/แก้ไขการตั้งค่าหอพัก
  manage_staff_permissions: boolean   // เข้าดูหน้าจัดการสิทธิ์ & Staff (/permissions)
  manage_staff_permissions_edit: boolean // เขียน/แก้ไขสิทธิ์พนักงาน
  billing_send_line: boolean          // ส่ง Line OA
  billing_download_pdf: boolean       // ดาวน์โหลด PDF
  billing_copy_summary: boolean       // คัดลอกสรุปบิล
  landing_page: string                // หน้าแรกที่พาไปหลัง login (เช่น "/billing", "/manage-bills")
}

export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = {
  view_dashboard_stats: false,
  manage_rooms_tenants: true,
  manage_rooms_tenants_edit: true,
  manage_meters_bills: true,
  manage_meters_bills_edit: true,
  manage_bills: true,
  manage_bills_edit: true,
  manage_finance_expenses: false,
  manage_finance_expenses_edit: false,
  access_tax: false,
  access_tax_edit: false,
  manage_finance_settings: false,
  manage_finance_settings_edit: false,
  manage_property_settings: false,
  manage_property_settings_edit: false,
  manage_staff_permissions: false,
  manage_staff_permissions_edit: false,
  billing_send_line: true,
  billing_download_pdf: true,
  billing_copy_summary: true,
  landing_page: "/billing"
}

export const ADMIN_DEFAULT_PERMISSIONS: StaffPermissions = {
  view_dashboard_stats: true,
  manage_rooms_tenants: true,
  manage_rooms_tenants_edit: true,
  manage_meters_bills: true,
  manage_meters_bills_edit: true,
  manage_bills: true,
  manage_bills_edit: true,
  manage_finance_expenses: true,
  manage_finance_expenses_edit: true,
  access_tax: true,
  access_tax_edit: true,
  manage_finance_settings: true,
  manage_finance_settings_edit: true,
  manage_property_settings: true,
  manage_property_settings_edit: true,
  manage_staff_permissions: true,
  manage_staff_permissions_edit: true,
  billing_send_line: true,
  billing_download_pdf: true,
  billing_copy_summary: true,
  landing_page: "/dashboard"
}

// ตัวเลือกหน้าแรกหลัง login ที่ admin กำหนดให้พนักงานแต่ละคนได้
// เฉพาะหน้าที่ staff role เข้าถึงได้จริงตาม middleware (src/lib/supabase/middleware.ts)
// ห้ามใส่หน้าที่อยู่ใน adminPaths (เช่น /daily-bills, /tax) เพราะ staff จะถูกบล็อกจน redirect วนลูปไม่จบ
export const STAFF_LANDING_PAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "/billing", label: "จดมิเตอร์ และดูบิล" },
  { value: "/manage-bills", label: "จัดการใบแจ้งหนี้" },
  { value: "/rooms", label: "จัดการห้องพัก และผู้เช่า" },
  { value: "/tenants", label: "จัดการสัญญา ผู้เช่า" }
]
