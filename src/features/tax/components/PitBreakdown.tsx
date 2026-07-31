'use client';

/**
 * ฟีเจอร์ 4: ส่วนที่ "เพิ่มเข้าไป" ในหน้า ภ.ง.ด.94 / ภ.ง.ด.90 ที่มีอยู่แล้ว
 *
 * ตั้งใจ export เป็นชิ้นๆ ไม่ได้มัดรวมเป็นหน้าเดียว เพื่อให้เลือกหยิบเฉพาะที่ยังไม่มี:
 *   - PersonalAllowanceLockNotice  แสดงว่าค่าลดหย่อนส่วนตัวถูกล็อกที่เท่าไร และทำไม (hideHeader ฝังใต้หัวข้ออื่นได้)
 *   - ExpenseDeductionTable        ขั้นที่ 1 หักค่าใช้จ่ายรายตะกร้า (สลับเหมา/จริงได้ในที่) — ยังไม่ได้ใช้ใน tax/page.tsx
 *   - DeductionBreakdown           ขั้นที่ 2 หักค่าลดหย่อน (เห็นทุกบรรทัด + เตือนเมื่อถูก cap) — ยังไม่ได้ใช้ใน tax/page.tsx
 *   - ProgressiveBracketTable      อัตราก้าวหน้าแบบเห็นทีละขั้น
 *   - MinTaxNotice                 ภาษีขั้นต่ำ 0.5% (ม.48(2))
 *   - PitBalanceSummary            หักกลบเครดิต → จ่ายเพิ่ม/ขอคืน
 *   - PitComparisonTable           ตารางเทียบครึ่งปี vs สิ้นปี
 *
 * ⚠️ เลข "ขั้นที่ N" ในหัวข้อของ ProgressiveBracketTable/PitBalanceSummary เขียนเป็นเลข 2/3 ตรงกับที่
 *    tax/page.tsx เรียกจริง (รวมสรุปยอด+ค่าลดหย่อนส่วนตัวเป็น "1" การ์ดเดียว ไม่ได้ใช้ ExpenseDeductionTable/
 *    DeductionBreakdown ข้างบน) — ถ้าจะเอา 2 ตัวนั้นมาต่อในหน้าเดียวกันด้วย ต้องรีนัมเบอร์ให้สอดคล้องกันใหม่ทั้งชุด
 *
 * ⚠️ ทุก component ในไฟล์นี้เป็น presentational ล้วน — รับผลคำนวณเข้ามาแล้วแสดงผลเท่านั้น
 *    ไม่แตะ PDF mapping ของ ภ.ง.ด.90/94 และไม่ผูกกับ engine คำนวณตัวไหนเป็นการเฉพาะ
 *    ผู้เรียก (src/app/(admin)/tax/page.tsx) ต้องประกอบค่า IncomeTaxResult/PeriodComputation
 *    จาก src/lib/thaiTax.ts (engine ที่ใช้ยื่นจริง) เท่านั้น ห้ามใช้ lib/tax/pit.ts (computeIncomeTax)
 *    ป้อนค่าที่หน้านี้ เพื่อให้ตัวเลขบนจอตรงกับ PDF ที่ดาวน์โหลดเป๊ะ
 *
 * ⚠️ i18n: ทุก component ในไฟล์นี้รับ prop `t` (จาก useLanguage() ของหน้าที่เรียก) แทนการ hardcode
 *    ข้อความภาษาไทยไว้ตรงๆ — คีย์ทั้งหมดอยู่ใต้ namespace "tax_page" ร่วมกับข้อความอื่นของหน้า /tax
 */

import { TrendingUp, Wallet } from 'lucide-react';
import type {
  DeductionItem,
  IncomeTaxResult,
  PeriodComputation,
  PitForm,
  TaxpayerType,
} from '../../../types/tax';
import { PERSONAL_ALLOWANCE, PIT_FORM_INFO } from '../../../lib/tax';
import { baht, pct } from '../../../lib/tax/format';
import {
  Alert,
  Badge,
  Breakdown,
  BreakdownRow,
  BucketBadge,
  Card,
  CardBody,
  CardHeader,
  HelpNote,
  Money,
  tableClasses as tc,
} from './primitives';

type T = (key: string, params?: Record<string, string | number>) => string;

/* ================================================================== *
 * ค่าลดหย่อนส่วนตัวถูกล็อก
 * ================================================================== */

/**
 * แสดงว่าค่าลดหย่อนส่วนตัวของแบบนี้คือเท่าไร และย้ำว่าสลับกับอีกแบบไม่ได้
 * เป็นจุดที่ผิดกันบ่อยที่สุด — ภ.ง.ด.94 ได้ครึ่งเดียวของ ภ.ง.ด.90
 */
export function PersonalAllowanceLockNotice({
  form,
  taxpayerType,
  partnerCount,
  onChangeTaxpayerType,
  bare = false,
  hideHeader = false,
  t,
}: {
  form: PitForm;
  taxpayerType: TaxpayerType;
  partnerCount?: number;
  onChangeTaxpayerType?: () => void;
  bare?: boolean;
  /** ไม่มี CardHeader/หัวข้อของตัวเอง — แสดงแค่ badge + ข้อความล็อกค่าลดหย่อน ใช้ตอนฝังไว้ใต้หัวข้ออื่นที่มีอยู่แล้ว */
  hideHeader?: boolean;
  t: T;
}) {
  const info = PIT_FORM_INFO[form];
  const amount = PERSONAL_ALLOWANCE[form][taxpayerType];
  const other = t(form === 'PND94' ? 'tax_page.taxpayer_type_pnd90_form' : 'tax_page.taxpayer_type_pnd94_form');
  const otherAmount =
    PERSONAL_ALLOWANCE[form === 'PND94' ? 'PND90' : 'PND94'][taxpayerType];
  const taxpayerLabel = t(taxpayerType === 'partnership' ? 'tax_page.taxpayer_partnership' : 'tax_page.taxpayer_individual');

  const badges = (
    <>
      <Badge tone="info">
        {taxpayerLabel}
        {taxpayerType === 'partnership' && partnerCount ? ` ${t('tax_page.pit_partner_count_paren', { count: partnerCount })}` : ''}
      </Badge>
      <Badge tone="bucketB">{t('tax_page.pit_personal_allowance_badge', { amount: baht(amount, 0) })}</Badge>
      {onChangeTaxpayerType && (
        <button type="button" onClick={onChangeTaxpayerType} className={btnCls}>
          {t('tax_page.pit_change_status_btn')}
        </button>
      )}
    </>
  );
  const note = (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {t('tax_page.pit_allowance_note_prefix', { formTitle: info.title })} <b>{baht(amount, 0)} {t('tax_page.baht')}</b>{' '}
      {t('tax_page.pit_allowance_note_suffix', { other, otherAmount: baht(otherAmount, 0) })}
    </p>
  );

  if (hideHeader) {
    return (
      <div className="flex flex-wrap items-center gap-2">{badges}</div>
    );
  }

  return (
    <Card bare={bare}>
      <CardHeader
        bare={bare}
        title={`${info.title} — ${info.label}`}
        subtitle={t('tax_page.pit_subtitle_range_due', { range: info.range, due: info.due })}
        actions={badges}
      />
      <CardBody bare={bare} className="py-3">
        {note}
      </CardBody>
    </Card>
  );
}

/* ================================================================== *
 * ขั้นที่ 1 — หักค่าใช้จ่าย
 * ================================================================== */

export function ExpenseDeductionTable({
  result,
  outputVatInPeriod = 0,
  actualExpenseA,
  actualExpenseB,
  onChangeMode,
  onChangeRate,
  t,
}: {
  result: IncomeTaxResult;
  /** VAT ที่เก็บในรอบ — ใช้บอกผู้ใช้ว่าฐาน 40(8) ถอด VAT ออกแล้ว */
  outputVatInPeriod?: number;
  actualExpenseA?: number;
  actualExpenseB?: number;
  onChangeMode?: (bucket: 'A' | 'B', mode: 'lump' | 'actual') => void;
  onChangeRate?: (bucket: 'A' | 'B', ratePct: number) => void;
  t: T;
}) {
  const rows: Array<{
    bucket: 'A' | 'B';
    title: string;
    hint: string;
    detail: IncomeTaxResult['expense']['a'];
    actual?: number;
  }> = [
    {
      bucket: 'A',
      title: t('tax_page.expense_mode_rent_title'),
      hint: t('tax_page.pit_expense_rent_hint'),
      detail: result.expense.a,
      actual: actualExpenseA,
    },
    {
      bucket: 'B',
      title: t('tax_page.pit_expense_service_title'),
      hint:
        outputVatInPeriod > 0
          ? t('tax_page.pit_expense_service_hint_vat', { amount: baht(outputVatInPeriod) })
          : t('tax_page.pit_expense_service_hint_novat'),
      detail: result.expense.b,
      actual: actualExpenseB,
    },
  ];

  return (
    <Card>
      <CardHeader title={t('tax_page.pit_expense_step1_title')} />
      <div className={tc.wrap}>
        <table className={tc.table}>
          <thead>
            <tr>
              <th className={tc.th}>{t('tax_page.pit_col_income_type')}</th>
              <th className={tc.thNum}>{t('tax_page.pit_col_income_period')}</th>
              <th className={tc.th} style={{ width: 210 }}>{t('tax_page.pit_col_deduction_method')}</th>
              <th className={tc.thNum}>{t('tax_page.pit_col_expense_deducted')}</th>
              <th className={tc.thNum}>{t('tax_page.pit_col_remaining')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bucket} className={tc.row}>
                <td className={tc.td}>
                  <BucketBadge bucket={r.bucket} />
                  <div className="mt-0.5 text-sm">{r.title}</div>
                  <div className="text-[11px] text-slate-500">{r.hint}</div>
                </td>
                <td className={tc.tdNum}><Money value={r.detail.income} /></td>
                <td className={tc.td}>
                  <div className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-700">
                    {(['lump', 'actual'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={!onChangeMode}
                        onClick={() => onChangeMode?.(r.bucket, m)}
                        className={
                          r.detail.mode === m
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm'
                            : 'px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-default dark:text-slate-300 dark:hover:bg-slate-800'
                        }
                      >
                        {m === 'lump' ? t('tax_page.expense_mode_lump') : t('tax_page.pit_actual_deduction')}
                      </button>
                    ))}
                  </div>
                  {r.detail.mode === 'lump' ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">{t('tax_page.expense_mode_rate_label')}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        disabled={!onChangeRate}
                        value={Math.round((r.detail.rate ?? 0) * 100)}
                        onChange={(e) => onChangeRate?.(r.bucket, Number(e.target.value))}
                        className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
                      />
                      <span className="text-[11px] text-slate-500">%</span>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[11px] text-slate-500">
                      {t('tax_page.pit_from_ledger', { amount: baht(r.actual ?? r.detail.requested) })}
                    </div>
                  )}
                </td>
                <td className={`${tc.tdNum} text-red-600 dark:text-red-400`}>
                  −<Money value={r.detail.deduction} />
                </td>
                <td
                  className={`${tc.tdNum} font-semibold ${
                    r.detail.afterExpense < 0 ? 'text-red-600 dark:text-red-400' : ''
                  }`}
                >
                  <Money value={r.detail.afterExpense} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={tc.tfootTd}>{t('tax_page.pit_total_row')}</td>
              <td className={`${tc.tfootTd} text-right`}>{baht(result.income.gross)}</td>
              <td className={tc.tfootTd} />
              <td className={`${tc.tfootTd} text-right`}>−{baht(result.expense.total)}</td>
              <td className={`${tc.tfootTd} text-right`}>{baht(result.afterExpense)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {result.crossBucketDeduction.triggered && (
        <CardBody className="py-3">
          <Alert
            tone="warning"
            title={t('tax_page.pit_cross_bucket_warning_title')}
          >
            {rows
              .filter((r) => r.detail.exceedsIncome)
              .map((r) => (
                <p key={r.bucket} className="mt-1 first:mt-0">
                  {t('tax_page.pit_cross_bucket_detail', {
                    bucket: t(r.bucket === 'A' ? 'tax_page.bucket_label_a' : 'tax_page.bucket_label_b'),
                    requested: baht(r.detail.requested),
                    income: baht(r.detail.income),
                  })}
                </p>
              ))}
            <HelpNote>
              {result.crossBucketDeduction.capExpensePerBucket
                ? t('tax_page.pit_cross_bucket_help_capped')
                : t('tax_page.pit_cross_bucket_help_uncapped')}
            </HelpNote>
          </Alert>
        </CardBody>
      )}
      {(result.expense.a.capped || result.expense.b.capped) && (
        <CardBody className="py-3">
          <HelpNote>{t('tax_page.pit_capped_notice')}</HelpNote>
        </CardBody>
      )}
    </Card>
  );
}

/* ================================================================== *
 * ขั้นที่ 2 — ค่าลดหย่อน
 * ================================================================== */

export function DeductionBreakdown({
  result,
  deductions = [],
  onManageDeductions,
  t,
}: {
  result: IncomeTaxResult;
  deductions?: DeductionItem[];
  onManageDeductions?: () => void;
  t: T;
}) {
  const key = result.form === 'PND94' ? 'amountPND94' : 'amountPND90';
  const listed = deductions.filter((d) => (d[key] ?? 0) > 0);
  const info = PIT_FORM_INFO[result.form];
  const taxpayerLabel = t(result.taxpayerType === 'partnership' ? 'tax_page.taxpayer_partnership' : 'tax_page.taxpayer_individual');

  return (
    <Card>
      <CardHeader
        title={t('tax_page.pit_deduction_step2_title')}
        actions={
          onManageDeductions && (
            <button type="button" onClick={onManageDeductions} className={btnCls}>
              {t('tax_page.pit_manage_deductions_btn')}
            </button>
          )
        }
      />
      <CardBody>
        <Breakdown>
          <BreakdownRow label={t('tax_page.pit_income_after_expense')} value={<Money value={result.afterExpense} />} />
          <BreakdownRow
            label={t('tax_page.pit_personal_allowance_row', { taxpayerLabel })}
            sub={t('tax_page.pit_personal_allowance_sub', { formTitle: info.title, amount: baht(result.deductions.personalAllowance, 0) })}
            value={<>−<Money value={result.deductions.personalAllowance} /></>}
            minus
            indent
          />
          {listed.map((d) => (
            <BreakdownRow
              key={d.id}
              label={d.name || t('tax_page.pit_other_deduction_fallback')}
              sub={d.note}
              value={<>−<Money value={d[key]} /></>}
              minus
              indent
            />
          ))}
          {result.deductions.other === 0 && (
            <BreakdownRow label={t('tax_page.pit_other_deduction_fallback')} sub={t('tax_page.pit_no_other_deduction_sub')} value="—" indent />
          )}
          {result.deductions.capped && (
            <BreakdownRow
              label={t('tax_page.pit_applied_deduction_row')}
              sub={t('tax_page.pit_applied_deduction_sub', { requested: baht(result.deductions.requested) })}
              value={<>−<Money value={result.deductions.applied} /></>}
              minus
            />
          )}
          <BreakdownRow
            label={t(result.form === 'PND94' ? 'tax_page.pit_net_income_half' : 'tax_page.pit_net_income_full')}
            value={<Money value={result.netIncome} />}
            subtotal
          />
        </Breakdown>
        {result.deductions.capped && (
          <HelpNote>{t('tax_page.pit_deduction_capped_help')}</HelpNote>
        )}
      </CardBody>
    </Card>
  );
}

/* ================================================================== *
 * ขั้นที่ 3 — อัตราก้าวหน้า + ภาษีขั้นต่ำ
 * ================================================================== */

export function ProgressiveBracketTable({
  result,
  bare = false,
  t,
}: {
  result: IncomeTaxResult;
  bare?: boolean;
  t: T;
}) {
  const steps = result.progressive.steps;
  // สีไอคอนตามแบบ — ให้ตรงกับหัวข้อ "1. แบบยื่นภาษี..." ของ ภ.ง.ด.94/90 ในหน้า tax/page.tsx (blue/teal)
  const accent = result.form === 'PND94' ? 'text-blue-500' : 'text-teal-500';

  return (
    <Card bare={bare}>
      <CardHeader
        bare={bare}
        title={
          <span className="inline-flex items-center gap-2">
            <TrendingUp className={`h-4 w-4 ${accent}`} />
            {t('tax_page.pit_progressive_title')}
          </span>
        }
        subtitle={t('tax_page.pit_progressive_subtitle', { amount: baht(result.netIncome) })}
      />
      {steps.length === 0 ? (
        <CardBody bare={bare}>
          <p className="text-sm text-slate-500">{t('tax_page.pit_progressive_zero')}</p>
        </CardBody>
      ) : (
        <div className={tc.wrap}>
          <table className={tc.table}>
            <thead>
              <tr>
                <th className={tc.th}>{t('tax_page.pit_col_bracket')}</th>
                <th className={tc.thNum}>{t('tax_page.pit_col_rate')}</th>
                <th className={tc.thNum}>{t('tax_page.pit_col_income_in_bracket')}</th>
                <th className={tc.thNum}>{t('tax_page.pit_col_tax')}</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((st) => (
                <tr key={st.from} className={tc.row}>
                  <td className={tc.td}>
                    {st.to === Infinity
                      ? t('tax_page.pit_bracket_and_above', { amount: baht(st.from, 0) })
                      : t('tax_page.pit_bracket_range', { from: baht(st.from, 0), to: baht(st.to, 0) })}
                  </td>
                  <td className={tc.tdNum}>{pct(st.rate)}</td>
                  <td className={tc.tdNum}><Money value={st.amount} /></td>
                  <td className={tc.tdNum}><Money value={st.tax} dash /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={tc.tfootTd} colSpan={3}>{t('tax_page.pit_progressive_total')}</td>
                <td className={`${tc.tfootTd} text-right`}>{baht(result.progressive.tax)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <CardBody bare={bare} className="py-3">
        <MinTaxNotice result={result} t={t} />
      </CardBody>
    </Card>
  );
}

/**
 * ภาษีขั้นต่ำ 0.5% ของเงินได้พึงประเมิน (มาตรา 48(2))
 *
 * เคสที่กฎนี้สำคัญ: หักค่าใช้จ่ายจริงเยอะจนเงินได้สุทธิเหลือ 0 แต่รายได้รวมสูง
 * ถ้าไม่มีกฎนี้ระบบจะบอกว่าภาษี = 0 ซึ่งต่ำกว่าความจริง
 */
export function MinTaxNotice({ result, t }: { result: IncomeTaxResult; t: T }) {
  const mt = result.minTax;
  if (!mt.enabled) return null;

  if (mt.applies) {
    return (
      <Alert tone="warning" title={t('tax_page.pit_min_tax_applies_title', { rate: pct(mt.rate, 1) })}>
        {t('tax_page.pit_min_tax_applies_prefix', { rate: pct(mt.rate, 1), gross: baht(result.income.gross) })}{' '}
        <b>{baht(mt.amount)} {t('tax_page.baht')}</b>{' '}
        {t('tax_page.pit_min_tax_applies_suffix', { progressiveTax: baht(result.progressive.tax) })}
        <HelpNote>{t('tax_page.pit_min_tax_help')}</HelpNote>
      </Alert>
    );
  }

  return (
    <HelpNote>
      {mt.exempted
        ? t('tax_page.pit_min_tax_exempted', { rate: pct(mt.rate, 1) })
        : result.income.gross > mt.threshold
          ? t('tax_page.pit_min_tax_lower', { rate: pct(mt.rate, 1), amount: baht(mt.amount) })
          : t('tax_page.pit_min_tax_not_applicable', { threshold: baht(mt.threshold, 0) })}
    </HelpNote>
  );
}

/* ================================================================== *
 * ขั้นที่ 4 — หักกลบเครดิต
 * ================================================================== */

export function PitBalanceSummary({
  computation,
  onGoToPnd94,
  bare = false,
  t,
}: {
  computation: PeriodComputation;
  onGoToPnd94?: () => void;
  bare?: boolean;
  t: T;
}) {
  const { tax, form, pnd94IsEstimate } = computation;
  // สีไอคอนตามแบบ — ให้ตรงกับหัวข้อ "1. แบบยื่นภาษี..." ของ ภ.ง.ด.94/90 ในหน้า tax/page.tsx (blue/teal)
  const accent = form === 'PND94' ? 'text-blue-500' : 'text-teal-500';

  return (
    <Card bare={bare}>
      <CardHeader
        bare={bare}
        title={
          <span className="inline-flex items-center gap-2">
            <Wallet className={`h-4 w-4 ${accent}`} />
            {t(form === 'PND94' ? 'tax_page.pit_balance_pnd94_title' : 'tax_page.pit_balance_pnd90_title')}
          </span>
        }
      />
      <CardBody bare={bare}>
        <Breakdown>
          <BreakdownRow
            label={t(form === 'PND94' ? 'tax_page.pit_balance_half_calculated' : 'tax_page.pit_balance_full_total')}
            value={<Money value={tax.taxBeforeCredits} />}
            subtotal
          />
          {tax.credits.withholdingTax > 0 && (
            <BreakdownRow
              label={t('tax_page.pit_withholding_tax')}
              value={<>−<Money value={tax.credits.withholdingTax} /></>}
              minus
              indent
            />
          )}
          {form === 'PND90' && (
            <BreakdownRow
              label={t(pnd94IsEstimate ? 'tax_page.pit_pnd94_estimate' : 'tax_page.pit_pnd94_paid')}
              value={<>−<Money value={tax.credits.pnd94Paid} /></>}
              minus
              indent
            />
          )}
          {tax.status === 'refund' ? (
            <BreakdownRow label={t('tax_page.pit_refund_row')} value={<Money value={tax.refundable} sign />} result tone="refund" />
          ) : tax.status === 'pay' ? (
            <BreakdownRow
              label={t(form === 'PND94' ? 'tax_page.pit_payable_half' : 'tax_page.pit_payable_extra')}
              value={<Money value={tax.payable} sign />}
              result
              tone="pay"
            />
          ) : (
            <BreakdownRow label={t('tax_page.pit_no_tax_due')} value="฿0.00" result />
          )}
        </Breakdown>

        {form === 'PND90' && pnd94IsEstimate && (computation.pnd94Result?.tax.payable ?? 0) > 0 && (
          <HelpNote>
            {t('tax_page.pit_estimate_note_prefix')} <b>{t('tax_page.pit_estimate_note_bold')}</b>{' '}
            {t('tax_page.pit_estimate_note_suffix')}
            {onGoToPnd94 && (
              <>
                {' — '}
                <button type="button" onClick={onGoToPnd94} className="font-semibold underline">
                  {t('tax_page.pit_goto_pnd94_btn')}
                </button>
              </>
            )}
          </HelpNote>
        )}
      </CardBody>
    </Card>
  );
}

/* ================================================================== *
 * ตารางเทียบครึ่งปี vs สิ้นปี
 * ================================================================== */

export function PitComparisonTable({ pnd90, t }: { pnd90: PeriodComputation; t: T }) {
  const half = pnd90.pnd94Result?.tax;
  if (!half) return null;
  const full = pnd90.tax;

  const rows: Array<{ label: string; h1: number; fy: number; total?: boolean; minus?: boolean }> = [
    { label: t('tax_page.pit_row_income_405'), h1: half.income.a, fy: full.income.a },
    { label: t('tax_page.pit_row_income_408'), h1: half.income.b, fy: full.income.b },
    { label: t('tax_page.pit_row_expense_deduction'), h1: half.expense.total, fy: full.expense.total, minus: true },
    { label: t('tax_page.pit_row_allowance_deduction'), h1: half.deductions.applied, fy: full.deductions.applied, minus: true },
    { label: t('tax_page.pit_row_net_income'), h1: half.netIncome, fy: full.netIncome, total: true },
    { label: t('tax_page.pit_row_calculated_tax'), h1: half.taxBeforeCredits, fy: full.taxBeforeCredits, total: true },
  ];

  return (
    <Card>
      <CardHeader title={t('tax_page.pit_comparison_title')} />
      <div className={tc.wrap}>
        <table className={tc.table}>
          <thead>
            <tr>
              <th className={tc.th}>{t('tax_page.pit_col_item')}</th>
              <th className={tc.thNum}>{t('tax_page.taxpayer_type_pnd94_form')}</th>
              <th className={tc.thNum}>{t('tax_page.pit_col_pnd90_full')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className={
                  r.total
                    ? 'bg-slate-50 font-semibold dark:bg-slate-800/40'
                    : tc.row
                }
              >
                <td className={tc.td}>{r.label}</td>
                <td className={tc.tdNum}>{r.minus ? '−' : ''}{baht(r.h1)}</td>
                <td className={tc.tdNum}>{r.minus ? '−' : ''}{baht(r.fy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const btnCls =
  'rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';
