import { describe, expect, it } from "vitest"
import {
  applyTransferHistory,
  findActiveTenantInCycle,
  resolveTenantNameForCycle,
  type RoomTenantEntry,
  type TenantTransferRow,
} from "@/features/tenant/occupancy"

/**
 * เคสจริง: นุ้ยเช่าห้อง 135 ตั้งแต่ 2025-12-01 (สัญญาถึง 2026-06-01 แต่อยู่ต่อ)
 * โบว์ย้ายออกจากห้อง 141 ปลาย มิ.ย. → ห้อง 141 ว่าง
 * นุ้ยย้ายจาก 135 ไป 141 วันที่ 2026-08-07
 *
 * บิลที่มี: 135 = พ.ค.–ก.ค. (นุ้ย), 141 = พ.ค. (โบว์), ส.ค. (นุ้ย)
 */
const ROOM_135 = "room-135"
const ROOM_141 = "room-141"

const nui: RoomTenantEntry = {
  id: "tenant-nui",
  tenantName: "นุ้ย",
  leaseStart: "2025-12-01",
  leaseEnd: "2026-06-01",
}

const moveNui: TenantTransferRow = {
  id: "transfer-1",
  tenant_id: nui.id,
  from_room_id: ROOM_135,
  to_room_id: ROOM_141,
  transfer_date: "2026-08-07",
}

const tenantById = new Map([[nui.id, nui]])

// หลังย้าย: tenants.room_id ของนุ้ยชี้ห้อง 141 → ห้อง 135 ไม่มีผู้เช่าปัจจุบัน
const room141 = applyTransferHistory(ROOM_141, [nui], [moveNui], tenantById)
const room135 = applyTransferHistory(ROOM_135, [], [moveNui], tenantById)

describe("ห้องปลายทาง (141) — ต้องไม่มีชื่อนุ้ยก่อนเดือนที่ย้าย", () => {
  it.each(["2026-06", "2026-07"])("%s ยังไม่มีบิล → ห้องว่าง", (cycle) => {
    expect(resolveTenantNameForCycle(room141, cycle, null)).toBeNull()
  })

  it("พ.ค. มีบิลของโบว์ (ย้ายออกจากหอแล้ว) → เชื่อชื่อในบิล", () => {
    expect(resolveTenantNameForCycle(room141, "2026-05", "โบว์")).toBe("โบว์")
  })

  it("ส.ค. เดือนที่ย้าย → นุ้ย", () => {
    expect(resolveTenantNameForCycle(room141, "2026-08", null)).toBe("นุ้ย")
    expect(resolveTenantNameForCycle(room141, "2026-08", "นุ้ย")).toBe("นุ้ย")
  })

  it("เดือนหลังจากนั้น → นุ้ย แม้สัญญาเดิมหมดไปแล้ว", () => {
    expect(resolveTenantNameForCycle(room141, "2026-09", null)).toBe("นุ้ย")
    expect(resolveTenantNameForCycle(room141, "2027-01", null)).toBe("นุ้ย")
  })

  it("บิลเก่าที่ใส่ชื่อนุ้ยไว้ก่อนย้าย (ข้อมูลผิด) → ไม่แสดงนุ้ย", () => {
    expect(resolveTenantNameForCycle(room141, "2026-07", "นุ้ย")).toBeNull()
  })
})

describe("ห้องต้นทาง (135) — แสดงนุ้ยถึงเดือนก่อนย้าย แล้วว่าง", () => {
  it.each(["2025-12", "2026-06", "2026-07"])("%s → นุ้ย (แม้ยังไม่มีบิล)", (cycle) => {
    expect(resolveTenantNameForCycle(room135, cycle, null)).toBe("นุ้ย")
  })

  it("ก่อนเริ่มสัญญา → ว่าง", () => {
    expect(resolveTenantNameForCycle(room135, "2025-11", null)).toBeNull()
  })

  it.each(["2026-08", "2026-09"])("%s เดือนที่ย้ายและหลังจากนั้น → ว่าง", (cycle) => {
    expect(resolveTenantNameForCycle(room135, cycle, null)).toBeNull()
  })

  it("มีบิลชื่อนุ้ยในเดือนที่ยังอยู่ → นุ้ย", () => {
    expect(resolveTenantNameForCycle(room135, "2026-07", "นุ้ย")).toBe("นุ้ย")
  })
})

describe("ผู้เช่าใหม่เข้าห้องต้นทางหลังคนเดิมย้ายออก", () => {
  const newcomer: RoomTenantEntry = { id: "tenant-new", tenantName: "ต้น", leaseStart: "2026-09-01", leaseEnd: null }
  const room = applyTransferHistory(ROOM_135, [newcomer], [moveNui], tenantById)

  it("ก่อนย้าย → คนเดิม, เดือนที่ย้าย → ว่าง, หลังเข้าอยู่ → คนใหม่", () => {
    expect(findActiveTenantInCycle(room, "2026-07")?.tenantName).toBe("นุ้ย")
    expect(findActiveTenantInCycle(room, "2026-08")).toBeNull()
    expect(findActiveTenantInCycle(room, "2026-09")?.tenantName).toBe("ต้น")
  })
})

describe("ย้ายหลายต่อ A → B → C", () => {
  const t: RoomTenantEntry = { id: "tenant-x", tenantName: "เอ็กซ์", leaseStart: "2026-01-10", leaseEnd: null }
  const moves: TenantTransferRow[] = [
    { id: "m1", tenant_id: t.id, from_room_id: "A", to_room_id: "B", transfer_date: "2026-03-15" },
    { id: "m2", tenant_id: t.id, from_room_id: "B", to_room_id: "C", transfer_date: "2026-06-02" },
  ]
  const byId = new Map([[t.id, t]])
  const roomA = applyTransferHistory("A", [], moves, byId)
  const roomB = applyTransferHistory("B", [], moves, byId)
  const roomC = applyTransferHistory("C", [t], moves, byId)

  it("แต่ละเดือนอยู่ห้องเดียวเท่านั้น", () => {
    const where = (cycle: string) =>
      [
        ["A", roomA],
        ["B", roomB],
        ["C", roomC],
      ]
        .filter(([, list]) => findActiveTenantInCycle(list as RoomTenantEntry[], cycle))
        .map(([name]) => name)

    expect(where("2026-01")).toEqual(["A"])
    expect(where("2026-02")).toEqual(["A"])
    expect(where("2026-03")).toEqual(["B"])
    expect(where("2026-05")).toEqual(["B"])
    expect(where("2026-06")).toEqual(["C"])
    expect(where("2026-12")).toEqual(["C"])
  })
})

describe("ไม่มีประวัติการย้าย — พฤติกรรมเดิมไม่เปลี่ยน", () => {
  it("ใช้ lease_start ตามเดิม", () => {
    const list = applyTransferHistory(ROOM_135, [nui], [], tenantById)
    expect(list).toEqual([nui])
    expect(resolveTenantNameForCycle(list, "2025-11", null)).toBeNull()
    expect(resolveTenantNameForCycle(list, "2026-09", null)).toBe("นุ้ย")
  })
})
