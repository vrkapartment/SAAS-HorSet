/**
 * ภาษีเงินได้บุคคลธรรมดา — ภ.ง.ด.94 (ครึ่งปี) และ ภ.ง.ด.90 (สิ้นปี)
 *
 * ⚠️ ไฟล์นี้เป็น "แกนคำนวณชุดใหม่" ที่ใช้เฉพาะกับ VAT/ภ.พ.30 เท่านั้น — ตัวเลข ภ.ง.ด.90/94 ที่ใช้
 *    ยื่นจริงในระบบนี้ยังคงคำนวณผ่าน src/lib/thaiTax.ts + src/lib/pdfHelper.ts เหมือนเดิมทุกจุด
 *    ห้ามใช้ฟังก์ชันในไฟล์นี้คำนวณตัวเลขที่จะเอาไปยื่นจริง (ดู COMPARISON.md เรื่องโครงสร้างข้อมูลที่ต่างกัน)
 *
 * สิ่งที่ไฟล์นี้บังคับไว้:
 *   - ค่าลดหย่อนส่วนตัวล็อกตามแบบ+สถานะ (30k/60k ครึ่งปี, 60k/120k สิ้นปี) สลับกันไม่ได้
 *   - หักลดหย่อนเกินเงินได้ → เงินได้สุทธิเป็น 0 ไม่ติดลบ
 *   - หักค่าใช้จ่ายเหมาไม่ให้เกินรายได้ของตะกร้านั้นเสมอ — ส่วนหักตามจริง ค่าเริ่มต้น (capExpensePerBucket
 *     = false) ปล่อยให้หักเกินรายได้ของตะกร้าตัวเองได้ ส่วนเกินไปหักลบกับตะกร้าอื่น
 *   - ภาษีขั้นต่ำ 0.5% (ม.48(2)) เปิด/ปิดและแก้เกณฑ์ได้
 */

import type {
  Bucket,
  ExpenseDeductionResult,
  ExpenseModeConfig,
  IncomeTaxInput,
  IncomeTaxResult,
  ProgressiveResult,
  ProgressiveStep,
} from '../../types/tax';
import { DEFAULT_MIN_TAX_RULE, PERSONAL_ALLOWANCE, PIT_BRACKETS } from './constants';
import { clamp0, num, r2 } from './money';

/**
 * คำนวณภาษีขั้นบันได พร้อมรายละเอียดแต่ละขั้นเพื่อแสดงใน UI
 * (การแสดงขั้นบันไดทีละขั้นช่วยให้เจ้าของหอตรวจตัวเลขเองได้ ลดคำถามกลับมาที่ทีม)
 */
export function progressiveTax(netIncome: number): ProgressiveResult {
  const income = clamp0(r2(num(netIncome)));
  let lower = 0;
  let tax = 0;
  const steps: ProgressiveStep[] = [];

  for (const b of PIT_BRACKETS) {
    if (income <= lower) break;
    const slice = Math.min(income, b.upTo) - lower;
    const stepTax = r2(slice * b.rate);
    steps.push({ from: lower, to: b.upTo, rate: b.rate, amount: r2(slice), tax: stepTax });
    tax += stepTax;
    lower = b.upTo;
  }

  return { netIncome: income, tax: r2(tax), steps };
}

/**
 * หักค่าใช้จ่ายของตะกร้าหนึ่ง
 * โหมด 'actual' ใช้ยอดจาก cfg.actualAmount ซึ่งควรคำนวณมาจาก summarizeExpenses()
 *
 * @param capPerBucket false (ค่าเริ่มต้น) = โหมด 'actual' หักได้เต็มจำนวนแม้เกินรายได้ของตะกร้านี้
 *   (ส่วนเกินไปหักลบกับตะกร้าอื่นที่ชั้น computeIncomeTax) — โหมด 'lump' จำกัดเสมอไม่ว่าค่านี้จะเป็นอะไร
 *   เพราะเหมาเกินรายได้ตัวเองไม่มีเหตุผลทางบัญชีให้เกิดขึ้นได้จริง
 */
export function expenseDeduction(
  income: number,
  cfg: Partial<ExpenseModeConfig> = {},
  capPerBucket = false,
): ExpenseDeductionResult {
  const inc = clamp0(r2(num(income)));
  const mode = cfg.mode === 'actual' ? 'actual' : 'lump';

  let requested: number;
  let rate: number | null;
  if (mode === 'actual') {
    requested = clamp0(r2(num(cfg.actualAmount)));
    rate = null;
  } else {
    rate = Number.isFinite(cfg.lumpRate) ? (cfg.lumpRate as number) : 0;
    requested = r2(inc * rate);
  }

  const exceedsIncome = requested > inc;
  const shouldCap = mode === 'lump' || capPerBucket;
  const deduction = shouldCap ? r2(Math.min(requested, inc)) : requested;

  return {
    mode,
    rate,
    requested,
    deduction,
    capped: shouldCap && exceedsIncome,
    exceedsIncome,
  };
}

/**
 * แกนคำนวณ ภ.ง.ด.94 / ภ.ง.ด.90 (ชุดใหม่ — ใช้กับ VAT/ภ.พ.30 เท่านั้น ดูหมายเหตุหัวไฟล์)
 *
 * incomeB ที่ส่งเข้ามา "ต้องถอด VAT ออกแล้ว" — ใช้ summarizeIncome() เตรียมให้
 * ถ้าส่งยอดรวม VAT เข้ามา ภาษีจะสูงเกินจริงและผิดหลักบัญชี
 */
export function computeIncomeTax(p: IncomeTaxInput): IncomeTaxResult {
  const form = p.form === 'PND94' ? 'PND94' : 'PND90';
  const incomeA = clamp0(r2(num(p.incomeA)));
  const incomeB = clamp0(r2(num(p.incomeB)));
  const grossAssessable = r2(incomeA + incomeB);

  /* ---- ขั้นที่ 1: หักค่าใช้จ่าย ---- */
  const capExpensePerBucket = Boolean(p.capExpensePerBucket);
  const dedA = expenseDeduction(incomeA, p.expenseA, capExpensePerBucket);
  const dedB = expenseDeduction(incomeB, p.expenseB, capExpensePerBucket);
  const afterExpenseA = r2(incomeA - dedA.deduction);
  const afterExpenseB = r2(incomeB - dedB.deduction);
  const afterExpense = r2(afterExpenseA + afterExpenseB);

  const crossBucketBuckets: Bucket[] = [];
  if (dedA.exceedsIncome) crossBucketBuckets.push('A');
  if (dedB.exceedsIncome) crossBucketBuckets.push('B');

  /* ---- ขั้นที่ 2: หักค่าลดหย่อน ---- */
  const taxpayerType = p.taxpayerType === 'partnership' ? 'partnership' : 'individual';
  const personalAllowance = Number.isFinite(p.personalAllowanceOverride)
    ? r2(p.personalAllowanceOverride as number)
    : PERSONAL_ALLOWANCE[form][taxpayerType];
  const otherDeductions = clamp0(r2(num(p.otherDeductions)));
  const deductionsRequested = r2(personalAllowance + otherDeductions);
  // ลดหย่อนใช้ได้ไม่เกินเงินได้หลังหักค่าใช้จ่าย — clamp0 ทั้งคู่ เพราะ afterExpense ติดลบได้แล้ว
  // เมื่อ capExpensePerBucket = false (หักข้ามตะกร้า) ถ้าไม่ clamp deductionsApplied จะติดลบและทำให้
  // netIncome = afterExpense - deductionsApplied มากกว่า afterExpense ผิดหลัก
  const deductionsApplied = r2(clamp0(Math.min(deductionsRequested, afterExpense)));

  const netIncome = r2(clamp0(afterExpense - deductionsApplied));

  /* ---- ขั้นที่ 3: อัตราก้าวหน้า ---- */
  const prog = progressiveTax(netIncome);

  /* ---- ภาษีขั้นต่ำ 0.5% (ม.48(2)) ---- */
  const rule = { ...DEFAULT_MIN_TAX_RULE, ...(p.minTaxRule || {}) };
  const minThreshold =
    form === 'PND94' ? rule.incomeThresholdPND94 : rule.incomeThresholdPND90;
  let minTax = 0;
  let minTaxApplies = false;
  let minTaxExempted = false;

  if (rule.enabled && grossAssessable > num(minThreshold)) {
    const raw = r2(grossAssessable * num(rule.rate));
    if (raw < num(rule.exemptBelow)) {
      minTaxExempted = true;
    } else {
      minTax = raw;
      minTaxApplies = raw > prog.tax;
    }
  }

  const taxBeforeCredits = r2(Math.max(prog.tax, minTax));

  /* ---- ขั้นที่ 4: เครดิตภาษี ---- */
  const withholdingTax = clamp0(r2(num(p.withholdingTax)));
  // ภ.ง.ด.94 ไม่มีภาษีครึ่งปีให้หัก (กันเผื่อ caller ส่งมาผิด)
  const pnd94Paid = form === 'PND90' ? clamp0(r2(num(p.pnd94Paid))) : 0;
  const creditsTotal = r2(withholdingTax + pnd94Paid);
  const balance = r2(taxBeforeCredits - creditsTotal);

  return {
    form,
    taxpayerType,
    income: { a: incomeA, b: incomeB, gross: grossAssessable },
    expense: {
      a: { ...dedA, income: incomeA, afterExpense: afterExpenseA },
      b: { ...dedB, income: incomeB, afterExpense: afterExpenseB },
      total: r2(dedA.deduction + dedB.deduction),
    },
    crossBucketDeduction: {
      triggered: crossBucketBuckets.length > 0,
      buckets: crossBucketBuckets,
      capExpensePerBucket,
    },
    afterExpense,
    deductions: {
      personalAllowance,
      other: otherDeductions,
      requested: deductionsRequested,
      applied: deductionsApplied,
      capped: deductionsRequested > afterExpense,
    },
    netIncome,
    progressive: prog,
    minTax: {
      enabled: Boolean(rule.enabled),
      rate: num(rule.rate),
      threshold: num(minThreshold),
      amount: minTax,
      applies: minTaxApplies,
      exempted: minTaxExempted,
    },
    taxBeforeCredits,
    credits: { withholdingTax, pnd94Paid, total: creditsTotal },
    balance,
    payable: r2(clamp0(balance)),
    refundable: r2(clamp0(-balance)),
    status: balance > 0 ? 'pay' : balance < 0 ? 'refund' : 'zero',
  };
}

/** ค่าลดหย่อนส่วนตัวที่จะถูกใช้ — ให้ UI แสดงตัวเลขให้ผู้ใช้เห็นก่อนคำนวณ */
export function personalAllowanceFor(
  form: 'PND94' | 'PND90',
  taxpayerType: 'individual' | 'partnership',
): number {
  return PERSONAL_ALLOWANCE[form][taxpayerType];
}
