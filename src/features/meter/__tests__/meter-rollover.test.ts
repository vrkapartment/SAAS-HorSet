import { describe, expect, it } from "vitest"
import { meterUnitsUsed, isPlausibleRollover, METER_ROLLOVER_BASE } from "@/features/meter/utils"

/**
 * มิเตอร์หมุนครบรอบ (9,999 → 0,000)
 *
 * ถ้าคิดผิด ผู้เช่าจะถูกเก็บ 0 หน่วยในเดือนที่มิเตอร์ข้ามรอบ (เก็บขาดทั้งเดือน)
 * หรือถูกเก็บเกือบหมื่นหน่วย (เก็บเกินมหาศาล) — ทั้งสองแบบไม่มี error ให้เห็น
 */

describe("meterUnitsUsed", () => {
  it("อ่านปกติ (เลขใหม่มากกว่าเลขเดิม) นับตรง ๆ", () => {
    expect(meterUnitsUsed(2053, 2033)).toBe(20)
    expect(meterUnitsUsed(100, 100)).toBe(0)
  })

  it("มิเตอร์หมุนครบรอบ ต้องนับต่อจากฐาน ไม่ใช่ได้ 0 หรือติดลบ", () => {
    // 9,950 → 30 คือใช้ไป 50 หน่วยก่อนวน + อีก 30 หน่วยหลังวน = 80
    expect(meterUnitsUsed(30, 9950)).toBe(80)
    expect(meterUnitsUsed(6, 9994)).toBe(12)
    expect(meterUnitsUsed(0, 9999)).toBe(1)
  })

  it("ฐานต้องเป็น 10000 ตรงกับที่ทั้งระบบใช้อยู่ — เปลี่ยนแล้วบิลเก่าอธิบายยอดตัวเองไม่ได้", () => {
    expect(METER_ROLLOVER_BASE).toBe(10000)
  })

  it("ค่าที่ไม่ใช่ตัวเลข ต้องได้ 0 ไม่ใช่ NaN — NaN จะทำให้ยอดรวมทั้งใบเป็น NaN", () => {
    expect(meterUnitsUsed(Number("ไม่ใช่ตัวเลข"), 100)).toBe(0)
    expect(meterUnitsUsed(100, Number.NaN)).toBe(0)
  })
})

describe("isPlausibleRollover", () => {
  it("เลขใหม่ต่ำกว่าเลขเดิมและอยู่ในช่วงมิเตอร์ ถือว่าอธิบายด้วยการหมุนครบรอบได้", () => {
    expect(isPlausibleRollover(30, 9950)).toBe(true)
    expect(isPlausibleRollover(0, 1)).toBe(true)
  })

  it("เลขใหม่ไม่ได้ต่ำกว่าเลขเดิม ไม่ใช่การหมุนครบรอบ", () => {
    expect(isPlausibleRollover(9950, 30)).toBe(false)
    expect(isPlausibleRollover(100, 100)).toBe(false)
  })

  it("เลขที่เป็นไปไม่ได้ต้องปฏิเสธ ไม่ให้ติ๊กยืนยันแล้วได้หน่วยที่อธิบายไม่ได้", () => {
    expect(isPlausibleRollover(-5, 100)).toBe(false)
    expect(isPlausibleRollover(30, 10000)).toBe(false)
    expect(isPlausibleRollover(10001, 20000)).toBe(false)
  })
})
