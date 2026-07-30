/** ตัวช่วยตัวเลข — ไม่มี dependency, ใช้ได้ทั้ง client และ server */

/**
 * ปัดเป็นสตางค์ (2 ตำแหน่ง) แบบเลี่ยงปัญหา floating point
 * r2(0.1 + 0.2) === 0.3  (ไม่ใช่ 0.30000000000000004)
 */
export function r2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON * Math.sign(n) * 1e6) * 100) / 100;
}

/**
 * แปลงค่าที่รับจาก input/DB ให้เป็นตัวเลข
 * รับ '1,800,000.50' และ '฿ 12,000' ได้ — ค่าที่แปลงไม่ได้คืน 0 (ไม่ throw, ไม่คืน NaN)
 */
export function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  const cleaned = v.replace(/[,\s฿]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** ตัดค่าติดลบเป็น 0 — ใช้กับเงินได้สุทธิและยอดภาษี ซึ่งติดลบไม่ได้ */
export function clamp0(n: number): number {
  return n > 0 ? n : 0;
}

/** จำกัดค่าให้อยู่ในช่วง */
export function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

/** ผลรวมแบบปัดสตางค์ท้ายสุดครั้งเดียว (ลดการสะสมเศษ) */
export function sumBy<T>(rows: readonly T[], pick: (row: T) => number): number {
  let total = 0;
  for (const row of rows) total += num(pick(row));
  return r2(total);
}
