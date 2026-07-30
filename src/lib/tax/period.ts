/**
 * คณิตศาสตร์ของเดือน/รอบภาษี
 *
 * ตั้งใจใช้ string 'YYYY-MM' / 'YYYY-MM-DD' ทั้งหมด ไม่ใช้ Date object
 * เพราะ Date จะดึง timezone ของ browser เข้ามา แล้วรายรับวันที่ 1 ม.ค. อาจตกไปเป็น 31 ธ.ค.
 * ของปีก่อนสำหรับผู้ใช้ที่ timezone ต่างกัน → รอบภาษีเพี้ยน
 */

import type { DateKey, MonthKey, PitForm } from '../../types/tax';

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthOf(date: DateKey | null | undefined): MonthKey {
  return String(date ?? '').slice(0, 7);
}

/** 'YYYY-MM-DD' → 2026 */
export function yearOf(date: DateKey | null | undefined): number {
  return Number.parseInt(String(date ?? '').slice(0, 4), 10) || 0;
}

/** เลื่อนเดือน: addMonths('2026-01', -11) → '2025-02' */
export function addMonths(monthKey: MonthKey, delta: number): MonthKey {
  const [y, m] = String(monthKey).split('-').map(Number);
  if (!y || !m) return monthKey;
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12 + 1;
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`;
}

/** ผลต่างเป็นจำนวนเดือน (a - b) */
export function monthDiff(a: MonthKey, b: MonthKey): number {
  const [ay, am] = String(a).split('-').map(Number);
  const [by, bm] = String(b).split('-').map(Number);
  return ay * 12 + am - (by * 12 + bm);
}

/** รายการเดือนจาก start ถึง end (รวมปลายทั้งสองข้าง) — คืน [] ถ้า start > end */
export function monthsBetween(start: MonthKey, end: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  const n = monthDiff(end, start);
  if (n < 0) return out;
  for (let i = 0; i <= n; i += 1) out.push(addMonths(start, i));
  return out;
}

/** 12 เดือนของปี */
export function monthsOfYear(year: number): MonthKey[] {
  return monthsBetween(`${year}-01`, `${year}-12`);
}

/**
 * ช่วงวันที่ของรอบภาษี
 *  ภ.ง.ด.94 → 1 ม.ค. – 30 มิ.ย.
 *  ภ.ง.ด.90 → 1 ม.ค. – 31 ธ.ค.
 */
export function periodRange(
  year: number,
  form: PitForm,
): { from: DateKey; to: DateKey; months: number } {
  return form === 'PND94'
    ? { from: `${year}-01-01`, to: `${year}-06-30`, months: 6 }
    : { from: `${year}-01-01`, to: `${year}-12-31`, months: 12 };
}

/** ช่วงวันที่ของเดือน — ใช้ '-31' ได้เพราะเทียบเป็น string ไม่ได้ parse เป็นวันจริง */
export function monthRange(period: MonthKey): { from: DateKey; to: DateKey } {
  return { from: `${period}-01`, to: `${period}-31` };
}

/** เทียบช่วงแบบ string (ปลอดภัยกว่า Date เพราะไม่มี timezone) */
export function inRange(date: DateKey | null | undefined, from: DateKey, to: DateKey): boolean {
  const d = String(date ?? '');
  return d >= from && d <= to;
}

/** วันนี้ในรูป 'YYYY-MM-DD' ตามเวลาเครื่องผู้ใช้ */
export function todayISO(): DateKey {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function thisMonthKey(): MonthKey {
  return todayISO().slice(0, 7);
}

export function thisYear(): number {
  return new Date().getFullYear();
}
