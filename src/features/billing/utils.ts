/**
 * สร้างเลขใบกำกับ (invoice_id) — helper กลางตัวเดียวของทั้งระบบ
 *
 * รูปแบบ: `INV-{รอบบิลไม่มีขีด}-{รหัสอาคาร}-{เลขห้อง}` เช่น `INV-202608-A-101`
 *
 * ต้องมีรหัสอาคารประกอบ เพราะหอที่มีหลายตึกใช้เลขห้องซ้ำกันได้ (ตึก A ห้อง 101 / ตึก B ห้อง 101)
 * ถ้าไม่ใส่รหัสอาคาร บิลของสองห้องนั้นจะได้เลขเดียวกันแล้วผู้เช่าแยกไม่ออกว่าใบไหนของห้องใคร
 *
 * ห้องที่ยังไม่มีอาคาร (buildingCode ว่าง) ใช้รูปแบบเดิมไม่มีรหัสอาคาร — คงเลขให้เหมือนบิลเก่า
 * ที่ออกไปก่อนหน้านี้ ไม่ให้ผู้เช่าเห็นเลขบิลเปลี่ยนรูปแบบไปโดยไม่มีเหตุผล
 *
 * ⚠️ ห้ามเขียนสูตรนี้ซ้ำที่อื่น — ถ้าฝั่งสร้างบิลกับฝั่งพิมพ์ PDF สร้างเลขไม่เหมือนกัน
 * ผู้เช่าจะได้ใบที่เลขบนกระดาษไม่ตรงกับในระบบ
 */
export function buildInvoiceId(
  billingCycle: string,
  roomNumber: string,
  buildingCode?: string | null
): string {
  const cycle = (billingCycle || "").replace(/-/g, "")
  const code = (buildingCode || "").trim()
  return code ? `INV-${cycle}-${code}-${roomNumber}` : `INV-${cycle}-${roomNumber}`
}

/** องค์ประกอบของบิลที่บันทึกไว้ ณ ตอนออก — null ทุกช่องแปลว่าบิลเก่าที่ยังไม่มี snapshot */
export type BillSnapshot = {
  baseRent: number | null
  electricAmount: number | null
  waterAmount: number | null
  electricRate: number | null
  waterRate: number | null
  commonFee: number | null
  elecPrev: number | null
  elecCurr: number | null
  waterPrev: number | null
  waterCurr: number | null
  extraExpenses: { name?: string; amount?: number }[] | null
  /** ใบนี้คิดค่าไฟ/ค่าน้ำแบบขั้นต่ำหรือไม่ — ใช้เลือกข้อความป้ายบนใบแจ้งหนี้ */
  elecMinApplied: boolean | null
  waterMinApplied: boolean | null
  electricMinUnit: number | null
  waterMinUnit: number | null
}

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

/**
 * อ่าน snapshot ออกจากแถว bills
 *
 * ใช้ที่เดียวกันทุกฝั่งที่แสดงบิล (PDF / Portal ทั้งสองทางเข้า) เพื่อให้ตัวเลขบนใบเดียวกัน
 * ตรงกันเสมอ ไม่ว่าผู้เช่าจะเปิดจากช่องทางไหน
 *
 * ดู database_patch_add_bill_snapshot.sql สำหรับที่มาของแต่ละคอลัมน์
 */
export function readBillSnapshot(row: Record<string, unknown>): BillSnapshot {
  return {
    baseRent: num(row.base_rent),
    electricAmount: num(row.electric_amount),
    waterAmount: num(row.water_amount),
    electricRate: num(row.electric_rate),
    waterRate: num(row.water_rate),
    commonFee: num(row.common_fee),
    elecPrev: num(row.elec_prev),
    elecCurr: num(row.elec_curr),
    waterPrev: num(row.water_prev),
    waterCurr: num(row.water_curr),
    extraExpenses: Array.isArray(row.extra_expenses)
      ? (row.extra_expenses as { name?: string; amount?: number }[])
      : null,
    elecMinApplied: typeof row.elec_min_applied === "boolean" ? row.elec_min_applied : null,
    waterMinApplied: typeof row.water_min_applied === "boolean" ? row.water_min_applied : null,
    electricMinUnit: num(row.electric_min_unit),
    waterMinUnit: num(row.water_min_unit)
  }
}

/**
 * บิลใบนี้มี snapshot ให้ใช้หรือไม่
 *
 * ใช้ base_rent เป็นตัวชี้ขาดเพราะทุกบิลต้องมีค่าเช่า (แม้เป็น 0 ก็เป็นค่าที่ตั้งใจบันทึก)
 * ต่างจากค่าไฟ/ค่าน้ำที่เป็น 0 ได้ตามธรรมชาติ
 *
 * false = บิลที่ออกก่อน patch snapshot → ฝั่งแสดงผลต้องถอยไปใช้พฤติกรรมเดิม
 * ห้าม "เดา" องค์ประกอบย้อนหลังจาก config ปัจจุบันลงในเอกสารการเงิน
 */
export function hasBillSnapshot(snapshot: BillSnapshot): boolean {
  return snapshot.baseRent !== null
}

/**
 * ตัดสินว่าบิลใบนี้จะแสดง "ค่าปรับล่าช้า" เท่าไร และยอดรวมที่ผู้เช่าต้องจ่ายเป็นเท่าไร
 *
 * กฎ: **เคารพค่าที่บันทึกไว้เสมอ** แล้วคำนวณสดเฉพาะบิลที่ยังไม่มีใครแตะ
 *
 *   savedPenaltyAmount = null  → ยังไม่มีเหตุการณ์จริงมาตั้งค่า (saveAllBillsForCycle ตั้ง null
 *                                ให้บิลใหม่โดยเจตนา) → คำนวณสดจากวันที่ปัจจุบัน แล้วบวกเข้ายอด
 *   savedPenaltyAmount = ตัวเลข → แอดมินบันทึกไว้จริง → ใช้ค่านั้น และ **ห้ามบวกซ้ำ** เพราะ
 *                                updateBillPenalty เขียนค่าปรับรวมไว้ใน bills.amount แล้ว
 *                                (รวมกรณี 0 ซึ่งหมายถึง "ยกเว้นค่าปรับให้ห้องนี้")
 *
 * ⚠️ ห้ามกลับไปคำนวณทับค่าที่บันทึกไว้ เดิมโค้ดทำแบบนั้นแล้วเกิดสองอาการ:
 *   1) ค่าปรับที่แอดมินตั้งไว้หายจากรายการเมื่อบิลยังไม่เลยกำหนด (คำนวณได้ 0 วัน) แต่ยอดรวม
 *      ยังถูกเพราะค่าปรับฝังอยู่ใน amount แล้ว → ผู้เช่าเห็นยอดที่อธิบายไม่ได้
 *   2) นับซ้ำเมื่อบิลเลยกำหนดจริง — amount ที่มีค่าปรับอยู่แล้วถูกบวกค่าที่คำนวณใหม่ทับอีก
 */
export function resolveBillPenalty(input: {
  /** bills.penalty_amount — null = ยังไม่เคยตั้ง */
  savedPenaltyAmount: number | null | undefined
  /** bills.late_days */
  savedLateDays: number | null | undefined
  /** bills.amount (รวมค่าปรับที่บันทึกไว้แล้วถ้ามี) */
  billAmount: number
  /** bills.billing_cycle รูปแบบ 'YYYY-MM' */
  billingCycle: string
  billStatus: string
  /** workspaces.late_penalty_rate — บาทต่อวัน */
  latePenaltyRate: number
}): { lateDays: number | null; penaltyAmount: number | null; amount: number } {
  const { savedPenaltyAmount, savedLateDays, billAmount, billingCycle, billStatus, latePenaltyRate } = input

  const savedPenalty = savedPenaltyAmount !== null && savedPenaltyAmount !== undefined
    ? Number(savedPenaltyAmount)
    : null
  const lateDays = savedLateDays !== null && savedLateDays !== undefined ? Number(savedLateDays) : null

  if (savedPenalty !== null || billStatus !== "unpaid") {
    return { lateDays, penaltyAmount: savedPenalty, amount: Number(billAmount) }
  }

  const calculatedLateDays = calculateLateDays(billingCycle)
  const calculatedPenalty = calculatedLateDays * latePenaltyRate
  return {
    lateDays: calculatedLateDays,
    penaltyAmount: calculatedPenalty,
    amount: Number(billAmount) + calculatedPenalty
  }
}

export function calculateLateDays(cycleStr: string): number {
  if (!cycleStr || !cycleStr.includes("-")) return 0
  const [yearStr, monthStr] = cycleStr.split("-")
  const year = parseInt(yearStr, 10)
  const dueMonth = parseInt(monthStr, 10) // e.g. "06" -> 6 (July in 0-indexed Date)

  // Construct due date elements wrapping safely
  const tempDueDate = new Date(Date.UTC(year, dueMonth, 5))
  const dueYearWrapped = tempDueDate.getUTCFullYear()
  const dueMonthWrapped = tempDueDate.getUTCMonth()
  const dueDateWrapped = tempDueDate.getUTCDate()

  // 23:59:59.999 in Bangkok (UTC+7) is 16:59:59.999 UTC
  const dueTimeUTC = Date.UTC(dueYearWrapped, dueMonthWrapped, dueDateWrapped, 16, 59, 59, 999)
  const now = new Date()

  if (now.getTime() <= dueTimeUTC) return 0

  // Calculate local calendar day difference in Bangkok (UTC+7)
  const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const nowYear = bangkokNow.getUTCFullYear()
  const nowMonth = bangkokNow.getUTCMonth()
  const nowDate = bangkokNow.getUTCDate()

  const dueMidnightUTC = Date.UTC(dueYearWrapped, dueMonthWrapped, dueDateWrapped)
  const nowMidnightUTC = Date.UTC(nowYear, nowMonth, nowDate)

  const diffTime = nowMidnightUTC - dueMidnightUTC
  if (diffTime <= 0) return 0

  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}
