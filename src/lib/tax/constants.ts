/**
 * ค่าคงที่ทางภาษี — แก้ที่นี่ที่เดียว
 * ตัวเลขที่ผู้ใช้ปรับได้อยู่ใน TaxSettings ไม่ใช่ที่นี่ (ที่นี่คือค่าเริ่มต้น/ค่าที่กฎหมายล็อก)
 */

import type { MinTaxRule, PitForm, TaxpayerType } from '../../types/tax';

export const VAT_RATE = 0.07;

/** เกณฑ์รายได้ 40(8) ต่อ 12 เดือนเคลื่อนที่ ที่ต้องจดทะเบียน VAT */
export const VAT_THRESHOLD = 1_800_000;

export const RD_URL = 'https://www.rd.go.th';
export const RD_EFILING_URL = 'https://efiling.rd.go.th';

/** อัตราภาษีเงินได้บุคคลธรรมดาแบบขั้นบันได */
export const PIT_BRACKETS: ReadonlyArray<{ upTo: number; rate: number }> = Object.freeze([
  { upTo: 150_000, rate: 0.0 },
  { upTo: 300_000, rate: 0.05 },
  { upTo: 500_000, rate: 0.1 },
  { upTo: 750_000, rate: 0.15 },
  { upTo: 1_000_000, rate: 0.2 },
  { upTo: 2_000_000, rate: 0.25 },
  { upTo: 5_000_000, rate: 0.3 },
  { upTo: Infinity, rate: 0.35 },
]);

/**
 * ค่าลดหย่อนส่วนตัว — ล็อกตามแบบ + สถานะผู้เสียภาษี ห้ามสลับ
 * ภ.ง.ด.94 (ครึ่งปี) ได้ครึ่งหนึ่งของ ภ.ง.ด.90 (สิ้นปี)
 */
export const PERSONAL_ALLOWANCE: Readonly<Record<PitForm, Readonly<Record<TaxpayerType, number>>>> =
  Object.freeze({
    PND94: Object.freeze({ individual: 30_000, partnership: 60_000 }),
    PND90: Object.freeze({ individual: 60_000, partnership: 120_000 }),
  });

/**
 * อัตราหักค่าใช้จ่ายเหมาเริ่มต้น
 * ⚠️ อัตราของ 40(8) ขึ้นกับประเภทกิจการตามพระราชกฤษฎีกา บางกรณีหักเหมาไม่ได้เลย
 *    ผู้ใช้ต้องแก้ได้ในหน้าตั้งค่า — อย่า hard-code ในโค้ดคำนวณ
 */
export const DEFAULT_LUMP_RATE: Readonly<Record<'A' | 'B', number>> = Object.freeze({
  A: 0.3,
  B: 0.6,
});

/**
 * ภาษีขั้นต่ำ 0.5% ของเงินได้พึงประเมิน (มาตรา 48(2))
 * ⚠️ กฎนี้ปิดได้ และควรให้ผู้ใช้ยืนยันเกณฑ์กับกรมสรรพากรก่อนยื่นจริง
 */
export const DEFAULT_MIN_TAX_RULE: Readonly<MinTaxRule> = Object.freeze({
  enabled: true,
  rate: 0.005,
  incomeThresholdPND90: 120_000,
  incomeThresholdPND94: 60_000,
  exemptBelow: 5_000,
});

export const BUCKET_LABEL: Readonly<Record<'A' | 'B', string>> = Object.freeze({
  A: '40(5) ค่าเช่าห้อง',
  B: '40(8) ค่าบริการ/อื่นๆ',
});

export const BUCKET_SHORT: Readonly<Record<'A' | 'B', string>> = Object.freeze({
  A: 'A · 40(5)',
  B: 'B · 40(8)',
});

export const TAXPAYER_LABEL: Readonly<Record<TaxpayerType, string>> = Object.freeze({
  individual: 'บุคคลธรรมดา',
  partnership: 'ห้างหุ้นส่วนสามัญที่ไม่ใช่นิติบุคคล',
});

export const PIT_FORM_INFO: Readonly<
  Record<PitForm, { title: string; label: string; range: string; due: string }>
> = Object.freeze({
  PND94: {
    title: 'ภ.ง.ด.94',
    label: 'ภาษีเงินได้ครึ่งปี',
    range: '1 มกราคม – 30 มิถุนายน',
    due: 'ยื่นภายในเดือนกันยายนของปีเดียวกัน (ออนไลน์ถึงต้นเดือนตุลาคม)',
  },
  PND90: {
    title: 'ภ.ง.ด.90',
    label: 'ภาษีเงินได้สิ้นปี',
    range: '1 มกราคม – 31 ธันวาคม',
    due: 'ยื่นภายในเดือนมีนาคมของปีถัดไป (ออนไลน์ถึงต้นเดือนเมษายน)',
  },
});

/** หมวดรายได้ย่อยของตะกร้า B */
export const B_CATEGORIES: ReadonlyArray<string> = Object.freeze([
  'ค่าบริการ',
  'ค่าส่วนกลาง',
  'ริบเงินประกัน',
  'ค่าน้ำ/ค่าไฟ (บริการ)',
  'ค่าปรับ/ค่าธรรมเนียม',
  'อื่นๆ',
]);

/** ค่าเริ่มต้นของ TaxSettings — ใช้เป็น fallback เวลาแถวใน DB ยังไม่มีค่า */
export const DEFAULT_TAX_SETTINGS = Object.freeze({
  taxpayerType: 'individual' as TaxpayerType,
  partnerCount: 2,
  vatRegistered: false,
  vatRegisteredFrom: null,
  vatRate: VAT_RATE,
  vatThreshold: VAT_THRESHOLD,
  vatOpeningCredit: 0,
  expenseA: Object.freeze({ mode: 'lump' as const, lumpRate: DEFAULT_LUMP_RATE.A }),
  expenseB: Object.freeze({ mode: 'lump' as const, lumpRate: DEFAULT_LUMP_RATE.B }),
  minTaxRule: DEFAULT_MIN_TAX_RULE,
  capExpensePerBucket: false,
});
