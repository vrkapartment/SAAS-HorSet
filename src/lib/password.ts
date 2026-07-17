import crypto from "crypto"

// ตัดตัวอักษรกำกวม (0/O, 1/l/I) ออก เพื่อให้ Super Admin อ่าน/พิมพ์ต่อให้ผู้ใช้คนอื่นฟังทางวาจาได้ง่ายขึ้น
const PASSWORD_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%"

// สุ่มรหัสผ่านที่ปลอดภัยด้วย crypto.randomInt (ไม่ใช่ Math.random) สำหรับตอนที่ผู้ใช้ไม่ได้กำหนดรหัสผ่านเอง
export function generateSecurePassword(length = 12): string {
  let password = ""
  for (let i = 0; i < length; i++) {
    password += PASSWORD_CHARSET[crypto.randomInt(PASSWORD_CHARSET.length)]
  }
  return password
}
