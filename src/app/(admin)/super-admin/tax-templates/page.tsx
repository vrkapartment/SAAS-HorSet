"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  FileText,
  UploadCloud,
  Settings,
  Trash2,
  CheckCircle2,
  ShieldAlert,
  RefreshCw
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import {
  getTaxFormTemplatesAction,
  uploadTaxFormTemplateAction,
  deleteTaxFormTemplateAction,
  updatePnd90TaxYearAction
} from "@/features/super-admin/actions"

interface TaxFormTemplate {
  id: string
  form_type: "90" | "94"
  tax_year: string | null
  file_url: string
  file_name: string | null
  updated_at: string
}

export default function TaxTemplatesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setResultSuccess] = useState<string | null>(null)

  // PDF Template ของแบบฟอร์ม ภ.ง.ด. 90/94
  const [taxTemplates, setTaxTemplates] = useState<TaxFormTemplate[]>([])
  const [uploadingTaxTemplate, setUploadingTaxTemplate] = useState<"90" | "94" | null>(null)
  const [pnd94UploadYear, setPnd94UploadYear] = useState(String(new Date().getFullYear()))
  const [pnd90TaxYearInput, setPnd90TaxYearInput] = useState("")
  const [savingPnd90Year, setSavingPnd90Year] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const templatesRes = await getTaxFormTemplatesAction()
      if (templatesRes.success) setTaxTemplates(templatesRes.data || [])
      else setError(templatesRes.error || "ไม่สามารถโหลดข้อมูล template ได้")
    } catch (err: any) {
      setError("ไม่สามารถโหลดข้อมูล template ได้: " + (err?.message || "เกิดข้อผิดพลาด"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // ซิงค์ช่องกรอกปีภาษี ภ.ง.ด. 90 กับค่าที่บันทึกไว้ในระบบ (ทั้งตอนโหลดครั้งแรกและหลังบันทึกสำเร็จ)
  useEffect(() => {
    const pnd90 = taxTemplates.find((t) => t.form_type === "90")
    if (pnd90?.tax_year) {
      setPnd90TaxYearInput(pnd90.tax_year)
    }
  }, [taxTemplates])

  // อัปโหลดไฟล์จริงขึ้น Storage bucket 'tax-templates' แล้วบันทึก reference ลงฐานข้อมูล
  const performTaxTemplateUpload = async (formType: "90" | "94", taxYear: string | null, file: File) => {
    setUploadingTaxTemplate(formType)
    setError(null)
    setResultSuccess(null)
    try {
      const supabase = createClient()
      const fileExt = file.name.split(".").pop() || "pdf"
      const pathSegment = formType === "90" ? "current" : taxYear
      const fileName = `${formType}/${pathSegment}_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from("tax-templates")
        .upload(fileName, file, { contentType: "application/pdf", cacheControl: "3600", upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from("tax-templates").getPublicUrl(fileName)

      const res = await uploadTaxFormTemplateAction(formType, taxYear, publicUrl, file.name)
      if (!res.success) throw new Error(res.error)

      setResultSuccess(`✓ อัปโหลดแบบฟอร์ม PDF ภ.ง.ด. ${formType}${taxYear ? ` ปีภาษี ${taxYear}` : ""} เรียบร้อยแล้ว`)

      const templatesRes = await getTaxFormTemplatesAction()
      if (templatesRes.success) setTaxTemplates(templatesRes.data || [])
    } catch (err: any) {
      setError("อัปโหลด PDF template ไม่สำเร็จ: " + (err?.message || "เกิดข้อผิดพลาด"))
    } finally {
      setUploadingTaxTemplate(null)
    }
  }

  // เลือกไฟล์ PDF ที่จะอัปโหลด: ตรวจสอบชื่อฟิลด์ในฟอร์มก่อน ถ้าขาดฟิลด์ที่ระบบต้องใช้กรอกข้อมูล ให้เตือนก่อนอัปโหลดจริง
  const handleTaxTemplateFileSelect = async (formType: "90" | "94", file: File | null | undefined, taxYear: string | null) => {
    if (!file) return
    if (file.type !== "application/pdf") {
      setError("กรุณาเลือกไฟล์ PDF เท่านั้น")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("ขนาดไฟล์ PDF ต้องไม่เกิน 5MB")
      return
    }
    if (formType === "94" && !taxYear?.trim()) {
      setError("กรุณาระบุปีภาษีก่อนอัปโหลดแบบฟอร์ม ภ.ง.ด. 94")
      return
    }

    setError(null)
    setResultSuccess(null)

    try {
      const bytes = await file.arrayBuffer()
      const { PDFDocument } = await import("pdf-lib")
      const { REQUIRED_PND_FIELDS, repairOrphanedFormFields } = await import("@/lib/pdfHelper")
      const pdfDoc = await PDFDocument.load(bytes)
      // ซ่อม field ที่หลุดออกจากต้นไม้ AcroForm ก่อนตรวจสอบ (บาง template มีฟิลด์ใช้งานได้จริงแต่หาไม่เจอด้วยชื่อถ้าไม่ซ่อมก่อน)
      repairOrphanedFormFields(pdfDoc)
      const existingNames = new Set(pdfDoc.getForm().getFields().map((f) => f.getName()))
      const missingFields = REQUIRED_PND_FIELDS[formType].filter((name) => !existingNames.has(name))

      const resolvedTaxYear = formType === "94" ? taxYear!.trim() : null

      if (missingFields.length > 0) {
        const proceed = confirm(
          `ไฟล์นี้ไม่มีฟิลด์ที่ระบบต้องใช้กรอกข้อมูลอัตโนมัติจำนวน ${missingFields.length} ฟิลด์:\n${missingFields.join(", ")}\n\nถ้าอัปโหลดต่อ ข้อมูลส่วนนี้จะไม่ถูกกรอกเข้าฟอร์มให้อัตโนมัติ ต้องการอัปโหลดต่อหรือไม่?`
        )
        if (!proceed) return
      }

      await performTaxTemplateUpload(formType, resolvedTaxYear, file)
    } catch (err: any) {
      setError("ไม่สามารถอ่านไฟล์ PDF นี้ได้ กรุณาตรวจสอบว่าเป็นไฟล์ PDF ที่ถูกต้อง: " + (err?.message || ""))
    }
  }

  const handleDeleteTaxTemplate = async (id: string, label: string) => {
    if (!confirm(`ต้องการลบ template "${label}" ใช่หรือไม่? ระบบจะกลับไปใช้ไฟล์เริ่มต้นแทนทันที`)) return
    setError(null)
    setResultSuccess(null)
    try {
      const res = await deleteTaxFormTemplateAction(id)
      if (!res.success) throw new Error(res.error)
      setResultSuccess("✓ ลบ template เรียบร้อยแล้ว ระบบจะใช้ไฟล์เริ่มต้นแทน")
      const templatesRes = await getTaxFormTemplatesAction()
      if (templatesRes.success) setTaxTemplates(templatesRes.data || [])
    } catch (err: any) {
      setError("ลบ template ไม่สำเร็จ: " + (err?.message || "เกิดข้อผิดพลาด"))
    }
  }

  // บันทึกปีภาษีที่จะพิมพ์ลงบนแบบฟอร์ม ภ.ง.ด. 90 (ใช้ข้ามทุกปีที่ Admin เลือกดูรายงาน)
  const handleSavePnd90TaxYear = async () => {
    if (!pnd90TaxYearInput.trim()) {
      setError("กรุณาระบุปีภาษี")
      return
    }
    setSavingPnd90Year(true)
    setError(null)
    setResultSuccess(null)
    try {
      const res = await updatePnd90TaxYearAction(pnd90TaxYearInput.trim())
      if (!res.success) throw new Error(res.error)
      setResultSuccess(`✓ บันทึกปีภาษีที่จะพิมพ์บนฟอร์ม ภ.ง.ด. 90 เป็น "${pnd90TaxYearInput.trim()}" เรียบร้อยแล้ว`)
      const templatesRes = await getTaxFormTemplatesAction()
      if (templatesRes.success) setTaxTemplates(templatesRes.data || [])
    } catch (err: any) {
      setError("บันทึกปีภาษีไม่สำเร็จ: " + (err?.message || "เกิดข้อผิดพลาด"))
    } finally {
      setSavingPnd90Year(false)
    }
  }

  // PDF Template ของแบบฟอร์ม ภ.ง.ด. 90 (เดี่ยว ใช้ข้ามทุกปี) / 94 (แยกตามปีภาษี)
  const pnd90Template = taxTemplates.find((t) => t.form_type === "90") || null
  const pnd94Templates = taxTemplates
    .filter((t) => t.form_type === "94")
    .sort((a, b) => (b.tax_year || "").localeCompare(a.tax_year || ""))

  return (
    <>
      <div className="space-y-8 pb-12">
        {/* หัวข้อ */}
        <div className="relative p-8 rounded-3xl overflow-hidden glass-panel border border-teal-500/10 shadow-2xl">
          <div className="absolute top-0 right-0 w-[400px] h-[200px] bg-teal-600/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => router.push("/super-admin")}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer mb-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Super Admin Console
              </button>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-500/10 border border-teal-500/20 text-teal-400 font-bold rounded-full text-xs uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5" /> จัดการ Template ภาษี
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
                แบบฟอร์ม PDF ภ.ง.ด. 90 / 94
              </h1>
              <p className="text-slate-400 text-sm max-w-xl">
                อัปโหลดไฟล์ PDF ต้นแบบที่กรมสรรพากรประกาศใหม่ และตั้งค่าปีภาษีที่จะพิมพ์บนฟอร์ม ภ.ง.ด. 90
              </p>
            </div>

            <button
              onClick={loadData}
              className="px-5 py-3 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-2 shadow-lg shrink-0 self-start md:self-center"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-teal-400" : ""}`} />
              รีเฟรชข้อมูล
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/25 text-red-400 rounded-2xl text-sm md:text-xs flex items-center gap-3 shadow-lg">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-4 bg-teal-500/10 border border-teal-500/25 text-teal-400 rounded-2xl text-sm md:text-xs flex items-center gap-3 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
          {/* กล่องอัปโหลด PDF Template แบบฟอร์ม ภ.ง.ด. 90 */}
          <div className="bg-slate-900/50 backdrop-blur-md rounded-3xl border border-slate-800 p-6 md:p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-100">แบบฟอร์ม PDF: ภ.ง.ด. 90</h3>
                  <p className="text-sm text-slate-400 mt-1">Template เดียวใช้ข้ามทุกปี — ปีภาษีที่พิมพ์บนฟอร์มกำหนดโดย Super Admin ด้านล่าง ใช้ค่าเดียวกันทุกครั้งที่ Admin กด Download จนกว่าจะเปลี่ยน</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="text-sm">
                  {pnd90Template ? (
                    <>
                      <p className="text-slate-200 font-bold">{pnd90Template.file_name || "template.pdf"}</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        อัปเดตล่าสุด: {new Date(pnd90Template.updated_at).toLocaleString("th-TH")}
                      </p>
                    </>
                  ) : (
                    <p className="text-slate-400">ยังไม่ได้อัปโหลด — ระบบใช้ไฟล์เริ่มต้นของระบบอยู่</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <label className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 ${uploadingTaxTemplate === "90" ? "opacity-50 pointer-events-none" : ""}`}>
                    <UploadCloud className="w-4 h-4" />
                    <span>{uploadingTaxTemplate === "90" ? "กำลังอัปโหลด..." : pnd90Template ? "แทนที่ไฟล์" : "อัปโหลดไฟล์"}</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      disabled={uploadingTaxTemplate === "90"}
                      onChange={(e) => {
                        handleTaxTemplateFileSelect("90", e.target.files?.[0], null)
                        e.target.value = ""
                      }}
                    />
                  </label>
                  {pnd90Template && (
                    <>
                      <button
                        type="button"
                        onClick={() => router.push(`/super-admin/tax-templates/${pnd90Template.id}/mapping`)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                      >
                        <Settings className="w-4 h-4" />
                        จัด mapping field
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTaxTemplate(pnd90Template.id, "ภ.ง.ด. 90")}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold rounded-xl border border-rose-500/20 transition-all cursor-pointer shadow-sm active:scale-95"
                      >
                        <Trash2 className="w-4 h-4" />
                        รีเซ็ตเป็นค่าเริ่มต้น
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end gap-3 mt-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-300">ปีภาษีที่จะพิมพ์บนฟอร์ม</label>
                  <input
                    type="text"
                    value={pnd90TaxYearInput}
                    onChange={(e) => setPnd90TaxYearInput(e.target.value)}
                    placeholder="เช่น 2569"
                    disabled={!pnd90Template}
                    className="w-full sm:w-40 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 outline-none transition-all font-mono text-sm disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSavePnd90TaxYear}
                  disabled={!pnd90Template || savingPnd90Year}
                  className={`px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all ${
                    !pnd90Template || savingPnd90Year
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-teal-600 hover:bg-teal-500 text-white active:scale-95"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {savingPnd90Year ? "กำลังบันทึก..." : "บันทึกปีภาษี"}
                </button>
              </div>
              {!pnd90Template && (
                <p className="text-xs text-slate-500 mt-2">* กรุณาอัปโหลดไฟล์ PDF template ด้านบนก่อน จึงจะกำหนดปีภาษีได้</p>
              )}
            </div>
          </div>

          {/* กล่องอัปโหลด PDF Template แบบฟอร์ม ภ.ง.ด. 94 (แยกตามปีภาษี) */}
          <div className="bg-slate-900/50 backdrop-blur-md rounded-3xl border border-slate-800 p-6 md:p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-100">แบบฟอร์ม PDF: ภ.ง.ด. 94</h3>
                  <p className="text-sm text-slate-400 mt-1">ต้องอัปโหลดแยกตามปีภาษี (ปีภาษีถูกพิมพ์ตายตัวอยู่ในตัวฟอร์ม แก้ไขเองไม่ได้)</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-300">ปีภาษี</label>
                  <input
                    type="text"
                    value={pnd94UploadYear}
                    onChange={(e) => setPnd94UploadYear(e.target.value)}
                    placeholder="เช่น 2026"
                    className="w-full sm:w-40 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all font-mono text-sm"
                  />
                </div>
                <label className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-3 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 ${uploadingTaxTemplate === "94" ? "opacity-50 pointer-events-none" : ""}`}>
                  <UploadCloud className="w-4 h-4" />
                  <span>{uploadingTaxTemplate === "94" ? "กำลังอัปโหลด..." : `อัปโหลด PDF สำหรับปี ${pnd94UploadYear || "-"}`}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    disabled={uploadingTaxTemplate === "94"}
                    onChange={(e) => {
                      handleTaxTemplateFileSelect("94", e.target.files?.[0], pnd94UploadYear)
                      e.target.value = ""
                    }}
                  />
                </label>
              </div>

              {pnd94Templates.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-bold">ปีภาษี</th>
                        <th className="px-4 py-2.5 font-bold">ชื่อไฟล์</th>
                        <th className="px-4 py-2.5 font-bold">อัปเดตล่าสุด</th>
                        <th className="px-4 py-2.5 font-bold text-right">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {pnd94Templates.map((t) => (
                        <tr key={t.id}>
                          <td className="px-4 py-2.5 text-slate-200 font-bold">{t.tax_year}</td>
                          <td className="px-4 py-2.5 text-slate-400">{t.file_name || "template.pdf"}</td>
                          <td className="px-4 py-2.5 text-slate-500">{new Date(t.updated_at).toLocaleDateString("th-TH")}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => router.push(`/super-admin/tax-templates/${t.id}/mapping`)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95"
                              >
                                <Settings className="w-3.5 h-3.5" />
                                mapping
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTaxTemplate(t.id, `ภ.ง.ด. 94 ปีภาษี ${t.tax_year}`)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold rounded-lg border border-rose-500/20 transition-all active:scale-95"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-400">ยังไม่มีปีภาษีใดที่อัปโหลด template ไว้ — ปีที่ยังไม่อัปโหลดจะใช้ไฟล์เริ่มต้นของระบบ</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
