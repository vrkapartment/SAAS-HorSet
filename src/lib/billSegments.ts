/**
 * "ส่วนของห้องเดิม" ที่ถูกนำมารวมในบิลห้องใหม่ (utility segments)
 *
 * =============================================================================
 * ปัญหาที่โมดูลนี้แก้
 * =============================================================================
 * เดิมเวลาผู้เช่าย้ายห้องกลางเดือน ระบบออกบิลปิดรอบของห้องเดิมเป็น "อีกใบ" (bill_kind =
 * transfer_closing, เลขใบลงท้าย -TRANSFER) ผู้เช่าคนเดียวจึงได้บิลสองใบในเดือนเดียว
 * ต้องจ่ายสองรอบ และเทียบไม่ออกว่าใบไหนคือห้องไหน
 *
 * แบบใหม่: ค่าน้ำ-ค่าไฟ (และค่าเช่าถ้าเลือกให้รวม) ของห้องเดิม ถูกยกมาเป็น "รายการย่อย"
 * ในบิลของห้องใหม่ใบเดียว โดยยังแยกให้เห็นชัดว่าส่วนไหนของห้องเดิม ส่วนไหนของห้องใหม่
 *
 * =============================================================================
 * ทำไมเก็บ "ยอดที่คิดเสร็จแล้ว" ไม่ใช่ "ข้อมูลตั้งต้น"
 * =============================================================================
 * segment ถูกคำนวณครั้งเดียว ณ ตอนย้ายห้อง แล้วเก็บทั้งอัตรา หน่วย และยอดเงินลงไปเลย
 * (แนวเดียวกับ snapshot ของบิล — ดู readBillSnapshot ใน features/billing/utils.ts)
 *
 * เหตุผล: ตอนออกบิลปลายเดือนอาจห่างจากวันย้ายห้องเป็นสัปดาห์ ระหว่างนั้นอัตราค่าไฟ
 * การตั้งค่าขั้นต่ำ หรือแม้แต่โหมดคิดค่าไฟทั้งอาคาร เปลี่ยนได้หมด ถ้าไปคิดใหม่ตอนออกบิล
 * ผู้เช่าจะถูกเก็บด้วยอัตราที่ไม่ใช่อัตราของช่วงที่เขาอยู่จริง และไม่มีใครรู้ตัวเลย
 * นอกจากนี้ห้องเดิมอาจอยู่คนละอาคารกับห้องใหม่ ซึ่งอัตราต่างกันได้ในโหมด building_total
 *
 * ผลข้างเคียงที่ตั้งใจ: ยอดใน segment ไม่เปลี่ยนอีกแล้วแม้กดออกบิลซ้ำ
 */

/** หนึ่งช่วงการอยู่ในห้องอื่นภายในรอบบิลเดียวกัน */
export type BillUtilitySegment = {
  /** เผื่อชนิดอื่นในอนาคต (เช่นย้ายออกกลางเดือนแล้วมีผู้เช่าใหม่) */
  kind: "transfer_from"
  /** แถวใน tenant_room_transfers ที่เป็นต้นทางของ segment นี้ — ใช้ไล่กลับได้ */
  transferId: string | null
  /** เลขห้องเดิม (ไว้แสดงบนใบ ไม่ใช่ตัวระบุ) */
  roomNumber: string
  /** รหัสอาคารของห้องเดิม — กำกับเมื่อเลขห้องซ้ำข้ามอาคาร */
  buildingCode: string | null
  /** วันที่ย้ายออกจากห้องเดิม (YYYY-MM-DD) */
  toDate: string
  /** true = เลือก "รวม" ค่าเช่าห้องเดิมไว้ในบิลนี้ */
  rentIncluded: boolean
  /** ค่าเช่าห้องเดิมที่คิดรวม (0 เมื่อ rentIncluded = false) */
  rentAmount: number
  elecPrev: number
  elecCurr: number
  elecUnits: number
  elecRate: number
  elecAmount: number
  /**
   * true = ช่วงนี้คิดค่าไฟแบบขั้นต่ำ (ไว้ใส่ป้ายบนใบ ไม่ให้คิดใหม่จาก config ปัจจุบัน)
   *
   * ⚠️ เส้นทางย้ายห้องเขียน false เสมอ — ช่วงห้องเดิมไม่คิดขั้นต่ำโดยเจตนา ไม่ให้ผู้เช่า
   * โดนขั้นต่ำสองครั้งในเดือนเดียว (บิลห้องใหม่คิดขั้นต่ำของตัวเองอยู่แล้ว)
   * คงช่องนี้ไว้เพื่อให้ segment อธิบายตัวเองได้ และรองรับถ้านโยบายเปลี่ยนในอนาคต
   */
  elecMinApplied: boolean
  waterPrev: number
  waterCurr: number
  waterUnits: number
  waterRate: number
  waterAmount: number
  waterMinApplied: boolean
}

export type SegmentTotals = {
  /** ค่าเช่าห้องเดิมรวมทุก segment — ไม่เข้าฐาน VAT (ค่าเช่าเป็นเงินได้ 40(5) ยกเว้น VAT) */
  rent: number
  /** ค่าน้ำ+ค่าไฟห้องเดิมรวมทุก segment — เข้าฐาน VAT เหมือนค่าน้ำ-ไฟปกติ */
  utility: number
  elec: number
  water: number
  /** rent + utility */
  total: number
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/**
 * อ่าน segment จากคอลัมน์ jsonb ของ bills
 *
 * ต้องทนของเสียได้ทุกแบบ (null / ไม่ใช่ array / สมาชิกไม่ใช่ object / ตัวเลขมาเป็น string
 * ซึ่ง numeric ของ Postgres ทำได้จริงเมื่อค่าเกิน precision ของ JS) เพราะถ้าฟังก์ชันนี้ throw
 * ใบแจ้งหนี้จะเปิดไม่ได้ทั้งใบ — แย่กว่าการแสดงรายการย่อยไม่ครบมาก
 */
export function parseUtilitySegments(raw: unknown): BillUtilitySegment[] {
  if (!Array.isArray(raw)) return []
  const out: BillUtilitySegment[] = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const r = item as Record<string, unknown>
    const roomNumber = str(r.roomNumber)
    if (!roomNumber) continue   // ไม่รู้ว่าเป็นห้องไหน แสดงบนใบก็อ่านไม่รู้เรื่อง
    const buildingCode = typeof r.buildingCode === "string" && r.buildingCode.trim() !== ""
      ? r.buildingCode
      : null
    out.push({
      kind: "transfer_from",
      transferId: typeof r.transferId === "string" ? r.transferId : null,
      roomNumber,
      buildingCode,
      toDate: str(r.toDate),
      rentIncluded: r.rentIncluded === true,
      rentAmount: r.rentIncluded === true ? num(r.rentAmount) : 0,
      elecPrev: num(r.elecPrev),
      elecCurr: num(r.elecCurr),
      elecUnits: num(r.elecUnits),
      elecRate: num(r.elecRate),
      elecAmount: num(r.elecAmount),
      elecMinApplied: r.elecMinApplied === true,
      waterPrev: num(r.waterPrev),
      waterCurr: num(r.waterCurr),
      waterUnits: num(r.waterUnits),
      waterRate: num(r.waterRate),
      waterAmount: num(r.waterAmount),
      waterMinApplied: r.waterMinApplied === true
    })
  }
  return out
}

/**
 * แถว tenant_room_transfers เท่าที่ต้องใช้ประกอบเป็น segment
 * (ตั้งเป็น unknown ทุกช่องเพราะมาจาก DB ตรง ๆ — numeric ของ Postgres ส่งมาเป็น string ได้)
 */
export type TransferRowForSegment = {
  id?: unknown
  from_room_number?: unknown
  transfer_date?: unknown
  closing_elec_prev?: unknown
  closing_elec_curr?: unknown
  closing_elec_units?: unknown
  closing_elec_rate?: unknown
  closing_elec_amount?: unknown
  closing_elec_min_applied?: unknown
  closing_water_prev?: unknown
  closing_water_curr?: unknown
  closing_water_units?: unknown
  closing_water_rate?: unknown
  closing_water_amount?: unknown
  closing_water_min_applied?: unknown
  include_old_room_rent?: unknown
  old_room_rent_amount?: unknown
}

/**
 * ประกอบ segment จากแถวประวัติการย้ายห้อง
 *
 * ใช้ตัวนี้ที่เดียวทั้งสองเส้นทางออกบิล (ออกทีละห้อง / บันทึกทั้งหมด) — ถ้าแต่ละเส้นทาง
 * ประกอบเอง ห้องที่ออกบิลด้วยปุ่มต่างกันจะได้รายการย่อยไม่เหมือนกันบนใบเดียวกัน
 *
 * buildingCode ส่งเข้ามาแยกเพราะตาราง tenant_room_transfers เก็บแต่เลขห้องเดิม
 * ไม่ได้เก็บรหัสอาคาร (ต้องไปอ่านจาก rooms ตอนออกบิล)
 */
export function buildSegmentFromTransfer(
  row: TransferRowForSegment,
  buildingCode: string | null
): BillUtilitySegment {
  const rentIncluded = row.include_old_room_rent === true
  return {
    kind: "transfer_from",
    transferId: typeof row.id === "string" ? row.id : null,
    roomNumber: str(row.from_room_number),
    buildingCode: buildingCode && buildingCode.trim() !== "" ? buildingCode : null,
    toDate: str(row.transfer_date).slice(0, 10),
    rentIncluded,
    rentAmount: rentIncluded ? num(row.old_room_rent_amount) : 0,
    elecPrev: num(row.closing_elec_prev),
    elecCurr: num(row.closing_elec_curr),
    elecUnits: num(row.closing_elec_units),
    elecRate: num(row.closing_elec_rate),
    elecAmount: num(row.closing_elec_amount),
    elecMinApplied: row.closing_elec_min_applied === true,
    waterPrev: num(row.closing_water_prev),
    waterCurr: num(row.closing_water_curr),
    waterUnits: num(row.closing_water_units),
    waterRate: num(row.closing_water_rate),
    waterAmount: num(row.closing_water_amount),
    waterMinApplied: row.closing_water_min_applied === true
  }
}

/**
 * แถวการย้ายที่ "ยังคิดยอดไว้ไม่ครบ" — ต้องข้ามไม่ให้กลายเป็น segment ยอด 0
 *
 * เกิดกับแถวที่ถูกสร้างก่อน patch move_segments (ยอดอยู่ในบิล -TRANSFER แยกใบไปแล้ว)
 * ถ้าไม่ข้าม บิลของห้องปลายทางจะขึ้นรายการย่อย "0 หน่วย 0 บาท" ให้ผู้เช่าเห็นโดยไม่มีความหมาย
 * และแย่กว่านั้นคือถ้าใบ -TRANSFER เก่ายังไม่จ่าย จะดูเหมือนถูกยกมารวมแล้วทั้งที่ไม่ใช่
 */
export function hasSegmentAmounts(row: TransferRowForSegment): boolean {
  return row.closing_elec_amount !== null && row.closing_elec_amount !== undefined
    && row.closing_water_amount !== null && row.closing_water_amount !== undefined
}

/** แถวการย้ายพร้อมข้อมูลที่ต้องใช้ไล่โซ่ว่าบิลใบไหนควรรับ segment นี้ */
export type TransferRowForGrouping = TransferRowForSegment & {
  tenant_id?: unknown
  from_room_id?: unknown
  to_room_id?: unknown
}

/**
 * จับ segment เข้ากับ "บิลของห้องที่ควรรับผิดชอบ" ในรอบบิลนั้น
 *
 * =============================================================================
 * ทำไมไม่ผูกกับ to_room_id ตรง ๆ
 * =============================================================================
 * ผู้เช่าย้าย A→B→C ในเดือนเดียวกันได้ ถ้าผูกตรง ๆ:
 *   · ส่วนของห้อง A ไปอยู่กับบิลห้อง B
 *   · แต่ปลายเดือนผู้เช่าไม่ได้อยู่ห้อง B แล้ว ห้อง B จึงไม่มีบิล
 *   → ค่าน้ำ-ค่าไฟของห้อง A หายไปทั้งก้อน ไม่มีใครถูกเรียกเก็บ และไม่มีอะไรฟ้อง
 *
 * กฎที่ใช้: ทุก segment ของผู้เช่าคนเดียวกันในรอบเดียวกัน ไปรวมที่ "ห้องสุดท้ายที่เขาอยู่"
 * (ปลายทางของการย้ายครั้งล่าสุด) ห้องเดียว
 *
 * @param rows           แถวการย้ายของรอบนั้น **เรียงตามวันที่ย้ายจากเก่าไปใหม่แล้ว**
 * @param buildingCodeByRoomId  รหัสอาคารของห้องเดิม (ไว้กำกับบนใบเมื่อเลขห้องซ้ำข้ามอาคาร)
 * @param wantedRoomIds  เฉพาะห้องที่กำลังจะออกบิล — ห้องอื่นไม่ต้องคำนวณให้เสียเวลา
 */
export function groupSegmentsByBillRoom(
  rows: TransferRowForGrouping[],
  buildingCodeByRoomId: Map<string, string | null>,
  wantedRoomIds: Iterable<string>
): Map<string, BillUtilitySegment[]> {
  const result = new Map<string, BillUtilitySegment[]>()
  const wanted = new Set(wantedRoomIds)
  if (wanted.size === 0) return result

  // ห้องสุดท้ายของผู้เช่าแต่ละคน = ปลายทางของแถวท้ายสุด (rows เรียงตามวันมาแล้ว)
  // แถวที่ไม่มี tenant_id (ข้อมูลเก่า) ไล่โซ่ไม่ได้ ให้ผูกกับปลายทางของตัวเองตามเดิม
  const finalRoomByTenant = new Map<string, string>()
  for (const r of rows) {
    if (typeof r.tenant_id !== "string" || typeof r.to_room_id !== "string") continue
    finalRoomByTenant.set(r.tenant_id, r.to_room_id)
  }

  for (const r of rows) {
    if (!hasSegmentAmounts(r)) continue   // แถวเก่าที่ยอดไปอยู่ในบิล -TRANSFER แยกใบแล้ว
    const ownDest = typeof r.to_room_id === "string" ? r.to_room_id : null
    const billRoomId = typeof r.tenant_id === "string"
      ? (finalRoomByTenant.get(r.tenant_id) ?? ownDest)
      : ownDest
    if (!billRoomId || !wanted.has(billRoomId)) continue

    const code = typeof r.from_room_id === "string"
      ? (buildingCodeByRoomId.get(r.from_room_id) ?? null)
      : null
    const list = result.get(billRoomId) ?? []
    list.push(buildSegmentFromTransfer(r, code))
    result.set(billRoomId, list)
  }
  return result
}

/** รวมยอดของทุก segment — แยกค่าเช่าออกจากค่าน้ำ-ไฟเพราะฐาน VAT ไม่เหมือนกัน */
export function sumSegments(segments: BillUtilitySegment[]): SegmentTotals {
  let rent = 0, elec = 0, water = 0
  for (const s of segments) {
    rent += s.rentIncluded ? s.rentAmount : 0
    elec += s.elecAmount
    water += s.waterAmount
  }
  const utility = elec + water
  return { rent, utility, elec, water, total: rent + utility }
}

/**
 * ป้ายชื่อห้องของ segment สำหรับแสดงบนใบแจ้งหนี้
 *
 * กำกับรหัสอาคารเสมอเมื่อมี — ต่างจาก formatRoomLabel() ที่กำกับเฉพาะเมื่อเลขห้องซ้ำ
 * เพราะบนใบแจ้งหนี้ผู้เช่าเห็นแค่ห้องของตัวเอง ไม่มีบริบทว่าในหอมีเลขห้องซ้ำหรือไม่
 * และ segment คือ "ห้องอื่น" ที่เขาไม่ได้อยู่แล้ว จึงต้องระบุให้ชัดที่สุด
 */
export function formatSegmentRoomLabel(segment: BillUtilitySegment): string {
  return segment.buildingCode
    ? `ห้อง ${segment.roomNumber} (${segment.buildingCode})`
    : `ห้อง ${segment.roomNumber}`
}
