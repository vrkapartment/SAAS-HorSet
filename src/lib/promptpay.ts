/**
 * ฟังก์ชันสร้าง PromptPay Payload สำหรับสแกนเงินจริง (มาตรฐาน EMVCo)
 */
export function generatePromptPayPayload(target: string, amount: number) {
  let targetFormatted = target.replace(/[^0-9]/g, "")
  const isPhone = targetFormatted.length === 10 && targetFormatted.startsWith("0")
  
  if (isPhone) {
    targetFormatted = "0066" + targetFormatted.substring(1)
  }
  
  const parts = []
  parts.push("000201") // Payload Format Indicator
  parts.push(amount ? "010212" : "010211") // Point of Initiation Method
  
  // Merchant Account Info
  const ppInfo = []
  ppInfo.push("0016A000000677010111") // AID ของ PromptPay
  if (isPhone) {
    ppInfo.push("0113" + targetFormatted) // Tag 01 สำหรับเบอร์โทรศัพท์มือถือ
  } else {
    ppInfo.push("0213" + targetFormatted) // Tag 02 สำหรับเลขประจำตัวบัตรประชาชน / เลขประจำตัวผู้เสียภาษี
  }
  
  const ppInfoString = ppInfo.join("")
  parts.push("29" + String(ppInfoString.length).padStart(2, "0") + ppInfoString)
  
  parts.push("5303764") // Currency THB
  if (amount) {
    const amountStr = amount.toFixed(2)
    parts.push("54" + String(amountStr.length).padStart(2, "0") + amountStr)
  }
  parts.push("5802TH") // Country Code
  parts.push("6304") // CRC Header
  
  const rawPayload = parts.join("")
  
  // CRC16 CCITT
  let crc = 0xFFFF
  for (let i = 0; i < rawPayload.length; i++) {
    let x = ((crc >> 8) ^ rawPayload.charCodeAt(i)) & 0xFF
    x ^= x >> 4
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF
  }
  const crcString = crc.toString(16).toUpperCase().padStart(4, "0")
  
  return rawPayload + crcString
}
