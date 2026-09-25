/**
 * ใครอยู่ห้องไหนในรอบบิลไหน — ใช้ร่วมกันทุกหน้าที่ต้องแสดงชื่อผู้เช่ารายเดือน
 * (หน้าบิล, จัดการบิล, Dashboard)
 *
 * ⚠️ ทำไมต้องใช้ประวัติการย้ายห้อง (tenant_room_transfers)
 *
 * ตาราง tenants เก็บแค่ "ห้องปัจจุบัน" (room_id) กับ lease_start ของสัญญาแรก
 * ตอนย้ายห้อง transferTenantRoom() แก้แค่ room_id ไม่แตะ lease_start
 * ถ้าตัดสินจาก lease_start อย่างเดียว ผู้เช่าที่ย้ายเข้าห้องใหม่จะไปโผล่ในห้องใหม่
 * "ย้อนหลังทุกเดือน" ตั้งแต่วันเริ่มสัญญาห้องเดิม และห้องเดิมกลายเป็นห้องว่างย้อนหลัง
 *
 * เคสจริง: นุ้ยเช่าห้อง 135 ตั้งแต่ 2025-12-01 ย้ายไปห้อง 141 วันที่ 2026-08-07
 *   ห้อง 141 เดือน มิ.ย.–ก.ค. (ยังไม่มีบิล) เคยแสดงชื่อนุ้ย ทั้งที่ยังไม่ได้ย้ายมา
 *
 * กติกา:
 *   - ห้องปลายทาง: เริ่มนับตั้งแต่ transfer_date (เดือนที่ย้ายเป็นของห้องใหม่ ตรงกับที่บิล
 *     ห้องใหม่ใบเดียวรวมค่าน้ำ-ไฟห้องเดิมไว้แล้ว — ดู fetchTransferSegments)
 *   - ห้องต้นทาง: ยังแสดงชื่อผู้เช่าถึง "เดือนก่อนเดือนที่ย้าย" แล้วว่างตั้งแต่เดือนที่ย้าย
 */

export type RoomTenantEntry = {
  id: string
  tenantName: string
  tenantPhone?: string | null
  lineUserId?: string | null
  leaseStart: string | null
  leaseEnd: string | null
  /** true = ผู้เช่าที่ย้ายออกจากห้องนี้ไปห้องอื่นแล้ว (มาจากประวัติการย้าย) */
  movedOut?: boolean
}

export type TenantTransferRow = {
  id: string
  tenant_id: string | null
  from_room_id: string | null
  to_room_id: string | null
  transfer_date: string
}

/** วันสุดท้ายของเดือนก่อนหน้าเดือนของ date (YYYY-MM-DD) */
function lastDayOfPreviousMonth(date: string): string {
  const [y, m] = date.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1, 0))
  return d.toISOString().slice(0, 10)
}

/**
 * ปรับรายชื่อผู้เช่าของห้องหนึ่งตามประวัติการย้าย
 *
 * @param roomId ห้องที่กำลังประกอบรายชื่อ
 * @param currentTenants ผู้เช่าที่ room_id = ห้องนี้ ณ ปัจจุบัน
 * @param transfers ประวัติการย้ายทั้งหอ
 * @param tenantById ผู้เช่าทุกคนในหอ (ใช้เติมข้อมูลและวันเริ่มสัญญาของคนที่ย้ายออกจากห้องนี้ไปแล้ว)
 */
export function applyTransferHistory(
  roomId: string,
  currentTenants: RoomTenantEntry[],
  transfers: TenantTransferRow[],
  tenantById: Map<string, RoomTenantEntry>
): RoomTenantEntry[] {
  if (transfers.length === 0) return currentTenants

  const sorted = [...transfers].sort((a, b) => a.transfer_date.localeCompare(b.transfer_date))

  // การย้ายของแต่ละคนเรียงตามเวลา — ใช้หาว่าก่อนย้ายออกจากห้องนี้ เขาเข้ามาอยู่เมื่อไหร่
  const byTenant = new Map<string, TenantTransferRow[]>()
  for (const t of sorted) {
    if (!t.tenant_id) continue
    const list = byTenant.get(t.tenant_id) ?? []
    list.push(t)
    byTenant.set(t.tenant_id, list)
  }

  // 1) ผู้เช่าปัจจุบัน: ถ้าเคยย้ายเข้าห้องนี้ วันเริ่มอยู่ห้องนี้ = วันที่ย้ายเข้าครั้งล่าสุด
  const adjusted = currentTenants.map((tenant) => {
    const moves = byTenant.get(tenant.id) ?? []
    const lastMoveIn = [...moves].reverse().find((m) => m.to_room_id === roomId)
    return lastMoveIn ? { ...tenant, leaseStart: lastMoveIn.transfer_date } : tenant
  })

  // 2) ผู้เช่าที่ย้ายออกจากห้องนี้ไปห้องอื่น: อยู่ห้องนี้ถึงสิ้นเดือนก่อนเดือนที่ย้าย
  const history: RoomTenantEntry[] = []
  for (const move of sorted) {
    if (move.from_room_id !== roomId || !move.tenant_id) continue
    const person = tenantById.get(move.tenant_id)
    // ย้ายออกจากหอไปแล้ว (ไม่อยู่ในตาราง tenants) → ไม่มีข้อมูลให้แสดง ปล่อยให้ชื่อในบิลเป็นตัวตัดสิน
    if (!person) continue

    const moves = byTenant.get(move.tenant_id) ?? []
    const prevMoveIn = [...moves]
      .reverse()
      .find((m) => m.to_room_id === roomId && m.transfer_date < move.transfer_date)

    history.push({
      ...person,
      leaseStart: prevMoveIn ? prevMoveIn.transfer_date : person.leaseStart,
      leaseEnd: lastDayOfPreviousMonth(move.transfer_date),
      movedOut: true,
    })
  }

  return [...adjusted, ...history]
}

/**
 * ผู้เช่าอยู่ในห้องช่วงรอบบิลนี้หรือไม่
 *
 * isLatest = ผู้เช่าล่าสุดของห้อง — ไม่สน leaseEnd (สัญญาหมดแล้วแต่ยังอยู่ต่อเป็นเรื่องปกติ)
 */
export function isTenantActiveInCycle(
  leaseStart: string | null | undefined,
  leaseEnd: string | null | undefined,
  cycle: string,
  isLatest = true
): boolean {
  if (!leaseStart) return false

  const [cYear, cMonth] = cycle.split("-").map(Number)
  const cycleStart = new Date(cYear, cMonth - 1, 1)
  const cycleEnd = new Date(cYear, cMonth, 0, 23, 59, 59, 999) // วันสุดท้ายของเดือนรอบบิล

  const start = new Date(leaseStart)
  start.setHours(0, 0, 0, 0)

  if (start > cycleEnd) return false // เริ่มสัญญาหลังสิ้นสุดเดือนรอบบิลนี้

  if (leaseEnd && !isLatest) {
    const end = new Date(leaseEnd)
    end.setHours(23, 59, 59, 999)
    if (end < cycleStart) return false // สัญญาสิ้นสุดลงก่อนเริ่มเดือนรอบบิลนี้
  }

  return true
}

// ─────────────────────────────────────────────────────────────────────────
// มุมมองของผู้เช่า (Portal): ผู้เช่าคนหนึ่งเคยอยู่ห้องไหน ช่วงรอบบิลไหน
// ─────────────────────────────────────────────────────────────────────────

/** ช่วงที่ผู้เช่าอยู่ห้องหนึ่ง — endCycle = null คือห้องปัจจุบัน */
export type TenantStint = {
  roomId: string
  startCycle: string
  endCycle: string | null
}

export type StintTenant = {
  id: string
  room_id: string | null
  lease_start: string | null
  created_at?: string | null
}

/**
 * ช่วงที่ผู้เช่าอยู่แต่ละห้อง จากสัญญา + ประวัติการย้าย
 *
 * เดือนที่ย้าย "นับเป็นของทั้งสองห้อง" สำหรับการมองเห็นบิล เพราะห้องเดิมอาจมีใบปิดรอบ
 * (bill_kind = transfer_closing) ในเดือนนั้น — ตัวกรองชื่อผู้เช่าใน isBillVisibleToTenant
 * กันไม่ให้เห็นบิลของผู้เช่าคนอื่นที่เข้ามาห้องเดิมในเดือนเดียวกันอยู่แล้ว
 */
export function tenantRoomStints(tenant: StintTenant, transfers: TenantTransferRow[]): TenantStint[] {
  // ไม่มีวันเริ่มสัญญา → ใช้วันที่สร้างข้อมูลผู้เช่า (ห้ามปล่อยว่าง ไม่งั้นจะเห็นบิลเก่าของห้องทั้งหมด)
  const baseDate = tenant.lease_start || tenant.created_at || ""
  let cursor = baseDate.slice(0, 7)

  const moves = transfers
    .filter((t) => t.tenant_id === tenant.id)
    .sort((a, b) => a.transfer_date.localeCompare(b.transfer_date))

  const stints: TenantStint[] = []
  for (const move of moves) {
    const moveCycle = move.transfer_date.slice(0, 7)
    if (move.from_room_id) {
      stints.push({ roomId: move.from_room_id, startCycle: cursor, endCycle: moveCycle })
    }
    cursor = moveCycle
  }
  if (tenant.room_id) {
    stints.push({ roomId: tenant.room_id, startCycle: cursor, endCycle: null })
  }
  return stints
}

export type VisibilityBill = {
  room_id: string | null
  billing_cycle: string
  tenant_name: string | null
}

/**
 * ผู้เช่าเห็นบิลใบนี้ได้หรือไม่ — ต้องผ่านทั้งสองชั้น
 *   1. บิลอยู่ในห้องและช่วงรอบบิลที่ผู้เช่าคนนี้อยู่จริง (กันผู้เช่าใหม่เห็นบิลเก่าของห้อง)
 *   2. ชื่อในบิลตรงกับผู้เช่า (กันเห็นบิลของคนอื่นในเดือนที่เปลี่ยนมือ)
 */
export function isBillVisibleToTenant(bill: VisibilityBill, tenantName: string, stints: TenantStint[]): boolean {
  if (!tenantName || !bill.room_id || bill.tenant_name !== tenantName) return false
  return stints.some(
    (s) =>
      s.roomId === bill.room_id &&
      bill.billing_cycle >= s.startCycle &&
      (s.endCycle === null || bill.billing_cycle <= s.endCycle)
  )
}

/** ผู้เช่าล่าสุดของห้อง — ไม่นับคนที่ย้ายออกไปห้องอื่นแล้ว */
function latestTenantId(tenants: RoomTenantEntry[]): string | undefined {
  let latest: RoomTenantEntry | undefined
  for (const t of tenants) {
    if (t.movedOut) continue
    const time = t.leaseStart ? new Date(t.leaseStart).getTime() : 0
    const latestTime = latest?.leaseStart ? new Date(latest.leaseStart).getTime() : 0
    if (!latest || time > latestTime) latest = t
  }
  return latest?.id
}

function isEntryActive(t: RoomTenantEntry, cycle: string, latestId: string | undefined): boolean {
  return isTenantActiveInCycle(t.leaseStart, t.leaseEnd, cycle, !t.movedOut && t.id === latestId)
}

/** ผู้เช่าที่อยู่ในห้องช่วงรอบบิลนี้ (ไม่ดูบิล) */
export function findActiveTenantInCycle(
  tenants: RoomTenantEntry[] | null | undefined,
  cycle: string
): RoomTenantEntry | null {
  const list = tenants ?? []
  const latestId = latestTenantId(list)
  return list.find((t) => isEntryActive(t, cycle, latestId)) ?? null
}

/**
 * ชื่อผู้เช่าที่จะแสดงสำหรับห้องหนึ่งในรอบบิลหนึ่ง
 *
 * 1. มีบิลแล้ว → เชื่อชื่อในบิล ยกเว้นคนชื่อนั้นยังอยู่ในหอแต่ "ยังไม่ได้อยู่ห้องนี้" ในรอบนั้น
 *    (บิลที่เกิดจากบั๊กเก่า) → หาคนที่อยู่จริงแทน
 * 2. ยังไม่มีบิล → หาคนที่อยู่ห้องนี้ในรอบนั้นจากสัญญา + ประวัติการย้าย
 */
export function resolveTenantNameForCycle(
  tenants: RoomTenantEntry[] | null | undefined,
  cycle: string,
  billTenantName?: string | null
): string | null {
  const list = tenants ?? []
  const latestId = latestTenantId(list)

  if (billTenantName) {
    const sameName = list.filter((t) => t.tenantName === billTenantName)
    if (sameName.length === 0) return billTenantName // ผู้เช่าเก่าที่ย้ายออกจากหอแล้ว — เชื่อบิล
    if (sameName.some((t) => isEntryActive(t, cycle, latestId))) return billTenantName
  }

  return findActiveTenantInCycle(list, cycle)?.tenantName ?? null
}
