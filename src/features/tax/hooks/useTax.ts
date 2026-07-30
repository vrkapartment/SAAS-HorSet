'use client';

/**
 * React hooks บางๆ ที่ห่อแกนคำนวณไว้ให้ memoize อัตโนมัติ
 *
 * ทุก hook รับ `dataset` เข้ามาตรงๆ ไม่ไป fetch เอง — คุณจะดึงข้อมูลด้วยวิธีไหนก็ได้
 * (Server Component ส่ง props ลงมา / Supabase server action) ถ้าไม่อยากส่ง prop ลงลึกๆ
 * ใช้ TaxDataProvider ที่แนบมาคู่กัน
 *
 * ⚠️ useTaxOverview() คืน yearIncome/yearExpense (จาก summarizeIncome/summarizeExpenses — เป็น
 *    การรวมยอด ไม่ใช่การคำนวณภาษีเงินได้) เจตนาตัด pnd94/pnd90 (PeriodComputation จาก
 *    computePeriod()/lib/tax/pit.ts) ออกจาก hook นี้ เพราะตัวเลข ภ.ง.ด.90/94 ที่ใช้ยื่นจริงต้องมาจาก
 *    src/lib/thaiTax.ts เท่านั้น (ดู PitBreakdown ในหน้า tax) — useIncomeTax/useIncomeTaxBoth ด้านล่าง
 *    ยังมีไว้สำหรับ engine ใหม่ (ทดสอบ/เทียบเลขใน __tests__) แต่ไม่ควรใช้แสดงผลจริงในหน้า UI
 *
 * ⚠️ การคำนวณทั้งหมดเป็น synchronous และเบา (ข้อมูลระดับหลักพันแถวยังเร็ว)
 *    ถ้าข้อมูลโตถึงหลักหมื่นแถวต่อปี ให้ย้าย computation ไปทำที่ server แล้วส่งผลลัพธ์ลงมาเป็น props แทน
 */

import { useMemo } from 'react';

import type {
  ExpenseSummary,
  IncomeSummary,
  MonthKey,
  PeriodComputation,
  PitForm,
  Pp30Row,
  TaxDataset,
  VatStatus,
} from '../../../types/tax';
import {
  availableYears,
  buildPP30Series,
  computePeriod,
  hasDataForYear,
  isVatEnabled,
  latestVatStatus,
  monthlyBreakdown,
  periodRange,
  pp30RowsForYear,
  pp30YearTotals,
  summarizeExpenses,
  summarizeIncome,
  vatStatus,
  type MonthlyRow,
  type Pp30YearTotals,
} from '../../../lib/tax';

/* ------------------------------------------------------------------ *
 * VAT
 * ------------------------------------------------------------------ */

/**
 * สวิตช์หลักของฟีเจอร์ VAT
 *
 * ใช้ตัวนี้ครอบทุก UI ที่เกี่ยวกับ VAT — ช่องภาษีซื้อในฟอร์มค่าใช้จ่าย, เมนู ภ.พ.30,
 * คอลัมน์ VAT ในตาราง, การ์ดเกณฑ์ 1.8 ล้าน
 * เจ้าของหอที่ยังไม่จด VAT ต้องไม่เห็นอะไรเลยที่พูดถึง VAT
 */
export function useVatEnabled(dataset: Pick<TaxDataset, 'settings'>): boolean {
  return isVatEnabled(dataset.settings);
}

/** สถานะ VAT ล่าสุด (rolling 12 เดือน, เกินเกณฑ์หรือยัง, ต้องคิด VAT เดือนนี้ไหม) */
export function useVatStatus(dataset: TaxDataset): VatStatus {
  return useMemo(() => latestVatStatus(dataset), [dataset]);
}

/** สถานะ VAT ของเดือนที่ระบุ — ใช้ตอนออกใบแจ้งหนี้/บันทึกรายรับย้อนหลัง */
export function useVatStatusForMonth(dataset: TaxDataset, month: MonthKey): VatStatus {
  return useMemo(
    () => vatStatus(dataset.incomes, month, dataset.settings),
    [dataset.incomes, dataset.settings, month],
  );
}

/* ------------------------------------------------------------------ *
 * ภ.พ.30
 * ------------------------------------------------------------------ */

export interface UsePp30Result {
  /** แถวของปีที่เลือก (เครดิตยกมาคิดจากทั้งสายข้ามปีแล้ว) */
  rows: Pp30Row[];
  /** ทุกแถวทุกปี — ใช้เวลาต้องดูสายเครดิตทั้งหมด */
  allRows: Pp30Row[];
  totals: Pp30YearTotals;
  /** false = ยังไม่จด VAT → ควรซ่อนหน้านี้ทั้งหน้า */
  enabled: boolean;
}

/**
 * สร้างแถว ภ.พ.30 พร้อมเครดิตภาษีซื้อยกมาที่ต่อกันเป็นสายแล้ว
 *
 * สำคัญ: คำนวณสายเครดิตจาก "ข้อมูลทุกปี" ก่อนแล้วจึงกรองปี
 * ถ้ากรองปีก่อนคำนวณ เครดิตที่ยกมาจากเดือน ธ.ค. ปีก่อนจะหายไป
 */
export function usePp30(dataset: TaxDataset, year: number): UsePp30Result {
  return useMemo(() => {
    const enabled = isVatEnabled(dataset.settings);
    if (!enabled) {
      return {
        rows: [],
        allRows: [],
        totals: {
          outputVat: 0, inputVat: 0, payable: 0, serviceBase: 0,
          monthsToPay: 0, closingCredit: 0,
        },
        enabled,
      };
    }
    const allRows = buildPP30Series(
      dataset.incomes,
      dataset.expenses,
      dataset.settings,
      dataset.pp30Filings,
    );
    const rows = pp30RowsForYear(allRows, year);
    return { rows, allRows, totals: pp30YearTotals(rows), enabled };
  }, [dataset, year]);
}

/* ------------------------------------------------------------------ *
 * ภ.ง.ด.94 / ภ.ง.ด.90 (engine ใหม่ — ใช้เฉพาะทดสอบ/เทียบเลข ไม่ใช้แสดงผลจริง)
 * ------------------------------------------------------------------ */

/** ผลคำนวณรอบภาษีหนึ่งจาก engine ใหม่ — ห้ามใช้แสดงตัวเลขที่จะเอาไปยื่นจริง */
export function useIncomeTax(
  dataset: TaxDataset,
  year: number,
  form: PitForm,
): PeriodComputation {
  return useMemo(() => computePeriod(dataset, year, form), [dataset, year, form]);
}

/** ทั้งครึ่งปีและสิ้นปีพร้อมกันจาก engine ใหม่ — ห้ามใช้แสดงตัวเลขที่จะเอาไปยื่นจริง */
export function useIncomeTaxBoth(
  dataset: TaxDataset,
  year: number,
): { pnd94: PeriodComputation; pnd90: PeriodComputation } {
  return useMemo(
    () => ({
      pnd94: computePeriod(dataset, year, 'PND94'),
      pnd90: computePeriod(dataset, year, 'PND90'),
    }),
    [dataset, year],
  );
}

/* ------------------------------------------------------------------ *
 * ภาพรวม
 * ------------------------------------------------------------------ */

export interface UseTaxOverviewResult {
  vat: VatStatus;
  vatEnabled: boolean;
  /** ยอดรวมรายได้ทั้งปี (1 ม.ค. – 31 ธ.ค.) — แค่รวมยอด ไม่ใช่ผลคำนวณภาษีเงินได้ */
  yearIncome: IncomeSummary;
  yearExpense: ExpenseSummary;
  months: MonthlyRow[];
  hasData: boolean;
  years: number[];
}

/** ทุกอย่างที่หน้าภาพรวม VAT ต้องใช้ ในการคำนวณรอบเดียว */
export function useTaxOverview(dataset: TaxDataset, year: number): UseTaxOverviewResult {
  return useMemo(() => {
    const { from, to } = periodRange(year, 'PND90');
    return {
      vat: latestVatStatus(dataset),
      vatEnabled: isVatEnabled(dataset.settings),
      yearIncome: summarizeIncome(dataset.incomes, from, to),
      yearExpense: summarizeExpenses(dataset.expenses, from, to),
      months: monthlyBreakdown(dataset, year),
      hasData: hasDataForYear(dataset, year),
      years: availableYears(dataset),
    };
  }, [dataset, year]);
}
