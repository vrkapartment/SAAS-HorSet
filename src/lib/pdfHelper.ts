import { PDFDocument, PDFName, PDFRef, PDFDict, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { calculateProgressiveTax, calculateMinimumTax, calculateFinalTaxDue, calculatePersonalDeduction } from "./thaiTax"

// บาง template ที่ Super Admin อัปโหลดผ่านเครื่องมือแก้ไข PDF บางตัว มี form field ที่ "หลุด" ออกจากต้นไม้ AcroForm จริง
// (widget ยังมี /Parent โยงไปหา field object แต่ field root นั้นไม่ถูกอ้างอิงใน AcroForm/Fields อยู่เลย) ทำให้
// pdf-lib หาฟิลด์เหล่านี้ด้วยชื่อไม่เจอ (form.getTextField() throws) ทั้งที่เปิดใน Adobe/Chrome แล้วเห็นและกรอกได้ปกติ
// ฟังก์ชันนี้ไล่ดู widget annotation ทุกหน้า เดินขึ้นไปหา field object รากสุดแล้วเติมเข้า AcroForm/Fields ถ้ายังไม่มี
export function repairOrphanedFormFields(pdfDoc: PDFDocument) {
  const acroForm = pdfDoc.catalog.getAcroForm()
  if (!acroForm) return

  const existing = new Set(acroForm.getFields().map(([, ref]) => ref.toString()))

  const rootRefs = new Map<string, PDFRef>()
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.Annots()
    if (!annots) continue
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i)
      if (!(ref instanceof PDFRef)) continue
      let curRef: PDFRef = ref
      let curDict = pdfDoc.context.lookup(ref, PDFDict)
      while (curDict) {
        const parentRef = curDict.get(PDFName.of("Parent"))
        if (!(parentRef instanceof PDFRef)) break
        curRef = parentRef
        curDict = pdfDoc.context.lookup(parentRef, PDFDict)
      }
      rootRefs.set(curRef.toString(), curRef)
    }
  }

  for (const [key, ref] of rootRefs) {
    if (!existing.has(key)) acroForm.addField(ref)
  }
}

// ฟังก์ชันช่วยเขียนข้อความภาษาไทยที่จัดสระและวรรณยุกต์ไม่ให้เยื้องหรือเว้นช่องว่าง (Thai Text Shaping Helper)
export function drawThaiText(
  page: any,
  text: string,
  x: number,
  y: number,
  options: { font: any; size: number; color?: any }
) {
  const { font, size, color } = options
  
  // จัดเรียงสระและวรรณยุกต์ภาษาไทยให้ถูกต้องตามหลักแกรมม่าและ Unicode เพื่อให้เรนเดอร์ทับกันได้สวยงาม
  // 1. แปลงสระอำ (ำ) ที่มีวรรณยุกต์นำหน้า เช่น "น้ำ" (น + ้ + ำ) ให้เป็น "น + ํ + ้ + า" (สระลอยมาก่อน วรรณยุกต์อยู่บนสุด)
  // 2. แปลงสระอำ (ำ) ปกติให้เป็น "ํ + า"
  const normalizedText = text
    .replace(/([่้๊๋])ำ/g, "\u0e4d$1\u0e32")
    .replace(/ำ/g, "\u0e4d\u0e32")

  const nonAdvancingChars = new Set([
    "\u0e31", // ั (ไม้หันอากาศ)
    "\u0e34", // ิ (สระอิ)
    "\u0e35", // ี (สระอี)
    "\u0e36", // ึ (สระอึ)
    "\u0e37", // ื (สระอือ)
    "\u0e38", // ุ (สระอุ)
    "\u0e39", // ู (สระอู)
    "\u0e3a", // ฺ (พินทุ)
    "\u0e47", // ็ (ไม้ไต่คู้)
    "\u0e48", // ่ (ไม้เอก)
    "\u0e49", // ้ (ไม้โท)
    "\u0e4a", // ๊ (ไม้ตรี)
    "\u0e4b", // ๋ (ไม้จัตวา)
    "\u0e4c", // ์ (การันต์)
    "\u0e4d", // ํ (นิคหิต)
    "\u0e4e", // ๎ (ยามักการ)
  ])

  // แยกข้อความออกเป็นกลุ่มพยัญชนะกับสระลอยตัว (Consonant Clusters)
  // เพื่อส่งไปให้ fontkit จัดวางวรรณยุกต์ในแนวตั้งทีละตัว และป้องกันปัญหาตัวอักษรเพี้ยนหรือพยัญชนะสลับตัวกัน
  const clusters: string[] = []
  let currentCluster = ""

  for (let i = 0; i < normalizedText.length; i++) {
    const char = normalizedText[i]
    if (nonAdvancingChars.has(char)) {
      // ถ้านำหน้าด้วยสระ/วรรณยุกต์ลอยตัว ให้นำไปต่อท้ายพยัญชนะหลักเดิม
      currentCluster += char
    } else {
      // ถ้าเป็นพยัญชนะหรือสระราบปกติ ให้บันทึกกลุ่มคำเดิมแล้วเริ่มกลุ่มคำใหม่
      if (currentCluster) {
        clusters.push(currentCluster)
      }
      currentCluster = char
    }
  }
  if (currentCluster) {
    clusters.push(currentCluster)
  }

  // วาดข้อความทีละกลุ่มอักขระ (Cluster) โดยวาดพร้อมกันเพื่อให้ฟอนต์จัดเรียงแนวตั้งและแนวนอนได้อย่างถูกต้องสมบูรณ์
  let currentX = x
  for (const cluster of clusters) {
    page.drawText(cluster, {
      x: currentX,
      y,
      size,
      font,
      color,
    })

    // เลื่อนตำแหน่ง X ถัดไป โดยอ้างอิงความกว้างของพยัญชนะตัวฐานตัวแรกเท่านั้น (ละทิ้งความกว้างสระลอยตัว)
    const baseChar = cluster[0] || ""
    const baseWidth = font.widthOfTextAtSize(baseChar, size)
    currentX += baseWidth
  }
}


export interface PndData {
  firstName: string
  lastName: string
  taxId: string
  address: string
  phone: string
  rent405: number
  deductionRent405: number
  utilities408: number
  deductionUtilities408: number
  netIncome: number
  taxYear: string
  // รายได้อื่น (ปรับ/ริบมัดจำ) แยกจาก utilities408 เสมอ ทั้ง ภ.ง.ด. 90 และ 94 เพราะฟอร์มทั้งสองมีแถวแยกสำหรับรายได้ประเภทนี้
  // (ภ.ง.ด. 94 ยังใช้ addressParts/taxpayerStatus แยกช่างเพิ่มเติมที่ 90 ไม่มี)
  other408?: number
  deductionOther408?: number
  addressParts?: {
    building: string
    room: string
    floor: string
    village: string
    no: string
    moo: string
    soi: string
    yaek: string
    road: string
    subdistrict: string
    district: string
    province: string
    zipcode: string
  }
  taxpayerStatus?: "individual" | "partnership"
  partnerCount?: number
  // วิธีหักค่าใช้จ่ายที่ Admin เลือกจริงต่อหมวด (ใช้ติ๊กช่อง "ร้อยละ"/"จริง" ในตาราง ก. ของ ภ.ง.ด. 94 ให้ตรงกับที่ตั้งค่าไว้)
  rentDeductionMethod?: "percentage" | "actual"
  utilitiesDeductionMethod?: "percentage" | "actual"
}

const EMPTY_ADDRESS_PARTS: NonNullable<PndData["addressParts"]> = {
  building: "", room: "", floor: "", village: "", no: "", moo: "", soi: "", yaek: "",
  road: "", subdistrict: "", district: "", province: "", zipcode: ""
}

// ===== ระบบ Visual Field Mapping =====
// แยก "ชื่อ field ทางกายภาพในไฟล์ PDF" ออกจาก "ความหมายเชิงตรรกะที่ระบบต้องกรอก" เพื่อให้ Super Admin
// แก้ mapping ได้เองผ่านหน้าเว็บเวลาอัปโหลด template ใหม่ (ดูตาราง tax_form_field_mappings และแผนที่
// C:\Users\User\.claude\plans\update-template-imperative-orbit.md) แทนที่จะต้องแก้โค้ดทุกครั้งที่ field เปลี่ยนชื่อ/ตำแหน่ง

export type PndFieldFormat = "raw" | "comb" | "plain_decimal"

// ค่าที่คำนวณแล้วสำหรับ 1 ช่องข้อความ — format บอกวิธีแปลงเป็น string ตอนกรอกจริง (ดู fillPdfFromMapping)
export interface PndTextValue {
  format: PndFieldFormat
  amount?: number // ใช้กับ format "comb"/"plain_decimal"
  text?: string   // ใช้กับ format "raw"
}

// การ map "ความหมายเชิงตรรกะ 1 อย่าง" ไปยัง "field ทางกายภาพ 1 ช่อง" ของ template หนึ่งไฟล์
// radio group ใช้หลายแถว share logicalKey เดียวกัน แต่ต่าง optionKey/widgetIndex (ดู DEFAULT_PND90_MAPPING)
export interface PndFieldMapping {
  logicalKey: string
  fieldKind: "text" | "radio"
  physicalFieldName: string
  optionKey?: string     // radio เท่านั้น
  widgetIndex?: number   // radio เท่านั้น
  valueFormat?: PndFieldFormat // text เท่านั้น
}

// ผลคำนวณทั้งหมดของ 1 ครั้งที่ generate — เป็น input ให้ fillPdfFromMapping โดยไม่รู้จักชื่อ field จริงเลย
// text[key] = null/undefined หมายถึง "ไม่มีข้อมูลจริง ปล่อยว่างไว้" (ไม่เรียก setField)
// radio[key] = null/undefined หมายถึง "ไม่ต้องเลือกตัวเลือกไหนเลย" (ไม่เรียก selectRadioWidget)
export interface PndComputedValues {
  text: Record<string, PndTextValue | null | undefined>
  radio: Record<string, string | null | undefined>
}

const PND_SHARED_LOGICAL_KEYS = [
  "personal.tax_id", "personal.first_name", "personal.last_name", "personal.taxpayer_status",
  "address.building", "address.room", "address.floor", "address.village", "address.no", "address.moo",
  "address.soi", "address.yaek", "address.road", "address.subdistrict", "address.district", "address.province", "address.zipcode",
  "rent.payer_tax_id", "rent.description_label", "rent.gross", "rent.deduction", "rent.net", "rent.deduction_method", "rent.deduction_percent",
  "utilities.payer_tax_id", "utilities.description_label", "utilities.gross", "utilities.deduction", "utilities.net",
  "utilities.deduction_method", "utilities.deduction_percent",
  "other.payer_tax_id", "other.description_label", "other.gross", "other.deduction", "other.net",
  "other.deduction_method", "other.deduction_percent",
]

// คำศัพท์ logical key ที่ปิดชุดต่อ form type — เปลี่ยนเฉพาะตอนกฎหมาย/โครงสร้างฟอร์มเปลี่ยนจริง (ไม่ใช่ทุกครั้งที่อัปโหลด template ใหม่)
export const PND_LOGICAL_KEYS: Record<"90" | "94", string[]> = {
  "90": [
    ...PND_SHARED_LOGICAL_KEYS,
    "header.tax_year", "personal.filing_type",
    "annex.tax_id", "annex.first_name", "annex.last_name", "annex.personal_deduction_item1", "annex.personal_deduction_total",
    ...Array.from({ length: 25 }, (_, i) => `item.${i + 1}`),
    "item.9_base",
    "item.16_sign", "item.18_sign", "item.23_sign", "item.25_sign",
    "summary.due_amount", "summary.overpaid_amount",
  ],
  "94": [
    ...PND_SHARED_LOGICAL_KEYS,
    "personal.personal_deduction", "personal.personal_deduction_recap", "personal.filing_type",
    ...Array.from({ length: 19 }, (_, i) => `item.${i + 1}`),
    "summary.tax_due_recap_1", "summary.tax_due_recap_2",
  ],
}

// ชื่อฟิลด์ PDF AcroForm ที่ generatePndPdf() ต้องใช้กรอกข้อมูลจริง (ดูจุด setField() ด้านล่าง)
// ใช้เป็น single source of truth ทั้งตอน fill ข้อมูลจริง และตอน Super Admin ตรวจสอบไฟล์ template ที่อัปโหลดใหม่
export const REQUIRED_PND_FIELDS: Record<"90" | "94", string[]> = {
  "90": [
    "Text11111", "Text80.0", "Text7.0", "Text7.2",
    "Text9", "Text13", "Text155.3", "Text155.5", "Text155.6", "Text20",
    "Text31.1.1", "Text360.1", "Text360.2", "Text360.3",
    "Text70", "Text40.0", "Text40.1", "Text40.2",
    "Text71", "Text40.3", "Text40.4", "Text40.5",
    "Text38.0",
    "Text87.2", "Text87.3", "Text87.4", "Text87.6", "Text87.8", "Text87.9", "Text87.33", "Text87.34", "Text87.12",
    "Text87.15", "Text87.20", "Text87.23", "Text87.28", "Text87.30",
    "Text23.1.1", "Text30.0",
    "Text68.3", "Text68.5", "Text69.1", "Text69.62",
  ],
  "94": [
    "Text1.1", "Text1.5", "Text1.7", "Text1.13", "Text1.16", "Text1.17", "Text1.18", "Text1.19", "Text1.20",
    "Text3.10", "Text3.11", "Text3.12", "Text3.15", "Text3.16", "Text3.17",
    "Text3.20", "Text3.21", "Text3.22", "Text3.25", "Text3.26", "Text3.27",
    "Text3.30", "Text3.31", "Text3.32", "Text3.35", "Text3.36", "Text3.37",
    "Text4.10.1",
    "Text2.1", "Text2.2", "Text2.3", "Text2.5", "Text2.7", "Text2.8", "Text2.9", "Text2.10", "Text2.12", "Text2.15", "Text2.17", "Text2.19",
  ],
}

// mapping เริ่มต้นที่ตรงกับ template ที่ bundle มากับระบบวันนี้ (public/templates/PND90_Template.pdf, 250668PIT94.pdf)
// ใช้เป็น fallback เมื่อยังไม่มี mapping จาก DB สำหรับ template ที่ resolve ได้ (เช่น ก่อน backfill หรือ dev เทสต์ในเครื่อง)
// เป็น "การ transcribe" ชื่อ field ที่เคย hardcode ไว้แบบ 1:1 ไม่ใช่การตัดสินใจใหม่ — ห้ามแก้ค่าที่นี่โดยไม่ตรวจสอบตำแหน่งจริงก่อน
export const DEFAULT_PND90_MAPPING: PndFieldMapping[] = [
  { logicalKey: "header.tax_year", fieldKind: "text", physicalFieldName: "Text11111", valueFormat: "raw" },
  { logicalKey: "personal.tax_id", fieldKind: "text", physicalFieldName: "Text80.0", valueFormat: "raw" },
  { logicalKey: "personal.first_name", fieldKind: "text", physicalFieldName: "Text7.0", valueFormat: "raw" },
  { logicalKey: "personal.last_name", fieldKind: "text", physicalFieldName: "Text7.2", valueFormat: "raw" },
  { logicalKey: "personal.taxpayer_status", fieldKind: "radio", physicalFieldName: "Radio Button48", optionKey: "individual", widgetIndex: 0 },
  { logicalKey: "personal.taxpayer_status", fieldKind: "radio", physicalFieldName: "Radio Button48", optionKey: "partnership", widgetIndex: 1 },
  { logicalKey: "personal.filing_type", fieldKind: "radio", physicalFieldName: "Radio Button999", optionKey: "normal", widgetIndex: 0 },
  { logicalKey: "address.building", fieldKind: "text", physicalFieldName: "Text9", valueFormat: "raw" },
  { logicalKey: "address.room", fieldKind: "text", physicalFieldName: "Text100.1", valueFormat: "raw" },
  { logicalKey: "address.floor", fieldKind: "text", physicalFieldName: "Text100.2", valueFormat: "raw" },
  { logicalKey: "address.village", fieldKind: "text", physicalFieldName: "Text100.3", valueFormat: "raw" },
  { logicalKey: "address.no", fieldKind: "text", physicalFieldName: "Text13", valueFormat: "raw" },
  { logicalKey: "address.moo", fieldKind: "text", physicalFieldName: "Text14", valueFormat: "raw" },
  { logicalKey: "address.soi", fieldKind: "text", physicalFieldName: "Text155.1", valueFormat: "raw" },
  { logicalKey: "address.yaek", fieldKind: "text", physicalFieldName: "Text155.2", valueFormat: "raw" },
  { logicalKey: "address.road", fieldKind: "text", physicalFieldName: "Text155.3", valueFormat: "raw" },
  { logicalKey: "address.subdistrict", fieldKind: "text", physicalFieldName: "Text155.4", valueFormat: "raw" },
  { logicalKey: "address.district", fieldKind: "text", physicalFieldName: "Text155.5", valueFormat: "raw" },
  { logicalKey: "address.province", fieldKind: "text", physicalFieldName: "Text155.6", valueFormat: "raw" },
  { logicalKey: "address.zipcode", fieldKind: "text", physicalFieldName: "Text20", valueFormat: "raw" },
  { logicalKey: "rent.payer_tax_id", fieldKind: "text", physicalFieldName: "Text31.1.1", valueFormat: "raw" },
  { logicalKey: "rent.gross", fieldKind: "text", physicalFieldName: "Text360.1", valueFormat: "comb" },
  { logicalKey: "rent.deduction", fieldKind: "text", physicalFieldName: "Text360.2", valueFormat: "comb" },
  { logicalKey: "rent.net", fieldKind: "text", physicalFieldName: "Text360.3", valueFormat: "comb" },
  { logicalKey: "rent.deduction_method", fieldKind: "radio", physicalFieldName: "Radio Button14", optionKey: "percentage", widgetIndex: 0 },
  { logicalKey: "rent.deduction_method", fieldKind: "radio", physicalFieldName: "Radio Button14", optionKey: "actual", widgetIndex: 1 },
  { logicalKey: "utilities.payer_tax_id", fieldKind: "text", physicalFieldName: "Text38.0", valueFormat: "raw" },
  { logicalKey: "utilities.description_label", fieldKind: "text", physicalFieldName: "Text70", valueFormat: "raw" },
  { logicalKey: "utilities.gross", fieldKind: "text", physicalFieldName: "Text40.0", valueFormat: "comb" },
  { logicalKey: "utilities.deduction", fieldKind: "text", physicalFieldName: "Text40.1", valueFormat: "comb" },
  { logicalKey: "utilities.net", fieldKind: "text", physicalFieldName: "Text40.2", valueFormat: "comb" },
  { logicalKey: "utilities.deduction_percent", fieldKind: "text", physicalFieldName: "Text73.0", valueFormat: "raw" },
  { logicalKey: "utilities.deduction_method", fieldKind: "radio", physicalFieldName: "Radio Button22", optionKey: "percentage", widgetIndex: 0 },
  { logicalKey: "utilities.deduction_method", fieldKind: "radio", physicalFieldName: "Radio Button22", optionKey: "actual", widgetIndex: 1 },
  { logicalKey: "other.description_label", fieldKind: "text", physicalFieldName: "Text71", valueFormat: "raw" },
  { logicalKey: "other.gross", fieldKind: "text", physicalFieldName: "Text40.3", valueFormat: "comb" },
  { logicalKey: "other.deduction", fieldKind: "text", physicalFieldName: "Text40.4", valueFormat: "comb" },
  { logicalKey: "other.net", fieldKind: "text", physicalFieldName: "Text40.5", valueFormat: "comb" },
  { logicalKey: "other.deduction_method", fieldKind: "radio", physicalFieldName: "Radio Button24", optionKey: "actual", widgetIndex: 1 },
  { logicalKey: "annex.tax_id", fieldKind: "text", physicalFieldName: "Text68.3", valueFormat: "raw" },
  { logicalKey: "annex.first_name", fieldKind: "text", physicalFieldName: "Text68.5", valueFormat: "raw" },
  { logicalKey: "annex.last_name", fieldKind: "text", physicalFieldName: "Text68.7", valueFormat: "raw" },
  { logicalKey: "annex.personal_deduction_item1", fieldKind: "text", physicalFieldName: "Text69.1", valueFormat: "comb" },
  { logicalKey: "annex.personal_deduction_total", fieldKind: "text", physicalFieldName: "Text69.62", valueFormat: "comb" },
  { logicalKey: "item.1", fieldKind: "text", physicalFieldName: "Text87.2", valueFormat: "comb" },
  { logicalKey: "item.2", fieldKind: "text", physicalFieldName: "Text87.3", valueFormat: "comb" },
  { logicalKey: "item.3", fieldKind: "text", physicalFieldName: "Text87.4", valueFormat: "comb" },
  { logicalKey: "item.5", fieldKind: "text", physicalFieldName: "Text87.6", valueFormat: "comb" },
  { logicalKey: "item.7", fieldKind: "text", physicalFieldName: "Text87.8", valueFormat: "comb" },
  { logicalKey: "item.8", fieldKind: "text", physicalFieldName: "Text87.9", valueFormat: "comb" },
  { logicalKey: "item.9_base", fieldKind: "text", physicalFieldName: "Text87.10", valueFormat: "plain_decimal" },
  { logicalKey: "item.9", fieldKind: "text", physicalFieldName: "Text87.33", valueFormat: "comb" },
  { logicalKey: "item.10", fieldKind: "text", physicalFieldName: "Text87.34", valueFormat: "comb" },
  { logicalKey: "item.12", fieldKind: "text", physicalFieldName: "Text87.12", valueFormat: "comb" },
  { logicalKey: "item.14", fieldKind: "text", physicalFieldName: "Text87.15", valueFormat: "comb" },
  { logicalKey: "item.16", fieldKind: "text", physicalFieldName: "Text87.20", valueFormat: "comb" },
  { logicalKey: "item.16_sign", fieldKind: "radio", physicalFieldName: "Radio Button89", optionKey: "due", widgetIndex: 0 },
  { logicalKey: "item.16_sign", fieldKind: "radio", physicalFieldName: "Radio Button89", optionKey: "overpaid", widgetIndex: 1 },
  { logicalKey: "item.18", fieldKind: "text", physicalFieldName: "Text87.23", valueFormat: "comb" },
  { logicalKey: "item.18_sign", fieldKind: "radio", physicalFieldName: "Radio Button93", optionKey: "due", widgetIndex: 0 },
  { logicalKey: "item.18_sign", fieldKind: "radio", physicalFieldName: "Radio Button93", optionKey: "overpaid", widgetIndex: 1 },
  { logicalKey: "item.23", fieldKind: "text", physicalFieldName: "Text87.28", valueFormat: "comb" },
  { logicalKey: "item.23_sign", fieldKind: "radio", physicalFieldName: "Radio Button106", optionKey: "due", widgetIndex: 0 },
  { logicalKey: "item.23_sign", fieldKind: "radio", physicalFieldName: "Radio Button106", optionKey: "overpaid", widgetIndex: 1 },
  { logicalKey: "item.25", fieldKind: "text", physicalFieldName: "Text87.30", valueFormat: "comb" },
  { logicalKey: "item.25_sign", fieldKind: "radio", physicalFieldName: "Radio Button107", optionKey: "due", widgetIndex: 0 },
  { logicalKey: "item.25_sign", fieldKind: "radio", physicalFieldName: "Radio Button107", optionKey: "overpaid", widgetIndex: 1 },
  { logicalKey: "summary.due_amount", fieldKind: "text", physicalFieldName: "Text23.1.1", valueFormat: "comb" },
  { logicalKey: "summary.overpaid_amount", fieldKind: "text", physicalFieldName: "Text30.0", valueFormat: "comb" },
]

export const DEFAULT_PND94_MAPPING: PndFieldMapping[] = [
  { logicalKey: "personal.tax_id", fieldKind: "text", physicalFieldName: "Text1.1", valueFormat: "raw" },
  { logicalKey: "personal.first_name", fieldKind: "text", physicalFieldName: "Text1.5", valueFormat: "raw" },
  { logicalKey: "personal.last_name", fieldKind: "text", physicalFieldName: "Text1.7", valueFormat: "raw" },
  { logicalKey: "personal.taxpayer_status", fieldKind: "radio", physicalFieldName: "Radio Button4", optionKey: "individual", widgetIndex: 0 },
  { logicalKey: "personal.taxpayer_status", fieldKind: "radio", physicalFieldName: "Radio Button4", optionKey: "partnership", widgetIndex: 1 },
  { logicalKey: "personal.filing_type", fieldKind: "radio", physicalFieldName: "Radio Button1", optionKey: "normal", widgetIndex: 0 },
  { logicalKey: "address.building", fieldKind: "text", physicalFieldName: "Text1.9", valueFormat: "raw" },
  { logicalKey: "address.room", fieldKind: "text", physicalFieldName: "Text1.10", valueFormat: "raw" },
  { logicalKey: "address.floor", fieldKind: "text", physicalFieldName: "Text1.11", valueFormat: "raw" },
  { logicalKey: "address.village", fieldKind: "text", physicalFieldName: "Text1.12", valueFormat: "raw" },
  { logicalKey: "address.no", fieldKind: "text", physicalFieldName: "Text1.13", valueFormat: "raw" },
  { logicalKey: "address.moo", fieldKind: "text", physicalFieldName: "Text1.14", valueFormat: "raw" },
  { logicalKey: "address.soi", fieldKind: "text", physicalFieldName: "Text1.15", valueFormat: "raw" },
  { logicalKey: "address.yaek", fieldKind: "text", physicalFieldName: "Text1.21", valueFormat: "raw" },
  { logicalKey: "address.road", fieldKind: "text", physicalFieldName: "Text1.16", valueFormat: "raw" },
  { logicalKey: "address.subdistrict", fieldKind: "text", physicalFieldName: "Text1.17", valueFormat: "raw" },
  { logicalKey: "address.district", fieldKind: "text", physicalFieldName: "Text1.18", valueFormat: "raw" },
  { logicalKey: "address.province", fieldKind: "text", physicalFieldName: "Text1.19", valueFormat: "raw" },
  { logicalKey: "address.zipcode", fieldKind: "text", physicalFieldName: "Text1.20", valueFormat: "raw" },
  { logicalKey: "rent.payer_tax_id", fieldKind: "text", physicalFieldName: "Text3.10", valueFormat: "raw" },
  { logicalKey: "rent.description_label", fieldKind: "text", physicalFieldName: "Text3.11", valueFormat: "raw" },
  { logicalKey: "rent.gross", fieldKind: "text", physicalFieldName: "Text3.12", valueFormat: "plain_decimal" },
  { logicalKey: "rent.deduction_percent", fieldKind: "text", physicalFieldName: "Text3.15", valueFormat: "raw" },
  { logicalKey: "rent.deduction_method", fieldKind: "radio", physicalFieldName: "Radio Button6", optionKey: "percentage", widgetIndex: 0 },
  { logicalKey: "rent.deduction_method", fieldKind: "radio", physicalFieldName: "Radio Button6", optionKey: "actual", widgetIndex: 1 },
  { logicalKey: "rent.deduction", fieldKind: "text", physicalFieldName: "Text3.16", valueFormat: "plain_decimal" },
  { logicalKey: "rent.net", fieldKind: "text", physicalFieldName: "Text3.17", valueFormat: "plain_decimal" },
  { logicalKey: "utilities.payer_tax_id", fieldKind: "text", physicalFieldName: "Text3.20", valueFormat: "raw" },
  { logicalKey: "utilities.description_label", fieldKind: "text", physicalFieldName: "Text3.21", valueFormat: "raw" },
  { logicalKey: "utilities.gross", fieldKind: "text", physicalFieldName: "Text3.22", valueFormat: "plain_decimal" },
  { logicalKey: "utilities.deduction_percent", fieldKind: "text", physicalFieldName: "Text3.25", valueFormat: "raw" },
  { logicalKey: "utilities.deduction_method", fieldKind: "radio", physicalFieldName: "Radio Button7", optionKey: "percentage", widgetIndex: 0 },
  { logicalKey: "utilities.deduction_method", fieldKind: "radio", physicalFieldName: "Radio Button7", optionKey: "actual", widgetIndex: 1 },
  { logicalKey: "utilities.deduction", fieldKind: "text", physicalFieldName: "Text3.26", valueFormat: "plain_decimal" },
  { logicalKey: "utilities.net", fieldKind: "text", physicalFieldName: "Text3.27", valueFormat: "plain_decimal" },
  { logicalKey: "other.payer_tax_id", fieldKind: "text", physicalFieldName: "Text3.30", valueFormat: "raw" },
  { logicalKey: "other.description_label", fieldKind: "text", physicalFieldName: "Text3.31", valueFormat: "raw" },
  { logicalKey: "other.gross", fieldKind: "text", physicalFieldName: "Text3.32", valueFormat: "plain_decimal" },
  { logicalKey: "other.deduction_percent", fieldKind: "text", physicalFieldName: "Text3.35", valueFormat: "raw" },
  { logicalKey: "other.deduction_method", fieldKind: "radio", physicalFieldName: "Radio Button8", optionKey: "actual", widgetIndex: 1 },
  { logicalKey: "other.deduction", fieldKind: "text", physicalFieldName: "Text3.36", valueFormat: "plain_decimal" },
  { logicalKey: "other.net", fieldKind: "text", physicalFieldName: "Text3.37", valueFormat: "plain_decimal" },
  { logicalKey: "personal.personal_deduction", fieldKind: "text", physicalFieldName: "Text4.10.1", valueFormat: "plain_decimal" },
  { logicalKey: "personal.personal_deduction_recap", fieldKind: "text", physicalFieldName: "Text5.92", valueFormat: "plain_decimal" },
  { logicalKey: "item.1", fieldKind: "text", physicalFieldName: "Text2.1", valueFormat: "plain_decimal" },
  { logicalKey: "item.2", fieldKind: "text", physicalFieldName: "Text2.2", valueFormat: "plain_decimal" },
  { logicalKey: "item.3", fieldKind: "text", physicalFieldName: "Text2.3", valueFormat: "plain_decimal" },
  { logicalKey: "item.4", fieldKind: "text", physicalFieldName: "Text2.4", valueFormat: "plain_decimal" },
  { logicalKey: "item.5", fieldKind: "text", physicalFieldName: "Text2.5", valueFormat: "plain_decimal" },
  { logicalKey: "item.6", fieldKind: "text", physicalFieldName: "Text2.6", valueFormat: "plain_decimal" },
  { logicalKey: "item.7", fieldKind: "text", physicalFieldName: "Text2.7", valueFormat: "plain_decimal" },
  { logicalKey: "item.8", fieldKind: "text", physicalFieldName: "Text2.8", valueFormat: "plain_decimal" },
  { logicalKey: "item.9", fieldKind: "text", physicalFieldName: "Text2.9", valueFormat: "plain_decimal" },
  { logicalKey: "item.10", fieldKind: "text", physicalFieldName: "Text2.10", valueFormat: "plain_decimal" },
  { logicalKey: "item.11", fieldKind: "text", physicalFieldName: "Text2.11", valueFormat: "plain_decimal" },
  { logicalKey: "item.12", fieldKind: "text", physicalFieldName: "Text2.12", valueFormat: "plain_decimal" },
  { logicalKey: "item.13", fieldKind: "text", physicalFieldName: "Text2.13", valueFormat: "plain_decimal" },
  // หมายเหตุ: item.14 (ภาษีหัก ณ ที่จ่าย) ไม่มี field แยกในเทมเพลตนี้ (ของเดิมก็ไม่เคยกรอก Text2.14) จึงไม่ map ไว้ตรงนี้
  { logicalKey: "item.15", fieldKind: "text", physicalFieldName: "Text2.15", valueFormat: "plain_decimal" },
  { logicalKey: "item.16", fieldKind: "text", physicalFieldName: "Text2.16", valueFormat: "plain_decimal" },
  { logicalKey: "item.17", fieldKind: "text", physicalFieldName: "Text2.17", valueFormat: "plain_decimal" },
  { logicalKey: "item.18", fieldKind: "text", physicalFieldName: "Text2.18", valueFormat: "plain_decimal" },
  { logicalKey: "item.19", fieldKind: "text", physicalFieldName: "Text2.19", valueFormat: "plain_decimal" },
  // Text2.20 และ Text2.25 คือกล่องสรุปยอดภาษีที่ต้องชำระ (ข้อ 19) ที่พิมพ์ซ้ำอีก 2 จุดในหน้าเดียวกัน ใช้ค่าเดียวกันเสมอ
  { logicalKey: "summary.tax_due_recap_1", fieldKind: "text", physicalFieldName: "Text2.20", valueFormat: "plain_decimal" },
  { logicalKey: "summary.tax_due_recap_2", fieldKind: "text", physicalFieldName: "Text2.25", valueFormat: "plain_decimal" },
  // หมายเหตุ: Text2.26 (กล่อง "ภาษีที่ชำระ" ด้านขวา) มี maxLength=3 ไม่พอใส่ยอดเงินเต็มจำนวน จึงไม่ map ไว้เช่นกัน
]

// ชื่อเรียกภาษาไทยของแต่ละบรรทัดในกล่อง "ข้อ 11 การคำนวณภาษี" (90) / กล่องคำนวณภาษีหน้า 1 (94) — เพื่อให้ Super Admin
// เห็นความหมายของแต่ละ item.N ตอนเลือกใน dropdown "ความหมาย" แทนที่จะเห็นแค่หมายเลขเฉยๆ (ดูสูตรจริงใน computePnd90/94Values)
// เป็นคำอธิบายแบบ paraphrase ให้เข้าใจง่าย ไม่ใช่ข้อความทางการที่ลอกจากแบบฟอร์มตรงตัว 100% ถ้าไม่ตรงกับฟอร์มจริงแก้ที่นี่ได้เลย
const PND_ITEM_LABELS: Record<"90" | "94", Record<string, string>> = {
  "90": {
    "item.1": "เงินได้พึงประเมิน",
    "item.2": "หัก ค่าลดหย่อน",
    "item.3": "เงินได้หลังหักค่าลดหย่อน",
    "item.4": "หัก เงินบริจาคสนับสนุนการศึกษา/กีฬา ฯลฯ",
    "item.5": "เงินได้หลังหักเงินบริจาคเพื่อการศึกษา/กีฬา",
    "item.6": "หัก เงินบริจาคอื่นๆ",
    "item.7": "เงินได้สุทธิ",
    "item.8": "ภาษีเงินได้ตามอัตราก้าวหน้า (จากเงินได้สุทธิ ข้อ 7)",
    "item.9": "ภาษีคำนวณจากเงินได้พึงประเมิน (ไม่รวม 40(1)) x 0.5%",
    "item.9_base": "ฐานเงินได้พึงประเมิน (ไม่รวม 40(1)) ที่ใช้คำนวณข้อ 9",
    "item.10": "ภาษีที่ต้องเสีย (เลือกจำนวนที่มากกว่าระหว่างข้อ 8 กับข้อ 9)",
    "item.11": "ภาษีจากใบแสดงเงินได้ในเขตพัฒนาพิเศษเฉพาะกิจ",
    "item.12": "รวมภาษีที่ต้องเสีย (ข้อ 10 + ข้อ 11)",
    "item.13": "หัก เครดิตภาษีเงินได้จากต่างประเทศ",
    "item.14": "ภาษีที่ต้องชำระหลังหักเครดิตต่างประเทศ",
    "item.15": "หัก ภาษีเงินได้หัก ณ ที่จ่ายและเครดิตภาษี",
    "item.16": "ภาษีที่ต้องชำระ/ชำระไว้เกิน",
    "item.16_sign": "เครื่องหมายข้อ 16 (ต้องชำระเพิ่ม/ชำระไว้เกิน)",
    "item.17": "ยกมาจากข้อ 8 (ขายอสังหาริมทรัพย์แยกยื่น)",
    "item.18": "รวม (ข้อ 16 + ข้อ 17)",
    "item.18_sign": "เครื่องหมายข้อ 18",
    "item.19": "ยกมาจากข้อ 9",
    "item.20": "ยกมาจากใบแนบ",
    "item.21": "ยกมาจากใบแนบ",
    "item.22": "เฉพาะกรณียื่นเพิ่มเติม",
    "item.23": "รวม (ข้อ 18 + 19 + 20 - 21 - 22)",
    "item.23_sign": "เครื่องหมายข้อ 23",
    "item.24": "บวก เงินเพิ่ม",
    "item.25": "รวมภาษีที่ชำระเพิ่มเติม/ชำระไว้เกิน (สุดท้าย)",
    "item.25_sign": "เครื่องหมายข้อ 25",
  },
  "94": {
    "item.1": "เงินได้หลังหักค่าใช้จ่าย (รวม ก.1 + ก.2 + ก.3)",
    "item.2": "หัก ค่าลดหย่อนส่วนตัว",
    "item.3": "เงินได้หลังหักค่าลดหย่อน",
    "item.4": "หัก เงินบริจาคสนับสนุนการศึกษา/กีฬา ฯลฯ",
    "item.5": "เงินได้หลังหักเงินบริจาคเพื่อการศึกษา/กีฬา",
    "item.6": "หัก เงินบริจาคอื่นๆ",
    "item.7": "เงินได้สุทธิ",
    "item.8": "ภาษีเงินได้ตามอัตราก้าวหน้า (จากเงินได้สุทธิ ข้อ 7)",
    "item.9": "ภาษีคำนวณจากเงินได้พึงประเมิน (ไม่รวม 40(1)) x 0.5%",
    "item.10": "ภาษีที่ต้องเสีย (เลือกจำนวนที่มากกว่าระหว่างข้อ 8 กับข้อ 9)",
    "item.11": "ภาษีจากใบแสดงเงินได้ในเขตพัฒนาพิเศษเฉพาะกิจ",
    "item.12": "รวมภาษีที่ต้องเสีย (ข้อ 10 + ข้อ 11)",
    "item.13": "หัก เครดิตภาษีเงินได้จากต่างประเทศ",
    "item.14": "หัก ภาษีเงินได้หัก ณ ที่จ่าย",
    "item.15": "ภาษีที่ต้องชำระ/ชำระไว้เกิน",
    "item.16": "หัก ภาษีที่ชำระไว้ (กรณียื่นเพิ่มเติม)",
    "item.17": "ภาษีที่ต้องชำระเพิ่มเติม/ชำระไว้เกิน",
    "item.18": "บวก เงินเพิ่ม (กรณียื่นเกินกำหนด/ยื่นเพิ่มเติม)",
    "item.19": "รวมภาษีและเงินเพิ่มที่ต้องชำระทั้งสิ้น",
  },
}

export interface PndLogicalKeyCatalogEntry {
  key: string
  kind: "text" | "radio"
  options?: string[] // radio เท่านั้น — ตัวเลือกเชิงความหมายที่เป็นไปได้ (เช่น "percentage"/"actual")
  label?: string // คำอธิบายภาษาไทยสั้นๆ ให้ Super Admin เข้าใจว่า key นี้คือช่องอะไร (ตอนนี้มีเฉพาะกลุ่ม item.* ของ 90/94)
}

// สร้าง catalog "key ไหนเป็น text/radio และมีตัวเลือกอะไรบ้าง" — ครอบทุก key ใน PND_LOGICAL_KEYS เสมอ (แม้ key ที่ยังไม่เคย
// map ใน DEFAULT mapping เช่นรายการเงินบริจาคที่ template ปัจจุบันไม่มีช่องให้ ก็ยังต้องเลือกได้ล่วงหน้าเผื่อ template ใหม่มีช่องนี้)
// เติม kind/options จาก DEFAULT mapping โดยอัตโนมัติ (ไม่ maintain ซ้ำมือ) ค่า default ของ key ที่ไม่เจอคือ "text"
function buildLogicalKeyCatalog(formType: "90" | "94", defaultMapping: PndFieldMapping[]): PndLogicalKeyCatalogEntry[] {
  const byKey = new Map<string, PndLogicalKeyCatalogEntry>()
  for (const key of PND_LOGICAL_KEYS[formType]) {
    byKey.set(key, { key, kind: "text", label: PND_ITEM_LABELS[formType][key] })
  }
  for (const m of defaultMapping) {
    const entry = byKey.get(m.logicalKey) || { key: m.logicalKey, kind: m.fieldKind }
    entry.kind = m.fieldKind
    if (m.fieldKind === "radio") {
      entry.options = entry.options || []
      if (m.optionKey && !entry.options.includes(m.optionKey)) entry.options.push(m.optionKey)
    }
    byKey.set(m.logicalKey, entry)
  }
  return Array.from(byKey.values())
}

export const PND_LOGICAL_KEY_CATALOG: Record<"90" | "94", PndLogicalKeyCatalogEntry[]> = {
  "90": buildLogicalKeyCatalog("90", DEFAULT_PND90_MAPPING),
  "94": buildLogicalKeyCatalog("94", DEFAULT_PND94_MAPPING),
}

// เครื่องหมาย due/overpaid ของ item ที่เป็นผลต่าง (>0 = ต้องชำระเพิ่ม, <0 = ชำระไว้เกิน, =0 = ไม่ต้องเลือกเลย)
const signOf = (n: number): string | null => (n > 0 ? "due" : n < 0 ? "overpaid" : null)

// สูตรคำนวณภาษี ภ.ง.ด. 90 (เต็มปี) — ล้วนเป็นตรรกะเดิมที่เคยฝังอยู่ใน generatePndPdf ไม่เปลี่ยนแปลง
// ไม่รู้จักชื่อ field ทางกายภาพเลย คืนค่าเป็น logical key ล้วนๆ ให้ fillPdfFromMapping ไปจับคู่กับ mapping ต่อไป
export function computePnd90Values(data: PndData, formattedTaxId: string): PndComputedValues {
  const addressParts = data.addressParts || EMPTY_ADDRESS_PARTS
  const other408 = data.other408 || 0
  const deductionOther408 = data.deductionOther408 || 0
  const otherNet = other408 - deductionOther408

  const rentNet = data.rent405 - data.deductionRent405
  const rentIsActual = data.rentDeductionMethod === "actual"

  const utilitiesNet = data.utilities408 - data.deductionUtilities408
  const utilIsActual = data.utilitiesDeductionMethod === "actual"
  const utilDeductionPct = data.utilities408 > 0 ? Math.round((data.deductionUtilities408 / data.utilities408) * 100) : 0

  // ค่าลดหย่อนส่วนตัว (ตามสถานภาพผู้เสียภาษี) ใช้ทั้งในข้อ 11 ข้อ 2. และในใบแนบแสดงรายละเอียดรายการลดหย่อนฯ หน้า 5
  const personalDeduction = calculatePersonalDeduction("90", data.taxpayerStatus || "individual", data.partnerCount || 1)

  // ข้อ 11 การคำนวณภาษี — รายการที่ระบบไม่มีข้อมูลจริง (เงินบริจาค/ภาษีหัก ณ ที่จ่าย/ยื่นเพิ่มเติม ฯลฯ) ปล่อยว่างไว้ไม่กรอกเลข 0
  // ส่วนรายการที่คำนวณได้จริง (ถึงจะได้ 0 จากการคำนวณ) ยังกรอกตามปกติ เพื่อไม่ให้ดูเหมือนข้อมูลหาย
  const item1 = data.netIncome
  const item2 = personalDeduction
  const item3 = Math.max(0, item1 - item2)
  const item4 = 0 // หัก เงินบริจาคสนับสนุนการศึกษา/อื่นๆ — ไม่มีข้อมูล ปล่อยว่าง
  const item5 = item3 - item4
  const item6 = 0 // หัก เงินบริจาคทั่วไป — ไม่มีข้อมูล ปล่อยว่าง
  const item7 = Math.max(0, item5 - item6)
  const grossAssessableFull = data.rent405 + data.utilities408 + other408 // ไม่รวมมาตรา 40(1) (ระบบไม่มีเงินได้ประเภทนี้)
  const item8 = calculateProgressiveTax(item7)
  const item9 = calculateMinimumTax(grossAssessableFull)
  const item10 = calculateFinalTaxDue(item8, item9)
  const item11 = 0 // ภาษีจากใบแสดงเงินได้ฯ ในเขตพัฒนาพิเศษเฉพาะกิจ — ไม่มีข้อมูล ปล่อยว่าง
  const item12 = item10 + item11
  const item13 = 0 // หัก เครดิตภาษีเงินได้จากต่างประเทศ — ไม่มีข้อมูล ปล่อยว่าง
  const item14 = item12 - item13
  const item15 = 0 // หัก ภาษีเงินได้หัก ณ ที่จ่ายและเครดิตภาษี — ไม่มี field แยกในระบบ ปล่อยว่าง
  const item16 = item14 - item15
  const item17 = 0 // ยกมาจากข้อ 8 (ขายอสังหาริมทรัพย์แยกยื่น) — ไม่มีข้อมูล ปล่อยว่าง
  const item18 = item16 + item17
  const item19 = 0 // ยกมาจากข้อ 9 — ไม่มีข้อมูล ปล่อยว่าง
  const item20 = 0 // ยกมาจากใบแนบ — ไม่มีข้อมูล ปล่อยว่าง
  const item21 = 0 // ยกมาจากใบแนบ — ไม่มีข้อมูล ปล่อยว่าง
  const item22 = 0 // เฉพาะกรณียื่นเพิ่มเติม (ระบบนี้ยื่นปกติ) ปล่อยว่าง
  const item23 = item18 + item19 + item20 - item21 - item22
  const item24 = 0 // บวก เงินเพิ่ม — ไม่มีข้อมูล ปล่อยว่าง
  const item25 = item23 + item24 // รวมภาษีที่ชำระเพิ่มเติม/ชำระไว้เกิน สุดท้าย

  const text: Record<string, PndTextValue | null> = {
    "header.tax_year": { format: "raw", text: data.taxYear },
    "personal.tax_id": { format: "raw", text: formattedTaxId },
    "personal.first_name": { format: "raw", text: data.firstName },
    "personal.last_name": { format: "raw", text: data.lastName },
    "address.building": { format: "raw", text: addressParts.building },
    "address.room": { format: "raw", text: addressParts.room },
    "address.floor": { format: "raw", text: addressParts.floor },
    "address.village": { format: "raw", text: addressParts.village },
    "address.no": { format: "raw", text: addressParts.no },
    "address.moo": { format: "raw", text: addressParts.moo },
    "address.soi": { format: "raw", text: addressParts.soi },
    "address.yaek": { format: "raw", text: addressParts.yaek },
    "address.road": { format: "raw", text: addressParts.road },
    "address.subdistrict": { format: "raw", text: addressParts.subdistrict },
    "address.district": { format: "raw", text: addressParts.district },
    "address.province": { format: "raw", text: addressParts.province },
    "address.zipcode": { format: "raw", text: addressParts.zipcode },
    "rent.payer_tax_id": { format: "raw", text: formattedTaxId },
    "rent.gross": { format: "comb", amount: data.rent405 },
    "rent.deduction": { format: "comb", amount: data.deductionRent405 },
    "rent.net": { format: "comb", amount: rentNet },
    "utilities.payer_tax_id": { format: "raw", text: formattedTaxId },
    "utilities.description_label": { format: "raw", text: "ค่าน้ำไฟและบริการ" },
    "utilities.gross": { format: "comb", amount: data.utilities408 },
    "utilities.deduction": { format: "comb", amount: data.deductionUtilities408 },
    "utilities.net": { format: "comb", amount: utilitiesNet },
    "utilities.deduction_percent": { format: "raw", text: utilIsActual ? "" : utilDeductionPct.toString() },
    "annex.tax_id": { format: "raw", text: formattedTaxId },
    "annex.first_name": { format: "raw", text: data.firstName },
    "annex.last_name": { format: "raw", text: data.lastName },
    "annex.personal_deduction_item1": { format: "comb", amount: personalDeduction },
    "annex.personal_deduction_total": { format: "comb", amount: personalDeduction },
    "item.1": { format: "comb", amount: item1 },
    "item.2": { format: "comb", amount: item2 },
    "item.3": { format: "comb", amount: item3 },
    "item.5": { format: "comb", amount: item5 },
    "item.7": { format: "comb", amount: item7 },
    "item.8": { format: "comb", amount: item8 },
    "item.9_base": { format: "plain_decimal", amount: grossAssessableFull },
    "item.9": { format: "comb", amount: item9 },
    "item.10": { format: "comb", amount: item10 },
    "item.12": { format: "comb", amount: item12 },
    "item.14": { format: "comb", amount: item14 },
    "item.16": { format: "comb", amount: item16 },
    "item.18": { format: "comb", amount: item18 },
    "item.23": { format: "comb", amount: item23 },
    "item.25": { format: "comb", amount: item25 },
  }

  if (other408 > 0) {
    text["other.description_label"] = { format: "raw", text: "รายได้อื่น (ปรับ/รับมัดจำ)" }
    text["other.gross"] = { format: "comb", amount: other408 }
    text["other.deduction"] = { format: "comb", amount: deductionOther408 }
    text["other.net"] = { format: "comb", amount: otherNet }
  }

  if (item25 >= 0) {
    text["summary.due_amount"] = { format: "comb", amount: item25 }
  } else {
    text["summary.overpaid_amount"] = { format: "comb", amount: -item25 }
  }

  const radio: Record<string, string | null> = {
    "personal.taxpayer_status": data.taxpayerStatus === "partnership" ? "partnership" : "individual",
    "personal.filing_type": "normal",
    "rent.deduction_method": rentIsActual ? "actual" : "percentage",
    "utilities.deduction_method": utilIsActual ? "actual" : "percentage",
    "item.16_sign": signOf(item16),
    "item.18_sign": signOf(item18),
    "item.23_sign": signOf(item23),
    "item.25_sign": signOf(item25),
  }
  if (other408 > 0) {
    radio["other.deduction_method"] = "actual"
  }

  return { text, radio }
}

// สูตรคำนวณภาษี ภ.ง.ด. 94 (ครึ่งปี) — ล้วนเป็นตรรกะเดิมที่เคยฝังอยู่ใน generatePndPdf ไม่เปลี่ยนแปลง
export function computePnd94Values(data: PndData, formattedTaxId: string): PndComputedValues {
  const addressParts = data.addressParts || EMPTY_ADDRESS_PARTS
  const taxpayerStatus = data.taxpayerStatus || "individual"
  const partnerCount = data.partnerCount || 1

  // ก.1 รายได้ค่าเช่าห้องพัก (มาตรา 40(5))
  const rentGrossHalf = data.rent405 / 2
  const rentDeductionHalf = data.deductionRent405
  const rentNetHalf = Math.max(0, rentGrossHalf - rentDeductionHalf)
  const rentIsActual = data.rentDeductionMethod === "actual"
  const rentDeductionPct = rentGrossHalf > 0 ? Math.round((rentDeductionHalf / rentGrossHalf) * 100) : 0

  // ก.2 ค่าน้ำไฟและบริการ (มาตรา 40(8))
  const utilGrossHalf = data.utilities408 / 2
  const utilDeductionHalf = data.deductionUtilities408
  const utilNetHalf = Math.max(0, utilGrossHalf - utilDeductionHalf)
  const utilIsActual = data.utilitiesDeductionMethod === "actual"
  const utilDeductionPct = utilGrossHalf > 0 ? Math.round((utilDeductionHalf / utilGrossHalf) * 100) : 0

  // ก.3 รายได้อื่น (ปรับ/ริบมัดจำ) — กฎหมายไม่ให้สิทธิ์หักแบบเหมา ใช้ "จริง" เสมอ (ไม่มีข้อมูลค่าใช้จ่ายจริงให้หัก จึงเป็น 0)
  const otherGrossHalf = (data.other408 || 0) / 2

  // ข.1 ค่าลดหย่อนส่วนตัว (ตามสถานภาพผู้เสียภาษี)
  const personalDeduction = calculatePersonalDeduction("94", taxpayerStatus, partnerCount)

  // กล่องคำนวณภาษีหน้า 1 (ข้อ 1-19) — คำนวณภาษีขั้นบันไดจริง ค่าที่ระบบไม่มีข้อมูล (เงินบริจาค/ภาษีหัก ณ ที่จ่าย/ฯลฯ) ตั้งเป็น 0
  const netIncomeAfterExpense = rentNetHalf + utilNetHalf + otherGrossHalf
  const item1 = netIncomeAfterExpense
  const item2 = personalDeduction
  const item3 = Math.max(0, item1 - item2)
  const item4 = 0
  const item5 = item3 - item4
  const item6 = 0
  const item7 = Math.max(0, item5 - item6)
  const grossAssessableHalf = rentGrossHalf + utilGrossHalf + otherGrossHalf
  const item8 = calculateProgressiveTax(item7)
  const item9 = calculateMinimumTax(grossAssessableHalf)
  const item10 = calculateFinalTaxDue(item8, item9)
  const item11 = 0
  const item12 = item10 + item11
  const item13 = 0
  const item14 = 0 // ภาษีหัก ณ ที่จ่าย — ไม่มี field แยกในแบบฟอร์มนี้ (ระบบไม่มีข้อมูลส่วนนี้)
  const item15 = item12 + item13 - item14
  const item16 = 0
  const item17 = Math.max(0, item15 - item16)
  const item18 = 0
  const item19 = item17 + item18

  const text: Record<string, PndTextValue | null> = {
    "personal.tax_id": { format: "raw", text: formattedTaxId },
    "personal.first_name": { format: "raw", text: data.firstName },
    "personal.last_name": { format: "raw", text: data.lastName },
    "address.building": { format: "raw", text: addressParts.building },
    "address.room": { format: "raw", text: addressParts.room },
    "address.floor": { format: "raw", text: addressParts.floor },
    "address.village": { format: "raw", text: addressParts.village },
    "address.no": { format: "raw", text: addressParts.no },
    "address.moo": { format: "raw", text: addressParts.moo },
    "address.soi": { format: "raw", text: addressParts.soi },
    "address.yaek": { format: "raw", text: addressParts.yaek },
    "address.road": { format: "raw", text: addressParts.road },
    "address.subdistrict": { format: "raw", text: addressParts.subdistrict },
    "address.district": { format: "raw", text: addressParts.district },
    "address.province": { format: "raw", text: addressParts.province },
    "address.zipcode": { format: "raw", text: addressParts.zipcode },
    "rent.payer_tax_id": { format: "raw", text: formattedTaxId },
    "rent.description_label": { format: "raw", text: "รายได้ค่าเช่าห้องพัก" },
    "rent.gross": { format: "plain_decimal", amount: rentGrossHalf },
    "rent.deduction_percent": { format: "raw", text: rentIsActual ? "" : rentDeductionPct.toString() },
    "rent.deduction": { format: "plain_decimal", amount: rentDeductionHalf },
    "rent.net": { format: "plain_decimal", amount: rentNetHalf },
    "utilities.payer_tax_id": { format: "raw", text: formattedTaxId },
    "utilities.description_label": { format: "raw", text: "ค่าน้ำไฟและบริการ" },
    "utilities.gross": { format: "plain_decimal", amount: utilGrossHalf },
    "utilities.deduction_percent": { format: "raw", text: utilIsActual ? "" : utilDeductionPct.toString() },
    "utilities.deduction": { format: "plain_decimal", amount: utilDeductionHalf },
    "utilities.net": { format: "plain_decimal", amount: utilNetHalf },
    "other.payer_tax_id": { format: "raw", text: formattedTaxId },
    "other.description_label": { format: "raw", text: "รายได้อื่น (ปรับ/ริบมัดจำ)" },
    "other.gross": { format: "plain_decimal", amount: otherGrossHalf },
    "other.deduction_percent": { format: "raw", text: "0" },
    "other.deduction": { format: "plain_decimal", amount: 0 },
    "other.net": { format: "plain_decimal", amount: otherGrossHalf },
    "personal.personal_deduction": { format: "plain_decimal", amount: personalDeduction },
    // Text5.92 คือกล่องที่ทวนค่าลดหย่อนส่วนตัวซ้ำอีกจุดในหน้าถัดไปของฟอร์ม (ใช้ตัวเลขเดียวกับ Text4.10.1 เสมอ)
    "personal.personal_deduction_recap": { format: "plain_decimal", amount: personalDeduction },
    "item.1": { format: "plain_decimal", amount: item1 },
    "item.2": { format: "plain_decimal", amount: item2 },
    "item.3": { format: "plain_decimal", amount: item3 },
    "item.4": { format: "plain_decimal", amount: item4 },
    "item.5": { format: "plain_decimal", amount: item5 },
    "item.6": { format: "plain_decimal", amount: item6 },
    "item.7": { format: "plain_decimal", amount: item7 },
    "item.8": { format: "plain_decimal", amount: item8 },
    "item.9": { format: "plain_decimal", amount: item9 },
    "item.10": { format: "plain_decimal", amount: item10 },
    "item.11": { format: "plain_decimal", amount: item11 },
    "item.12": { format: "plain_decimal", amount: item12 },
    "item.13": { format: "plain_decimal", amount: item13 },
    // item.14 ไม่มี field แยกในเทมเพลตนี้ (ดูหมายเหตุใน DEFAULT_PND94_MAPPING) จึงไม่ใส่ไว้ที่นี่
    "item.15": { format: "plain_decimal", amount: item15 },
    "item.16": { format: "plain_decimal", amount: item16 },
    "item.17": { format: "plain_decimal", amount: item17 },
    "item.18": { format: "plain_decimal", amount: item18 },
    "item.19": { format: "plain_decimal", amount: item19 },
    // Text2.20/Text2.25 คือกล่องสรุปยอดภาษีที่ต้องชำระซ้ำอีก 2 จุด ใช้ค่าเดียวกับข้อ 19 เสมอ
    "summary.tax_due_recap_1": { format: "plain_decimal", amount: item19 },
    "summary.tax_due_recap_2": { format: "plain_decimal", amount: item19 },
  }

  const radio: Record<string, string | null> = {
    "personal.taxpayer_status": taxpayerStatus === "partnership" ? "partnership" : "individual",
    "personal.filing_type": "normal", // ระบบยื่นแบบปกติเสมอ ไม่รองรับยื่นเพิ่มเติม/แก้ไข
    "rent.deduction_method": rentIsActual ? "actual" : "percentage",
    "utilities.deduction_method": utilIsActual ? "actual" : "percentage",
    "other.deduction_method": "actual",
  }

  return { text, radio }
}

// ตัวกรอกฟอร์ม generic — ไม่รู้จักฟอร์มภาษี/สูตรคำนวณเลย รับแค่ mapping (ชื่อ field จริง) + ค่าที่คำนวณแล้ว (logical key)
// แล้ว dispatch ไปเรียก setField/selectRadioWidget/fmtComb ตัวเดิมของ generatePndPdf ผ่าน helpers ที่ส่งเข้ามา
export function fillPdfFromMapping(
  mappings: PndFieldMapping[],
  computed: PndComputedValues,
  helpers: {
    setField: (name: string, value: string) => void
    selectRadioWidget: (name: string, widgetIndex: number) => void
    getMaxLength: (name: string) => number | undefined
    fmtComb: (n: number, totalLen: number) => string
  }
) {
  const { setField, selectRadioWidget, getMaxLength, fmtComb } = helpers
  for (const fieldMapping of mappings) {
    if (fieldMapping.fieldKind === "text") {
      const value = computed.text[fieldMapping.logicalKey]
      if (!value) continue // ไม่มีข้อมูลคำนวณสำหรับ key นี้ -> ปล่อยฟิลด์ว่างไว้ตามเดิม
      let text: string
      if (value.format === "comb") {
        const totalLen = getMaxLength(fieldMapping.physicalFieldName) || 12
        text = fmtComb(value.amount ?? 0, totalLen)
      } else if (value.format === "plain_decimal") {
        text = (value.amount ?? 0).toFixed(2)
      } else {
        text = value.text ?? ""
      }
      setField(fieldMapping.physicalFieldName, text)
    } else {
      const selectedOption = computed.radio[fieldMapping.logicalKey]
      if (!selectedOption || fieldMapping.optionKey !== selectedOption) continue
      selectRadioWidget(fieldMapping.physicalFieldName, fieldMapping.widgetIndex ?? 0)
    }
  }
}

export async function generatePndPdf(type: "90" | "94", data: PndData, templateUrl?: string, mapping?: PndFieldMapping[]) {
  // 1. กำหนดไฟล์ Template ตามประเภทของ ภ.ง.ด. — ใช้ template ที่ Super Admin อัปโหลดไว้ถ้ามี ไม่งั้น fallback เป็นไฟล์เริ่มต้นของระบบ
  const resolvedTemplateUrl = templateUrl || (type === "90"
    ? "/templates/PND90_Template.pdf"
    : "/templates/250668PIT94.pdf")

  const response = await fetch(resolvedTemplateUrl)
  if (!response.ok) {
    throw new Error(`ไม่สามารถโหลดไฟล์แบบฟอร์ม PDF ต้นแบบจาก ${resolvedTemplateUrl} ได้`)
  }
  const templateBytes = await response.arrayBuffer()

  // 2. ดาวน์โหลดฟอนต์ไทยมาตรฐาน (Sarabun) เพื่อให้พิมพ์ภาษาไทยบน PDF ได้อย่างถูกต้อง
  const fontUrl = "https://fastly.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf"
  const fontResponse = await fetch(fontUrl)
  if (!fontResponse.ok) {
    throw new Error("ไม่สามารถดาวน์โหลดฟอนต์ภาษาไทยสำหรับสร้าง PDF ได้")
  }
  const fontBytes = await fontResponse.arrayBuffer()

  // 3. โหลดและสร้างเอกสาร PDF
  const pdfDoc = await PDFDocument.load(templateBytes)
  pdfDoc.registerFontkit(fontkit)

  // 4. ฝังฟอนต์ไทยลงใน PDF (กำหนด subset: false เพื่อคงตารางตระกูลอักษร GSUB/GPOS ให้สมบูรณ์ ป้องกันวรรณยุกต์เพี้ยนบน iOS)
  const customFont = await pdfDoc.embedFont(fontBytes, { subset: false })

  // ซ่อม field ที่หลุดออกจากต้นไม้ AcroForm ก่อนเรียก getForm() (ดูรายละเอียดที่คอมเมนต์ของฟังก์ชัน)
  repairOrphanedFormFields(pdfDoc)

  // ดึงฟอร์ม PDF
  const form = pdfDoc.getForm()

  // ฟังก์ชันช่วยกรอกฟิลด์อย่างปลอดภัย
  const setField = (name: string, value: string) => {
    try {
      const field = form.getTextField(name)
      field.setText(value)
    } catch (e) {
      console.warn(`ไม่สามารถกรอกฟิลด์ ${name}:`, e)
    }
  }

  const cleanTaxId = data.taxId.replace(/[^0-9]/g, "")
  // ช่องเลขประจำตัวผู้เสียภาษีในฟอร์มนี้เป็น PDF comb field ที่แบ่งเซลล์ตามความยาวตัวอักษรจริง (maxLength=17)
  // นับรวมขีดคั่นด้วย (รูปแบบ X-XXXX-XXXXX-XX-X) จึงต้องพิมพ์ขีดคั่นลงไปเองให้ครบ 17 ตัวอักษร ไม่ใช่ใส่แค่ 13 หลักเปล่าๆ
  const formattedTaxId = cleanTaxId.length === 13
    ? `${cleanTaxId.slice(0, 1)}-${cleanTaxId.slice(1, 5)}-${cleanTaxId.slice(5, 10)}-${cleanTaxId.slice(10, 12)}-${cleanTaxId.slice(12, 13)}`
    : cleanTaxId

  // ปุ่มติ๊ก "ร้อยละ"/"จริง" ของทั้งสองฟอร์ม (เช่น Radio Button22/24 ของ 90, Radio Button6/7/8 ของ 94) มี
  // option export value ซ้ำกันในบาง field (ทุก widget ของปุ่มเดียวกันรายงานชื่อเดียวกันจากมุมมอง getOptions())
  // ทำให้ .select() แบบปกติเลือกผิด widget หรือโยน error จึงต้องตั้งค่า AS (appearance state) ของแต่ละ widget
  // โดยตรงตามลำดับ index แทน (index 0 = ตัวเลือก "ร้อยละ" ซ้ายมือ, index 1 = ตัวเลือก "จริง" ขวามือ ตามตำแหน่งจริงบนฟอร์ม)
  const selectRadioWidget = (name: string, widgetIndex: number) => {
    try {
      const radioGroup = form.getRadioGroup(name)
      const widgets = radioGroup.acroField.getWidgets()
      widgets.forEach((w, i) => {
        const onValue = w.getOnValue()
        if (i === widgetIndex && onValue) {
          w.dict.set(PDFName.of("AS"), onValue)
        } else {
          w.dict.set(PDFName.of("AS"), PDFName.of("Off"))
        }
      })
      const selectedOn = widgets[widgetIndex]?.getOnValue()
      if (selectedOn) {
        radioGroup.acroField.dict.set(PDFName.of("V"), selectedOn)
      }
    } catch (e) {
      console.warn(`ไม่สามารถเลือก radio ${name} (widget ${widgetIndex}):`, e)
    }
  }

  // ช่องจำนวนเงินหลายช่องในฟอร์มนี้เป็น PDF comb field แบบ "บาท-สตางค์" ที่มีเซลล์ขีดคั่นตายตัวก่อนเลข 2 หลักสุดท้ายเสมอ
  // (ตั้ง Q=right-justify ไว้ในฟอร์ม แต่ pdf-lib ไม่ auto จัดชิดขวาให้ comb field — เทียบกันแล้วจาก appearance stream จริง)
  // จึงต้องเติมช่องว่างด้านหน้าเองให้ครบความยาวเซลล์ทั้งหมดเพื่อดันตัวเลขชนขวาให้ตรงตำแหน่งขีดคั่นที่พิมพ์ไว้
  const fmtComb = (n: number, totalLen: number) => {
    const val = Math.max(0, Number.isFinite(n) ? n : 0)
    const [intPart, decPart] = (Math.round(val * 100) / 100).toFixed(2).split(".")
    const bahtCells = totalLen - 3 // หัก 1 เซลล์ขีดคั่น + 2 เซลล์สตางค์
    const bahtDigits = intPart.length > bahtCells ? intPart.slice(-bahtCells) : intPart.padStart(bahtCells, " ")
    return `${bahtDigits}-${decPart}`
  }

  // ความยาว comb cell จริงของแต่ละ field อ่านจากไฟล์ตอนกรอก ไม่ hardcode ไว้ใน mapping (แต่ละ template อาจกว้างไม่เท่ากัน)
  const getMaxLength = (name: string): number | undefined => {
    try {
      return form.getTextField(name).getMaxLength()
    } catch {
      return undefined
    }
  }

  // 5. กรอกข้อมูลและตัวเลขลงในแบบฟอร์มผ่าน mapping (จาก DB ถ้ามี ไม่งั้น fallback เป็น mapping เริ่มต้นของไฟล์ที่ bundle มากับระบบ)
  const activeMapping = mapping || (type === "90" ? DEFAULT_PND90_MAPPING : DEFAULT_PND94_MAPPING)
  const computed = type === "90" ? computePnd90Values(data, formattedTaxId) : computePnd94Values(data, formattedTaxId)
  fillPdfFromMapping(activeMapping, computed, { setField, selectRadioWidget, getMaxLength, fmtComb })

  // 6. อัปเดตการแสดงผลของฟิลด์ทั้งหมดด้วยฟอนต์ไทย Sarabun
  form.updateFieldAppearances(customFont)

  // 7. บันทึกและดึงไฟล์ PDF ออกมาเป็น Blob เพื่อพร้อมดาวน์โหลด
  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes as any], { type: "application/pdf" })
}

// ============================================================================
// ภ.พ.30 — mirror ระบบ mapping เดียวกับ ภ.ง.ด.90/94 ข้างบน (PndFieldMapping/PndComputedValues/
// fillPdfFromMapping ใช้ร่วมกันได้เลย ไม่ใช่ PND-specific จริงๆ) ต่อกับไฟล์ template จริงที่ตรวจสอบแล้ว
// (public/templates/PP30_Template.pdf, ต้นฉบับ pp30_300160.pdf พิมพ์ ม.ค. 2560) ด้วย pdf-lib
//
// ⚠️ สถานะ mapping: ตาราง "การคำนวณภาษี" (Text2.1-16) มั่นใจสูง — ตรวจสอบด้วย pdf-lib.getWidgets()
//    แล้วว่าจำนวน field ตรงกับจำนวนบรรทัด 1-16 บนแบบฟอร์มพอดีและเรียง y ต่อเนื่องตามลำดับ
//    ที่อยู่ผู้ประกอบการ (Text1.4-1.16) ยืนยันแล้วด้วย getRectangle()/getMaxLength() ของแต่ละ field:
//      - จัดกลุ่มตาม y เป็นแถวตรงกับป้ายกำกับบนแบบฟอร์มจริงทีละแถว (อาคาร/ห้องเลขที่/ชั้นที่ ฯลฯ)
//      - ลำดับ x ซ้าย→ขวาในแต่ละแถวตรงกับลำดับป้ายกำกับซ้าย→ขวาเป๊ะ
//      - Text1.15 มี maxLength=5 ซึ่งตรงกับ "รหัสไปรษณีย์" (5 หลัก) เท่านั้นในกลุ่มนี้ — ยืนยันตำแหน่งชัดเจน
//    Text1.02 (เดิม map "address" ไว้ที่นี่) คือช่อง "ชื่อสถานประกอบการ" ไม่ใช่ที่อยู่ — HorSet ไม่ได้แยกเก็บ
//    ชื่อสถานประกอบการต่างหากจากชื่อผู้ประกอบการ จึงปล่อยว่างไว้ตั้งใจ (ไม่ map อะไรเข้าไป)
//    Text1.3 (ระหว่าง Text1.02 กับแถวที่อยู่) ยังไม่ทราบวัตถุประสงค์แน่ชัด — ปล่อยว่างไว้เช่นกัน
// ============================================================================

export const DEFAULT_PP30_MAPPING: PndFieldMapping[] = [
  { logicalKey: "taxId", fieldKind: "text", physicalFieldName: "Text1.0", valueFormat: "raw" },
  { logicalKey: "branchNo", fieldKind: "text", physicalFieldName: "Text1.1", valueFormat: "raw" },
  { logicalKey: "taxpayerName", fieldKind: "text", physicalFieldName: "Text1.01", valueFormat: "raw" },
  { logicalKey: "taxYearBE", fieldKind: "text", physicalFieldName: "Text1.22", valueFormat: "raw" },
  { logicalKey: "additionalFilingNo", fieldKind: "text", physicalFieldName: "Text1.21", valueFormat: "raw" },

  // ที่อยู่แยกช่องย่อย (Text1.02/Text1.3 เว้นว่างตั้งใจ — ดูหมายเหตุด้านบน)
  { logicalKey: "address.building", fieldKind: "text", physicalFieldName: "Text1.4", valueFormat: "raw" },
  { logicalKey: "address.room", fieldKind: "text", physicalFieldName: "Text1.5", valueFormat: "raw" },
  { logicalKey: "address.floor", fieldKind: "text", physicalFieldName: "Text1.6", valueFormat: "raw" },
  { logicalKey: "address.village", fieldKind: "text", physicalFieldName: "Text1.7", valueFormat: "raw" },
  { logicalKey: "address.no", fieldKind: "text", physicalFieldName: "Text1.8", valueFormat: "raw" },
  { logicalKey: "address.moo", fieldKind: "text", physicalFieldName: "Text1.9", valueFormat: "raw" },
  { logicalKey: "address.soi", fieldKind: "text", physicalFieldName: "Text1.10", valueFormat: "raw" },
  { logicalKey: "address.road", fieldKind: "text", physicalFieldName: "Text1.11", valueFormat: "raw" },
  { logicalKey: "address.subdistrict", fieldKind: "text", physicalFieldName: "Text1.12", valueFormat: "raw" },
  { logicalKey: "address.district", fieldKind: "text", physicalFieldName: "Text1.13", valueFormat: "raw" },
  { logicalKey: "address.province", fieldKind: "text", physicalFieldName: "Text1.14", valueFormat: "raw" },
  { logicalKey: "address.zipcode", fieldKind: "text", physicalFieldName: "Text1.15", valueFormat: "raw" },
  { logicalKey: "phone", fieldKind: "text", physicalFieldName: "Text1.16", valueFormat: "raw" },

  // เดือนภาษี — เช็คบ็อกซ์ 12 ตัวใน field เดียว (Radio Button3) เรียง 4 คอลัมน์ x 3 แถวตามแบบฟอร์มจริง
  // widgetIndex เรียงตามลำดับที่ pdf-lib คืนมาจาก getWidgets() ไม่ใช่ตามเลขเดือน — อ้างอิงจากผลตรวจสอบจริง
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "1", widgetIndex: 0 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "2", widgetIndex: 1 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "3", widgetIndex: 2 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "4", widgetIndex: 3 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "5", widgetIndex: 4 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "6", widgetIndex: 5 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "7", widgetIndex: 6 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "8", widgetIndex: 7 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "9", widgetIndex: 8 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "10", widgetIndex: 9 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "11", widgetIndex: 10 },
  { logicalKey: "taxMonth", fieldKind: "radio", physicalFieldName: "Radio Button3", optionKey: "12", widgetIndex: 11 },

  // ตาราง "การคำนวณภาษี" บรรทัด 1-16 — mapping 1:1 กับเลขบรรทัดบนแบบฟอร์มจริง (มั่นใจสูง)
  { logicalKey: "totalSales", fieldKind: "text", physicalFieldName: "Text2.1", valueFormat: "plain_decimal" },
  { logicalKey: "zeroRatedSales", fieldKind: "text", physicalFieldName: "Text2.2", valueFormat: "plain_decimal" },
  { logicalKey: "exemptSales", fieldKind: "text", physicalFieldName: "Text2.3", valueFormat: "plain_decimal" },
  { logicalKey: "taxableSales", fieldKind: "text", physicalFieldName: "Text2.4", valueFormat: "plain_decimal" },
  { logicalKey: "outputVat", fieldKind: "text", physicalFieldName: "Text2.5", valueFormat: "plain_decimal" },
  { logicalKey: "purchasesEligible", fieldKind: "text", physicalFieldName: "Text2.6", valueFormat: "plain_decimal" },
  { logicalKey: "inputVat", fieldKind: "text", physicalFieldName: "Text2.7", valueFormat: "plain_decimal" },
  { logicalKey: "vatPayableBeforeCredit", fieldKind: "text", physicalFieldName: "Text2.8", valueFormat: "plain_decimal" },
  { logicalKey: "vatOverpaidBeforeCredit", fieldKind: "text", physicalFieldName: "Text2.9", valueFormat: "plain_decimal" },
  { logicalKey: "creditBrought", fieldKind: "text", physicalFieldName: "Text2.10", valueFormat: "plain_decimal" },
  { logicalKey: "netVatPayable", fieldKind: "text", physicalFieldName: "Text2.11", valueFormat: "plain_decimal" },
  { logicalKey: "netVatOverpaid", fieldKind: "text", physicalFieldName: "Text2.12", valueFormat: "plain_decimal" },
  { logicalKey: "surcharge", fieldKind: "text", physicalFieldName: "Text2.13", valueFormat: "plain_decimal" },
  { logicalKey: "penalty", fieldKind: "text", physicalFieldName: "Text2.14", valueFormat: "plain_decimal" },
  { logicalKey: "grandTotal", fieldKind: "text", physicalFieldName: "Text2.15", valueFormat: "plain_decimal" },
  { logicalKey: "netOverpaidAfterAdjustment", fieldKind: "text", physicalFieldName: "Text2.16", valueFormat: "plain_decimal" },

  // ช่องเลือกข้อ 11 (ต้องชำระ) / ข้อ 12 (ชำระเกิน) — ยืนยันตำแหน่งจาก getRectangle(): Radio Button11
  // อยู่ติดกับ Text2.11 (netVatPayable, ข้อ 11 พอดี) และ Radio Button12 อยู่ติดกับ Text2.12 (netVatOverpaid,
  // ข้อ 12 พอดี) — เดิม logicalKey ตั้งชื่อผิดว่า requestRefund/carryForwardCredit (เข้าใจว่าเป็นวิธีขอคืนภาษี)
  // ทำให้ requestRefund ถูก hardcode เป็น 0 เสมอ ไม่เคยติ๊กข้อ 11 ให้เลย แก้เป็นคำนวณจาก row.payable ที่ถูกต้อง
  { logicalKey: "netVatPayableChecked", fieldKind: "radio", physicalFieldName: "Radio Button11", optionKey: "checked", widgetIndex: 0 },
  { logicalKey: "netVatOverpaidChecked", fieldKind: "radio", physicalFieldName: "Radio Button12", optionKey: "checked", widgetIndex: 0 },
]

/**
 * แปลง Pp30FormFields (จาก src/lib/pp30-fields.ts's buildPp30FormFields()) → PndComputedValues
 * ที่ fillPdfFromMapping() ใช้ได้ตรงๆ — เป็นชั้นแปลข้อมูลบริสุทธิ์ ไม่รู้จัก pdf-lib เลย
 */
export function computePp30Values(form: {
  month: number
  byKey: Record<string, number | string>
}): PndComputedValues {
  const money = (v: number | string | undefined): PndTextValue => ({ format: "plain_decimal", amount: Number(v) || 0 })
  const raw = (v: number | string | undefined): PndTextValue => ({ format: "raw", text: v === undefined || v === null ? "" : String(v) })

  const netOverpaidAfterAdjustment = Math.max(
    0,
    Number(form.byKey.netVatOverpaid || 0) - Number(form.byKey.surcharge || 0) - Number(form.byKey.penalty || 0)
  )

  const text: Record<string, PndTextValue | null> = {
    taxId: raw(form.byKey.taxId),
    branchNo: raw(form.byKey.branchNo),
    taxpayerName: raw(form.byKey.taxpayerName),
    taxYearBE: raw(form.byKey.taxYearBE),
    additionalFilingNo: form.byKey.additionalFilingNo ? raw(form.byKey.additionalFilingNo) : null,
    "address.building": raw(form.byKey["address.building"]),
    "address.room": raw(form.byKey["address.room"]),
    "address.floor": raw(form.byKey["address.floor"]),
    "address.village": raw(form.byKey["address.village"]),
    "address.no": raw(form.byKey["address.no"]),
    "address.moo": raw(form.byKey["address.moo"]),
    "address.soi": raw(form.byKey["address.soi"]),
    "address.road": raw(form.byKey["address.road"]),
    "address.subdistrict": raw(form.byKey["address.subdistrict"]),
    "address.district": raw(form.byKey["address.district"]),
    "address.province": raw(form.byKey["address.province"]),
    "address.zipcode": raw(form.byKey["address.zipcode"]),
    phone: raw(form.byKey.phone),
    totalSales: money(form.byKey.totalSales),
    zeroRatedSales: money(form.byKey.zeroRatedSales),
    exemptSales: money(form.byKey.exemptSales),
    taxableSales: money(form.byKey.taxableSales),
    outputVat: money(form.byKey.outputVat),
    purchasesEligible: money(form.byKey.purchasesEligible),
    inputVat: money(form.byKey.inputVat),
    vatPayableBeforeCredit: money(form.byKey.vatPayableBeforeCredit),
    vatOverpaidBeforeCredit: money(form.byKey.vatOverpaidBeforeCredit),
    creditBrought: money(form.byKey.creditBrought),
    netVatPayable: money(form.byKey.netVatPayable),
    netVatOverpaid: money(form.byKey.netVatOverpaid),
    surcharge: money(form.byKey.surcharge),
    penalty: money(form.byKey.penalty),
    grandTotal: money(form.byKey.grandTotal),
    netOverpaidAfterAdjustment: money(netOverpaidAfterAdjustment),
  }

  const radio: Record<string, string | null> = {
    taxMonth: String(form.month),
    netVatPayableChecked: Number(form.byKey.netVatPayableChecked) === 1 ? "checked" : null,
    netVatOverpaidChecked: Number(form.byKey.netVatOverpaidChecked) === 1 ? "checked" : null,
  }

  return { text, radio }
}

/**
 * สร้าง PDF แบบ ภ.พ.30 จากไฟล์ template จริง — reuse fillPdfFromMapping()/font-embedding เดียวกับ
 * generatePndPdf() ทั้งหมด ต่างกันแค่ template + mapping เริ่มต้น
 *
 * @param form ผลลัพธ์จาก buildPp30FormFields() (src/lib/pp30-fields.ts)
 * @param templateUrl URL ของ template ที่ super admin อัปโหลดไว้ (จาก pp30_form_templates) — ไม่ส่งมา = ใช้ไฟล์ bundled
 * @param mapping mapping ที่ดึงจาก pp30_form_field_mappings — ไม่ส่งมา = ใช้ DEFAULT_PP30_MAPPING
 */
export async function generatePp30Pdf(
  form: { month: number; byKey: Record<string, number | string> },
  templateUrl?: string,
  mapping?: PndFieldMapping[]
) {
  const resolvedTemplateUrl = templateUrl || "/templates/PP30_Template.pdf"

  const response = await fetch(resolvedTemplateUrl)
  if (!response.ok) {
    throw new Error(`ไม่สามารถโหลดไฟล์แบบฟอร์ม ภ.พ.30 ต้นแบบจาก ${resolvedTemplateUrl} ได้`)
  }
  const templateBytes = await response.arrayBuffer()

  const fontUrl = "https://fastly.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf"
  const fontResponse = await fetch(fontUrl)
  if (!fontResponse.ok) {
    throw new Error("ไม่สามารถดาวน์โหลดฟอนต์ภาษาไทยสำหรับสร้าง PDF ได้")
  }
  const fontBytes = await fontResponse.arrayBuffer()

  const pdfDoc = await PDFDocument.load(templateBytes)
  pdfDoc.registerFontkit(fontkit)
  const customFont = await pdfDoc.embedFont(fontBytes, { subset: false })

  repairOrphanedFormFields(pdfDoc)
  const pdfForm = pdfDoc.getForm()

  const setField = (name: string, value: string) => {
    try {
      const field = pdfForm.getTextField(name)
      field.setText(value)
    } catch (e) {
      console.warn(`ไม่สามารถกรอกฟิลด์ ภ.พ.30 ${name}:`, e)
    }
  }

  const selectRadioWidget = (name: string, widgetIndex: number) => {
    try {
      const radioGroup = pdfForm.getRadioGroup(name)
      const widgets = radioGroup.acroField.getWidgets()
      widgets.forEach((w, i) => {
        const onValue = w.getOnValue()
        if (i === widgetIndex && onValue) {
          w.dict.set(PDFName.of("AS"), onValue)
        } else {
          w.dict.set(PDFName.of("AS"), PDFName.of("Off"))
        }
      })
      const selectedOn = widgets[widgetIndex]?.getOnValue()
      if (selectedOn) {
        radioGroup.acroField.dict.set(PDFName.of("V"), selectedOn)
      }
    } catch (e) {
      console.warn(`ไม่สามารถเลือก radio ภ.พ.30 ${name} (widget ${widgetIndex}):`, e)
    }
  }

  const getMaxLength = (name: string): number | undefined => {
    try {
      return pdfForm.getTextField(name).getMaxLength()
    } catch {
      return undefined
    }
  }

  // ช่องจำนวนเงินของแบบ ภ.พ.30 ใช้ format "plain_decimal" (เลขทศนิยม 2 ตำแหน่งธรรมดา) ไม่ใช่ comb เหมือน
  // บางช่องของ ภ.ง.ด.90/94 เพราะยังไม่ยืนยันว่า field ของแบบฟอร์มนี้ตั้ง comb flag ไว้จริง — fmtComb จึงไม่ถูกใช้
  // แต่ต้องส่ง helper ให้ครบตาม signature ของ fillPdfFromMapping()
  const fmtComb = (n: number, totalLen: number) => (Math.max(0, n)).toFixed(2)

  const activeMapping = mapping || DEFAULT_PP30_MAPPING
  const computed = computePp30Values(form)
  fillPdfFromMapping(activeMapping, computed, { setField, selectRadioWidget, getMaxLength, fmtComb })

  pdfForm.updateFieldAppearances(customFont)

  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes as any], { type: "application/pdf" })
}

export interface BillPdfData {
  roomNumber: string
  tenantName: string
  billingCycle: string
  baseRent: number
  /**
   * true = ตัวเลขทุกบรรทัดที่ส่งมาเป็นค่าที่บันทึกไว้ในบิลจริง (snapshot) ให้พิมพ์ตามนั้นตรง ๆ
   * false/undefined = บิลเก่าที่ไม่มี snapshot ให้คำนวณค่าเช่าย้อนจากยอดรวมแบบเดิม
   * ดู database_patch_add_bill_snapshot.sql
   */
  hasSnapshot?: boolean
  /** ยอดค่าไฟ/ค่าน้ำที่บันทึกไว้ในบิล (ใช้เมื่อ hasSnapshot) */
  electricAmount?: number
  waterAmount?: number
  /** ใบนี้คิดขั้นต่ำหรือไม่ ตามที่บันทึกไว้ตอนออกบิล (ใช้เมื่อ hasSnapshot) */
  elecMinApplied?: boolean
  waterMinApplied?: boolean
  electricUnits: number
  electricRate: number
  waterUnits: number
  waterRate: number
  amount: number
  promptPayId: string
  promptPayName: string
  commonFee?: number
  waterMinChecked?: boolean
  waterMinUnit?: number
  electricMinChecked?: boolean
  electricMinUnit?: number
  workspaceName?: string
  workspaceAddress?: string
  workspacePhone?: string
  workspaceTaxId?: string
  penaltyAmount?: number
  lateDays?: number
  latePenaltyRate?: number
  otherServiceAmount?: number
  waiveElectricMin?: boolean
  waiveWaterMin?: boolean
  invoiceId?: string
  extraExpenses?: Array<{ name: string; amount: number }>
  // เลขมิเตอร์ก่อนหน้า-ปัจจุบัน (ไม่บังคับ — ถ้าไม่มีค่าจะไม่แสดงช่วงเลขมิเตอร์ในบิล)
  elecPrev?: number | null
  elecCurr?: number | null
  waterPrev?: number | null
  waterCurr?: number | null
  // รอบบิลดิบรูปแบบ "YYYY-MM" — ใช้ format เดือน-ปีไทยเองสำหรับกล่อง "รายละเอียดใบแจ้งหนี้จริงจากหน่วยงาน"
  // (แยกจาก billingCycle ด้านบนเพราะผู้เรียกแต่ละที่ format มาไม่เหมือนกัน)
  billingCycleRaw?: string
  // ยอดบิลจริง+หน่วยรวมทั้งอาคารจากหน่วยงาน (โหมด "หารตามสัดส่วนทั้งอาคาร") — ไม่บังคับ, ถ้าไม่มีค่าจะไม่แสดงกล่องนี้
  electricBuildingTotalAmount?: number | null
  electricBuildingTotalUnits?: number | null
  waterBuildingTotalAmount?: number | null
  waterBuildingTotalUnits?: number | null
  // ภาษีมูลค่าเพิ่ม (VAT) ที่บวกเพิ่มเข้า amount แล้วตอนออกบิล — ดูฟีเจอร์ VAT ใน src/features/tax/
  // ไม่บังคับ, ค่า 0/undefined = ไม่แสดงบรรทัดนี้เลย (workspace ยังไม่จด VAT หรือบิลนี้ออกก่อนเดือนที่มีผล)
  vatAmount?: number
}

// แปลงรอบบิล "YYYY-MM" เป็น "เดือน ปี" ภาษาไทย (ซ้ำกับ helper ในหน้า admin billing/manage-bills
// โดยตั้งใจ — ไฟล์เหล่านั้นมี copy ของตัวเองอยู่แล้ว ไม่ extract เป็น shared util เพิ่มเติม)
function formatCycleThai(cycleStr: string): string {
  if (!cycleStr) return ""
  if (cycleStr.includes("-")) {
    const [year, month] = cycleStr.split("-")
    const monthsThai = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ]
    const monthIdx = parseInt(month, 10) - 1
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${monthsThai[monthIdx]} ${year}`
    }
  }
  return cycleStr
}

export async function generateBillPdf(data: BillPdfData) {
  // 1. ดาวน์โหลดฟอนต์ไทยมาตรฐาน (Sarabun)
  const fontUrl = "https://fastly.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf"
  const fontResponse = await fetch(fontUrl)
  if (!fontResponse.ok) {
    throw new Error("ไม่สามารถดาวน์โหลดฟอนต์ภาษาไทยสำหรับสร้าง PDF ได้")
  }
  const fontBytes = await fontResponse.arrayBuffer()

  // 2. สร้างเอกสาร PDF ใหม่
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const page = pdfDoc.addPage([595, 842]) // ขนาด A4
  const customFont = await pdfDoc.embedFont(fontBytes, { subset: false })

  // ฟังก์ชันช่วยเขียนข้อความภาษาไทยในใบแจ้งหนี้
  const drawText = (text: string, x: number, y: number, size = 9, color = rgb(0.2, 0.2, 0.2)) => {
    drawThaiText(page, text, x, y, { font: customFont, size, color })
  }

  // ดึงข้อมูลหลักจาก workspace
  const workspaceName = data.workspaceName || "หอพักแสนสุขแมนชั่น"
  const workspaceAddress = data.workspaceAddress || ""
  const workspacePhone = data.workspacePhone || ""
  const workspaceTaxId = data.workspaceTaxId || ""

  // วาดหัวเอกสาร
  page.drawRectangle({
    x: 40,
    y: 740,
    width: 515,
    height: 60,
    color: rgb(0.06, 0.09, 0.16), // สไตล์โมเดิร์นหรูหราสีน้ำเงินเข้ม
  })

  drawText("ใบแจ้งยอดค่าใช้จ่ายและใบแจ้งหนี้ (Invoice / Billing)", 55, 772, 11, rgb(1, 1, 1))
  drawText(workspaceName, 55, 754, 9, rgb(0.85, 0.9, 1))

  // ข้อมูล workspace ขวาบน (แสดงที่อยู่, เบอร์โทร, เลขภาษี)
  if (workspaceAddress) {
    drawText(`ที่อยู่: ${workspaceAddress.length > 55 ? workspaceAddress.slice(0, 52) + "..." : workspaceAddress}`, 310, 776, 6.5, rgb(0.8, 0.8, 0.8))
  }
  if (workspacePhone) {
    drawText(`เบอร์โทร: ${workspacePhone}`, 310, 763, 6.5, rgb(0.8, 0.8, 0.8))
  }
  if (workspaceTaxId) {
    drawText(`เลขประจำตัวผู้เสียภาษี: ${workspaceTaxId}`, 310, 750, 6.5, rgb(0.8, 0.8, 0.8))
  }

  // รายละเอียดบิล
  drawText(`หมายเลขห้อง (Room No.): ${data.roomNumber}`, 50, 700, 10, rgb(0.1, 0.1, 0.1))
  drawText(`ชื่อผู้เช่า (Tenant Name): ${data.tenantName}`, 50, 680, 10, rgb(0.1, 0.1, 0.1))
  if (data.invoiceId) {
    drawText(`รหัสใบแจ้งหนี้ (Invoice ID): ${data.invoiceId}`, 50, 661, 10, rgb(0.06, 0.45, 0.35))
  }
  drawText(`รอบบิลประจำเดือน (Cycle): ${data.billingCycle}`, 340, 700, 10, rgb(0.1, 0.1, 0.1))
  drawText(`วันที่ออกเอกสาร (Date): ${new Date().toLocaleDateString('th-TH')}`, 340, 680, 10, rgb(0.1, 0.1, 0.1))

  // ส่วนหัวของตาราง
  page.drawRectangle({
    x: 40,
    y: 630,
    width: 515,
    height: 25,
    color: rgb(0.92, 0.94, 0.98),
  })
  drawText("รายการค่าบริการ (Description)", 50, 638, 9, rgb(0.15, 0.2, 0.3))
  drawText("จำนวนหน่วย (Qty)", 260, 638, 9, rgb(0.15, 0.2, 0.3))
  drawText("อัตราหน่วยละ (Rate)", 360, 638, 9, rgb(0.15, 0.2, 0.3))
  drawText("ยอดรวม (Amount)", 470, 638, 9, rgb(0.15, 0.2, 0.3))

  // เนื้อหาในตาราง
  let y = 600
  const commonFee = data.commonFee !== undefined ? data.commonFee : 50
  
  const waterMinChecked = data.waterMinChecked !== undefined ? data.waterMinChecked : true
  const waterMinUnit = data.waterMinUnit !== undefined ? data.waterMinUnit : 3
  const electricMinChecked = data.electricMinChecked !== undefined ? data.electricMinChecked : true
  const electricMinUnit = data.electricMinUnit !== undefined ? data.electricMinUnit : 10

  // ใบที่มี snapshot: ใช้ผลลัพธ์ที่บันทึกไว้ตอนออกบิล ห้ามคิดใหม่จากการตั้งค่าปัจจุบัน
  // ไม่งั้นเปลี่ยนการตั้งค่าขั้นต่ำแล้วใบเดิมจะได้ "ยอดถูกแต่ป้ายผิด"
  const isElecMin = data.hasSnapshot && data.elecMinApplied !== undefined
    ? !!data.elecMinApplied
    : (!data.waiveElectricMin && electricMinChecked && data.electricUnits <= electricMinUnit)
  const isWaterMin = data.hasSnapshot && data.waterMinApplied !== undefined
    ? !!data.waterMinApplied
    : (!data.waiveWaterMin && waterMinChecked && data.waterUnits <= waterMinUnit)

  // บิลที่มี snapshot: ใช้ยอดที่บันทึกไว้ตรง ๆ (รวมกรณีคิดขั้นต่ำแล้วตั้งแต่ตอนออกบิล)
  // บิลเก่า: คำนวณจากอัตรา+การตั้งค่าขั้นต่ำปัจจุบันแบบเดิม
  const elecAmount = data.hasSnapshot && data.electricAmount !== undefined
    ? Number(data.electricAmount || 0)
    : (isElecMin ? (electricMinUnit * data.electricRate) : data.electricUnits * data.electricRate)
  const waterAmount = data.hasSnapshot && data.waterAmount !== undefined
    ? Number(data.waterAmount || 0)
    : (isWaterMin ? (waterMinUnit * data.waterRate) : data.waterUnits * data.waterRate)
  
  const penaltyAmount = data.penaltyAmount !== undefined ? Number(data.penaltyAmount || 0) : 0
  const otherServiceAmount = data.otherServiceAmount !== undefined ? Number(data.otherServiceAmount || 0) : 0
  const vatAmount = data.vatAmount !== undefined ? Number(data.vatAmount || 0) : 0

  const extraExpenses = data.extraExpenses || []
  const extraExpensesSum = extraExpenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0)

  // ค่าเช่าที่จะพิมพ์บนใบ
  //
  // บิลที่มี snapshot: ใช้ค่าเช่าที่บันทึกไว้ตรง ๆ — เป็นตัวเลขที่คิดเงินไปจริง
  //
  // บิลเก่าที่ไม่มี snapshot: คำนวณย้อนจากยอดรวมแบบเดิม เพื่อบังคับให้ทุกบรรทัดบวกกันได้เท่า
  // data.amount พอดี (หัก vatAmount ออกด้วยเพราะ data.amount รวม VAT ไว้แล้วตั้งแต่ออกบิล)
  //
  // ⚠️ วิธีคำนวณย้อนนี้ทำให้บรรทัด "ค่าเช่าห้องพัก" กลายเป็นเศษที่เหลือ ไม่ใช่ค่าเช่าจริงของห้อง
  // ทันทีที่องค์ประกอบอื่นไม่ตรงกับตอนออกบิล (เช่น แก้มิเตอร์แล้วไม่ออกบิลใหม่) จึงคงไว้เฉพาะ
  // บิลเก่าที่ไม่มีข้อมูลให้ใช้แล้วจริง ๆ — ห้ามใช้กับบิลใหม่
  const adjustedBaseRent = data.hasSnapshot
    ? Math.max(0, Number(data.baseRent || 0))
    : Math.max(0, data.amount - elecAmount - waterAmount - commonFee - penaltyAmount - otherServiceAmount - extraExpensesSum - vatAmount)

  const elecDesc = isElecMin 
    ? `2. ค่าไฟฟ้า (ขั้นต่ำ ${electricMinUnit} หน่วย)` 
    : "2. ค่าไฟฟ้า (Electricity Bill)"
  const waterDesc = isWaterMin 
    ? `3. ค่าน้ำประปา (ขั้นต่ำ ${waterMinUnit} หน่วย)` 
    : "3. ค่าน้ำประปา (Water Bill)"

  // รายการ 1: ค่าเช่าห้องพัก
  drawText("1. ค่าเช่าห้องพัก (Room Rent)", 50, y, 9, rgb(0.2, 0.2, 0.2))
  drawText("1", 280, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(adjustedBaseRent.toLocaleString(), 380, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(adjustedBaseRent.toLocaleString(), 475, y, 9, rgb(0.2, 0.2, 0.2))

  // ช่วงเลขมิเตอร์ก่อนหน้า-ปัจจุบัน เช่น "651 - 690 จำนวน 39" — แสดงเฉพาะเมื่อมีข้อมูลมิเตอร์จริง
  const elecMeterRange = data.elecPrev !== null && data.elecPrev !== undefined && data.elecCurr !== null && data.elecCurr !== undefined
    ? `${data.elecPrev.toLocaleString()} - ${data.elecCurr.toLocaleString()} จำนวน ${data.electricUnits} หน่วย`
    : null
  const waterMeterRange = data.waterPrev !== null && data.waterPrev !== undefined && data.waterCurr !== null && data.waterCurr !== undefined
    ? `${data.waterPrev.toLocaleString()} - ${data.waterCurr.toLocaleString()} จำนวน ${data.waterUnits} หน่วย`
    : null

  y -= 25
  // รายการ 2: ค่าไฟฟ้า
  drawText(elecDesc, 50, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(data.electricUnits.toString(), 280, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(isElecMin ? "-" : data.electricRate.toLocaleString(), 380, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(elecAmount.toLocaleString(), 475, y, 9, rgb(0.2, 0.2, 0.2))
  if (elecMeterRange) {
    y -= 12
    drawText(elecMeterRange, 55, y, 8, rgb(0.4, 0.4, 0.4))
  }

  y -= 25
  // รายการ 3: ค่าน้ำประปา
  drawText(waterDesc, 50, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(data.waterUnits.toString(), 280, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(isWaterMin ? "-" : data.waterRate.toLocaleString(), 380, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(waterAmount.toLocaleString(), 475, y, 9, rgb(0.2, 0.2, 0.2))
  if (waterMeterRange) {
    y -= 12
    drawText(waterMeterRange, 55, y, 8, rgb(0.4, 0.4, 0.4))
  }

  y -= 25
  // รายการ 4: ค่าส่วนกลาง
  drawText("4. ค่าส่วนกลาง (Common Area Fee)", 50, y, 9, rgb(0.2, 0.2, 0.2))
  drawText("1", 280, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(commonFee.toLocaleString(), 380, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(commonFee.toLocaleString(), 475, y, 9, rgb(0.2, 0.2, 0.2))

  let itemIndex = 5
  // รายการค่าใช้จ่ายเสริมรายเดือน
  if (extraExpenses && extraExpenses.length > 0) {
    extraExpenses.forEach((exp) => {
      const expAmt = Number(exp.amount || 0)
      if (expAmt > 0) {
        y -= 25
        drawText(`${itemIndex}. ${exp.name}`, 50, y, 9, rgb(0.2, 0.2, 0.2))
        drawText("1", 280, y, 9, rgb(0.2, 0.2, 0.2))
        drawText(expAmt.toLocaleString(), 380, y, 9, rgb(0.2, 0.2, 0.2))
        drawText(expAmt.toLocaleString(), 475, y, 9, rgb(0.2, 0.2, 0.2))
        itemIndex++
      }
    })
  }

  // รายการ ค่าบริการอื่นๆ (แสดงต่อเมื่อมียอด)
  if (otherServiceAmount > 0) {
    y -= 25
    drawText(`${itemIndex}. ค่าบริการอื่น ๆ (Other Service Charge)`, 50, y, 9, rgb(0.2, 0.2, 0.2))
    drawText("1", 280, y, 9, rgb(0.2, 0.2, 0.2))
    drawText(otherServiceAmount.toLocaleString(), 380, y, 9, rgb(0.2, 0.2, 0.2))
    drawText(otherServiceAmount.toLocaleString(), 475, y, 9, rgb(0.2, 0.2, 0.2))
    itemIndex++
  }

  // รายการ ค่าปรับจ่ายล่าช้า (แสดงต่อเมื่อมียอดค่าปรับ)
  if (penaltyAmount > 0) {
    y -= 25
    const days = data.lateDays !== undefined ? data.lateDays : 0
    const rate = data.latePenaltyRate !== undefined ? data.latePenaltyRate : (days > 0 ? Math.round(penaltyAmount / days) : penaltyAmount)

    drawText(`${itemIndex}. ค่าปรับจ่ายล่าช้า (Late Payment Penalty)`, 50, y, 9, rgb(0.8, 0.1, 0.1))
    drawText(days > 0 ? `${days} วัน` : "1", 280, y, 9, rgb(0.8, 0.1, 0.1))
    drawText(rate.toLocaleString(), 380, y, 9, rgb(0.8, 0.1, 0.1))
    drawText(penaltyAmount.toLocaleString(), 475, y, 9, rgb(0.8, 0.1, 0.1))
    itemIndex++
  }

  // รายการ ภาษีมูลค่าเพิ่ม (แสดงต่อเมื่อ workspace จด VAT แล้วและมีการคิดจริงในบิลนี้)
  if (vatAmount > 0) {
    y -= 25
    drawText(`${itemIndex}. ภาษีมูลค่าเพิ่ม (VAT)`, 50, y, 9, rgb(0.2, 0.2, 0.2))
    drawText("1", 280, y, 9, rgb(0.2, 0.2, 0.2))
    drawText(vatAmount.toLocaleString(), 380, y, 9, rgb(0.2, 0.2, 0.2))
    drawText(vatAmount.toLocaleString(), 475, y, 9, rgb(0.2, 0.2, 0.2))
    itemIndex++
  }

  // ขีดเส้นใต้ตาราง
  page.drawLine({
    start: { x: 40, y: y - 15 },
    end: { x: 555, y: y - 15 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  })

  // ยอดรวม
  y -= 35
  drawText("ยอดชำระเงินสุทธิทั้งสิ้น (Grand Total):", 280, y, 10, rgb(0.1, 0.1, 0.1))
  drawText(`${data.amount.toLocaleString()} บาท`, 470, y, 11, rgb(0.06, 0.45, 0.35))

  // รายละเอียดใบแจ้งหนี้จริงจากหน่วยงาน (แสดงเฉพาะเมื่อเปิดโหมด "หารตามสัดส่วนทั้งอาคาร" และมีข้อมูลจริง)
  const hasElectricDisclosure = data.electricBuildingTotalAmount !== null && data.electricBuildingTotalAmount !== undefined
    && data.electricBuildingTotalUnits !== null && data.electricBuildingTotalUnits !== undefined
  const hasWaterDisclosure = data.waterBuildingTotalAmount !== null && data.waterBuildingTotalAmount !== undefined
    && data.waterBuildingTotalUnits !== null && data.waterBuildingTotalUnits !== undefined

  if (hasElectricDisclosure || hasWaterDisclosure) {
    const cycleThai = formatCycleThai(data.billingCycleRaw || "")
    y -= 24
    drawText(`รายละเอียด ใบแจ้งหนี้ของการไฟฟ้า/การประปา ประจำรอบเดือน ${cycleThai}`, 50, y, 9, rgb(0.15, 0.2, 0.3))

    if (hasElectricDisclosure) {
      y -= 16
      drawText("การไฟฟ้านครหลวง/การไฟฟ้าส่วนภูมิภาค", 55, y, 8.5, rgb(0.3, 0.3, 0.3))
      y -= 13
      drawText(`จำนวนหน่วยที่ใช้ ${data.electricBuildingTotalUnits!.toLocaleString()} หน่วย`, 55, y, 8.5, rgb(0.3, 0.3, 0.3))
      y -= 13
      drawText(`ยอดที่ต้องชำระ ${data.electricBuildingTotalAmount!.toLocaleString()} บาท`, 55, y, 8.5, rgb(0.3, 0.3, 0.3))
    }

    if (hasWaterDisclosure) {
      y -= 16
      drawText("การประปานครหลวง/การประปาส่วนภูมิภาค", 55, y, 8.5, rgb(0.3, 0.3, 0.3))
      y -= 13
      drawText(`จำนวนน้ำใช้ ${data.waterBuildingTotalUnits!.toLocaleString()} หน่วย`, 55, y, 8.5, rgb(0.3, 0.3, 0.3))
      y -= 13
      drawText(`ยอดที่ต้องชำระ ${data.waterBuildingTotalAmount!.toLocaleString()} บาท`, 55, y, 8.5, rgb(0.3, 0.3, 0.3))
    }

    y -= 18
    drawText("หมายเหตุ: อัตราค่าไฟฟ้าและค่าน้ำประปาคำนวณจาก (เลขมิเตอร์ปัจจุบัน - เลขมิเตอร์ครั้งก่อน) × อัตราเฉลี่ยจริงตามใบแจ้งหนี้ของการไฟฟ้า/การประปา", 50, y, 7.5, rgb(0.45, 0.45, 0.45))
    y -= 11
    drawText(`ประจำรอบเดือน ${cycleThai} โดยไม่มีการบวกกำไรเพิ่มใดๆ ทั้งสิ้น`, 50, y, 7.5, rgb(0.45, 0.45, 0.45))
  }

  // ส่วนของการชำระเงินพร้อมเพย์
  y -= 60
  // กันกล่อง/QR ตกขอบล่างของหน้า (y=0 คือขอบล่างสุด) ในบิลที่เนื้อหายาวผิดปกติ (มีทั้ง 2 disclosure
  // + ค่าใช้จ่ายเพิ่มเติมจำนวนมาก + ค่าปรับ) ที่ดันตำแหน่ง y ลงมาจนต่ำเกินไปหรือติดลบ — บังคับให้กล่อง
  // (สูง 180) มีขอบล่างอย่างน้อยที่ y=20 เสมอ ยอมให้ทับเนื้อหาด้านบนเล็กน้อยในกรณีสุดโต่งนี้ ดีกว่าปล่อยให้
  // QR Code สำหรับจ่ายเงินหายไปนอกหน้ากระดาษทั้งหมด
  const boxY = Math.max(180, y)
  page.drawRectangle({
    x: 40,
    y: boxY - 160,
    width: 515,
    height: 180,
    color: rgb(0.96, 0.98, 1.0),
    borderColor: rgb(0.85, 0.9, 0.98),
    borderWidth: 1,
  })

  const promptPayTextY = boxY + 5
  drawText("ช่องทางการชำระเงินด้วย PromptPay QR (ระบบแสกนจ่ายอัตโนมัติ)", 60, promptPayTextY, 10, rgb(0.06, 0.15, 0.35))

  drawText(`ชื่อบัญชีรับโอน: ${data.promptPayName}`, 60, promptPayTextY - 20, 9, rgb(0.2, 0.2, 0.2))

  drawText(`หมายเลขพร้อมเพย์: ${data.promptPayId.length === 10
    ? data.promptPayId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
    : data.promptPayId.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, "$1-$2-$3-$4-$5")}`, 60, promptPayTextY - 35, 9, rgb(0.2, 0.2, 0.2))

  drawText(`ยอดเงินที่ต้องโอน: ${data.amount.toLocaleString()} บาท`, 60, promptPayTextY - 50, 10, rgb(0.06, 0.15, 0.35))

  drawText("* สแกน QR Code นี้เพื่อเปิดหน้าโอนเงินที่มีระบุจำนวนยอดรวมให้อัตโนมัติ", 60, promptPayTextY - 80, 8, rgb(0.4, 0.4, 0.4))
  drawText("(เพื่อป้องกันการระบุจำนวนเงินผิดพลาด และช่วยยืนยันการโอนเงินรวดเร็ว)", 60, promptPayTextY - 92, 8, rgb(0.4, 0.4, 0.4))

  // สร้าง PromptPay Payload และฝัง QR Code
  try {
    const { generatePromptPayPayload } = await import("./promptpay")
    const payload = generatePromptPayPayload(data.promptPayId, data.amount)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(payload)}&size=300x300`
    const qrResponse = await fetch(qrUrl)
    if (qrResponse.ok) {
      const qrBytes = await qrResponse.arrayBuffer()
      const qrImage = await pdfDoc.embedPng(qrBytes)
      page.drawImage(qrImage, {
        x: 390,
        y: boxY - 145,
        width: 130,
        height: 130,
      })
    }
  } catch (qrErr) {
    console.warn("ไม่สามารถฝัง QR Code ลงใน PDF บิลได้:", qrErr)
  }

  // ท้ายบิล — ปกติอยู่ที่ y=45 คงที่ แต่ถ้ากล่อง "รายละเอียดใบแจ้งหนี้จริงจากหน่วยงาน" ด้านบนดันเนื้อหาลงมาเยอะ
  // (ยาวเกินพื้นที่ที่เผื่อไว้) ให้เลื่อนลงต่ำกว่ากล่องพร้อมเพย์เสมอ กันทับกัน แต่ไม่ต่ำกว่าขอบล่างของหน้า
  const footerY = Math.max(20, Math.min(45, boxY - 160 - 20))
  drawText(`ขอขอบคุณที่ใช้บริการ${workspaceName} หากมีข้อสงสัยติดต่อเจ้าหน้าที่หอพักโดยตรง`, 60, footerY, 7.5, rgb(0.5, 0.5, 0.5))

  // เซฟและบันทึกไฟล์เป็น Blob
  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes as any], { type: "application/pdf" })
}
