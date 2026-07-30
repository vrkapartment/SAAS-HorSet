/**
 * สรุปยอดตามช่วงเวลา
 *
 * ผลลัพธ์ incomeA / incomeB คือ "ฐานรายได้ที่ถอด VAT ออกแล้ว" พร้อมส่งเข้า computeIncomeTax ทันที
 * outputVat ถูกแยกออกมาเป็นฟิลด์ต่างหาก — นี่คือจุดที่รับประกันว่า VAT ไม่ปนฐานรายได้
 */

import type {
  DateKey,
  ExpenseRow,
  ExpenseSummary,
  IncomeRow,
  IncomeSummary,
  MonthKey,
} from '../../types/tax';
import { num, r2 } from './money';
import { inRange, monthRange } from './period';

export function summarizeIncome(
  incomes: readonly IncomeRow[],
  from: DateKey,
  to: DateKey,
): IncomeSummary {
  let incomeA = 0;
  let incomeB = 0;
  let outputVat = 0;
  const byCategory: Record<string, number> = {};

  for (const e of incomes) {
    if (!inRange(e.date, from, to)) continue;
    const base = num(e.base);
    if (e.bucket === 'A') {
      incomeA += base;
    } else {
      incomeB += base;
      outputVat += num(e.vat);
      const key = e.category || 'อื่นๆ';
      byCategory[key] = r2((byCategory[key] || 0) + base);
    }
  }

  return {
    incomeA: r2(incomeA),
    incomeB: r2(incomeB),
    total: r2(incomeA + incomeB),
    outputVat: r2(outputVat),
    grossReceipts: r2(incomeA + incomeB + outputVat),
    byCategory,
  };
}

export function summarizeExpenses(
  expenses: readonly ExpenseRow[],
  from: DateKey,
  to: DateKey,
): ExpenseSummary {
  let expenseA = 0;
  let expenseB = 0;
  let inputVat = 0;

  for (const x of expenses) {
    if (!inRange(x.date, from, to)) continue;
    const base = num(x.base);
    if (x.bucket === 'A') expenseA += base;
    else expenseB += base;
    // undefined ถือว่าขอเครดิตได้ — ต้องติ๊ก false ชัดเจนเท่านั้นจึงไม่นับ
    if (x.claimInputVat !== false) inputVat += num(x.vat);
  }

  return {
    expenseA: r2(expenseA),
    expenseB: r2(expenseB),
    total: r2(expenseA + expenseB),
    inputVat: r2(inputVat),
  };
}

export function summarizeIncomeForMonth(
  incomes: readonly IncomeRow[],
  period: MonthKey,
): IncomeSummary {
  const { from, to } = monthRange(period);
  return summarizeIncome(incomes, from, to);
}

export function summarizeExpensesForMonth(
  expenses: readonly ExpenseRow[],
  period: MonthKey,
): ExpenseSummary {
  const { from, to } = monthRange(period);
  return summarizeExpenses(expenses, from, to);
}

/** ภาษีซื้อทั้งหมดในเดือน รวมที่ขอเครดิตไม่ได้ — ใช้แสดงให้ผู้ใช้เห็นความต่าง */
export function totalInputVatIncludingUnclaimable(
  expenses: readonly ExpenseRow[],
  from: DateKey,
  to: DateKey,
): number {
  let total = 0;
  for (const x of expenses) {
    if (inRange(x.date, from, to)) total += num(x.vat);
  }
  return r2(total);
}
