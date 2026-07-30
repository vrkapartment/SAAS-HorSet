/**
 * แกนคำนวณภาษี — จุดเข้าเดียว
 *
 *   import { computePeriod, vatStatus, buildPP30Series } from '@/lib/tax';
 *
 * ไฟล์ทั้งหมดใต้ lib/tax/ เป็นฟังก์ชันบริสุทธิ์ ไม่มี dependency ภายนอก
 * ไม่แตะ DOM, fs, React หรือ Supabase — เรียกได้จากทุกที่ใน Next.js
 *
 * ⚠️ ใช้กับ VAT/ภ.พ.30 เท่านั้น — ตัวเลข ภ.ง.ด.90/94 ที่ยื่นจริงยังอยู่ที่ src/lib/thaiTax.ts
 */

export * from './constants';
export * from './money';
export * from './period';
export * from './vat';
export * from './aggregate';
export * from './pp30';
export * from './pit';
export * from './compute';
