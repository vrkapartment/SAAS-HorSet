/**
 * ใบสรุปการย้ายออก/คืนเงินประกัน — ข้อมูลกลางที่ทั้ง PDF และการ์ด LINE ใช้ร่วมกัน
 *
 * ยอดเงินจริงอยู่ในคอลัมน์เดิมของ cancelled_contracts (deducted_*, actual_refund, forfeited_amount)
 * ซึ่งฝั่ง server คิดซ้ำเองตอนบันทึก — settlement (jsonb) เป็นแค่ "คำอธิบาย" ว่ายอดนั้นมาจากอะไร
 * จึงต้องเช็คว่าผลรวมตรงกับคอลัมน์ก่อนแจกแจงเสมอ ไม่ตรงให้ถอยไปแสดงยอดรวม (ยอดจริงชนะเสมอ)
 */

/** ข้อความเดียวกับปุ่มในหน้าคืนเงินประกัน */
export const RENT_WAIVED_LABEL = "ยกเว้นค่าเช่าพัก"

export type SettlementUtility = { units: number; rate: number; amount: number }

export type CheckoutSettlement = {
  version: 1
  rent: {
    waived: boolean
    /** ข้อความแทนจำนวนวัน เมื่อยกเว้นค่าเช่า */
    label?: string
    policy?: "DAILY_PRORATE" | "FULL_MONTH"
    baseRent?: number
    daysStayed?: number | null
    amount: number
  }
  utilities?: { elec: SettlementUtility; water: SettlementUtility }
  items: { name: string; amount: number }[]
}

/** ข้อมูลจากแถว cancelled_contracts ที่ใบสรุปต้องใช้ */
export type SettlementContract = {
  roomNumber: string
  tenantName: string
  cancellationDate: string
  depositAmount: number
  actualRefund: number
  forfeitedAmount: number
  deductedRent405: number
  deductedUtilities408: number
  deductedServices408: number
  closingElecPrev: number | null
  closingElecCurr: number | null
  closingWaterPrev: number | null
  closingWaterCurr: number | null
  settlement: CheckoutSettlement | null
}

export type SettlementLine = {
  label: string
  /** คำอธิบายบรรทัดรอง เช่น ช่วงเลขมิเตอร์ / จำนวนวัน / ยกเว้นค่าเช่า */
  detail?: string
  amount: number
}

export type SettlementDocument = {
  roomNumber: string
  tenantName: string
  cancellationDate: string
  lines: SettlementLine[]
  totalDeductions: number
  depositAmount: number
  refund: number
  forfeited: number
  /** ริบเงินประกันมากกว่ารายการหัก (ผิดสัญญา/ออกก่อนกำหนด) — ต้องบอกเหตุผลในเอกสาร */
  breachNote: string | null
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseUtility(value: unknown): SettlementUtility | null {
  const u = asRecord(value)
  if (!u) return null
  return { units: num(u.units), rate: num(u.rate), amount: num(u.amount) }
}

/** อ่าน settlement jsonb จากฐานข้อมูล — รูปแบบไม่รู้จักคืน null (ใบสรุปจะใช้ยอดรวมแทน) */
export function parseCheckoutSettlement(raw: unknown): CheckoutSettlement | null {
  const obj = asRecord(raw)
  if (!obj || obj.version !== 1) return null
  const rent = asRecord(obj.rent)
  if (!rent) return null

  const elec = parseUtility(asRecord(obj.utilities)?.elec)
  const water = parseUtility(asRecord(obj.utilities)?.water)
  const items = Array.isArray(obj.items)
    ? obj.items
        .map(item => asRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map(item => ({ name: typeof item.name === "string" ? item.name.trim() : "", amount: num(item.amount) }))
        .filter(item => item.name !== "" && item.amount > 0)
    : []

  return {
    version: 1,
    rent: {
      waived: rent.waived === true,
      label: typeof rent.label === "string" ? rent.label : undefined,
      policy: rent.policy === "FULL_MONTH" || rent.policy === "DAILY_PRORATE" ? rent.policy : undefined,
      baseRent: rent.baseRent === undefined ? undefined : num(rent.baseRent),
      daysStayed: rent.daysStayed === null || rent.daysStayed === undefined ? null : num(rent.daysStayed),
      amount: num(rent.amount)
    },
    utilities: elec && water ? { elec, water } : undefined,
    items
  }
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.01

function meterRange(prev: number | null, curr: number | null): string | null {
  if (prev === null || curr === null) return null
  const units = Math.max(0, curr - prev)
  return `มิเตอร์ ${prev.toLocaleString()} → ${curr.toLocaleString()} (${units.toLocaleString()} หน่วย)`
}

/**
 * แปลงแถวประวัติสัญญายกเลิกเป็นรายการบรรทัดของใบสรุป
 *
 * กฎ: ยอดในคอลัมน์ deducted_* คือยอดจริงที่ใช้คิดเงินคืน แจกแจงตาม settlement ได้เฉพาะเมื่อผลรวมตรงกัน
 */
export function buildSettlementDocument(c: SettlementContract): SettlementDocument {
  const s = c.settlement
  const lines: SettlementLine[] = []

  // 1. ค่าเช่า
  if (s?.rent.waived) {
    lines.push({ label: "ค่าเช่าห้อง", detail: s.rent.label || RENT_WAIVED_LABEL, amount: c.deductedRent405 })
  } else {
    let detail: string | undefined
    if (s && sameAmount(s.rent.amount, c.deductedRent405)) {
      if (s.rent.policy === "FULL_MONTH") detail = "คิดเต็มเดือน"
      else if (s.rent.daysStayed !== null && s.rent.daysStayed !== undefined) {
        detail = `อยู่จริง ${s.rent.daysStayed} วัน (คิดเฉลี่ยรายวัน)`
      }
    }
    lines.push({ label: "ค่าเช่าห้อง", detail, amount: c.deductedRent405 })
  }

  // 2. ค่าน้ำ-ไฟ
  const elecRange = meterRange(c.closingElecPrev, c.closingElecCurr)
  const waterRange = meterRange(c.closingWaterPrev, c.closingWaterCurr)
  const u = s?.utilities
  if (u && sameAmount(u.elec.amount + u.water.amount, c.deductedUtilities408)) {
    lines.push({ label: "ค่าไฟฟ้า", detail: [elecRange, `หน่วยละ ${u.elec.rate.toLocaleString()} บาท`].filter(Boolean).join(" · "), amount: u.elec.amount })
    lines.push({ label: "ค่าน้ำประปา", detail: [waterRange, `หน่วยละ ${u.water.rate.toLocaleString()} บาท`].filter(Boolean).join(" · "), amount: u.water.amount })
  } else {
    const detail = [elecRange ? `ไฟ ${elecRange}` : null, waterRange ? `น้ำ ${waterRange}` : null].filter(Boolean).join(" · ")
    lines.push({ label: "ค่าน้ำ-ค่าไฟ", detail: detail || undefined, amount: c.deductedUtilities408 })
  }

  // 3. รายการหักอื่น ๆ
  const items = s?.items ?? []
  const itemsSum = items.reduce((sum, item) => sum + item.amount, 0)
  if (items.length > 0 && sameAmount(itemsSum, c.deductedServices408)) {
    for (const item of items) lines.push({ label: item.name, amount: item.amount })
  } else if (c.deductedServices408 > 0) {
    lines.push({ label: "ค่าบริการและค่าเสียหายอื่น ๆ", amount: c.deductedServices408 })
  }

  const totalDeductions = lines.reduce((sum, line) => sum + line.amount, 0)
  const expectedForfeit = Math.min(c.depositAmount, totalDeductions)
  const breachNote = c.forfeitedAmount > expectedForfeit + 0.01
    ? "ออกก่อนครบสัญญา — ริบเงินประกันตามเงื่อนไขสัญญาเช่า"
    : null

  return {
    roomNumber: c.roomNumber,
    tenantName: c.tenantName,
    cancellationDate: c.cancellationDate,
    lines,
    totalDeductions,
    depositAmount: c.depositAmount,
    refund: c.actualRefund,
    forfeited: c.forfeitedAmount,
    breachNote
  }
}

/** วันที่แบบไทยสำหรับเอกสาร เช่น "31 ต.ค. 2569" */
export function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr.substring(0, 10) + "T00:00:00")
  if (Number.isNaN(d.getTime())) return dateStr || "-"
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })
}
