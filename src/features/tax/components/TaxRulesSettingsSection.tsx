'use client';

/**
 * ฟีเจอร์ 5 (ต่อ): ส่วนตั้งค่ากฎภาษี — เสียบเพิ่มในหน้าตั้งค่าที่มีอยู่
 *
 * 3 บล็อก:
 *   TaxpayerTypeSection      สถานะผู้เสียภาษี + ตารางพรีวิวค่าลดหย่อนส่วนตัว — แสดงผลอย่างเดียว
 *                            (แก้ไขได้ที่หน้าตั้งค่าการเงินเท่านั้น ดู FinanceSettingsTab.tsx — กันไม่ให้มี
 *                            2 จุดแก้ค่าเดียวกันจนไม่ sync กัน)
 *   ExpenseModeSection       โหมดหักค่าใช้จ่ายรายตะกร้า (เหมา % / ตามจริง) + จำกัดยอดหักไม่ให้เกินรายได้ต่อตะกร้า
 *                            ⚠️ ค่านี้มีผลจริงกับตัวเลข ภ.ง.ด.90/94 ที่ยื่นจริง (บนจอ + PDF) ผ่าน
 *                            computePitBreakdownFromThaiTax()/capActualExpenseDeduction() ใน src/lib/thaiTax.ts
 *                            เป็นการ์ดเดียวที่ควบคุมเรื่องนี้ในทั้งระบบ — เดิมมีการ์ดซ้ำอีกจุดในหน้า /tax
 *                            ที่ไม่เคยบันทึกลง DB เลย ถูกลบทิ้งแล้วเพื่อไม่ให้ตั้งค่าคนละที่แล้วขัดกัน
 *   MinTaxRuleSection        ภาษีขั้นต่ำ 0.5% (ม.48(2)) — แสดงผลอย่างเดียว ค่าคงที่ตามกฎหมาย ไม่ให้ผู้ใช้
 *                            ปิด/ปรับได้ เพราะเป็นข้อกำหนดตามกฎหมาย ไม่ใช่ทางเลือกทางธุรกิจ
 */

import { Percent, RefreshCw } from 'lucide-react';
import type { TaxSettings } from '../../../types/tax';
import { PERSONAL_ALLOWANCE, TAXPAYER_LABEL, num } from '../../../lib/tax';
import { baht, pct } from '../../../lib/tax/format';
import { Alert, Card, CardBody, CardHeader, HelpNote, Switch, tableClasses as tc } from './primitives';

/* ================================================================== *
 * สถานะผู้เสียภาษี
 * ================================================================== */

export function TaxpayerTypeSection({
  settings,
  loading = false,
}: {
  settings: Pick<TaxSettings, 'taxpayerType' | 'partnerCount'>;
  /** ยังโหลด settings จริงไม่เสร็จ — โชว์หัวข้อการ์ดตามปกติ แต่สลับตารางเป็น skeleton ไปก่อน */
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader title="สถานะผู้เสียภาษี" subtitle="มีผลกับค่าลดหย่อนส่วนตัวของ ภ.ง.ด.94 และ ภ.ง.ด.90" />
        <CardBody className="space-y-4">
          <div className="h-4 w-40 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
          <div className="h-24 w-full rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="สถานะผู้เสียภาษี"
        subtitle="มีผลกับค่าลดหย่อนส่วนตัวของ ภ.ง.ด.94 และ ภ.ง.ด.90"
        actions={
          <a
            href="/settings?tab=finance"
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition-all hover:shadow-md"
          >
            แก้ไขที่หน้าตั้งค่าการเงิน →
          </a>
        }
      />
      <CardBody className="space-y-4">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {TAXPAYER_LABEL[settings.taxpayerType]}
          {settings.taxpayerType === 'partnership' && ` (${settings.partnerCount ?? 1} หุ้นส่วน)`}
        </div>

        {/* ตารางพรีวิว — ให้ผู้ใช้เห็นตัวเลขที่ระบบใช้อยู่จริง */}
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
  actualAmountA = 0,
  actualAmountB = 0,
  onRefreshActual,
  refreshingActual = false,
  loading = false,
}: {
  settings: Pick<TaxSettings, 'expenseA' | 'expenseB' | 'capExpensePerBucket'>;
  onChange: (patch: Partial<TaxSettings>) => void;
  busy?: boolean;
  /** ยอดค่าใช้จ่ายตามจริงสะสม (จากรายการค่าใช้จ่ายจริงในระบบ) ต่อตะกร้า — แสดงเมื่อ mode = 'actual' */
  actualAmountA?: number;
  actualAmountB?: number;
  /** ดึงยอดตามจริงล่าสุดจากหน้าค่าใช้จ่ายมาแสดง (ไม่ใช่การบันทึกอะไร) */
  onRefreshActual?: () => void;
  refreshingActual?: boolean;
  /** ยังโหลด settings จริงไม่เสร็จ — โชว์หัวข้อการ์ดตามปกติ แต่สลับแถวควบคุมเป็น skeleton ไปก่อน
   *  (กันไม่ให้โชว์ค่า default ชั่วคราวก่อนสลับเป็นค่าจริงตอนโหลดเสร็จ) */
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card glow="bucketA" className="rounded-3xl">
        <CardHeader icon={<Percent className="h-4 w-4" />} title="รูปแบบการหักค่าใช้จ่าย" subtitle="ใช้ทั้งใน ภ.ง.ด.94 และ ภ.ง.ด.90" />
        <CardBody className="divide-y divide-slate-200 dark:divide-slate-800">
          {(['A', 'B'] as const).map((bucket) => (
            <div key={bucket} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="h-9 w-28 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-11 w-40 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-6 w-24 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            </div>
          ))}
        </CardBody>
        <CardBody className="space-y-3 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            </div>
            <div className="h-6 w-11 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
          </div>
        </CardBody>
      </Card>
    );
  }

  const blocks = [
    {
      bucket: 'A' as const,
      key: 'expenseA' as const,
      title: 'ค่าเช่าห้อง',
      badge: 'A · 40(5)',
      cfg: settings.expenseA,
      actualAmount: actualAmountA,
      note: 'ค่าเช่าโรงเรือน/สิ่งปลูกสร้างตามมาตรา 40(5) โดยทั่วไปหักเหมาได้ 30%',
    },
    {
      bucket: 'B' as const,
      key: 'expenseB' as const,
      title: 'ค่าบริการ/อื่นๆ',
      badge: 'B · 40(8)',
      cfg: settings.expenseB,
      actualAmount: actualAmountB,
      note:
        'อัตราหักเหมาของเงินได้ 40(8) ขึ้นกับประเภทกิจการตามพระราชกฤษฎีกา บางกรณีหักเหมาไม่ได้เลย ' +
        '(ต้องหักตามจริง) — โปรดตรวจสอบอัตราที่ใช้ได้กับกิจการของท่านกับกรมสรรพากร',
    },
  ];

  return (
    <Card glow="bucketA" className="rounded-3xl">
      <CardHeader
        icon={<Percent className="h-4 w-4" />}
        title="รูปแบบการหักค่าใช้จ่าย"
        subtitle="ใช้ทั้งใน ภ.ง.ด.94 และ ภ.ง.ด.90"
      />
      <CardBody className="divide-y divide-slate-200 dark:divide-slate-800">
        {blocks.map((b) => (
          <div key={b.bucket} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[180px]">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {b.badge}
                </span>
                <div className="mt-0.5 text-sm font-semibold">{b.title}</div>
              </div>

              <div className="inline-flex gap-2 rounded-2xl border border-slate-200/50 bg-slate-100/50 p-1.5 dark:border-slate-900/80 dark:bg-slate-950/40">
                {(['lump', 'actual'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={busy}
                    onClick={() => onChange({ [b.key]: { ...b.cfg, mode: m } } as Partial<TaxSettings>)}
                    className={
                      b.cfg.mode === m
                        ? 'rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/20 dark:shadow-blue-500/10'
                        : 'rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }
                  >
                    {m === 'lump' ? 'หักเหมา' : 'หักตามจริง'}
                  </button>
                ))}
              </div>

              {b.cfg.mode === 'lump' ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">อัตรา</span>
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
                  <span className="text-xs text-slate-500">%</span>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="text-xs text-slate-500 shrink-0">ยอดตามจริงสะสม</span>
                  <div className="relative min-w-[140px] flex-1">
                    <input
                      type="text"
                      readOnly
                      className={`${inputCls} w-full cursor-not-allowed pr-9 text-right tabular-nums`}
                      value={baht(b.actualAmount, 0)}
                    />
                    {onRefreshActual && (
                      <button
                        type="button"
                        onClick={onRefreshActual}
                        disabled={refreshingActual}
                        title="ดึงยอดล่าสุดจากรายการค่าใช้จ่าย"
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-blue-600 hover:bg-blue-500/10 disabled:opacity-50 dark:text-blue-400"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshingActual ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <HelpNote>{b.note}</HelpNote>
          </div>
        ))}
      </CardBody>
      <CardBody className="space-y-4 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              จำกัดค่าใช้จ่ายจริงไม่ให้เกินรายได้ต่อตะกร้า (โหมดระมัดระวัง)
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              ค่าเริ่มต้น (ปิด) — เมื่อหักตามจริงเกินรายได้ของตะกร้านั้น ระบบจะปล่อยให้ส่วนเกินไปหักลบกับเงินได้
              ของอีกตะกร้าได้ ตรงกับแนวทางยื่นจริง เปิดสวิตช์นี้ถ้าต้องการให้ระบบจำกัดยอดหักของแต่ละตะกร้าไว้
              ไม่ให้เกินรายได้ของตะกร้านั้นเอง (ระมัดระวังกว่า แต่ไม่ตรงกับแนวทางปฏิบัติทั่วไปที่ยื่นกันจริง)
            </div>
          </div>
          <Switch
            checked={settings.capExpensePerBucket}
            onChange={(next) => onChange({ capExpensePerBucket: next })}
            disabled={busy}
            label="จำกัดค่าใช้จ่ายจริงไม่ให้เกินรายได้ต่อตะกร้า"
          />
        </div>
      </CardBody>
    </Card>
  );
}

/* ================================================================== *
 * ภาษีขั้นต่ำ 0.5%
 * ================================================================== */

/** ค่าคงที่ตามกฎหมาย (มาตรา 48(2)) — แสดงผลอย่างเดียว ไม่ให้ผู้ใช้ปิด/ปรับ เพราะเป็นข้อกำหนดตามกฎหมาย
 *  ไม่ใช่ทางเลือกทางธุรกิจแบบการหักค่าใช้จ่าย (ต่างจาก ExpenseModeSection) */
const STATUTORY_MIN_TAX_RATE = 0.005;
const STATUTORY_MIN_TAX_THRESHOLD = 120_000;
const STATUTORY_MIN_TAX_EXEMPT_BELOW = 5_000;

export function MinTaxRuleSection() {
  return (
    <Card>
      <CardHeader title="ภาษีขั้นต่ำ 0.5% (มาตรา 48(2))" />
      <CardBody className="space-y-4">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          ตรวจภาษีขั้นต่ำ {pct(STATUTORY_MIN_TAX_RATE, 1)} ของเงินได้พึงประเมิน (ตั้งแต่ {baht(STATUTORY_MIN_TAX_THRESHOLD, 0)} บาทขึ้นไป)
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          ระบบใช้ยอดที่สูงกว่าระหว่างภาษีขั้นบันไดกับ {pct(STATUTORY_MIN_TAX_RATE, 1)} ของเงินได้พึงประเมินเสมอ
          และยกเว้นให้ถ้ายอดที่คำนวณได้ต่ำกว่า {baht(STATUTORY_MIN_TAX_EXEMPT_BELOW, 0)} บาท — ค่าคงที่ตามกฎหมาย ปรับไม่ได้
        </div>

        <Alert tone="info" title="กฎนี้ไม่ได้อยู่ในข้อกำหนดตั้งต้น">
          ใส่ไว้เพราะมีผลกับยอดภาษีจริง — เคสที่เห็นชัดคือหักค่าใช้จ่ายตามจริงเยอะจนเงินได้สุทธิเหลือ 0
          แต่รายได้รวมสูง ถ้าไม่มีกฎนี้ระบบจะบอกว่าภาษี = 0 ซึ่งต่ำกว่าความจริง
          <HelpNote>
            เป็นข้อกำหนดตามกฎหมาย ไม่เปิดให้ปิด/ปรับอัตราเอง — ควรตรวจสอบเงื่อนไขที่ใช้กับกรณีของท่านกับกรมสรรพากรก่อนยื่น
          </HelpNote>
        </Alert>
      </CardBody>
    </Card>
  );
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-sm text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-800/80 dark:bg-slate-950/40 dark:text-slate-200 dark:focus:bg-slate-900';
