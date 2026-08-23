import { describe, expect, it } from "vitest"
import { findDuplicateRoomNumbers, formatRoomLabel, getRoomFloor } from "../utils"
import { buildInvoiceId } from "../../billing/utils"

/**
 * กฎความปลอดภัยของ "เลขห้องซ้ำข้ามอาคาร"
 *
 * ทั้งไฟล์นี้คุมพฤติกรรมที่ถ้าพลาดแล้วข้อมูลจะไปลงห้องผิดแบบเงียบ ๆ — ไม่มี error ไม่มีใครรู้
 * จนกว่าผู้เช่าจะทักมาว่าบิลผิด ดู database_patch_room_id_identity_1_additive.sql
 */

describe("findDuplicateRoomNumbers", () => {
  it("หอที่ไม่มีเลขห้องซ้ำ ต้องได้ set ว่าง (หน้าตา UI จะไม่เปลี่ยนเลย)", () => {
    const dups = findDuplicateRoomNumbers([
      { roomNumber: "101" },
      { roomNumber: "102" },
      { roomNumber: "201" }
    ])
    expect(dups.size).toBe(0)
  })

  it("จับเฉพาะเลขห้องที่ซ้ำ ไม่เหวี่ยงไปโดนเลขที่ไม่ซ้ำ", () => {
    const dups = findDuplicateRoomNumbers([
      { roomNumber: "101" },
      { roomNumber: "102" },
      { roomNumber: "101" },
      { roomNumber: "203" }
    ])
    expect([...dups]).toEqual(["101"])
  })

  it("ซ้ำสามอาคารก็ยังนับเป็นรายการเดียว", () => {
    const dups = findDuplicateRoomNumbers([
      { roomNumber: "101" },
      { roomNumber: "101" },
      { roomNumber: "101" }
    ])
    expect([...dups]).toEqual(["101"])
  })
})

describe("formatRoomLabel", () => {
  const dups = new Set(["101"])

  it("เลขห้องที่ไม่ซ้ำ ต้องไม่ถูกเติมอะไรต่อท้าย", () => {
    expect(formatRoomLabel("102", dups, { code: "A" })).toBe("102")
  })

  it("เลขห้องที่ซ้ำ ต้องกำกับรหัสอาคาร", () => {
    expect(formatRoomLabel("101", dups, { code: "A" })).toBe("101 (A)")
    expect(formatRoomLabel("101", dups, { code: "B" })).toBe("101 (B)")
  })

  it("ยังไม่ได้ตั้งรหัสอาคาร ให้ถอยไปใช้ชื่ออาคาร", () => {
    expect(formatRoomLabel("101", dups, { code: null, name: "ตึกหน้า" })).toBe("101 (ตึกหน้า)")
    expect(formatRoomLabel("101", dups, { code: "   ", name: "ตึกหลัง" })).toBe("101 (ตึกหลัง)")
  })

  it("ไม่มีข้อมูลอาคารเลย ต้องไม่แสดงวงเล็บเปล่า", () => {
    expect(formatRoomLabel("101", dups, null)).toBe("101")
    expect(formatRoomLabel("101", dups, { code: null, name: null })).toBe("101")
  })
})

describe("getRoomFloor", () => {
  const rooms = [
    { id: "room-a", roomNumber: "101", floor: "1" },
    { id: "room-b", roomNumber: "101", floor: "5" }
  ]

  it("จับด้วย roomId ก่อน — ห้องเลขเดียวกันคนละอาคารต้องได้ชั้นของตัวเอง", () => {
    expect(getRoomFloor({ roomId: "room-a", roomNumber: "101" }, rooms)).toBe("1")
    expect(getRoomFloor({ roomId: "room-b", roomNumber: "101" }, rooms)).toBe("5")
  })

  it("ไม่มี roomId ให้ถอยไปเทียบเลขห้องได้ (ข้อมูลเก่าที่ยังไม่มี roomId)", () => {
    expect(getRoomFloor({ roomNumber: "101" }, rooms)).toBe("1")
  })

  it("roomId ที่ไม่ตรงกับห้องไหน ต้องถอยไปเทียบเลขห้อง ไม่ใช่พังหรือคืนค่าว่าง", () => {
    expect(getRoomFloor({ roomId: "ไม่มีจริง", roomNumber: "101" }, rooms)).toBe("1")
  })

  it("ห้องที่ไม่ได้ตั้งชั้นไว้ ให้เดาจากเลขห้องแบบเดิม", () => {
    expect(getRoomFloor({ roomNumber: "1203" }, [])).toBe("12")
    expect(getRoomFloor({ roomNumber: "A101" }, [])).toBe("1")
  })
})

describe("buildInvoiceId", () => {
  it("มีรหัสอาคาร ต้องแทรกไว้ระหว่างรอบบิลกับเลขห้อง", () => {
    expect(buildInvoiceId("2026-08", "101", "A")).toBe("INV-202608-A-101")
  })

  it("ห้องเลขเดียวกันคนละอาคาร ต้องได้เลขใบกำกับต่างกัน", () => {
    expect(buildInvoiceId("2026-08", "101", "A")).not.toBe(buildInvoiceId("2026-08", "101", "B"))
  })

  it("ไม่มีรหัสอาคาร ให้คงรูปแบบเดิม (บิลเก่าที่ออกไปแล้วเลขไม่เปลี่ยน)", () => {
    expect(buildInvoiceId("2026-08", "101")).toBe("INV-202608-101")
    expect(buildInvoiceId("2026-08", "101", null)).toBe("INV-202608-101")
    expect(buildInvoiceId("2026-08", "101", "  ")).toBe("INV-202608-101")
  })
})
