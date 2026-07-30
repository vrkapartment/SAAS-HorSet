"use server"

import { createClient } from "@/lib/supabase/server"
import type { PndFieldMapping, PndFieldFormat } from "@/lib/pdfHelper"
import { getCurrentUserProfileAction } from "@/features/auth/actions"
import { getBills } from "@/features/billing/actions"
import { getRooms } from "@/features/room/actions"
import { getTenants, getCancelledContracts } from "@/features/tenant/actions"
import { getExpenses } from "@/features/expenses/actions"
import { getFinanceSettings } from "@/features/finance/actions"
import { buildIncomeRows, buildExpenseRows, toTaxSettings, type HorSetTaxSourceData } from "@/lib/tax/adapter"
import type { PitFiling, Pp30Filing, TaxDataset, DeductionItem, Bucket, IncomeTaxResult } from "@/types/tax"
import {
  calculateFinalTaxDue,
  calculateMinimumTax,
  calculatePersonalDeduction,
  calculateProgressiveTax,
} from "@/lib/thaiTax"

/**
 * ฟังก์ชันจำลองสำหรับการส่งออก/คำนวณข้อมูลยื่นภาษี
 */
export async function exportTaxPlaceholder() {
  try {
    const supabase = await createClient()

    // TODO: พัฒนาระบบคำนวณและสรุปข้อมูลรายได้เพื่อกรอกแบบยื่นภาษีเงินได้บุคคลธรรมดาในอนาคต

    return { success: true, data: "ดาวน์โหลดข้อมูลรายงานภาษีสำเร็จ (ตัวอย่าง)" }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
    return { success: false, error: errorMessage }
  }
}

/**
 * ดึง PDF template ของแบบฟอร์ม ภ.ง.ด. 90/94 ที่ Super Admin อัปโหลดไว้ล่าสุด (ถ้ามี)
 * ภ.ง.ด. 90 ใช้ template เดียวข้ามทุกปี (ไม่สน taxYear), ภ.ง.ด. 94 ผูกกับปีภาษีเฉพาะเจาะจง
 * คืนค่า data: null เมื่อยังไม่มีการอัปโหลด เพื่อให้ผู้เรียก fallback ไปใช้ไฟล์เริ่มต้นของระบบ
 * เอา id มาด้วยเพื่อใช้ query mapping field ต่อ (getTaxFormFieldMappingsAction) — ดูระบบ Visual Field Mapping ใน pdfHelper.ts
 */
export async function getActiveTaxFormTemplateAction(formType: "90" | "94", taxYear: string) {
  try {
    const supabase = await createClient()

    let query = supabase
      .from("tax_form_templates")
      .select("id, file_url, file_name, tax_year")
      .eq("form_type", formType)

    if (formType === "94") {
      query = query.eq("tax_year", taxYear)
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle()

    if (error) throw error

    return { success: true, data: data || null }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลด PDF template"
    return { success: false, error: errorMessage, data: null }
  }
}

/**
 * ดึง mapping "field ทางกายภาพ <-> ความหมายเชิงตรรกะ" ของ template หนึ่งไฟล์ (ดูตาราง tax_form_field_mappings)
 * คืนค่าเป็นรูปแบบเดียวกับ PndFieldMapping[] ของ pdfHelper.ts พร้อมส่งให้ generatePndPdf() ใช้ได้เลย
 * data: [] เมื่อยังไม่มีการ map (เช่น template เพิ่งอัปโหลดยังไม่ได้ตั้งค่า) — ผู้เรียกจะ fallback ไปใช้ DEFAULT_PND90/94_MAPPING เอง
 */
export async function getTaxFormFieldMappingsAction(templateId: string) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("tax_form_field_mappings")
      .select("logical_key, field_kind, physical_field_name, option_key, widget_index, value_format")
      .eq("template_id", templateId)
      .is("deleted_at", null)

    if (error) throw error

    const mappings: PndFieldMapping[] = (data || []).map((row) => ({
      logicalKey: row.logical_key,
      fieldKind: row.field_kind as "text" | "radio",
      physicalFieldName: row.physical_field_name,
      optionKey: row.option_key ?? undefined,
      widgetIndex: row.widget_index ?? undefined,
      valueFormat: (row.value_format as PndFieldFormat) ?? undefined,
    }))

    return { success: true, data: mappings }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลด field mapping"
    return { success: false, error: errorMessage, data: [] as PndFieldMapping[] }
  }
}

// ============================================================================
// ฟีเจอร์ VAT + ภ.พ.30 + ส่วนขยาย ภ.ง.ด.90/94 — ดู src/features/tax/components, src/lib/tax
// ============================================================================

/**
 * ตรวจสอบว่าผู้ใช้ปัจจุบันมีสิทธิ์ (admin/staff/super_admin) และ workspaceId ที่ขอตรงกับของตัวเอง
 * (ยกเว้น super_admin) — ใช้ร่วมกันทุก action ในไฟล์นี้ที่แตะข้อมูลภาษีของ workspace หนึ่งๆ
 */
async function assertTaxAccess(workspaceId: string) {
  const profileRes = await getCurrentUserProfileAction()
  if (!profileRes.success || !profileRes.data) {
    return { ok: false as const, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" }
  }
  const { role, workspace_id } = profileRes.data
  const isSameWorkspace = workspace_id === workspaceId || role === "super_admin"
  if (!["admin", "staff", "super_admin"].includes(role) || !isSameWorkspace) {
    return { ok: false as const, error: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลภาษีของหอพักนี้" }
  }
  return { ok: true as const }
}

/**
 * ประกอบ TaxDataset เต็มชุดสำหรับ workspace หนึ่ง ณ ปีภาษีที่เลือก — ใช้กับฟีเจอร์ VAT/ภ.พ.30 เท่านั้น
 *
 * ⚠️ ดึงข้อมูลย้อนหลัง "2 ปี" (ปีที่เลือก + ปีก่อนหน้า) เสมอ ไม่กรองเฉพาะปีที่เลือก เพราะเกณฑ์ VAT
 *    เป็น rolling 12 เดือนที่อาจข้ามปี — ถ้ากรองปีตั้งแต่ชั้นนี้ ยอด 40(8) ของเดือน ม.ค. จะขาดข้อมูล
 *    ธ.ค. ปีก่อนไป (ดู lib/tax/vat.ts)
 */
export async function loadTaxDataset(workspaceId: string, year: number) {
  const access = await assertTaxAccess(workspaceId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    const prevYear = String(year - 1)
    const thisYear = String(year)

    const [
      billsThisYearRes,
      billsPrevYearRes,
      roomsRes,
      tenantsRes,
      cancelledRes,
      expensesThisYearRes,
      expensesPrevYearRes,
      financeRes,
      pp30FilingsRes,
      deductionsRes,
      pitFilingsRes,
    ] = await Promise.all([
      getBills(undefined, thisYear),
      getBills(undefined, prevYear),
      getRooms(workspaceId),
      getTenants(),
      getCancelledContracts(workspaceId),
      getExpenses(thisYear, workspaceId),
      getExpenses(prevYear, workspaceId),
      getFinanceSettings(workspaceId),
      getPp30Filings(workspaceId),
      getTaxDeductions(workspaceId, year),
      getPitFilings(workspaceId),
    ])

    if (!financeRes.success || !financeRes.data) {
      return { success: false, error: "ไม่สามารถดึงข้อมูลตั้งค่าการเงินได้" }
    }
    const settings = financeRes.data

    const bills = [
      ...(billsThisYearRes.success && billsThisYearRes.data ? billsThisYearRes.data : []),
      ...(billsPrevYearRes.success && billsPrevYearRes.data ? billsPrevYearRes.data : []),
    ]
    const rooms = roomsRes.success && roomsRes.data ? roomsRes.data : []
    const tenants = tenantsRes.success && tenantsRes.data ? tenantsRes.data : []
    const cancelledContracts = cancelledRes.success && cancelledRes.data ? cancelledRes.data : []
    const expenses = [
      ...(expensesThisYearRes.success && expensesThisYearRes.data ? expensesThisYearRes.data : []),
      ...(expensesPrevYearRes.success && expensesPrevYearRes.data ? expensesPrevYearRes.data : []),
    ]

    // ⚠️ bills.amount ในระบบรวม VAT ไว้แล้วตั้งแต่ตอนออกบิล (ดู resolveVatCharging ใน billing/actions.ts)
    // ต้องหัก vatAmount ออกก่อนส่งเข้า adapter เพราะ billToIncomeRows() คาดหวัง amount ที่ "ไม่รวม VAT"
    // แล้วเอา vat แนบแยกต่างหาก — ไม่งั้น VAT จะถูกนับซ้ำเป็นฐานรายได้ 40(8) เพิ่มขึ้นมาอีกก้อน
    const horsetBills = bills.map((b) => ({
      roomNumber: b.roomNumber,
      amount: Number(b.amount) - Number(b.vatAmount || 0),
      status: b.status,
      billingCycle: b.billingCycle,
      electricUnits: Number(b.electricUnits),
      waterUnits: Number(b.waterUnits),
      otherServiceAmount: Number(b.otherServiceAmount || 0),
      invoiceId: b.invoiceId,
      vatAmount: Number(b.vatAmount || 0),
    }))

    const horsetRooms = rooms.map((r) => ({
      roomNumber: r.roomNumber,
      baseRent: Number(r.baseRent || 0),
    }))

    const horsetTenants = tenants.map((t) => ({
      roomNumber: t.roomNumber,
      contractStart: t.contractStart || null,
    }))

    const horsetCancelled = cancelledContracts.map((c) => ({
      roomNumber: c.roomNumber,
      cancellationDate: c.cancellationDate,
      deductedRent405: Number(c.deductedRent405 || 0),
      deductedUtilities408: Number(c.deductedUtilities408 || 0),
      deductedServices408: Number(c.deductedServices408 || 0),
      forfeitedAmount: Number(c.forfeitedAmount || 0),
    }))

    const horsetExpenses = expenses.map((e) => ({
      category: (e.category === "40_5" || e.category === "40_8" ? e.category : null) as "40_5" | "40_8" | null,
      amount: Number(e.amount || 0),
      created_at: e.created_at,
      vat_amount: Number(e.vat_amount || 0),
      claim_input_vat: e.claim_input_vat !== false,
    }))

    const horsetSettings = {
      taxpayerStatus: (settings.taxpayer_status || "individual") as "individual" | "partnership",
      partnerCount: Number(settings.partner_count || 1),
      electricRate: Number(settings.electric_rate || 0),
      waterRate: Number(settings.water_rate || 0),
      commonFee: Number(settings.common_fee || 0),
      advanceRentMonths: Number(settings.advance_rent || 0),
      vatRegistered: Boolean(settings.vat_registered),
      vatRegisteredFrom: settings.vat_registered_from || null,
      vatRate: Number(settings.vat_rate ?? 0.07),
      vatThreshold: Number(settings.vat_threshold ?? 1800000),
      vatOpeningCredit: Number(settings.vat_opening_credit ?? 0),
      expenseAMode: (settings.expense_a_mode || "lump") as "lump" | "actual",
      expenseALumpRate: Number(settings.expense_a_lump_rate ?? 0.3),
      expenseBMode: (settings.expense_b_mode || "lump") as "lump" | "actual",
      expenseBLumpRate: Number(settings.expense_b_lump_rate ?? 0.6),
      capExpensePerBucket: Boolean(settings.cap_expense_per_bucket),
      minTaxEnabled: settings.min_tax_enabled !== false,
      minTaxRate: Number(settings.min_tax_rate ?? 0.005),
      minTaxThresholdPnd90: Number(settings.min_tax_threshold_pnd90 ?? 120000),
      minTaxThresholdPnd94: Number(settings.min_tax_threshold_pnd94 ?? 60000),
      minTaxExemptBelow: Number(settings.min_tax_exempt_below ?? 5000),
    }

    const sourceData: HorSetTaxSourceData = {
      bills: horsetBills,
      rooms: horsetRooms,
      tenants: horsetTenants,
      cancelledContracts: horsetCancelled,
      expenses: horsetExpenses,
      settings: horsetSettings,
    }

    const incomes = buildIncomeRows(sourceData)
    const expenseRows = buildExpenseRows(sourceData)
    const actualExpenseA = expenseRows.filter((e) => e.bucket === "A").reduce((sum, e) => sum + e.base, 0)
    const actualExpenseB = expenseRows.filter((e) => e.bucket === "B").reduce((sum, e) => sum + e.base, 0)
    const taxSettings = toTaxSettings(horsetSettings, actualExpenseA, actualExpenseB)

    const pp30Filings: Pp30Filing[] = pp30FilingsRes.success && pp30FilingsRes.data ? pp30FilingsRes.data : []
    const deductions: DeductionItem[] = deductionsRes.success && deductionsRes.data ? deductionsRes.data : []
    const pitFilings: PitFiling[] = pitFilingsRes.success && pitFilingsRes.data ? pitFilingsRes.data : []

    const dataset: TaxDataset = {
      incomes,
      expenses: expenseRows,
      settings: taxSettings,
      deductions,
      pp30Filings,
      pitFilings,
    }

    return { success: true, data: dataset }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการโหลดข้อมูลภาษี"
    return { success: false, error: errorMessage }
  }
}

// ----------------------------------------------------------------------------
// ภ.พ.30 filings — เก็บเฉพาะ "สิ่งที่ผู้ใช้ป้อน" ห้ามเก็บ credit_brought/net/carry_forward
// (ต้องคำนวณสดด้วย buildPP30Series() เสมอ — ดู lib/tax/pp30.ts)
// ----------------------------------------------------------------------------

export async function getPp30Filings(workspaceId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("pp30_filings")
      .select("period, input_vat_manual, filed_at, paid_amount, note")
      .eq("workspace_id", workspaceId)
      .order("period", { ascending: false })

    if (error) throw error

    const formatted: Pp30Filing[] = (data || []).map((f) => ({
      period: String(f.period).slice(0, 7),
      inputVatManual: f.input_vat_manual === null || f.input_vat_manual === undefined ? null : Number(f.input_vat_manual),
      filedAt: f.filed_at,
      note: f.note || "",
      paidAmount: f.paid_amount === null || f.paid_amount === undefined ? null : Number(f.paid_amount),
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลการยื่น ภ.พ.30"
    return { success: false, error: errorMessage, data: [] as Pp30Filing[] }
  }
}

/**
 * บันทึก/แก้ไขการยื่น ภ.พ.30 ของเดือนหนึ่ง — upsert ตาม (workspace_id, period)
 * period เป็นรูปแบบ "YYYY-MM" — แปลงเป็นวันที่ 1 ของเดือนก่อนบันทึกลง DB
 */
export async function upsertPp30Filing(
  workspaceId: string,
  period: string,
  patch: { inputVatManual?: number | null; filedAt?: string | null; paidAmount?: number | null; note?: string }
) {
  const access = await assertTaxAccess(workspaceId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("pp30_filings")
      .upsert(
        {
          workspace_id: workspaceId,
          period: `${period}-01`,
          input_vat_manual: patch.inputVatManual ?? null,
          filed_at: patch.filedAt ?? null,
          paid_amount: patch.paidAmount ?? null,
          note: patch.note ?? null,
        },
        { onConflict: "workspace_id,period" }
      )

    if (error) throw error
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกการยื่น ภ.พ.30"
    return { success: false, error: errorMessage }
  }
}

// ----------------------------------------------------------------------------
// ค่าลดหย่อนอื่น (นอกเหนือค่าลดหย่อนส่วนตัว) — แยกช่องครึ่งปี/สิ้นปี
// ----------------------------------------------------------------------------

export async function getTaxDeductions(workspaceId: string, taxYear: number) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("tax_deductions")
      .select("id, name, amount_pnd94, amount_pnd90, note, sort_order")
      .eq("workspace_id", workspaceId)
      .eq("tax_year", taxYear)
      .order("sort_order", { ascending: true })

    if (error) throw error

    const formatted: DeductionItem[] = (data || []).map((d) => ({
      id: d.id,
      name: d.name,
      amountPND94: Number(d.amount_pnd94 || 0),
      amountPND90: Number(d.amount_pnd90 || 0),
      note: d.note || undefined,
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงค่าลดหย่อนอื่น"
    return { success: false, error: errorMessage, data: [] as DeductionItem[] }
  }
}

export async function upsertTaxDeduction(
  workspaceId: string,
  taxYear: number,
  deduction: { id?: string; name: string; amountPND94: number; amountPND90: number; note?: string; sortOrder?: number }
) {
  const access = await assertTaxAccess(workspaceId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    const supabase = await createClient()
    const payload = {
      workspace_id: workspaceId,
      tax_year: taxYear,
      name: deduction.name,
      amount_pnd94: deduction.amountPND94,
      amount_pnd90: deduction.amountPND90,
      note: deduction.note || null,
      sort_order: deduction.sortOrder ?? 0,
    }

    if (deduction.id) {
      const { error } = await supabase.from("tax_deductions").update(payload).eq("id", deduction.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from("tax_deductions").insert([payload])
      if (error) throw error
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกค่าลดหย่อนอื่น"
    return { success: false, error: errorMessage }
  }
}

export async function deleteTaxDeduction(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from("tax_deductions").delete().eq("id", id)
    if (error) throw error
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบค่าลดหย่อนอื่น"
    return { success: false, error: errorMessage }
  }
}

// ----------------------------------------------------------------------------
// การยื่นแบบ ภ.ง.ด.90/94 + snapshot — settings แก้ได้อิสระเสมอ ไม่ล็อกหน้าจอ
// รายงานของปีที่ยื่นแล้วอ่านจาก snapshot นี้เสมอแทนคำนวณสด (ตาม README แนะนำ — ดู
// database_patch_add_vat_pp30.sql หัวข้อ 5)
// ----------------------------------------------------------------------------

export async function getPitFilings(workspaceId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("pit_filings")
      .select("id, tax_year, form, filed_at, tax_paid, withholding_tax, note")
      .eq("workspace_id", workspaceId)
      .order("tax_year", { ascending: false })

    if (error) throw error

    const formatted: PitFiling[] = (data || []).map((f) => ({
      id: f.id,
      year: Number(f.tax_year),
      form: f.form === "94" ? "PND94" : "PND90",
      taxPaid: f.tax_paid === null || f.tax_paid === undefined ? null : Number(f.tax_paid),
      withholdingTax: f.withholding_tax === null || f.withholding_tax === undefined ? null : Number(f.withholding_tax),
      filedAt: f.filed_at,
      note: f.note || undefined,
    }))

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลการยื่น ภ.ง.ด."
    return { success: false, error: errorMessage, data: [] as PitFiling[] }
  }
}

/**
 * บันทึกว่ายื่นแบบ ภ.ง.ด.90/94 ของปีนี้แล้ว พร้อม snapshot ตัวเลขที่คำนวณจริง ณ ตอนกดยื่น
 *
 * ⚠️ snapshot ต้องคำนวณจาก src/lib/thaiTax.ts (engine ที่ใช้ยื่นจริง) โดยหน้า tax/page.tsx เป็นคนประกอบ
 * ก้อนนี้ส่งมาให้ (ตัวเลขเดียวกับที่ผู้ใช้เห็นบนจอ/ใน PDF ตอนกดยื่น) — action นี้แค่บันทึกเก็บไว้
 * เพื่อให้รายงานของปีนี้ในอนาคตอ่านจาก snapshot แทนคำนวณสด ถ้ามีการแก้ settings ภายหลัง
 */
export async function filePitReturn(
  workspaceId: string,
  year: number,
  form: "90" | "94",
  snapshot: IncomeTaxResult,
  extra?: { taxPaid?: number | null; withholdingTax?: number | null; note?: string }
) {
  const access = await assertTaxAccess(workspaceId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    const supabase = await createClient()
    const { error } = await supabase.from("pit_filings").upsert(
      {
        workspace_id: workspaceId,
        tax_year: year,
        form,
        filed_at: new Date().toISOString().slice(0, 10),
        tax_paid: extra?.taxPaid ?? null,
        withholding_tax: extra?.withholdingTax ?? null,
        note: extra?.note ?? null,
        snapshot,
      },
      { onConflict: "workspace_id,tax_year,form" }
    )

    if (error) throw error
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกการยื่นแบบ"
    return { success: false, error: errorMessage }
  }
}

/**
 * ดึง snapshot ของปี/แบบที่ยื่นไปแล้ว — คืน null ถ้ายังไม่เคยยื่น (หน้า UI จะคำนวณสดแทน)
 */
export async function getPitFilingSnapshot(workspaceId: string, year: number, form: "90" | "94") {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("pit_filings")
      .select("snapshot, filed_at, tax_paid, withholding_tax, note")
      .eq("workspace_id", workspaceId)
      .eq("tax_year", year)
      .eq("form", form)
      .maybeSingle()

    if (error) throw error
    if (!data) return { success: true, data: null }

    return {
      success: true,
      data: {
        snapshot: data.snapshot,
        filedAt: data.filed_at,
        taxPaid: data.tax_paid === null || data.tax_paid === undefined ? null : Number(data.tax_paid),
        withholdingTax: data.withholding_tax === null || data.withholding_tax === undefined ? null : Number(data.withholding_tax),
        note: data.note || undefined,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลการยื่นแบบ"
    return { success: false, error: errorMessage, data: null }
  }
}

/**
 * คำนวณผลภาษีเงินได้เต็มชุด (สำหรับ PitBreakdown) จาก src/lib/thaiTax.ts เท่านั้น — ห้ามใช้ lib/tax/pit.ts
 * (computeIncomeTax) แทน เพื่อให้ตัวเลขบนจอตรงกับ PDF ที่ดาวน์โหลดเป๊ะ — ดูหมายเหตุหัวไฟล์ PitBreakdown.tsx
 *
 * รับ income/expense ที่ประกอบมาแล้วจากหน้า tax/page.tsx (ใช้สูตรเดิมของหน้านั้นทุกจุด ไม่เปลี่ยน)
 * แล้วคืนค่าโครงสร้างแบบ IncomeTaxResult ให้ตรงกับ prop ที่ PitBreakdown ต้องการ
 */
export async function computePitBreakdownFromThaiTax(input: {
  form: "PND90" | "PND94"
  incomeA: number
  /** ค่าน้ำไฟ/บริการส่วนกลาง 40(8) — ฐานที่มีสิทธิหักเหมา/ตามจริงตาม expenseB */
  incomeB: number
  /** รายได้อื่น 40(8) (ค่าปรับ/ริบเงินประกัน) — ไม่มีสิทธิหักเหมาเลยตามกฎหมาย บวกเข้าไปเต็มจำนวนหลังหักค่าใช้จ่ายของ B แล้ว
   *  (ตรงกับ computePnd90Values/computePnd94Values เดิมที่ other408 ไม่ถูกหักอะไรเลย) */
  incomeOther?: number
  expenseA: { mode: "lump" | "actual"; lumpRate: number; actualAmount?: number }
  expenseB: { mode: "lump" | "actual"; lumpRate: number; actualAmount?: number }
  taxpayerType: "individual" | "partnership"
  partnerCount: number
  otherDeductions: number
  withholdingTax?: number
  pnd94Paid?: number
}): Promise<IncomeTaxResult> {
  const clamp0 = (n: number) => (n > 0 ? n : 0)
  const r2 = (n: number) => Math.round(n * 100) / 100

  const incomeA = clamp0(input.incomeA)
  const incomeBBase = clamp0(input.incomeB)
  const incomeOther = clamp0(input.incomeOther || 0)
  const grossAssessable = r2(incomeA + incomeBBase + incomeOther)

  const dedFor = (income: number, cfg: { mode: "lump" | "actual"; lumpRate: number; actualAmount?: number }) => {
    const requested = cfg.mode === "actual" ? clamp0(cfg.actualAmount || 0) : r2(income * cfg.lumpRate)
    const exceedsIncome = requested > income
    // เหมาเสมอถูกจำกัดไม่เกินรายได้ — โหมดจริง ปล่อยให้หักได้เต็มจำนวน (ตรงกับ thaiTax.ts/pdfHelper.ts เดิม)
    const deduction = cfg.mode === "lump" ? r2(Math.min(requested, income)) : requested
    return { mode: cfg.mode, rate: cfg.mode === "lump" ? cfg.lumpRate : null, requested, deduction, capped: cfg.mode === "lump" && exceedsIncome, exceedsIncome, income, afterExpense: r2(income - deduction) }
  }

  const dedA = dedFor(incomeA, input.expenseA)
  const dedBUtil = dedFor(incomeBBase, input.expenseB)
  // รวมรายได้ "อื่น" (ไม่มีสิทธิหักเหมา) เข้ากับตะกร้า B เพื่อแสดงผลรวม — afterExpense ของส่วนนี้ไม่ถูกหักเลย
  const dedB = {
    ...dedBUtil,
    income: r2(dedBUtil.income + incomeOther),
    afterExpense: r2(dedBUtil.afterExpense + incomeOther),
  }
  const afterExpense = r2(dedA.afterExpense + dedB.afterExpense)

  const personalAllowance = calculatePersonalDeduction(
    input.form === "PND94" ? "94" : "90",
    input.taxpayerType === "partnership" ? "partnership" : "individual",
    input.partnerCount
  )
  const otherDeductions = clamp0(input.otherDeductions)
  const deductionsRequested = r2(personalAllowance + otherDeductions)
  const deductionsApplied = r2(clamp0(Math.min(deductionsRequested, afterExpense)))
  const netIncome = r2(clamp0(afterExpense - deductionsApplied))

  const progressiveTax = calculateProgressiveTax(netIncome)
  const minTaxAmount = calculateMinimumTax(grossAssessable)
  const taxBeforeCredits = calculateFinalTaxDue(progressiveTax, minTaxAmount)

  const withholdingTax = clamp0(input.withholdingTax || 0)
  const pnd94Paid = input.form === "PND90" ? clamp0(input.pnd94Paid || 0) : 0
  const creditsTotal = r2(withholdingTax + pnd94Paid)
  const balance = r2(taxBeforeCredits - creditsTotal)

  // ขั้นบันไดแบบละเอียด (เพื่อแสดงใน ProgressiveBracketTable) — ใช้ bracket มาตรฐานเดียวกับ thaiTax.ts
  // (ตัวเลขคงที่ตามกฎหมาย ไม่ใช่ settings ที่ปรับได้ จึงไม่มีทางต่างจาก calculateProgressiveTax ข้างต้น)
  const brackets = [
    { upTo: 150_000, rate: 0 },
    { upTo: 300_000, rate: 0.05 },
    { upTo: 500_000, rate: 0.10 },
    { upTo: 750_000, rate: 0.15 },
    { upTo: 1_000_000, rate: 0.20 },
    { upTo: 2_000_000, rate: 0.25 },
    { upTo: 5_000_000, rate: 0.30 },
    { upTo: Infinity, rate: 0.35 },
  ]
  let lower = 0
  const steps: Array<{ from: number; to: number; rate: number; amount: number; tax: number }> = []
  for (const b of brackets) {
    if (netIncome <= lower) break
    const slice = Math.min(netIncome, b.upTo) - lower
    const stepTax = r2(slice * b.rate)
    steps.push({ from: lower, to: b.upTo, rate: b.rate, amount: r2(slice), tax: stepTax })
    lower = b.upTo
  }

  const minThreshold = input.form === "PND94" ? 60_000 : 120_000
  const minApplies = grossAssessable >= minThreshold && minTaxAmount > 5_000 && minTaxAmount > progressiveTax

  return {
    form: input.form,
    taxpayerType: input.taxpayerType,
    income: { a: incomeA, b: r2(incomeBBase + incomeOther), gross: grossAssessable },
    expense: { a: dedA, b: dedB, total: r2(dedA.deduction + dedB.deduction) },
    crossBucketDeduction: {
      triggered: dedA.exceedsIncome || dedB.exceedsIncome,
      buckets: ([dedA.exceedsIncome && "A", dedB.exceedsIncome && "B"] as const).filter((b): b is Bucket => b !== false),
      capExpensePerBucket: false,
    },
    afterExpense,
    deductions: { personalAllowance, other: otherDeductions, requested: deductionsRequested, applied: deductionsApplied, capped: deductionsRequested > afterExpense },
    netIncome,
    progressive: { netIncome, tax: progressiveTax, steps },
    minTax: { enabled: true, rate: 0.005, threshold: minThreshold, amount: minTaxAmount, applies: minApplies, exempted: minTaxAmount > 0 && minTaxAmount <= 5_000 },
    taxBeforeCredits,
    credits: { withholdingTax, pnd94Paid, total: creditsTotal },
    balance,
    payable: clamp0(balance),
    refundable: clamp0(-balance),
    status: balance > 0 ? "pay" : balance < 0 ? "refund" : "zero",
  }
}
