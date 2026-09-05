/**
 * ค่ากลางของ LINE LIFF / LINE OA ที่ระบบใช้เป็นค่าเริ่มต้น
 *
 * workspace ที่ยังไม่ได้ตั้ง LINE OA ของตัวเอง (workspace_line_settings.liff_id ว่าง) จะถอยมาใช้
 * LIFF และบอทกลางของ HorSet ชุดนี้ — ค่าเดิมเคย hardcode ซ้ำอยู่หลายไฟล์ จึงย้ายมารวมจุดเดียว
 * เพื่อไม่ให้แก้ตกหล่นเวลาเปลี่ยน OA กลาง และ override ได้ผ่าน env โดยไม่ต้องแก้โค้ด
 */
export const DEFAULT_LIFF_ID =
  process.env.NEXT_PUBLIC_LINE_DEFAULT_LIFF_ID || "2010442620-H4josaDy"

export const DEFAULT_BOT_BASIC_ID =
  process.env.NEXT_PUBLIC_LINE_DEFAULT_BOT_BASIC_ID || "@423xmlwo"

export const DEFAULT_BOT_DISPLAY_NAME =
  process.env.NEXT_PUBLIC_LINE_DEFAULT_BOT_NAME || "แชทบิลอัตโนมัติ"

/**
 * LIFF ID มีรูปแบบ "{channelId}-{hash}" โดยส่วนหน้าคือ Channel ID ของ LINE Login channel
 * ที่ LIFF app นั้นสังกัดอยู่
 *
 * ใช้เทียบกับ client_id ที่ LINE คืนมาตอน verify access token เพื่อยืนยันว่า token ที่ส่งเข้ามา
 * ออกโดย channel ของเราจริง ไม่ใช่ของแอปอื่นที่ผู้ใช้เผลอไปกดอนุญาตไว้
 */
export function liffChannelId(liffId: string | null | undefined): string {
  if (!liffId) return ""
  const trimmed = liffId.trim()
  const dashIdx = trimmed.indexOf("-")
  if (dashIdx <= 0) return ""
  const channelId = trimmed.substring(0, dashIdx)
  return /^\d+$/.test(channelId) ? channelId : ""
}
