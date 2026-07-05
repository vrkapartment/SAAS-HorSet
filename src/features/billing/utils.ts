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
