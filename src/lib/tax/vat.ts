/**
 * VAT — การแยก VAT ออกจากฐานรายได้ และเกณฑ์ 1.8 ล้าน / 12 เดือนเคลื่อนที่
 *
 * กฎเหล็ก 3 ข้อที่โค้ดในไฟล์นี้บังคับไว้:
 *   1) ตะกร้า A (40(5) ค่าเช่า) → vat = 0 เสมอ ไม่ว่าจะจดทะเบียนแล้วหรือไม่
 *   2) นับเกณฑ์เฉพาะฐานรายได้ตะกร้า B ที่ถอด VAT ออกแล้ว
 *   3) คิด VAT เฉพาะเมื่อ "จดแล้ว" และ "ถึงเดือนที่มีผล" — ใบก่อนหน้านั้นไม่โดน
 */

import type {
  IncomeRow,
  MonthKey,
  ThresholdBreach,
  VatSettings,
  VatSplit,
  VatStatus,
  Bucket,
} from '../../types/tax';
import { RD_URL, VAT_RATE, VAT_THRESHOLD } from './constants';
import { clamp0, num, r2 } from './money';
import { addMonths, monthDiff, monthOf, monthsBetween } from './period';

/**
 * ถอด VAT ออกจากยอดรวม (ยอดที่กรอกคือ "รวม VAT แล้ว")
 * รับประกันว่า base + vat === total ทุกกรณี แม้หาร 1.07 ไม่ลงตัว
 */
export function splitVatFromGross(gross: number | string, rate: number = VAT_RATE): VatSplit {
  const g = num(gross);
  const base = r2(g / (1 + rate));
  return { base, vat: r2(g - base), total: r2(g) };
}

/** บวก VAT จากฐาน (ยอดที่กรอกคือ "ยังไม่รวม VAT") */
export function addVat(base: number | string, rate: number = VAT_RATE): VatSplit {
  const b = r2(num(base));
  const vat = r2(b * rate);
  return { base: b, vat, total: r2(b + vat) };
}

/**
 * แปลงยอดที่ผู้ใช้กรอก 1 บรรทัด → { base, vat }
 * ใช้ตัวนี้ทุกครั้งที่บันทึกรายรับ อย่าคำนวณเองในฟอร์ม
 */
export function normalizeAmount(input: {
  bucket: Bucket;
  amount: number | string;
  /** true = ยอดที่กรอกรวม VAT แล้ว */
  amountIsGross?: boolean;
  /** ต้องส่ง vatStatus.charging เข้ามา ไม่ใช่ settings.vatRegistered เฉยๆ */
  vatApplies?: boolean;
  rate?: number;
}): VatSplit {
  const { bucket, amount, amountIsGross = false, vatApplies = false, rate = VAT_RATE } = input;
  const raw = num(amount);
  // กฎข้อ 1: ตะกร้า A ไม่มี VAT เด็ดขาด
  if (bucket === 'A' || !vatApplies) {
    return { base: r2(raw), vat: 0, total: r2(raw) };
  }
  return amountIsGross ? splitVatFromGross(raw, rate) : addVat(raw, rate);
}

/**
 * สถานะ VAT ณ เดือนที่ระบุ
 *
 * @param incomes รายรับทั้งหมด (ไม่ต้องกรองปี — ฟังก์ชันนี้ต้องเห็นข้อมูลข้ามปีเพื่อคิด rolling 12 เดือน)
 * @param asOfMonth 'YYYY-MM'
 */
export function vatStatus(
  incomes: readonly IncomeRow[],
  asOfMonth: MonthKey,
  settings: Partial<VatSettings> = {},
): VatStatus {
  const threshold = num(settings.vatThreshold) || VAT_THRESHOLD;
  const rate = Number.isFinite(settings.vatRate) ? (settings.vatRate as number) : VAT_RATE;
  const registered = Boolean(settings.vatRegistered);
  const registeredFrom = settings.vatRegisteredFrom ?? null;

  const windowStart = addMonths(asOfMonth, -11);
  let rolling12 = 0;
  let monthOnly = 0;

  for (const e of incomes) {
    // กฎข้อ 2: ค่าเช่า 40(5) ไม่ถูกนับเข้าเกณฑ์
    if (e.bucket !== 'B') continue;
    const m = monthOf(e.date);
    if (m === asOfMonth) monthOnly += num(e.base);
    if (monthDiff(m, windowStart) >= 0 && monthDiff(asOfMonth, m) >= 0) {
      rolling12 += num(e.base);
    }
  }
  rolling12 = r2(rolling12);

  // ต้อง "เกิน" จริง — พอดี 1,800,000 ยังไม่เกิน
  const exceeded = rolling12 > threshold;
  // กฎข้อ 3
  const charging = registered && (!registeredFrom || monthDiff(asOfMonth, registeredFrom) >= 0);

  return {
    asOfMonth,
    windowStart,
    windowEnd: asOfMonth,
    rolling12,
    monthOnly: r2(monthOnly),
    threshold,
    rate,
    remaining: r2(clamp0(threshold - rolling12)),
    usedPct: threshold > 0 ? Math.min(999, r2((rolling12 / threshold) * 100)) : 0,
    exceeded,
    registered,
    registeredFrom,
    charging,
    mustRegisterWarning: exceeded && !registered,
    rdUrl: RD_URL,
  };
}

/**
 * เดือนแรกที่รายได้ 40(8) แบบ 12 เดือนเคลื่อนที่ทะลุเกณฑ์
 * ใช้บอกผู้ใช้ว่าต้องยื่นคำขอจดทะเบียนภายใน 30 วันนับจากเมื่อไร
 */
export function firstThresholdBreach(
  incomes: readonly IncomeRow[],
  settings: Partial<VatSettings> = {},
): ThresholdBreach | null {
  const bRows = incomes.filter((e) => e.bucket === 'B' && e.date);
  if (!bRows.length) return null;
  const months = bRows.map((e) => monthOf(e.date)).sort();
  for (const m of monthsBetween(months[0], months[months.length - 1])) {
    const st = vatStatus(incomes, m, settings);
    if (st.exceeded) return { month: m, rolling12: st.rolling12, threshold: st.threshold };
  }
  return null;
}

/**
 * VAT เปิดใช้งานอยู่หรือไม่ — ใช้เป็น gate ของ UI ทุกส่วนที่เกี่ยวกับ VAT
 * (ช่องภาษีซื้อ, หน้า ภ.พ.30, คอลัมน์ VAT ในตาราง ฯลฯ)
 */
export function isVatEnabled(settings: Partial<VatSettings> | null | undefined): boolean {
  return Boolean(settings?.vatRegistered);
}
