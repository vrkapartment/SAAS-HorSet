import { describe, expect, it } from "vitest"
import { auditChanges } from "../labels"

/**
 * ตรรกะการแสดงผล audit log
 *
 * ทดสอบเพราะเป็นเรื่อง "หลักฐาน" — ถ้าซ่อนพลาดไปข้อหนึ่ง log จะไม่ครบ
 * และคนที่แก้เลขจริงจะรอดไปโดยไม่มีใครเห็น
 */

const base = {
  action: "UPDATE",
  changedFields: null as string[] | null,
  before: null as Record<string, unknown> | null,
  after: null as Record<string, unknown> | null
}

describe("auditChanges — เหตุการณ์แก้ไข", () => {
  it("แสดงเฉพาะฟิลด์ที่ trigger บอกว่าเปลี่ยน", () => {
    const changes = auditChanges({
      ...base,
      changedFields: ["penalty_amount"],
      before: { penalty_amount: 300 },
      after: { penalty_amount: 0 }
    })

    expect(changes).toHaveLength(1)
    expect(changes[0].label).toBe("ค่าปรับล่าช้า")
    expect(changes[0].before).toBe(300)
    expect(changes[0].after).toBe(0)
  })

  it("ไม่ซ่อน id หรือ uuid ตอนแก้ไข เพราะการย้ายห้อง/ย้ายหอเป็นเรื่องต้องรู้", () => {
    const changes = auditChanges({
      ...base,
      changedFields: ["workspace_id"],
      before: { workspace_id: "11111111-2222-3333-4444-555555555555" },
      after: { workspace_id: "66666666-7777-8888-9999-000000000000" }
    })

    expect(changes.map(c => c.field)).toEqual(["workspace_id"])
  })
})

describe("auditChanges — เหตุการณ์เพิ่ม/ลบ", () => {
  it("ซ่อน id และเวลาที่ระบบใส่ให้เอง", () => {
    const changes = auditChanges({
      ...base,
      action: "INSERT",
      after: {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        created_at: "2026-09-08T10:00:00Z",
        updated_at: "2026-09-08T10:00:00Z",
        workspace_id: "11111111-2222-3333-4444-555555555555",
        title: "ค่าน้ำประปา",
        amount: 1200
      }
    })

    expect(changes.map(c => c.field)).toEqual(["title", "amount"])
  })

  it("ซ่อน uuid อ้างอิงที่คนอ่านไม่ได้ประโยชน์ แต่เก็บค่าที่อ่านได้ไว้ทั้งหมด", () => {
    const changes = auditChanges({
      ...base,
      action: "DELETE",
      before: {
        room_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        tenant_name: "สมชาย",
        deposit_paid: 4000
      }
    })

    expect(changes.map(c => c.field)).toEqual(["tenant_name", "deposit_paid"])
  })
})

describe("auditChanges — สิทธิ์การใช้งาน", () => {
  it("กาง permissions ออกเป็นข้อย่อย และโชว์เฉพาะข้อที่เปลี่ยน", () => {
    const changes = auditChanges({
      ...base,
      changedFields: ["permissions"],
      before: { permissions: { manage_finance_settings_edit: false, manage_bills: true } },
      after: { permissions: { manage_finance_settings_edit: true, manage_bills: true } }
    })

    expect(changes).toHaveLength(1)
    expect(changes[0].label).toBe("สิทธิ์: แก้ตั้งค่าการเงิน")
    expect(changes[0].before).toBe(false)
    expect(changes[0].after).toBe(true)
  })

  it("ตอนเพิ่มพนักงานใหม่ โชว์สิทธิ์ทุกข้อ เพื่อให้เห็นว่าให้อะไรไปบ้าง", () => {
    const changes = auditChanges({
      ...base,
      action: "INSERT",
      after: { permissions: { manage_bills: true, view_dashboard_stats: false } }
    })

    expect(changes.map(c => c.label)).toEqual([
      "สิทธิ์: ดูแดชบอร์ดสถิติภาพรวม",
      "สิทธิ์: ดูใบแจ้งหนี้"
    ])
  })

  it("ถ้า permissions ไม่ใช่ object (ถูกตัดเพราะยาวเกิน) ยังต้องแสดงให้เห็น ไม่หายไปเงียบ ๆ", () => {
    const changes = auditChanges({
      ...base,
      changedFields: ["permissions"],
      before: { permissions: "(ข้อมูลยาวเกิน)" },
      after: { permissions: "(ข้อมูลยาวเกิน)" }
    })

    expect(changes).toHaveLength(1)
    expect(changes[0].label).toBe("สิทธิ์การใช้งาน")
  })
})

describe("auditChanges — สิทธิ์ที่กางไม่ได้", () => {
  it("ถ้าค่าใหม่ถูกตัดเหลือข้อความ ห้ามกางข้างเดียวจนดูเหมือนถอดสิทธิ์ทุกข้อ", () => {
    const changes = auditChanges({
      ...base,
      changedFields: ["permissions"],
      before: { permissions: { manage_bills: true, view_dashboard_stats: true } },
      after: { permissions: "(ข้อมูลยาวเกิน)" }
    })

    expect(changes).toHaveLength(1)
    expect(changes[0].label).toBe("สิทธิ์การใช้งาน")
    expect(changes[0].after).toBe("(ข้อมูลยาวเกิน)")
  })
})
