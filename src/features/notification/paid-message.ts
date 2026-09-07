/**
 * ข้อความแจ้งผู้เช่าเมื่อบิลถูกปิดเป็น "ชำระเงินแล้ว"
 *
 * ไฟล์นี้เก็บ "มีตัวแปรอะไรบ้าง + ข้อความต้นแบบ + วิธีแทนค่า" ไว้ที่เดียว เพราะมีคนใช้ 3 ฝั่ง
 * ที่ต้องตรงกันเป๊ะ ๆ ไม่งั้นพรีวิวกับข้อความจริงจะไม่เหมือนกัน:
 *   - หน้าตั้งค่า (ปุ่มแทรกตัวแปร + พรีวิว)
 *   - ฝั่งบันทึก (ตรวจว่าไม่มีตัวแปรที่ไม่รู้จักหลุดไป)
 *   - ฝั่งส่งจริง (line-paid.ts)
 *
 * ไม่ใช่ Server Action เพราะ cron ของ SlipOK retry ต้องเรียกได้ด้วย (ไม่มี session)
 */

/** ตัวแปรที่ใส่ในข้อความได้ — เพิ่มตัวใหม่ต้องเพิ่มที่นี่ที่เดียว */
export const PAID_MESSAGE_VARIABLES = [
  { token: "{{TENANT_NAME}}", label: "ชื่อผู้เช่า", sample: "คุณสมชาย ใจดี" },
  { token: "{{WORKSPACE_NAME}}", label: "ชื่อหอพัก", sample: "VRK Apartment" },
  { token: "{{ROOM_NUMBER}}", label: "เลขห้อง", sample: "134" },
  { token: "{{BILLING_CYCLE}}", label: "รอบบิล", sample: "2026-08" },
  { token: "{{AMOUNT}}", label: "ยอดเงิน", sample: "3,115" },
  { token: "{{PAID_AT}}", label: "วันที่ชำระ", sample: "6 ก.ย. 2569 14:32" }
] as const

export type PaidMessageVariable = (typeof PAID_MESSAGE_VARIABLES)[number]

export const PAID_MESSAGE_MAX_LENGTH = 1000

/** ข้อความต้นแบบ ใช้เมื่อหอพักยังไม่ได้ปรับเอง */
export const DEFAULT_PAID_MESSAGE_TEMPLATE = [
  "✅ ชำระเงินเรียบร้อยแล้ว",
  "",
  "เรียนคุณ {{TENANT_NAME}}",
  "ห้อง {{ROOM_NUMBER}} · รอบ {{BILLING_CYCLE}}",
  "ยอด {{AMOUNT}} บาท",
  "",
  "ขอบคุณที่ชำระค่าเช่าตรงเวลาครับ 🙏",
  "{{WORKSPACE_NAME}}"
].join("\n")

export type PaidMessageValues = {
  tenantName: string
  workspaceName: string
  roomNumber: string
  billingCycle: string
  amount: number
  paidAt: Date
}

function thaiDateTime(input: Date): string {
  const date = input.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })
  const time = input.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
  return `${date} ${time}`
}

/**
 * แทนค่าตัวแปรลงในข้อความ
 *
 * ตัวแปรที่ไม่รู้จัก (เช่นเจ้าหอพิมพ์ {{FOO}} เอง) จะถูกปล่อยไว้ตามเดิม ไม่ลบทิ้งเงียบ ๆ
 * เพื่อให้เห็นในพรีวิวว่าพิมพ์ผิด แทนที่จะได้ข้อความแหว่งไปเฉย ๆ
 */
export function renderPaidMessage(template: string, values: PaidMessageValues): string {
  const map: Record<string, string> = {
    "{{TENANT_NAME}}": values.tenantName?.trim() || "ผู้เช่า",
    "{{WORKSPACE_NAME}}": values.workspaceName?.trim() || "หอพัก",
    "{{ROOM_NUMBER}}": values.roomNumber?.trim() || "-",
    "{{BILLING_CYCLE}}": values.billingCycle?.trim() || "-",
    "{{AMOUNT}}": Number(values.amount ?? 0).toLocaleString("th-TH"),
    "{{PAID_AT}}": thaiDateTime(values.paidAt)
  }

  let out = template
  for (const [token, value] of Object.entries(map)) {
    out = out.split(token).join(value)
  }
  return out
}

/** ข้อมูลตัวอย่างสำหรับพรีวิวในหน้าตั้งค่า */
export function samplePaidMessageValues(workspaceName: string): PaidMessageValues {
  return {
    tenantName: "คุณสมชาย ใจดี",
    workspaceName: workspaceName?.trim() || "หอพักของคุณ",
    roomNumber: "134",
    billingCycle: "2026-08",
    amount: 3115,
    paidAt: new Date()
  }
}

/** เลือกข้อความที่จะใช้จริง — ว่างเมื่อไหร่ก็ถอยไปใช้ต้นแบบ ไม่ส่งข้อความเปล่าเด็ดขาด */
export function resolvePaidMessageTemplate(saved: string | null | undefined): string {
  const trimmed = (saved || "").trim()
  return trimmed || DEFAULT_PAID_MESSAGE_TEMPLATE
}
