import { describe, expect, it } from "vitest"
import { resolveBillPenalty } from "../utils"

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
