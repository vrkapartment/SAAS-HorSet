/**
 * ตรรกะกลางของ LINE Rich Menu — ส่วนที่ไม่แตะฐานข้อมูลและไม่ใช่ Server Action
 *
 * ทั้งหน้าตั้งค่า (ผ่าน richmenu-actions.ts) และสคริปต์ติดตั้งแบบ CLI ใช้ไฟล์นี้ร่วมกัน
 * เพื่อให้ "ผังปุ่ม + ค่าที่ต้องแทน + กฎการตรวจภาพ" มีที่มาที่เดียว ไม่หลุดจากกัน
 */

import tenantTemplate from "./richmenu-templates/tenant.json"
import superAdminTemplate from "./richmenu-templates/super-admin.json"
import { readImageInfo } from "@/lib/imageSize"

/** ข้อจำกัดของ LINE ที่ต้องเช็คก่อนยิง (ฝั่ง LINE จะตอบ error กำกวมถ้าผิด) */
export const RICHMENU_MAX_IMAGE_BYTES = 1024 * 1024

/**
 * ปุ่มหนึ่งช่องในเมนู — `action` รองรับได้หลายชนิดตามที่ LINE กำหนด
 * (uri = เปิดลิงก์, message = ส่งข้อความแทนผู้ใช้, postback = ส่ง data เข้า webhook)
 * จึงประกาศฟิลด์เฉพาะชนิดเป็น optional ให้ตรงกับไฟล์ template จริง
 */
export type RichMenuArea = {
  bounds: { x: number; y: number; width: number; height: number }
  action: {
    type: string
    label: string
    uri?: string
    text?: string
    data?: string
  }
}

export type RichMenuDefinition = {
  size: { width: number; height: number }
  selected: boolean
  name: string
  chatBarText: string
  areas: RichMenuArea[]
}

export const TENANT_RICHMENU_TEMPLATE = tenantTemplate as RichMenuDefinition
export const SUPER_ADMIN_RICHMENU_TEMPLATE = superAdminTemplate as RichMenuDefinition

/** ภาพต้นแบบที่แถมมากับระบบ ใช้เมื่อหอพักยังไม่ได้อัปโหลดภาพของตัวเอง */
export const DEFAULT_TENANT_MENU_IMAGE_PATH = "/line-richmenu/tenant-menu.png"

export type TenantMenuValues = {
  liffId: string
  workspaceId: string
  /** ปุ่มติดต่อ เช่น tel:021234567 หรือ https://line.me/R/ti/p/@xxxx */
  contactUri: string
}

/**
 * แทนค่า placeholder ในไฟล์ template แล้วคืน definition ที่ส่งขึ้น LINE ได้เลย
 *
 * โยน error ถ้ายังเหลือ placeholder ที่แทนค่าไม่ได้ — ดีกว่าปล่อยให้ LINE รับปุ่มที่มี
 * ข้อความ "{{CONTACT_URI}}" เป็น URI จริง ซึ่งผู้เช่ากดแล้วพังแบบเงียบ ๆ
 */
export function buildTenantRichMenu(values: TenantMenuValues): RichMenuDefinition {
  return applyTemplate(TENANT_RICHMENU_TEMPLATE, {
    "{{LIFF_ID}}": values.liffId,
    "{{WORKSPACE_ID}}": values.workspaceId,
    "{{CONTACT_URI}}": values.contactUri
  })
}

/** เมนูของ LINE OA ทีมงาน HorSet — ทุกปุ่มชี้ไปหน้าหลังบ้าน จึงต้องรู้แค่ URL ของแอป */
export function buildSuperAdminRichMenu(appUrl: string): RichMenuDefinition {
  return applyTemplate(SUPER_ADMIN_RICHMENU_TEMPLATE, { "{{APP_URL}}": appUrl })
}

function applyTemplate(
  template: RichMenuDefinition,
  replacements: Record<string, string>
): RichMenuDefinition {
  let json = JSON.stringify(template)
  for (const [token, value] of Object.entries(replacements)) {
    json = json.split(token).join(value)
  }

  const remaining = json.match(/\{\{[A-Z_]+\}\}/g)
  if (remaining) {
    throw new Error(`ยังมีค่าที่แทนไม่ได้ในผังเมนู: ${[...new Set(remaining)].join(", ")}`)
  }

  return JSON.parse(json) as RichMenuDefinition
}

/** แปลงเบอร์โทรของหอพักให้เป็น URI ที่กดโทรออกได้ (คืนค่าว่างถ้าไม่มีเบอร์ที่ใช้ได้) */
export function phoneToContactUri(rawPhone: string | null | undefined): string {
  const phone = (rawPhone || "").replace(/[^\d+]/g, "")
  return phone ? `tel:${phone}` : ""
}

export type ImageCheckResult =
  | { ok: true; type: "image/png" | "image/jpeg" }
  | { ok: false; error: string }

/** ตรวจว่าไบต์ภาพนี้ส่งขึ้น LINE ได้จริงตามผังเมนูที่จะใช้ */
export function checkRichMenuImage(buffer: Buffer, menu: RichMenuDefinition): ImageCheckResult {
  if (buffer.length > RICHMENU_MAX_IMAGE_BYTES) {
    const mb = (buffer.length / 1024 / 1024).toFixed(2)
    return { ok: false, error: `ภาพใหญ่เกินข้อจำกัดของ LINE (1 MB) — ไฟล์นี้ ${mb} MB` }
  }

  const info = readImageInfo(buffer)
  if (!info) {
    return { ok: false, error: "ภาพต้องเป็นไฟล์ PNG หรือ JPEG เท่านั้น" }
  }

  // JPEG ที่หา SOF ไม่เจอจะได้ 0 กลับมา — ปล่อยผ่านเรื่องขนาดแต่ยังคุมเรื่องชนิดและน้ำหนักไฟล์
  if (info.width && info.height && (info.width !== menu.size.width || info.height !== menu.size.height)) {
    return {
      ok: false,
      error:
        `ขนาดภาพไม่ตรงกับผังเมนู — ต้องเป็น ${menu.size.width}x${menu.size.height} พิกเซล ` +
        `แต่ภาพที่ส่งมาเป็น ${info.width}x${info.height}`
    }
  }

  return { ok: true, type: info.type }
}
