/**
 * สร้างเลขใบกำกับ (invoice_id) — helper กลางตัวเดียวของทั้งระบบ
 *
 * รูปแบบ: `INV-{รอบบิลไม่มีขีด}-{รหัสอาคาร}-{เลขห้อง}` เช่น `INV-202608-A-101`
 *
 * ต้องมีรหัสอาคารประกอบ เพราะหอที่มีหลายตึกใช้เลขห้องซ้ำกันได้ (ตึก A ห้อง 101 / ตึก B ห้อง 101)
 * ถ้าไม่ใส่รหัสอาคาร บิลของสองห้องนั้นจะได้เลขเดียวกันแล้วผู้เช่าแยกไม่ออกว่าใบไหนของห้องใคร
 *
 * ห้องที่ยังไม่มีอาคาร (buildingCode ว่าง) ใช้รูปแบบเดิมไม่มีรหัสอาคาร — คงเลขให้เหมือนบิลเก่า
 * ที่ออกไปก่อนหน้านี้ ไม่ให้ผู้เช่าเห็นเลขบิลเปลี่ยนรูปแบบไปโดยไม่มีเหตุผล
 *
 * ⚠️ ห้ามเขียนสูตรนี้ซ้ำที่อื่น — ถ้าฝั่งสร้างบิลกับฝั่งพิมพ์ PDF สร้างเลขไม่เหมือนกัน
 * ผู้เช่าจะได้ใบที่เลขบนกระดาษไม่ตรงกับในระบบ
 */
export function buildInvoiceId(
  billingCycle: string,
  roomNumber: string,
  buildingCode?: string | null
): string {
  const cycle = (billingCycle || "").replace(/-/g, "")
  const code = (buildingCode || "").trim()
  return code ? `INV-${cycle}-${code}-${roomNumber}` : `INV-${cycle}-${roomNumber}`
}

export function calculateLateDays(cycleStr: string): number {
  if (!cycleStr || !cycleStr.includes("-")) return 0
  const [yearStr, monthStr] = cycleStr.split("-")
  const year = parseInt(yearStr, 10)
  const dueMonth = parseInt(monthStr, 10) // e.g. "06" -> 6 (July in 0-indexed Date)

  // Construct due date elements wrapping safely
  const tempDueDate = new Date(Date.UTC(year, dueMonth, 5))
  const dueYearWrapped = tempDueDate.getUTCFullYear()
  const dueMonthWrapped = tempDueDate.getUTCMonth()
  const dueDateWrapped = tempDueDate.getUTCDate()

  // 23:59:59.999 in Bangkok (UTC+7) is 16:59:59.999 UTC
  const dueTimeUTC = Date.UTC(dueYearWrapped, dueMonthWrapped, dueDateWrapped, 16, 59, 59, 999)
  const now = new Date()

  if (now.getTime() <= dueTimeUTC) return 0

  // Calculate local calendar day difference in Bangkok (UTC+7)
  const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const nowYear = bangkokNow.getUTCFullYear()
  const nowMonth = bangkokNow.getUTCMonth()
  const nowDate = bangkokNow.getUTCDate()

  const dueMidnightUTC = Date.UTC(dueYearWrapped, dueMonthWrapped, dueDateWrapped)
  const nowMidnightUTC = Date.UTC(nowYear, nowMonth, nowDate)

  const diffTime = nowMidnightUTC - dueMidnightUTC
  if (diffTime <= 0) return 0

  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}
