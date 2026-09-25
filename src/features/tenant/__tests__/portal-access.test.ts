import { describe, expect, it } from "vitest"
import { isBillVisibleToTenant, tenantRoomStints, type TenantTransferRow, type VisibilityBill } from "@/features/tenant/occupancy"
import { buildPortalSearchParams, isPortalTokenValid, signPortalToken } from "@/features/tenant/portal-access"

/**
 * เคสจริงของหอ:
 *   โบว์ อยู่ห้อง 141 ถึง มิ.ย. 2026 แล้วย้ายออกจากหอ
 *   นุ้ย เช่าห้อง 135 ตั้งแต่ 2025-12-01 → ย้ายไปห้อง 141 วันที่ 2026-08-07
 *   ต้น (สมมุติ) เข้าห้อง 135 ต่อจากนุ้ย 2026-09-01
 */
const WS = "ws-1"
const ROOM_135 = "room-135"
const ROOM_141 = "room-141"

const nui = { id: "tenant-nui", room_id: ROOM_141, lease_start: "2025-12-01", created_at: "2025-11-28T10:00:00Z" }
const ton = { id: "tenant-ton", room_id: ROOM_135, lease_start: "2026-09-01", created_at: "2026-08-30T10:00:00Z" }
const transfers: TenantTransferRow[] = [
  { id: "t1", tenant_id: nui.id, from_room_id: ROOM_135, to_room_id: ROOM_141, transfer_date: "2026-08-07" },
]

const bill = (room_id: string, billing_cycle: string, tenant_name: string): VisibilityBill => ({ room_id, billing_cycle, tenant_name })

const allBills: VisibilityBill[] = [
  bill(ROOM_135, "2025-11", "เจ้าของเดิม135"),
  bill(ROOM_135, "2026-04", "นุ้ย"),
  bill(ROOM_135, "2026-07", "นุ้ย"),
  bill(ROOM_135, "2026-08", "นุ้ย"), // ใบปิดรอบตอนย้าย (transfer_closing รุ่นเก่า)
  bill(ROOM_135, "2026-09", "ต้น"),
  bill(ROOM_135, "2026-10", "ต้น"),
  bill(ROOM_141, "2026-05", "โบว์"),
  bill(ROOM_141, "2026-06", "โบว์"),
  bill(ROOM_141, "2026-08", "นุ้ย"),
  bill(ROOM_141, "2026-09", "นุ้ย"),
]

const visibleFor = (tenant: typeof nui, name: string) => {
  const stints = tenantRoomStints(tenant, transfers)
  return allBills.filter((b) => isBillVisibleToTenant(b, name, stints)).map((b) => `${b.room_id}:${b.billing_cycle}`)
}

describe("ข้อ 3 — ย้ายห้องแล้ว ประวัติต้องมีบิลห้องเก่าด้วย", () => {
  it("นุ้ยเห็นบิลของตัวเองทั้งห้อง 135 (ก่อนย้าย) และห้อง 141", () => {
    expect(visibleFor(nui, "นุ้ย")).toEqual([
      "room-135:2026-04",
      "room-135:2026-07",
      "room-135:2026-08",
      "room-141:2026-08",
      "room-141:2026-09",
    ])
  })

  it("ห้องเก่ามีผู้เช่าใหม่ (ต้น) → นุ้ยไม่เห็นบิลของต้นเด็ดขาด", () => {
    const seen = visibleFor(nui, "นุ้ย")
    expect(seen).not.toContain("room-135:2026-09")
    expect(seen).not.toContain("room-135:2026-10")
  })

  it("ช่วงที่อยู่แต่ละห้องคำนวณถูก", () => {
    expect(tenantRoomStints(nui, transfers)).toEqual([
      { roomId: ROOM_135, startCycle: "2025-12", endCycle: "2026-08" },
      { roomId: ROOM_141, startCycle: "2026-08", endCycle: null },
    ])
  })
})

describe("ข้อ 2 — ผู้เช่าใหม่ต้องไม่เห็นบิลเก่าของห้อง", () => {
  it("ต้น (เข้าห้อง 135 ต่อจากนุ้ย) เห็นแค่บิลของตัวเอง", () => {
    expect(visibleFor(ton, "ต้น")).toEqual(["room-135:2026-09", "room-135:2026-10"])
  })

  it("นุ้ยเข้าห้อง 141 → ไม่เห็นบิลของโบว์", () => {
    const seen = visibleFor(nui, "นุ้ย")
    expect(seen).not.toContain("room-141:2026-05")
    expect(seen).not.toContain("room-141:2026-06")
  })

  it("ชื่อซ้ำกับผู้เช่าคนก่อน ก็ยังไม่เห็นบิลก่อนวันเข้าอยู่", () => {
    const sameName = { ...ton, id: "tenant-dup" }
    const stints = tenantRoomStints(sameName, [])
    expect(isBillVisibleToTenant(bill(ROOM_135, "2026-07", "ต้น"), "ต้น", stints)).toBe(false)
  })

  it("ไม่มี lease_start → ใช้วันที่สร้างข้อมูล ไม่เปิดให้เห็นทั้งห้อง", () => {
    const noLease = { id: "x", room_id: ROOM_135, lease_start: null, created_at: "2026-09-02T00:00:00Z" }
    expect(tenantRoomStints(noLease, [])).toEqual([{ roomId: ROOM_135, startCycle: "2026-09", endCycle: null }])
  })

  it("ไม่มีชื่อผู้เช่า → ไม่เห็นอะไรเลย", () => {
    const stints = tenantRoomStints(ton, [])
    expect(isBillVisibleToTenant(bill(ROOM_135, "2026-09", "ต้น"), "", stints)).toBe(false)
  })
})

describe("ข้อ 1 — ลิงก์ผูกกับผู้เช่า ไม่ใช่ห้อง", () => {
  it("ลิงก์ของคนละคนในห้องเดียวกัน ได้ token ต่างกัน", () => {
    expect(signPortalToken(WS, "tenant-bow")).not.toBe(signPortalToken(WS, nui.id))
  })

  it("token ของโบว์ใช้ยืนยันเป็นนุ้ยไม่ได้", () => {
    const bowToken = signPortalToken(WS, "tenant-bow")
    expect(isPortalTokenValid(WS, "tenant-bow", bowToken)).toBe(true)
    expect(isPortalTokenValid(WS, nui.id, bowToken)).toBe(false)
  })

  it("token ข้ามหอใช้ไม่ได้ และค่าว่าง/ปลอมถูกปฏิเสธ", () => {
    const token = signPortalToken(WS, nui.id)
    expect(isPortalTokenValid("ws-other", nui.id, token)).toBe(false)
    expect(isPortalTokenValid(WS, nui.id, "")).toBe(false)
    expect(isPortalTokenValid(WS, nui.id, "deadbeef")).toBe(false)
    expect(isPortalTokenValid(WS, "", token)).toBe(false)
  })

  it("ลิงก์ที่สร้างมี tenant_id และ token ที่ตรวจผ่าน", () => {
    const params = buildPortalSearchParams(WS, ROOM_141, nui.id)
    expect(params.get("tenant_id")).toBe(nui.id)
    expect(params.get("room_id")).toBe(ROOM_141)
    expect(isPortalTokenValid(WS, nui.id, params.get("token") || "")).toBe(true)
  })
})
