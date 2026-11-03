import { describe, expect, it } from "vitest"
import {
  buildSettlementDocument,
  parseCheckoutSettlement,
  type SettlementContract
} from "@/features/tenant/checkout-settlement"

/** ห้อง 121 จริง: ยกเว้นค่าเช่า, ค่าน้ำ-ไฟ 575, ค่าดำเนินการ 500, เงินประกัน 3,000 คืน 1,925 */
const room121: SettlementContract = {
  roomNumber: "121",
  tenantName: "สมชาย มิลละออ",
  cancellationDate: "2026-10-31",
  depositAmount: 3000,
  actualRefund: 1925,
  forfeitedAmount: 1075,
  deductedRent405: 0,
  deductedUtilities408: 575,
  deductedServices408: 500,
  closingElecPrev: 3444,
  closingElecCurr: 3501,
  closingWaterPrev: 1231,
  closingWaterCurr: 1238,
  settlement: parseCheckoutSettlement({
    version: 1,
    rent: { waived: true, label: "ยกเว้นค่าเช่าพัก", amount: 0 },
    items: [{ name: "ค่าดำเนินการ", amount: 500 }]
  })
}

describe("buildSettlementDocument", () => {
  it("ห้อง 121: ค่าเช่าขึ้นข้อความยกเว้น, ค่าน้ำ-ไฟรวมพร้อมช่วงมิเตอร์, รายการ \"ค่าดำเนินการ\"", () => {
    const doc = buildSettlementDocument(room121)
    expect(doc.lines).toEqual([
      { label: "ค่าเช่าห้อง", detail: "ยกเว้นค่าเช่าพัก", amount: 0 },
      { label: "ค่าน้ำ-ค่าไฟ", detail: "ไฟ มิเตอร์ 3,444 → 3,501 (57 หน่วย) · น้ำ มิเตอร์ 1,231 → 1,238 (7 หน่วย)", amount: 575 },
      { label: "ค่าดำเนินการ", amount: 500 }
    ])
    expect(doc.totalDeductions).toBe(1075)
    expect(doc.refund).toBe(1925)
    expect(doc.breachNote).toBeNull()
  })

  it("ย้ายออกครั้งใหม่: แจกแจงค่าไฟ/ค่าน้ำแยก และจำนวนวันที่อยู่", () => {
    const doc = buildSettlementDocument({
      ...room121,
      deductedRent405: 265,
      deductedUtilities408: 525,
      deductedServices408: 500,
      actualRefund: 1710,
      forfeitedAmount: 1290,
      settlement: parseCheckoutSettlement({
        version: 1,
        rent: { waived: false, policy: "DAILY_PRORATE", baseRent: 2650, daysStayed: 3, amount: 265 },
        utilities: { elec: { units: 57, rate: 7, amount: 399 }, water: { units: 7, rate: 18, amount: 126 } },
        items: [{ name: "ค่าล้างแอร์", amount: 500 }]
      })
    })
    expect(doc.lines.map(l => [l.label, l.amount])).toEqual([
      ["ค่าเช่าห้อง", 265], ["ค่าไฟฟ้า", 399], ["ค่าน้ำประปา", 126], ["ค่าล้างแอร์", 500]
    ])
    expect(doc.lines[0].detail).toBe("อยู่จริง 3 วัน (คิดเฉลี่ยรายวัน)")
  })

  it("รายการใน settlement ไม่ตรงยอดจริง (แก้ประวัติย้อนหลัง) → ใช้ยอดรวมจากคอลัมน์", () => {
    const doc = buildSettlementDocument({ ...room121, deductedServices408: 800 })
    expect(doc.lines[2]).toEqual({ label: "ค่าบริการและค่าเสียหายอื่น ๆ", amount: 800 })
  })

  it("ไม่มี settlement (ประวัติเก่า) → ยอดรวมแต่ละหมวด", () => {
    const doc = buildSettlementDocument({ ...room121, settlement: null })
    expect(doc.lines.map(l => l.label)).toEqual(["ค่าเช่าห้อง", "ค่าน้ำ-ค่าไฟ", "ค่าบริการและค่าเสียหายอื่น ๆ"])
  })

  it("ริบเงินประกันมากกว่ารายการหัก (ออกก่อนครบสัญญา) → มีหมายเหตุ", () => {
    const doc = buildSettlementDocument({ ...room121, actualRefund: 0, forfeitedAmount: 3000 })
    expect(doc.breachNote).not.toBeNull()
  })
})

describe("parseCheckoutSettlement", () => {
  it("รูปแบบไม่รู้จัก → null", () => {
    expect(parseCheckoutSettlement(null)).toBeNull()
    expect(parseCheckoutSettlement({ version: 2 })).toBeNull()
  })

  it("ตัดรายการไม่มีชื่อหรือยอด 0 ออก", () => {
    const s = parseCheckoutSettlement({ version: 1, rent: { waived: false, amount: 0 }, items: [{ name: "", amount: 100 }, { name: "ค่าทำความสะอาด", amount: 0 }] })
    expect(s?.items).toEqual([])
  })
})
