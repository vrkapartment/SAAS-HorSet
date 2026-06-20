import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"

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
}

export async function generatePndPdf(type: "90" | "94", data: PndData) {
  // 1. กำหนดไฟล์ Template ตามประเภทของ ภ.ง.ด.
  const templateUrl = type === "90"
    ? "/templates/201267PIT90.pdf"
    : "/templates/250668PIT94.pdf"

  const response = await fetch(templateUrl)
  if (!response.ok) {
    throw new Error(`ไม่สามารถโหลดไฟล์แบบฟอร์ม PDF ต้นแบบจาก ${templateUrl} ได้`)
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

  // 5. กรอกข้อมูลและตัวเลขลงในแบบฟอร์มผ่าน Form Fields
  if (type === "90") {
    // ภ.ง.ด. 90 (เต็มปี)
    // ข้อมูลส่วนตัว
    setField("Text80.0", cleanTaxId)
    setField("Text7.0", data.firstName)
    setField("Text7.3", data.lastName)
    setField("Text9", data.address)
    
    // เบอร์โทรศัพท์ วาดด้วยพิกัดเนื่องจากไม่มีฟิลด์เฉพาะบนหน้าแรก
    drawText(data.phone, 350, 617, 10)

    // มาตรา 40(5) (ค่าเช่าห้องพัก) - หน้า 2
    const rentNet = data.rent405 - data.deductionRent405
    setField("Text34.0", Math.round(data.rent405).toString())
    setField("Text34.1", Math.round(data.deductionRent405).toString())
    setField("Text34.2", Math.round(rentNet).toString())
    setField("Text33.9", Math.round(rentNet).toString()) // รวมเงินได้ประเภท 40(1)-40(5) คงเหลือ

    // มาตรา 40(8) (ค่าสาธารณูปโภคและบริการ) - หน้า 3
    const utilitiesNet = data.utilities408 - data.deductionUtilities408
    setField("Text70", "ค่าสาธารณูปโภคและบริการ")
    setField("Text40.0", Math.round(data.utilities408).toString())
    setField("Text40.1", Math.round(data.deductionUtilities408).toString())
    setField("Text40.2", Math.round(utilitiesNet).toString())

    // บันทึกหมายเหตุลายน้ำการคำนวณภาษีจากระบบ HorSet ไว้ที่ด้านล่าง
    drawText(
      `* คำนวณโดยระบบ HorSet: รายได้ 40(5) = ${data.rent405.toLocaleString()} บ. | รายได้ 40(8) = ${data.utilities408.toLocaleString()} บ. | ปีภาษี ${data.taxYear}`,
      45,
      25,
      8
    )
  } else {
    // ภ.ง.ด. 94 (ครึ่งปี)
    // ข้อมูลส่วนตัวหน้าแรก
    setField("Text1.1", cleanTaxId)
    setField("Text1.5", data.firstName)
    setField("Text1.28", data.lastName)
    setField("Text1.6", data.address)
    setField("Text1.31", data.phone)

    // ใบแนบ มาตรา 40(5) (ค่าเช่าครึ่งปี) - หน้า 2
    const rentHalf = data.rent405 / 2
    const rentNetHalf = rentHalf - data.deductionRent405
    setField("Text3.10", cleanTaxId)
    setField("Text4.10.1", Math.round(rentHalf).toString())
    setField("Text4.15", Math.round(rentHalf).toString())
    setField("Text4.18", Math.round(data.deductionRent405).toString())
    setField("Text4.20", Math.round(rentNetHalf).toString())

    // ใบแนบ มาตรา 40(8) (น้ำไฟ/บริการครึ่งปี) - หน้า 2
    const utilitiesHalf = data.utilities408 / 2
    const utilitiesNetHalf = utilitiesHalf - data.deductionUtilities408
    setField("Text3.40", cleanTaxId)
    setField("Text3.41", "ค่าสาธารณูปโภคและบริการ")
    setField("Text3.42", Math.round(utilitiesHalf).toString())
    setField("Text5.19", Math.round(data.deductionUtilities408).toString())
    setField("Text5.18", Math.round(utilitiesNetHalf).toString())

    // บันทึกหมายเหตุลายน้ำการคำนวณภาษีจากระบบ HorSet ไว้ที่ด้านล่าง
    drawText(
      `* คำนวณโดยระบบ HorSet: รายได้ 40(5) ครึ่งปี = ${(data.rent405 / 2).toLocaleString()} บ. | รายได้ 40(8) ครึ่งปี = ${(data.utilities408 / 2).toLocaleString()} บ. | ปีภาษี ${data.taxYear}`,
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

  const isElecMin = electricMinChecked && data.electricUnits <= electricMinUnit
  const isWaterMin = waterMinChecked && data.waterUnits <= waterMinUnit

  const elecAmount = isElecMin ? (electricMinUnit * data.electricRate) : data.electricUnits * data.electricRate
  const waterAmount = isWaterMin ? (waterMinUnit * data.waterRate) : data.waterUnits * data.waterRate
  
  const penaltyAmount = data.penaltyAmount !== undefined ? Number(data.penaltyAmount || 0) : 0
  
  // คำนวณค่าเช่าห้องพักที่หักส่วนลด (หรือรวมค่าปรับ/ค่าใช้จ่ายอื่นๆ เผื่อไว้) เพื่อให้ยอดรวมรวมกันเท่ากับ data.amount พอดี
  const adjustedBaseRent = Math.max(0, data.amount - elecAmount - waterAmount - commonFee - penaltyAmount)

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

  // รายการ 5: ค่าปรับจ่ายล่าช้า (แสดงต่อเมื่อมียอดค่าปรับ)
  if (penaltyAmount > 0) {
    y -= 25
    const days = data.lateDays !== undefined ? data.lateDays : 0
    const rate = data.latePenaltyRate !== undefined ? data.latePenaltyRate : (days > 0 ? Math.round(penaltyAmount / days) : penaltyAmount)

    drawText("5. ค่าปรับจ่ายล่าช้า (Late Payment Penalty / Fine)", 50, y, 9, rgb(0.8, 0.1, 0.1))
    drawText(days > 0 ? `${days} วัน` : "1", 280, y, 9, rgb(0.8, 0.1, 0.1))
    drawText(rate.toLocaleString(), 380, y, 9, rgb(0.8, 0.1, 0.1))
    drawText(penaltyAmount.toLocaleString(), 475, y, 9, rgb(0.8, 0.1, 0.1))
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
