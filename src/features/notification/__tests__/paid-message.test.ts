import { describe, expect, it } from "vitest"
import {
  DEFAULT_PAID_MESSAGE_TEMPLATE,
  PAID_MESSAGE_VARIABLES,
  renderPaidMessage,
  resolvePaidMessageTemplate
} from "../paid-message"

/**
 * ข้อความแจ้งผู้เช่าตอนชำระเงินสำเร็จ
 *
 * ตรรกะนี้ถูกใช้ 2 ที่ที่ต้องตรงกันเป๊ะ — พรีวิวในหน้าตั้งค่า กับข้อความที่ส่งจริงทาง LINE
 * ถ้าสองฝั่งเพี้ยนกันเมื่อไหร่ เจ้าหอจะตั้งค่าโดยเห็นสิ่งที่ผู้เช่าไม่ได้เห็น
 */

const values = {
  tenantName: "สมชาย ใจดี",
  workspaceName: "VRK Apartment",
  roomNumber: "134",
  billingCycle: "2026-08",
  amount: 3115,
  paidAt: new Date("2026-09-06T07:32:00.000Z")
}

describe("renderPaidMessage", () => {
  it("แทนค่าตัวแปรทุกตัวที่ประกาศไว้ ไม่เหลือ {{...}} ค้าง", () => {
    const template = PAID_MESSAGE_VARIABLES.map(v => v.token).join("\n")
    const out = renderPaidMessage(template, values)

    expect(out).not.toContain("{{")
    expect(out).toContain("สมชาย ใจดี")
    expect(out).toContain("VRK Apartment")
    expect(out).toContain("134")
    expect(out).toContain("2026-08")
  })

  it("ข้อความต้นแบบต้องแทนค่าได้ครบ ไม่เหลือตัวแปรค้างให้ผู้เช่าเห็น", () => {
    const out = renderPaidMessage(DEFAULT_PAID_MESSAGE_TEMPLATE, values)
    expect(out).not.toContain("{{")
  })

  it("จัดรูปแบบยอดเงินให้มีคอมมา", () => {
    const out = renderPaidMessage("{{AMOUNT}}", { ...values, amount: 1234567 })
    expect(out).toBe("1,234,567")
  })

  it("แทนตัวแปรตัวเดียวกันได้หลายครั้งในข้อความเดียว", () => {
    const out = renderPaidMessage("{{ROOM_NUMBER}} / {{ROOM_NUMBER}}", values)
    expect(out).toBe("134 / 134")
  })

  it("ปล่อยตัวแปรที่ไม่รู้จักไว้ตามเดิม เพื่อให้เห็นในพรีวิวว่าพิมพ์ผิด", () => {
    const out = renderPaidMessage("{{FOO}} {{ROOM_NUMBER}}", values)
    expect(out).toBe("{{FOO}} 134")
  })

  it("ค่าที่ว่างต้องมีข้อความสำรอง ไม่ปล่อยให้ข้อความแหว่ง", () => {
    const out = renderPaidMessage("[{{TENANT_NAME}}][{{ROOM_NUMBER}}]", {
      ...values,
      tenantName: "   ",
      roomNumber: ""
    })
    expect(out).toBe("[ผู้เช่า][-]")
  })
})

describe("resolvePaidMessageTemplate", () => {
  it("ถอยไปใช้ข้อความต้นแบบเมื่อยังไม่ได้ตั้งค่า", () => {
    expect(resolvePaidMessageTemplate(null)).toBe(DEFAULT_PAID_MESSAGE_TEMPLATE)
    expect(resolvePaidMessageTemplate(undefined)).toBe(DEFAULT_PAID_MESSAGE_TEMPLATE)
  })

  it("ข้อความที่มีแต่ช่องว่างถือว่าว่าง — ห้ามส่งข้อความเปล่าให้ผู้เช่า", () => {
    expect(resolvePaidMessageTemplate("   \n  ")).toBe(DEFAULT_PAID_MESSAGE_TEMPLATE)
  })

  it("ใช้ข้อความที่หอพักตั้งไว้เมื่อมีจริง", () => {
    expect(resolvePaidMessageTemplate("ขอบคุณครับ")).toBe("ขอบคุณครับ")
  })
})
