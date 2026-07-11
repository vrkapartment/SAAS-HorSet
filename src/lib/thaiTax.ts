// ยูทิลิตี้คำนวณภาษีเงินได้บุคคลธรรมดาแบบขั้นบันได (ใช้ร่วมกันระหว่าง ภ.ง.ด. 90 และ ภ.ง.ด. 94)
// หมายเหตุ: เป็นข้อมูลอ้างอิงเบื้องต้นเท่านั้น ผู้ใช้งานต้องตรวจสอบความถูกต้องก่อนยื่นแบบจริงเสมอ

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