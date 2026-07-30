/**
 * Types / Interfaces ทั้งหมดของฟีเจอร์ VAT + ภ.พ.30 + ภ.ง.ด.94/90
 *
 * ชื่อฟิลด์ตรงกับแกนคำนวณเดิม (Electron app) แบบ 1:1 เพื่อให้ชุดทดสอบ 50 เคสใช้ร่วมกันได้
 * ถ้าตาราง Supabase ของคุณใช้ชื่อคอลัมน์อื่น (เช่น snake_case) ให้เขียน adapter แปลงที่ชั้น query
 * อย่าแก้ชื่อฟิลด์ในนี้ — จะทำให้ test ที่แนบมาเทียบเลขไม่ได้
 */

/** 'YYYY-MM-DD' */
export type DateKey = string;
/** 'YYYY-MM' */
export type MonthKey = string;

/**
 * ตะกร้ารายได้ — แยกตั้งแต่ต้นทาง ห้ามคำนวณย้อนหลัง
 *  A = มาตรา 40(5) ค่าเช่าห้อง  → ยกเว้น VAT 100% ไม่จำกัดวงเงิน
 *  B = มาตรา 40(8) ค่าบริการ/ส่วนกลาง/ริบเงินประกัน/อื่นๆ → เป็นฐานนับเกณฑ์ VAT
 */
export type Bucket = 'A' | 'B';

/** บุคคลธรรมดา | ห้างหุ้นส่วนสามัญที่ไม่ใช่นิติบุคคล (หุ้นส่วน >= 2 คน) */
export type TaxpayerType = 'individual' | 'partnership';

/** ภ.ง.ด.94 = ครึ่งปี (ม.ค.–มิ.ย.) | ภ.ง.ด.90 = สิ้นปี (ม.ค.–ธ.ค.) */
export type PitForm = 'PND94' | 'PND90';

/** หักเหมาตามอัตรา | หักตามจริงจากสมุดค่าใช้จ่าย */
export type ExpenseMode = 'lump' | 'actual';

/* ------------------------------------------------------------------ *
 * ข้อมูลตั้งต้น (rows)
 * ------------------------------------------------------------------ */

/**
 * 1 บรรทัดรายรับ
 * `base` และ `vat` ต้องถูกแยกไว้ตั้งแต่ตอนบันทึก — ห้ามเก็บยอดรวมแล้วมาถอดตอนคำนวณ
 * เพราะจะทำให้ VAT ปนเข้าฐานรายได้ 40(5)/40(8) เมื่อมีการปัดเศษ
 */
export interface IncomeRow {
  id: string;
  date: DateKey;
  bucket: Bucket;
  /** ฐานรายได้ ไม่รวม VAT */
  base: number;
  /** VAT ที่เก็บจากผู้เช่า — ตะกร้า A ต้องเป็น 0 เสมอ */
  vat: number;
  category?: string;
  description?: string;
  room?: string;
  tenant?: string;
  invoiceId?: string;
}

/**
 * 1 บรรทัดค่าใช้จ่าย — ทำหน้าที่ 2 อย่าง
 *  1) `base` = ค่าใช้จ่ายจริงสำหรับ ภ.ง.ด. (เมื่อเลือกโหมด 'actual')
 *  2) `vat`  = ภาษีซื้อสำหรับ ภ.พ.30 (เมื่อ claimInputVat !== false)
 */
export interface ExpenseRow {
  id: string;
  date: DateKey;
  /** ค่าใช้จ่ายนี้จับคู่กับรายได้ฝั่งไหน ใช้เมื่อหักค่าใช้จ่ายตามจริง */
  bucket: Bucket;
  /** ฐานค่าใช้จ่าย ไม่รวม VAT */
  base: number;
  /** ภาษีซื้อ 7% */
  vat: number;
  /** false = ใบกำกับนี้ขอเครดิตภาษีซื้อไม่ได้ (ไม่นับใน ภ.พ.30) — ค่า undefined ถือว่า true */
  claimInputVat?: boolean;
  vendor?: string;
  description?: string;
}

/* ------------------------------------------------------------------ *
 * การตั้งค่า
 * ------------------------------------------------------------------ */

export interface ExpenseModeConfig {
  mode: ExpenseMode;
  /** 0–1 เช่น 0.3 = 30% ใช้เมื่อ mode = 'lump' */
  lumpRate: number;
  /** ยอดค่าใช้จ่ายจริงในรอบ ใช้เมื่อ mode = 'actual' — ปกติคำนวณมาจาก ExpenseRow[] */
  actualAmount?: number;
}

/** ภาษีขั้นต่ำ 0.5% ของเงินได้พึงประเมิน (มาตรา 48(2)) */
export interface MinTaxRule {
  enabled: boolean;
  /** 0.005 = 0.5% */
  rate: number;
  incomeThresholdPND90: number;
  incomeThresholdPND94: number;
  /** ถ้าภาษีที่คำนวณตามอัตรานี้ต่ำกว่าค่านี้ ให้ยกเว้น */
  exemptBelow: number;
}

export interface VatSettings {
  /** สวิตช์หลัก — UI ทุกส่วนที่เกี่ยวกับ VAT ต้องซ่อนเมื่อเป็น false */
  vatRegistered: boolean;
  /** เดือนที่การจดทะเบียนมีผล ('YYYY-MM') ใบก่อนเดือนนี้ไม่คิด VAT */
  vatRegisteredFrom: MonthKey | null;
  /** 0.07 */
  vatRate: number;
  /** 1_800_000 */
  vatThreshold: number;
  /** เครดิตภาษีซื้อยกมาตั้งต้น (ก่อนเริ่มใช้ระบบ) */
  vatOpeningCredit: number;
}

export interface TaxSettings extends VatSettings {
  taxpayerType: TaxpayerType;
  /** ต้อง >= 2 เมื่อ taxpayerType = 'partnership' */
  partnerCount: number;
  expenseA: ExpenseModeConfig;
  expenseB: ExpenseModeConfig;
  minTaxRule: MinTaxRule;
  /**
   * false (ค่าเริ่มต้น) = หักค่าใช้จ่ายจริง (actual mode) เกินรายได้ของตะกร้าได้ ส่วนเกินไปหักลบกับ
   * เงินได้ของตะกร้าอื่นก่อนคำนวณภาษี — ตรงกับแกนคำนวณเดิมของ SAAS HorSet และแนวทางยื่นจริงตามประมวลรัษฎากร
   * true = จำกัดยอดหักของแต่ละตะกร้าไม่ให้เกินรายได้ของตะกร้านั้นเอง (โหมดระมัดระวังกว่า)
   */
  capExpensePerBucket: boolean;
}

/**
 * ค่าลดหย่อนอื่น (นอกเหนือค่าลดหย่อนส่วนตัว)
 * แยกช่องครึ่งปี/สิ้นปีชัดเจน เพราะหลายรายการของครึ่งปีคิดได้เพียงครึ่งเดียว
 */
export interface DeductionItem {
  id: string;
  name: string;
  amountPND94: number;
  amountPND90: number;
  note?: string;
}

/* ------------------------------------------------------------------ *
 * ผลลัพธ์ VAT
 * ------------------------------------------------------------------ */

export interface VatSplit {
  base: number;
  vat: number;
  total: number;
}

export interface VatStatus {
  asOfMonth: MonthKey;
  /** ต้นหน้าต่าง 12 เดือนเคลื่อนที่ = asOfMonth - 11 เดือน */
  windowStart: MonthKey;
  windowEnd: MonthKey;
  /** ผลรวมฐานรายได้ 40(8) ในหน้าต่าง 12 เดือน */
  rolling12: number;
  /** ฐานรายได้ 40(8) ของเดือน asOfMonth เดือนเดียว */
  monthOnly: number;
  threshold: number;
  rate: number;
  /** เหลืออีกเท่าไรก่อนถึงเกณฑ์ (0 ถ้าเกินแล้ว) */
  remaining: number;
  /** % ที่ใช้ไปของเกณฑ์ */
  usedPct: number;
  /** rolling12 > threshold */
  exceeded: boolean;
  registered: boolean;
  registeredFrom: MonthKey | null;
  /** ต้องคิด VAT ในใบแจ้งหนี้เดือนนี้จริงหรือไม่ = registered && ถึงเดือนที่มีผล */
  charging: boolean;
  /** เกินเกณฑ์แล้วแต่ยังไม่จด → ต้องขึ้นคำเตือน */
  mustRegisterWarning: boolean;
  rdUrl: string;
}

export interface ThresholdBreach {
  month: MonthKey;
  rolling12: number;
  threshold: number;
}

/* ------------------------------------------------------------------ *
 * สรุปยอด
 * ------------------------------------------------------------------ */

export interface IncomeSummary {
  /** ฐานรายได้ 40(5) */
  incomeA: number;
  /** ฐานรายได้ 40(8) ถอด VAT ออกแล้ว */
  incomeB: number;
  total: number;
  /** ภาษีขาย */
  outputVat: number;
  /** เงินที่รับจริง = total + outputVat */
  grossReceipts: number;
  byCategory: Record<string, number>;
}

export interface ExpenseSummary {
  expenseA: number;
  expenseB: number;
  total: number;
  /** ภาษีซื้อที่ขอเครดิตได้ */
  inputVat: number;
}

/* ------------------------------------------------------------------ *
 * ภ.พ.30
 * ------------------------------------------------------------------ */

export type Pp30Status = 'pay' | 'credit' | 'zero';

export interface Pp30Result {
  outputVat: number;
  inputVat: number;
  creditBrought: number;
  /** outputVat - inputVat - creditBrought */
  net: number;
  /** ยอดที่ต้องโอนจ่ายสรรพากร (0 ถ้า net <= 0) */
  payable: number;
  /** ภาษีซื้อยกไปเครดิตเดือนถัดไป / ขอคืน (0 ถ้า net >= 0) */
  carryForward: number;
  status: Pp30Status;
}

export interface Pp30Row extends Pp30Result {
  period: MonthKey;
  rate: number;
  /** ฐานค่าบริการ 40(8) ของเดือนนั้น */
  serviceBase: number;
  /** ภาษีขายที่คำนวณได้จากบิลจริง (ก่อนถูกทับด้วยค่าที่กรอกมือ) */
  outputVatFromLedger: number;
  /** ค่าที่ผู้ใช้กรอกเอง (null = ใช้ค่าจากบิล) */
  outputVatManual: number | null;
  /** ภาษีซื้อที่คำนวณได้จากสมุดค่าใช้จ่าย (ก่อนถูกทับด้วยค่าที่กรอกมือ) */
  inputVatFromLedger: number;
  /** ค่าที่ผู้ใช้กรอกเอง (null = ใช้ค่าจากสมุด) */
  inputVatManual: number | null;
  filed: boolean;
  filedAt: DateKey | null;
  note: string;
}

/** บันทึกการยื่น ภ.พ.30 ที่เก็บลง DB */
export interface Pp30Filing {
  period: MonthKey;
  outputVatManual?: number | null;
  inputVatManual?: number | null;
  filedAt?: DateKey | null;
  note?: string;
  paidAmount?: number | null;
}

/* ------------------------------------------------------------------ *
 * ภาษีเงินได้
 * ------------------------------------------------------------------ */

export interface ProgressiveStep {
  from: number;
  to: number;
  rate: number;
  /** เงินได้ที่ตกอยู่ในขั้นนี้ */
  amount: number;
  tax: number;
}

export interface ProgressiveResult {
  netIncome: number;
  tax: number;
  steps: ProgressiveStep[];
}

export interface ExpenseDeductionResult {
  mode: ExpenseMode;
  /** null เมื่อ mode = 'actual' */
  rate: number | null;
  /** ยอดที่ขอหักก่อนถูกจำกัด */
  requested: number;
  /** ยอดที่หักได้จริง — อาจเกินรายได้ของตะกร้านี้ได้เมื่อ capExpensePerBucket = false (ค่าเริ่มต้น) */
  deduction: number;
  /** true = ยอดหักที่คืนค่าถูกจำกัดไม่ให้เกินรายได้ของตะกร้านี้จริงๆ (โหมดเหมาเสมอ, โหมดจริงเฉพาะเมื่อ capExpensePerBucket = true) */
  capped: boolean;
  /**
   * true = ยอดที่ขอหัก (requested) สูงกว่ารายได้ของตะกร้านี้ — ไม่ขึ้นกับว่าจะถูกจำกัดหรือไม่
   * ใช้เป็นสัญญาณเตือนความเสี่ยงถูกกรมสรรพากรขอตรวจเอกสาร ไม่ใช่สัญญาณว่าตัวเลขถูกจำกัด
   */
  exceedsIncome: boolean;
}

export interface ExpenseDeductionDetail extends ExpenseDeductionResult {
  income: number;
  afterExpense: number;
}

export interface IncomeTaxInput {
  form: PitForm;
  incomeA: number;
  /** ต้องถอด VAT ออกแล้ว */
  incomeB: number;
  expenseA: ExpenseModeConfig;
  expenseB: ExpenseModeConfig;
  taxpayerType: TaxpayerType;
  /** ทับค่าลดหย่อนส่วนตัวที่ระบบล็อกไว้ — ใช้เฉพาะกรณีพิเศษ */
  personalAllowanceOverride?: number;
  otherDeductions?: number;
  minTaxRule?: Partial<MinTaxRule>;
  withholdingTax?: number;
  /** ใช้เฉพาะ form = 'PND90' */
  pnd94Paid?: number;
  /** undefined/false (ค่าเริ่มต้น) = หักข้ามตะกร้าได้ — ดู TaxSettings.capExpensePerBucket */
  capExpensePerBucket?: boolean;
}

export interface IncomeTaxResult {
  form: PitForm;
  taxpayerType: TaxpayerType;
  income: { a: number; b: number; gross: number };
  expense: {
    a: ExpenseDeductionDetail;
    b: ExpenseDeductionDetail;
    total: number;
  };
  /**
   * สัญญาณ "หักข้ามตะกร้า" — เกิดเมื่อตะกร้าใดขอหักค่าใช้จ่ายจริงเกินรายได้ของตะกร้านั้น
   * triggered ไม่ขึ้นกับ capExpensePerBucket (เกิดได้ทั้งสองโหมด) — ใช้เตือนผู้ใช้ว่ากรมสรรพากรมักขอ
   * เอกสาร/ใบกำกับภาษีสำหรับยอดที่ขอหักทั้งหมด ไม่ใช่แค่ยอดรายได้ของตะกร้านั้น
   */
  crossBucketDeduction: {
    triggered: boolean;
    buckets: Bucket[];
    capExpensePerBucket: boolean;
  };
  afterExpense: number;
  deductions: {
    /** ล็อกตามแบบ+สถานะ 30k/60k/60k/120k */
    personalAllowance: number;
    other: number;
    requested: number;
    /** ใช้ได้ไม่เกิน afterExpense */
    applied: number;
    capped: boolean;
  };
  /** >= 0 เสมอ */
  netIncome: number;
  progressive: ProgressiveResult;
  minTax: {
    enabled: boolean;
    rate: number;
    threshold: number;
    amount: number;
    /** true = ยอด 0.5% สูงกว่าขั้นบันได จึงถูกใช้แทน */
    applies: boolean;
    /** true = คำนวณได้ต่ำกว่า exemptBelow จึงยกเว้น */
    exempted: boolean;
  };
  /** max(ขั้นบันได, ภาษีขั้นต่ำ) */
  taxBeforeCredits: number;
  credits: { withholdingTax: number; pnd94Paid: number; total: number };
  /** taxBeforeCredits - credits.total (บวก = จ่ายเพิ่ม, ลบ = ขอคืน) */
  balance: number;
  payable: number;
  refundable: number;
  status: 'pay' | 'refund' | 'zero';
}

/** บันทึกการยื่น ภ.ง.ด. ที่เก็บลง DB */
export interface PitFiling {
  id?: string;
  year: number;
  form: PitForm;
  taxPaid?: number | null;
  withholdingTax?: number | null;
  filedAt?: DateKey | null;
  note?: string;
}

/* ------------------------------------------------------------------ *
 * ชุดข้อมูลที่ hook / component ต้องการ
 * ------------------------------------------------------------------ */

/**
 * ก้อนข้อมูลกลางที่ทุก hook รับเข้าไป
 * ให้ layer ที่คุยกับ Supabase เตรียมก้อนนี้แล้วส่งต่อ — ตัว hook/component ไม่ fetch เอง
 */
export interface TaxDataset {
  incomes: IncomeRow[];
  expenses: ExpenseRow[];
  settings: TaxSettings;
  deductions: DeductionItem[];
  pp30Filings: Pp30Filing[];
  pitFilings: PitFiling[];
}

/** ผลคำนวณครบชุดของรอบภาษีหนึ่ง */
export interface PeriodComputation {
  year: number;
  form: PitForm;
  from: DateKey;
  to: DateKey;
  months: number;
  income: IncomeSummary;
  expense: ExpenseSummary;
  tax: IncomeTaxResult;
  filing: PitFiling | null;
  /** ยอดภาษีครึ่งปีที่ใช้หักกลบ (เฉพาะ PND90) */
  pnd94Paid: number;
  /** true = ยังไม่มีบันทึกยอดที่จ่ายจริง จึงใช้ประมาณการ */
  pnd94IsEstimate: boolean;
  /** ผลคำนวณครึ่งปี ใช้ทำตารางเทียบ (เฉพาะ PND90) */
  pnd94Result: PeriodComputation | null;
}
