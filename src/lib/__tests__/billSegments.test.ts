import { describe, expect, it } from "vitest"
import {
  parseUtilitySegments,
  sumSegments,
  buildSegmentFromTransfer,
  hasSegmentAmounts,
  formatSegmentRoomLabel,
  groupSegmentsByBillRoom,
  type BillUtilitySegment
} from "@/lib/billSegments"
import { resolveBillLines } from "@/lib/billLines"
import { calculateBillTotal } from "@/features/billing/bill-calculator"
import { computeMidMonthRent } from "@/features/room/deposit-calculator"

/**
 * "ส่วนของห้องเดิม" ที่ยกมารวมในบิลห้องใหม่ตอนย้ายห้องกลางเดือน
 *
 * ทั้งไฟล์นี้คุมเส้นทางเงิน: ถ้าพลาด ผู้เช่าจะถูกเก็บเกิน/ขาด โดยไม่มี error อะไรขึ้นเลย
 * — บิลจะยังพิมพ์ออกมาสวยงามและยอดรวมยังบวกได้ลงตัวด้วยซ้ำ
 */

const fullSegment: BillUtilitySegment = {
  kind: "transfer_from",
  transferId: "tr-1",
  roomNumber: "113",
  buildingCode: "A",
  toDate: "2026-08-15",
  rentIncluded: false,
  rentAmount: 0,
  elecPrev: 9042,
  elecCurr: 9159,
  elecUnits: 117,
  elecRate: 7,
  elecAmount: 819,
  elecMinApplied: false,
  waterPrev: 100,
  waterCurr: 112,
  waterUnits: 12,
  waterRate: 18,
  waterAmount: 216,
  waterMinApplied: false
}

describe("parseUtilitySegments", () => {
  it("บิลปกติ (คอลัมน์เป็น null / ไม่มีค่า) ต้องได้ array ว่าง ไม่ใช่พัง", () => {
    expect(parseUtilitySegments(null)).toEqual([])
    expect(parseUtilitySegments(undefined)).toEqual([])
    expect(parseUtilitySegments([])).toEqual([])
  })

  it("ของที่ไม่ใช่ array ต้องไม่ทำให้ใบแจ้งหนี้เปิดไม่ได้", () => {
    expect(parseUtilitySegments("[]")).toEqual([])
    expect(parseUtilitySegments({ roomNumber: "113" })).toEqual([])
    expect(parseUtilitySegments(42)).toEqual([])
  })

  it("สมาชิกที่ไม่ใช่ object หรือไม่มีเลขห้อง ต้องถูกคัดออก (แสดงบนใบก็อ่านไม่รู้เรื่อง)", () => {
    const out = parseUtilitySegments([null, "x", 1, {}, { roomNumber: "" }, { roomNumber: "113" }])
    expect(out).toHaveLength(1)
    expect(out[0].roomNumber).toBe("113")
  })

  it("ตัวเลขที่มาเป็น string (numeric ของ Postgres ทำได้จริง) ต้องถูกแปลงเป็นตัวเลข", () => {
    const out = parseUtilitySegments([{
      roomNumber: "113", elecAmount: "819.50", waterAmount: "216", elecUnits: "117"
    }])
    expect(out[0].elecAmount).toBe(819.5)
    expect(out[0].waterAmount).toBe(216)
    expect(out[0].elecUnits).toBe(117)
  })

  it("ค่าเสียหายที่แปลงเป็นตัวเลขไม่ได้ ต้องเป็น 0 ไม่ใช่ NaN — NaN จะทำให้ยอดรวมทั้งใบเป็น NaN", () => {
    const out = parseUtilitySegments([{ roomNumber: "113", elecAmount: "ไม่ใช่ตัวเลข", waterAmount: null }])
    expect(out[0].elecAmount).toBe(0)
    expect(out[0].waterAmount).toBe(0)
  })

  it("rentIncluded = false ต้องบังคับให้ค่าเช่าเป็น 0 แม้ในข้อมูลจะมีตัวเลขติดมา", () => {
    const out = parseUtilitySegments([{ roomNumber: "113", rentIncluded: false, rentAmount: 2800 }])
    expect(out[0].rentAmount).toBe(0)
  })

  it("รหัสอาคารที่เป็นช่องว่างล้วน ต้องกลายเป็น null (ไม่ให้ขึ้นวงเล็บเปล่าบนใบ)", () => {
    const out = parseUtilitySegments([{ roomNumber: "113", buildingCode: "   " }])
    expect(out[0].buildingCode).toBeNull()
  })
})

describe("sumSegments", () => {
  it("แยกค่าเช่าออกจากค่าน้ำ-ไฟ เพราะฐาน VAT ไม่เหมือนกัน", () => {
    const withRent: BillUtilitySegment = { ...fullSegment, rentIncluded: true, rentAmount: 2800 }
    const totals = sumSegments([withRent])
    expect(totals.utility).toBe(1035)   // 819 + 216
    expect(totals.rent).toBe(2800)
    expect(totals.total).toBe(3835)
  })

  it("ย้ายหลายครั้งในเดือนเดียว ต้องรวมทุกช่วง (ห้าม logic ไปหยิบแค่ช่วงแรก)", () => {
    const second: BillUtilitySegment = { ...fullSegment, roomNumber: "205", elecAmount: 350, waterAmount: 90 }
    const totals = sumSegments([fullSegment, second])
    expect(totals.elec).toBe(1169)
    expect(totals.water).toBe(306)
    expect(totals.total).toBe(1475)
  })

  it("ไม่มี segment ต้องได้ 0 ทุกช่อง", () => {
    expect(sumSegments([])).toEqual({ rent: 0, utility: 0, elec: 0, water: 0, total: 0 })
  })
})

describe("buildSegmentFromTransfer", () => {
  const row = {
    id: "tr-9",
    from_room_number: "113",
    transfer_date: "2026-08-15",
    closing_elec_prev: "9042",
    closing_elec_curr: "9159",
    closing_elec_units: "117",
    closing_elec_rate: "7",
    closing_elec_amount: "819",
    closing_elec_min_applied: false,
    closing_water_prev: "100",
    closing_water_curr: "112",
    closing_water_units: "12",
    closing_water_rate: "18",
    closing_water_amount: "216",
    closing_water_min_applied: false,
    include_old_room_rent: true,
    old_room_rent_amount: "2800"
  }

  it("แปลงแถวประวัติการย้ายเป็น segment ได้ครบทุกช่อง", () => {
    const seg = buildSegmentFromTransfer(row, "A")
    expect(seg.roomNumber).toBe("113")
    expect(seg.buildingCode).toBe("A")
    expect(seg.elecUnits).toBe(117)
    expect(seg.elecAmount).toBe(819)
    expect(seg.rentIncluded).toBe(true)
    expect(seg.rentAmount).toBe(2800)
    expect(seg.transferId).toBe("tr-9")
  })

  it("วันย้ายต้องตัดเหลือ YYYY-MM-DD (Postgres date อาจส่ง timestamp มา)", () => {
    const seg = buildSegmentFromTransfer({ ...row, transfer_date: "2026-08-15T00:00:00+07:00" }, null)
    expect(seg.toDate).toBe("2026-08-15")
  })

  it("เลือก \"ไม่รวมค่าเช่า\" ต้องได้ 0 แม้คอลัมน์จะมีตัวเลขค้างอยู่", () => {
    const seg = buildSegmentFromTransfer({ ...row, include_old_room_rent: false }, "A")
    expect(seg.rentAmount).toBe(0)
    expect(seg.rentIncluded).toBe(false)
  })
})

describe("groupSegmentsByBillRoom", () => {
  /** ยอดขั้นต่ำที่ทำให้แถวนับเป็น "คิดยอดไว้แล้ว" */
  const amounts = { closing_elec_amount: 100, closing_water_amount: 50 }

  const aToB = {
    id: "tr-A2B", tenant_id: "tenant-1", from_room_id: "room-A", from_room_number: "A101",
    to_room_id: "room-B", transfer_date: "2026-08-05", ...amounts
  }
  const bToC = {
    id: "tr-B2C", tenant_id: "tenant-1", from_room_id: "room-B", from_room_number: "B202",
    to_room_id: "room-C", transfer_date: "2026-08-20", ...amounts
  }
  const codes = new Map<string, string | null>([["room-A", "A"], ["room-B", "B"]])

  it("ย้ายครั้งเดียว ต้องไปอยู่กับบิลของห้องปลายทาง", () => {
    const out = groupSegmentsByBillRoom([aToB], codes, ["room-B"])
    expect(out.get("room-B")).toHaveLength(1)
    expect(out.get("room-B")?.[0].roomNumber).toBe("A101")
  })

  it("ย้าย A→B→C ในเดือนเดียว ทุกส่วนต้องไปรวมที่บิลห้อง C ห้องเดียว", () => {
    // ถ้าผูกกับ to_room_id ตรง ๆ ส่วนของ A จะไปอยู่กับบิลห้อง B ซึ่งปลายเดือนไม่มีผู้เช่า
    // จึงไม่มีบิล → ค่าน้ำ-ไฟห้อง A หายไปทั้งก้อนโดยไม่มีอะไรฟ้อง
    const out = groupSegmentsByBillRoom([aToB, bToC], codes, ["room-B", "room-C"])
    expect(out.get("room-B")).toBeUndefined()
    const onC = out.get("room-C")
    expect(onC).toHaveLength(2)
    expect(onC?.map(s => s.roomNumber)).toEqual(["A101", "B202"])
  })

  it("ถามแค่ห้อง C ก็ยังต้องได้ครบทั้งสองส่วน (ขาแรกของโซ่ปลายทางไม่ใช่ C)", () => {
    const out = groupSegmentsByBillRoom([aToB, bToC], codes, ["room-C"])
    expect(out.get("room-C")).toHaveLength(2)
  })

  it("ผู้เช่าคนละคนต้องไม่ปนกัน แม้ย้ายผ่านห้องเดียวกันในเดือนเดียว", () => {
    const otherTenant = {
      id: "tr-X", tenant_id: "tenant-2", from_room_id: "room-D", from_room_number: "D404",
      to_room_id: "room-B", transfer_date: "2026-08-25", ...amounts
    }
    const out = groupSegmentsByBillRoom([aToB, bToC, otherTenant], codes, ["room-B", "room-C"])
    expect(out.get("room-C")?.map(s => s.roomNumber)).toEqual(["A101", "B202"])
    expect(out.get("room-B")?.map(s => s.roomNumber)).toEqual(["D404"])
  })

  it("แถวเก่าที่ยังไม่มียอด (ยอดอยู่ในบิล -TRANSFER) ต้องไม่ถูกนับซ้ำ", () => {
    const legacy = { ...aToB, closing_elec_amount: null, closing_water_amount: null }
    const out = groupSegmentsByBillRoom([legacy], codes, ["room-B"])
    expect(out.size).toBe(0)
  })

  it("แถวที่ไม่มี tenant_id (ข้อมูลเก่า) ให้ผูกกับปลายทางของตัวเอง ไม่ใช่หายไป", () => {
    const noTenant = { ...aToB, tenant_id: null }
    const out = groupSegmentsByBillRoom([noTenant], codes, ["room-B"])
    expect(out.get("room-B")).toHaveLength(1)
  })

  it("ห้องที่ไม่ได้อยู่ในรายการที่จะออกบิล ต้องไม่ถูกคำนวณ", () => {
    const out = groupSegmentsByBillRoom([aToB], codes, ["room-Z"])
    expect(out.size).toBe(0)
  })
})

describe("hasSegmentAmounts", () => {
  it("แถวเก่าที่ยอดไปอยู่ในบิล -TRANSFER แล้ว ต้องถูกข้าม ไม่กลายเป็นรายการย่อย 0 บาท", () => {
    expect(hasSegmentAmounts({ closing_elec_amount: null, closing_water_amount: null })).toBe(false)
    expect(hasSegmentAmounts({})).toBe(false)
  })

  it("แถวที่คิดยอดไว้แล้วต้องผ่าน — รวมกรณียอดเป็น 0 จริง (ใช้น้ำ-ไฟ 0 หน่วยเกิดขึ้นได้)", () => {
    expect(hasSegmentAmounts({ closing_elec_amount: 0, closing_water_amount: 0 })).toBe(true)
  })
})

describe("formatSegmentRoomLabel", () => {
  it("กำกับรหัสอาคารเสมอเมื่อมี — บนใบผู้เช่าไม่มีบริบทว่าในหอมีเลขห้องซ้ำหรือไม่", () => {
    expect(formatSegmentRoomLabel(fullSegment)).toBe("ห้อง 113 (A)")
    expect(formatSegmentRoomLabel({ ...fullSegment, buildingCode: null })).toBe("ห้อง 113")
  })
})

describe("resolveBillLines กับ segment", () => {
  /** บิลห้องใหม่: ค่าเช่า 6,000 + ไฟ 350 + น้ำ 90 + ส่วนกลาง 50 + ส่วนห้องเดิม 1,035 */
  const billWithSegment = {
    hasSnapshot: true,
    amount: 7525,
    baseRent: 6000,
    electricUnits: 50,
    electricRate: 7,
    electricAmount: 350,
    waterUnits: 5,
    waterRate: 18,
    waterAmount: 90,
    commonFee: 50,
    utilitySegments: [fullSegment]
  }

  it("ผลบวกทุกบรรทัดต้องเท่ายอดรวมที่เก็บไว้ — ถ้าไม่รวม segment จะขาดไป 1,035", () => {
    const lines = resolveBillLines(billWithSegment)
    expect(lines.segmentUtilitySum).toBe(1035)
    expect(lines.lineSum).toBe(7525)
    expect(lines.lineSum).toBe(billWithSegment.amount)
  })

  it("ค่าเช่าของห้องปัจจุบันต้องไม่ถูกกลืนเข้าไปในยอดของห้องเดิม", () => {
    const lines = resolveBillLines(billWithSegment)
    expect(lines.rent).toBe(6000)
    expect(lines.elecAmount).toBe(350)
  })

  it("บิลปกติ (ไม่มี segment) ต้องได้ผลเหมือนเดิมเป๊ะ", () => {
    const plain = { ...billWithSegment, amount: 6490, utilitySegments: [] }
    const lines = resolveBillLines(plain)
    expect(lines.segments).toEqual([])
    expect(lines.segmentUtilitySum).toBe(0)
    expect(lines.lineSum).toBe(6490)
  })

  it("บิลเก่าที่ไม่มี snapshot ต้องหักยอด segment ออกจากค่าเช่าที่คำนวณย้อน ไม่งั้นค่าเช่าเฟ้อ", () => {
    const legacy = { ...billWithSegment, hasSnapshot: false }
    const lines = resolveBillLines(legacy)
    expect(lines.rent).toBe(6000)
    expect(lines.lineSum).toBe(7525)
  })
})

describe("calculateBillTotal กับส่วนของห้องเดิม", () => {
  const base = {
    baseRent: 6000,
    electricUnitsUsed: 50,
    waterUnitsUsed: 5,
    electricRate: 7,
    waterRate: 18,
    commonFee: 50,
    otherServiceAmount: 0,
    extraExpensesSum: 0,
    waiveWaterMin: true,
    waterMinChecked: false,
    waterMinUnit: 0,
    waiveElectricMin: true,
    electricMinChecked: false,
    electricMinUnit: 0
  }

  it("บิลปกติต้องได้ยอดเท่าเดิมทุกบาท (ไม่ส่งค่าใหม่มา = ไม่เปลี่ยนอะไร)", () => {
    expect(calculateBillTotal(base).total).toBe(6490)
  })

  it("ค่าน้ำ-ไฟห้องเดิมต้องบวกเข้ายอดรวม", () => {
    expect(calculateBillTotal({ ...base, transferUtilitySum: 1035 }).total).toBe(7525)
  })

  it("ค่าน้ำ-ไฟห้องเดิมต้องเข้าฐาน VAT ด้วย — ไม่งั้นหอที่จด VAT เก็บ VAT ขาด", () => {
    const withVat = calculateBillTotal({
      ...base, transferUtilitySum: 1000, vatApplies: true, vatRate: 0.07
    })
    // ฐาน VAT = ไฟ 350 + น้ำ 90 + ส่วนกลาง 50 + ส่วนห้องเดิม 1000 = 1490
    expect(withVat.vatableBase).toBe(1490)
    expect(withVat.vatAmount).toBe(104.3)
  })

  it("ค่าเช่าห้องเดิมต้องบวกยอดรวมแต่ห้ามเข้าฐาน VAT (ค่าเช่าเป็น 40(5) ยกเว้น VAT)", () => {
    const withVat = calculateBillTotal({
      ...base, transferRentSum: 2800, vatApplies: true, vatRate: 0.07
    })
    expect(withVat.vatableBase).toBe(490)   // ไฟ+น้ำ+ส่วนกลาง เท่าเดิม
    expect(withVat.total).toBe(6490 + 2800 + withVat.vatAmount)
  })
})

describe("computeMidMonthRent", () => {
  it("นโยบายเฉลี่ยรายวัน: คิดตามจำนวนวันที่อยู่ (ตัวหาร 30 คงที่ตามพฤติกรรมที่ใช้เก็บเงินจริงมาแล้ว)", () => {
    expect(computeMidMonthRent(6000, "2026-08-15", "DAILY_PRORATE")).toBe(3000)
    expect(computeMidMonthRent(6000, "2026-08-01", "DAILY_PRORATE")).toBe(200)
  })

  it("นโยบายคิดเต็มเดือน: ได้ค่าเช่าเต็มไม่ว่าย้ายวันไหน", () => {
    expect(computeMidMonthRent(6000, "2026-08-15", "FULL_MONTH")).toBe(6000)
    expect(computeMidMonthRent(6000, "2026-08-01", "FULL_MONTH")).toBe(6000)
  })

  it("ห้องที่ไม่ได้ตั้งค่าเช่าไว้ ต้องได้ 0 ไม่ใช่ NaN", () => {
    expect(computeMidMonthRent(0, "2026-08-15", "DAILY_PRORATE")).toBe(0)
  })
})
