'use client';

/**
 * ฟีเจอร์ 3: ภ.พ.30 — ตารางรายเดือน
 *
 * สูตร: ภาษีขาย − ภาษีซื้อ − เครดิตยกมา
 *   ผลบวก → ต้องโอนจ่ายสรรพากร
 *   ผลลบ  → ยกไปเครดิตเดือนถัดไป / ขอคืน
 *
 * ทั้งหน้านี้ต้องซ่อนเมื่อยังไม่จด VAT — ครอบด้วย <VatGate> ที่ระดับ page/route
 * ถ้า props.rows ว่างเพราะยังไม่จด ตัว component จะแสดง empty state ที่บอกวิธีเปิดใช้
 *
 * ⚠️ ดีไซน์ตั้งใจให้ตรงกับ "ตารางแสดงรายรับรายเดือน" (แบบไม่มี VAT) ใน tax/page.tsx — glass-card
 *    rounded-3xl, หัวข้อไอคอน+ชื่อ+คำอธิบายแบบเดียวกัน, ตารางสีต่อคอลัมน์ + แถวสรุปไล่เฉดท้ายตาราง
 *    เพราะหน้า /tax สลับแสดงตารางนี้ "แทนที่" ตารางแบบไม่มี VAT ทันทีที่จดทะเบียน VAT แล้ว
 *    (ดูจุดที่เรียกใน tax/page.tsx — ครอบด้วย VatGate/VatNotRegisteredOnly คนละอัน ตำแหน่งเดียวกัน)
 *
 * ⚠️ i18n: รับ prop `t` (จาก useLanguage() ของหน้าที่เรียก) แทนการ hardcode ข้อความภาษาไทยไว้ตรงๆ
 *    คีย์ทั้งหมดอยู่ใต้ namespace "tax_page" ร่วมกับข้อความอื่นของหน้า /tax
 */

import { Receipt } from 'lucide-react';
import type { Pp30Row, VatStatus } from '../../../types/tax';
import type { Pp30YearTotals } from '../../../lib/tax';
import { RD_EFILING_URL, pp30DueDate } from '../../../lib/tax';
import { baht, thaiDate, thaiMonth } from '../../../lib/tax/format';
import { Alert, Badge, Card, CardBody, CardHeader, HelpNote, StatTile } from './primitives';

export interface Pp30ReportProps {
  year: number;
  rows: Pp30Row[];
  totals: Pp30YearTotals;
  /** false = ยังไม่จด VAT */
  enabled: boolean;
  vat?: VatStatus;
  /** เปิดฟอร์มกรอกภาษีขาย/ภาษีซื้อของเดือนนั้น (แก้ตัวเลข ไม่ทำเครื่องหมายว่ายื่น) */
  onOpenFiling?: (row: Pp30Row) => void;
  /** ทำเครื่องหมายว่ายื่นแล้ว (ตั้ง filedAt เป็นวันนี้) — คนละปุ่มกับ onOpenFiling โดยตั้งใจ */
  onMarkFiled?: (row: Pp30Row) => void;
  /** ส่งออก CSV — ใช้ downloadCsv() จาก lib/tax/format */
  onExportCsv?: () => void;
  /** ดาวน์โหลด PDF แบบ ภ.พ.30 ของเดือนนั้น (generatePp30Pdf() ใน pdfHelper.ts) */
  onExportPdf?: (row: Pp30Row) => void;
  onGoToSettings?: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** ใช้ format เดือน/วันที่/ปีให้ตรงภาษา — ไม่ระบุ = ไทย (พ.ศ.) เหมือนเดิม */
  locale?: 'th' | 'en';
}

export function Pp30Report({
  year,
  rows,
  totals,
  enabled,
  vat,
  onOpenFiling,
  onMarkFiled,
  onExportCsv,
  onExportPdf,
  onGoToSettings,
  t,
  locale = 'th',
}: Pp30ReportProps) {
  if (!enabled) {
    return (
      <Card>
        <CardHeader title={t('tax_page.pp30_report_title_short')} subtitle={t('tax_page.pp30_report_formula_subtitle')} />
        <CardBody>
          <Alert
            tone={vat?.exceeded ? 'danger' : 'info'}
            title={
              vat?.exceeded
                ? t('tax_page.vat_must_register_title')
                : t('tax_page.pp30_not_registered_title')
            }
            actions={
              onGoToSettings && (
                <button type="button" onClick={onGoToSettings} className={btnCls}>
                  {t('tax_page.pp30_goto_settings')}
                </button>
              )
            }
          >
            {vat?.exceeded ? (
              <div>
                {t('tax_page.pp30_not_reg_exceeded_body', {
                  rolling12: baht(vat.rolling12),
                  threshold: baht(vat.threshold, 0),
                })}
              </div>
            ) : (
              <div>
                {vat
                  ? t('tax_page.pp30_not_reg_body_prefix', { rolling12: baht(vat.rolling12), threshold: baht(vat.threshold, 0) })
                  : ''}
                {t('tax_page.pp30_not_reg_body_suffix')}
              </div>
            )}
            <HelpNote>{t('tax_page.pp30_not_reg_help')}</HelpNote>
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="glass-card rounded-3xl border border-slate-200/80 dark:border-slate-900/60 p-6 md:p-8 space-y-6 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-900/40">
        <div className="flex items-center gap-2.5">
          <Receipt className="w-5 h-5 text-blue-500" />
          <div>
            <h3 className="text-base font-bold text-slate-850 dark:text-slate-50">
              {t('tax_page.pp30_report_main_title', { year: locale === 'en' ? year : year + 543 })}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {t('tax_page.pp30_report_formula_line')}
            </p>
          </div>
        </div>
        {rows.length > 0 && onExportCsv && (
          <button type="button" onClick={onExportCsv} className={exportBtnCls}>
            {t('tax_page.pp30_export_csv_btn')}
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t('tax_page.pp30_total_output_vat_label')}
          value={totals.outputVat}
          accent="bucketB"
          note={t('tax_page.pp30_total_output_vat_note')}
        />
        <StatTile
          label={t('tax_page.pp30_total_input_vat_label')}
          value={totals.inputVat}
          accent="info"
          note={t('tax_page.pp30_total_input_vat_note')}
        />
        <StatTile
          label={t('tax_page.pp30_total_payable_label')}
          value={totals.payable}
          accent="pay"
          valueTone="pay"
          note={t('tax_page.pp30_months_to_pay', { count: totals.monthsToPay })}
        />
        <StatTile
          label={t('tax_page.pp30_closing_credit_label')}
          value={totals.closingCredit}
          accent="ok"
          valueTone="refund"
          note={totals.closingCredit > 0 ? t('tax_page.pp30_credit_carry_forward') : t('tax_page.pp30_no_credit')}
        />
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-slate-50/40 dark:bg-slate-900/10 border border-dashed border-slate-200 dark:border-slate-800/80 text-slate-500 text-xs space-y-3 shadow-inner">
          <Receipt className="w-10 h-10 text-slate-400/80 dark:text-slate-700 mx-auto" />
          <p className="font-semibold text-slate-755 dark:text-slate-300">{t('tax_page.pp30_empty_title')}</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {t('tax_page.pp30_empty_desc')}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm bg-white dark:bg-slate-950/20">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm sm:text-base border-collapse">
              <thead>
                <tr className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 font-extrabold text-xs sm:text-sm uppercase tracking-wider border-b-2 border-slate-250 dark:border-slate-800 shadow-sm">
                  <th className="py-4 px-4 pl-5">{t('tax_page.pp30_col_tax_month')}</th>
                  <th className="py-4 px-4 text-right">{t('tax_page.pp30_col_service_base')}</th>
                  <th className="py-4 px-4 text-right text-blue-700 dark:text-blue-350">{t('tax_page.monthly_col_output_vat')}</th>
                  <th className="py-4 px-4 text-right text-teal-700 dark:text-teal-350">{t('tax_page.monthly_col_input_vat')}</th>
                  <th className="py-4 px-4 text-right">{t('tax_page.pp30_col_credit_brought')}</th>
                  <th className="py-4 px-4 text-right text-indigo-700 dark:text-indigo-350">{t('tax_page.pp30_col_result')}</th>
                  <th className="py-4 px-4 text-center">{t('tax_page.pp30_col_status')}</th>
                  <th className="py-4 px-4 text-center">{t('tax_page.pp30_col_due_date')}</th>
                  <th className="py-4 px-4 pr-5 text-right">{t('tax_page.pp30_col_filing')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 bg-white dark:bg-transparent">
                {rows.map((r, idx) => {
                  const due = pp30DueDate(r.period);
                  const isEven = idx % 2 === 0;
                  return (
                    <tr
                      key={r.period}
                      className={`${isEven ? "bg-slate-50/[0.35] dark:bg-slate-900/[0.15]" : "bg-white dark:bg-transparent"} hover:bg-blue-500/[0.05] dark:hover:bg-blue-500/[0.09] transition-all duration-150 border-b border-slate-100 dark:border-slate-800/60`}
                    >
                      <td className="py-3.5 px-4 pl-5 font-extrabold text-slate-900 dark:text-slate-100">
                        {thaiMonth(r.period, true, locale)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-900 dark:text-slate-100 font-mono font-semibold">
                        {baht(r.serviceBase)} {t('tax_page.baht')}
                      </td>
                      <td className="py-3.5 px-4 text-right text-blue-600 dark:text-blue-400 font-mono font-semibold">
                        <span
                          title={
                            r.outputVatManual != null
                              ? t('tax_page.pp30_manual_output_tooltip', { amount: baht(r.outputVatFromLedger) })
                              : t('tax_page.pp30_auto_output_tooltip')
                          }
                        >
                          {baht(r.outputVat)} {t('tax_page.baht')}
                          {r.outputVatManual != null && (
                            <span className="ml-1 text-[10px] text-slate-400">✎</span>
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-teal-600 dark:text-teal-400 font-mono font-semibold">
                        <span
                          title={
                            r.inputVatManual != null
                              ? t('tax_page.pp30_manual_input_tooltip', { amount: baht(r.inputVatFromLedger) })
                              : t('tax_page.pp30_auto_input_tooltip')
                          }
                        >
                          {baht(r.inputVat)} {t('tax_page.baht')}
                          {r.inputVatManual != null && (
                            <span className="ml-1 text-[10px] text-slate-400">✎</span>
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-500 dark:text-slate-400 font-mono">
                        {r.creditBrought > 0 ? `${baht(r.creditBrought)} ${t('tax_page.baht')}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold font-mono bg-blue-500/[0.01] dark:bg-blue-500/[0.03]">
                        {r.payable > 0 ? (
                          <span className="text-red-600 dark:text-red-400">{baht(r.payable)} {t('tax_page.baht')}</span>
                        ) : r.carryForward > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">({baht(r.carryForward)} {t('tax_page.baht')})</span>
                        ) : (
                          <span className="text-slate-400">0.00 {t('tax_page.baht')}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {r.payable > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-red-500/[0.08] dark:bg-red-500/[0.12] text-red-700 dark:text-red-400 border border-red-500/20 shadow-sm">
                            {t('tax_page.pp30_status_must_pay')}
                          </span>
                        ) : r.carryForward > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
                            {t('tax_page.pp30_status_credit')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm">
                            {t('tax_page.pp30_status_zero')}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center text-slate-550 dark:text-slate-400 text-xs sm:text-sm">
                        {thaiDate(due.paper, locale)}
                        <span className="block text-[10px]">{t('tax_page.pp30_due_online', { date: thaiDate(due.online, locale) })}</span>
                      </td>
                      <td className="py-3.5 px-4 pr-5 text-right">
                        {r.filed ? (
                          <div className="inline-flex flex-col items-end gap-1">
                            <Badge tone="info">{t('tax_page.pp30_filed_badge')}</Badge>
                            <span className="text-[10px] text-slate-500">{thaiDate(r.filedAt, locale)}</span>
                            <div className="flex gap-2">
                              {onOpenFiling && (
                                <button
                                  type="button"
                                  onClick={() => onOpenFiling(r)}
                                  className="text-[11px] font-semibold text-blue-600 underline dark:text-blue-400"
                                >
                                  {t('tax_page.pp30_edit_btn')}
                                </button>
                              )}
                              {onExportPdf && (
                                <button
                                  type="button"
                                  onClick={() => onExportPdf(r)}
                                  className="text-[11px] font-semibold text-blue-600 underline dark:text-blue-400"
                                >
                                  {t('tax_page.pp30_pdf_btn')}
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-end gap-1.5">
                            {onOpenFiling && (
                              <button type="button" onClick={() => onOpenFiling(r)} className={filePrimaryCls}>
                                {t('tax_page.pp30_open_filing_btn')}
                              </button>
                            )}
                            {onMarkFiled && (
                              <button
                                type="button"
                                onClick={() => onMarkFiled(r)}
                                className="text-[11px] font-semibold text-blue-600 underline dark:text-blue-400"
                              >
                                {t('tax_page.pp30_mark_filed_btn')}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-gradient-to-r from-slate-100/90 to-slate-50/90 dark:from-slate-900 dark:to-slate-900/60 font-black text-slate-900 dark:text-slate-100 shadow-md">
                  <td className="py-4.5 px-4 pl-5 font-black">{t('tax_page.monthly_total_year')}</td>
                  <td className="py-4.5 px-4 text-right font-mono font-bold">{baht(totals.serviceBase)} {t('tax_page.baht')}</td>
                  <td className="py-4.5 px-4 text-right text-blue-700 dark:text-blue-350 font-mono font-bold">
                    {baht(totals.outputVat)} {t('tax_page.baht')}
                  </td>
                  <td className="py-4.5 px-4 text-right text-teal-700 dark:text-teal-350 font-mono font-bold">
                    {baht(totals.inputVat)} {t('tax_page.baht')}
                  </td>
                  <td className="py-4.5 px-4" />
                  <td className="py-4.5 px-4 text-right text-blue-800 dark:text-blue-300 font-mono font-black">
                    <span className="bg-blue-500/[0.08] dark:bg-blue-500/[0.15] px-3 py-1.5 rounded-xl border border-blue-500/20 dark:border-blue-500/35 shadow-inner">
                      {baht(totals.payable)} {t('tax_page.baht')}
                    </span>
                  </td>
                  <td className="py-4.5 px-4" colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        <span>{t('tax_page.pp30_deadline_note')}</span>
        <a
          href={RD_EFILING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-blue-600 underline dark:text-blue-400"
        >
          {t('tax_page.pp30_efiling_link')}
        </a>
      </div>

      <HelpNote>{t('tax_page.pp30_accounting_note')}</HelpNote>
    </div>
  );
}

const btnCls =
  'rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';
const exportBtnCls =
  'px-4 py-2 bg-slate-100 dark:bg-slate-900/40 hover:bg-slate-200 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer border border-transparent hover:border-slate-200/30 active:scale-95';
const filePrimaryCls =
  'rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:shadow-md transition-all cursor-pointer';
