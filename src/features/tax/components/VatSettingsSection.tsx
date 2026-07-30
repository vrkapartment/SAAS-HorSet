'use client';

/**
 * ฟีเจอร์ 5: ส่วน VAT ในหน้าตั้งค่า (ของใหม่ทั้งบล็อก)
 *
 * ⚠️ จุดที่พลาดกันบ่อยและ component นี้บังคับไว้:
 *    การเปิดสวิตช์ "จดทะเบียน VAT แล้ว" ต้องมาคู่กับ "เดือนที่การจดมีผล" เสมอ
 *    ถ้ามีแต่สวิตช์ boolean เดียว ระบบจะคิด VAT ย้อนหลังทั้งหมดตั้งแต่แถวแรกในฐานข้อมูล
 *    → ภ.พ.30 จะโผล่ย้อนหลังเป็นปี และรายได้ 40(8) เก่าจะถูกถอด VAT ออกทั้งที่ตอนนั้นไม่ได้เก็บ VAT
 *
 *    component นี้จึงเติม vatRegisteredFrom ให้อัตโนมัติเมื่อเปิดสวิตช์
 *    (ใช้เดือนที่ทะลุเกณฑ์ ถ้ามี ไม่งั้นใช้เดือนปัจจุบัน)
 */

import type { ThresholdBreach, TaxSettings, VatStatus } from '../../../types/tax';
import { RD_URL, VAT_THRESHOLD, num, thisMonthKey } from '../../../lib/tax';
import { baht, pct, thaiMonth } from '../../../lib/tax/format';
import { Alert, Badge, Card, CardBody, CardHeader, HelpNote } from './primitives';

export interface VatSettingsSectionProps {
  settings: TaxSettings;
  onChange: (patch: Partial<TaxSettings>) => void;
  status: VatStatus;
  breach?: ThresholdBreach | null;
  /** ล็อกไม่ให้แก้ระหว่างบันทึก */
  busy?: boolean;
}

export function VatSettingsSection({
  settings,
  onChange,
  status,
  breach = null,
  busy = false,
}: VatSettingsSectionProps) {
  const toggleRegistered = (next: boolean) => {
    if (next) {
      // เปิดสวิตช์ → ต้องมีเดือนที่มีผลด้วย ไม่งั้นคิด VAT ย้อนหลังทั้งฐานข้อมูล
      onChange({
        vatRegistered: true,
        vatRegisteredFrom: settings.vatRegisteredFrom || breach?.month || thisMonthKey(),
      });
    } else {
      // ปิดสวิตช์ → เก็บ vatRegisteredFrom ไว้ เผื่อเปิดกลับ (ไม่ทำลายข้อมูลเดิม)
      onChange({ vatRegistered: false });
    }
  };

  return (
    <Card>
      <CardHeader
        title="ภาษีมูลค่าเพิ่ม (VAT)"
        subtitle="มีผลกับใบแจ้งหนี้ ช่องภาษีซื้อ และแบบ ภ.พ.30"
        actions={
          <Badge tone={status.exceeded ? 'danger' : 'success'}>
            {status.exceeded ? 'รายได้ 40(8) เกินเกณฑ์แล้ว' : 'ยังไม่เกินเกณฑ์'}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        {status.mustRegisterWarning && (
          <Alert
            tone="danger"
            title="รายได้ 40(8) เกิน 1.8 ล้านบาทต่อปี จำเป็นต้องจด VAT"
            actions={
              <a
                href={RD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                🔗 เว็บไซต์กรมสรรพากร (rd.go.th)
              </a>
            }
          >
            ย้อนหลัง 12 เดือนล่าสุด = {baht(status.rolling12)} บาท
            {breach && (
              <div className="text-xs">เดือนแรกที่ทะลุเกณฑ์: {thaiMonth(breach.month)}</div>
            )}
          </Alert>
        )}

        {/* ---------- สวิตช์หลัก ---------- */}
        <div className="flex items-start gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              จดทะเบียน VAT แล้ว
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              เปิดเมื่อได้รับ ภ.พ.20 แล้ว — ระบบจะเริ่มคิด VAT {pct(settings.vatRate)}{' '}
              เฉพาะรายได้ตะกร้า B, แสดงช่องภาษีซื้อในฟอร์มค่าใช้จ่าย และสร้างแบบ ภ.พ.30 รายเดือน
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.vatRegistered}
            aria-label="จดทะเบียน VAT แล้ว"
            disabled={busy}
            onClick={() => toggleRegistered(!settings.vatRegistered)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              settings.vatRegistered ? 'bg-violet-600' : 'bg-neutral-300 dark:bg-neutral-700'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.vatRegistered ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* ---------- ฟิลด์ที่โผล่เมื่อจดแล้ว ---------- */}
        {settings.vatRegistered && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="vat-from">
                การจด VAT มีผลตั้งแต่เดือน <span className="text-red-500">*</span>
              </label>
              <input
                id="vat-from"
                type="month"
                className={inputCls}
                disabled={busy}
                value={settings.vatRegisteredFrom ?? ''}
                onChange={(e) => onChange({ vatRegisteredFrom: e.target.value || null })}
              />
              <span className="text-[11px] text-neutral-500">
                ใบแจ้งหนี้และรายรับก่อนเดือนนี้จะไม่ถูกคิด VAT
              </span>
              {!settings.vatRegisteredFrom && (
                <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                  ต้องระบุ ไม่งั้นระบบจะคิด VAT ย้อนหลังทั้งหมด
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="vat-rate">อัตรา VAT</label>
              <div className="flex items-center gap-1.5">
                <input
                  id="vat-rate"
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  className={`${inputCls} text-right tabular-nums`}
                  disabled={busy}
                  value={Number((settings.vatRate * 100).toFixed(2))}
                  onChange={(e) => onChange({ vatRate: num(e.target.value) / 100 })}
                />
                <span className="text-neutral-500">%</span>
              </div>
              <span className="text-[11px] text-neutral-500">ปกติ 7%</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="vat-opening-credit">
                เครดิตภาษีซื้อยกมาตั้งต้น
              </label>
              <input
                id="vat-opening-credit"
                inputMode="decimal"
                className={`${inputCls} text-right tabular-nums`}
                disabled={busy}
                value={settings.vatOpeningCredit}
                onChange={(e) => onChange({ vatOpeningCredit: num(e.target.value) })}
              />
              <span className="text-[11px] text-neutral-500">
                ถ้ามีเครดิตค้างจากก่อนเริ่มใช้ระบบนี้
              </span>
            </div>
          </div>
        )}

        {/* ---------- เกณฑ์ ---------- */}
        <div className="max-w-xs">
          <label className={labelCls} htmlFor="vat-threshold">
            เกณฑ์รายได้ที่ต้องจด VAT (บาท / 12 เดือนเคลื่อนที่)
          </label>
          <input
            id="vat-threshold"
            inputMode="decimal"
            className={`${inputCls} mt-1.5 text-right tabular-nums`}
            disabled={busy}
            value={settings.vatThreshold}
            onChange={(e) => onChange({ vatThreshold: num(e.target.value) || VAT_THRESHOLD })}
          />
          <HelpNote>
            ค่ามาตรฐาน 1,800,000 บาท — เก็บเป็นค่าตั้งได้เพราะกฎหมายเปลี่ยนได้
            นับเฉพาะรายได้ 40(8) เท่านั้น ค่าเช่าห้อง 40(5) ได้รับยกเว้น VAT จึงไม่ถูกนับ
          </HelpNote>
        </div>
      </CardBody>
    </Card>
  );
}

const labelCls = 'text-xs font-semibold text-neutral-600 dark:text-neutral-300';
const inputCls =
  'w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';
