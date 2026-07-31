/**
 * จัดรูปแบบตัวเลข/วันที่ไทย
 *
 * ⚠️ ข้อควรระวังเรื่อง Next.js SSR:
 *    Intl.NumberFormat('th-TH') ให้ผลลัพธ์ต่างกันได้ระหว่าง Node (server) กับ browser
 *    ถ้า Node build ไม่มี full-icu → เกิด hydration mismatch
 *    Node 14+ ที่ build จาก official image มี full-icu มาแล้ว แต่ถ้าเจอ warning
 *    ให้ format ที่ server แล้วส่งเป็น string ลงมา หรือ format ใน useEffect เท่านั้น
 *    (ตัวเลขในโค้ดนี้ไม่ใช้ locale ที่มี native digits จึงปลอดภัยกว่ากรณี 'th-TH-u-nu-thai')
 */

const money2 = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money0 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

export const TH_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;

export const TH_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const;

// ⚠️ thaiMonth()/thaiDate() รับ locale เป็นพารามิเตอร์ตัวสุดท้าย (ดีฟอลต์ 'th' เพื่อไม่ต้องแก้จุดเรียกเดิมที่มี
// อยู่แล้วทั่วฟีเจอร์ภาษี) — locale='en' ใช้ชื่อเดือนอังกฤษ + ปี ค.ศ. แทนชื่อเดือนไทย + ปี พ.ศ.
export const EN_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const EN_MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export type DateLocale = 'th' | 'en';

/** 1234567.5 → "1,234,567.50" */
export function baht(n: number | null | undefined, decimals: 0 | 2 = 2): string {
  const v = Number.isFinite(n) ? (n as number) : 0;
  return decimals === 0 ? money0.format(v) : money2.format(v);
}

/** พร้อมสัญลักษณ์ ฿ */
export function bahtSign(n: number | null | undefined, decimals: 0 | 2 = 2): string {
  return `฿${baht(n, decimals)}`;
}

export function pct(rate: number, decimals = 0): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}

/** '2026-03-15' → '15 มี.ค. 2569' (locale='th', ค่าเริ่มต้น) หรือ '15 Mar 2026' (locale='en') */
export function thaiDate(iso: string | null | undefined, locale: DateLocale = 'th'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  const [, y, mo, d] = m;
  if (locale === 'en') {
    return `${Number(d)} ${EN_MONTHS_SHORT[Number(mo) - 1]} ${Number(y)}`;
  }
  return `${Number(d)} ${TH_MONTHS_SHORT[Number(mo) - 1]} ${Number(y) + 543}`;
}

/** '2026-03' → 'มีนาคม 2569' หรือ 'มี.ค. 2569' (locale='th', ค่าเริ่มต้น) — locale='en' ได้ 'March 2026'/'Mar 2026' */
export function thaiMonth(key: string | null | undefined, short = false, locale: DateLocale = 'th'): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key ?? ''));
  if (!m) return String(key ?? '');
  if (locale === 'en') {
    const namesEn = short ? EN_MONTHS_SHORT : EN_MONTHS_FULL;
    return `${namesEn[Number(m[2]) - 1]} ${Number(m[1])}`;
  }
  const names = short ? TH_MONTHS_SHORT : TH_MONTHS_FULL;
  return `${names[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

/** 2026 → 2569 */
export function buddhistYear(year: number): number {
  return year + 543;
}

/** 2026 → 'ปีภาษี 2569 (2026)' */
export function taxYearLabel(year: number): string {
  return `ปีภาษี ${year + 543} (${year})`;
}

/**
 * สร้าง CSV ที่ Excel ภาษาไทยเปิดได้ (มี BOM นำหน้า)
 * ⚠️ การ "ดาวน์โหลด" ต้องทำด้วย Blob + URL.createObjectURL บน browser
 *    ดู downloadCsv() ด้านล่าง — ห้ามใช้ fs.writeFile แบบใน Electron
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))];
  return `﻿${lines.join('\r\n')}`;
}

/**
 * ดาวน์โหลด CSV บน browser — แทนที่ dialog.showSaveDialog ของ Electron
 * เรียกได้เฉพาะฝั่ง client ('use client')
 */
export function downloadCsv(filename: string, contents: string): void {
  if (typeof window === 'undefined') {
    throw new Error('downloadCsv ใช้ได้เฉพาะฝั่ง client');
  }
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // ปล่อย memory คืน — ถ้าไม่ revoke จะค้างจนกว่าจะปิดแท็บ
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
