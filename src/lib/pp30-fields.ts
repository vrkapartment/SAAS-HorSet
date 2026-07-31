/**
 * ชั้นข้อมูลสำหรับ PDF mapping ของแบบ ภ.พ.30
 *
 * ไฟล์นี้เตรียม "ค่าทุกช่องที่แบบ ภ.พ.30 ต้องการ" ให้พร้อมใช้กับ generatePp30Pdf() ใน pdfHelper.ts
 * (mapping จริงกับไฟล์ template `public/templates/PP30_Template.pdf` ดูที่ DEFAULT_PP30_MAPPING
 * ใน pdfHelper.ts — แยกกันคนละไฟล์เหมือนที่ DEFAULT_PND90/94_MAPPING แยกจาก compute*Values)
 *
 * 🚫 ห้ามแตะ mapping ของ ภ.ง.ด.90 / ภ.ง.ด.94 — ไฟล์นี้ไม่ import และไม่ทับอะไรของสองแบบนั้นเลย
 *
 * ⚠️ เลขข้อ (formLine) ด้านล่างอ้างอิงจากแบบ ภ.พ.30 ฉบับพิมพ์ ม.ค. 2560 (pp30_300160.pdf)
 */

import type { Pp30Row } from '../types/tax';
import { r2 } from './tax';

/**
 * ที่อยู่แยกช่องย่อยตามแบบฟอร์ม ภ.พ.30 จริง (อาคาร/ห้องเลขที่/ชั้นที่/หมู่บ้าน/เลขที่/หมู่ที่/ตรอกซอย/
 * ถนน/ตำบล-แขวง/อำเภอ-เขต/จังหวัด/รหัสไปรษณีย์) — โครงเดียวกับ PndData.addressParts ใน pdfHelper.ts
 * (ที่ ภ.ง.ด.90/94 ใช้อยู่แล้ว) ตั้งใจให้ผู้เรียกประกอบจาก parseAddress() + tax_address_building/room/
 * floor/village/moo/soi/yaek ชุดเดียวกัน ไม่ต้องแยกโค้ดคนละชุด
 */
export interface Pp30AddressParts {
  building: string;
  room: string;
  floor: string;
  village: string;
  no: string;
  moo: string;
  soi: string;
  yaek: string;
  road: string;
  subdistrict: string;
  district: string;
  province: string;
  zipcode: string;
}

/** ข้อมูลผู้ประกอบการ — ดึงจากโปรไฟล์หอพักใน Supabase */
export interface Pp30TaxpayerInfo {
  /** ชื่อผู้ประกอบการ (บุคคล/ห้างหุ้นส่วน) */
  name: string;
  /** เลขประจำตัวผู้เสียภาษีอากร 13 หลัก */
  taxId: string;
  /** เลขที่สาขา — สำนักงานใหญ่ใช้ '00000' */
  branchNo?: string;
  /** ที่อยู่แยกช่องย่อย — ไม่ระบุ = ปล่อยช่องที่อยู่ทั้งหมดว่าง (ไม่มี fallback ไปช่องเดียวรวมอีกต่อไป) */
  addressParts?: Pp30AddressParts;
  phone?: string;
}

/** ค่าที่ผู้ใช้กรอกเพิ่มตอนยื่น (ไม่ได้มาจากการคำนวณ) */
export interface Pp30ManualEntries {
  /** ยอดขายที่ได้รับยกเว้น VAT ในเดือนนี้ — ปกติ = ค่าเช่า 40(5) ถ้าต้องแสดง */
  exemptSales?: number;
  /** ยอดขายที่เสียภาษีอัตรา 0% (ส่งออก) — หอพักปกติเป็น 0 */
  zeroRatedSales?: number;
  /** เบี้ยปรับ (กรณียื่นเกินกำหนด) */
  penalty?: number;
  /** เงินเพิ่ม 1.5% ต่อเดือน (กรณียื่นเกินกำหนด) */
  surcharge?: number;
  /** ยื่นเพิ่มเติม (ครั้งที่) — 0 = ยื่นปกติ */
  additionalFilingNo?: number;
}

/**
 * 1 ช่องในแบบ
 * ใช้โครงนี้เพื่อให้ adapter map ได้ทั้งแบบ "ชื่อ field ใน AcroForm"
 * และแบบ "พิกัด x/y ที่วาดทับ" โดยไม่ต้องแก้ชั้นคำนวณ
 */
export interface Pp30Field {
  /** คีย์ภายในที่ใช้อ้างอิงใน mapping */
  key: string;
  /** ป้ายกำกับตามแบบ (ภาษาไทย) */
  label: string;
  /** เลขข้อในแบบ */
  formLine?: string;
  value: number | string;
  type: 'money' | 'text' | 'checkbox';
}

export interface Pp30FormFields {
  period: string;
  /** เดือนภาษี 1–12 */
  month: number;
  /** ปี พ.ศ. */
  yearBE: number;
  taxpayer: Pp30TaxpayerInfo;
  fields: Pp30Field[];
  /** เข้าถึงค่าด้วยคีย์แบบเร็ว */
  byKey: Record<string, number | string>;
}

/**
 * แปลงผลคำนวณ 1 เดือน → ชุดค่าทุกช่องของแบบ ภ.พ.30
 *
 * ค่าทั้งหมดมาจาก Pp30Row ที่ buildPP30Series() คำนวณไว้แล้ว
 * (ภาษีขาย/ภาษีซื้อ/เครดิตยกมา/ยอดสุทธิ ต่อสายเครดิตถูกต้องแล้ว)
 */
export function buildPp30FormFields(
  row: Pp30Row,
  taxpayer: Pp30TaxpayerInfo,
  manual: Pp30ManualEntries = {},
): Pp30FormFields {
  const [yearStr, monthStr] = row.period.split('-');
  const month = Number(monthStr);
  const yearBE = Number(yearStr) + 543;

  const zeroRated = r2(manual.zeroRatedSales ?? 0);
  const exempt = r2(manual.exemptSales ?? 0);
  const taxable = row.serviceBase;
  const totalSales = r2(taxable + zeroRated + exempt);

  const penalty = r2(manual.penalty ?? 0);
  const surcharge = r2(manual.surcharge ?? 0);
  const grandTotal = r2(row.payable + penalty + surcharge);

  const addr = taxpayer.addressParts;

  // ช่องเลขประจำตัวผู้เสียภาษีของแบบนี้ (Text1.0) เป็น PDF comb field ยาว 17 ตัวอักษร นับรวมขีดคั่นด้วย
  // (รูปแบบ X-XXXX-XXXXX-XX-X) เหมือนช่องเดียวกันในแบบ ภ.ง.ด.90/94 (ดู generatePndPdf() ใน pdfHelper.ts)
  // จึงต้องพิมพ์ขีดคั่นลงไปเองให้ครบ 17 ตัวอักษร ไม่ใช่ส่งแค่ 13 หลักเปล่าๆ ไม่งั้นตัวเลขจะเรียงชิดซ้ายไม่ตรงช่อง
  const cleanTaxId = taxpayer.taxId.replace(/[^0-9]/g, '');
  const formattedTaxId = cleanTaxId.length === 13
    ? `${cleanTaxId.slice(0, 1)}-${cleanTaxId.slice(1, 5)}-${cleanTaxId.slice(5, 10)}-${cleanTaxId.slice(10, 12)}-${cleanTaxId.slice(12, 13)}`
    : cleanTaxId;

  const fields: Pp30Field[] = [
    /* ---------- ส่วนหัว ---------- */
    { key: 'taxpayerName', label: 'ชื่อผู้ประกอบการ', value: taxpayer.name, type: 'text' },
    { key: 'taxId', label: 'เลขประจำตัวผู้เสียภาษีอากร', value: formattedTaxId, type: 'text' },
    { key: 'branchNo', label: 'สาขาที่', value: taxpayer.branchNo ?? '00000', type: 'text' },
    { key: 'taxMonth', label: 'เดือนภาษี', value: month, type: 'text' },
    { key: 'taxYearBE', label: 'ปี (พ.ศ.)', value: yearBE, type: 'text' },
    {
      key: 'additionalFilingNo',
      label: 'ยื่นเพิ่มเติมครั้งที่',
      value: manual.additionalFilingNo ?? 0,
      type: 'text',
    },

    /* ---------- ที่อยู่ (แยกช่องย่อยตามแบบฟอร์มจริง) ---------- */
    { key: 'address.building', label: 'อาคาร', value: addr?.building ?? '', type: 'text' },
    { key: 'address.room', label: 'ห้องเลขที่', value: addr?.room ?? '', type: 'text' },
    { key: 'address.floor', label: 'ชั้นที่', value: addr?.floor ?? '', type: 'text' },
    { key: 'address.village', label: 'หมู่บ้าน', value: addr?.village ?? '', type: 'text' },
    { key: 'address.no', label: 'เลขที่', value: addr?.no ?? '', type: 'text' },
    { key: 'address.moo', label: 'หมู่ที่', value: addr?.moo ?? '', type: 'text' },
    {
      key: 'address.soi',
      label: 'ตรอก/ซอย',
      // แบบฟอร์มนี้มีช่องเดียวสำหรับ "ตรอก/ซอย" ไม่มีช่อง "แยก" แยกต่างหากแบบ ภ.ง.ด.94 — ต่อท้ายรวมกันแทนที่จะทิ้งข้อมูล
      value: [addr?.soi, addr?.yaek ? `แยก${addr.yaek}` : ''].filter(Boolean).join(' '),
      type: 'text',
    },
    { key: 'address.road', label: 'ถนน', value: addr?.road ?? '', type: 'text' },
    { key: 'address.subdistrict', label: 'ตำบล/แขวง', value: addr?.subdistrict ?? '', type: 'text' },
    { key: 'address.district', label: 'อำเภอ/เขต', value: addr?.district ?? '', type: 'text' },
    { key: 'address.province', label: 'จังหวัด', value: addr?.province ?? '', type: 'text' },
    { key: 'address.zipcode', label: 'รหัสไปรษณีย์', value: addr?.zipcode ?? '', type: 'text' },
    { key: 'phone', label: 'โทรศัพท์', value: taxpayer.phone ?? '', type: 'text' },

    /* ---------- ยอดขาย ---------- */
    { key: 'totalSales', label: 'ยอดขายในเดือนนี้', formLine: '1', value: totalSales, type: 'money' },
    {
      key: 'zeroRatedSales',
      label: 'ยอดขายที่เสียภาษีในอัตราร้อยละ 0',
      formLine: '2',
      value: zeroRated,
      type: 'money',
    },
    {
      key: 'exemptSales',
      label: 'ยอดขายที่ได้รับยกเว้นภาษีมูลค่าเพิ่ม',
      formLine: '3',
      value: exempt,
      type: 'money',
    },
    {
      key: 'taxableSales',
      label: 'ยอดขายที่ต้องเสียภาษี',
      formLine: '4',
      value: taxable,
      type: 'money',
    },
    { key: 'outputVat', label: 'ภาษีขายเดือนนี้', formLine: '5', value: row.outputVat, type: 'money' },

    /* ---------- ยอดซื้อ ---------- */
    {
      key: 'purchasesEligible',
      label: 'ยอดซื้อที่มีสิทธินำภาษีซื้อมาหักในการคำนวณภาษีเดือนนี้',
      formLine: '6',
      value: r2(row.rate > 0 ? row.inputVat / row.rate : 0),
      type: 'money',
    },
    { key: 'inputVat', label: 'ภาษีซื้อเดือนนี้', formLine: '7', value: row.inputVat, type: 'money' },

    /* ---------- สรุป ---------- */
    {
      key: 'vatPayableBeforeCredit',
      label: 'ภาษีที่ต้องชำระ (ภาษีขาย > ภาษีซื้อ)',
      formLine: '8',
      value: r2(Math.max(0, row.outputVat - row.inputVat)),
      type: 'money',
    },
    {
      key: 'vatOverpaidBeforeCredit',
      label: 'ภาษีที่ชำระเกิน (ภาษีซื้อ > ภาษีขาย)',
      formLine: '9',
      value: r2(Math.max(0, row.inputVat - row.outputVat)),
      type: 'money',
    },
    {
      key: 'creditBrought',
      label: 'ภาษีที่ชำระเกินยกมา',
      formLine: '10',
      value: row.creditBrought,
      type: 'money',
    },
    {
      key: 'netVatPayable',
      label: 'ภาษีสุทธิที่ต้องชำระ',
      formLine: '11',
      value: row.payable,
      type: 'money',
    },
    {
      key: 'netVatOverpaid',
      label: 'ภาษีสุทธิที่ชำระเกิน (ยกไปเครดิต/ขอคืน)',
      formLine: '12',
      value: row.carryForward,
      type: 'money',
    },
    { key: 'penalty', label: 'เบี้ยปรับ', formLine: '14', value: penalty, type: 'money' },
    { key: 'surcharge', label: 'เงินเพิ่ม', formLine: '13', value: surcharge, type: 'money' },
    { key: 'grandTotal', label: 'รวมภาษีที่ต้องชำระทั้งสิ้น', formLine: '15', value: grandTotal, type: 'money' },

    /* ---------- ช่องเลือกข้อ 11/12 (ต้องชำระ / ชำระเกิน — เลือกได้ข้อเดียวตามเงื่อนไข net) ---------- */
    {
      key: 'netVatPayableChecked',
      label: 'ติ๊กข้อ 11 ต้องชำระ (ถ้า 8. มากกว่า 10.)',
      value: row.payable > 0 ? 1 : 0,
      type: 'checkbox',
    },
    {
      key: 'netVatOverpaidChecked',
      label: 'ติ๊กข้อ 12 ชำระเกิน ((ถ้า 10. มากกว่า 8.) หรือ (9. รวมกับ 10.))',
      value: row.carryForward > 0 ? 1 : 0,
      type: 'checkbox',
    },
  ];

  const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));

  return { period: row.period, month, yearBE, taxpayer, fields, byKey };
}

/**
 * ตรวจความสมเหตุสมผลก่อนส่งไป map PDF
 * คืนรายการปัญหา — ว่างเปล่า = ผ่าน
 */
export function validatePp30Fields(f: Pp30FormFields): string[] {
  const problems: string[] = [];
  const v = f.byKey;

  if (!String(v.taxpayerName || '').trim()) problems.push('ยังไม่มีชื่อผู้ประกอบการ');
  if (!/^\d{13}$/.test(String(v.taxId || '').replace(/\D/g, ''))) {
    problems.push('เลขประจำตัวผู้เสียภาษีต้องเป็นเลข 13 หลัก');
  }
  if (Number(v.netVatPayable) > 0 && Number(v.netVatOverpaid) > 0) {
    problems.push('ภาษีสุทธิที่ต้องชำระและที่ชำระเกิน มีค่าพร้อมกันไม่ได้');
  }
  const salesSum = r2(
    Number(v.taxableSales) + Number(v.zeroRatedSales) + Number(v.exemptSales),
  );
  if (salesSum !== Number(v.totalSales)) {
    problems.push(
      `ยอดขายรวม (${v.totalSales}) ไม่เท่ากับผลบวกของยอดขายแต่ละประเภท (${salesSum})`,
    );
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * DB-backed template override — mirror ของระบบ mapping ที่ใช้กับ ภ.ง.ด.90/94 อยู่แล้ว
 * (ตาราง public.tax_form_templates / public.tax_form_field_mappings ใน SAAS HorSet)
 *
 * ภ.ง.ด.90/94 ใช้ pdf-lib โหลด AcroForm template ที่ super admin อัปโหลดได้ แล้วแปล
 * "logical key → physical field name" ผ่านตาราง mapping ที่แก้ไขได้จากหน้า admin แทนที่จะ
 * hardcode ชื่อ field ในโค้ด (มี DEFAULT_PND90_MAPPING/DEFAULT_PND94_MAPPING เป็น fallback
 * เมื่อยังไม่มี override ในตาราง) — ภ.พ.30 mirror รูปแบบเดียวกันผ่านตาราง
 * pp30_form_templates / pp30_form_field_mappings (ดู database_patch_add_vat_pp30.sql) เป็นตาราง
 * แยกต่างหาก ไม่ไปแก้ CHECK constraint หรือข้อมูลของ tax_form_templates/tax_form_field_mappings เดิมเลย
 */

export type Pp30FieldKind = 'text' | 'radio';
export type Pp30ValueFormat = 'raw' | 'comb' | 'plain_decimal';

/** แถวของ public.pp30_form_templates */
export interface Pp30FormTemplateRow {
  id: string;
  taxYear: string | null;
  fileUrl: string;
  fileName?: string | null;
  isBundledDefault: boolean;
}

/** แถวของ public.pp30_form_field_mappings — physical field <-> logical key เดียวกับที่ 90/94 ใช้ */
export interface Pp30FormFieldMappingRow {
  id: string;
  templateId: string;
  logicalKey: string;
  fieldKind: Pp30FieldKind;
  physicalFieldName: string;
  optionKey?: string | null;
  widgetIndex?: number | null;
  valueFormat: Pp30ValueFormat | null;
}

/** ค่าที่พร้อมส่งให้ตัว fill PDF จริง (pdf-lib) — คีย์คือ physicalFieldName ไม่ใช่ logical key แล้ว */
export interface Pp30PhysicalValues {
  text: Record<string, { format: Pp30ValueFormat; value: number | string }>;
  radio: Record<string, string>;
}

/**
 * แปล Pp30FormFields (logical key) → ค่าตาม physical field name จริง โดยใช้ mapping จากตาราง
 * pp30_form_field_mappings (ถ้ามี override) — ถ้าไม่มี ผู้เรียกควร fallback ไปใช้
 * DEFAULT_PP30_MAPPING ใน pdfHelper.ts เอง (mapping รูปแบบเดียวกันนี้)
 *
 * ฟังก์ชันนี้ไม่รู้จัก pdf-lib และไม่โหลดไฟล์ PDF เอง — เป็นแค่ชั้นแปลข้อมูลบริสุทธิ์
 * เหมือนที่ pdfHelper.ts แยก compute*Values ออกจาก fillPdfFromMapping ของ 90/94
 */
export function resolvePp30PhysicalValues(
  form: Pp30FormFields,
  mapping: readonly Pp30FormFieldMappingRow[],
): Pp30PhysicalValues {
  const result: Pp30PhysicalValues = { text: {}, radio: {} };

  for (const m of mapping) {
    const value = form.byKey[m.logicalKey];
    if (value === undefined) continue;

    if (m.fieldKind === 'text') {
      result.text[m.physicalFieldName] = { format: m.valueFormat ?? 'comb', value };
    } else {
      // radio: physical field เป็นชื่อกลุ่ม, optionKey คือค่าที่ต้องเลือกเมื่อ value ตรงเงื่อนไข
      const checked = String(value) === '1' || String(value) === 'true';
      if (checked && m.optionKey) result.radio[m.physicalFieldName] = m.optionKey;
    }
  }

  return result;
}
