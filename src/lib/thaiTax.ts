// ยูทิลิตี้คำนวณภาษีเงินได้บุคคลธรรมดาแบบขั้นบันได (ใช้ร่วมกันระหว่าง ภ.ง.ด. 90 และ ภ.ง.ด. 94)
// หมายเหตุ: เป็นข้อมูลอ้างอิงเบื้องต้นเท่านั้น ผู้ใช้งานต้องตรวจสอบความถูกต้องก่อนยื่นแบบจริงเสมอ

import type { IncomeTaxResult, Bucket } from "@/types/tax"

// อัตราภาษีก้าวหน้ามาตรฐานของไทย (คงที่มาหลายปี ไม่เปลี่ยนตามปีภาษี)
const TAX_BRACKETS = [
  { upTo: 150_000, rate: 0 },
  { upTo: 300_000, rate: 0.05 },
  { upTo: 500_000, rate: 0.10 },
  { upTo: 750_000, rate: 0.15 },
  { upTo: 1_000_000, rate: 0.20 },
  { upTo: 2_000_000, rate: 0.25 },
  { upTo: 5_000_000, rate: 0.30 },
  { upTo: Infinity, rate: 0.35 },
]

// คำนวณภาษีตามอัตราก้าวหน้าจากเงินได้สุทธิ
export function calculateProgressiveTax(netIncome: number): number {
  const income = Math.max(0, netIncome)
  let tax = 0
  let lowerBound = 0
  for (const bracket of TAX_BRACKETS) {
    if (income <= lowerBound) break
    const taxableInBracket = Math.min(income, bracket.upTo) - lowerBound
    tax += taxableInBracket * bracket.rate
    lowerBound = bracket.upTo
  }
  return Math.max(0, tax)
}

// ภาษีขั้นต่ำตามมาตรา 48(2): ถ้าเงินได้พึงประเมิน (ก่อนหักค่าใช้จ่ายใดๆ) >= 120,000 บาท ให้คิด 0.5% ของยอดนั้น
export function calculateMinimumTax(grossAssessableIncome: number): number {
  if (grossAssessableIncome < 120_000) return 0
  return grossAssessableIncome * 0.005
}

// ภาษีที่ต้องชำระจริง: ใช้ค่าที่มากกว่าระหว่างภาษีขั้นบันไดกับภาษีขั้นต่ำ
// เว้นแต่ภาษีขั้นต่ำคำนวณแล้วไม่เกิน 5,000 บาท ให้ใช้ภาษีขั้นบันไดเพียงอย่างเดียว
export function calculateFinalTaxDue(progressiveTax: number, minimumTax: number): number {
  if (minimumTax <= 5_000) return progressiveTax
  return Math.max(progressiveTax, minimumTax)
}

// จำกัดยอดหักค่าใช้จ่ายไม่ให้เกินรายได้ของตะกร้านั้น — บังคับเสมอเมื่อหักเหมา (ตามกฎหมาย)
// ส่วนหักตามจริงจะถูกจำกัดด้วยก็ต่อเมื่อเปิด capExpensePerBucket (โหมดระมัดระวัง) เท่านั้น
// ใช้ร่วมกันทั้งฝั่งแสดงผล (บัตรสรุป/PDF) และฝั่งคำนวณ PitBreakdown เพื่อให้ตัวเลขตรงกันเป๊ะทุกจุด
export function capActualExpenseDeduction(
  mode: "lump" | "actual",
  requestedDeduction: number,
  bucketIncome: number,
  capExpensePerBucket: boolean
): number {
  const shouldCap = mode === "lump" || capExpensePerBucket
  return shouldCap ? Math.min(requestedDeduction, bucketIncome) : requestedDeduction
}

export type TaxpayerStatus = "individual" | "partnership"

// ค่าลดหย่อนส่วนตัว (ข.1 ของ ภ.ง.ด. 94 / รายการผู้มีเงินได้ของ ภ.ง.ด. 90)
// บุคคลธรรมดา = ค่าคงที่ / ห้างหุ้นส่วนสามัญที่มิใช่นิติบุคคล = ต่อหุ้นส่วนคนละเท่ากัน แต่ไม่เกินเพดาน
export function calculatePersonalDeduction(
  formType: "90" | "94",
  taxpayerStatus: TaxpayerStatus,
  partnerCount: number
): number {
  const perPersonAmount = formType === "94" ? 30_000 : 60_000
  const cap = formType === "94" ? 60_000 : 120_000

  if (taxpayerStatus === "individual") return perPersonAmount

  const partners = Math.max(1, Math.floor(partnerCount || 1))
  return Math.min(perPersonAmount * partners, cap)
}

export interface PitBreakdownInput {
  form: "PND90" | "PND94"
  incomeA: number
  /** ค่าน้ำไฟ/บริการส่วนกลาง 40(8) — ฐานที่มีสิทธิหักเหมา/ตามจริงตาม expenseB */
  incomeB: number
  /** รายได้อื่น 40(8) (ค่าปรับ/ริบเงินประกัน) — ไม่มีสิทธิหักเหมาเลยตามกฎหมาย บวกเข้าไปเต็มจำนวนหลังหักค่าใช้จ่ายของ B แล้ว
   *  (ตรงกับ computePnd90Values/computePnd94Values เดิมที่ other408 ไม่ถูกหักอะไรเลย) */
  incomeOther?: number
  expenseA: { mode: "lump" | "actual"; lumpRate: number; actualAmount?: number }
  expenseB: { mode: "lump" | "actual"; lumpRate: number; actualAmount?: number }
  /** โหมดระมัดระวัง — จำกัดยอดหักตามจริงไม่ให้เกินรายได้ของตะกร้านั้น (ค่าเริ่มต้น false = หักข้ามตะกร้าได้ ตรงกับแนวทางยื่นจริง) */
  capExpensePerBucket: boolean
  taxpayerType: "individual" | "partnership"
  partnerCount: number
  otherDeductions: number
  withholdingTax?: number
  pnd94Paid?: number
}

/**
 * คำนวณผลภาษีเงินได้เต็มชุด (สำหรับ PitBreakdown) — engine เดียวที่ใช้ยื่นจริง ห้ามใช้ lib/tax/pit.ts
 * (computeIncomeTax) แทน เพื่อให้ตัวเลขบนจอตรงกับ PDF ที่ดาวน์โหลดเป๊ะ
 *
 * เป็นการคำนวณคณิตศาสตร์ล้วน ไม่แตะ database — เรียกตรงจาก client component ได้เลยโดยไม่ต้องผ่าน Server Action
 */
export function computePitBreakdown(input: PitBreakdownInput): IncomeTaxResult {
  const clamp0 = (n: number) => (n > 0 ? n : 0)
  const r2 = (n: number) => Math.round(n * 100) / 100

  const incomeA = clamp0(input.incomeA)
  const incomeBBase = clamp0(input.incomeB)
  const incomeOther = clamp0(input.incomeOther || 0)
  const grossAssessable = r2(incomeA + incomeBBase + incomeOther)

  const dedFor = (income: number, cfg: { mode: "lump" | "actual"; lumpRate: number; actualAmount?: number }) => {
    const requested = cfg.mode === "actual" ? clamp0(cfg.actualAmount || 0) : r2(income * cfg.lumpRate)
    const exceedsIncome = requested > income
    const deduction = r2(capActualExpenseDeduction(cfg.mode, requested, income, input.capExpensePerBucket))
    const capped = deduction < requested
    return { mode: cfg.mode, rate: cfg.mode === "lump" ? cfg.lumpRate : null, requested, deduction, capped, exceedsIncome, income, afterExpense: r2(income - deduction) }
  }

  const dedA = dedFor(incomeA, input.expenseA)
  const dedBUtil = dedFor(incomeBBase, input.expenseB)
  // รวมรายได้ "อื่น" (ไม่มีสิทธิหักเหมา) เข้ากับตะกร้า B เพื่อแสดงผลรวม — afterExpense ของส่วนนี้ไม่ถูกหักเลย
  const dedB = {
    ...dedBUtil,
    income: r2(dedBUtil.income + incomeOther),
    afterExpense: r2(dedBUtil.afterExpense + incomeOther),
  }
  const afterExpense = r2(dedA.afterExpense + dedB.afterExpense)

  const personalAllowance = calculatePersonalDeduction(
    input.form === "PND94" ? "94" : "90",
    input.taxpayerType === "partnership" ? "partnership" : "individual",
    input.partnerCount
  )
  const otherDeductions = clamp0(input.otherDeductions)
  const deductionsRequested = r2(personalAllowance + otherDeductions)
  const deductionsApplied = r2(clamp0(Math.min(deductionsRequested, afterExpense)))
  const netIncome = r2(clamp0(afterExpense - deductionsApplied))

  const progressiveTax = calculateProgressiveTax(netIncome)
  const minTaxAmount = calculateMinimumTax(grossAssessable)
  const taxBeforeCredits = calculateFinalTaxDue(progressiveTax, minTaxAmount)

  const withholdingTax = clamp0(input.withholdingTax || 0)
  const pnd94Paid = input.form === "PND90" ? clamp0(input.pnd94Paid || 0) : 0
  const creditsTotal = r2(withholdingTax + pnd94Paid)
  const balance = r2(taxBeforeCredits - creditsTotal)

  // ขั้นบันไดแบบละเอียด (เพื่อแสดงใน ProgressiveBracketTable) — ใช้ bracket มาตรฐานเดียวกับข้างบน
  // (ตัวเลขคงที่ตามกฎหมาย ไม่ใช่ settings ที่ปรับได้ จึงไม่มีทางต่างจาก calculateProgressiveTax ข้างบน)
  let lower = 0
  const steps: Array<{ from: number; to: number; rate: number; amount: number; tax: number }> = []
  for (const b of TAX_BRACKETS) {
    if (netIncome <= lower) break
    const slice = Math.min(netIncome, b.upTo) - lower
    const stepTax = r2(slice * b.rate)
    steps.push({ from: lower, to: b.upTo, rate: b.rate, amount: r2(slice), tax: stepTax })
    lower = b.upTo
  }

  const minThreshold = input.form === "PND94" ? 60_000 : 120_000
  const minApplies = grossAssessable >= minThreshold && minTaxAmount > 5_000 && minTaxAmount > progressiveTax

  return {
    form: input.form,
    taxpayerType: input.taxpayerType,
    income: { a: incomeA, b: r2(incomeBBase + incomeOther), gross: grossAssessable },
    expense: { a: dedA, b: dedB, total: r2(dedA.deduction + dedB.deduction) },
    crossBucketDeduction: {
      triggered: dedA.exceedsIncome || dedB.exceedsIncome,
      buckets: ([dedA.exceedsIncome && "A", dedB.exceedsIncome && "B"] as const).filter((b): b is Bucket => b !== false),
      capExpensePerBucket: input.capExpensePerBucket,
    },
    afterExpense,
    deductions: { personalAllowance, other: otherDeductions, requested: deductionsRequested, applied: deductionsApplied, capped: deductionsRequested > afterExpense },
    netIncome,
    progressive: { netIncome, tax: progressiveTax, steps },
    minTax: { enabled: true, rate: 0.005, threshold: minThreshold, amount: minTaxAmount, applies: minApplies, exempted: minTaxAmount > 0 && minTaxAmount <= 5_000 },
    taxBeforeCredits,
    credits: { withholdingTax, pnd94Paid, total: creditsTotal },
    balance,
    payable: clamp0(balance),
    refundable: clamp0(-balance),
    status: balance > 0 ? "pay" : balance < 0 ? "refund" : "zero",
  }
}