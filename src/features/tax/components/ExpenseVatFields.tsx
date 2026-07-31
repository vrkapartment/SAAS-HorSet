'use client';

/**
 * ฟีเจอร์ 2: ค่าใช้จ่าย / ภาษีซื้อ
 *
 * ตัวนี้ออกแบบให้ "เสียบเข้าฟอร์มค่าใช้จ่ายที่มีอยู่แล้ว" ไม่ใช่มาแทนทั้งฟอร์ม
 * ฟอร์มเดิมแยก 40(5)/40(8) อยู่แล้ว → เก็บส่วนนั้นไว้ แล้วเพิ่มบล็อกนี้ต่อท้าย
 *
 * ทั้งบล็อกจะหายไปเองเมื่อยังไม่จด VAT (ตามกฎ VatGate)
 * เมื่อยังไม่จด: ยอดที่ผู้ใช้กรอกคือ base ตรงๆ, vat = 0 — ฟอร์มเดิมทำงานเหมือนเดิมเป๊ะ
 *
 * รูปแบบ controlled component: ถือ state ไว้เอง แล้วรับค่าที่คำนวณแล้วผ่าน onChange
 *
 * ⚠️ i18n: ทุก component ในไฟล์นี้รับ prop `t` (จาก useLanguage() ของหน้าที่เรียก) แทนการ hardcode
 *    ข้อความภาษาไทยไว้ตรงๆ — คีย์ทั้งหมดอยู่ใต้ namespace "tax_page" ร่วมกับข้อความอื่นของหน้า /tax
 *    (component นี้ใช้ทั้งในหน้า /tax และหน้าบันทึกค่าใช้จ่าย daily-bills)
 */

import { useMemo } from 'react';

import type { Bucket, ExpenseSummary, TaxSettings } from '../../../types/tax';
import { addVat, isVatEnabled, num, r2, splitVatFromGross } from '../../../lib/tax';
import { baht, pct } from '../../../lib/tax/format';
import { Alert, HelpNote, Money, StatTile, cx } from './primitives';

type T = (key: string, params?: Record<string, string | number>) => string;

/** โหมดการกรอกยอด */
export type ExpenseVatMode =
  /** ไม่มี VAT (ใบเสร็จธรรมดา / ผู้ขายไม่ได้จด VAT) */
  | 'novat'
  /** ยอดที่กรอกรวม VAT แล้ว → ระบบถอด 7% ออก */
  | 'gross'
  /** ยอดที่กรอกยังไม่รวม VAT → ระบบบวก 7% */
  | 'base';

export interface ExpenseVatValue {
  amount: number | string;
  vatMode: ExpenseVatMode;
  claimInputVat: boolean;
}

export interface ExpenseVatComputed {
  base: number;
  vat: number;
  total: number;
  claimInputVat: boolean;
}

/**
 * คำนวณ base/vat จากค่าที่ผู้ใช้กรอก
 * เรียกฟังก์ชันนี้ตอน submit ฟอร์มด้วย เพื่อให้ค่าที่บันทึกลง DB ตรงกับที่แสดงบนจอ
 */
export function computeExpenseVat(
  value: ExpenseVatValue,
  settings: Pick<TaxSettings, 'vatRegistered' | 'vatRate'>,
): ExpenseVatComputed {
  const raw = num(value.amount);
  const rate = settings.vatRate ?? 0.07;

  // ยังไม่จด VAT → ไม่มีภาษีซื้ออยู่ในระบบเลย
  if (!isVatEnabled(settings) || value.vatMode === 'novat') {
    return { base: r2(raw), vat: 0, total: r2(raw), claimInputVat: false };
  }

  const split = value.vatMode === 'gross' ? splitVatFromGross(raw, rate) : addVat(raw, rate);
  return {
    base: split.base,
    vat: split.vat,
    total: split.total,
    claimInputVat: split.vat > 0 ? value.claimInputVat : false,
  };
}

/* ------------------------------------------------------------------ *
 * ฟิลด์ VAT (เสียบเข้าฟอร์มเดิม)
 * ------------------------------------------------------------------ */

export interface ExpenseVatFieldsProps {
  value: ExpenseVatValue;
  onChange: (next: ExpenseVatValue) => void;
  settings: Pick<TaxSettings, 'vatRegistered' | 'vatRate'>;
  /** ตะกร้าที่ฟอร์มเดิมเลือกไว้ — ใช้แค่แสดงคำอธิบาย ไม่ได้เปลี่ยนการคำนวณ */
  bucket?: Bucket;
  /** ซ่อนพรีวิว (ถ้าฟอร์มมีพรีวิวของตัวเองอยู่แล้ว) */
  hidePreview?: boolean;
  className?: string;
  t: T;
}

export function ExpenseVatFields({
  value,
  onChange,
  settings,
  bucket,
  hidePreview = false,
  className,
  t,
}: ExpenseVatFieldsProps) {
  const enabled = isVatEnabled(settings);
  const computed = useMemo(() => computeExpenseVat(value, settings), [value, settings]);
  const rate = settings.vatRate ?? 0.07;

  // กฎ: ไม่จด VAT = ไม่เห็นอะไรเกี่ยวกับ VAT เลย
  if (!enabled) return null;

  const hasVat = value.vatMode !== 'novat';

  return (
    <div className={cx('space-y-3', className)}>
      <div className="flex flex-col gap-1.5">
        <label className={labelCls} htmlFor="expense-vat-mode">
          {t('tax_page.expense_vat_mode_label')}
        </label>
        <select
          id="expense-vat-mode"
          className={inputCls}
          value={value.vatMode}
          onChange={(e) => onChange({ ...value, vatMode: e.target.value as ExpenseVatMode })}
        >
          <option value="novat">{t('tax_page.expense_vat_mode_none')}</option>
          <option value="gross">{t('tax_page.expense_vat_mode_gross', { rate: pct(rate) })}</option>
          <option value="base">{t('tax_page.expense_vat_mode_base', { rate: pct(rate) })}</option>
        </select>
      </div>

      {hasVat && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600"
            checked={value.claimInputVat}
            onChange={(e) => onChange({ ...value, claimInputVat: e.target.checked })}
          />
          <span className="min-w-0">
            <span className="text-slate-800 dark:text-slate-100">
              {t('tax_page.expense_vat_claim_checkbox')}
            </span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400">
              {t('tax_page.expense_vat_claim_help')}
            </span>
          </span>
        </label>
      )}

      {!hidePreview && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">{t('tax_page.expense_vat_base_label')}</dt>
            <dd className="font-semibold"><Money value={computed.base} /> {t('tax_page.baht')}</dd>
            <dt className="text-slate-500">{t('tax_page.expense_vat_input_vat_label', { rate: pct(rate) })}</dt>
            <dd className={computed.vat ? 'font-semibold' : 'text-slate-400'}>
              {computed.vat ? <><Money value={computed.vat} /> {t('tax_page.baht')}</> : '—'}
            </dd>
            <dt className="text-slate-500">{t('tax_page.expense_vat_total_paid_label')}</dt>
            <dd className="font-semibold"><Money value={computed.total} /> {t('tax_page.baht')}</dd>
          </dl>
          {computed.vat > 0 && !computed.claimInputVat && (
            <HelpNote>{t('tax_page.expense_vat_not_claimed_help')}</HelpNote>
          )}
          {bucket === 'A' && computed.vat > 0 && (
            <HelpNote>{t('tax_page.expense_vat_rent_side_warning')}</HelpNote>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * การ์ดสรุปหัวหน้ารายการค่าใช้จ่าย
 * ------------------------------------------------------------------ */

export interface ExpenseSummaryTilesProps {
  summary: ExpenseSummary;
  settings: Pick<TaxSettings, 'vatRegistered' | 'expenseA' | 'expenseB'>;
  /** ภาษีซื้อทั้งหมดรวมที่ขอเครดิตไม่ได้ — จาก totalInputVatIncludingUnclaimable() */
  inputVatAll?: number;
  t: T;
}

export function ExpenseSummaryTiles({
  summary,
  settings,
  inputVatAll,
  t,
}: ExpenseSummaryTilesProps) {
  const vatEnabled = isVatEnabled(settings);
  const usingActualA = settings.expenseA?.mode === 'actual';
  const usingActualB = settings.expenseB?.mode === 'actual';

  return (
    <div className={cx('grid gap-4', vatEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      <StatTile
        label={t('tax_page.expense_summary_bucket_a')}
        value={summary.expenseA}
        accent="bucketA"
        note={
          usingActualA
            ? t('tax_page.expense_summary_used_actual')
            : t('tax_page.expense_summary_lump_not_used')
        }
      />
      <StatTile
        label={t('tax_page.expense_summary_bucket_b')}
        value={summary.expenseB}
        accent="bucketB"
        note={
          usingActualB
            ? t('tax_page.expense_summary_used_actual')
            : t('tax_page.expense_summary_lump_not_used')
        }
      />
      {vatEnabled && (
        <StatTile
          label={t('tax_page.expense_summary_input_vat_label')}
          value={summary.inputVat}
          accent="info"
          note={
            inputVatAll != null && inputVatAll > summary.inputVat
              ? t('tax_page.expense_summary_input_vat_all_note', { amount: baht(inputVatAll) })
              : t('tax_page.expense_summary_input_vat_note')
          }
        />
      )}
    </div>
  );
}

/**
 * แจ้งเตือนกรณีตั้งค่า "หักเหมา" แต่ผู้ใช้ยังบันทึกค่าใช้จ่ายเข้ามาเยอะ
 * ป้องกันความเข้าใจผิดว่า "บันทึกแล้วภาษีต้องลด"
 */
export function ExpenseModeMismatchNotice({
  summary,
  settings,
  onGoToSettings,
  t,
}: {
  summary: ExpenseSummary;
  settings: Pick<TaxSettings, 'expenseA' | 'expenseB'>;
  onGoToSettings?: () => void;
  t: T;
}) {
  const bothLump =
    settings.expenseA?.mode === 'lump' && settings.expenseB?.mode === 'lump';
  if (!bothLump || summary.total <= 0) return null;

  return (
    <Alert tone="info" title={t('tax_page.expense_mismatch_title')}>
      {t('tax_page.expense_mismatch_body_prefix')} <b>{t('tax_page.expense_mode_lump')}</b>{' '}
      {t('tax_page.expense_mismatch_body_suffix', { amount: baht(summary.total) })}
      {onGoToSettings && (
        <>
          {' — '}
          <button type="button" onClick={onGoToSettings} className="font-semibold underline">
            {t('tax_page.expense_mismatch_change_link')}
          </button>
        </>
      )}
      <HelpNote>{t('tax_page.expense_mismatch_help')}</HelpNote>
    </Alert>
  );
}

const labelCls = 'text-xs font-semibold text-slate-600 dark:text-slate-300';
const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-sm text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800/80 dark:bg-slate-950/40 dark:text-slate-200 dark:focus:bg-slate-900';
