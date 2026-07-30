'use client';

/**
 * VatGate — ประตูเดียวที่คุมว่า UI ของ VAT จะโผล่หรือไม่
 *
 * กฎที่ทีมตกลงกันไว้: ฟีเจอร์ที่เกี่ยวกับ VAT ต้องแสดง "เฉพาะตอนที่เจ้าของหอเลือกว่าจด VAT"
 * เจ้าของหอที่ยังไม่จดต้องไม่เห็นอะไรเลยที่พูดถึง VAT / ภาษีซื้อ / ภ.พ.30
 *
 * ครอบทุกที่ที่มีคำว่า VAT:
 *   - ช่องภาษีซื้อในฟอร์มค่าใช้จ่าย
 *   - เมนู/หน้า ภ.พ.30
 *   - คอลัมน์ VAT ในตารางรายรับ/ค่าใช้จ่าย
 *   - บรรทัด VAT ในบิล
 *   - การ์ดเกณฑ์ 1.8 ล้าน (ยกเว้นกรณีคำเตือนว่าเกินเกณฑ์ ดู `VatNotRegisteredOnly`)
 *
 * ⚠️ ห้ามใช้ `settings.vatRegistered` ตรงๆ กระจายทั่วโค้ด — ใช้ตัวนี้เพื่อให้แก้กฎที่เดียวได้
 */

import type { ReactNode } from 'react';

import type { TaxSettings, VatSettings } from '../../../types/tax';
import { isVatEnabled } from '../../../lib/tax';

export interface VatGateProps {
  settings: Pick<TaxSettings, 'vatRegistered'> | VatSettings | null | undefined;
  children: ReactNode;
  /** แสดงอันนี้แทนเมื่อยังไม่จด VAT (ปกติไม่ต้องส่ง = ซ่อนเงียบๆ) */
  fallback?: ReactNode;
}

export function VatGate({ settings, children, fallback = null }: VatGateProps) {
  return <>{isVatEnabled(settings) ? children : fallback}</>;
}

/**
 * ตรงกันข้าม — แสดงเฉพาะเมื่อ "ยังไม่จด" VAT
 * ใช้กับคำเตือน "รายได้เกิน 1.8 ล้าน ต้องไปจด VAT" ซึ่งต้องเห็นตอนยังไม่จดเท่านั้น
 */
export function VatNotRegisteredOnly({
  settings,
  children,
}: {
  settings: Pick<TaxSettings, 'vatRegistered'> | VatSettings | null | undefined;
  children: ReactNode;
}) {
  return <>{isVatEnabled(settings) ? null : children}</>;
}
