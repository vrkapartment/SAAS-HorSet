// Helper สำหรับจับคู่ชื่ออาคารจากไฟล์ CSV กับอาคารที่มีอยู่จริงในระบบ
// ใช้ร่วมกันทั้งหน้านำเข้าห้องพักและหน้านำเข้าผู้เช่า (pure function ทั้งไฟล์ ไม่แตะฐานข้อมูล)

export type BuildingOption = { id: string; name: string }

/**
 * ทำให้ชื่ออาคารเทียบกันได้ โดยยอมให้ต่างกันได้แค่ตัวพิมพ์เล็ก-ใหญ่ และช่องว่างหัวท้าย
 * (Excel มักเติมช่องว่างท้ายมาให้เอง ถ้าไม่ trim ผู้ใช้จะเจอหน้าต่างจับคู่โดยไม่มีเหตุผล)
 *
 * ⚠️ จงใจ "ไม่" ทำ fuzzy match เช่นตัดคำนำหน้า "ตึก"/"อาคาร"/"building" ออกก่อนเทียบ
 * เพราะถ้าเดาผิด ห้องจะไปอยู่ผิดอาคารแบบเงียบ ๆ ไม่มีใครรู้ แล้วค่าน้ำ-ไฟที่หารตามสัดส่วน
 * ทั้งอาคารจะผิดตามไปด้วย — ถ้าชื่อไม่ตรงให้เปิดหน้าต่างให้ผู้ใช้เลือกเองดีกว่าเดา
 */
export function normalizeBuildingName(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase()
}

/** สร้างดัชนีชื่ออาคาร → อาคาร สำหรับ lookup แบบ O(1) */
export function buildBuildingNameMap(buildings: BuildingOption[]): Map<string, BuildingOption> {
  const map = new Map<string, BuildingOption>()
  for (const b of buildings) {
    const key = normalizeBuildingName(b.name)
    // ถ้ามีอาคารชื่อซ้ำกัน ยึดตัวแรกที่เจอ (เทียบชื่อแล้วกำกวมอยู่ดี ผู้ใช้ต้องเลือกเองจากหน้าต่างจับคู่)
    if (key && !map.has(key)) map.set(key, b)
  }
  return map
}

/**
 * หาอาคารที่ชื่อตรงกับที่ระบุใน CSV
 * คืน null เมื่อชื่อว่าง หรือไม่ตรงกับอาคารใดเลย (ผู้เรียกต้องเปิดหน้าต่างให้ผู้ใช้จับคู่เอง)
 */
export function matchBuildingByName(
  csvName: string | null | undefined,
  nameMap: Map<string, BuildingOption>
): BuildingOption | null {
  const key = normalizeBuildingName(csvName)
  if (!key) return null
  return nameMap.get(key) ?? null
}

export type BuildingMappingRow = {
  /** ชื่ออาคารตามที่เขียนมาในไฟล์ (คงรูปเดิมไว้เพื่อแสดงให้ผู้ใช้เห็นว่าพิมพ์มาว่าอะไร) */
  csvName: string
  /** จำนวนแถวในไฟล์ที่ใช้ชื่อนี้ */
  count: number
  /** ตัวอย่างเลขห้องไม่กี่ห้อง ใช้ช่วยผู้ใช้ตัดสินใจว่าชื่อนี้หมายถึงอาคารไหน */
  sampleRooms: string[]
  /** อาคารที่ผู้ใช้เลือก ("" = ยังไม่เลือก) */
  buildingId: string
}

/**
 * รวบรวมชื่ออาคารที่จับคู่ไม่ได้ ให้เหลือรายการละ 1 ชื่อ (ไม่ใช่รายละแถว)
 *
 * ถ้าไฟล์มี 40 แถวเขียน "ตึกเอ" เหมือนกันหมด ผู้ใช้ควรเลือกครั้งเดียว ไม่ใช่ 40 ครั้ง
 * ชื่อว่าง (ไม่ได้กรอกคอลัมน์มา) ก็ถือเป็นหนึ่งรายการที่ต้องเลือก เพื่อไม่ให้ห้องหลุดไปไม่มีอาคาร
 */
export function collectUnmatchedBuildingNames(
  rows: { roomNumber: string; csvBuildingName: string; buildingId: string }[]
): BuildingMappingRow[] {
  const grouped = new Map<string, BuildingMappingRow>()
  for (const row of rows) {
    if (row.buildingId) continue
    const key = normalizeBuildingName(row.csvBuildingName)
    const existing = grouped.get(key)
    if (existing) {
      existing.count++
      if (existing.sampleRooms.length < 5) existing.sampleRooms.push(row.roomNumber)
    } else {
      grouped.set(key, {
        csvName: row.csvBuildingName.trim(),
        count: 1,
        sampleRooms: [row.roomNumber],
        buildingId: ""
      })
    }
  }
  return [...grouped.values()]
}
