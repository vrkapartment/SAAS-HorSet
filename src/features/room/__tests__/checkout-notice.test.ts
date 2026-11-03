import { describe, expect, it } from "vitest"
import { isCheckoutNoticeCycle } from "@/features/room/utils"

describe("isCheckoutNoticeCycle", () => {
  const room = { status: "Pending_Refund", checkoutDate: "2026-10-20" }

  it("รอบก่อนแจ้งย้ายออก → ไม่ขึ้นแถบ ดู/จดมิเตอร์ได้ตามปกติ", () => {
    expect(isCheckoutNoticeCycle(room, "2026-09")).toBe(false)
    expect(isCheckoutNoticeCycle(room, "2025-12")).toBe(false)
  })

  it("รอบที่แจ้งย้ายออกและหลังจากนั้น → ขึ้นแถบ", () => {
    expect(isCheckoutNoticeCycle(room, "2026-10")).toBe(true)
    expect(isCheckoutNoticeCycle(room, "2026-11")).toBe(true)
  })

  it("ห้องที่ไม่ได้แจ้งย้ายออก → ไม่ขึ้นแถบ", () => {
    expect(isCheckoutNoticeCycle({ status: "occupied", checkoutDate: null }, "2026-10")).toBe(false)
  })

  it("ไม่มีวันย้ายออก (ข้อมูลเก่า) → ขึ้นทุกรอบเหมือนเดิม", () => {
    expect(isCheckoutNoticeCycle({ status: "Pending_Refund", checkoutDate: null }, "2026-01")).toBe(true)
  })
})
