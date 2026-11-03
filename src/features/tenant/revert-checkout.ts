/**
 * ยกเลิกการคืนห้อง/ย้ายออก — ชนิดข้อมูลและตัวอ่านผลจากฟังก์ชัน revert_checkout() ในฐานข้อมูล
 *
 * แยกจาก revert-checkout-actions.ts ("use server") เพราะไฟล์ server action export ได้แต่ async function
 * และตัวอ่านผลเป็นฟังก์ชันล้วน ทดสอบได้โดยไม่ต้องต่อฐานข้อมูล
 */

/** การย้ายห้องที่ต้องย้อนก่อน เพราะผู้เช่าห้องอื่นย้ายเข้ามาอยู่ห้องที่คืนไปแล้ว */
export type RevertTransferInfo = {
  id: string
  tenantName: string
  fromRoomNumber: string
  toRoomNumber: string
  transferDate: string
  depositTopupAmount: number
}

export type RevertCheckoutPlan = {
  roomNumber: string
  tenantName: string
  transfer: RevertTransferInfo | null
}

export type RevertCheckoutResult =
  | { success: true; data: RevertCheckoutPlan }
  | { success: false; error: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/**
 * แปลง jsonb ที่ revert_checkout() คืนมาเป็นผลลัพธ์ที่มีชนิด
 *
 * รูปแบบที่ไม่รู้จักถือว่าล้มเหลว — ไม่เดาว่าสำเร็จ เพราะหน้าจอจะบอกผู้ดูแลว่าย้อนแล้วทั้งที่ไม่แน่ใจ
 */
export function parseRevertCheckoutResult(raw: unknown): RevertCheckoutResult {
  const obj = asRecord(raw)
  if (!obj) {
    return { success: false, error: "ฐานข้อมูลตอบกลับในรูปแบบที่ไม่รู้จัก" }
  }

  if (obj.ok !== true) {
    return { success: false, error: asString(obj.error) || "ยกเลิกการคืนห้องไม่สำเร็จ" }
  }

  const t = asRecord(obj.transfer)
  const transfer: RevertTransferInfo | null = t
    ? {
        id: asString(t.id),
        tenantName: asString(t.tenant_name),
        fromRoomNumber: asString(t.from_room_number),
        toRoomNumber: asString(t.to_room_number),
        transferDate: asString(t.transfer_date),
        depositTopupAmount: Number(t.deposit_topup_amount) || 0
      }
    : null

  if (transfer && !transfer.id) {
    return { success: false, error: "ข้อมูลการย้ายห้องที่ต้องย้อนไม่สมบูรณ์" }
  }

  return {
    success: true,
    data: {
      roomNumber: asString(obj.room_number),
      tenantName: asString(obj.tenant_name),
      transfer
    }
  }
}
