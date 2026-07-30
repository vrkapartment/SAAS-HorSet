/**
 * เคสสำหรับ "เทียบเลข" ระหว่างแกนคำนวณ ภ.ง.ด.94/90 ของเดิม (thaiTax.ts) กับชุดใหม่นี้ (lib/tax/pit.ts)
 *
 * วิธีใช้
 *   1) รันเคสเหล่านี้ผ่านแกนคำนวณเดิม (src/lib/thaiTax.ts)
 *   2) เทียบกับผลจากแกนคำนวณใหม่ (computeIncomeTax จาก lib/tax)
 *   3) ตรงหมด → มั่นใจว่าตัวเลข VAT/ภ.พ.30 ที่อ้างอิงแกนใหม่ไม่เพี้ยนจากของจริง
 *      ไม่ตรง → ดูว่าใครถูกทีละเคส (ห้ามใช้แกนใหม่แสดงตัวเลขที่จะเอาไปยื่นจริงไม่ว่ากรณีใด)
 *
 * เคสถูกเลือกให้ครอบ "จุดที่แกนคำนวณสองตัวมักไม่ตรงกัน" ไม่ใช่เคสทั่วไป
 */

import type { IncomeTaxInput } from '../../../types/tax';

export interface ComparisonCase {
  id: string;
  title: string;
  /** ทำไมเคสนี้สำคัญ / คาดว่าจะต่างที่ไหน */
  why: string;
  input: IncomeTaxInput;
}

const lump = {
  expenseA: { mode: 'lump' as const, lumpRate: 0.3 },
  expenseB: { mode: 'lump' as const, lumpRate: 0.6 },
};

export const COMPARISON_CASES: ComparisonCase[] = [
  {
    id: 'C1',
    title: 'บุคคลธรรมดา · ครึ่งปี · หักเหมา',
    why: 'เคสพื้นฐาน ถ้าเคสนี้ไม่ตรง แปลว่าอัตราหักเหมาหรือค่าลดหย่อนส่วนตัวตั้งไว้ไม่เหมือนกัน',
    input: {
      ...lump, form: 'PND94', taxpayerType: 'individual',
      incomeA: 900_000, incomeB: 300_000, minTaxRule: { enabled: false },
    },
  },
  {
    id: 'C2',
    title: 'บุคคลธรรมดา · สิ้นปี · หักเหมา',
    why: 'ตรวจว่าค่าลดหย่อนส่วนตัวสิ้นปีเป็น 60,000 (ไม่ใช่ 30,000 ของครึ่งปี)',
    input: {
      ...lump, form: 'PND90', taxpayerType: 'individual',
      incomeA: 1_800_000, incomeB: 600_000, minTaxRule: { enabled: false },
    },
  },
  {
    id: 'C3',
    title: 'ห้างหุ้นส่วนสามัญ · ครึ่งปี',
    why: 'ค่าลดหย่อนส่วนตัวต้องเป็น 60,000 — ระบบเดิมบางที่ใช้ 30,000 เหมือนบุคคลธรรมดา',
    input: {
      ...lump, form: 'PND94', taxpayerType: 'partnership',
      incomeA: 900_000, incomeB: 300_000, minTaxRule: { enabled: false },
    },
  },
  {
    id: 'C4',
    title: 'ห้างหุ้นส่วนสามัญ · สิ้นปี',
    why: 'ค่าลดหย่อนส่วนตัวต้องเป็น 120,000',
    input: {
      ...lump, form: 'PND90', taxpayerType: 'partnership',
      incomeA: 1_800_000, incomeB: 600_000, minTaxRule: { enabled: false },
    },
  },
  {
    id: 'C5',
    title: 'เงินได้สุทธิพอดี 150,000 (จุดยกเว้น)',
    why: 'จุดตัดขั้นแรก — ต้องได้ภาษี 0 ไม่ใช่ 7,500',
    input: {
      ...lump, form: 'PND90', taxpayerType: 'individual',
      // 300,000 × 0.7 = 210,000 ; 210,000 − 60,000 = 150,000
      incomeA: 300_000, incomeB: 0, minTaxRule: { enabled: false },
    },
  },
  {
    id: 'C6',
    title: 'หักค่าใช้จ่ายจริงจนเงินได้สุทธิ = 0 แต่รายได้ 2 ล้าน',
    why: 'เคสที่กฎภาษีขั้นต่ำ 0.5% (ม.48(2)) มีผล — แกนเดิมที่ไม่มีกฎนี้จะได้ภาษี 0',
    input: {
      form: 'PND90', taxpayerType: 'individual',
      incomeA: 0, incomeB: 2_000_000,
      expenseA: { mode: 'lump', lumpRate: 0.3 },
      expenseB: { mode: 'actual', lumpRate: 0, actualAmount: 2_000_000 },
    },
  },
  {
    id: 'C7',
    title: 'ค่าลดหย่อนเกินเงินได้หลังหักค่าใช้จ่าย',
    why: 'เงินได้สุทธิต้องเป็น 0 ไม่ติดลบ และไม่ยกไปปีถัดไป',
    input: {
      ...lump, form: 'PND94', taxpayerType: 'individual',
      incomeA: 20_000, incomeB: 0, otherDeductions: 100_000,
      minTaxRule: { enabled: false },
    },
  },
  {
    id: 'C8',
    title: 'หักค่าใช้จ่ายจริงเกินรายได้ของตะกร้านั้น',
    why:
      'ค่าเริ่มต้นใหม่ (capExpensePerBucket: false) ปล่อยให้หักข้ามตะกร้าได้ ตรงกับของจริง — ' +
      'คาดว่าเคสนี้ต้องตรงกัน (✅) ไม่ใช่ต่างกันอีกต่อไป (ดู COMPARISON.md หัวข้อ C8)',
    input: {
      form: 'PND90', taxpayerType: 'individual',
      incomeA: 100_000, incomeB: 500_000,
      expenseA: { mode: 'actual', lumpRate: 0, actualAmount: 400_000 },
      expenseB: { mode: 'actual', lumpRate: 0, actualAmount: 100_000 },
      minTaxRule: { enabled: false },
    },
  },
  {
    id: 'C9',
    title: 'สิ้นปี · หักภาษีครึ่งปี + ภาษีหัก ณ ที่จ่าย',
    why: 'ลำดับการหักเครดิต และผลลัพธ์ "จ่ายเพิ่ม"',
    input: {
      ...lump, form: 'PND90', taxpayerType: 'individual',
      incomeA: 1_800_000, incomeB: 600_000,
      pnd94Paid: 60_500, withholdingTax: 24_500,
      minTaxRule: { enabled: false },
    },
  },
  {
    id: 'C10',
    title: 'สิ้นปี · จ่ายครึ่งปีไว้เกิน → ขอคืน',
    why: 'ต้องออกมาเป็นยอด "ขอคืน" ไม่ใช่ยอดจ่ายติดลบ',
    input: {
      ...lump, form: 'PND90', taxpayerType: 'individual',
      incomeA: 1_800_000, incomeB: 600_000, pnd94Paid: 300_000,
      minTaxRule: { enabled: false },
    },
  },
  {
    id: 'C11',
    title: 'รายได้สูง · แตะขั้น 35%',
    why: 'ตรวจขั้นบันไดขั้นสุดท้ายและการปัดเศษของยอดใหญ่',
    input: {
      ...lump, form: 'PND90', taxpayerType: 'individual',
      incomeA: 9_000_000, incomeB: 3_000_000, minTaxRule: { enabled: false },
    },
  },
  {
    id: 'C12',
    title: 'ยอดมีเศษสตางค์',
    why: 'ตรวจการปัดเศษ — แกนคำนวณที่ใช้ float ตรงๆ จะเพี้ยนหลักสตางค์',
    input: {
      ...lump, form: 'PND94', taxpayerType: 'individual',
      incomeA: 733_333.33, incomeB: 266_666.67, minTaxRule: { enabled: false },
    },
  },
];
