export interface DepositProrationInput {
  baseRent: number
  depositAmount: number          // refundDeposit (usually what the workspace records as the deposit)
  checkoutDate: string           // refundCheckoutDate
  contractEnd: string | null     // leaseEnd
  checkoutPolicy: "DAILY_PRORATE" | "FULL_MONTH"
  isRentWaived?: boolean
  totalUtilities408?: number     // total utilities deduction calculated (elecCost + waterCost)
  customDeductions?: { name: string; amount: number }[]
  isHistoricalEdit?: boolean
  isHistoricalBreach?: boolean
  historicalRentDeduction?: number
  historicalUtilitiesDeduction?: number
}

export interface DepositProrationResult {
  daysStayed: number
  isContractBroken: boolean
  rentDeduction: number
  utilitiesDeduction: number
  servicesDeduction: number
  forfeitedAmount: number
  actualRefund: number
}

/**
 * คำนวณยอดเงินประกันมาตรฐานจากการตั้งค่า workspace/room_type
 * (สูตรเดียวกับที่ UI คำนวณสดในหน้าห้องพัก และที่ backfill script ใช้)
 */
export function computeStandardDeposit(
  baseRent: number,
  depositType: "months" | "fixed" | null | undefined,
  depositAmount: number,
  roomTypeDepositOverride?: number | null
): number {
  if (depositType === "fixed") {
    return roomTypeDepositOverride !== undefined && roomTypeDepositOverride !== null
      ? roomTypeDepositOverride
      : (depositAmount || 0)
  }
  return (baseRent || 0) * (depositAmount || 0)
}

/**
 * ค่าเช่าของช่วง "ต้นเดือนถึงวันที่ออก" ตามนโยบายที่หอตั้งไว้
 * (/settings?tab=property → การหักเงินประกันห้องพัก กรณีย้ายออกกลางเดือน)
 *
 * แยกออกมาเป็นฟังก์ชันเพราะมีสองที่ที่ต้องใช้สูตรเดียวกันเป๊ะ:
 *   1. หักค่าเช่าจากเงินประกันตอนย้ายออก (calculateDepositProration ด้านล่าง)
 *   2. ค่าเช่าห้องเดิมที่ยกไปรวมในบิลห้องใหม่ตอนย้ายห้อง (transferTenantRoom)
 *
 * เดิมข้อ 2 เขียนสูตร /30 ของตัวเองแบบ hardcode จึงไม่เคยเคารพนโยบาย FULL_MONTH เลย —
 * หอที่ตั้งเป็นคิดเต็มเดือนจะได้ยอดย้ายห้องแบบเฉลี่ยรายวันโดยที่ไม่มีใครเห็น
 *
 * หมายเหตุ: ตัวหารเป็น 30 คงที่ (ไม่ใช่จำนวนวันจริงของเดือน) เพื่อคงพฤติกรรมเดิม
 * ที่ใช้คิดเงินให้ผู้เช่าไปแล้วจริง — เปลี่ยนตัวหารคือเปลี่ยนยอดเก็บเงินย้อนหลัง
 */
export function computeMidMonthRent(
  baseRent: number,
  checkoutDate: string,
  policy: "DAILY_PRORATE" | "FULL_MONTH"
): number {
  const rent = Number(baseRent || 0)
  if (policy !== "DAILY_PRORATE") return rent
  const daysStayed = new Date(checkoutDate).getDate()
  return Math.round((rent / 30) * daysStayed * 100) / 100
}

export function checkIfBreakContract(checkoutDateStr: string, leaseEndStr: string | null | undefined): boolean {
  if (!leaseEndStr || !checkoutDateStr) return false
  const checkDate = new Date(checkoutDateStr)
  const leaseEndDate = new Date(leaseEndStr)
  
  const checkYear = checkDate.getFullYear()
  const checkMonth = checkDate.getMonth()
  
  const leaseYear = leaseEndDate.getFullYear()
  const leaseMonth = leaseEndDate.getMonth()
  
  if (checkYear < leaseYear) return true
  if (checkYear === leaseYear && checkMonth < leaseMonth) return true
  
  return false
}

export function calculateDepositProration(input: DepositProrationInput): DepositProrationResult {
  const refundDeposit = Number(input.depositAmount || 0)
  const isRentWaived = !!input.isRentWaived
  const isHistoricalEdit = !!input.isHistoricalEdit

  let calcRentDeduction = 0
  let totalUtilities408 = 0
  const daysStayed = new Date(input.checkoutDate).getDate()

  if (isHistoricalEdit) {
    totalUtilities408 = Number(input.historicalUtilitiesDeduction || 0)
    calcRentDeduction = isRentWaived ? 0 : Number(input.historicalRentDeduction || 0)
  } else {
    totalUtilities408 = Number(input.totalUtilities408 || 0)
    if (!isRentWaived) {
      calcRentDeduction = computeMidMonthRent(input.baseRent, input.checkoutDate, input.checkoutPolicy)
    }
  }

  const customDeductions = input.customDeductions || []
  const totalCustomDeductions = customDeductions.reduce((sum, d) => sum + Number(d.amount || 0), 0)
  const totalDeductions = calcRentDeduction + totalUtilities408 + totalCustomDeductions

  const isContractBroken = isHistoricalEdit 
    ? !!input.isHistoricalBreach 
    : checkIfBreakContract(input.checkoutDate, input.contractEnd)

  let checkoutRefundAmount = 0
  let forfeitedAmountVal = 0
  let rentDeductionVal = calcRentDeduction
  let utilitiesDeductionVal = totalUtilities408
  let servicesDeductionVal = totalCustomDeductions

  if (isContractBroken) {
    // อยู่ไม่ครบระยะสัญญา (ผิดสัญญา): ริบเงินมัดจำทั้งหมด (Refund = 0)
    checkoutRefundAmount = 0
    forfeitedAmountVal = refundDeposit
    
    // แบ่งสัดส่วนเงินมัดจำที่ริบทั้งหมดเข้า 3 หมวดภาษีเงินได้หอพัก:
    servicesDeductionVal = Math.max(0, refundDeposit - rentDeductionVal - utilitiesDeductionVal)
  } else {
    const netRefund = refundDeposit - totalDeductions
    checkoutRefundAmount = Math.max(0, netRefund)
    forfeitedAmountVal = Math.max(0, refundDeposit - checkoutRefundAmount)
  }

  return {
    daysStayed,
    isContractBroken,
    rentDeduction: rentDeductionVal,
    utilitiesDeduction: utilitiesDeductionVal,
    servicesDeduction: servicesDeductionVal,
    forfeitedAmount: forfeitedAmountVal,
    actualRefund: checkoutRefundAmount
  }
}
