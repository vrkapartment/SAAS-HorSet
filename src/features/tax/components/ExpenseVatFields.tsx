'use client';

/**
 * ฟีเจอร์ 2: ค่าใช้จ่าย / ภาษีซื้อ
 *
 * ตัวนี้ออกแบบให้ "เสียบเข้าฟอร์มค่าใช้จ่ายที่มีอยู่แล้ว" ไม่ใช่มาแทนทั้งฟอร์ม
 * ฟอร์มเดิมแยก 40(5)/40(8) อยู่แล้ว → เก็บส่วนนั้นไว้ แล้วเพิ่มบล็อกนี้ต่อท้าย
 *
 * ทั้งบล็อกจะหายไปเองเมื่อยังไม่จด VAT (ตามกฎ VatGate)
 * เมื่อยังไม่จด: ยอดที่ผู้ใช้กรอกคือ base ตรงๆ, vat = 0 — ฟอร์มเดิมทำงานเหมือนเดิมเป๊ะ
 *
 * รูปแบบ controlled component: ถือ state ไว้เอง แล้วรับค่าที่คำนวณแล้วผ่าน onChange
 */

import { useMemo } from 'react';

import type { Bucket, ExpenseSummary, TaxSettings } from '../../../types/tax';
import { addVat, isVatEnabled, num, r2, splitVatFromGross } from '../../../lib/tax';
import { baht, pct } from '../../../lib/tax/format';
import { Alert, HelpNote, Money, StatTile, cx } from './primitives';

/** โหมดการกรอกยอด */
export type ExpenseVatMode =
  /** ไม่มี VAT (ใบเสร็จธรรมดา / ผู้ขายไม่ได้จด VAT) */
  | 'novat'
  /** ยอดที่กรอกรวม VAT แล้ว → ระบบถอด 7% ออก */
  | 'gross'
  /** ยอดที่กรอกยังไม่รวม VAT → ระบบบวก 7% */
  | 'base';

export interface ExpenseVatValue {
  amount: number | string;
  vatMode: ExpenseVatMode;
  claimInputVat: boolean;
}

export interface ExpenseVatComputed {
  base: number;
  vat: number;
  total: number;
  claimInputVat: boolean;
}

/**
 * คำนวณ base/vat จากค่าที่ผู้ใช้กรอก
 * เรียกฟังก์ชันนี้ตอน submit ฟอร์มด้วย เพื่อให้ค่าที่บันทึกลง DB ตรงกับที่แสดงบนจอ
 */
export function computeExpenseVat(
  value: ExpenseVatValue,
  settings: Pick<TaxSettings, 'vatRegistered' | 'vatRate'>,
): ExpenseVatComputed {
  const raw = num(value.amount);
  const rate = settings.vatRate ?? 0.07;

  // ยังไม่จด VAT → ไม่มีภาษีซื้ออยู่ในระบบเลย
  if (!isVatEnabled(settings) || value.vatMode === 'novat') {
    return { base: r2(raw), vat: 0, total: r2(raw), claimInputVat: false };
  }

  const split = value.vatMode === 'gross' ? splitVatFromGross(raw, rate) : addVat(raw, rate);
  return {
    base: split.base,
    vat: split.vat,
    total: split.total,
    claimInputVat: split.vat > 0 ? value.claimInputVat : false,
  };
}

/* ------------------------------------------------------------------ *
 * ฟิลด์ VAT (เสียบเข้าฟอร์มเดิม)
 * ------------------------------------------------------------------ */

export interface ExpenseVatFieldsProps {
  value: ExpenseVatValue;
  onChange: (next: ExpenseVatValue) => void;
  settings: Pick<TaxSettings, 'vatRegistered' | 'vatRate'>;
  /** ตะกร้าที่ฟอร์มเดิมเลือกไว้ — ใช้แค่แสดงคำอธิบาย ไม่ได้เปลี่ยนการคำนวณ */
  bucket?: Bucket;
  /** ซ่อนพรีวิว (ถ้าฟอร์มมีพรีวิวของตัวเองอยู่แล้ว) */
  hidePreview?: boolean;
  className?: string;
}

export function ExpenseVatFields({
  value,
  onChange,
  settings,
  bucket,
  hidePreview = false,
  className,
}: ExpenseVatFieldsProps) {
  const enabled = isVatEnabled(settings);
  const computed = useMemo(() => computeExpenseVat(value, settings), [value, settings]);
  const rate = settings.vatRate ?? 0.07;

  // กฎ: ไม่จด VAT = ไม่เห็นอะไรเกี่ยวกับ VAT เลย
  if (!enabled) return null;

  const hasVat = value.vatMode !== 'novat';

  return (
    <div className={cx('space-y-3', className)}>
      <div className="flex flex-col gap-1.5">
        <label className={labelCls} htmlFor="expense-vat-mode">
          รูปแบบ VAT ของใบนี้
        </label>
        <select
          id="expense-vat-mode"
          className={inputCls}
          value={value.vatMode}
          onChange={(e) => onChange({ ...value, vatMode: e.target.value as ExpenseVatMode })}
        >
          <option value="novat">ไม่มี VAT</option>
          <option value="gross">ยอดที่กรอกรวม VAT แล้ว (ถอด {pct(rate)} ออก)</option>
          <option value="base">ยอดที่กรอกยังไม่รวม VAT (บวก {pct(rate)})</option>
        </select>
      </div>

      {hasVat && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600"
            checked={value.claimInputVat}
            onChange={(e) => onChange({ ...value, claimInputVat: e.target.checked })}
          />
          <span className="min-w-0">
            <span className="text-slate-800 dark:text-slate-100">
              นำภาษีซื้อนี้ไปเครดิตใน ภ.พ.30
            </span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400">
              ไม่ติ๊กสำหรับใบกำกับที่ขอเครดิตไม่ได้ เช่น ไม่ใช่ใบกำกับภาษีเต็มรูป
              หรือเป็นค่าใช้จ่ายฝั่งค่าเช่าที่ได้รับยกเว้น VAT
            </span>
          </span>
        </label>
      )}

      {!hidePreview && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">ฐานค่าใช้จ่าย</dt>
            <dd className="font-semibold"><Money value={computed.base} /> บาท</dd>
            <dt className="text-slate-500">ภาษีซื้อ {pct(rate)}</dt>
            <dd className={computed.vat ? 'font-semibold' : 'text-slate-400'}>
              {computed.vat ? <><Money value={computed.vat} /> บาท</> : '—'}
            </dd>
            <dt className="text-slate-500">รวมจ่าย</dt>
            <dd className="font-semibold"><Money value={computed.total} /> บาท</dd>
          </dl>
          {computed.vat > 0 && !computed.claimInputVat && (
            <HelpNote>ภาษีซื้อนี้จะไม่ถูกนำไปหักใน ภ.พ.30</HelpNote>
          )}
          {bucket === 'A' && computed.vat > 0 && (
            <HelpNote>
              ค่าใช้จ่ายฝั่งค่าเช่า 40(5) มักขอเครดิตภาษีซื้อไม่ได้ เพราะกิจการให้เช่าอสังหาริมทรัพย์
              ได้รับยกเว้น VAT — ตรวจกับผู้ทำบัญชีก่อนติ๊กขอเครดิต
            </HelpNote>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * การ์ดสรุปหัวหน้ารายการค่าใช้จ่าย
 * ------------------------------------------------------------------ */

export interface ExpenseSummaryTilesProps {
  summary: ExpenseSummary;
  settings: Pick<TaxSettings, 'vatRegistered' | 'expenseA' | 'expenseB'>;
  /** ภาษีซื้อทั้งหมดรวมที่ขอเครดิตไม่ได้ — จาก totalInputVatIncludingUnclaimable() */
  inputVatAll?: number;
}

export function ExpenseSummaryTiles({
  summary,
  settings,
  inputVatAll,
}: ExpenseSummaryTilesProps) {
  const vatEnabled = isVatEnabled(settings);
  const usingActualA = settings.expenseA?.mode === 'actual';
  const usingActualB = settings.expenseB?.mode === 'actual';

  return (
    <div className={cx('grid gap-4', vatEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      <StatTile
        label="ค่าใช้จ่ายฝั่ง A · ค่าเช่า"
        value={summary.expenseA}
        accent="bucketA"
        note={
          usingActualA
            ? '✓ ใช้เป็นค่าใช้จ่ายจริงใน ภ.ง.ด.'
            : 'ตั้งค่าเป็น "หักเหมา" — ยอดนี้ยังไม่ถูกใช้คำนวณภาษี'
        }
      />
      <StatTile
        label="ค่าใช้จ่ายฝั่ง B · บริการ"
        value={summary.expenseB}
        accent="bucketB"
        note={
          usingActualB
            ? '✓ ใช้เป็นค่าใช้จ่ายจริงใน ภ.ง.ด.'
            : 'ตั้งค่าเป็น "หักเหมา" — ยอดนี้ยังไม่ถูกใช้คำนวณภาษี'
        }
      />
      {vatEnabled && (
        <StatTile
          label="ภาษีซื้อที่ขอเครดิตได้"
          value={summary.inputVat}
          accent="info"
          note={
            inputVatAll != null && inputVatAll > summary.inputVat
              ? `จากภาษีซื้อทั้งหมด ${baht(inputVatAll)}`
              : 'นำไปใช้ในแบบ ภ.พ.30'
          }
        />
      )}
    </div>
  );
}

/**
 * แจ้งเตือนกรณีตั้งค่า "หักเหมา" แต่ผู้ใช้ยังบันทึกค่าใช้จ่ายเข้ามาเยอะ
 * ป้องกันความเข้าใจผิดว่า "บันทึกแล้วภาษีต้องลด"
 */
export function ExpenseModeMismatchNotice({
  summary,
  settings,
  onGoToSettings,
}: {
  summary: ExpenseSummary;
  settings: Pick<TaxSettings, 'expenseA' | 'expenseB'>;
  onGoToSettings?: () => void;
}) {
  const bothLump =
    settings.expenseA?.mode === 'lump' && settings.expenseB?.mode === 'lump';
  if (!bothLump || summary.total <= 0) return null;

  return (
    <Alert tone="info" title="ค่าใช้จ่ายที่บันทึกไว้ยังไม่ถูกใช้คำนวณ ภ.ง.ด.">
      ตอนนี้ตั้งค่าเป็น <b>หักเหมา</b> ทั้งสองตะกร้า ระบบจึงหักตามอัตรา % ไม่ได้ใช้ยอดจริง{' '}
      {baht(summary.total)} บาทที่บันทึกไว้
      {onGoToSettings && (
        <>
          {' — '}
          <button type="button" onClick={onGoToSettings} className="font-semibold underline">
            เปลี่ยนเป็นหักตามจริงได้ที่หน้าตั้งค่า
          </button>
        </>
      )}
      <HelpNote>
        ยอดภาษีซื้อยังถูกนำไปใช้ใน ภ.พ.30 ตามปกติ — โหมดหักค่าใช้จ่ายมีผลกับ ภ.ง.ด. เท่านั้น
      </HelpNote>
    </Alert>
  );
}

const labelCls = 'text-xs font-semibold text-slate-600 dark:text-slate-300';
const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-sm text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800/80 dark:bg-slate-950/40 dark:text-slate-200 dark:focus:bg-slate-900';
