/**
 * แบบ ภ.พ.30 (ภาษีมูลค่าเพิ่มรายเดือน)
 *
 * สูตร:  ภาษีขาย − ภาษีซื้อ − เครดิตยกมา
 *   ผลบวก → ต้องโอนจ่ายสรรพากร
 *   ผลลบ  → ยกไปเครดิตเดือนถัดไป / ขอคืน
 *
 * buildPP30Series ส่งเครดิตต่อกันเป็นสายโซ่ให้อัตโนมัติ — อย่าคำนวณเดือนเดี่ยวๆ
 * แล้วเก็บ carryForward ลง DB เอง เพราะถ้าผู้ใช้ย้อนไปแก้ใบกำกับเดือนก่อน
 * เครดิตของทุกเดือนถัดไปต้องคิดใหม่ทั้งสาย
 */

import type {
  ExpenseRow,
  IncomeRow,
  MonthKey,
  Pp30Filing,
  Pp30Result,
  Pp30Row,
  TaxSettings,
} from '../../types/tax';
import { summarizeExpensesForMonth, summarizeIncomeForMonth } from './aggregate';
import { VAT_RATE } from './constants';
import { clamp0, num, r2 } from './money';
import { monthDiff, monthOf, monthsBetween } from './period';
import { vatStatus } from './vat';

export function computePP30(input: {
  outputVat: number | string;
  inputVat: number | string;
  creditBrought?: number | string;
}): Pp30Result {
  const out = r2(num(input.outputVat));
  const inp = r2(num(input.inputVat));
  const credit = r2(num(input.creditBrought ?? 0));
  const net = r2(out - inp - credit);
  return {
    outputVat: out,
    inputVat: inp,
    creditBrought: credit,
    net,
    payable: r2(clamp0(net)),
    carryForward: r2(clamp0(-net)),
    status: net > 0 ? 'pay' : net < 0 ? 'credit' : 'zero',
  };
}

/**
 * สร้างแถว ภ.พ.30 ทุกเดือนที่ต้องยื่น พร้อมเครดิตยกมาที่ต่อกันแล้ว
 *
 * คืน [] เมื่อยังไม่จดทะเบียน VAT — หน้า UI ควรซ่อนทั้งหน้าในกรณีนี้
 *
 * @param incomes  รายรับทั้งหมด (ทุกปี — ต้องเห็นข้อมูลข้ามปีเพื่อคิด rolling 12 เดือน)
 * @param expenses ค่าใช้จ่ายทั้งหมด
 * @param filings  บันทึกการยื่นที่มีอยู่ (inputVatManual จะทับค่าจากสมุดค่าใช้จ่าย)
 */
export function buildPP30Series(
  incomes: readonly IncomeRow[],
  expenses: readonly ExpenseRow[],
  settings: Partial<TaxSettings>,
  filings: readonly Pp30Filing[] = [],
): Pp30Row[] {
  const rate = Number.isFinite(settings?.vatRate) ? (settings.vatRate as number) : VAT_RATE;
  const registeredFrom = settings?.vatRegisteredFrom ?? null;

  const dates = [...incomes, ...expenses]
    .map((r) => monthOf(r.date))
    .filter(Boolean)
    .sort();
  if (!dates.length) return [];

  // เริ่มจากเดือนที่จด VAT มีผล หรือเดือนแรกที่มีข้อมูล แล้วแต่อันไหนช้ากว่า
  const start =
    registeredFrom && monthDiff(registeredFrom, dates[0]) > 0 ? registeredFrom : dates[0];
  const end = dates[dates.length - 1];
  const filingMap = new Map(filings.map((f) => [f.period, f]));

  const rows: Pp30Row[] = [];
  let credit = num(settings?.vatOpeningCredit);

  for (const period of monthsBetween(start, end)) {
    const status = vatStatus(incomes, period, settings);
    // ยังไม่จด / ยังไม่ถึงเดือนที่มีผล → ไม่มีแบบ ภ.พ.30
    if (!status.charging) continue;

    const inc = summarizeIncomeForMonth(incomes, period);
    const exp = summarizeExpensesForMonth(expenses, period);
    const filing = filingMap.get(period);
    const inputVat =
      filing && filing.inputVatManual != null ? num(filing.inputVatManual) : exp.inputVat;

    const calc = computePP30({
      outputVat: inc.outputVat,
      inputVat,
      creditBrought: credit,
    });

    rows.push({
      period,
      rate,
      serviceBase: inc.incomeB,
      ...calc,
      inputVatFromLedger: exp.inputVat,
      inputVatManual: filing?.inputVatManual ?? null,
      filed: Boolean(filing?.filedAt),
      filedAt: filing?.filedAt ?? null,
      note: filing?.note ?? '',
    });

    credit = calc.carryForward;
  }

  return rows;
}

/** กรองเฉพาะปีที่ต้องการ (คิดสายเครดิตจากทั้งหมดก่อนแล้วค่อยกรอง) */
export function pp30RowsForYear(rows: readonly Pp30Row[], year: number): Pp30Row[] {
  return rows.filter((r) => r.period.startsWith(String(year)));
}

export interface Pp30YearTotals {
  outputVat: number;
  inputVat: number;
  payable: number;
  serviceBase: number;
  monthsToPay: number;
  /** เครดิตคงเหลือจากเดือนสุดท้ายของปี */
  closingCredit: number;
}

export function pp30YearTotals(rows: readonly Pp30Row[]): Pp30YearTotals {
  const t = rows.reduce(
    (acc, r) => ({
      outputVat: acc.outputVat + r.outputVat,
      inputVat: acc.inputVat + r.inputVat,
      payable: acc.payable + r.payable,
      serviceBase: acc.serviceBase + r.serviceBase,
    }),
    { outputVat: 0, inputVat: 0, payable: 0, serviceBase: 0 },
  );
  return {
    outputVat: r2(t.outputVat),
    inputVat: r2(t.inputVat),
    payable: r2(t.payable),
    serviceBase: r2(t.serviceBase),
    monthsToPay: rows.filter((r) => r.payable > 0).length,
    closingCredit: rows.length ? rows[rows.length - 1].carryForward : 0,
  };
}

/** กำหนดยื่น: วันที่ 15 ของเดือนถัดไป (ยื่นออนไลน์ถึงวันที่ 23) */
export function pp30DueDate(period: MonthKey): { paper: string; online: string } {
  const [y, m] = period.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const mm = String(nm).padStart(2, '0');
  return { paper: `${ny}-${mm}-15`, online: `${ny}-${mm}-23` };
}
