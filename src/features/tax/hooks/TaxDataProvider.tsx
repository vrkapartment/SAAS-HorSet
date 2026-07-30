'use client';

/**
 * Context ทางเลือก (optional) สำหรับส่ง TaxDataset ลงไปหลายชั้นโดยไม่ต้องผ่าน props
 *
 * ไม่จำเป็นต้องใช้ — component ทุกตัวในโฟลเดอร์นี้รับ dataset ผ่าน props ตรงๆ ได้
 * ตัวนี้มีไว้ให้สะดวกเวลาหน้าหนึ่งมี component ย่อยหลายตัวที่ต้องใช้ข้อมูลชุดเดียวกัน
 *
 * Provider ตัวนี้ไม่ fetch ข้อมูล — คุณเป็นคนเตรียม dataset จาก Supabase แล้วส่งเข้ามา
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { TaxDataset, TaxSettings } from '../../../types/tax';
import { DEFAULT_TAX_SETTINGS } from '../../../lib/tax';

const TaxDataContext = createContext<TaxDataset | null>(null);

export interface TaxDataProviderProps {
  children: ReactNode;
  /** ส่งก้อนเต็มมาเลย หรือส่งแยกเป็นชิ้นๆ ก็ได้ */
  dataset?: TaxDataset;
  incomes?: TaxDataset['incomes'];
  expenses?: TaxDataset['expenses'];
  settings?: Partial<TaxSettings>;
  deductions?: TaxDataset['deductions'];
  pp30Filings?: TaxDataset['pp30Filings'];
  pitFilings?: TaxDataset['pitFilings'];
}

export function TaxDataProvider({
  children,
  dataset,
  incomes,
  expenses,
  settings,
  deductions,
  pp30Filings,
  pitFilings,
}: TaxDataProviderProps) {
  const value = useMemo<TaxDataset>(() => {
    if (dataset) return dataset;
    return {
      incomes: incomes ?? [],
      expenses: expenses ?? [],
      // เติมค่าเริ่มต้นให้ครบ กัน settings ที่มาจาก DB ยังไม่มีคอลัมน์ VAT
      settings: { ...DEFAULT_TAX_SETTINGS, ...(settings ?? {}) } as TaxSettings,
      deductions: deductions ?? [],
      pp30Filings: pp30Filings ?? [],
      pitFilings: pitFilings ?? [],
    };
  }, [dataset, incomes, expenses, settings, deductions, pp30Filings, pitFilings]);

  return <TaxDataContext.Provider value={value}>{children}</TaxDataContext.Provider>;
}

/** อ่าน dataset จาก context — throw ถ้าลืมครอบ Provider */
export function useTaxDataset(): TaxDataset {
  const ctx = useContext(TaxDataContext);
  if (!ctx) {
    throw new Error('useTaxDataset ต้องอยู่ภายใน <TaxDataProvider>');
  }
  return ctx;
}

/** อ่าน dataset จาก context แบบไม่ throw — คืน null ถ้าไม่มี Provider */
export function useOptionalTaxDataset(): TaxDataset | null {
  return useContext(TaxDataContext);
}
