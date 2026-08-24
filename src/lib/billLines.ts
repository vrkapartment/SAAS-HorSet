/**
 * ตัดสินว่า "แต่ละบรรทัดบนใบแจ้งหนี้จะพิมพ์เลขอะไร"
 *
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะเดิมตรรกะนี้ฝังอยู่กลาง generateBillPdf ซึ่งวาดลง PDF
 * ไปเลย — ทดสอบไม่ได้ ต้องเปิดไฟล์ดูด้วยตาเท่านั้น และนั่นคือเหตุที่บั๊ก "ค่าเช่าบนใบไม่ใช่
 * ค่าเช่าจริงของห้อง" อยู่ในระบบมานานโดยไม่มีใครจับได้
 *
 * ตอนนี้ pdfHelper เรียกฟังก์ชันนี้แล้ววาดตามผลลัพธ์ เทสต์เรียกฟังก์ชันเดียวกันแล้วตรวจตัวเลข
 * → ตัวเลขบนใบจริงกับตัวเลขที่เทสต์ตรวจ มาจากที่เดียวกันเสมอ
 */

export type BillLineInput = {
  /** true = ตัวเลขที่ส่งมาเป็น snapshot ที่บันทึกไว้ในบิลจริง ให้ใช้ตามนั้นตรง ๆ */
  hasSnapshot?: boolean
  /** ยอดรวมที่เก็บไว้ในบิล (รวม VAT และค่าปรับแล้ว) */
  amount: number
  baseRent: number
  electricUnits: number
  electricRate: number
  waterUnits: number
  waterRate: number
  commonFee?: number
  penaltyAmount?: number
  otherServiceAmount?: number
  vatAmount?: number
  extraExpenses?: { name?: string; amount?: number }[]
  /** จาก snapshot (ใช้เมื่อ hasSnapshot) */
  electricAmount?: number
  waterAmount?: number
  elecMinApplied?: boolean
  waterMinApplied?: boolean
  /** การตั้งค่าขั้นต่ำ — ใช้กับบิลเก่าที่ไม่มี snapshot */
  waterMinChecked?: boolean
  waterMinUnit?: number
  electricMinChecked?: boolean
  electricMinUnit?: number
  waiveElectricMin?: boolean
  waiveWaterMin?: boolean
}

export type BillLines = {
  /** ค่าเช่าที่จะพิมพ์ */
  rent: number
  elecAmount: number
  waterAmount: number
  /** true = พิมพ์ป้าย "ขั้นต่ำ N หน่วย" และคอลัมน์อัตราแสดง "-" */
  elecIsMin: boolean
  waterIsMin: boolean
  /** จำนวนหน่วยขั้นต่ำที่จะเติมในข้อความป้าย */
  elecMinUnit: number
  waterMinUnit: number
  commonFee: number
  penaltyAmount: number
  otherServiceAmount: number
  vatAmount: number
  extraExpensesSum: number
  /** ข้อความหัวบรรทัดค่าไฟ/ค่าน้ำ — เปลี่ยนตามว่าคิดขั้นต่ำหรือไม่ */
  elecDesc: string
  waterDesc: string
  /** ข้อความในคอลัมน์ "อัตราหน่วยละ" — ใบที่คิดขั้นต่ำแสดง "-" เพราะอัตราต่อหน่วยไม่มีความหมาย */
  elecRateDisplay: string
  waterRateDisplay: string
  /** ผลบวกทุกบรรทัด — ต้องเท่า amount ที่เก็บไว้ ไม่งั้นใบอธิบายที่มาของยอดไม่ได้ */
  lineSum: number
}

export function resolveBillLines(data: BillLineInput): BillLines {
  const commonFee = data.commonFee !== undefined ? data.commonFee : 50
  const waterMinChecked = data.waterMinChecked !== undefined ? data.waterMinChecked : true
  const waterMinUnit = data.waterMinUnit !== undefined ? data.waterMinUnit : 3
  const electricMinChecked = data.electricMinChecked !== undefined ? data.electricMinChecked : true
  const electricMinUnit = data.electricMinUnit !== undefined ? data.electricMinUnit : 10

  // ใบที่มี snapshot: ใช้ผลลัพธ์ที่บันทึกไว้ตอนออกบิล ห้ามคิดใหม่จากการตั้งค่าปัจจุบัน
  // ไม่งั้นเปลี่ยนการตั้งค่าขั้นต่ำแล้วใบเดิมจะได้ "ยอดถูกแต่ป้ายผิด"
  const elecIsMin = data.hasSnapshot && data.elecMinApplied !== undefined
    ? !!data.elecMinApplied
    : (!data.waiveElectricMin && electricMinChecked && data.electricUnits <= electricMinUnit)
  const waterIsMin = data.hasSnapshot && data.waterMinApplied !== undefined
    ? !!data.waterMinApplied
    : (!data.waiveWaterMin && waterMinChecked && data.waterUnits <= waterMinUnit)

  // ใบที่มี snapshot: ใช้ยอดที่บันทึกไว้ตรง ๆ (คิดขั้นต่ำไว้แล้วตั้งแต่ตอนออกบิล)
  const elecAmount = data.hasSnapshot && data.electricAmount !== undefined
    ? Number(data.electricAmount || 0)
    : (elecIsMin ? (electricMinUnit * data.electricRate) : data.electricUnits * data.electricRate)
  const waterAmount = data.hasSnapshot && data.waterAmount !== undefined
    ? Number(data.waterAmount || 0)
    : (waterIsMin ? (waterMinUnit * data.waterRate) : data.waterUnits * data.waterRate)

  const penaltyAmount = data.penaltyAmount !== undefined ? Number(data.penaltyAmount || 0) : 0
  const otherServiceAmount = data.otherServiceAmount !== undefined ? Number(data.otherServiceAmount || 0) : 0
  const vatAmount = data.vatAmount !== undefined ? Number(data.vatAmount || 0) : 0
  const extraExpensesSum = (data.extraExpenses || []).reduce((acc, c) => acc + Number(c.amount || 0), 0)

  // ค่าเช่าที่จะพิมพ์
  //
  // มี snapshot  → ใช้ค่าเช่าที่บันทึกไว้ตรง ๆ (ตัวเลขที่คิดเงินไปจริง)
  // ไม่มี         → คำนวณย้อนจากยอดรวม เพื่อบังคับให้ทุกบรรทัดบวกกันได้เท่า amount พอดี
  //
  // ⚠️ วิธีคำนวณย้อนทำให้บรรทัดค่าเช่ากลายเป็น "เศษที่เหลือ" ไม่ใช่ค่าเช่าจริง ทันทีที่
  // องค์ประกอบอื่นไม่ตรงกับตอนออกบิล จึงคงไว้เฉพาะบิลเก่าที่ไม่มีข้อมูลให้ใช้แล้วจริง ๆ
  const rent = data.hasSnapshot
    ? Math.max(0, Number(data.baseRent || 0))
    : Math.max(0, data.amount - elecAmount - waterAmount - commonFee
        - penaltyAmount - otherServiceAmount - extraExpensesSum - vatAmount)

  return {
    rent,
    elecAmount,
    waterAmount,
    elecDesc: elecIsMin
      ? `2. ค่าไฟฟ้า (ขั้นต่ำ ${electricMinUnit} หน่วย)`
      : "2. ค่าไฟฟ้า (Electricity Bill)",
    waterDesc: waterIsMin
      ? `3. ค่าน้ำประปา (ขั้นต่ำ ${waterMinUnit} หน่วย)`
      : "3. ค่าน้ำประปา (Water Bill)",
    elecRateDisplay: elecIsMin ? "-" : data.electricRate.toLocaleString(),
    waterRateDisplay: waterIsMin ? "-" : data.waterRate.toLocaleString(),
    elecIsMin,
    waterIsMin,
    elecMinUnit: electricMinUnit,
    waterMinUnit,
    commonFee,
    penaltyAmount,
    otherServiceAmount,
    vatAmount,
    extraExpensesSum,
    lineSum: rent + elecAmount + waterAmount + commonFee
      + penaltyAmount + otherServiceAmount + extraExpensesSum + vatAmount
  }
}
