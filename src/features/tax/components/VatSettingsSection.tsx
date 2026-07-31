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
 *
 * ⚠️ i18n: รับ prop `t` (จาก useLanguage() ของหน้าที่เรียก) แทนการ hardcode ข้อความภาษาไทยไว้ตรงๆ
 *    คีย์ทั้งหมดอยู่ใต้ namespace "tax_page" ร่วมกับข้อความอื่นของหน้า /tax
 */

import { AlertTriangle, CheckCircle2, ExternalLink, Receipt } from 'lucide-react';
import type { ThresholdBreach, TaxSettings, VatStatus } from '../../../types/tax';
import { RD_URL, VAT_THRESHOLD, num, thisMonthKey } from '../../../lib/tax';
import { baht, pct, thaiMonth } from '../../../lib/tax/format';
import { Alert, Card, CardBody, CardHeader, HelpNote, ProgressBar, Switch } from './primitives';

export interface VatSettingsSectionProps {
  settings: TaxSettings;
  onChange: (patch: Partial<TaxSettings>) => void;
  status: VatStatus;
  breach?: ThresholdBreach | null;
  /** ล็อกไม่ให้แก้ระหว่างบันทึก */
  busy?: boolean;
  /** ยังโหลด settings/status จริงไม่เสร็จ — โชว์หัวข้อการ์ดตามปกติ แต่สลับตัวควบคุมเป็น skeleton ไปก่อน */
  loading?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** ใช้ format เดือน/ปีของ thaiMonth() ให้ตรงภาษา — ไม่ระบุ = ไทย (พ.ศ.) เหมือนเดิม */
  locale?: 'th' | 'en';
}

export function VatSettingsSection({
  settings,
  onChange,
  status,
  breach = null,
  busy = false,
  loading = false,
  t,
  locale = 'th',
}: VatSettingsSectionProps) {
  if (loading) {
    return (
      <Card glow="success" className="rounded-3xl">
        <CardHeader
          icon={<Receipt className="h-4 w-4" />}
          title={t('tax_page.vat_settings_title')}
          subtitle={t('tax_page.vat_settings_subtitle')}
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-6 border-b border-slate-200 pb-4 sm:grid-cols-2 dark:border-slate-800">
            <div className="space-y-1.5">
              <div className="h-4 w-56 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-9 w-full rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            </div>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-4 w-40 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              </div>
              <div className="h-6 w-11 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

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
    <Card glow={status.exceeded ? 'danger' : 'success'} className="rounded-3xl">
      <CardHeader
        icon={<Receipt className="h-4 w-4" />}
        iconTone={status.exceeded ? 'danger' : 'success'}
        title={t('tax_page.vat_settings_title')}
        subtitle={t('tax_page.vat_settings_subtitle')}
        actions={
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
              status.exceeded
                ? 'border-red-500/20 bg-red-500/[0.08] text-red-700 dark:bg-red-500/[0.12] dark:text-red-400'
                : 'border-emerald-500/20 bg-emerald-500/[0.08] text-teal-700 dark:bg-emerald-500/[0.12] dark:text-emerald-400'
            }`}
          >
            {status.exceeded ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            {status.exceeded ? t('tax_page.vat_exceeded_badge') : t('tax_page.vat_not_exceeded_badge')}
          </span>
        }
      />
      <CardBody className="space-y-4">
        {status.mustRegisterWarning && (
          <Alert
            tone="danger"
            title={t('tax_page.vat_must_register_title')}
            actions={
              <a
                href={RD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {t('tax_page.vat_rd_website_link')}
              </a>
            }
          >
            {t('tax_page.vat_rolling12_summary', { amount: baht(status.rolling12) })}
            {breach && (
              <div className="text-xs">{t('tax_page.vat_first_breach_month', { month: thaiMonth(breach.month, false, locale) })}</div>
            )}
          </Alert>
        )}

        {/* ---------- ซ้าย: เกณฑ์ + progress bar / ขวา: สวิตช์จดทะเบียน ---------- */}
        <div className="grid grid-cols-1 gap-6 border-b border-slate-200 pb-4 sm:grid-cols-2 dark:border-slate-800">
          {/* ซ้าย — เกณฑ์รายได้ที่ต้องจด VAT + progress bar */}
          <div>
            <label className="text-sm font-semibold text-slate-900 dark:text-slate-100" htmlFor="vat-threshold">
              {t('tax_page.vat_threshold_label')}
            </label>
            <input
              id="vat-threshold"
              inputMode="decimal"
              className={`${inputCls} mt-1.5 text-right tabular-nums`}
              disabled={busy}
              value={settings.vatThreshold}
              onChange={(e) => onChange({ vatThreshold: num(e.target.value) || VAT_THRESHOLD })}
            />

            <div className="mt-3">
              <div className="mb-0.5 flex items-baseline justify-between text-xs">
                <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                  {baht(status.rolling12)} {t('tax_page.baht')}
                </span>
                <span className="tabular-nums text-slate-500">{status.usedPct.toFixed(1)}%</span>
              </div>
              <ProgressBar pct={status.usedPct} tone={status.exceeded ? 'over' : status.usedPct >= 80 ? 'warn' : 'ok'} />
              <div className="mt-0.5 text-[11px] text-slate-500">
                {t('tax_page.vat_rolling12_window', {
                  start: thaiMonth(status.windowStart, true, locale),
                  end: thaiMonth(status.windowEnd, true, locale),
                  status: status.exceeded
                    ? t('tax_page.vat_exceeded_by', { amount: baht(status.rolling12 - status.threshold) })
                    : t('tax_page.vat_remaining_to_threshold', { amount: baht(status.remaining) }),
                })}
              </div>
            </div>

            <HelpNote>{t('tax_page.vat_threshold_help')}</HelpNote>
          </div>

          {/* ขวา — สวิตช์จดทะเบียน VAT แล้ว */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('tax_page.vat_registered_label')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('tax_page.vat_registered_desc', { rate: pct(settings.vatRate) })}
              </div>
            </div>
            <Switch
              checked={settings.vatRegistered}
              onChange={toggleRegistered}
              disabled={busy}
              label={t('tax_page.vat_registered_label')}
            />
          </div>
        </div>

        {/* ---------- ฟิลด์ที่โผล่เมื่อจดแล้ว ---------- */}
        {settings.vatRegistered && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="vat-from">
                {t('tax_page.vat_from_label')} <span className="text-red-500">*</span>
              </label>
              <input
                id="vat-from"
                type="month"
                className={inputCls}
                disabled={busy}
                value={settings.vatRegisteredFrom ?? ''}
                onChange={(e) => onChange({ vatRegisteredFrom: e.target.value || null })}
              />
              <span className="text-[11px] text-slate-500">
                {t('tax_page.vat_from_help')}
              </span>
              {!settings.vatRegisteredFrom && (
                <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                  {t('tax_page.vat_from_required')}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="vat-rate">{t('tax_page.vat_rate_label')}</label>
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
                <span className="text-slate-500">%</span>
              </div>
              <span className="text-[11px] text-slate-500">{t('tax_page.vat_rate_default')}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="vat-opening-credit">
                {t('tax_page.vat_opening_credit_label')}
              </label>
              <input
                id="vat-opening-credit"
                inputMode="decimal"
                className={`${inputCls} text-right tabular-nums`}
                disabled={busy}
                value={settings.vatOpeningCredit}
                onChange={(e) => onChange({ vatOpeningCredit: num(e.target.value) })}
              />
              <span className="text-[11px] text-slate-500">
                {t('tax_page.vat_opening_credit_help')}
              </span>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const labelCls = 'text-xs font-semibold text-slate-600 dark:text-slate-300';
const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-sm text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-800/80 dark:bg-slate-950/40 dark:text-slate-200 dark:focus:bg-slate-900';
