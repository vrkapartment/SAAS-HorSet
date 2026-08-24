import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

/**
 * สัญญาของ middleware — ใครเข้าหน้าไหนได้ และลิงก์แบบไหนเข้า /portal ได้โดยไม่ต้องล็อกอิน
 *
 * ⚠️ ทำไมต้องมีเทสต์ชุดนี้
 *
 * เคยเกิดจริง: เปลี่ยนลิงก์ดูบิลจาก ?room_number= เป็น ?room_id= ทุกจุดที่สร้างลิงก์ แต่ลืมแก้
 * middleware ที่เป็นด่านตัดสินว่า "เข้าได้โดยไม่ต้องล็อกอินหรือไม่" ผลคือลิงก์ที่ระบบออกให้
 * 100% เด้งไปหน้า login ผู้เช่าเปิดบิลไม่ได้เลย
 *
 * ชื่อ query param เป็นแค่ string ไม่มีอะไรผูกฝั่งสร้างลิงก์กับฝั่งตรวจลิงก์เข้าหากัน —
 * tsc/เทสต์ยูนิตของ business logic จับไม่ได้ทั้งคู่ เทสต์ชุดนี้คือตัวล็อกสัญญานั้นไว้
 */

const BASE = "https://app.example.com"

function req(path: string, opts: { role?: string; query?: Record<string, string> } = {}) {
  const url = new URL(path, BASE)
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v)
  const headers = new Headers()
  if (opts.role) headers.set("cookie", `horset_user_role=${opts.role}`)
  return new NextRequest(url, { headers })
}

/** middleware เด้งไป login หรือไม่ */
async function redirectsToLogin(request: NextRequest): Promise<boolean> {
  const res = await updateSession(request)
  const location = res.headers.get("location")
  return !!location && new URL(location, BASE).pathname === "/login"
}

describe("/portal — ลิงก์ดูบิลแบบไม่ต้องล็อกอิน", () => {
  const token = "a".repeat(64)

  it("ลิงก์รูปแบบปัจจุบัน (room_id) ต้องเข้าได้โดยไม่เด้งไป login", async () => {
    const r = req("/portal", { query: { workspace_id: "ws-1", room_id: "room-1", token } })
    expect(await redirectsToLogin(r)).toBe(false)
  })

  it("ลิงก์รูปแบบเก่า (room_number) ที่ยังค้างใน LINE ต้องยังเข้าได้", async () => {
    const r = req("/portal", { query: { workspace_id: "ws-1", room_number: "101", token } })
    expect(await redirectsToLogin(r)).toBe(false)
  })

  it("ไม่มี token → ต้องเด้งไป login (token คือตัวตัดสินสิทธิ์จริง)", async () => {
    const r = req("/portal", { query: { workspace_id: "ws-1", room_id: "room-1" } })
    expect(await redirectsToLogin(r)).toBe(true)
  })

  it("ไม่มี workspace_id → ต้องเด้งไป login", async () => {
    const r = req("/portal", { query: { room_id: "room-1", token } })
    expect(await redirectsToLogin(r)).toBe(true)
  })

  it("ไม่มีตัวระบุห้องเลย → ต้องเด้งไป login", async () => {
    const r = req("/portal", { query: { workspace_id: "ws-1", token } })
    expect(await redirectsToLogin(r)).toBe(true)
  })

  it("/portal เปล่า ๆ ไม่มี query → ต้องเด้งไป login", async () => {
    expect(await redirectsToLogin(req("/portal"))).toBe(true)
  })

  it("ผู้เช่าที่ล็อกอินแล้ว เข้า /portal ได้โดยไม่ต้องมี token", async () => {
    expect(await redirectsToLogin(req("/portal", { role: "tenant" }))).toBe(false)
  })
})

describe("/portal — สิทธิ์ตามบทบาท", () => {
  it("แอดมิน/สตาฟ ที่ไม่มีลิงก์ token เข้า /portal ไม่ได้", async () => {
    expect(await redirectsToLogin(req("/portal", { role: "admin" }))).toBe(true)
    expect(await redirectsToLogin(req("/portal", { role: "staff" }))).toBe(true)
  })
})

describe("หน้าอื่น ๆ — กันคนไม่มีสิทธิ์", () => {
  const cases: { path: string; allowed: string[]; blocked: string[] }[] = [
    { path: "/dashboard", allowed: ["admin", "super_admin"], blocked: ["staff", "tenant"] },
    { path: "/tax", allowed: ["admin", "super_admin"], blocked: ["staff", "tenant"] },
    { path: "/billing", allowed: ["staff", "admin", "super_admin"], blocked: ["tenant"] },
    { path: "/manage-bills", allowed: ["staff", "admin", "super_admin"], blocked: ["tenant"] },
    { path: "/rooms", allowed: ["admin", "staff", "super_admin"], blocked: ["tenant"] },
    { path: "/tenants", allowed: ["admin", "staff", "super_admin"], blocked: ["tenant"] },
    { path: "/super-admin", allowed: ["super_admin"], blocked: ["admin", "staff", "tenant"] },
    { path: "/super-admin/plans", allowed: ["super_admin"], blocked: ["admin", "staff", "tenant"] },
  ]

  for (const c of cases) {
    for (const role of c.allowed) {
      it(`${c.path} — ${role} เข้าได้`, async () => {
        expect(await redirectsToLogin(req(c.path, { role }))).toBe(false)
      })
    }
    for (const role of c.blocked) {
      it(`${c.path} — ${role} เข้าไม่ได้`, async () => {
        expect(await redirectsToLogin(req(c.path, { role }))).toBe(true)
      })
    }
    it(`${c.path} — ยังไม่ล็อกอิน เข้าไม่ได้`, async () => {
      expect(await redirectsToLogin(req(c.path))).toBe(true)
    })
  }
})
