import { describe, expect, it } from "vitest"
import { hasBillSnapshot, readBillSnapshot, resolveBillPenalty } from "../utils"

/**
 * กฎค่าปรับล่าช้าที่ผู้เช่าเห็นในหน้า Portal
 *
 * ทั้งไฟล์นี้คุมยอดเงินที่เรียกเก็บจากผู้เช่าจริง ถ้าพลาดคือเก็บเงินผิดจำนวน
 * ดูที่มาของแต่ละกฎใน resolveBillPenalty (features/billing/utils.ts)
 */

const base = {
  savedLateDays: null,
  billAmount: 5000,
  billingCycle: "2020-01", // รอบเก่ามาก → เลยกำหนดแน่นอน ไม่ผูกกับวันที่รันเทสต์
  billStatus: "unpaid",
  latePenaltyRate: 20
}

describe("resolveBillPenalty — บิลที่ยังไม่มีใครตั้งค่าปรับ (null)", () => {
  it("คำนวณสดแล้วบวกเข้ายอด", () => {
    const r = resolveBillPenalty({ ...base, savedPenaltyAmount: null })
    expect(r.penaltyAmount).toBeGreaterThan(0)
    expect(r.lateDays).toBeGreaterThan(0)
    expect(r.amount).toBe(5000 + r.penaltyAmount!)
  })

  it("อัตราค่าปรับเป็น 0 → ไม่มีค่าปรับ ยอดไม่เปลี่ยน", () => {
    const r = resolveBillPenalty({ ...base, savedPenaltyAmount: null, latePenaltyRate: 0 })
    expect(r.penaltyAmount).toBe(0)
    expect(r.amount).toBe(5000)
  })

  it("บิลที่ยังไม่เลยกำหนด → ไม่มีค่าปรับ", () => {
    const r = resolveBillPenalty({ ...base, savedPenaltyAmount: null, billingCycle: "2999-01" })
    expect(r.lateDays).toBe(0)
    expect(r.penaltyAmount).toBe(0)
    expect(r.amount).toBe(5000)
  })

  it("บิลที่จ่ายแล้ว ห้ามงอกค่าปรับขึ้นมาเอง", () => {
    const r = resolveBillPenalty({ ...base, savedPenaltyAmount: null, billStatus: "paid" })
    expect(r.penaltyAmount).toBeNull()
    expect(r.amount).toBe(5000)
  })
})

describe("resolveBillPenalty — บิลที่แอดมินบันทึกค่าปรับไว้แล้ว", () => {
  it("ใช้ค่าที่บันทึกไว้ ไม่คำนวณทับ", () => {
    const r = resolveBillPenalty({ ...base, savedPenaltyAmount: 500, savedLateDays: 25 })
    expect(r.penaltyAmount).toBe(500)
    expect(r.lateDays).toBe(25)
  })

  it("ห้ามบวกซ้ำ — billAmount มีค่าปรับรวมอยู่แล้ว", () => {
    const r = resolveBillPenalty({ ...base, savedPenaltyAmount: 500, savedLateDays: 25 })
    expect(r.amount).toBe(5000)
  })

  it("บันทึก 0 = ยกเว้นค่าปรับ ต้องหยุดนับถาวรแม้เลยกำหนดไปนาน (แบบ A)", () => {
    const r = resolveBillPenalty({ ...base, savedPenaltyAmount: 0 })
    expect(r.penaltyAmount).toBe(0)
    expect(r.amount).toBe(5000)
  })

  it("อาการเดิมที่แก้ไปแล้ว: บิลยังไม่เลยกำหนด ค่าปรับที่ตั้งไว้ต้องไม่หายจากรายการ", () => {
    const r = resolveBillPenalty({ ...base, savedPenaltyAmount: 300, billingCycle: "2999-01" })
    expect(r.penaltyAmount).toBe(300)
    expect(r.amount).toBe(5000)
  })
})

describe("readBillSnapshot / hasBillSnapshot", () => {
  it("บิลเก่าที่ยังไม่มี snapshot → hasBillSnapshot = false (ฝั่งแสดงผลถอยไปพฤติกรรมเดิม)", () => {
    const snap = readBillSnapshot({ amount: 5000, electric_units: 10 })
    expect(hasBillSnapshot(snap)).toBe(false)
    expect(snap.baseRent).toBeNull()
    expect(snap.extraExpenses).toBeNull()
  })

  it("ค่าเช่า 0 ที่ตั้งใจบันทึก ต้องนับว่ามี snapshot (ไม่ใช่ถือว่าไม่มีข้อมูล)", () => {
    const snap = readBillSnapshot({ base_rent: 0 })
    expect(hasBillSnapshot(snap)).toBe(true)
    expect(snap.baseRent).toBe(0)
  })

  it("อ่านค่าครบทุกช่อง และแปลงเป็นตัวเลข", () => {
    const snap = readBillSnapshot({
      base_rent: "6000", electric_amount: "511", water_amount: "126",
      electric_rate: "7", water_rate: "18", common_fee: "50",
      elec_prev: "30", elec_curr: "103", water_prev: "30", water_curr: "37",
      extra_expenses: [{ name: "ค่าล้างแอร์", amount: 500 }]
    })
    expect(hasBillSnapshot(snap)).toBe(true)
    expect(snap.baseRent).toBe(6000)
    expect(snap.electricAmount).toBe(511)
    expect(snap.electricRate).toBe(7)
    expect(snap.elecPrev).toBe(30)
    expect(snap.elecCurr).toBe(103)
    expect(snap.extraExpenses).toEqual([{ name: "ค่าล้างแอร์", amount: 500 }])
  })

  it("รายการย่อยจาก snapshot ต้องบวกกันได้เท่ายอดรวมที่เก็บไว้", () => {
    // เคสที่ QA เจอ: ออกบิลตอนค่าไฟยังเป็นขั้นต่ำ 70 → ยอดรวม 6,246
    const snap = readBillSnapshot({
      base_rent: 6000, electric_amount: 70, water_amount: 126, common_fee: 50
    })
    const sum = (snap.baseRent ?? 0) + (snap.electricAmount ?? 0)
      + (snap.waterAmount ?? 0) + (snap.commonFee ?? 0)
    expect(sum).toBe(6246)
  })

  it("extra_expenses ที่ไม่ใช่ array ต้องกลายเป็น null ไม่ใช่ทำให้พัง", () => {
    expect(readBillSnapshot({ extra_expenses: "ขยะ" }).extraExpenses).toBeNull()
    expect(readBillSnapshot({ extra_expenses: null }).extraExpenses).toBeNull()
  })
})
