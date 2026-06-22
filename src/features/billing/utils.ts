export function calculateLateDays(cycleStr: string): number {
  if (!cycleStr || !cycleStr.includes("-")) return 0
  const [yearStr, monthStr] = cycleStr.split("-")
  const year = parseInt(yearStr, 10)
  
  // สำหรับบิลรอบเดือน มิถุนายน (06) กำหนดจ่ายคือวันที่ 5 ของเดือนถัดไป (กรกฎาคม / index 6)
  const dueMonth = parseInt(monthStr, 10) 
  
  const dueDate = new Date(year, dueMonth, 5, 23, 59, 59, 999)
  const now = new Date()
  
  if (now <= dueDate) return 0
  
  const dueMidnight = new Date(year, dueMonth, 5)
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  const diffTime = nowMidnight.getTime() - dueMidnight.getTime()
  if (diffTime <= 0) return 0
  
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}
