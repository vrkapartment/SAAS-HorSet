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
}

export function calculateBillTotal(input: BillRateInput): {
  elecCost: number
  waterCost: number
  total: number
} {
  const finalElecUnits = !input.waiveElectricMin && input.electricMinChecked && input.electricUnitsUsed <= input.electricMinUnit
    ? input.electricMinUnit
    : input.electricUnitsUsed

  const finalWaterUnits = !input.waiveWaterMin && input.waterMinChecked && input.waterUnitsUsed <= input.waterMinUnit
    ? input.waterMinUnit
    : input.waterUnitsUsed

  const elecCost = finalElecUnits * input.electricRate
  const waterCost = finalWaterUnits * input.waterRate

  const penalty = input.penaltyAmount || 0

  const total = input.baseRent + elecCost + waterCost + input.commonFee + input.otherServiceAmount + penalty + input.extraExpensesSum

  return {
    elecCost,
    waterCost,
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
