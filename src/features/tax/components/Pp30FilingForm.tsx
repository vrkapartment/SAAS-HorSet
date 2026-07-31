'use client';

/**
 * ฟีเจอร์ 3 (ต่อ): ฟอร์มกรอกภาษีซื้อ ก่อนกดบันทึกยื่น ภ.พ.30
 *
 * ออกแบบเป็น 2 ขั้นชัดเจน เพราะเจ้าของหอต้อง "เห็นยอดที่จะต้องจ่ายก่อนกดยื่น"
 *   ขั้นที่ 1 — ระบุภาษีซื้อ (ใช้ยอดจากสมุดค่าใช้จ่าย หรือกรอกเอง)
 *   ขั้นที่ 2 — ผลการคำนวณ แล้วจึงกดยื่น
 *
 * เป็น component เปล่าๆ ไม่ผูกกับ modal library ตัวไหน — เอาไปวางใน Dialog ได้เลย
 *
 * ⚠️ i18n: รับ prop `t` (จาก useLanguage() ของหน้าที่เรียก) แทนการ hardcode ข้อความภาษาไทยไว้ตรงๆ
 *    คีย์ทั้งหมดอยู่ใต้ namespace "tax_page" ร่วมกับข้อความอื่นของหน้า /tax
 */

import { useMemo, useState } from 'react';

import type { ExpenseRow, Pp30Filing, Pp30Row } from '../../../types/tax';
import { computePP30, num } from '../../../lib/tax';
import { baht, pct, thaiMonth } from '../../../lib/tax/format';
import {
  Breakdown,
  BreakdownRow,
  Card,
  CardBody,
  CardHeader,
  HelpNote,
  Money,
  tableClasses as tc,
} from './primitives';

export interface Pp30FilingFormProps {
  row: Pp30Row;
  /** ใบกำกับภาษีซื้อของเดือนนั้น (กรองมาแล้ว) — ใช้แสดงให้ผู้ใช้ตรวจ */
  expensesInMonth?: ExpenseRow[];
  /** บันทึกร่าง (เก็บภาษีซื้อ แต่ยังไม่ทำเครื่องหมายว่ายื่น) */
  onSaveDraft?: (patch: Pp30Filing) => void | Promise<void>;
  /**
   * บันทึกยอดภาษีขาย/ภาษีซื้อของเดือนนี้ — ไม่แตะสถานะยื่นแล้ว (ปุ่ม "ทำเครื่องหมายว่ายื่นแล้ว"
   * แยกไปอยู่ที่ตาราง ภ.พ.30 รายเดือนแทน ดู onMarkFiled ใน Pp30Report)
   */
  onSubmitFiling: (patch: Pp30Filing) => void | Promise<void>;
  /** ยกเลิกสถานะยื่นแล้ว */
  onUnfile?: (period: string) => void | Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** ใช้ format ชื่อเดือน/ปีของ thaiMonth() ให้ตรงภาษา — ไม่ระบุ = ไทย (พ.ศ.) เหมือนเดิม */
  locale?: 'th' | 'en';
}

export function Pp30FilingForm({
  row,
  expensesInMonth = [],
  onSaveDraft,
  onSubmitFiling,
  onUnfile,
  onCancel,
  busy = false,
  t,
  locale = 'th',
}: Pp30FilingFormProps) {
  const [useManualOutput, setUseManualOutput] = useState(row.outputVatManual != null);
  const [outputVat, setOutputVat] = useState(
    String(row.outputVatManual != null ? row.outputVatManual : row.outputVatFromLedger),
  );
  const [useManual, setUseManual] = useState(row.inputVatManual != null);
  const [inputVat, setInputVat] = useState(
    String(row.inputVatManual != null ? row.inputVatManual : row.inputVatFromLedger),
  );
  const [note, setNote] = useState(row.note || '');

  const claimable = useMemo(
    () => expensesInMonth.filter((x) => x.claimInputVat !== false && num(x.vat) > 0),
    [expensesInMonth],
  );

  const result = useMemo(
    () =>
      computePP30({
        outputVat: useManualOutput ? num(outputVat) : row.outputVatFromLedger,
        inputVat: useManual ? num(inputVat) : row.inputVatFromLedger,
        creditBrought: row.creditBrought,
      }),
    [row.outputVatFromLedger, row.inputVatFromLedger, row.creditBrought, useManualOutput, outputVat, useManual, inputVat],
  );

  const patch = (): Pp30Filing => ({
    period: row.period,
    outputVatManual: useManualOutput ? num(outputVat) : null,
    inputVatManual: useManual ? num(inputVat) : null,
    note,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {t('tax_page.pp30_filing_form_title', { month: thaiMonth(row.period, false, locale) })}
      </h2>

      {/* ---------- ขั้นที่ 1 ---------- */}
      <Card>
        <CardHeader title={t('tax_page.pp30_filing_step1_title')} />
        <CardBody>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600"
              checked={useManualOutput}
              onChange={(e) => setUseManualOutput(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="text-slate-800 dark:text-slate-100">{t('tax_page.pp30_filing_manual_output_checkbox')}</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                {t('tax_page.pp30_filing_manual_output_help', { amount: baht(row.outputVatFromLedger) })}
              </span>
            </span>
          </label>

          {useManualOutput && (
            <div className="mt-3 flex max-w-xs flex-col gap-1.5">
              <label className={labelCls} htmlFor="pp30-output-vat">
                {t('tax_page.pp30_filing_output_vat_label')}
              </label>
              <input
                id="pp30-output-vat"
                inputMode="decimal"
                className={`${inputCls} text-right tabular-nums`}
                value={outputVat}
                onChange={(e) => setOutputVat(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800" />

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600"
              checked={useManual}
              onChange={(e) => setUseManual(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="text-slate-800 dark:text-slate-100">{t('tax_page.pp30_filing_manual_input_checkbox')}</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                {t('tax_page.pp30_filing_manual_input_help', { amount: baht(row.inputVatFromLedger), count: claimable.length })}
              </span>
            </span>
          </label>

          {useManual && (
            <div className="mt-3 flex max-w-xs flex-col gap-1.5">
              <label className={labelCls} htmlFor="pp30-input-vat">
                {t('tax_page.pp30_filing_input_vat_label')}
              </label>
              <input
                id="pp30-input-vat"
                inputMode="decimal"
                className={`${inputCls} text-right tabular-nums`}
                value={inputVat}
                onChange={(e) => setInputVat(e.target.value)}
                placeholder="0.00"
              />
              <span className="text-[11px] text-slate-500">
                {t('tax_page.pp30_filing_input_vat_help')}
              </span>
            </div>
          )}

          {claimable.length > 0 ? (
            <div className="mt-4">
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                {t('tax_page.pp30_filing_invoices_this_month')}
              </div>
              <div className={tc.wrap}>
                <table className={tc.table}>
                  <tbody>
                    {claimable.map((x) => (
                      <tr key={x.id} className={tc.row}>
                        <td className={tc.td}>
                          {x.description || '—'}
                          {x.vendor && (
                            <div className="text-[11px] text-slate-500">{x.vendor}</div>
                          )}
                        </td>
                        <td className={tc.tdNum}><Money value={x.base} /></td>
                        <td className={`${tc.tdNum} font-semibold`}><Money value={x.vat} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <HelpNote>{t('tax_page.pp30_filing_no_invoices')}</HelpNote>
          )}
        </CardBody>
      </Card>

      {/* ---------- ขั้นที่ 2 ---------- */}
      <Card>
        <CardHeader title={t('tax_page.pp30_filing_step2_title')} />
        <CardBody>
          <Breakdown>
            <BreakdownRow
              label={t('tax_page.pp30_filing_output_vat_row', { rate: pct(row.rate) })}
              sub={t('tax_page.pp30_filing_output_vat_sub', { amount: baht(row.serviceBase) })}
              value={<Money value={result.outputVat} />}
            />
            <BreakdownRow
              label={t('tax_page.pp30_filing_input_vat_row', { rate: pct(row.rate) })}
              value={<>−<Money value={result.inputVat} /></>}
              minus
            />
            {result.creditBrought > 0 && (
              <BreakdownRow
                label={t('tax_page.pp30_filing_credit_brought_row')}
                value={<>−<Money value={result.creditBrought} /></>}
                minus
              />
            )}
            {result.status === 'pay' ? (
              <BreakdownRow
                label={t('tax_page.pp30_filing_payable_row')}
                value={<Money value={result.payable} sign />}
                result
                tone="pay"
              />
            ) : result.status === 'credit' ? (
              <BreakdownRow
                label={t('tax_page.pp30_filing_carry_forward_row')}
                value={<Money value={result.carryForward} sign />}
                result
                tone="refund"
              />
            ) : (
              <BreakdownRow label={t('tax_page.pp30_filing_zero_row')} value="฿0.00" result />
            )}
          </Breakdown>
        </CardBody>
      </Card>

      {/* ---------- หมายเหตุ ---------- */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls} htmlFor="pp30-note">{t('tax_page.pp30_filing_note_label')}</label>
        <input
          id="pp30-note"
          className={inputCls}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('tax_page.pp30_filing_note_placeholder')}
        />
      </div>

      {/* ---------- ปุ่ม ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        {row.filed && onUnfile && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onUnfile(row.period)}
            className="rounded-md border border-red-400 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
          >
            {t('tax_page.pp30_filing_unfile_btn')}
          </button>
        )}
        <div className="flex-1" />
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className={btnCls}>
            {t('tax_page.pp30_filing_cancel_btn')}
          </button>
        )}
        {onSaveDraft && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSaveDraft(patch())}
            className={btnCls}
          >
            {t('tax_page.pp30_filing_save_draft_btn')}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onSubmitFiling(patch())}
          className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          {t('tax_page.pp30_filing_save_btn')}
        </button>
      </div>
    </div>
  );
}

const labelCls = 'text-xs font-semibold text-slate-600 dark:text-slate-300';
const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-sm text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800/80 dark:bg-slate-950/40 dark:text-slate-200 dark:focus:bg-slate-900';
const btnCls =
  'rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';
