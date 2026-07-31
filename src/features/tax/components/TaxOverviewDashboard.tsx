'use client';

/**
 * ฟีเจอร์ 1: ภาพรวม VAT
 *
 * ประกอบด้วย
 *   - TaxOverviewDashboard   การ์ดสรุป (แยกตะกร้า A/B ชัดเจน + VAT ที่เก็บ + เงินรับจริง) + การ์ดเกณฑ์ VAT
 *   - MonthlyVatOverviewTable ตารางรายเดือน 12 แถว — แยก export ต่างหาก (ดูหมายเหตุที่ใช้ใน tax/page.tsx)
 *     เพราะต้องย้ายไปวางแทนที่ "ตารางแสดงรายรับรายเดือน" (แบบไม่มี VAT) ตำแหน่งเดียวกันพอดี ไม่ใช่วางไว้
 *     ด้วยกันกับการ์ดสรุป/เกณฑ์ VAT ด้านบนของหน้าเหมือนเวอร์ชันเดิม
 *
 * ⚠️ ตัดการ์ด preview ภ.ง.ด.94/90 ออกจากเวอร์ชันต้นฉบับที่ export มาโดยตั้งใจ — การ์ดนั้นคำนวณด้วย
 *    lib/tax/pit.ts (engine ใหม่) ซึ่งเป็นคนละตัวกับ src/lib/thaiTax.ts ที่ใช้คำนวณตัวเลข ภ.ง.ด.90/94
 *    ที่ยื่นจริง (ดู PitBreakdown.tsx) — ถ้าโชว์คู่กันในแอปเดียวกันอาจเห็นตัวเลขคนละค่าใน 2 จุด
 *    หน้านี้จึงเหลือแค่เนื้อหา VAT ล้วน ไม่แตะการคำนวณภาษีเงินได้เลย
 *
 * คอลัมน์/การ์ดที่เกี่ยวกับ VAT จะหายไปเองเมื่อยังไม่จด VAT
 * (ยกเว้นคำเตือนว่าเกินเกณฑ์ ซึ่งต้องเห็นตอนยังไม่จด)
 *
 * ⚠️ i18n: ทุก component ในไฟล์นี้รับ prop `t` (จาก useLanguage() ของหน้าที่เรียก) แทนการ hardcode
 *    ข้อความภาษาไทยไว้ตรงๆ — คีย์ทั้งหมดอยู่ใต้ namespace "tax_page" ร่วมกับข้อความอื่นของหน้า /tax
 */

import type { ReactNode } from 'react';
import { Landmark, Percent, TrendingUp, Wallet, Zap } from 'lucide-react';
import type { ExpenseSummary, IncomeSummary } from '../../../types/tax';
import type { MonthlyRow } from '../../../lib/tax';
import { thisMonthKey } from '../../../lib/tax';
import { baht, thaiMonth } from '../../../lib/tax/format';

type T = (key: string, params?: Record<string, string | number>) => string;

export interface TaxOverviewDashboardProps {
  vatEnabled: boolean;
  /** ยอดรวมรายได้ทั้งปี (จาก summarizeIncome ช่วง 1 ม.ค. – 31 ธ.ค.) */
  yearIncome: IncomeSummary;
  t: T;
}

/**
 * การ์ดสถิติหน้าตาแบบเดียวกับ "บัตรรายได้และหักลดหย่อน" ใน tax/page.tsx (badge สี + กล่องไอคอน +
 * ตัวเลขสีใหญ่ + glow มุมการ์ด) แต่ตัดส่วนท้าย "สิทธิ์หักค่าใช้จ่ายที่เลือก" ออก เพราะการ์ดชุดนี้เป็นสรุป
 * ตะกร้า A/B + VAT ล้วนๆ ไม่มีแนวคิดหักค่าใช้จ่ายรายหมวดแบบ PIT
 */
function OverviewCard({
  badge,
  badgeClass,
  icon,
  iconBoxClass,
  glowClass,
  borderClass,
  hoverShadowClass,
  note,
  value,
  valueClass,
  t,
}: {
  badge: ReactNode;
  badgeClass: string;
  icon: ReactNode;
  iconBoxClass: string;
  glowClass: string;
  borderClass: string;
  hoverShadowClass: string;
  note: ReactNode;
  value: number;
  valueClass: string;
  t: T;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-white dark:bg-slate-900 border ${borderClass} shadow-[0_8px_30px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.15)] rounded-3xl p-6 flex flex-col gap-5 hover:-translate-y-1.5 ${hoverShadowClass} transition-all duration-300 group`}
    >
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-8 -mt-8 transition-all duration-300 ${glowClass}`} />
      <div className="flex justify-between items-start relative z-10">
        <span className={`inline-flex text-xs font-bold px-2.5 py-1 rounded-full border tracking-wider ${badgeClass}`}>
          {badge}
        </span>
        <div className={`p-2.5 rounded-xl shadow-inner group-hover:scale-110 transition-transform duration-300 ${iconBoxClass}`}>
          {icon}
        </div>
      </div>
      <div className="space-y-1 relative z-10">
        <p className="text-xs text-slate-400 leading-none">{note}</p>
        <p className={`text-2xl font-black tracking-tight mt-1 ${valueClass}`}>
          {baht(value)} <span className="text-xs font-bold text-slate-500 dark:text-slate-450">{t('tax_page.baht')}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * การ์ดสรุปยอด (ตะกร้า A/B + VAT ที่เก็บ + เงินรับจริง) เท่านั้น — การ์ดเกณฑ์ VAT 1.8 ล้าน (VatThresholdCard)
 * ไม่ได้อยู่ในนี้แล้ว เพราะ tax/page.tsx render แยกไว้ต่างหากอยู่แล้วเหนือจุดที่เรียก component นี้
 * (เดิมสองที่เรียก VatThresholdCard คนละจุดพร้อมกัน กลายเป็นการ์ดซ้ำตอนจด VAT แล้ว)
 */
export function TaxOverviewDashboard({
  vatEnabled,
  yearIncome,
  t,
}: TaxOverviewDashboardProps) {
  return (
    <div className={vatEnabled ? 'grid gap-6 sm:grid-cols-2 xl:grid-cols-4' : 'grid gap-6 sm:grid-cols-3'}>
      <OverviewCard
        badge={t('tax_page.overview_bucket_a')}
        badgeClass="bg-blue-500/[0.08] dark:bg-blue-500/[0.12] text-blue-600 dark:text-blue-400 border-blue-500/10"
        icon={<Landmark className="w-5 h-5" />}
        iconBoxClass="bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-450"
        glowClass="bg-blue-500/[0.03] dark:bg-blue-500/[0.06] group-hover:bg-blue-500/[0.08]"
        borderClass="border-blue-100 dark:border-blue-900/40"
        hoverShadowClass="hover:shadow-xl hover:shadow-blue-500/[0.05]"
        note={t('tax_page.overview_bucket_a_note')}
        value={yearIncome.incomeA}
        valueClass="text-blue-600 dark:text-blue-400"
        t={t}
      />
      <OverviewCard
        badge={t('tax_page.overview_bucket_b')}
        badgeClass="bg-teal-500/[0.08] dark:bg-teal-500/[0.12] text-teal-600 dark:text-teal-400 border-teal-500/10"
        icon={<Zap className="w-5 h-5" />}
        iconBoxClass="bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-450"
        glowClass="bg-teal-500/[0.03] dark:bg-teal-500/[0.06] group-hover:bg-teal-500/[0.08]"
        borderClass="border-teal-100 dark:border-teal-900/40"
        hoverShadowClass="hover:shadow-xl hover:shadow-teal-500/[0.05]"
        note={t(vatEnabled ? 'tax_page.overview_bucket_b_note_vat' : 'tax_page.overview_bucket_b_note_novat')}
        value={yearIncome.incomeB}
        valueClass="text-teal-600 dark:text-teal-400"
        t={t}
      />
      {vatEnabled && (
        <OverviewCard
          badge={t('tax_page.overview_vat_badge')}
          badgeClass="bg-indigo-500/[0.08] dark:bg-indigo-500/[0.12] text-indigo-600 dark:text-indigo-400 border-indigo-500/10"
          icon={<Percent className="w-5 h-5" />}
          iconBoxClass="bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-450"
          glowClass="bg-indigo-500/[0.03] dark:bg-indigo-500/[0.06] group-hover:bg-indigo-500/[0.08]"
          borderClass="border-indigo-100 dark:border-indigo-900/40"
          hoverShadowClass="hover:shadow-xl hover:shadow-indigo-500/[0.05]"
          note={t('tax_page.overview_vat_note')}
          value={yearIncome.outputVat}
          valueClass="text-indigo-600 dark:text-indigo-400"
          t={t}
        />
      )}
      <OverviewCard
        badge={t(vatEnabled ? 'tax_page.overview_gross_receipts_badge' : 'tax_page.overview_total_income_badge')}
        badgeClass="bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400 border-emerald-500/10"
        icon={<Wallet className="w-5 h-5" />}
        iconBoxClass="bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-450"
        glowClass="bg-emerald-500/[0.03] dark:bg-emerald-500/[0.06] group-hover:bg-emerald-500/[0.08]"
        borderClass="border-emerald-100 dark:border-emerald-900/40"
        hoverShadowClass="hover:shadow-xl hover:shadow-emerald-500/[0.05]"
        note={
          vatEnabled
            ? t('tax_page.overview_gross_receipts_note', { income: baht(yearIncome.total), vat: baht(yearIncome.outputVat) })
            : t('tax_page.overview_total_income_note')
        }
        value={vatEnabled ? yearIncome.grossReceipts : yearIncome.total}
        valueClass="text-emerald-600 dark:text-emerald-400"
        t={t}
      />
    </div>
  );
}

/* ================================================================== *
 * ตารางรายเดือน (สรุปรายเดือนแบบมี VAT) — ดีไซน์ตั้งใจให้ตรงกับ "ตารางแสดงรายรับรายเดือน"
 * (แบบไม่มี VAT) ใน tax/page.tsx เพราะสลับที่แทนกันในตำแหน่งเดียวกันของหน้า /tax
 * ================================================================== */

export interface MonthlyVatOverviewTableProps {
  year: number;
  vatEnabled: boolean;
  yearIncome: IncomeSummary;
  yearExpense: ExpenseSummary;
  months: MonthlyRow[];
  hasData: boolean;
  onGoToPp30?: () => void;
  t: T;
  /** ใช้ format เดือน/ปีของ thaiMonth() และปีในหัวตารางให้ตรงภาษา — ไม่ระบุ = ไทย (พ.ศ.) เหมือนเดิม */
  locale?: 'th' | 'en';
}

export function MonthlyVatOverviewTable({
  year,
  vatEnabled,
  yearIncome,
  yearExpense,
  months,
  hasData,
  onGoToPp30,
  t,
  locale = 'th',
}: MonthlyVatOverviewTableProps) {
  return (
    <div className="glass-card rounded-3xl border border-slate-200/80 dark:border-slate-900/60 p-6 md:p-8 space-y-6 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-900/40">
        <TrendingUp className="w-5 h-5 text-blue-500" />
        <div>
          <h3 className="text-base font-bold text-slate-850 dark:text-slate-50">{t('tax_page.monthly_vat_table_title')}</h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('tax_page.monthly_vat_table_subtitle', { year: locale === 'en' ? year : year + 543 })}
          </p>
        </div>
      </div>

      {!hasData ? (
        <div className="py-16 text-center rounded-2xl bg-slate-50/40 dark:bg-slate-900/10 border border-dashed border-slate-200 dark:border-slate-800/80 text-slate-500 text-xs space-y-3 shadow-inner">
          <TrendingUp className="w-10 h-10 text-slate-400/80 dark:text-slate-700 mx-auto" />
          <p className="font-semibold text-slate-755 dark:text-slate-300">{t('tax_page.monthly_vat_empty_title')}</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {t('tax_page.monthly_vat_empty_desc')}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm bg-white dark:bg-slate-950/20">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm sm:text-base border-collapse">
              <thead>
                <tr className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 font-extrabold text-xs sm:text-sm uppercase tracking-wider border-b-2 border-slate-250 dark:border-slate-800 shadow-sm">
                  <th className="py-4 px-4 pl-5">{t('tax_page.monthly_col_month')}</th>
                  <th className="py-4 px-4 text-right text-blue-700 dark:text-blue-350">{t('tax_page.monthly_col_rent405')}</th>
                  <th className="py-4 px-4 text-right text-teal-700 dark:text-teal-350">{t('tax_page.monthly_col_util408')}</th>
                  {vatEnabled && <th className="py-4 px-4 text-right">{t('tax_page.monthly_col_output_vat')}</th>}
                  {vatEnabled && <th className="py-4 px-4 text-right">{t('tax_page.monthly_col_input_vat')}</th>}
                  {vatEnabled && <th className="py-4 px-4 text-right">{t('tax_page.monthly_col_pp30')}</th>}
                  <th className="py-4 px-4 text-right">{t('tax_page.monthly_col_expense')}</th>
                  {vatEnabled && <th className="py-4 px-4 pr-5 text-right text-indigo-700 dark:text-indigo-350">{t('tax_page.monthly_col_rolling12')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 bg-white dark:bg-transparent">
                {months.map((m, idx) => {
                  const isEven = idx % 2 === 0;
                  // เดือนที่ยังไม่ถึง (อนาคต) ไม่มียอดย้อนหลัง 12 เดือนจริงให้ดู — โชว์ "—" แทนเลข 0/ค่าคลาดเคลื่อน
                  const isFutureMonth = m.period > thisMonthKey();
                  return (
                    <tr
                      key={m.period}
                      className={`${isEven ? "bg-slate-50/[0.35] dark:bg-slate-900/[0.15]" : "bg-white dark:bg-transparent"} hover:bg-blue-500/[0.05] dark:hover:bg-blue-500/[0.09] transition-all duration-150 border-b border-slate-100 dark:border-slate-800/60`}
                    >
                      <td className="py-3.5 px-4 pl-5 font-extrabold text-slate-900 dark:text-slate-100">
                        {thaiMonth(m.period, true, locale)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-900 dark:text-slate-100 font-mono font-semibold">
                        {baht(m.income.incomeA)} {t('tax_page.baht')}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-900 dark:text-slate-100 font-mono font-semibold">
                        {baht(m.income.incomeB)} {t('tax_page.baht')}
                      </td>
                      {vatEnabled && (
                        <td className="py-3.5 px-4 text-right text-blue-600 dark:text-blue-400 font-mono font-semibold">
                          {m.income.outputVat ? `${baht(m.income.outputVat)} ${t('tax_page.baht')}` : <span className="text-slate-400">—</span>}
                        </td>
                      )}
                      {vatEnabled && (
                        <td className="py-3.5 px-4 text-right text-teal-600 dark:text-teal-400 font-mono font-semibold">
                          {m.inputVat ? `${baht(m.inputVat)} ${t('tax_page.baht')}` : <span className="text-slate-400">—</span>}
                        </td>
                      )}
                      {vatEnabled && (
                        <td className="py-3.5 px-4 text-right font-mono">
                          {!m.pp30 ? (
                            <span className="text-slate-400">—</span>
                          ) : m.pp30.payable > 0 ? (
                            <span className="inline-flex items-center gap-1.5 justify-end">
                              <span className="font-semibold text-red-600 dark:text-red-400">{baht(m.pp30.payable)} {t('tax_page.baht')}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/[0.08] text-red-700 dark:bg-red-500/[0.12] dark:text-red-400">{t('tax_page.monthly_pp30_pay_badge')}</span>
                            </span>
                          ) : m.pp30.carryForward > 0 ? (
                            <span className="inline-flex items-center gap-1.5 justify-end">
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{baht(m.pp30.carryForward)} {t('tax_page.baht')}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/[0.08] text-emerald-700 dark:bg-emerald-500/[0.12] dark:text-emerald-400">{t('tax_page.monthly_pp30_credit_badge')}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">0.00 {t('tax_page.baht')}</span>
                          )}
                        </td>
                      )}
                      <td className="py-3.5 px-4 text-right text-slate-700 dark:text-slate-300 font-mono font-medium">
                        {m.expenseTotal ? `${baht(m.expenseTotal)} ${t('tax_page.baht')}` : <span className="text-slate-400">—</span>}
                      </td>
                      {vatEnabled && (
                        <td
                          className={`py-3.5 px-4 pr-5 text-right font-mono ${
                            !isFutureMonth && m.overThreshold
                              ? 'font-semibold text-red-600 dark:text-red-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {isFutureMonth ? '—' : `${baht(m.rolling12, 0)} ${t('tax_page.baht')}`}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-gradient-to-r from-slate-100/90 to-slate-50/90 dark:from-slate-900 dark:to-slate-900/60 font-black text-slate-900 dark:text-slate-100 shadow-md">
                  <td className="py-4.5 px-4 pl-5 font-black">{t('tax_page.monthly_total_year')}</td>
                  <td className="py-4.5 px-4 text-right text-blue-700 dark:text-blue-350 font-mono font-bold">
                    {baht(yearIncome.incomeA)} {t('tax_page.baht')}
                  </td>
                  <td className="py-4.5 px-4 text-right text-teal-700 dark:text-teal-350 font-mono font-bold">
                    {baht(yearIncome.incomeB)} {t('tax_page.baht')}
                  </td>
                  {vatEnabled && (
                    <td className="py-4.5 px-4 text-right font-mono font-bold">{baht(yearIncome.outputVat)} {t('tax_page.baht')}</td>
                  )}
                  {vatEnabled && (
                    <td className="py-4.5 px-4 text-right font-mono font-bold">{baht(yearExpense.inputVat)} {t('tax_page.baht')}</td>
                  )}
                  {vatEnabled && <td className="py-4.5 px-4" />}
                  <td className="py-4.5 px-4 text-right font-mono font-bold">{baht(yearExpense.total)} {t('tax_page.baht')}</td>
                  {vatEnabled && <td className="py-4.5 px-4 pr-5" />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {vatEnabled && onGoToPp30 && (
        <div className="pt-1">
          <button type="button" onClick={onGoToPp30} className={linkBtn}>
            {t('tax_page.monthly_goto_pp30')}
          </button>
        </div>
      )}
    </div>
  );
}

const linkBtn =
  'rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:shadow-md transition-all cursor-pointer';
