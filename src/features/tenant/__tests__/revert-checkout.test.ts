import { describe, expect, it } from "vitest"
import { parseRevertCheckoutResult } from "@/features/tenant/revert-checkout"

/**
 * เคสจริงที่ฟีเจอร์นี้แก้: ห้อง 121 คืนห้อง (กรอกมิเตอร์ผิด) แล้วผู้เช่าห้อง 123 ย้ายเข้า 121
 * กดยกเลิกการคืนห้อง 121 → ต้องย้ายผู้เช่ากลับ 123 ก่อน
 */
describe("parseRevertCheckoutResult", () => {
  it("อ่านผลที่มีการย้ายห้องเข้ามาทับ", () => {
    const res = parseRevertCheckoutResult({
      ok: true,
      room_number: "121",
      tenant_name: "สมชาย",
      transfer: {
        id: "tr-1",
        tenant_name: "สมหญิง",
        from_room_number: "123",
        to_room_number: "121",
        transfer_date: "2026-10-05",
        deposit_topup_amount: 500
      }
    })

    expect(res).toEqual({
      success: true,
      data: {
        roomNumber: "121",
        tenantName: "สมชาย",
        transfer: {
          id: "tr-1",
          tenantName: "สมหญิง",
          fromRoomNumber: "123",
          toRoomNumber: "121",
          transferDate: "2026-10-05",
          depositTopupAmount: 500
        }
      }
    })
  })

  it("ไม่มีการย้ายห้องเข้ามาทับ → transfer เป็น null", () => {
    const res = parseRevertCheckoutResult({ ok: true, room_number: "121", tenant_name: "สมชาย", transfer: null })
    expect(res.success && res.data.transfer).toBeNull()
  })

  it("ส่งเหตุผลที่ทำไม่ได้จากฐานข้อมูลต่อให้หน้าจอ", () => {
    const res = parseRevertCheckoutResult({ ok: false, error: "ห้อง 121 มีบิลที่ออกหลังการคืนห้องแล้ว (INV-1)" })
    expect(res).toEqual({ success: false, error: "ห้อง 121 มีบิลที่ออกหลังการคืนห้องแล้ว (INV-1)" })
  })

  it("รูปแบบที่ไม่รู้จักถือว่าล้มเหลว ไม่เดาว่าสำเร็จ", () => {
    expect(parseRevertCheckoutResult(null).success).toBe(false)
    expect(parseRevertCheckoutResult("ok").success).toBe(false)
    expect(parseRevertCheckoutResult({ room_number: "121" }).success).toBe(false)
  })

  it("การย้ายห้องที่ไม่มี id ถือว่าไม่สมบูรณ์ — ยืนยันการย้ายกลับไม่ได้ถ้าไม่รู้ว่ารายการไหน", () => {
    const res = parseRevertCheckoutResult({ ok: true, room_number: "121", tenant_name: "สมชาย", transfer: { tenant_name: "สมหญิง" } })
    expect(res.success).toBe(false)
  })
})
