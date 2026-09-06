import { generatePromptPayPayload } from "@/lib/promptpay"

/**
 * สร้างภาพ QR พร้อมเพย์ที่ "บันทึกได้จริง"
 *
 * วาด QR ลง canvas แล้วคืนเป็น data URL ของไฟล์ PNG สมบูรณ์ในตัว ทำให้ผู้เช่ากดค้างที่ภาพ
 * เพื่อบันทึกลงเครื่อง หรือส่งต่อผ่าน navigator.share ได้ทันที (ภาพจาก <img src=ลิงก์ภายนอก>
 * ตรง ๆ ทำแบบนั้นไม่ได้เพราะติด CORS ตอนอ่านกลับมาเป็นไฟล์)
 *
 * ถ้าหอพักมีโลโก้จะวางทับกลาง QR บนพื้นขาวมนเพื่อไม่ให้กินพื้นที่จนสแกนไม่ติด
 *
 * ⚠️ ใช้ได้เฉพาะฝั่งเบราว์เซอร์ (ต้องมี Image + canvas)
 */

const QR_SIZE = 500
/** ขนาดพื้นขาวรองโลโก้ — ใหญ่กว่าโลโก้เล็กน้อยให้ขอบไม่ติดกับลาย QR */
const LOGO_BACKDROP_SIZE = 86
const LOGO_SIZE = 64
const LOGO_BACKDROP_RADIUS = 12

function rawQrUrl(payload: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(payload)}&size=${QR_SIZE}x${QR_SIZE}&ecc=H`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // ต้องขอแบบ anonymous ไม่งั้น canvas จะโดน taint แล้ว toDataURL() โยน error
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = err => reject(err)
    img.src = src
  })
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  radius: number
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + size, y, x + size, y + size, radius)
  ctx.arcTo(x + size, y + size, x, y + size, radius)
  ctx.arcTo(x, y + size, x, y, radius)
  ctx.arcTo(x, y, x + size, y, radius)
  ctx.closePath()
}

export type PromptPayQrInput = {
  promptPayId: string
  amount: number
  /** โลโก้หอพัก (ว่างได้ — ไม่มีก็ได้ QR เปล่า) */
  logoUrl?: string
}

/**
 * คืน data URL ของ QR พร้อมใช้
 *
 * ถ้าวาดลง canvas ไม่สำเร็จ (โหลดภาพไม่ได้ / canvas ถูก taint) จะถอยไปคืนลิงก์ภาพตรง ๆ
 * ซึ่งยังสแกนได้ตามปกติ แค่บันทึก/แชร์เป็นไฟล์ไม่ได้
 */
export async function buildPromptPayQrDataUrl(input: PromptPayQrInput): Promise<string> {
  const payload = generatePromptPayPayload(input.promptPayId, input.amount)
  const fallback = rawQrUrl(payload)

  try {
    const qrImg = await loadImage(fallback)

    const canvas = document.createElement("canvas")
    canvas.width = QR_SIZE
    canvas.height = QR_SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) return fallback

    ctx.drawImage(qrImg, 0, 0, QR_SIZE, QR_SIZE)

    if (input.logoUrl) {
      try {
        const logoImg = await loadImage(input.logoUrl)
        const center = QR_SIZE / 2

        ctx.fillStyle = "#ffffff"
        drawRoundedRect(
          ctx,
          center - LOGO_BACKDROP_SIZE / 2,
          center - LOGO_BACKDROP_SIZE / 2,
          LOGO_BACKDROP_SIZE,
          LOGO_BACKDROP_RADIUS
        )
        ctx.fill()

        ctx.drawImage(logoImg, center - LOGO_SIZE / 2, center - LOGO_SIZE / 2, LOGO_SIZE, LOGO_SIZE)
      } catch (err) {
        // โลโก้โหลดไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย — ใช้ QR เปล่าต่อไป
        console.error("promptpayQr: โหลดโลโก้หอพักไม่สำเร็จ", err)
      }
    }

    return canvas.toDataURL("image/png")
  } catch (err) {
    console.error("promptpayQr: สร้างภาพ QR ไม่สำเร็จ ใช้ลิงก์ภาพตรงแทน", err)
    return fallback
  }
}
