'use client';

/**
 * ฟีเจอร์ 5 (ต่อ): ส่วนตั้งค่ากฎภาษี — เสียบเพิ่มในหน้าตั้งค่าที่มีอยู่
 *
 * 3 บล็อก:
 *   TaxpayerTypeSection      สถานะผู้เสียภาษี + ตารางพรีวิวค่าลดหย่อนส่วนตัว
 *   ExpenseModeSection       โหมดหักค่าใช้จ่ายรายตะกร้า (เหมา % / ตามจริง)
 *   MinTaxRuleSection        ภาษีขั้นต่ำ 0.5% (ม.48(2))
 *
 * ⚠️ ทั้งสามบล็อกนี้เปลี่ยนแล้ว "มีผลย้อนหลังกับทุกรายงานที่คำนวณสด" ของ engine ใหม่ (VAT/ภ.พ.30)
 *    — ไม่กระทบตัวเลข ภ.ง.ด.90/94 ที่ยื่นจริง เพราะ engine นั้นแยกต่างหาก (src/lib/thaiTax.ts)
 */

import type { MinTaxRule, TaxSettings, TaxpayerType } from '../../../types/tax';
import { PERSONAL_ALLOWANCE, TAXPAYER_LABEL, num } from '../../../lib/tax';
import { baht, pct } from '../../../lib/tax/format';
import { Alert, Card, CardBody, CardHeader, HelpNote, tableClasses as tc } from './primitives';

/* ================================================================== *
 * สถานะผู้เสียภาษี
 * ================================================================== */

export function TaxpayerTypeSection({
  settings,
  onChange,
  busy = false,
}: {
  settings: Pick<TaxSettings, 'taxpayerType' | 'partnerCount'>;
  onChange: (patch: Partial<TaxSettings>) => void;
  busy?: boolean;
}) {
  const invalidPartners =
    settings.taxpayerType === 'partnership' && (settings.partnerCount ?? 0) < 2;

  return (
    <Card>
      <CardHeader
        title="สถานะผู้เสียภาษี"
        subtitle="มีผลกับค่าลดหย่อนส่วนตัวของ ภ.ง.ด.94 และ ภ.ง.ด.90"
      />
      <CardBody className="space-y-4">
        <div className="inline-flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700">
          {(['individual', 'partnership'] as TaxpayerType[]).map((t) => (
            <button
              key={t}
              type="button"
              disabled={busy}
              onClick={() => onChange({ taxpayerType: t })}
              className={
                settings.taxpayerType === t
                  ? 'bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }
            >
              {TAXPAYER_LABEL[t]}
            </button>
          ))}
        </div>

        {settings.taxpayerType === 'partnership' && (
          <div className="max-w-[160px]">
            <label className={labelCls} htmlFor="partner-count">จำนวนหุ้นส่วน</label>
            <input
              id="partner-count"
              type="number"
              min={2}
              step={1}
              disabled={busy}
              className={`${inputCls} mt-1.5 text-right tabular-nums ${
                invalidPartners ? 'border-red-500' : ''
              }`}
              value={settings.partnerCount ?? 2}
              onChange={(e) =>
                onChange({ partnerCount: Math.max(2, Math.round(num(e.target.value) || 2)) })
              }
            />
            {invalidPartners && (
              <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                ต้องมีหุ้นส่วนตั้งแต่ 2 คนขึ้นไปจึงใช้ค่าลดหย่อนของห้างหุ้นส่วนสามัญได้
              </p>
            )}
          </div>
        )}

        {/* ตารางพรีวิว — ให้ผู้ใช้เห็นตัวเลขที่จะถูกใช้ก่อนกดบันทึก */}
        <div className={tc.wrap}>
          <table className={tc.table}>
            <thead>
              <tr>
                <th className={tc.th}>แบบแสดงรายการ</th>
                <th className={tc.th}>รอบภาษี</th>
                <th className={tc.thNum}>ค่าลดหย่อนส่วนตัวที่ใช้</th>
              </tr>
            </thead>
            <tbody>
              <tr className={tc.row}>
                <td className={tc.td}>ภ.ง.ด.94 (ครึ่งปี)</td>
                <td className={tc.td}>1 ม.ค. – 30 มิ.ย.</td>
                <td className={`${tc.tdNum} font-bold`}>
                  {baht(PERSONAL_ALLOWANCE.PND94[settings.taxpayerType], 0)} บาท
                </td>
              </tr>
              <tr className={tc.row}>
                <td className={tc.td}>ภ.ง.ด.90 (สิ้นปี)</td>
                <td className={tc.td}>1 ม.ค. – 31 ธ.ค.</td>
                <td className={`${tc.tdNum} font-bold`}>
                  {baht(PERSONAL_ALLOWANCE.PND90[settings.taxpayerType], 0)} บาท
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <HelpNote>
          ค่าลดหย่อนส่วนตัวถูกล็อกตามแบบและสถานะ — ระบบไม่มีทางนำตัวเลขของครึ่งปีไปใช้กับสิ้นปีสลับกันได้
        </HelpNote>
      </CardBody>
    </Card>
  );
}

/* ================================================================== *
 * โหมดหักค่าใช้จ่าย
 * ================================================================== */

export function ExpenseModeSection({
  settings,
  onChange,
  busy = false,
}: {
  settings: Pick<TaxSettings, 'expenseA' | 'expenseB' | 'capExpensePerBucket'>;
  onChange: (patch: Partial<TaxSettings>) => void;
  busy?: boolean;
}) {
  const blocks = [
    {
      bucket: 'A' as const,
      key: 'expenseA' as const,
      title: 'ค่าเช่าห้อง',
      badge: 'A · 40(5)',
      cfg: settings.expenseA,
      note: 'ค่าเช่าโรงเรือน/สิ่งปลูกสร้างตามมาตรา 40(5) โดยทั่วไปหักเหมาได้ 30%',
    },
    {
      bucket: 'B' as const,
      key: 'expenseB' as const,
      title: 'ค่าบริการ/อื่นๆ',
      badge: 'B · 40(8)',
      cfg: settings.expenseB,
      note:
        'อัตราหักเหมาของเงินได้ 40(8) ขึ้นกับประเภทกิจการตามพระราชกฤษฎีกา บางกรณีหักเหมาไม่ได้เลย ' +
        '(ต้องหักตามจริง) — โปรดตรวจสอบอัตราที่ใช้ได้กับกิจการของท่านกับกรมสรรพากร',
    },
  ];

  return (
    <Card>
      <CardHeader
        title="รูปแบบการหักค่าใช้จ่าย"
        subtitle="ใช้ทั้งใน ภ.ง.ด.94 และ ภ.ง.ด.90"
      />
      <CardBody className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {blocks.map((b) => (
          <div key={b.bucket} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[180px]">
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {b.badge}
                </span>
                <div className="mt-0.5 text-sm font-semibold">{b.title}</div>
              </div>

              <div className="inline-flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700">
                {(['lump', 'actual'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={busy}
                    onClick={() => onChange({ [b.key]: { ...b.cfg, mode: m } } as Partial<TaxSettings>)}
                    className={
                      b.cfg.mode === m
                        ? 'bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white'
                        : 'px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                    }
                  >
                    {m === 'lump' ? 'หักเหมา' : 'หักตามจริง'}
                  </button>
                ))}
              </div>

              {b.cfg.mode === 'lump' ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-500">อัตรา</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={busy}
                    className={`${inputCls} w-20 text-right tabular-nums`}
                    value={Math.round(b.cfg.lumpRate * 100)}
                    onChange={(e) =>
                      onChange({
                        [b.key]: {
                          ...b.cfg,
                          lumpRate: Math.min(100, Math.max(0, num(e.target.value))) / 100,
                        },
                      } as Partial<TaxSettings>)
                    }
                  />
                  <span className="text-xs text-neutral-500">%</span>
                </div>
              ) : (
                <span className="text-xs text-neutral-500">
                  ใช้ยอดจากหน้า &quot;ค่าใช้จ่าย / ภาษีซื้อ&quot;
                </span>
              )}
            </div>
            <HelpNote>{b.note}</HelpNote>
          </div>
        ))}
      </CardBody>
      <CardBody className="space-y-4 border-t border-neutral-200 dark:border-neutral-800">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              จำกัดค่าใช้จ่ายจริงไม่ให้เกินรายได้ต่อตะกร้า (โหมดระมัดระวัง)
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              ค่าเริ่มต้น (ปิด) — เมื่อหักตามจริงเกินรายได้ของตะกร้านั้น ระบบจะปล่อยให้ส่วนเกินไปหักลบกับเงินได้
              ของอีกตะกร้าได้ ตรงกับแนวทางยื่นจริง เปิดสวิตช์นี้ถ้าต้องการให้ระบบจำกัดยอดหักของแต่ละตะกร้าไว้
              ไม่ให้เกินรายได้ของตะกร้านั้นเอง (ระมัดระวังกว่า แต่ไม่ตรงกับแนวทางปฏิบัติทั่วไปที่ยื่นกันจริง)
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.capExpensePerBucket}
            aria-label="จำกัดค่าใช้จ่ายจริงไม่ให้เกินรายได้ต่อตะกร้า"
            disabled={busy}
            onClick={() => onChange({ capExpensePerBucket: !settings.capExpensePerBucket })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              settings.capExpensePerBucket ? 'bg-violet-600' : 'bg-neutral-300 dark:bg-neutral-700'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.capExpensePerBucket ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <Alert tone="info" title='ทำไมค่าเริ่มต้นถึงเป็น "ปล่อยให้หักข้ามตะกร้าได้"'>
          เพราะแกนคำนวณเดิมของระบบ (และแนวทางยื่น ภ.ง.ด.90/94 ทั่วไป) ไม่ได้จำกัดค่าใช้จ่ายจริงต่อตะกร้า —
          สิทธิ์หักค่าใช้จ่ายตามจริงที่มีเอกสารครบยังใช้ได้เต็มจำนวน ไม่เสียสิทธิ์แค่เพราะบันทึกไว้คนละหมวดรายได้
          <HelpNote>
            ไม่ว่าจะเปิดหรือปิดสวิตช์นี้ หากยอดหักตามจริงของตะกร้าใดสูงกว่ารายได้ของตะกร้านั้น ระบบจะแสดง
            คำเตือนเรื่องเอกสารเสมอ (ดูที่ตาราง &ldquo;ขั้นที่ 1 — หักค่าใช้จ่าย&rdquo;)
          </HelpNote>
        </Alert>
      </CardBody>
    </Card>
  );
}

/* ================================================================== *
 * ภาษีขั้นต่ำ 0.5%
 * ================================================================== */

export function MinTaxRuleSection({
  minTaxRule,
  onChange,
  busy = false,
}: {
  minTaxRule: MinTaxRule;
  onChange: (patch: Partial<TaxSettings>) => void;
  busy?: boolean;
}) {
  const set = (patch: Partial<MinTaxRule>) =>
    onChange({ minTaxRule: { ...minTaxRule, ...patch } });

  return (
    <Card>
      <CardHeader title="ภาษีขั้นต่ำ 0.5% (มาตรา 48(2))" />
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              ตรวจภาษีขั้นต่ำ {pct(minTaxRule.rate, 1)} ของเงินได้พึงประเมิน
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              เมื่อเปิด ระบบจะใช้ยอดที่สูงกว่าระหว่างภาษีขั้นบันไดกับ {pct(minTaxRule.rate, 1)}{' '}
              ของเงินได้พึงประเมิน และยกเว้นให้ถ้ายอดที่คำนวณได้ต่ำกว่า{' '}
              {baht(minTaxRule.exemptBelow, 0)} บาท
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={minTaxRule.enabled}
            aria-label="ตรวจภาษีขั้นต่ำ 0.5%"
            disabled={busy}
            onClick={() => set({ enabled: !minTaxRule.enabled })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              minTaxRule.enabled ? 'bg-violet-600' : 'bg-neutral-300 dark:bg-neutral-700'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                minTaxRule.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {minTaxRule.enabled && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="อัตรา (%)">
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                disabled={busy}
                className={`${inputCls} text-right tabular-nums`}
                value={Number((minTaxRule.rate * 100).toFixed(2))}
                onChange={(e) => set({ rate: num(e.target.value) / 100 })}
              />
            </Field>
            <Field label="เกณฑ์เงินได้ ภ.ง.ด.90">
              <input
                inputMode="decimal"
                disabled={busy}
                className={`${inputCls} text-right tabular-nums`}
                value={minTaxRule.incomeThresholdPND90}
                onChange={(e) => set({ incomeThresholdPND90: num(e.target.value) })}
              />
            </Field>
            <Field label="เกณฑ์เงินได้ ภ.ง.ด.94">
              <input
                inputMode="decimal"
                disabled={busy}
                className={`${inputCls} text-right tabular-nums`}
                value={minTaxRule.incomeThresholdPND94}
                onChange={(e) => set({ incomeThresholdPND94: num(e.target.value) })}
              />
            </Field>
            <Field label="ยกเว้นถ้าภาษีต่ำกว่า">
              <input
                inputMode="decimal"
                disabled={busy}
                className={`${inputCls} text-right tabular-nums`}
                value={minTaxRule.exemptBelow}
                onChange={(e) => set({ exemptBelow: num(e.target.value) })}
              />
            </Field>
          </div>
        )}

        <Alert tone="info" title="กฎนี้ไม่ได้อยู่ในข้อกำหนดตั้งต้น">
          ใส่ไว้เพราะมีผลกับยอดภาษีจริง — เคสที่เห็นชัดคือหักค่าใช้จ่ายตามจริงเยอะจนเงินได้สุทธิเหลือ 0
          แต่รายได้รวมสูง ถ้าไม่มีกฎนี้ระบบจะบอกว่าภาษี = 0 ซึ่งต่ำกว่าความจริง
          <HelpNote>
            ปิดได้ถ้าไม่ต้องการ และควรตรวจสอบเงื่อนไข/เกณฑ์ที่ใช้กับกรณีของท่านกับกรมสรรพากรก่อนยื่น
          </HelpNote>
        </Alert>
      </CardBody>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

const labelCls = 'text-xs font-semibold text-neutral-600 dark:text-neutral-300';
const inputCls =
  'w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';
