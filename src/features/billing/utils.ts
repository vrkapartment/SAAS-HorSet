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
