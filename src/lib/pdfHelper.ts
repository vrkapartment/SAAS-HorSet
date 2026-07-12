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

export async function generatePndPdf(type: "90" | "94", data: PndData, templateUrl?: string) {
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
  const pages = pdfDoc.getPages()
  const firstPage = pages[0]

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

  // ฟังก์ชันช่วยเขียนข้อความเพิ่มเติมลงบน PDF (สไตล์จัดสระภาษาไทยถูกต้อง)
  const drawText = (text: string, x: number, y: number, size = 10) => {
    drawThaiText(firstPage, text, x, y, { font: customFont, size, color: rgb(0, 0, 0) })
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
  const selectRadioWidget = (name: string, widgetIndex: 0 | 1) => {
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

  // 5. กรอกข้อมูลและตัวเลขลงในแบบฟอร์มผ่าน Form Fields
  if (type === "90") {
    // ภ.ง.ด. 90 (เต็มปี)
    // หมายเหตุ: field mapping ของฟอร์มนี้ตรวจสอบจากตำแหน่ง x/y จริงของทุก field เทียบกับ label บนหน้าจริงแล้ว (ไม่ได้เดา)
    // ของเดิมผิดหลายจุด — Text7.3 ที่เข้าใจว่าเป็นนามสกุลจริงๆ คือช่องชื่อคู่สมรส, Text9 รับที่อยู่ทั้งก้อนทั้งที่เป็นแค่ช่อง "อาคาร",
    // Text34.0/34.1/34.2/33.9 ที่ใช้เป็นค่าเช่าจริงๆ คือช่องกองทุนรวม (RMF/LTF) ของข้อ 4 คนละรายการ,
    // และไม่เคยกรอกช่อง "สถานภาพผู้มีเงินได้", ช่องภาษีชำระเพิ่มเติม/ไว้เกินหน้าแรก, และเลขผู้จ่ายเงินได้ของข้อ 7 เลย
    setField("Text11111", data.taxYear)

    // ข้อมูลส่วนตัว (Text7.3/Text7.4/Text7.5 เป็นช่องชื่อ-ชื่อกลาง-นามสกุลของ "คู่สมรส" ไม่ใช่ผู้มีเงินได้ จึงไม่กรอก)
    setField("Text80.0", formattedTaxId)
    setField("Text7.0", data.firstName)
    setField("Text7.2", data.lastName)

    // เลือกสถานภาพของผู้มีเงินได้ (widget 0 = บุคคลธรรมดา, widget 1 = ห้างหุ้นส่วนสามัญที่มิใช่นิติบุคคล)
    selectRadioWidget("Radio Button48", data.taxpayerStatus === "partnership" ? 1 : 0)
    // ยื่นปกติเสมอ (ระบบยังไม่รองรับยื่นแบบเพิ่มเติม)
    selectRadioWidget("Radio Button999", 0)

    // ที่อยู่แยกช่องตามกล่องจริงบนฟอร์ม (เดิมยัดที่อยู่ทั้งก้อนลงช่อง "อาคาร" ช่องเดียว ทำให้ล้นทับช่องอื่นๆ)
    const addressParts = data.addressParts || {
      building: "", room: "", floor: "", village: "", no: "", moo: "", soi: "", yaek: "",
      road: "", subdistrict: "", district: "", province: "", zipcode: ""
    }
    setField("Text9", addressParts.building)
    setField("Text100.1", addressParts.room)
    setField("Text100.2", addressParts.floor)
    setField("Text100.3", addressParts.village)
    setField("Text13", addressParts.no)
    setField("Text14", addressParts.moo)
    setField("Text155.1", addressParts.soi)
    setField("Text155.2", addressParts.yaek)
    setField("Text155.3", addressParts.road)
    setField("Text155.4", addressParts.subdistrict)
    setField("Text155.5", addressParts.district)
    setField("Text155.6", addressParts.province)
    setField("Text20", addressParts.zipcode)
    // หมายเหตุ: ฟอร์มนี้ไม่มีช่องเบอร์โทรศัพท์บนหน้าแรก (ของเดิมวาดทับตำแหน่งอื่นด้วยพิกัดที่ไม่มีฟิลด์รองรับจริง จึงตัดออก)

    // มาตรา 40(5) ข้อ 4 ➊ "การให้เช่าทรัพย์สิน (1) บ้าน โรงเรือน สิ่งปลูกสร้างอย่างอื่น หรือแพ" - หน้า 2
    // (ของเดิมกรอกลง Text34.0/34.1/34.2/33.9 ซึ่งจริงๆ เป็นช่องคนละรายการ (กองทุนรวม RMF/LTF ในข้อ 4 ➏) ทำให้ค่าเช่าไปโผล่ผิดจุด)
    const rentNet = data.rent405 - data.deductionRent405
    const rentIsActual = data.rentDeductionMethod === "actual"
    setField("Text31.1.1", formattedTaxId) // ผู้จ่ายเงินได้ เลขประจำตัวผู้เสียภาษีอากร ของข้อ 4 — ไม่มีผู้หักภาษี ณ ที่จ่ายจริง ใช้เลขของผู้มีเงินได้เอง
    setField("Text360.1", fmtComb(data.rent405, 12))
    setField("Text360.2", fmtComb(data.deductionRent405, 12))
    setField("Text360.3", fmtComb(rentNet, 12))
    selectRadioWidget("Radio Button14", rentIsActual ? 1 : 0)

    // มาตรา 40(8) ข้อ 7(1) ค่าน้ำไฟและบริการ - หน้า 3
    // (ก่อนหน้านี้ค่าน้ำไฟ/บริการ กับ รายได้อื่น (ปรับ/ริบมัดจำ) ถูกยัดรวมเป็นก้อนเดียวลงช่องเดียว
    // ทั้งที่ฟอร์มจริงมีแถว (1) และ (2) แยกกันตามประเภทเงินได้ ทำให้ยอดที่ ก. รวมมาไม่ตรงกับที่ควรจะกรอกแยก)
    const utilitiesNet = data.utilities408 - data.deductionUtilities408
    const utilIsActual = data.utilitiesDeductionMethod === "actual"
    const utilDeductionPct = data.utilities408 > 0 ? Math.round((data.deductionUtilities408 / data.utilities408) * 100) : 0
    setField("Text38.0", formattedTaxId) // ผู้จ่ายเงินได้ เลขประจำตัวผู้เสียภาษีอากร — ไม่มีผู้หักภาษี ณ ที่จ่ายจริง ใช้เลขของผู้มีเงินได้เอง
    setField("Text70", "ค่าน้ำไฟและบริการ")
    setField("Text40.0", fmtComb(data.utilities408, 13))
    setField("Text40.1", fmtComb(data.deductionUtilities408, 13))
    setField("Text40.2", fmtComb(utilitiesNet, 13))
    setField("Text73.0", utilIsActual ? "" : utilDeductionPct.toString())
    selectRadioWidget("Radio Button22", utilIsActual ? 1 : 0)

    // มาตรา 40(8) ข้อ 7(2) รายได้อื่น (ปรับ/ริบมัดจำ) - หน้า 3 (กฎหมายไม่ให้หักค่าใช้จ่ายแบบเหมาสำหรับเงินได้ประเภทนี้ ใช้ "จริง" เสมอ)
    const other408 = data.other408 || 0
    if (other408 > 0) {
      const deductionOther408 = data.deductionOther408 || 0
      const otherNet = other408 - deductionOther408
      setField("Text71", "รายได้อื่น (ปรับ/รับมัดจำ)")
      setField("Text40.3", fmtComb(other408, 13))
      setField("Text40.4", fmtComb(deductionOther408, 13))
      setField("Text40.5", fmtComb(otherNet, 13))
      selectRadioWidget("Radio Button24", 1)
    }

    // เลือก radio "ชำระเพิ่มเติม" (ซ้าย, widget 0) เมื่อยอดเป็นบวก หรือ "ชำระไว้เกิน" (ขวา, widget 1) เมื่อติดลบ ไม่เลือกเมื่อเป็น 0
    const selectDueOrOverpaid = (name: string, amount: number) => {
      if (amount > 0) selectRadioWidget(name, 0)
      else if (amount < 0) selectRadioWidget(name, 1)
    }

    // ค่าลดหย่อนส่วนตัว (ตามสถานภาพผู้เสียภาษี) ใช้ทั้งในข้อ 11 ข้อ 2. และในใบแนบแสดงรายละเอียดรายการลดหย่อนฯ หน้า 5
    const personalDeduction = calculatePersonalDeduction("90", data.taxpayerStatus || "individual", data.partnerCount || 1)

    // ใบแนบแสดงรายละเอียดรายการลดหย่อนและยกเว้นหลังจากหักค่าใช้จ่าย - หน้า 5 (ก่อนหน้านี้ไม่เคยกรอกเลย ทั้งที่ข้อ 11 ข้อ 2.
    // ของหน้า 4 อ้างอิงยอดจากหน้านี้โดยตรง — ระบบมีข้อมูลเฉพาะค่าลดหย่อนส่วนตัว (รายการ 1.) จึงกรอกเป็นทั้งรายการ 1. และยอดรวม 24.)
    // หัวกระดาษหน้านี้มีเลขประจำตัวผู้เสียภาษี/ชื่อ-นามสกุลผู้มีเงินได้ซ้ำอีกชุด (ไม่ใช่ของคู่สมรส) จึงกรอกด้วยข้อมูลเดียวกับหน้าแรก
    setField("Text68.3", formattedTaxId)
    setField("Text68.5", data.firstName)
    setField("Text68.7", data.lastName)
    setField("Text69.1", fmtComb(personalDeduction, 12))
    setField("Text69.62", fmtComb(personalDeduction, 12))

    // ข้อ 11 การคำนวณภาษี (กล่องสรุปภาษีหน้า 4) — คำนวณภาษีขั้นบันไดจริงแบบเดียวกับ ภ.ง.ด. 94 (thaiTax.ts)
    // รายการที่ระบบไม่มีข้อมูลจริง (เงินบริจาค/ภาษีหัก ณ ที่จ่าย/ยื่นเพิ่มเติม ฯลฯ) ปล่อยว่างไว้ไม่กรอกเลข 0 ลงไป
    // ส่วนรายการที่คำนวณได้จริง (ถึงจะได้ 0 จากการคำนวณ) ยังกรอกตามปกติ เพื่อไม่ให้ดูเหมือนข้อมูลหาย
    const item1 = data.netIncome
    const item2 = personalDeduction
    const item3 = Math.max(0, item1 - item2)
    const item4 = 0 // หัก เงินบริจาคสนับสนุนการศึกษา/อื่นๆ — ระบบไม่มีข้อมูลส่วนนี้ ปล่อยว่าง
    const item5 = item3 - item4
    const item6 = 0 // หัก เงินบริจาคทั่วไป — ระบบไม่มีข้อมูลส่วนนี้ ปล่อยว่าง
    const item7 = Math.max(0, item5 - item6)
    const grossAssessableFull = data.rent405 + data.utilities408 + other408 // ไม่รวมมาตรา 40(1) (ระบบไม่มีเงินได้ประเภทนี้อยู่แล้ว)
    const item8 = calculateProgressiveTax(item7)
    const item9 = calculateMinimumTax(grossAssessableFull)
    const item10 = calculateFinalTaxDue(item8, item9)
    const item11 = 0 // ภาษีจากใบแสดงเงินได้ฯ ในเขตพัฒนาพิเศษเฉพาะกิจ — ไม่มีข้อมูล ปล่อยว่าง
    const item12 = item10 + item11
    // หมายเหตุ: template ที่ Super Admin อัปโหลดล่าสุดเป็นแบบฟอร์มรุ่นใหม่ที่มี 25 รายการ (ของเดิมมีแค่ 23 รายการ)
    // เพิ่มรายการ 13-14 (เครดิตภาษีเงินได้จากต่างประเทศ) แทรกเข้ามา ทำให้รายการ 13-23 เดิมเลื่อนเป็น 15-25 ทั้งหมด
    const item13 = 0 // หัก เครดิตภาษีเงินได้จากต่างประเทศ — ไม่มีข้อมูล ปล่อยว่าง
    const item14 = item12 - item13
    const item15 = 0 // หัก ภาษีเงินได้หัก ณ ที่จ่ายและเครดิตภาษี — ไม่มี field แยกในระบบ (เหมือน ภ.ง.ด. 94) ปล่อยว่าง
    const item16 = item14 - item15
    const item17 = 0 // ยกมาจากข้อ 8 (ขายอสังหาริมทรัพย์แยกยื่น) — ไม่มีข้อมูล ปล่อยว่าง
    const item18 = item16 + item17
    const item19 = 0 // ยกมาจากข้อ 9 (เงินได้จากการให้/รับ เลือกเสียภาษี 5%) — ไม่มีข้อมูล ปล่อยว่าง
    const item20 = 0 // ยกมาจากใบแนบ — ไม่มีข้อมูล ปล่อยว่าง
    const item21 = 0 // ยกมาจากใบแนบ — ไม่มีข้อมูล ปล่อยว่าง
    const item22 = 0 // เฉพาะกรณียื่นเพิ่มเติม (ระบบนี้ยื่นปกติ) ปล่อยว่าง
    const item23 = item18 + item19 + item20 - item21 - item22
    const item24 = 0 // บวก เงินเพิ่ม — ไม่มีข้อมูล ปล่อยว่าง
    const item25 = item23 + item24 // รวมภาษีที่ชำระเพิ่มเติม/ชำระไว้เกิน สุดท้าย

    setField("Text87.2", fmtComb(item1, 13))
    setField("Text87.3", fmtComb(item2, 13))
    setField("Text87.4", fmtComb(item3, 13))
    setField("Text87.6", fmtComb(item5, 13))
    setField("Text87.8", fmtComb(item7, 13))
    setField("Text87.9", fmtComb(item8, 13))
    setField("Text87.10", grossAssessableFull.toFixed(2)) // ฐานสำหรับสูตร "x 0.005" ของข้อ 9 (ไม่ใช่ comb field)
    setField("Text87.33", fmtComb(item9, 13))
    setField("Text87.34", fmtComb(item10, 13))
    setField("Text87.12", fmtComb(item12, 12))
    setField("Text87.15", fmtComb(item14, 12))
    setField("Text87.20", fmtComb(item16, 12))
    selectDueOrOverpaid("Radio Button89", item16)
    setField("Text87.23", fmtComb(item18, 12))
    selectDueOrOverpaid("Radio Button93", item18)
    setField("Text87.28", fmtComb(item23, 12))
    selectDueOrOverpaid("Radio Button106", item23)
    setField("Text87.30", fmtComb(item25, 12))
    selectDueOrOverpaid("Radio Button107", item25)

    // กล่องสรุปย่อ "ภาษีที่ชำระเพิ่มเติม/ชำระไว้เกิน" ที่หัวหน้าแรก (มายกมาจากผลลัพธ์สุดท้ายของข้อ 11 ข้อ 25.)
    if (item25 >= 0) {
      setField("Text23.1.1", fmtComb(item25, 12))
    } else {
      setField("Text30.0", fmtComb(-item25, 12))
    }

    // บันทึกหมายเหตุลายน้ำการคำนวณภาษีจากระบบ HorSet ไว้ที่ด้านล่าง
    drawText(
      `* คำนวณโดยระบบ HorSet: รายได้ 40(5) = ${data.rent405.toLocaleString()} บ. | รายได้ 40(8) = ${(data.utilities408 + other408).toLocaleString()} บ. | ปีภาษี ${data.taxYear}`,
      45,
      25,
      8
    )
  } else {
    // ภ.ง.ด. 94 (ครึ่งปี)
    // หมายเหตุ field mapping ของฟอร์มนี้ตรวจสอบจากตำแหน่ง x/y จริงของทุก field แล้ว (ไม่ได้เดา) — ดูรายละเอียดใน
    // plan การแก้ไข: Text1.28/Text1.6/Text1.31 ของเดิมผิด (เป็นช่องคู่สมรส/ชื่อกลาง/ไม่มีอยู่จริงตามลำดับ)
    // และ Text4.10.1/4.15/4.18/4.20 ของเดิมเป็นช่องในตาราง "ข. รายการลดหย่อนฯ" ไม่ใช่รายได้ 40(5)-(8) เลย
    const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2)

    const addressParts = data.addressParts || {
      building: "", room: "", floor: "", village: "", no: "", moo: "", soi: "", yaek: "",
      road: "", subdistrict: "", district: "", province: "", zipcode: ""
    }
    const taxpayerStatus = data.taxpayerStatus || "individual"
    const partnerCount = data.partnerCount || 1

    // ข้อมูลส่วนตัวหน้าแรก
    setField("Text1.1", formattedTaxId)
    setField("Text1.5", data.firstName)
    setField("Text1.7", data.lastName)
    setField("Text1.9", addressParts.building)
    setField("Text1.10", addressParts.room)
    setField("Text1.11", addressParts.floor)
    setField("Text1.12", addressParts.village)
    setField("Text1.13", addressParts.no)
    setField("Text1.14", addressParts.moo)
    setField("Text1.15", addressParts.soi)
    setField("Text1.21", addressParts.yaek)
    setField("Text1.16", addressParts.road)
    setField("Text1.17", addressParts.subdistrict)
    setField("Text1.18", addressParts.district)
    setField("Text1.19", addressParts.province)
    setField("Text1.20", addressParts.zipcode)

    // ก.1 รายได้ค่าเช่าห้องพัก (มาตรา 40(5))
    const rentGrossHalf = data.rent405 / 2
    const rentDeductionHalf = data.deductionRent405
    const rentNetHalf = Math.max(0, rentGrossHalf - rentDeductionHalf)
    const rentIsActual = data.rentDeductionMethod === "actual"
    const rentDeductionPct = rentGrossHalf > 0 ? Math.round((rentDeductionHalf / rentGrossHalf) * 100) : 0
    setField("Text3.10", formattedTaxId)
    setField("Text3.11", "รายได้ค่าเช่าห้องพัก")
    setField("Text3.12", fmt(rentGrossHalf))
    setField("Text3.15", rentIsActual ? "" : rentDeductionPct.toString())
    selectRadioWidget("Radio Button6", rentIsActual ? 1 : 0)
    setField("Text3.16", fmt(rentDeductionHalf))
    setField("Text3.17", fmt(rentNetHalf))

    // ก.2 ค่าน้ำไฟและบริการ (มาตรา 40(8))
    const utilGrossHalf = data.utilities408 / 2
    const utilDeductionHalf = data.deductionUtilities408
    const utilNetHalf = Math.max(0, utilGrossHalf - utilDeductionHalf)
    const utilIsActual = data.utilitiesDeductionMethod === "actual"
    const utilDeductionPct = utilGrossHalf > 0 ? Math.round((utilDeductionHalf / utilGrossHalf) * 100) : 0
    setField("Text3.20", formattedTaxId)
    setField("Text3.21", "ค่าน้ำไฟและบริการ")
    setField("Text3.22", fmt(utilGrossHalf))
    setField("Text3.25", utilIsActual ? "" : utilDeductionPct.toString())
    selectRadioWidget("Radio Button7", utilIsActual ? 1 : 0)
    setField("Text3.26", fmt(utilDeductionHalf))
    setField("Text3.27", fmt(utilNetHalf))

    // ก.3 รายได้อื่น (ปรับ/ริบมัดจำ) — กฎหมายไม่ให้สิทธิ์หักแบบเหมา ใช้ "จริง" เสมอ (ไม่มีข้อมูลค่าใช้จ่ายจริงให้หัก จึงเป็น 0)
    const otherGrossHalf = (data.other408 || 0) / 2
    setField("Text3.30", formattedTaxId)
    setField("Text3.31", "รายได้อื่น (ปรับ/ริบมัดจำ)")
    setField("Text3.32", fmt(otherGrossHalf))
    setField("Text3.35", "0")
    selectRadioWidget("Radio Button8", 1)
    setField("Text3.36", "0")
    setField("Text3.37", fmt(otherGrossHalf))

    // ข.1 ค่าลดหย่อนส่วนตัว (ตามสถานภาพผู้เสียภาษี)
    const personalDeduction = calculatePersonalDeduction("94", taxpayerStatus, partnerCount)
    setField("Text4.10.1", fmt(personalDeduction))

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

    setField("Text2.1", fmt(item1))
    setField("Text2.2", fmt(item2))
    setField("Text2.3", fmt(item3))
    setField("Text2.4", fmt(item4))
    setField("Text2.5", fmt(item5))
    setField("Text2.6", fmt(item6))
    setField("Text2.7", fmt(item7))
    setField("Text2.8", fmt(item8))
    setField("Text2.9", fmt(item9))
    setField("Text2.10", fmt(item10))
    setField("Text2.11", fmt(item11))
    setField("Text2.12", fmt(item12))
    setField("Text2.13", fmt(item13))
    setField("Text2.15", fmt(item15))
    setField("Text2.16", fmt(item16))
    setField("Text2.17", fmt(item17))
    setField("Text2.18", fmt(item18))
    setField("Text2.19", fmt(item19))
    // หมายเหตุ: Text2.26 (กล่อง "ภาษีที่ชำระ" ด้านขวา) มี maxLength=3 ในไฟล์ template จริง ไม่พอใส่ยอดเงินเต็มจำนวน
    // จึงไม่กรอกช่องนี้ (ค่าที่ถูกต้องอยู่ใน Text2.19 อยู่แล้วซึ่งเป็นรายการที่ 19 ในตารางคำนวณภาษีตามลำดับ)

    // บันทึกหมายเหตุลายน้ำการคำนวณภาษีจากระบบ HorSet ไว้ที่ด้านล่าง
    drawText(
      `* คำนวณโดยระบบ HorSet: รายได้ 40(5) ครึ่งปี = ${rentGrossHalf.toLocaleString()} บ. | รายได้ 40(8) ครึ่งปี = ${(utilGrossHalf + otherGrossHalf).toLocaleString()} บ. | ปีภาษี ${data.taxYear}`,
      45,
      25,
      8
    )
  }

  // 6. อัปเดตการแสดงผลของฟิลด์ทั้งหมดด้วยฟอนต์ไทย Sarabun
  form.updateFieldAppearances(customFont)

  // 7. บันทึกและดึงไฟล์ PDF ออกมาเป็น Blob เพื่อพร้อมดาวน์โหลด
  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes as any], { type: "application/pdf" })
}

export interface BillPdfData {
  roomNumber: string
  tenantName: string
  billingCycle: string
  baseRent: number
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

  const isElecMin = !data.waiveElectricMin && electricMinChecked && data.electricUnits <= electricMinUnit
  const isWaterMin = !data.waiveWaterMin && waterMinChecked && data.waterUnits <= waterMinUnit

  const elecAmount = isElecMin ? (electricMinUnit * data.electricRate) : data.electricUnits * data.electricRate
  const waterAmount = isWaterMin ? (waterMinUnit * data.waterRate) : data.waterUnits * data.waterRate
  
  const penaltyAmount = data.penaltyAmount !== undefined ? Number(data.penaltyAmount || 0) : 0
  const otherServiceAmount = data.otherServiceAmount !== undefined ? Number(data.otherServiceAmount || 0) : 0
  
  const extraExpenses = data.extraExpenses || []
  const extraExpensesSum = extraExpenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0)

  // คำนวณค่าเช่าห้องพักที่หักส่วนลด (หรือรวมค่าปรับ/ค่าใช้จ่ายอื่นๆ เผื่อไว้) เพื่อให้ยอดรวมรวมกันเท่ากับ data.amount พอดี
  const adjustedBaseRent = Math.max(0, data.amount - elecAmount - waterAmount - commonFee - penaltyAmount - otherServiceAmount - extraExpensesSum)

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

  y -= 25
  // รายการ 2: ค่าไฟฟ้า
  drawText(elecDesc, 50, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(data.electricUnits.toString(), 280, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(isElecMin ? "-" : data.electricRate.toLocaleString(), 380, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(elecAmount.toLocaleString(), 475, y, 9, rgb(0.2, 0.2, 0.2))

  y -= 25
  // รายการ 3: ค่าน้ำประปา
  drawText(waterDesc, 50, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(data.waterUnits.toString(), 280, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(isWaterMin ? "-" : data.waterRate.toLocaleString(), 380, y, 9, rgb(0.2, 0.2, 0.2))
  drawText(waterAmount.toLocaleString(), 475, y, 9, rgb(0.2, 0.2, 0.2))

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

  // ส่วนของการชำระเงินพร้อมเพย์
  y -= 60
  page.drawRectangle({
    x: 40,
    y: y - 160,
    width: 515,
    height: 180,
    color: rgb(0.96, 0.98, 1.0),
    borderColor: rgb(0.85, 0.9, 0.98),
    borderWidth: 1,
  })

  const promptPayTextY = y + 5
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
        y: y - 145,
        width: 130,
        height: 130,
      })
    }
  } catch (qrErr) {
    console.warn("ไม่สามารถฝัง QR Code ลงใน PDF บิลได้:", qrErr)
  }

  // ท้ายบิล
  drawText(`ขอขอบคุณที่ใช้บริการ${workspaceName} หากมีข้อสงสัยติดต่อเจ้าหน้าที่หอพักโดยตรง`, 60, 45, 7.5, rgb(0.5, 0.5, 0.5))

  // เซฟและบันทึกไฟล์เป็น Blob
  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes as any], { type: "application/pdf" })
}
