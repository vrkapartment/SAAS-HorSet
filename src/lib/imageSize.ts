/**
 * อ่านชนิดและขนาดภาพจากไบต์ของไฟล์โดยตรง (ไม่พึ่ง library ภายนอก)
 *
 * ใช้ตรวจภาพ LINE Rich Menu ก่อนส่งขึ้น LINE เพราะ LINE ปฏิเสธด้วย error กำกวมมาก
 * เมื่อขนาดภาพไม่ตรงกับ size ที่ประกาศไว้ใน rich menu — ตรวจเองก่อนแล้วบอกสาเหตุให้ชัด
 * ดีกว่าปล่อยให้ผู้ใช้เจอ "400 Bad Request" เปล่า ๆ
 */

export type ImageInfo = {
  /** MIME type ที่ใช้เป็น Content-Type ตอนอัปโหลดขึ้น LINE */
  type: "image/png" | "image/jpeg"
  width: number
  height: number
}

const PNG_SIGNATURE = "89504e470d0a1a0a"

export function readImageInfo(buffer: Buffer): ImageInfo | null {
  // PNG: signature 8 ไบต์ แล้ว chunk IHDR เก็บ width/height เป็น big-endian 4 ไบต์ที่ offset 16/20
  if (buffer.length > 24 && buffer.toString("hex", 0, 8) === PNG_SIGNATURE) {
    return {
      type: "image/png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    }
  }

  // JPEG: ไล่ marker ทีละช่วงจนเจอ SOFn (0xFFC0-0xFFCF ยกเว้น C4/C8/CC) ซึ่งเก็บ height/width ต่อท้าย
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = buffer[offset + 1]
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) {
        return {
          type: "image/jpeg",
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7)
        }
      }
      offset += 2 + buffer.readUInt16BE(offset + 2)
    }
    // เป็น JPEG แน่ แต่หา SOF ไม่เจอ — คืนขนาด 0 ให้ฝั่งเรียกตัดสินใจว่าจะปล่อยผ่านหรือปฏิเสธ
    return { type: "image/jpeg", width: 0, height: 0 }
  }

  return null
}
