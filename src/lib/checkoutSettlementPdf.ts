import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { drawThaiText } from "./pdfHelper"
import { formatThaiDate, type SettlementDocument } from "@/features/tenant/checkout-settlement"

/**
 * PDF "ใบสรุปการย้ายออกและคืนเงินประกัน" — สร้างในเบราว์เซอร์แบบเดียวกับใบแจ้งหนี้ (generateBillPdf)
 * ตัวเลขทุกบรรทัดมาจาก buildSettlementDocument() ไม่คิดสูตรซ้ำที่นี่
 */
export async function generateCheckoutSettlementPdf(
  doc: SettlementDocument,
  workspace: { name?: string; address?: string; phone?: string; taxId?: string }
): Promise<Blob> {
  const fontUrl = "https://fastly.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf"
  const fontResponse = await fetch(fontUrl)
  if (!fontResponse.ok) {
    throw new Error("ไม่สามารถดาวน์โหลดฟอนต์ภาษาไทยสำหรับสร้าง PDF ได้")
  }
  const fontBytes = await fontResponse.arrayBuffer()

  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const page = pdfDoc.addPage([595, 842]) // A4
  const font = await pdfDoc.embedFont(fontBytes, { subset: false })

  const ink = rgb(0.2, 0.2, 0.2)
  const muted = rgb(0.45, 0.45, 0.45)
  const drawText = (text: string, x: number, y: number, size = 9, color = ink) => {
    drawThaiText(page, text, x, y, { font, size, color })
  }
  // ตัวเลขชิดขวาที่ขอบ x
  const drawAmount = (value: number, rightX: number, y: number, size = 9, color = ink) => {
    const text = value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    drawText(text, rightX - font.widthOfTextAtSize(text, size), y, size, color)
  }

  // หัวเอกสาร
  page.drawRectangle({ x: 40, y: 740, width: 515, height: 60, color: rgb(0.06, 0.09, 0.16) })
  drawText("ใบสรุปการย้ายออกและคืนเงินประกัน", 55, 772, 11, rgb(1, 1, 1))
  drawText(workspace.name || "หอพัก", 55, 754, 9, rgb(0.85, 0.9, 1))
  if (workspace.address) {
    const addr = workspace.address.length > 55 ? workspace.address.slice(0, 52) + "..." : workspace.address
    drawText(`ที่อยู่: ${addr}`, 330, 776, 6.5, rgb(0.8, 0.8, 0.8))
  }
  if (workspace.phone) drawText(`เบอร์โทร: ${workspace.phone}`, 330, 763, 6.5, rgb(0.8, 0.8, 0.8))
  if (workspace.taxId) drawText(`เลขประจำตัวผู้เสียภาษี: ${workspace.taxId}`, 330, 750, 6.5, rgb(0.8, 0.8, 0.8))

  // ข้อมูลผู้เช่า
  drawText(`หมายเลขห้อง: ${doc.roomNumber}`, 50, 705, 10, rgb(0.1, 0.1, 0.1))
  drawText(`ชื่อผู้เช่า: ${doc.tenantName || "-"}`, 50, 686, 10, rgb(0.1, 0.1, 0.1))
  drawText(`วันที่ย้ายออก: ${formatThaiDate(doc.cancellationDate)}`, 340, 705, 10, rgb(0.1, 0.1, 0.1))
  drawText(`วันที่ออกเอกสาร: ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`, 340, 686, 10, rgb(0.1, 0.1, 0.1))

  // ตารางรายการหัก
  page.drawRectangle({ x: 40, y: 640, width: 515, height: 25, color: rgb(0.92, 0.94, 0.98) })
  drawText("รายการหักจากเงินประกัน", 50, 648, 9, rgb(0.15, 0.2, 0.3))
  drawText("จำนวนเงิน (บาท)", 470, 648, 9, rgb(0.15, 0.2, 0.3))

  let y = 615
  doc.lines.forEach((line, i) => {
    drawText(`${i + 1}. ${line.label}`, 50, y, 9.5)
    drawAmount(line.amount, 545, y, 9.5)
    if (line.detail) {
      y -= 13
      drawText(line.detail, 62, y, 8, muted)
    }
    y -= 22
  })

  // สรุปยอด
  y -= 4
  page.drawLine({ start: { x: 300, y: y + 12 }, end: { x: 555, y: y + 12 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) })
  const summaryRow = (label: string, value: number, size = 9.5, color = ink) => {
    drawText(label, 310, y, size, color)
    drawAmount(value, 545, y, size, color)
    y -= 20
  }
  summaryRow("เงินประกันที่ชำระไว้", doc.depositAmount)
  summaryRow("รวมรายการหัก", doc.totalDeductions)
  // แสดงเฉพาะเมื่อต่างจากรวมรายการหัก (ริบตามสัญญา หรือหักเกินเงินประกัน) — ไม่งั้นเป็นตัวเลขซ้ำ
  if (Math.abs(doc.forfeited - doc.totalDeductions) >= 0.01) {
    summaryRow("เงินประกันที่ริบ/หักไว้จริง", doc.forfeited)
  }

  y -= 4
  page.drawRectangle({ x: 300, y: y - 8, width: 255, height: 28, color: rgb(0.9, 0.97, 0.93) })
  drawText("ยอดเงินคืนผู้เช่า", 310, y, 11, rgb(0.05, 0.4, 0.25))
  drawAmount(doc.refund, 545, y, 12, rgb(0.05, 0.4, 0.25))
  y -= 36

  if (doc.breachNote) {
    drawText(`หมายเหตุ: ${doc.breachNote}`, 50, y, 8.5, rgb(0.7, 0.2, 0.2))
    y -= 16
  }

  // ลงชื่อ
  const signY = Math.min(y - 40, 180)
  page.drawLine({ start: { x: 70, y: signY }, end: { x: 240, y: signY }, thickness: 0.5, color: muted })
  page.drawLine({ start: { x: 355, y: signY }, end: { x: 525, y: signY }, thickness: 0.5, color: muted })
  drawText("ผู้เช่า", 140, signY - 15, 9, muted)
  drawText("ผู้ดูแลหอพัก", 415, signY - 15, 9, muted)

  drawText("เอกสารนี้ออกโดยระบบ HorSet เพื่อสรุปการคืนห้องและเงินประกัน", 50, 60, 7.5, muted)

  const bytes = await pdfDoc.save()
  return new Blob([bytes as BlobPart], { type: "application/pdf" })
}
