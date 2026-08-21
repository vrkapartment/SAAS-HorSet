// Helper เกี่ยวกับห้องพักที่ใช้ร่วมกันหลายหน้า (ไม่แตะฐานข้อมูล — pure function ทั้งไฟล์)

/** รูปร่างขั้นต่ำของข้อมูลห้องที่ getRoomFloor ต้องใช้ (รับ object ที่กว้างกว่านี้ได้) */
export type RoomFloorSource = {
  roomNumber: string
  floor?: string | number | null
}

/**
 * หาว่าห้องนี้อยู่ชั้นไหน
 *
 * ใช้ `rooms.floor` ที่เจ้าของหอกรอกไว้เป็นหลัก ถ้าไม่ได้กรอกจะเดาจากเลขห้องแบบเดียวกับที่หน้า
 * "ผู้เช่า" ทำมาตลอด (เช่น "102" -> "1", "1203" -> "12", "A101" -> "1")
 *
 * ⚠️ logic การเดาต้องเหมือนกันทุกหน้า ไม่เช่นนั้นชั้นที่แสดงในหน้าจดมิเตอร์จะไม่ตรงกับหน้าผู้เช่า
 * และสตาฟจะจดข้ามชั้นกันเอง — ถ้าจะแก้ ต้องแก้ที่นี่ที่เดียวเท่านั้น
 */
export function getRoomFloor(roomNumber: string, rooms: RoomFloorSource[] | null | undefined): string {
  const room = rooms?.find(r => r.roomNumber === roomNumber)
  if (room && room.floor) return String(room.floor)

  // Fallback: ถ้าเลขห้องขึ้นต้นด้วยตัวเลข ให้ตัดสองหลักท้ายออก (สองหลักท้ายคือลำดับห้องในชั้น)
  const match = roomNumber.match(/^\d+/)
  if (match) {
    if (roomNumber.length >= 3) {
      return roomNumber.substring(0, roomNumber.length - 2) // "102" -> "1", "1203" -> "12"
    }
    return match[0][0]
  }

  const charMatch = roomNumber.match(/^[A-Za-z]+(\d+)/) // "A101"
  if (charMatch && charMatch[1]) {
    const numStr = charMatch[1]
    if (numStr.length >= 3) {
      return numStr.substring(0, numStr.length - 2)
    }
    return numStr[0]
  }

  return "1"
}

/**
 * เรียงชื่อชั้นแบบเลข (ไม่ใช่แบบพจนานุกรม) เพื่อให้ "2" มาก่อน "10"
 * รองรับชั้นที่ไม่ใช่ตัวเลขด้วย เช่น "B", "G"
 */
export function sortFloors(floors: string[]): string[] {
  return [...floors].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  )
}
