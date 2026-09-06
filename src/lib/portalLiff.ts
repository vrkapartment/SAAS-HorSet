/**
 * ตัวเชื่อมระหว่าง rich menu ของ LINE กับหน้าพอร์ทัลผู้เช่า
 *
 * ปุ่มใน rich menu ส่ง `?to=portal&action=...` มาที่หน้า /tenant-register ซึ่งเป็น LIFF Endpoint URL
 * ของ channel อยู่แล้ว (กฎของ LIFF: หน้าที่เรียก liff.login() ต้องอยู่ใต้ endpoint เท่านั้น
 * — ดู docs/line-rich-menu/README.md) หน้านั้นจะหาห้องของผู้เช่าผ่าน /api/portal-resolve
 * แล้วเด้งต่อมาที่ /portal พร้อม token ซึ่งไม่ต้องใช้ LIFF อีกเลย
 *
 * ไฟล์นี้เก็บ "รายการ action ที่รองรับ" ไว้จุดเดียว เพื่อให้ฝั่งที่ส่ง (tenant-register)
 * กับฝั่งที่รับ (portal) ไม่หลุดจากกันเวลาเพิ่มปุ่มใหม่
 */

export type PortalRoomOption = {
  workspaceId: string
  workspaceName: string
  roomId: string
  roomNumber: string
  token: string
}

/** รูปแบบผลลัพธ์จาก /api/portal-resolve */
export type PortalResolveResponse = {
  success?: boolean
  status?: "resolved" | "multiple" | "not_registered"
  error?: string
  room?: PortalRoomOption
  rooms?: PortalRoomOption[]
}

/** "bill" = เปิดหน้าบิลเฉย ๆ ที่เหลือ = เลื่อนจอไปยังการ์ดนั้นในหน้า /portal */
export const PORTAL_ACTIONS = ["bill", "qr", "slip", "history"] as const
export type PortalAction = (typeof PORTAL_ACTIONS)[number]

/**
 * การ์ดในหน้า /portal ที่ต้องเลื่อนไปหา
 *
 * เหลือแค่ "slip" — "history" กับ "qr" กลายเป็นหน้าของตัวเองแล้ว จึงเป็นปลายทาง
 * ไม่ใช่ตำแหน่งให้เลื่อนหา ส่วน "bill" คืออยู่หัวหน้าบิลตามปกติ
 */
export type PortalFocusAction = Exclude<PortalAction, "bill" | "history" | "qr">

export function normalizePortalAction(raw: string): PortalAction {
  const lowered = raw.trim().toLowerCase()
  return (PORTAL_ACTIONS as readonly string[]).includes(lowered) ? (lowered as PortalAction) : "bill"
}

/** แปลงค่า ?action= ที่หน้า /portal ได้รับ ให้เป็นการ์ดที่ต้องเลื่อนไปหา (null = ไม่เจาะจง) */
export function parsePortalFocusAction(raw: string): PortalFocusAction | null {
  return normalizePortalAction(raw) === "slip" ? "slip" : null
}

/** หน้าแยกของแต่ละ action — ที่ไม่อยู่ในนี้คือการ์ดในหน้าบิลเดียวกัน */
const ACTION_PAGES: Partial<Record<PortalAction, string>> = {
  history: "/portal/history",
  qr: "/portal/qr"
}

export function buildPortalUrl(room: PortalRoomOption, action: PortalAction): string {
  const params = new URLSearchParams({
    workspace_id: room.workspaceId,
    room_id: room.roomId,
    token: room.token
  })

  const page = ACTION_PAGES[action]
  if (page) {
    return `${page}?${params.toString()}`
  }
  if (action !== "bill") {
    params.set("action", action)
  }
  return `/portal?${params.toString()}`
}
