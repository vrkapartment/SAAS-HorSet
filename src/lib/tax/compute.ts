/**
 * ชั้นประกอบร่าง — รวมทุกอย่างเป็นผลลัพธ์ที่ UI ใช้ได้ตรงๆ
 * เป็นฟังก์ชันบริสุทธิ์ทั้งไฟล์ (ไม่ fetch, ไม่แตะ React) จึงเรียกได้ทั้งใน Server Component,
 * Route Handler, cron job หรือ client
 *
 * ⚠️ computePeriod()/computeIncomeTax() ในนี้ใช้กับ VAT/ภ.พ.30 เท่านั้น — ห้ามใช้แสดงตัวเลข
 *    ภ.ง.ด.90/94 ที่จะเอาไปยื่นจริง (แหล่งเดียวคือ src/lib/thaiTax.ts + src/lib/pdfHelper.ts)
 */

import type {
  DeductionItem,
  IncomeSummary,
  MonthKey,
  PeriodComputation,
  PitForm,
  Pp30Row,
  TaxDataset,
  VatStatus,
} from '../../types/tax';
import { summarizeExpenses, summarizeExpensesForMonth, summarizeIncome, summarizeIncomeForMonth } from './aggregate';
import { computeIncomeTax } from './pit';
import { buildPP30Series } from './pp30';
import { monthOf, monthsOfYear, periodRange, thisMonthKey } from './period';
import { num, r2 } from './money';
import { vatStatus } from './vat';

/** รวมค่าลดหย่อนอื่นตามแบบ — ใช้ช่องของแบบนั้นเท่านั้น ห้ามเอาของอีกแบบมาใช้ */
export function totalDeductions(
  deductions: readonly DeductionItem[],
  form: PitForm,
): number {
  const key = form === 'PND94' ? 'amountPND94' : 'amountPND90';
  return r2(deductions.reduce((sum, d) => sum + num(d[key]), 0));
}

/**
 * คำนวณครบชุดสำหรับรอบภาษีหนึ่ง
 *
 * สำหรับ PND90 จะคำนวณ PND94 ซ้อนให้ด้วยเพื่อ
 *   1) ใช้ประมาณการภาษีครึ่งปี ถ้าผู้ใช้ยังไม่บันทึกยอดที่จ่ายจริง
 *   2) ทำตารางเทียบครึ่งปี vs สิ้นปี
 */
export function computePeriod(
  dataset: TaxDataset,
  year: number,
  form: PitForm,
): PeriodComputation {
  const { from, to, months } = periodRange(year, form);
  const income = summarizeIncome(dataset.incomes, from, to);
  const expense = summarizeExpenses(dataset.expenses, from, to);
  const s = dataset.settings;

  const filing =
    dataset.pitFilings.find((f) => f.year === year && f.form === form) ?? null;
  const withholdingTax = num(filing?.withholdingTax);

  let pnd94Paid = 0;
  let pnd94IsEstimate = false;
  let pnd94Result: PeriodComputation | null = null;

  if (form === 'PND90') {
    pnd94Result = computePeriod(dataset, year, 'PND94');
    const f94 = dataset.pitFilings.find((f) => f.year === year && f.form === 'PND94');
    if (f94 && f94.taxPaid != null) {
      pnd94Paid = num(f94.taxPaid);
    } else {
      // ยังไม่บันทึกยอดจ่ายจริง → ใช้ประมาณการ และต้องบอกผู้ใช้ว่าเป็นประมาณการ
      pnd94Paid = pnd94Result.tax.payable;
      pnd94IsEstimate = true;
    }
  }

  const tax = computeIncomeTax({
    form,
    incomeA: income.incomeA,
    incomeB: income.incomeB,
    expenseA: { ...s.expenseA, actualAmount: expense.expenseA },
    expenseB: { ...s.expenseB, actualAmount: expense.expenseB },
    taxpayerType: s.taxpayerType,
    otherDeductions: totalDeductions(dataset.deductions, form),
    minTaxRule: s.minTaxRule,
    withholdingTax,
    pnd94Paid,
    capExpensePerBucket: s.capExpensePerBucket,
  });

  return {
    year,
    form,
    from,
    to,
    months,
    income,
    expense,
    tax,
    filing,
    pnd94Paid,
    pnd94IsEstimate,
    pnd94Result,
  };
}

/**
 * สถานะ VAT ล่าสุด — ใช้เดือนปัจจุบัน หรือเดือนที่มีข้อมูลล่าสุดถ้าข้อมูลล้ำอนาคต
 * (เจ้าของหอบางรายบันทึกรายรับล่วงหน้า)
 */
export function latestVatStatus(dataset: TaxDataset): VatStatus {
  const months = dataset.incomes.map((r) => monthOf(r.date)).filter(Boolean).sort();
  const now = thisMonthKey();
  const last = months.length ? months[months.length - 1] : now;
  const asOf = last > now ? last : now;
  return vatStatus(dataset.incomes, asOf, dataset.settings);
}

export interface MonthlyRow {
  period: MonthKey;
  income: IncomeSummary;
  expenseTotal: number;
  inputVat: number;
  /** ยอด 40(8) ย้อนหลัง 12 เดือนของเดือนนั้น */
  rolling12: number;
  overThreshold: boolean;
  pp30: Pp30Row | null;
}

/** ตารางรายเดือนของหน้าภาพรวม */
export function monthlyBreakdown(dataset: TaxDataset, year: number): MonthlyRow[] {
  const pp30Map = new Map(
    buildPP30Series(
      dataset.incomes,
      dataset.expenses,
      dataset.settings,
      dataset.pp30Filings,
    ).map((r) => [r.period, r]),
  );

  return monthsOfYear(year).map((period) => {
    const income = summarizeIncomeForMonth(dataset.incomes, period);
    const exp = summarizeExpensesForMonth(dataset.expenses, period);
    const st = vatStatus(dataset.incomes, period, dataset.settings);
    return {
      period,
      income,
      expenseTotal: exp.total,
      inputVat: exp.inputVat,
      rolling12: st.rolling12,
      overThreshold: st.exceeded,
      pp30: pp30Map.get(period) ?? null,
    };
  });
}

/** มีข้อมูลอะไรในปีนี้บ้าง — ใช้ตัดสินใจว่าจะแสดง empty state หรือไม่ */
export function hasDataForYear(dataset: TaxDataset, year: number): boolean {
  const prefix = String(year);
  return (
    dataset.incomes.some((r) => String(r.date).startsWith(prefix)) ||
    dataset.expenses.some((r) => String(r.date).startsWith(prefix))
  );
}

/** ปีที่มีข้อมูล เรียงใหม่ก่อน — ใช้ทำ dropdown เลือกปีภาษี */
export function availableYears(dataset: TaxDataset): number[] {
  const years = new Set<number>([new Date().getFullYear()]);
  for (const r of [...dataset.incomes, ...dataset.expenses]) {
    const y = Number.parseInt(String(r.date).slice(0, 4), 10);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}
