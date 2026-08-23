// Helper เกี่ยวกับห้องพักที่ใช้ร่วมกันหลายหน้า (ไม่แตะฐานข้อมูล — pure function ทั้งไฟล์)

/**
 * ตัวระบุห้องที่ส่งเข้า server action ที่เขียนข้อมูล (จดมิเตอร์ / ออกบิล / เปลี่ยนมิเตอร์)
 *
 * จงใจทำเป็น object ไม่ใช่ string เปล่า ๆ เพราะ roomId กับ roomNumber เป็น `string` ทั้งคู่ —
 * ถ้ารับเป็น parameter แบบ string TypeScript จะไม่เตือนเลยเวลาใครส่งเลขห้องมาแทน rooms.id
 * แล้วข้อมูลจะไปลงห้องผิดแบบเงียบ ๆ การบังคับให้ห่อเป็น `{ roomId }` ทำให้ compiler
 * จับได้ทุกจุดที่ยังส่งของเดิมมา
 */
export type RoomRef = { roomId: string }

/**
 * `rooms.id` แบบ branded type — ใช้เป็น "ตัวระบุห้อง" ทุกที่ในฝั่ง client
 *
 * ทำไมต้อง brand: roomId กับ roomNumber เป็น `string` ทั้งคู่ ถ้า handler รับเป็น string เปล่า ๆ
 * TypeScript จะยอมให้ส่ง `item.roomNumber` เข้าไปแทน `item.roomId` ได้เงียบ ๆ แล้วหอที่มีสองอาคาร
 * ใช้เลขห้องซ้ำกันจะบันทึกมิเตอร์/ออกบิลลงห้องผิด โดยไม่มีอะไรเตือนเลย
 *
 * การ brand ทำให้ compiler ปฏิเสธทันทีที่ใครส่งเลขห้องมาแทน — ตัวตรวจความครบถ้วนของ refactor นี้
 * ทั้งหมดอยู่ที่ `tsc` ไม่ใช่การไล่อ่านด้วยตา
 *
 * แปลงค่าจาก DB เข้ามาด้วย `asRoomId()` ที่ขอบเดียว ห้าม cast กระจายทั่วไฟล์
 */
export type RoomId = string & { readonly __roomIdBrand: unique symbol }

/** จุดแปลง `string` จากฐานข้อมูลให้เป็น RoomId — ใช้ที่ขอบของ data layer เท่านั้น */
export function asRoomId(value: string | null | undefined): RoomId {
  return (value ?? "") as RoomId
}

/** รูปร่างขั้นต่ำของข้อมูลห้องที่ getRoomFloor ต้องใช้ (รับ object ที่กว้างกว่านี้ได้) */
export type RoomFloorSource = {
  id?: string | null
  roomNumber: string
  floor?: string | number | null
}

/** ตัวระบุห้องที่ส่งให้ getRoomFloor — มี roomId ก็จับด้วย roomId ไม่มีก็ถอยไปใช้เลขห้อง */
export type RoomFloorRef = {
  roomId?: string | null
  roomNumber: string
}

/**
 * หาว่าห้องนี้อยู่ชั้นไหน
 *
 * ใช้ `rooms.floor` ที่เจ้าของหอกรอกไว้เป็นหลัก ถ้าไม่ได้กรอกจะเดาจากเลขห้องแบบเดียวกับที่หน้า
 * "ผู้เช่า" ทำมาตลอด (เช่น "102" -> "1", "1203" -> "12", "A101" -> "1")
 *
 * ⚠️ logic การเดาต้องเหมือนกันทุกหน้า ไม่เช่นนั้นชั้นที่แสดงในหน้าจดมิเตอร์จะไม่ตรงกับหน้าผู้เช่า
 * และสตาฟจะจดข้ามชั้นกันเอง — ถ้าจะแก้ ต้องแก้ที่นี่ที่เดียวเท่านั้น
 *
 * จับห้องด้วย roomId ก่อนถ้ามี — เลขห้องซ้ำกันได้ข้ามอาคาร ถ้าเทียบด้วยเลขห้องอย่างเดียว
 * ห้อง 101 ของสองอาคารที่ตั้งชั้นไว้ต่างกันจะได้ค่าชั้นของอีกอาคารมาปนกัน
 */
export function getRoomFloor(ref: RoomFloorRef, rooms: RoomFloorSource[] | null | undefined): string {
  const { roomId, roomNumber } = ref
  const room = (roomId ? rooms?.find(r => r.id && r.id === roomId) : undefined)
    ?? rooms?.find(r => r.roomNumber === roomNumber)
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
 * หาว่าเลขห้องไหน "ซ้ำกัน" ในชุดที่กำลังแสดงอยู่
 *
 * ใช้ตัดสินว่าต้องกำกับรหัสอาคารข้างเลขห้องหรือไม่ — ถ้าไม่กำกับ สตาฟจะเห็นสองแถวเขียน "101"
 * เหมือนกันเป๊ะแล้วจดมิเตอร์ผิดห้อง
 *
 * ⚠️ คำนวณจาก "ชุดที่มองเห็นจริง" เท่านั้น หอที่ไม่มีเลขห้องซ้ำกันเลย (ซึ่งเป็นส่วนใหญ่)
 * จะได้ set ว่าง แล้วหน้าตาไม่เปลี่ยนไปจากเดิมแม้แต่นิดเดียว
 */
export function findDuplicateRoomNumbers(items: { roomNumber: string }[]): Set<string> {
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const item of items) {
    if (seen.has(item.roomNumber)) duplicated.add(item.roomNumber)
    else seen.add(item.roomNumber)
  }
  return duplicated
}

/**
 * ข้อความเลขห้องที่จะแสดงให้ผู้ใช้เห็น — เติมรหัส/ชื่ออาคารต่อท้ายเฉพาะเมื่อเลขห้องนั้นซ้ำ
 *
 * เช่น "101" (ไม่ซ้ำ) · "101 (A)" (ซ้ำ และมีรหัสอาคาร) · "101 (ตึกหน้า)" (ซ้ำ แต่ยังไม่ได้ตั้งรหัส)
 */
export function formatRoomLabel(
  roomNumber: string,
  duplicatedRoomNumbers: Set<string>,
  building?: { code?: string | null; name?: string | null } | null
): string {
  if (!duplicatedRoomNumbers.has(roomNumber)) return roomNumber
  const tag = building?.code?.trim() || building?.name?.trim()
  return tag ? `${roomNumber} (${tag})` : roomNumber
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
