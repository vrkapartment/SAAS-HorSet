/**
 * แปลชื่อตารางและชื่อคอลัมน์ในฐานข้อมูลให้เป็นภาษาที่เจ้าหออ่านรู้เรื่อง
 *
 * audit_logs เก็บชื่อจริงในฐานข้อมูล (bills, penalty_amount) เพราะ trigger ไม่ควรรู้จัก
 * ภาษาที่แสดงผล การแปลจึงทำที่ชั้นแสดงผลแทน — แก้คำได้ทีหลังโดยไม่ต้องแตะข้อมูลที่จดไปแล้ว
 *
 * ไม่ใช่ Server Action เพื่อให้ทั้งฝั่ง server และ client ใช้ร่วมกันได้
 */

/** ตารางที่ระบบจดบันทึก — ลำดับนี้ใช้เรียงตัวกรองในหน้าจอด้วย */
export const AUDITED_TABLES = [
  "bills",
  "meter_records",
  "expenses",
  "workspaces",
  "tenants",
  "rooms",
  "profiles"
] as const

export type AuditedTable = (typeof AUDITED_TABLES)[number]

/** ชื่อ "เรื่อง" ที่แสดงในตัวกรองและหัวการ์ด */
export const TABLE_LABELS: Record<string, { th: string; icon: string }> = {
  bills:         { th: "บิล",          icon: "🧾" },
  meter_records: { th: "มิเตอร์",       icon: "⚡" },
  expenses:      { th: "รายจ่าย",      icon: "📤" },
  workspaces:    { th: "ตั้งค่าหอ",     icon: "💰" },
  tenants:       { th: "ผู้เช่า",        icon: "👤" },
  rooms:         { th: "ห้องพัก",       icon: "🚪" },
  profiles:      { th: "สิทธิ์ผู้ใช้",    icon: "🔑" }
}

export const ACTION_LABELS: Record<string, string> = {
  INSERT: "เพิ่ม",
  UPDATE: "แก้ไข",
  DELETE: "ลบ"
}

/**
 * ชื่อคอลัมน์ที่อ่านรู้เรื่อง
 *
 * ที่ไม่มีในรายการนี้จะแสดงชื่อจริงในฐานข้อมูลไปเลย — ดีกว่าซ่อนไม่ให้เห็น
 * เพราะ log ต้องบอกครบว่ามีอะไรเปลี่ยน แม้จะยังไม่ได้แปลคำก็ต้องเห็น
 */
export const FIELD_LABELS: Record<string, string> = {
  // ── บิล ──
  status: "สถานะ",
  amount: "ยอดรวม",
  penalty_amount: "ค่าปรับล่าช้า",
  late_days: "จำนวนวันที่ล่าช้า",
  base_rent: "ค่าเช่าห้อง",
  electric_units: "หน่วยไฟที่ใช้",
  electric_amount: "ค่าไฟ",
  water_units: "หน่วยน้ำที่ใช้",
  water_amount: "ค่าน้ำ",
  common_fee: "ค่าส่วนกลาง",
  other_service_amount: "ค่าบริการอื่น",
  vat_amount: "ภาษีมูลค่าเพิ่ม",
  slip_url: "สลิปโอนเงิน",
  billing_cycle: "รอบบิล",
  tenant_name: "ชื่อผู้เช่า",
  room_number: "เลขห้อง",
  extra_expenses: "ค่าใช้จ่ายเพิ่ม",
  utility_segments: "ค่าน้ำ-ไฟที่ยกมาจากห้องเดิม",
  bill_kind: "ประเภทบิล",

  // ── มิเตอร์ ──
  elec_prev: "เลขไฟครั้งก่อน",
  elec_curr: "เลขไฟล่าสุด",
  water_prev: "เลขน้ำครั้งก่อน",
  water_curr: "เลขน้ำล่าสุด",
  occupancy_start_elec: "เลขไฟตั้งต้นตอนเข้าอยู่",
  occupancy_start_water: "เลขน้ำตั้งต้นตอนเข้าอยู่",

  // ── ตั้งค่าหอ ──
  promptpay_id: "เลขพร้อมเพย์",
  promptpay_name: "ชื่อบัญชีพร้อมเพย์",
  promptpay_type: "ประเภทพร้อมเพย์",
  electric_rate: "ค่าไฟต่อหน่วย",
  water_rate: "ค่าน้ำต่อหน่วย",
  late_penalty_rate: "ค่าปรับต่อวัน",
  deposit_amount: "เงินประกัน",
  advance_rent: "ค่าเช่าล่วงหน้า",
  electric_min_unit: "หน่วยไฟขั้นต่ำ",
  water_min_unit: "หน่วยน้ำขั้นต่ำ",
  electric_min_checked: "คิดหน่วยไฟขั้นต่ำ",
  water_min_checked: "คิดหน่วยน้ำขั้นต่ำ",
  vat_rate: "อัตราภาษีมูลค่าเพิ่ม",
  vat_registered: "จดทะเบียนภาษีมูลค่าเพิ่ม",
  slip_retention_months: "เก็บสลิปกี่เดือน",
  tax_id: "เลขผู้เสียภาษี",
  name: "ชื่อหอพัก",

  // ── ผู้เช่า / ห้องพัก ──
  tenant_phone: "เบอร์โทรผู้เช่า",
  line_user_id: "บัญชี LINE ผู้เช่า",
  lease_start: "วันเริ่มสัญญา",
  lease_end: "วันสิ้นสุดสัญญา",
  deposit_paid: "เงินประกันที่ชำระ",
  waive_electric_min: "ยกเว้นหน่วยไฟขั้นต่ำ",
  waive_water_min: "ยกเว้นหน่วยน้ำขั้นต่ำ",
  floor: "ชั้น",
  room_type_id: "ประเภทห้อง",
  building_id: "อาคาร",

  // ── รายจ่าย ──
  title: "ชื่อรายการ",
  tax_year: "ปีภาษี",
  category: "หมวด",
  claim_input_vat: "ขอคืนภาษีซื้อ",

  // ── สิทธิ์ ──
  role: "บทบาท",
  permissions: "สิทธิ์การใช้งาน",
  workspace_id: "หอพักที่สังกัด"
}

/**
 * ฟิลด์ที่ "ลดลง" แล้วน่าสงสัยในทางกันโกง
 *
 * ใช้เน้นในหน้าจอ เช่นเลขมิเตอร์ที่ถูกแก้ให้น้อยลง หรือค่าปรับที่ถูกลด
 * เป็นแค่ตัวช่วยสะกิดตา ไม่ได้ตัดสินว่าผิด
 */
const SUSPICIOUS_WHEN_DECREASED = new Set([
  "amount",
  "penalty_amount",
  "late_days",
  "base_rent",
  "elec_curr",
  "water_curr",
  "electric_units",
  "water_units",
  "electric_rate",
  "water_rate",
  "late_penalty_rate",
  "deposit_paid"
])

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] || field
}

export function tableLabel(table: string): { th: string; icon: string } {
  return TABLE_LABELS[table] || { th: table, icon: "📄" }
}

/** ตัวเลขลดลงในฟิลด์ที่ควรจับตา — คืน null เมื่อไม่เข้าเงื่อนไขหรือเทียบไม่ได้ */
export function decreaseWarning(
  field: string,
  before: unknown,
  after: unknown
): { amount: number } | null {
  if (!SUSPICIOUS_WHEN_DECREASED.has(field)) return null
  const b = Number(before)
  const a = Number(after)
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null
  if (a >= b) return null
  return { amount: b - a }
}

/** แปลงค่าใน jsonb ให้เป็นข้อความที่อ่านได้ในหน้าจอ */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "เปิด" : "ปิด"
  if (typeof value === "number") return value.toLocaleString("th-TH")
  if (typeof value === "object") return JSON.stringify(value)
  const text = String(value)
  return text.trim() === "" ? "—" : text
}

/**
 * ชื่อสิทธิ์ย่อยแต่ละข้อใน profiles.permissions (jsonb)
 *
 * ใช้คำเดียวกับสวิตช์ในหน้า จัดการสิทธิ์ เพื่อให้อ่าน log แล้วนึกออกทันทีว่าคือปุ่มไหน
 * ลำดับในนี้คือลำดับที่แสดงในหน้าจอด้วย
 */
export const PERMISSION_LABELS: Record<string, string> = {
  view_dashboard_stats: "ดูแดชบอร์ดสถิติภาพรวม",
  manage_rooms_tenants: "ดูห้องพัก & ผู้เช่า",
  manage_rooms_tenants_edit: "แก้ห้องพัก & ผู้เช่า",
  manage_meters_bills: "ดูมิเตอร์ & สรุปบิล",
  manage_meters_bills_edit: "แก้มิเตอร์ & สรุปบิล",
  manage_bills: "ดูใบแจ้งหนี้",
  manage_bills_edit: "แก้ใบแจ้งหนี้",
  manage_finance_expenses: "ดูรายจ่าย",
  manage_finance_expenses_edit: "แก้รายจ่าย",
  access_tax: "ดูภาษี ภ.ง.ด.",
  access_tax_edit: "แก้ข้อมูลภาษี",
  manage_finance_settings: "ดูตั้งค่าการเงิน",
  manage_finance_settings_edit: "แก้ตั้งค่าการเงิน",
  manage_property_settings: "ดูตั้งค่าหอพัก",
  manage_property_settings_edit: "แก้ตั้งค่าหอพัก",
  manage_staff_permissions: "ดูสิทธิ์พนักงาน",
  manage_staff_permissions_edit: "แก้สิทธิ์พนักงาน",
  billing_send_line: "ส่งบิลทาง LINE OA",
  billing_download_pdf: "ดาวน์โหลด PDF",
  billing_copy_summary: "คัดลอกสรุปบิล",
  restrict_buildings: "จำกัดเฉพาะบางอาคาร",
  allowed_building_ids: "อาคารที่เข้าถึงได้",
  landing_page: "หน้าแรกหลังเข้าสู่ระบบ"
}

/**
 * คอลัมน์ที่ซ่อนตอนเหตุการณ์ "เพิ่ม" / "ลบ"
 *
 * UPDATE จด changed_fields ไว้แล้วว่าอะไรเปลี่ยน แต่ INSERT/DELETE จดทั้งแถว
 * จึงมีคอลัมน์ที่คนอ่านไม่ได้ประโยชน์ติดมาด้วย (id ของแถว, เวลาที่สร้าง/แก้)
 *
 * ⚠️ ซ่อนแค่ในหน้าจอ — ฐานข้อมูลยังเก็บครบทุกคอลัมน์ ถ้าต้องสืบสวนจริงยังขุดได้
 */
const NOISE_ON_FULL_ROW = new Set(["id", "created_at", "updated_at", "workspace_id"])

/** uuid ดิบไม่บอกอะไรกับคนอ่าน — ป้ายรายการบอกไปแล้วว่าเป็นห้อง/บิล/ผู้เช่าคนไหน */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** หนึ่งบรรทัดในตาราง ก่อน → หลัง */
export type AuditChange = {
  /** key สำหรับ React (ไม่ซ้ำในแถวเดียวกัน) */
  key: string
  label: string
  /** ชื่อคอลัมน์จริงในฐานข้อมูล — ใช้ตรวจว่าตัวเลขลดลงน่าสงสัยไหม */
  field: string
  before: unknown
  after: unknown
}

/** รูปแบบเท่าที่ auditChanges ต้องใช้ — ไม่ import type จากไฟล์ "use server" */
type AuditChangeSource = {
  action: string
  changedFields: string[] | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/** กาง permissions ออกเป็นสิทธิ์ทีละข้อ แทนที่จะโชว์ JSON ก้อนเดียวที่อ่านไม่ออก */
function expandPermissions(before: unknown, after: unknown): AuditChange[] {
  const b = asRecord(before)
  const a = asRecord(after)

  // กางได้เฉพาะตอนที่ฝั่งที่มีค่าเป็น object จริง
  //
  // ถ้าฝั่งใดฝั่งหนึ่งไม่ใช่ object (เช่น null หรือถูกแทนด้วย "(ข้อมูลยาวเกิน)")
  // ต้องแสดงตามเดิม ห้ามกางข้างเดียว ไม่งั้นจะอ่านเหมือนว่าสิทธิ์ทุกข้อถูกถอดออก
  const brokenBefore = before !== undefined && before !== null && !b
  const brokenAfter = after !== undefined && after !== null && !a
  if ((!b && !a) || brokenBefore || brokenAfter) {
    return [{ key: "permissions", label: fieldLabel("permissions"), field: "permissions", before, after }]
  }

  const keys = [...new Set([...Object.keys(b || {}), ...Object.keys(a || {})])]
  // เรียงตามลำดับในหน้าจัดการสิทธิ์ ที่ไม่รู้จักไปต่อท้าย
  const order = Object.keys(PERMISSION_LABELS)
  keys.sort((x, y) => {
    const ix = order.indexOf(x)
    const iy = order.indexOf(y)
    if (ix === -1 && iy === -1) return x.localeCompare(y)
    if (ix === -1) return 1
    if (iy === -1) return -1
    return ix - iy
  })

  // แก้ไข = โชว์เฉพาะข้อที่เปลี่ยน / เพิ่ม-ลบ = โชว์ทุกข้อ (ต้องเห็นว่าให้สิทธิ์อะไรไปบ้าง)
  const isUpdate = Boolean(b) && Boolean(a)
  const visible = isUpdate ? keys.filter(k => !sameValue(b?.[k], a?.[k])) : keys

  return visible.map(k => ({
    key: `permissions.${k}`,
    label: `สิทธิ์: ${PERMISSION_LABELS[k] || k}`,
    field: "permissions",
    before: b ? b[k] : undefined,
    after: a ? a[k] : undefined
  }))
}

/**
 * แปลงแถว audit หนึ่งแถวให้เป็นบรรทัดที่พร้อมแสดง
 *
 * รวมตรรกะ "แสดงอะไร/ไม่แสดงอะไร" ไว้ที่เดียว เพราะเป็นเรื่องความน่าเชื่อถือของ log
 * ถ้ากระจายไปอยู่ใน component แล้ววันหนึ่งซ่อนพลาด จะกลายเป็นหลักฐานที่ขาดหาย
 */
export function auditChanges(row: AuditChangeSource): AuditChange[] {
  const isFullRow = row.action !== "UPDATE"
  const fields =
    row.changedFields && row.changedFields.length > 0
      ? row.changedFields
      : Object.keys(row.after || row.before || {})

  const out: AuditChange[] = []
  for (const field of fields) {
    const before = row.before ? row.before[field] : undefined
    const after = row.after ? row.after[field] : undefined

    if (isFullRow && (NOISE_ON_FULL_ROW.has(field) || isRawUuid(after ?? before))) continue

    if (field === "permissions") {
      out.push(...expandPermissions(before, after))
      continue
    }

    out.push({ key: field, label: fieldLabel(field), field, before, after })
  }
  return out
}

function isRawUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value)
}
