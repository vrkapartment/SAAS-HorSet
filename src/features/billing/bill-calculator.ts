import { calculateLateDays } from "./utils"

export interface BillRateInput {
  baseRent: number
  electricUnitsUsed: number
  waterUnitsUsed: number
  electricRate: number
  waterRate: number
  commonFee: number
  otherServiceAmount: number
  extraExpensesSum: number
  waiveWaterMin: boolean
  waterMinChecked: boolean
  waterMinUnit: number
  waiveElectricMin: boolean
  electricMinChecked: boolean
  electricMinUnit: number
  penaltyAmount?: number
  /**
   * อัตรา VAT (เช่น 0.07) — ใส่มาพร้อม vatApplies=true เมื่อ workspace จดทะเบียน VAT แล้ว
   * และถึงเดือนที่การจดมีผล (ดู resolveVatAmount() ใน features/billing/actions.ts)
   */
  vatRate?: number
  /** false (ค่าเริ่มต้น) = ไม่คิด VAT เลย บวก VAT เพิ่มจากยอดเดิมเมื่อเป็น true เท่านั้น ไม่ถอดจากยอดเดิม */
  vatApplies?: boolean
  /**
   * ค่าน้ำ-ค่าไฟของ "ห้องเดิม" ที่ยกมารวมในบิลนี้ เมื่อผู้เช่าย้ายห้องกลางเดือน
   * (ดู src/lib/billSegments.ts) เข้าฐาน VAT เหมือนค่าน้ำ-ไฟปกติ
   *
   * ยอดนี้คิดเสร็จมาแล้วตั้งแต่ตอนย้ายห้อง จึงไม่เอาไปเข้าสูตรขั้นต่ำซ้ำที่นี่ —
   * ขั้นต่ำของช่วงห้องเดิมถูกคิดไปแล้วด้วยการตั้งค่า ณ วันที่ย้าย
   */
  transferUtilitySum?: number
  /**
   * ค่าเช่าห้องเดิมที่ยกมารวมในบิลนี้ (0 เมื่อผู้ใช้เลือก "ไม่รวม")
   * แยกจาก transferUtilitySum เพราะค่าเช่าเป็นเงินได้ 40(5) ไม่เข้าฐาน VAT
   */
  transferRentSum?: number
}

export function calculateBillTotal(input: BillRateInput): {
  elecCost: number
  waterCost: number
  /**
   * true = ใบนี้คิดค่าไฟแบบ "ขั้นต่ำ" (ใช้น้อยกว่าขั้นต่ำจึงคิดตามขั้นต่ำ)
   *
   * คืนออกมาเพื่อให้ฝั่งออกบิลบันทึกลง snapshot ได้ตรง ๆ ไม่ต้องคิดสูตรซ้ำเอง —
   * คำอธิบายบนใบแจ้งหนี้ ("ค่าไฟฟ้า (ขั้นต่ำ N หน่วย)" และคอลัมน์อัตราที่แสดง "-")
   * เป็นข้อมูล ณ ตอนออกบิลเหมือนกับตัวเลขเงิน ถ้าไปคำนวณใหม่จากการตั้งค่าปัจจุบัน
   * ใบเดิมจะได้ยอดถูกแต่ป้ายผิดเมื่อมีการเปลี่ยนการตั้งค่าขั้นต่ำภายหลัง
   */
  elecMinApplied: boolean
  waterMinApplied: boolean
  /** ฐานที่ต้องเสีย VAT (ค่าน้ำ-ไฟ-ส่วนกลาง-บริการอื่น-ค่าใช้จ่ายเพิ่มเติม) ไม่รวมค่าเช่า (40(5) ยกเว้น VAT) */
  vatableBase: number
  /** VAT ที่บวกเพิ่มจากยอดเดิม — 0 เมื่อ vatApplies ไม่เป็น true */
  vatAmount: number
  total: number
} {
  const elecMinApplied = !input.waiveElectricMin && !!input.electricMinChecked
    && input.electricUnitsUsed <= input.electricMinUnit
  const waterMinApplied = !input.waiveWaterMin && !!input.waterMinChecked
    && input.waterUnitsUsed <= input.waterMinUnit

  const finalElecUnits = elecMinApplied ? input.electricMinUnit : input.electricUnitsUsed
  const finalWaterUnits = waterMinApplied ? input.waterMinUnit : input.waterUnitsUsed

  const elecCost = finalElecUnits * input.electricRate
  const waterCost = finalWaterUnits * input.waterRate

  const penalty = input.penaltyAmount || 0

  // ส่วนของห้องเดิมที่ยกมารวม (0 ในบิลปกติทุกใบ จึงไม่กระทบยอดเดิมของใครเลย)
  const transferUtilitySum = input.transferUtilitySum || 0
  const transferRentSum = input.transferRentSum || 0

  const vatableBase = elecCost + waterCost + input.commonFee + input.otherServiceAmount + input.extraExpensesSum
    + transferUtilitySum
  const vatAmount = input.vatApplies && input.vatRate
    ? Math.round(vatableBase * input.vatRate * 100) / 100
    : 0

  const total = input.baseRent + elecCost + waterCost + input.commonFee + input.otherServiceAmount + penalty + input.extraExpensesSum + vatAmount
    + transferUtilitySum + transferRentSum

  return {
    elecCost,
    waterCost,
    elecMinApplied,
    waterMinApplied,
    vatableBase,
    vatAmount,
    total
  }
}

export interface PenaltyInput {
  dueDate: string
  paidDate: string
  latePenaltyRate: number
  manualLateDaysOverride?: number
}

export function calculateLatePenalty(input: PenaltyInput): {
  lateDays: number
  penaltyAmount: number
  isManualOverride: boolean
} {
  if (input.manualLateDaysOverride !== undefined && input.manualLateDaysOverride !== null) {
    const penaltyAmount = input.manualLateDaysOverride * input.latePenaltyRate
    return {
      lateDays: input.manualLateDaysOverride,
      penaltyAmount,
      isManualOverride: true
    }
  }

  // Auto-calc based on due date
  // Since we have cycleStr, calculateLateDays expects billingCycle "YYYY-MM"
  // Let's parse dueDate to extract YYYY-MM
  let billingCycle = ""
  if (input.dueDate && input.dueDate.includes("-")) {
    const parts = input.dueDate.split("-")
    if (parts.length >= 2) {
      billingCycle = `${parts[0]}-${parts[1]}`
    }
  }

  const lateDays = calculateLateDays(billingCycle)
  const penaltyAmount = lateDays * input.latePenaltyRate

  return {
    lateDays,
    penaltyAmount,
    isManualOverride: false
  }
}
