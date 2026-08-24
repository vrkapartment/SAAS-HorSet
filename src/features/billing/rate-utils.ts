import type { BuildingUtilityBill } from "./building-utility-actions"

/**
 * Resolve อัตราไฟฟ้า/น้ำที่จะใช้จริงสำหรับห้องหนึ่งในรอบบิลหนึ่ง ตามโหมดที่ workspace ตั้งไว้
 * (fixed_rate = อัตราคงที่เดิม, building_total = ยอดบิลจริงทั้งอาคาร ÷ หน่วยรวม ที่กรอกไว้ล่วงหน้า)
 * คืน error ชัดเจนถ้าเปิดโหมด building_total แล้วยังไม่ได้กรอกยอดของอาคารนั้นในรอบบิลนี้
 *
 * ⚠️ อยู่ในไฟล์แยก (ไม่ใช่ actions.ts) เพราะไฟล์ "use server" export ได้แต่ async function
 * และมีสองเส้นทางที่ต้องใช้สูตรเดียวกันเป๊ะ: การออกบิลรายเดือน (billing/actions.ts) กับ
 * การคิดค่าน้ำ-ไฟห้องเดิมตอนย้ายห้อง (tenant/transfer-actions.ts)
 *
 * ถ้าปล่อยให้สองที่มีสูตรของตัวเอง หอที่เปิดโหมด building_total จะได้อัตราคนละตัวระหว่าง
 * "ส่วนห้องเดิม" กับ "ส่วนห้องใหม่" ในบิลใบเดียวกัน โดยไม่มีอะไรฟ้อง
 */
export function resolveUtilityRate(
  utilityType: "electric" | "water",
  mode: "fixed_rate" | "building_total" | undefined,
  fixedRate: number,
  buildingId: string | null | undefined,
  buildingBillsMap: Map<string, BuildingUtilityBill>
): { rate: number; error?: string } {
  if (mode !== "building_total") {
    return { rate: fixedRate }
  }
  const utilityLabel = utilityType === "electric" ? "ไฟฟ้า" : "น้ำประปา"
  if (!buildingId) {
    return { rate: 0, error: `ห้องนี้ยังไม่ได้กำหนดอาคาร กรุณาตั้งค่าอาคารให้ห้องนี้ก่อนออกบิลค่า${utilityLabel}แบบหารตามสัดส่วน` }
  }
  const row = buildingBillsMap.get(`${buildingId}:${utilityType}`)
  if (!row) {
    return { rate: 0, error: `ยังไม่ได้กรอกยอดค่า${utilityLabel}รวมทั้งอาคารของรอบบิลนี้ กรุณากรอกที่หน้าออกบิลก่อน` }
  }
  return { rate: row.ratePerUnit }
}
