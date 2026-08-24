import { describe, expect, it } from "vitest"
import { resolveBillLines, type BillLineInput } from "@/lib/billLines"

/**
 * ตัวเลขที่พิมพ์บนใบแจ้งหนี้ (ใช้ร่วมกันทั้ง PDF และหน้า Portal)
 *
 * เดิมตรรกะนี้ฝังกลาง generateBillPdf ซึ่งวาดลง PDF ไปเลย ทดสอบไม่ได้ — เป็นเหตุที่บั๊ก
 * "ค่าเช่าบนใบไม่ใช่ค่าเช่าจริงของห้อง" อยู่ในระบบมานานโดยไม่มีใครจับได้
 */

/** ใบที่ออกตอนยังไม่กรอกมิเตอร์ไฟ (คิดขั้นต่ำ 10 หน่วย × 7 = 70) — เคสที่ QA เจอจริง */
const snapshotBill: BillLineInput = {
  hasSnapshot: true,
  amount: 6246,
  baseRent: 6000,
  electricUnits: 0,
  electricRate: 7,
  electricAmount: 70,
  elecMinApplied: true,
  electricMinUnit: 10,
  waterUnits: 7,
  waterRate: 18,
  waterAmount: 126,
  waterMinApplied: false,
  waterMinUnit: 3,
  commonFee: 50
}

describe("ใบที่มี snapshot", () => {
  it("ค่าเช่าต้องเป็นค่าเช่าจริงของห้อง ไม่ใช่เศษที่เหลือจากยอดรวม", () => {
    expect(resolveBillLines(snapshotBill).rent).toBe(6000)
  })

  it("รายการย่อยต้องบวกกันได้เท่ายอดรวมที่เก็บไว้", () => {
    const lines = resolveBillLines(snapshotBill)
    expect(lines.lineSum).toBe(6246)
    expect(lines.lineSum).toBe(snapshotBill.amount)
  })

  it("ค่าไฟใช้ยอดที่บันทึกไว้ ไม่คำนวณจากหน่วย × อัตราใหม่", () => {
    const lines = resolveBillLines(snapshotBill)
    expect(lines.elecAmount).toBe(70)     // ไม่ใช่ 0 × 7 = 0
    expect(lines.elecIsMin).toBe(true)
  })

  it("แก้มิเตอร์หลังออกบิลแล้วไม่ออกบิลใหม่ — ค่าเช่าต้องไม่เพี้ยน (อาการที่ QA เจอ)", () => {
    // หน่วยไฟถูกอัปเดตเป็น 73 แต่ยอดรวมกับ snapshot ยังเป็นของเดิม
    const lines = resolveBillLines({ ...snapshotBill, electricUnits: 73 })
    expect(lines.rent).toBe(6000)         // เดิมได้ 5,559 (เศษที่เหลือ)
    expect(lines.elecAmount).toBe(70)     // ยอดที่คิดเงินไปจริง
  })

  it("เปลี่ยนการตั้งค่าขั้นต่ำหลังออกบิล — ป้ายต้องไม่เพี้ยน", () => {
    // ปิดการคิดขั้นต่ำใน settings ทีหลัง แต่ใบเดิมคิดขั้นต่ำไปแล้ว
    const lines = resolveBillLines({ ...snapshotBill, electricMinChecked: false })
    expect(lines.elecIsMin).toBe(true)    // ยังต้องขึ้นป้ายขั้นต่ำ
    expect(lines.elecAmount).toBe(70)
  })

  it("ห้องที่ยกเว้นขั้นต่ำ — ไม่ขึ้นป้ายขั้นต่ำ", () => {
    const lines = resolveBillLines({
      ...snapshotBill, elecMinApplied: false, electricAmount: 0, amount: 6176
    })
    expect(lines.elecIsMin).toBe(false)
    expect(lines.elecAmount).toBe(0)
    expect(lines.lineSum).toBe(6176)
  })

  it("บิลปิดรอบย้ายห้อง — ค่าเช่าเป็นยอด prorate ไม่ใช่เต็มเดือน", () => {
    const lines = resolveBillLines({
      hasSnapshot: true, amount: 3176, baseRent: 3000,
      electricUnits: 0, electricRate: 7, electricAmount: 70,
      elecMinApplied: true, electricMinUnit: 10,
      waterUnits: 0, waterRate: 18, waterAmount: 56,
      waterMinApplied: true, waterMinUnit: 3,
      commonFee: 50
    })
    expect(lines.rent).toBe(3000)
    expect(lines.lineSum).toBe(3176)
  })

  it("มีค่าปรับ ค่าบริการอื่น ค่าใช้จ่ายเสริม และ VAT — ต้องยังบวกได้เท่ายอดรวม", () => {
    const lines = resolveBillLines({
      ...snapshotBill,
      penaltyAmount: 200, otherServiceAmount: 300,
      extraExpenses: [{ name: "ค่าล้างแอร์", amount: 500 }],
      vatAmount: 70,
      amount: 6246 + 200 + 300 + 500 + 70
    })
    expect(lines.rent).toBe(6000)
    expect(lines.lineSum).toBe(7316)
  })
})

describe("บิลเก่าที่ไม่มี snapshot — ต้องแสดงผลเหมือนเดิมทุกอย่าง", () => {
  const legacy: BillLineInput = {
    amount: 6246,
    baseRent: 6000,
    electricUnits: 73, electricRate: 7,
    waterUnits: 7, waterRate: 18,
    commonFee: 50,
    electricMinChecked: true, electricMinUnit: 10,
    waterMinChecked: true, waterMinUnit: 3
  }

  it("ยังคำนวณค่าเช่าย้อนจากยอดรวมแบบเดิม (พฤติกรรมเดิมเป๊ะ)", () => {
    const lines = resolveBillLines(legacy)
    expect(lines.elecAmount).toBe(511)   // 73 × 7
    expect(lines.rent).toBe(5559)        // 6246 - 511 - 126 - 50
    expect(lines.lineSum).toBe(6246)
  })

  it("ยังตัดสินขั้นต่ำจากการตั้งค่าปัจจุบันแบบเดิม", () => {
    const lines = resolveBillLines({ ...legacy, electricUnits: 3 })
    expect(lines.elecIsMin).toBe(true)
    expect(lines.elecAmount).toBe(70)    // 10 หน่วยขั้นต่ำ × 7
  })

  it("ค่าเช่าติดลบไม่ได้ (ยอดรวมน้อยกว่าค่าน้ำไฟ)", () => {
    const lines = resolveBillLines({ ...legacy, amount: 100 })
    expect(lines.rent).toBe(0)
  })
})

describe("ข้อความป้ายและคอลัมน์อัตรา (คำอธิบายบนใบ)", () => {
  it("คิดขั้นต่ำ → ป้ายบอกจำนวนหน่วยขั้นต่ำ และคอลัมน์อัตราแสดง '-'", () => {
    const lines = resolveBillLines(snapshotBill)
    expect(lines.elecDesc).toBe("2. ค่าไฟฟ้า (ขั้นต่ำ 10 หน่วย)")
    expect(lines.elecRateDisplay).toBe("-")
  })

  it("ไม่คิดขั้นต่ำ → ป้ายปกติ และคอลัมน์อัตราแสดงอัตราจริง", () => {
    const lines = resolveBillLines(snapshotBill)
    expect(lines.waterDesc).toBe("3. ค่าน้ำประปา (Water Bill)")
    expect(lines.waterRateDisplay).toBe("18")
  })

  it("ป้ายต้องใช้จำนวนหน่วยขั้นต่ำที่บันทึกไว้ ไม่ใช่ค่าปัจจุบัน", () => {
    // ใบเดิมคิดขั้นต่ำ 10 หน่วย แต่ตอนนี้ตั้งค่าเป็น 20 หน่วยแล้ว
    const lines = resolveBillLines({ ...snapshotBill, electricMinUnit: 10 })
    expect(lines.elecDesc).toContain("10 หน่วย")
    expect(lines.elecDesc).not.toContain("20 หน่วย")
  })
})

describe("ค่าเช่าต้องมาจาก snapshot ไม่ใช่การคำนวณย้อนจากยอดรวม", () => {
  /**
   * เคสนี้แยกสองวิธีคิดออกจากกันได้จริง — ต่างจากเคสอื่นในไฟล์นี้
   *
   * เมื่อบิล "สมดุลในตัวเอง" (ยอดรวม = ผลบวกองค์ประกอบ) การคำนวณย้อนกับการอ่าน snapshot
   * ให้ค่าเช่าเท่ากันพอดี เทสต์ที่ใช้บิลสมดุลจึงไม่มีทางจับได้ว่าโค้ดใช้วิธีไหน
   *
   * เคสนี้จงใจให้ไม่สมดุล: ยอดรวมเป็นของตอนที่คิดค่าไฟขั้นต่ำ 70 แต่ช่อง electric_amount
   * ถูกอัปเดตเป็น 511 แล้ว (สภาพที่เกิดได้เมื่อมีการแก้ข้อมูลบางส่วน)
   *   · อ่านจาก snapshot   → ค่าเช่า 6,000  (ถูก — เป็นค่าเช่าจริงของห้อง)
   *   · คำนวณย้อนจากยอดรวม → ค่าเช่า 5,559  (คือตัวเลขที่ QA เจอบนใบจริง)
   */
  const inconsistent: BillLineInput = {
    hasSnapshot: true,
    amount: 6246,          // ยอดรวมจากตอนที่ค่าไฟเป็นขั้นต่ำ 70
    baseRent: 6000,
    electricUnits: 73, electricRate: 7, electricAmount: 511,
    waterUnits: 7, waterRate: 18, waterAmount: 126,
    commonFee: 50
  }

  it("ค่าเช่าต้องเป็น 6,000 จาก snapshot ไม่ใช่ 5,559 จากการคำนวณย้อน", () => {
    expect(resolveBillLines(inconsistent).rent).toBe(6000)
  })

  it("บิลเก่าที่ไม่มี snapshot ยังคำนวณย้อนเหมือนเดิม (ได้ 5,559)", () => {
    // บิลเก่าไม่มีคอลัมน์ snapshot เลย จึงไม่มี hasSnapshot/electricAmount/waterAmount
    const legacy: BillLineInput = {
      amount: 6246, baseRent: 6000,
      electricUnits: 73, electricRate: 7,
      waterUnits: 7, waterRate: 18,
      commonFee: 50
    }
    expect(resolveBillLines(legacy).rent).toBe(5559)
  })
})
