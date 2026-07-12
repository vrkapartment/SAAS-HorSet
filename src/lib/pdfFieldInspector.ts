import { PDFDocument, PDFRef, PDFDict, PDFName, PDFArray, PDFNumber, PDFString, PDFHexString } from "pdf-lib"

// ตำแหน่งของ 1 widget ภายใน field หนึ่ง (text field ปกติมี widget เดียว, radio group มีหลาย widget)
// rectPdf เป็นพิกัดต้นฉบับของ PDF (หน่วย point, origin มุมซ้ายล่าง) — ผู้ใช้ (เช่นตัวเรนเดอร์ในเบราว์เซอร์) แปลงเป็นพิกัดจอเอง
export interface InspectedWidget {
  widgetIndex: number
  rectPdf: [number, number, number, number] // [llx, lly, urx, ury]
}

export type InspectedFieldKind = "text" | "radio" | "checkbox" | "dropdown" | "other"

export interface InspectedField {
  name: string
  fieldKind: InspectedFieldKind
  pageIndex: number
  pageWidthPdf: number
  pageHeightPdf: number
  pageRotation: number
  widgets: InspectedWidget[]
  maxLength?: number // เฉพาะ text field ที่เป็น comb (อ่านจาก /MaxLen จริง ไม่ hardcode)
}

export interface FieldInspectionResult {
  pageCount: number
  fieldsByPage: InspectedField[][] // index = pageIndex
  allFields: InspectedField[]
}

function decodeName(value: unknown): string | null {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText()
  return null
}

function readRect(dict: PDFDict): [number, number, number, number] {
  const rect = dict.get(PDFName.of("Rect"))
  if (rect instanceof PDFArray && rect.size() >= 4) {
    const nums = [0, 1, 2, 3].map((i) => {
      const v = rect.get(i)
      return v instanceof PDFNumber ? v.asNumber() : 0
    })
    return [nums[0], nums[1], nums[2], nums[3]]
  }
  return [0, 0, 0, 0]
}

// ไล่ดู widget annotation ของทุกหน้าโดยตรง (ไม่ผ่าน form.getFields() ซึ่งอาจพลาด field ที่หลุดโครงสร้าง AcroForm
// แม้จะ repairOrphanedFormFields() แล้วก็ตาม เพราะการซ่อมแค่เติมกลับเข้า AcroForm/Fields ไม่ได้แก้ /P ของแต่ละ widget)
// แล้วไล่ต่อขึ้นไปหาชื่อ field แบบเต็ม (ต่อ T ของทุกชั้น parent ด้วย ".") วิธีเดียวกับที่ใช้ตรวจสอบ field ของ PND90 จริง
export function inspectPdfFields(pdfDoc: PDFDocument): FieldInspectionResult {
  const form = pdfDoc.getForm()
  const pages = pdfDoc.getPages()
  const fieldsByPage: InspectedField[][] = pages.map(() => [])
  const byName = new Map<string, InspectedField>()

  const TKey = PDFName.of("T")
  const ParentKey = PDFName.of("Parent")

  pages.forEach((page, pageIndex) => {
    const annots = page.node.Annots()
    if (!annots) return
    const { width: pageWidthPdf, height: pageHeightPdf } = page.getSize()
    const pageRotation = page.getRotation().angle

    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i)
      if (!(ref instanceof PDFRef)) continue
      const dict = pdfDoc.context.lookup(ref, PDFDict)
      if (!dict) continue

      const segments: string[] = []
      let cur: PDFDict | undefined = dict
      while (cur) {
        const t = cur.get(TKey)
        const decoded = decodeName(t)
        if (decoded) segments.unshift(decoded)
        const parentRef = cur.get(ParentKey)
        cur = parentRef instanceof PDFRef ? pdfDoc.context.lookup(parentRef, PDFDict) : undefined
      }
      const name = segments.join(".")
      if (!name) continue

      let entry = byName.get(name)
      if (!entry) {
        let fieldKind: InspectedFieldKind = "other"
        let maxLength: number | undefined
        try {
          const f = form.getTextField(name)
          fieldKind = "text"
          maxLength = f.getMaxLength()
        } catch {
          try {
            form.getRadioGroup(name)
            fieldKind = "radio"
          } catch {
            try {
              form.getCheckBox(name)
              fieldKind = "checkbox"
            } catch {
              try {
                form.getDropdown(name)
                fieldKind = "dropdown"
              } catch {
                fieldKind = "other"
              }
            }
          }
        }
        entry = { name, fieldKind, pageIndex, pageWidthPdf, pageHeightPdf, pageRotation, widgets: [], maxLength }
        byName.set(name, entry)
        fieldsByPage[pageIndex].push(entry)
      }
      entry.widgets.push({ widgetIndex: entry.widgets.length, rectPdf: readRect(dict) })
    }
  })

  return { pageCount: pages.length, fieldsByPage, allFields: Array.from(byName.values()) }
}
