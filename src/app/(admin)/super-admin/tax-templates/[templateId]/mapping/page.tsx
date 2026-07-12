"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2, FileDown, BookOpen } from "lucide-react"
import { PDFDocument } from "pdf-lib"
import { loadPdfDocument } from "@/lib/pdfjsClient"
import { inspectPdfFields, type FieldInspectionResult, type InspectedField } from "@/lib/pdfFieldInspector"
import { repairOrphanedFormFields, PND_LOGICAL_KEY_CATALOG, type PndFieldFormat } from "@/lib/pdfHelper"
import {
  getTaxFormTemplatesAction,
  getFieldMappingsAdminAction,
  saveFieldMappingAction,
  deleteFieldMappingAction,
  getTaxFormMappingCoverageAction,
} from "@/features/super-admin/actions"

interface MappingRow {
  id: string
  logical_key: string
  field_kind: "text" | "radio"
  physical_field_name: string
  option_key: string | null
  widget_index: number | null
  value_format: string | null
}

interface CoverageData {
  totalRequiredKeys: number
  mappedKeyCount: number
  unmappedRequiredKeys: string[]
  danglingMappings: { logical_key: string; physical_field_name: string }[]
}

interface PickerTarget {
  field: InspectedField
  widgetIndex: number
}

// เดา format เริ่มต้นแบบหยาบๆ จากชื่อ key ให้ admin ปรับต่อได้ (ไม่ได้ผูกตายตัว)
function guessDefaultFormat(logicalKey: string): PndFieldFormat {
  if (logicalKey.startsWith("item.") || /gross|deduction|net|amount|total|item1$/.test(logicalKey)) return "comb"
  return "raw"
}

function sectionOf(key: string): string {
  return key.split(".")[0]
}

const SECTION_LABELS: Record<string, string> = {
  header: "หัวฟอร์ม",
  personal: "ข้อมูลผู้เสียภาษี",
  address: "ที่อยู่",
  rent: "ค่าเช่า (40(5))",
  utilities: "ค่าน้ำไฟ/บริการ (40(8))",
  other: "รายได้อื่น (40(8))",
  annex: "ใบแนบลดหย่อน",
  item: "ข้อ 11 คำนวณภาษี",
  summary: "สรุปหน้าแรก",
}

export default function TaxTemplateMappingPage() {
  const params = useParams<{ templateId: string }>()
  const router = useRouter()
  const templateId = Array.isArray(params.templateId) ? params.templateId[0] : params.templateId

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formType, setFormType] = useState<"90" | "94" | null>(null)
  const [fileName, setFileName] = useState("")

  const [inspection, setInspection] = useState<FieldInspectionResult | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pdfjsDoc, setPdfjsDoc] = useState<any>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [coverage, setCoverage] = useState<CoverageData | null>(null)

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null)
  const [pickerKey, setPickerKey] = useState("")
  const [pickerOption, setPickerOption] = useState("")
  const [pickerFormat, setPickerFormat] = useState<PndFieldFormat>("raw")
  const [saving, setSaving] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewportRects, setViewportRects] = useState<Record<string, [number, number, number, number][]>>({})
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  const refreshMappingsAndCoverage = useCallback(async (activeFormType: "90" | "94") => {
    const mappingsRes = await getFieldMappingsAdminAction(templateId)
    if (mappingsRes.success) setMappings(mappingsRes.data as MappingRow[])
    const coverageRes = await getTaxFormMappingCoverageAction(templateId, activeFormType)
    if (coverageRes.success) setCoverage(coverageRes.data as CoverageData)
  }, [templateId])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const templatesRes = await getTaxFormTemplatesAction()
        if (!templatesRes.success) throw new Error(templatesRes.error)
        const template = (templatesRes.data || []).find((t: { id: string }) => t.id === templateId)
        if (!template) throw new Error("ไม่พบ template นี้ อาจถูกลบไปแล้ว")

        const activeFormType = template.form_type as "90" | "94"
        setFormType(activeFormType)
        setFileName(template.file_name || "")

        const fileRes = await fetch(template.file_url)
        if (!fileRes.ok) throw new Error("ไม่สามารถโหลดไฟล์ PDF ได้")
        const bytes = await fileRes.arrayBuffer()

        const pdfLibDoc = await PDFDocument.load(bytes)
        repairOrphanedFormFields(pdfLibDoc)
        setInspection(inspectPdfFields(pdfLibDoc))

        const pdfjs = await loadPdfDocument(bytes.slice(0))
        setPdfjsDoc(pdfjs)

        await refreshMappingsAndCoverage(activeFormType)
      } catch (e) {
        setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล")
      } finally {
        setLoading(false)
      }
    }
    if (templateId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  // เรนเดอร์หน้าปัจจุบันลง canvas + คำนวณตำแหน่งกรอบ overlay ให้ตรงกับพิกัดที่เรนเดอร์จริง
  useEffect(() => {
    async function render() {
      if (!pdfjsDoc || !canvasRef.current || !inspection) return
      const page = await pdfjsDoc.getPage(pageIndex + 1)
      const scale = 1.4
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      canvas.width = viewport.width
      canvas.height = viewport.height
      setCanvasSize({ width: viewport.width, height: viewport.height })
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      await page.render({ canvasContext: ctx, viewport }).promise

      const rects: Record<string, [number, number, number, number][]> = {}
      const fields = inspection.fieldsByPage[pageIndex] || []
      for (const field of fields) {
        rects[field.name] = field.widgets.map((w) => {
          const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(w.rectPdf)
          const left = Math.min(x1, x2)
          const top = Math.min(y1, y2)
          return [left, top, Math.abs(x2 - x1), Math.abs(y2 - y1)] as [number, number, number, number]
        })
      }
      setViewportRects(rects)
    }
    render()
  }, [pdfjsDoc, pageIndex, inspection])

  const mappingsForField = (fieldName: string) => mappings.filter((m) => m.physical_field_name === fieldName)
  const mappingForWidget = (fieldName: string, widgetIndex: number, fieldKind: "text" | "radio") =>
    mappings.find((m) =>
      m.physical_field_name === fieldName && (fieldKind === "radio" ? m.widget_index === widgetIndex : true)
    )

  const openPicker = (field: InspectedField, widgetIndex: number) => {
    const existing = mappingForWidget(field.name, widgetIndex, field.fieldKind === "radio" ? "radio" : "text")
    setPickerTarget({ field, widgetIndex })
    setPickerKey(existing?.logical_key || "")
    setPickerOption(existing?.option_key || "")
    setPickerFormat((existing?.value_format as PndFieldFormat) || guessDefaultFormat(existing?.logical_key || ""))
  }

  const handleSaveAssignment = async () => {
    if (!pickerTarget || !formType || !pickerKey) return
    setSaving(true)
    try {
      const isRadio = pickerTarget.field.fieldKind === "radio"
      const res = await saveFieldMappingAction({
        templateId,
        logicalKey: pickerKey,
        fieldKind: isRadio ? "radio" : "text",
        physicalFieldName: pickerTarget.field.name,
        optionKey: isRadio ? pickerOption : undefined,
        widgetIndex: isRadio ? pickerTarget.widgetIndex : undefined,
        valueFormat: isRadio ? undefined : pickerFormat,
      })
      if (!res.success) throw new Error(res.error)
      await refreshMappingsAndCoverage(formType)
      setPickerTarget(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAssignment = async () => {
    if (!pickerTarget || !formType) return
    const existing = mappingForWidget(
      pickerTarget.field.name,
      pickerTarget.widgetIndex,
      pickerTarget.field.fieldKind === "radio" ? "radio" : "text"
    )
    if (!existing) { setPickerTarget(null); return }
    setSaving(true)
    try {
      const res = await deleteFieldMappingAction(existing.id)
      if (!res.success) throw new Error(res.error)
      await refreshMappingsAndCoverage(formType)
      setPickerTarget(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        กำลังโหลด template...
      </div>
    )
  }

  if (error || !formType || !inspection) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-slate-300">{error || "ไม่พบข้อมูล template"}</p>
          <button
            onClick={() => router.push("/super-admin")}
            className="mt-4 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors"
          >
            กลับหน้า Super Admin
          </button>
        </div>
      </div>
    )
  }

  const catalog = PND_LOGICAL_KEY_CATALOG[formType]
  const pickerCatalog = pickerTarget
    ? catalog.filter((c) => c.kind === (pickerTarget.field.fieldKind === "radio" ? "radio" : "text"))
    : []
  const catalogBySection = pickerCatalog.reduce<Record<string, typeof pickerCatalog>>((acc, entry) => {
    const s = sectionOf(entry.key)
    acc[s] = acc[s] || []
    acc[s].push(entry)
    return acc
  }, {})
  const selectedCatalogEntry = pickerCatalog.find((c) => c.key === pickerKey)

  const currentFields = inspection.fieldsByPage[pageIndex] || []

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/super-admin")}
            className="p-2 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-slate-100 truncate">
              จัด mapping field — ภ.ง.ด. {formType} ({fileName})
            </h1>
            <p className="text-xs text-slate-500">
              คลิกกรอบสีบนฟอร์มด้านล่างเพื่อกำหนดว่าช่องนั้นควรกรอกข้อมูลอะไร
            </p>
          </div>
          {coverage && (
            <div className="text-xs text-slate-400 shrink-0">
              map แล้ว {coverage.mappedKeyCount}/{coverage.totalRequiredKeys}
            </div>
          )}
          <button
            onClick={() => router.push(`/super-admin/tax-templates/${templateId}/mapping/help`)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-slate-700 hover:bg-slate-900 hover:text-slate-100 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            วิธีใช้งาน
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <div className="flex gap-2 overflow-x-auto pb-3">
            {inspection.fieldsByPage.map((_, i) => (
              <button
                key={i}
                onClick={() => setPageIndex(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  pageIndex === i
                    ? "bg-blue-600 text-white"
                    : "bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800"
                }`}
              >
                หน้า {i + 1}
              </button>
            ))}
          </div>

          <div className="relative inline-block border border-slate-800 rounded-xl overflow-hidden bg-white">
            <canvas ref={canvasRef} style={{ display: "block" }} />
            <div className="absolute inset-0" style={{ width: canvasSize.width, height: canvasSize.height }}>
              {currentFields.map((field) =>
                field.widgets.map((widget) => {
                  const rect = viewportRects[field.name]?.[widget.widgetIndex]
                  if (!rect) return null
                  const [left, top, width, height] = rect
                  const existing = mappingForWidget(field.name, widget.widgetIndex, field.fieldKind === "radio" ? "radio" : "text")
                  const isRadio = field.fieldKind === "radio"
                  return (
                    <button
                      key={`${field.name}-${widget.widgetIndex}`}
                      onClick={() => openPicker(field, widget.widgetIndex)}
                      title={field.name}
                      style={{ left, top, width, height, position: "absolute" }}
                      className={`border-2 transition-colors ${
                        existing
                          ? isRadio
                            ? "border-amber-400 bg-amber-400/20 hover:bg-amber-400/30"
                            : "border-teal-400 bg-teal-400/15 hover:bg-teal-400/25"
                          : "border-dashed border-rose-500/70 bg-rose-500/10 hover:bg-rose-500/20"
                      }`}
                    >
                      {isRadio && (
                        <span className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                          {widget.widgetIndex}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h2 className="text-xs font-bold text-slate-300 mb-2">ความครบถ้วนของ mapping</h2>
            {coverage ? (
              <>
                <p className="text-2xl font-bold text-slate-100">
                  {coverage.mappedKeyCount}
                  <span className="text-sm text-slate-500"> / {coverage.totalRequiredKeys}</span>
                </p>
                {coverage.danglingMappings.length > 0 && (
                  <div className="mt-3 text-xs text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      มี {coverage.danglingMappings.length} mapping ที่ชี้ไป field ที่ไม่มีอยู่ในไฟล์นี้แล้ว (อาจเพราะ template เปลี่ยนโครงสร้าง)
                    </span>
                  </div>
                )}
                {coverage.unmappedRequiredKeys.length > 0 ? (
                  <details className="mt-3">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                      ยังไม่ได้ map อีก {coverage.unmappedRequiredKeys.length} รายการ
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-slate-500 max-h-64 overflow-y-auto">
                      {coverage.unmappedRequiredKeys.map((key) => (
                        <li key={key} className="font-mono">{key}</li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <p className="mt-3 text-xs text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> ครบทุกรายการที่จำเป็นแล้ว
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">กำลังตรวจสอบ...</p>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-500 space-y-2">
            <p><span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-rose-500/70 bg-rose-500/10 align-middle mr-2" />ยังไม่ map</p>
            <p><span className="inline-block w-3 h-3 rounded-sm border-2 border-teal-400 bg-teal-400/15 align-middle mr-2" />map แล้ว (ข้อความ)</p>
            <p><span className="inline-block w-3 h-3 rounded-sm border-2 border-amber-400 bg-amber-400/20 align-middle mr-2" />map แล้ว (radio — ตัวเลขคือ widget index)</p>
          </div>
        </div>
      </div>

      {pickerTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-30 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-md">
            <h3 className="text-sm font-bold text-slate-100 mb-1">
              {pickerTarget.field.name}
              {pickerTarget.field.fieldKind === "radio" && ` (widget ${pickerTarget.widgetIndex})`}
            </h3>
            <p className="text-xs text-slate-500 mb-4">เลือกว่าช่องนี้ควรมีความหมายอะไร</p>

            <label className="text-xs text-slate-400 block mb-1">ความหมาย</label>
            <select
              value={pickerKey}
              onChange={(e) => { setPickerKey(e.target.value); setPickerOption(""); setPickerFormat(guessDefaultFormat(e.target.value)) }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 mb-3"
            >
              <option value="">— เลือก —</option>
              {Object.entries(catalogBySection).map(([section, entries]) => (
                <optgroup key={section} label={SECTION_LABELS[section] || section}>
                  {entries.map((entry) => (
                    <option key={entry.key} value={entry.key}>{entry.key}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {pickerTarget.field.fieldKind === "radio" && selectedCatalogEntry?.options && (
              <>
                <label className="text-xs text-slate-400 block mb-1">ตัวเลือก (option)</label>
                <select
                  value={pickerOption}
                  onChange={(e) => setPickerOption(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 mb-3"
                >
                  <option value="">— เลือก —</option>
                  {selectedCatalogEntry.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </>
            )}

            {pickerTarget.field.fieldKind !== "radio" && (
              <>
                <label className="text-xs text-slate-400 block mb-1">รูปแบบข้อมูล</label>
                <select
                  value={pickerFormat}
                  onChange={(e) => setPickerFormat(e.target.value as PndFieldFormat)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 mb-3"
                >
                  <option value="raw">raw (ข้อความ/ชื่อ)</option>
                  <option value="comb">comb (จำนวนเงิน แบบบาท-สตางค์)</option>
                  <option value="plain_decimal">plain_decimal (จำนวนเงิน แบบทศนิยมธรรมดา)</option>
                </select>
              </>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setPickerTarget(null)}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                ยกเลิก
              </button>
              {mappingForWidget(pickerTarget.field.name, pickerTarget.widgetIndex, pickerTarget.field.fieldKind === "radio" ? "radio" : "text") && (
                <button
                  onClick={handleDeleteAssignment}
                  disabled={saving}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-red-950 border border-red-900 text-red-300 hover:bg-red-900 transition-colors disabled:opacity-50"
                >
                  ลบ mapping
                </button>
              )}
              <button
                onClick={handleSaveAssignment}
                disabled={saving || !pickerKey || (pickerTarget.field.fieldKind === "radio" && !pickerOption)}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
