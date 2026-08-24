/**
 * QA harness: สร้างใบแจ้งหนี้ PDF จากข้อมูลสมมติ เพื่อให้ตรวจด้วยตาได้ว่าหน้าตาใบถูกจริง
 *
 * เทสต์ยูนิต (src/lib/__tests__/billLines.test.ts) คุมตัวเลขไว้แล้ว แต่คุมไม่ได้ว่า
 * ข้อความ/ป้าย/การจัดวางบนใบจริงถูกหรือไม่ — สคริปต์นี้เติมช่องนั้น
 *
 * ใช้: npm run qa:pdf [outDir]
 * ต้องต่ออินเทอร์เน็ต (โหลดฟอนต์ Sarabun กับเทมเพลตใบ)
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { generateBillPdf } from "../src/lib/pdfHelper"
import { resolveBillLines } from "../src/lib/billLines"

const outDir = process.argv[2] || "qa-output"
mkdirSync(outDir, { recursive: true })

const common = {
  tenantName: "ทดสอบ ระบบ",
  billingCycle: "กันยายน 2026",
  promptPayId: "0812345678",
  promptPayName: "ทดสอบ ระบบ",
  workspaceName: "หอพักทดสอบ",
  invoiceId: "INV-202609-A-101"
}

const fixtures: { name: string; note: string; data: Parameters<typeof generateBillPdf>[0] }[] = [
  {
    name: "01-ปกติ-มี-snapshot",
    note: "ค่าเช่าต้องเป็น 6,000 (ไม่ใช่เศษที่เหลือ) · รายการย่อยบวกได้ 6,867",
    data: {
      ...common, roomNumber: "101", hasSnapshot: true,
      baseRent: 6000, amount: 6867,
      electricUnits: 73, electricRate: 7, electricAmount: 511, elecMinApplied: false,
      waterUnits: 17, waterRate: 18, waterAmount: 306, waterMinApplied: false,
      commonFee: 50, elecPrev: 30, elecCurr: 103, waterPrev: 20, waterCurr: 37
    }
  },
  {
    name: "02-คิดขั้นต่ำ-ไฟและน้ำ",
    note: 'ป้ายต้องขึ้น "ขั้นต่ำ 10 หน่วย" และ "ขั้นต่ำ 3 หน่วย" · คอลัมน์อัตราแสดง "-"',
    data: {
      ...common, roomNumber: "102", hasSnapshot: true,
      baseRent: 6000, amount: 6174,
      electricUnits: 0, electricRate: 7, electricAmount: 70, elecMinApplied: true, electricMinUnit: 10,
      waterUnits: 1, waterRate: 18, waterAmount: 54, waterMinApplied: true, waterMinUnit: 3,
      commonFee: 50, elecPrev: 2053, elecCurr: 2053, waterPrev: 5019, waterCurr: 5020
    }
  },
  {
    name: "03-ยกเว้นขั้นต่ำ",
    note: "ไม่ขึ้นป้ายขั้นต่ำ · ค่าไฟ 0 บาทเพราะใช้ 0 หน่วยและยกเว้นขั้นต่ำ",
    data: {
      ...common, roomNumber: "103", hasSnapshot: true,
      baseRent: 6000, amount: 6050,
      electricUnits: 0, electricRate: 7, electricAmount: 0, elecMinApplied: false,
      waterUnits: 0, waterRate: 18, waterAmount: 0, waterMinApplied: false,
      commonFee: 50, waiveElectricMin: true, waiveWaterMin: true
    }
  },
  {
    name: "04-บิลปิดรอบย้ายห้อง-prorate",
    note: "ค่าเช่าต้องเป็นยอด prorate 3,000 ไม่ใช่เต็มเดือน 6,000",
    data: {
      ...common, roomNumber: "104", invoiceId: "INV-202609-A-104-TRANSFER", hasSnapshot: true,
      baseRent: 3000, amount: 3176,
      electricUnits: 0, electricRate: 7, electricAmount: 70, elecMinApplied: true, electricMinUnit: 10,
      waterUnits: 0, waterRate: 18, waterAmount: 56, waterMinApplied: true, waterMinUnit: 3,
      commonFee: 50
    }
  },
  {
    name: "05-ครบทุกบรรทัด",
    note: "ค่าปรับ + ค่าบริการอื่น + ค่าใช้จ่ายเสริม + VAT · ต้องบวกได้ 7,946",
    data: {
      ...common, roomNumber: "105", hasSnapshot: true,
      baseRent: 6000, amount: 7946,
      electricUnits: 73, electricRate: 7, electricAmount: 511, elecMinApplied: false,
      waterUnits: 17, waterRate: 18, waterAmount: 306, waterMinApplied: false,
      commonFee: 50, penaltyAmount: 200, lateDays: 10, otherServiceAmount: 300,
      extraExpenses: [{ name: "ค่าล้างแอร์", amount: 500 }], vatAmount: 79
    }
  },
  {
    name: "06-บิลเก่าไม่มี-snapshot",
    note: "พฤติกรรมเดิม: ค่าเช่าคำนวณย้อน = 6246-511-126-50 = 5,559",
    data: {
      ...common, roomNumber: "106",
      baseRent: 6000, amount: 6246,
      electricUnits: 73, electricRate: 7,
      waterUnits: 7, waterRate: 18,
      commonFee: 50
    }
  }
]

let ok = 0
let mismatch = 0
const report: string[] = []

for (const f of fixtures) {
  // ตัวเลขที่จะถูกพิมพ์ลงใบ — มาจากฟังก์ชันเดียวกับที่ pdfHelper ใช้วาดจริง
  const lines = resolveBillLines(f.data)
  const balanced = Math.abs(lines.lineSum - f.data.amount) < 0.01
  if (!balanced) mismatch++

  report.push(
    `=== ${f.name} ===`,
    `ต้องได้: ${f.note}`,
    `  ${lines.elecDesc}`,
    `  ${lines.waterDesc}`,
    `  ค่าเช่า           ${lines.rent.toLocaleString()}`,
    `  ค่าไฟ             ${lines.elecAmount.toLocaleString()}  (อัตราที่พิมพ์: ${lines.elecRateDisplay})`,
    `  ค่าน้ำ             ${lines.waterAmount.toLocaleString()}  (อัตราที่พิมพ์: ${lines.waterRateDisplay})`,
    `  ค่าส่วนกลาง       ${lines.commonFee.toLocaleString()}`,
    `  ค่าปรับ           ${lines.penaltyAmount.toLocaleString()}`,
    `  ค่าบริการอื่น      ${lines.otherServiceAmount.toLocaleString()}`,
    `  ค่าใช้จ่ายเสริม    ${lines.extraExpensesSum.toLocaleString()}`,
    `  VAT              ${lines.vatAmount.toLocaleString()}`,
    `  ---------------------------------`,
    `  ผลบวกรายการย่อย  ${lines.lineSum.toLocaleString()}`,
    `  ยอดรวมที่เก็บไว้   ${f.data.amount.toLocaleString()}`,
    `  ${balanced ? "OK บวกได้เท่ายอดรวม" : "FAIL ไม่เท่า — ใบนี้อธิบายที่มาของยอดไม่ได้"}`,
    ""
  )

  try {
    const blob = await generateBillPdf(f.data)
    const bytes = Buffer.from(await blob.arrayBuffer())
    writeFileSync(join(outDir, `${f.name}.pdf`), bytes)
    console.log(`OK  ${f.name}.pdf  (${(bytes.length / 1024).toFixed(0)} KB)${balanced ? "" : "  [ยอดไม่บาลานซ์]"}`)
    ok++
  } catch (e) {
    console.error(`FAIL ${f.name} — สร้าง PDF ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ดัมพ์เป็นข้อความด้วย เพื่อให้ตรวจตัวเลขได้โดยไม่ต้องเปิดไฟล์ PDF
const reportPath = join(outDir, "_summary.txt")
writeFileSync(reportPath, report.join(String.fromCharCode(10)), "utf8")

console.log(`
สร้างสำเร็จ ${ok}/${fixtures.length} ใบ ที่ ${outDir}/`)
console.log(`สรุปตัวเลขบนใบ: ${reportPath}`)
if (mismatch > 0) {
  console.error(`
มี ${mismatch} ใบที่รายการย่อยบวกกันไม่ได้เท่ายอดรวม`)
  process.exit(1)
}
if (ok < fixtures.length) process.exit(1)
