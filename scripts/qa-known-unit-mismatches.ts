/**
 * รายการบิลที่ "หน่วยไม่ตรงกับมิเตอร์" ซึ่งตรวจแล้วว่าถูกต้องตามที่ควรเป็น
 *
 * ทำไมต้องมีไฟล์นี้: qa:audit-units เทียบหน่วยในบิลกับ meter_records ปัจจุบัน ซึ่งจับได้ทั้ง
 * "บิลคิดผิด" และ "มิเตอร์ถูกแก้ย้อนหลังโดยเจตนา" — สองอย่างนี้แยกจากกันด้วยข้อมูลในระบบไม่ได้
 *
 * ถ้าไม่มีรายการนี้ ใบที่ตรวจแล้วว่าไม่มีปัญหาจะขึ้น FAIL ตลอดไป แล้วคนจะเลิกอ่านผลลัพธ์
 * ซึ่งอันตรายกว่าการไม่มีเครื่องมือเลย เพราะของจริงที่โผล่มาใหม่จะจมไปกับ noise
 *
 * ⚠️ กติกาการเพิ่มรายการ
 *   · เพิ่มได้เฉพาะเมื่อ "ตรวจด้วยตาแล้ว" ว่ายอดที่เก็บไปถูกต้อง ห้ามเพิ่มเพื่อให้ผลเป็นเขียว
 *   · ต้องเขียน reason ว่าทำไมไม่ตรง — คนอ่านทีหลังต้องเข้าใจได้โดยไม่ต้องถามใคร
 *   · เก็บตัวเลขที่พบไว้ด้วย (billElec/billWater/meterElec/meterWater) ถ้าตัวเลขเปลี่ยนไปจากนี้
 *     สคริปต์จะรายงานเป็นของใหม่ทันที ไม่เงียบให้ — การรับทราบผูกกับ "สภาพที่ตรวจ" ไม่ใช่เลขใบ
 */

export type KnownUnitMismatch = {
  invoiceId: string
  /** หน่วยที่บิลเก็บไว้ ณ ตอนที่ตรวจ */
  billElec: number
  billWater: number
  /** หน่วยที่คำนวณจากมิเตอร์ ณ ตอนที่ตรวจ */
  meterElec: number
  meterWater: number
  reason: string
  acknowledgedOn: string
}

export const KNOWN_UNIT_MISMATCHES: KnownUnitMismatch[] = [
  // VRK Apartment — เจ้าของระบบยืนยันแล้วว่ายอดที่เก็บไปถูกต้อง
  // สาเหตุ: ตอนนั้นระบบย้ายผู้เช่าออกยังไม่สมบูรณ์ จึงมีการแก้ข้อมูลในฐานข้อมูลโดยตรง
  // ทำให้เลขมิเตอร์ปัจจุบันไม่ตรงกับหน่วยที่บิลคิดไป — บิลถูก มิเตอร์ถูกแก้ทีหลัง
  {
    invoiceId: "INV-202601-125", billElec: 85, billWater: 0, meterElec: 85, meterWater: 1,
    reason: "แก้ข้อมูลใน DB โดยตรงตอนที่ระบบย้ายออกยังไม่สมบูรณ์ · ยอดที่เก็บถูกต้อง (ใช้น้ำต่ำกว่าขั้นต่ำ ส่วนต่างเงิน 0)",
    acknowledgedOn: "2026-08-24"
  },
  {
    invoiceId: "INV-202602-125", billElec: 80, billWater: 0, meterElec: 80, meterWater: 2,
    reason: "แก้ข้อมูลใน DB โดยตรงตอนที่ระบบย้ายออกยังไม่สมบูรณ์ · ยอดที่เก็บถูกต้อง (ใช้น้ำต่ำกว่าขั้นต่ำ ส่วนต่างเงิน 0)",
    acknowledgedOn: "2026-08-24"
  },
  {
    invoiceId: "INV-202603-125", billElec: 64, billWater: 0, meterElec: 64, meterWater: 1,
    reason: "แก้ข้อมูลใน DB โดยตรงตอนที่ระบบย้ายออกยังไม่สมบูรณ์ · ยอดที่เก็บถูกต้อง (ใช้น้ำต่ำกว่าขั้นต่ำ ส่วนต่างเงิน 0)",
    acknowledgedOn: "2026-08-24"
  },
  {
    invoiceId: "INV-202605-144", billElec: 165, billWater: 12, meterElec: 0, meterWater: 12,
    reason: "แก้ข้อมูลใน DB โดยตรงตอนที่ระบบย้ายออกยังไม่สมบูรณ์ · บิลเก็บ 165 หน่วยถูกต้อง มิเตอร์ถูกรีเซ็ตทีหลัง",
    acknowledgedOn: "2026-08-24"
  },
  {
    invoiceId: "INV-202606-144", billElec: 256, billWater: 0, meterElec: 256, meterWater: 10,
    reason: "แก้ข้อมูลใน DB โดยตรงตอนที่ระบบย้ายออกยังไม่สมบูรณ์ · ยอดที่เก็บถูกต้อง",
    acknowledgedOn: "2026-08-24"
  }
]

/** หา entry ที่รับทราบไว้ และตรงกับ "สภาพที่พบตอนนี้" เท่านั้น */
export function findAcknowledged(
  invoiceId: string | null,
  billElec: number,
  billWater: number,
  meterElec: number,
  meterWater: number
): KnownUnitMismatch | undefined {
  if (!invoiceId) return undefined
  return KNOWN_UNIT_MISMATCHES.find(k =>
    k.invoiceId === invoiceId &&
    k.billElec === billElec && k.billWater === billWater &&
    k.meterElec === meterElec && k.meterWater === meterWater
  )
}
