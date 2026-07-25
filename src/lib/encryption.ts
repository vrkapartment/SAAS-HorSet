import crypto from "crypto"

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-secret-key-min-32-chars-for-dev-only"

// scrypt เป็น key-derivation function ที่ตั้งใจให้หนัก CPU โดยธรรมชาติ (สำหรับต้านทาน brute-force)
// แต่ input (ENCRYPTION_KEY, salt) เป็นค่าคงที่ตลอดอายุ process ผลลัพธ์คีย์จึงเหมือนเดิมทุกครั้งอยู่แล้ว
// จึง cache ไว้ใช้ซ้ำแทนที่จะคำนวณ scrypt ใหม่ทุกครั้งที่ encrypt/decrypt
let cachedKey: Buffer | null = null
function getDerivedKey(): Buffer {
  if (!cachedKey) {
    cachedKey = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32)
  }
  return cachedKey
}

export function encryptText(text: string): string {
  const iv = crypto.randomBytes(16)
  const key = getDerivedKey()
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  return iv.toString("hex") + ":" + encrypted
}

export function decryptText(text: string): string {
  try {
    const textParts = text.split(":")
    if (textParts.length !== 2) return text
    const iv = Buffer.from(textParts.shift()!, "hex")
    const encryptedText = Buffer.from(textParts.join(":"), "hex")
    const key = getDerivedKey()
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)
    let decrypted = decipher.update(encryptedText)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    return decrypted.toString("utf8")
  } catch (error) {
    console.error("Decryption error:", error)
    return text // return original or throw? Better to return original if it wasn't encrypted properly
  }
}
