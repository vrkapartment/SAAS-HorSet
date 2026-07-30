/**
 * ชุดทดสอบแกนคำนวณ — 47 เคส (port มาจาก import-temp/exported-feature/tests/tax.test.ts)
 *
 * ใช้กับ VAT/ภ.พ.30 เท่านั้น — ไม่ใช่ชุดทดสอบของ src/lib/thaiTax.ts (engine ที่ใช้ยื่นจริง)
 *
 *   npm i -D vitest   (ติดตั้งแล้ว)
 *   npx vitest run src/lib/tax/__tests__
 */

import { describe, expect, it } from 'vitest';

import type { ExpenseRow, IncomeRow } from '../../../types/tax';
import {
  PERSONAL_ALLOWANCE,
  VAT_RATE,
  VAT_THRESHOLD,
  addMonths,
  addVat,
  buildPP30Series,
  computeIncomeTax,
  computePP30,
  expenseDeduction,
  firstThresholdBreach,
  monthDiff,
  monthsBetween,
  normalizeAmount,
  num,
  periodRange,
  progressiveTax,
  r2,
  splitVatFromGross,
  summarizeExpenses,
  summarizeIncome,
  vatStatus,
} from '..';

const inc = (
  date: string,
  bucket: 'A' | 'B',
  base: number,
  vat = 0,
  category = '',
): IncomeRow => ({ id: `${date}-${bucket}-${base}`, date, bucket, base, vat, category });

/* ================================================================== */
describe('ตัวช่วยตัวเลข/เดือน', () => {
  it('r2 ปัดสตางค์ถูกต้อง', () => {
    expect(r2(0.1 + 0.2)).toBe(0.3);
    expect(r2(1234.5649)).toBe(1234.56);
    expect(r2(1234.565)).toBe(1234.57);
    expect(r2(NaN)).toBe(0);
  });

  it('num อ่านสตริงมี comma ได้', () => {
    expect(num('1,800,000.50')).toBe(1800000.5);
    expect(num('฿ 12,000')).toBe(12000);
    expect(num('abc')).toBe(0);
  });

  it('addMonths ข้ามปีทั้งสองทาง', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-01', -11)).toBe('2025-02');
    expect(addMonths('2025-12', 1)).toBe('2026-01');
    expect(addMonths('2026-06', 12)).toBe('2027-06');
  });

  it('monthDiff / monthsBetween', () => {
    expect(monthDiff('2026-01', '2025-01')).toBe(12);
    expect(monthsBetween('2026-01', '2026-03')).toHaveLength(3);
    expect(monthsBetween('2026-03', '2026-01')).toEqual([]);
  });

  it('periodRange ตัดรอบตามสเปค', () => {
    expect(periodRange(2026, 'PND94')).toEqual({
      from: '2026-01-01', to: '2026-06-30', months: 6,
    });
    expect(periodRange(2026, 'PND90')).toEqual({
      from: '2026-01-01', to: '2026-12-31', months: 12,
    });
  });
});

/* ================================================================== */
describe('VAT 7%', () => {
  it('ถอด VAT จากยอดรวม', () => {
    const s = splitVatFromGross(1070);
    expect(s.base).toBe(1000);
    expect(s.vat).toBe(70);
    expect(r2(s.base + s.vat)).toBe(1070);
  });

  it('บวก VAT จากฐาน', () => {
    expect(addVat(1000)).toEqual({ base: 1000, vat: 70, total: 1070 });
  });

  it('base + vat = total เสมอ แม้ยอดหาร 1.07 ไม่ลงตัว', () => {
    for (const gross of [100, 999.99, 1234.56, 7777, 3333.33]) {
      const s = splitVatFromGross(gross);
      expect(r2(s.base + s.vat)).toBe(r2(gross));
    }
  });

  it('ตะกร้า A ไม่มี VAT เด็ดขาด แม้จด VAT แล้ว', () => {
    const n = normalizeAmount({ bucket: 'A', amount: 5000, vatApplies: true });
    expect(n.vat).toBe(0);
    expect(n.base).toBe(5000);
  });

  it('ตะกร้า B ไม่คิด VAT เมื่อยังไม่จด', () => {
    const n = normalizeAmount({ bucket: 'B', amount: 5000, vatApplies: false });
    expect(n.vat).toBe(0);
    expect(n.base).toBe(5000);
  });

  it('ตะกร้า B คิด VAT เมื่อจดแล้ว', () => {
    expect(normalizeAmount({ bucket: 'B', amount: 1000, vatApplies: true }))
      .toEqual({ base: 1000, vat: 70, total: 1070 });
    expect(normalizeAmount({ bucket: 'B', amount: 1070, amountIsGross: true, vatApplies: true }))
      .toEqual({ base: 1000, vat: 70, total: 1070 });
  });
});

/* ================================================================== */
describe('เกณฑ์ 1.8 ล้าน / 12 เดือนเคลื่อนที่', () => {
  it('นับเฉพาะ 40(8) ไม่นับค่าเช่า 40(5)', () => {
    const rows = [inc('2026-01-31', 'A', 5_000_000), inc('2026-01-31', 'B', 100_000)];
    const st = vatStatus(rows, '2026-01', {});
    expect(st.rolling12).toBe(100_000);
    expect(st.exceeded).toBe(false);
  });

  it('หน้าต่างเคลื่อนที่ 12 เดือน รวมเดือนปัจจุบัน', () => {
    const rows = monthsBetween('2025-02', '2026-01').map((m) => inc(`${m}-15`, 'B', 100_000));
    const st = vatStatus(rows, '2026-01', {});
    expect(st.windowStart).toBe('2025-02');
    expect(st.rolling12).toBe(1_200_000);
    // เดือนที่หลุดหน้าต่างต้องไม่ถูกนับ
    expect(vatStatus(rows, '2026-02', {}).rolling12).toBe(1_100_000);
  });

  it('เกินเกณฑ์ต้องขึ้นคำเตือนให้จด VAT พร้อมลิงก์สรรพากร', () => {
    const rows = monthsBetween('2026-01', '2026-12').map((m) => inc(`${m}-15`, 'B', 200_000));
    const st = vatStatus(rows, '2026-12', {});
    expect(st.rolling12).toBe(2_400_000);
    expect(st.exceeded).toBe(true);
    expect(st.mustRegisterWarning).toBe(true);
    expect(st.rdUrl).toBe('https://www.rd.go.th');
    expect(st.charging).toBe(false); // ยังไม่จด → ยังไม่คิด VAT
  });

  it('พอดี 1.8 ล้าน ยังไม่เกิน (ต้อง "เกิน" จริง)', () => {
    expect(vatStatus([inc('2026-06-30', 'B', VAT_THRESHOLD)], '2026-06', {}).exceeded).toBe(false);
    expect(vatStatus([inc('2026-06-30', 'B', VAT_THRESHOLD + 0.01)], '2026-06', {}).exceeded).toBe(true);
  });

  it('charging ขึ้นกับเดือนที่จด VAT มีผล', () => {
    const rows = [inc('2026-01-15', 'B', 100)];
    const s = { vatRegistered: true, vatRegisteredFrom: '2026-03' };
    expect(vatStatus(rows, '2026-02', s).charging).toBe(false);
    expect(vatStatus(rows, '2026-03', s).charging).toBe(true);
    expect(vatStatus(rows, '2026-04', s).charging).toBe(true);
  });

  it('firstThresholdBreach หาเดือนแรกที่ทะลุเกณฑ์', () => {
    const rows = monthsBetween('2026-01', '2026-12').map((m) => inc(`${m}-15`, 'B', 200_000));
    // 200k × 9 = 1.8M พอดี (ยังไม่เกิน), 200k × 10 = 2.0M > 1.8M
    expect(firstThresholdBreach(rows, {})?.month).toBe('2026-10');
  });
});

/* ================================================================== */
describe('สรุปยอด — VAT ห้ามปนฐานรายได้', () => {
  it('summarizeIncome แยก base / outputVat', () => {
    const rows = [
      inc('2026-01-05', 'A', 30_000),
      inc('2026-01-10', 'B', 10_000, 700, 'ค่าบริการ'),
      inc('2026-01-20', 'B', 5_000, 350, 'ค่าส่วนกลาง'),
      inc('2026-07-01', 'B', 99_999, 7_000), // นอกช่วง
    ];
    const s = summarizeIncome(rows, '2026-01-01', '2026-06-30');
    expect(s.incomeA).toBe(30_000);
    expect(s.incomeB).toBe(15_000); // ฐาน 40(8) ต้องไม่รวม VAT
    expect(s.outputVat).toBe(1_050);
    expect(s.grossReceipts).toBe(46_050);
    expect(s.byCategory).toEqual({ 'ค่าบริการ': 10_000, 'ค่าส่วนกลาง': 5_000 });
  });

  it('summarizeExpenses แยกตะกร้าและภาษีซื้อ', () => {
    const rows: ExpenseRow[] = [
      { id: '1', date: '2026-02-01', bucket: 'A', base: 1_000, vat: 0 },
      { id: '2', date: '2026-02-02', bucket: 'B', base: 2_000, vat: 140 },
      { id: '3', date: '2026-02-03', bucket: 'B', base: 3_000, vat: 210, claimInputVat: false },
    ];
    const s = summarizeExpenses(rows, '2026-01-01', '2026-12-31');
    expect(s.expenseA).toBe(1_000);
    expect(s.expenseB).toBe(5_000);
    expect(s.inputVat).toBe(140); // ที่ไม่ขอเครดิตต้องไม่ถูกนับ
  });
});

/* ================================================================== */
describe('ภ.พ.30', () => {
  it('ภาษีขายมากกว่าภาษีซื้อ → ต้องจ่าย', () => {
    const r = computePP30({ outputVat: 10_000, inputVat: 4_000 });
    expect(r.net).toBe(6_000);
    expect(r.payable).toBe(6_000);
    expect(r.carryForward).toBe(0);
    expect(r.status).toBe('pay');
  });

  it('ภาษีซื้อมากกว่าภาษีขาย → ยกไปเครดิต/ขอคืน', () => {
    const r = computePP30({ outputVat: 3_000, inputVat: 8_000 });
    expect(r.net).toBe(-5_000);
    expect(r.payable).toBe(0);
    expect(r.carryForward).toBe(5_000);
    expect(r.status).toBe('credit');
  });

  it('เครดิตยกมาถูกนำมาหักด้วย', () => {
    expect(computePP30({ outputVat: 10_000, inputVat: 2_000, creditBrought: 5_000 }).payable)
      .toBe(3_000);
  });

  it('สายโซ่รายเดือน ส่งเครดิตยกมาต่อกันถูกต้อง', () => {
    const incomes = [
      inc('2026-01-31', 'B', 100_000, 7_000),
      inc('2026-02-28', 'B', 100_000, 7_000),
      inc('2026-03-31', 'B', 100_000, 7_000),
    ];
    const expenses: ExpenseRow[] = [
      { id: 'e1', date: '2026-01-15', bucket: 'B', base: 300_000, vat: 21_000 },
      { id: 'e2', date: '2026-02-15', bucket: 'B', base: 10_000, vat: 700 },
      { id: 'e3', date: '2026-03-15', bucket: 'B', base: 10_000, vat: 700 },
    ];
    const settings = { vatRegistered: true, vatRegisteredFrom: '2026-01' };
    const series = buildPP30Series(incomes, expenses, settings);

    expect(series).toHaveLength(3);
    // ม.ค.: 7,000 − 21,000 = −14,000 → ยกไป 14,000
    expect(series[0].carryForward).toBe(14_000);
    expect(series[0].payable).toBe(0);
    // ก.พ.: 7,000 − 700 − 14,000 = −7,700
    expect(series[1].creditBrought).toBe(14_000);
    expect(series[1].carryForward).toBe(7_700);
    // มี.ค.: 7,000 − 700 − 7,700 = −1,400
    expect(series[2].creditBrought).toBe(7_700);
    expect(series[2].carryForward).toBe(1_400);
  });

  it('ยังไม่จด VAT → ไม่มีแถว ภ.พ.30', () => {
    expect(buildPP30Series([inc('2026-01-31', 'B', 100_000)], [], { vatRegistered: false }))
      .toHaveLength(0);
  });

  it('ภาษีซื้อที่กรอกมือ (ก่อนกดยื่น) ทับค่าจากสมุดบัญชี', () => {
    const incomes = [inc('2026-05-31', 'B', 100_000, 7_000)];
    const expenses: ExpenseRow[] = [
      { id: 'e', date: '2026-05-01', bucket: 'B', base: 1_000, vat: 70 },
    ];
    const series = buildPP30Series(
      incomes,
      expenses,
      { vatRegistered: true, vatRegisteredFrom: '2026-05' },
      [{ period: '2026-05', inputVatManual: 5_000 }],
    );
    expect(series[0].inputVat).toBe(5_000);
    expect(series[0].inputVatFromLedger).toBe(70);
    expect(series[0].payable).toBe(2_000);
  });
});

/* ================================================================== */
describe('อัตราภาษีขั้นบันได', () => {
  it('เงินได้สุทธิไม่เกิน 150,000 ไม่เสียภาษี', () => {
    expect(progressiveTax(150_000).tax).toBe(0);
    expect(progressiveTax(0).tax).toBe(0);
    expect(progressiveTax(-99).tax).toBe(0);
  });

  it('จุดตัดแต่ละขั้นถูกต้อง', () => {
    expect(progressiveTax(300_000).tax).toBe(7_500);
    expect(progressiveTax(500_000).tax).toBe(27_500);
    expect(progressiveTax(750_000).tax).toBe(65_000);
    expect(progressiveTax(1_000_000).tax).toBe(115_000);
    expect(progressiveTax(2_000_000).tax).toBe(365_000);
    expect(progressiveTax(5_000_000).tax).toBe(1_265_000);
    expect(progressiveTax(6_000_000).tax).toBe(1_615_000);
  });

  it('รายละเอียดขั้นบันไดรวมกันเท่ากับภาษีรวม', () => {
    const p = progressiveTax(1_234_567);
    expect(r2(p.steps.reduce((s, x) => s + x.tax, 0))).toBe(p.tax);
    expect(r2(p.steps.reduce((s, x) => s + x.amount, 0))).toBe(1_234_567);
  });
});

/* ================================================================== */
describe('หักค่าใช้จ่าย', () => {
  it('หักเหมาตามอัตรา', () => {
    expect(expenseDeduction(1_000_000, { mode: 'lump', lumpRate: 0.3 }).deduction).toBe(300_000);
  });

  it('หักจริงตามยอดที่บันทึก (ไม่เกินรายได้)', () => {
    const d = expenseDeduction(1_000_000, { mode: 'actual', actualAmount: 420_000 });
    expect(d.deduction).toBe(420_000);
    expect(d.capped).toBe(false);
    expect(d.exceedsIncome).toBe(false);
  });

  it('ค่าเริ่มต้น (capPerBucket ปิด): หักจริงเกินรายได้ของตะกร้า → หักเต็มจำนวน ไม่ตัด แต่ขึ้นสัญญาณ exceedsIncome', () => {
    const d = expenseDeduction(100_000, { mode: 'actual', actualAmount: 250_000 });
    expect(d.deduction).toBe(250_000);
    expect(d.capped).toBe(false);
    expect(d.exceedsIncome).toBe(true);
  });

  it('เปิด capPerBucket (โหมดระมัดระวัง): หักจริงเกินรายได้ของตะกร้า → ถูกจำกัดไม่ให้เกินรายได้ (พฤติกรรมเดิม)', () => {
    const d = expenseDeduction(100_000, { mode: 'actual', actualAmount: 250_000 }, true);
    expect(d.deduction).toBe(100_000);
    expect(d.capped).toBe(true);
    expect(d.exceedsIncome).toBe(true);
  });
});

/* ================================================================== */
describe('หักค่าใช้จ่ายจริงข้ามตะกร้า (เคส C8 — เทียบกับแกนคำนวณจริงของ SAAS HorSet)', () => {
  const base = {
    form: 'PND90' as const,
    taxpayerType: 'individual' as const,
    incomeA: 100_000,
    incomeB: 500_000,
    expenseA: { mode: 'actual' as const, lumpRate: 0, actualAmount: 400_000 },
    expenseB: { mode: 'actual' as const, lumpRate: 0, actualAmount: 100_000 },
    minTaxRule: { enabled: false },
  };

  it('ค่าเริ่มต้น (capExpensePerBucket ปิด) — หักข้ามตะกร้าได้ ตรงกับแกนคำนวณจริง → ภาษี 0', () => {
    const r = computeIncomeTax(base);
    expect(r.expense.a.deduction).toBe(400_000);
    expect(r.expense.a.capped).toBe(false);
    expect(r.expense.a.exceedsIncome).toBe(true);
    expect(r.afterExpense).toBe(100_000); // (100,000−400,000) + (500,000−100,000)
    expect(r.netIncome).toBe(40_000); // 100,000 − 60,000 (ค่าลดหย่อนส่วนตัว บุคคลธรรมดา/PND90)
    expect(r.taxBeforeCredits).toBe(0); // 40,000 อยู่ในขั้น 0% ทั้งก้อน
    expect(r.crossBucketDeduction.triggered).toBe(true);
    expect(r.crossBucketDeduction.buckets).toEqual(['A']);
    expect(r.crossBucketDeduction.capExpensePerBucket).toBe(false);
  });

  it('เปิด capExpensePerBucket (โหมดระมัดระวัง) — จำกัดต่อตะกร้า → คืนตัวเลขแบบเดิมก่อนแก้ (ภาษี 11,500)', () => {
    const r = computeIncomeTax({ ...base, capExpensePerBucket: true });
    expect(r.expense.a.deduction).toBe(100_000);
    expect(r.expense.a.capped).toBe(true);
    expect(r.expense.a.exceedsIncome).toBe(true);
    expect(r.afterExpense).toBe(400_000);
    expect(r.netIncome).toBe(340_000);
    expect(r.taxBeforeCredits).toBe(11_500);
    // สัญญาณเตือนเอกสารยังต้องขึ้น แม้จะจำกัดยอดหักแล้ว — ความเสี่ยงเรื่องเอกสารไม่ขึ้นกับโหมดคำนวณ
    expect(r.crossBucketDeduction.triggered).toBe(true);
    expect(r.crossBucketDeduction.capExpensePerBucket).toBe(true);
  });
});

/* ================================================================== */
describe('ภ.ง.ด.94 ครึ่งปี', () => {
  const base = {
    form: 'PND94' as const,
    incomeA: 900_000,
    incomeB: 300_000,
    expenseA: { mode: 'lump' as const, lumpRate: 0.3 },
    expenseB: { mode: 'lump' as const, lumpRate: 0.6 },
    minTaxRule: { enabled: false },
  };

  it('บุคคลธรรมดา หักส่วนตัว 30,000', () => {
    const r = computeIncomeTax({ ...base, taxpayerType: 'individual' });
    expect(r.deductions.personalAllowance).toBe(30_000);
    expect(r.expense.a.deduction).toBe(270_000);
    expect(r.expense.b.deduction).toBe(180_000);
    expect(r.afterExpense).toBe(750_000);
    expect(r.netIncome).toBe(720_000);
    // 150k×5% + 200k×10% + 220k×15% = 7,500 + 20,000 + 33,000
    expect(r.taxBeforeCredits).toBe(60_500);
    expect(r.payable).toBe(60_500);
  });

  it('ห้างหุ้นส่วนสามัญ หักส่วนตัว 60,000', () => {
    const r = computeIncomeTax({ ...base, taxpayerType: 'partnership' });
    expect(r.deductions.personalAllowance).toBe(60_000);
    expect(r.netIncome).toBe(690_000);
    expect(r.taxBeforeCredits).toBe(56_000);
  });

  it('ค่าลดหย่อนของครึ่งปีต้องไม่ใช่ตัวเลขของสิ้นปี', () => {
    expect(PERSONAL_ALLOWANCE.PND94.individual).toBe(30_000);
    expect(PERSONAL_ALLOWANCE.PND94.partnership).toBe(60_000);
    expect(PERSONAL_ALLOWANCE.PND94.individual).not.toBe(PERSONAL_ALLOWANCE.PND90.individual);
    expect(PERSONAL_ALLOWANCE.PND94.partnership).not.toBe(PERSONAL_ALLOWANCE.PND90.partnership);
  });

  it('ค่าลดหย่อนเกินเงินได้หลังหักค่าใช้จ่าย → เงินได้สุทธิเป็น 0 ไม่ติดลบ', () => {
    const r = computeIncomeTax({
      ...base, incomeA: 20_000, incomeB: 0,
      taxpayerType: 'individual', otherDeductions: 100_000,
    });
    expect(r.netIncome).toBe(0);
    expect(r.taxBeforeCredits).toBe(0);
    expect(r.deductions.capped).toBe(true);
  });

  it('VAT ที่เก็บจากผู้เช่าไม่ถูกนำมาเป็นรายได้', () => {
    const incomes = [inc('2026-03-01', 'A', 600_000), inc('2026-03-02', 'B', 200_000, 14_000)];
    const s = summarizeIncome(incomes, '2026-01-01', '2026-06-30');
    const r = computeIncomeTax({
      ...base, incomeA: s.incomeA, incomeB: s.incomeB, taxpayerType: 'individual',
    });
    // ต้องเป็น 800,000 ไม่ใช่ 814,000
    expect(r.income.gross).toBe(800_000);
  });
});

/* ================================================================== */
describe('ภ.ง.ด.90 สิ้นปี + หักกลบครึ่งปี', () => {
  const base = {
    form: 'PND90' as const,
    incomeA: 1_800_000,
    incomeB: 600_000,
    expenseA: { mode: 'lump' as const, lumpRate: 0.3 },
    expenseB: { mode: 'lump' as const, lumpRate: 0.6 },
    taxpayerType: 'individual' as const,
    minTaxRule: { enabled: false },
  };

  it('บุคคลธรรมดา หักส่วนตัว 60,000', () => {
    const r = computeIncomeTax(base);
    expect(r.deductions.personalAllowance).toBe(60_000);
    expect(r.afterExpense).toBe(1_500_000);
    expect(r.netIncome).toBe(1_440_000);
    expect(r.taxBeforeCredits).toBe(225_000);
  });

  it('ห้างหุ้นส่วนสามัญ หักส่วนตัว 120,000', () => {
    const r = computeIncomeTax({ ...base, taxpayerType: 'partnership' });
    expect(r.deductions.personalAllowance).toBe(120_000);
    expect(r.netIncome).toBe(1_380_000);
    expect(r.taxBeforeCredits).toBe(210_000);
  });

  it('หักภาษีครึ่งปีที่จ่ายแล้ว → จ่ายเพิ่มส่วนต่าง', () => {
    const r = computeIncomeTax({ ...base, pnd94Paid: 60_500 });
    expect(r.credits.pnd94Paid).toBe(60_500);
    expect(r.balance).toBe(164_500);
    expect(r.payable).toBe(164_500);
    expect(r.refundable).toBe(0);
    expect(r.status).toBe('pay');
  });

  it('จ่ายครึ่งปีไว้เกิน → ขอคืน', () => {
    const r = computeIncomeTax({ ...base, pnd94Paid: 300_000 });
    expect(r.balance).toBe(-75_000);
    expect(r.payable).toBe(0);
    expect(r.refundable).toBe(75_000);
    expect(r.status).toBe('refund');
  });

  it('ภาษีหัก ณ ที่จ่าย ถูกนำมาเครดิตด้วย', () => {
    const r = computeIncomeTax({ ...base, pnd94Paid: 60_500, withholdingTax: 24_500 });
    expect(r.credits.total).toBe(85_000);
    expect(r.payable).toBe(140_000);
  });

  it('ภ.ง.ด.94 ไม่รับเครดิตภาษีครึ่งปี (ไม่มีให้หัก)', () => {
    expect(computeIncomeTax({ ...base, form: 'PND94', pnd94Paid: 999_999 }).credits.pnd94Paid)
      .toBe(0);
  });
});

/* ================================================================== */
describe('ภาษีขั้นต่ำ 0.5% (มาตรา 48(2))', () => {
  const base = {
    form: 'PND90' as const,
    incomeA: 0,
    incomeB: 2_000_000,
    expenseA: { mode: 'lump' as const, lumpRate: 0.3 },
    // หักจริงจนเงินได้สุทธิ = 0
    expenseB: { mode: 'actual' as const, lumpRate: 0, actualAmount: 2_000_000 },
    taxpayerType: 'individual' as const,
  };

  it('เมื่อภาษีขั้นบันได = 0 แต่รายได้สูง → ใช้ 0.5%', () => {
    const r = computeIncomeTax(base);
    expect(r.progressive.tax).toBe(0);
    expect(r.minTax.amount).toBe(10_000);
    expect(r.minTax.applies).toBe(true);
    expect(r.taxBeforeCredits).toBe(10_000);
  });

  it('ถ้า 0.5% ต่ำกว่า 5,000 ได้รับยกเว้น', () => {
    const r = computeIncomeTax({
      ...base,
      incomeB: 500_000,
      expenseB: { mode: 'actual', lumpRate: 0, actualAmount: 500_000 },
    });
    expect(r.minTax.exempted).toBe(true);
    expect(r.minTax.amount).toBe(0);
    expect(r.taxBeforeCredits).toBe(0);
  });

  it('ปิดกฎได้ผลเป็นภาษีขั้นบันไดล้วน', () => {
    expect(computeIncomeTax({ ...base, minTaxRule: { enabled: false } }).taxBeforeCredits).toBe(0);
  });

  it('ใช้ค่าที่มากกว่าระหว่างขั้นบันไดกับ 0.5%', () => {
    const r = computeIncomeTax({
      form: 'PND90', incomeA: 3_000_000, incomeB: 0,
      expenseA: { mode: 'lump', lumpRate: 0.3 },
      expenseB: { mode: 'lump', lumpRate: 0.6 },
      taxpayerType: 'individual',
    });
    expect(r.progressive.tax).toBeGreaterThan(r.minTax.amount);
    expect(r.taxBeforeCredits).toBe(r.progressive.tax);
    expect(r.minTax.applies).toBe(false);
  });
});

/* ================================================================== */
describe('สถานการณ์ครบวงจร: จด VAT กลางปี → ครึ่งปี → สิ้นปี', () => {
  it('ตัวเลขไหลต่อกันถูกต้องทั้งปี', () => {
    const settings = {
      vatRegistered: true,
      vatRegisteredFrom: '2026-07',
      vatRate: VAT_RATE,
    };
    const incomes: IncomeRow[] = [];

    for (const m of monthsBetween('2026-01', '2026-12')) {
      incomes.push(inc(`${m}-05`, 'A', 200_000)); // ค่าเช่า 2.4M/ปี — ไม่กระทบ VAT
      const charging = monthDiff(m, '2026-07') >= 0;
      const n = normalizeAmount({ bucket: 'B', amount: 160_000, vatApplies: charging });
      incomes.push({ ...inc(`${m}-05`, 'B', n.base, n.vat, 'ค่าบริการ'), id: `b-${m}` });
    }

    // ตะกร้า A ต้องไม่มี VAT แม้แต่บาทเดียว
    expect(incomes.filter((e) => e.bucket === 'A').reduce((s, e) => s + e.vat, 0)).toBe(0);

    const h1 = summarizeIncome(incomes, '2026-01-01', '2026-06-30');
    expect(h1.incomeA).toBe(1_200_000);
    expect(h1.incomeB).toBe(960_000);
    expect(h1.outputVat).toBe(0); // ก่อนจด VAT ไม่มีภาษีขาย

    const full = summarizeIncome(incomes, '2026-01-01', '2026-12-31');
    expect(full.incomeA).toBe(2_400_000);
    expect(full.incomeB).toBe(1_920_000);
    expect(full.outputVat).toBe(r2(160_000 * 6 * VAT_RATE));

    const opts = {
      expenseA: { mode: 'lump' as const, lumpRate: 0.3 },
      expenseB: { mode: 'lump' as const, lumpRate: 0.6 },
      taxpayerType: 'individual' as const,
      minTaxRule: { enabled: false },
    };
    const p94 = computeIncomeTax({
      ...opts, form: 'PND94', incomeA: h1.incomeA, incomeB: h1.incomeB,
    });
    const p90 = computeIncomeTax({
      ...opts, form: 'PND90', incomeA: full.incomeA, incomeB: full.incomeB,
      pnd94Paid: p94.payable,
    });

    // ครึ่งปี: 1.2M×0.7 + 960k×0.4 = 1,224,000 − 30,000
    expect(p94.netIncome).toBe(1_194_000);
    // สิ้นปี: 2.4M×0.7 + 1.92M×0.4 = 2,448,000 − 60,000
    expect(p90.netIncome).toBe(2_388_000);
    expect(p90.credits.pnd94Paid).toBe(p94.payable);
    expect(p90.payable).toBe(r2(p90.taxBeforeCredits - p94.payable));

    // ภ.พ.30 ต้องมีเฉพาะ ก.ค.–ธ.ค. = 6 เดือน
    const series = buildPP30Series(incomes, [], settings);
    expect(series).toHaveLength(6);
    expect(series[0].period).toBe('2026-07');
    expect(series[0].outputVat).toBe(r2(160_000 * VAT_RATE));
    expect(r2(series.reduce((s, r) => s + r.outputVat, 0))).toBe(full.outputVat);
  });
});
