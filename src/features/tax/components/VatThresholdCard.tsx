'use client';

/**
 * การ์ดเกณฑ์ VAT 1.8 ล้านบาท + คำเตือนให้ไปจดทะเบียน
 *
 * เกณฑ์ที่ใช้เป็น "12 เดือนเคลื่อนที่" ไม่ใช่ปีปฏิทิน — นี่คือจุดที่ระบบเดิม
 * ของหลายเจ้าคำนวณผิด เพราะไปรีเซ็ตยอดทุกวันที่ 1 ม.ค.
 *
 * การ์ดนี้ต่างจาก component อื่น: มันต้องแสดง "ทั้งตอนจดแล้วและยังไม่จด"
 *  - ยังไม่จด + เกินเกณฑ์ → คำเตือนสีแดง + ลิงก์กรมสรรพากร (เรื่องนี้สำคัญกว่าการซ่อน UI ของ VAT)
 *  - ยังไม่จด + ใกล้เกณฑ์ (>= 80%) → เตือนล่วงหน้าสีเหลือง
 *  - ยังไม่จด + ยังห่าง → ซ่อนทั้งการ์ด (ยังไม่ต้องกวนใจเจ้าของหอ)
 *  - จดแล้ว → แสดงมาตรวัดปกติ
 *
 * ⚠️ i18n: รับ prop `t` (จาก useLanguage() ของหน้าที่เรียก) แทนการ hardcode ข้อความภาษาไทยไว้ตรงๆ
 *    คีย์ทั้งหมดอยู่ใต้ namespace "tax_page" ร่วมกับข้อความอื่นของหน้า /tax
 */

import { ExternalLink } from 'lucide-react';
import type { ThresholdBreach, VatStatus } from '../../../types/tax';
import { RD_URL } from '../../../lib/tax';
import { baht, thaiMonth } from '../../../lib/tax/format';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  HelpNote,
  ProgressBar,
} from './primitives';

export interface VatThresholdCardProps {
  status: VatStatus;
  /** เดือนแรกที่ทะลุเกณฑ์ จาก firstThresholdBreach() */
  breach?: ThresholdBreach | null;
  /** ปุ่ม "ไปหน้าตั้งค่า" — ส่ง handler มาเพื่อ route ตามแอปคุณ */
  onGoToSettings?: () => void;
  /** เกณฑ์ % ที่จะเริ่มเตือนล่วงหน้า (ค่าเริ่มต้น 80) */
  warnAtPct?: number;
  /** true = แสดงการ์ดตลอด แม้ยังห่างเกณฑ์มาก */
  alwaysShow?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** ใช้ format เดือน/ปีของ thaiMonth() ให้ตรงภาษา — ไม่ระบุ = ไทย (พ.ศ.) เหมือนเดิม */
  locale?: 'th' | 'en';
}

export function VatThresholdCard({
  status,
  breach = null,
  onGoToSettings,
  warnAtPct = 80,
  alwaysShow = false,
  t,
  locale = 'th',
}: VatThresholdCardProps) {
  const nearThreshold = status.usedPct >= warnAtPct;

  // ยังไม่จด และยังห่างเกณฑ์ → ไม่ต้องแสดงอะไรเลย
  if (!status.registered && !nearThreshold && !status.exceeded && !alwaysShow) {
    return null;
  }

  const tone = status.exceeded ? 'over' : nearThreshold ? 'warn' : 'ok';

  return (
    <div>
      {status.mustRegisterWarning && (
        <Alert
          tone="danger"
          title={t('tax_page.vat_must_register_title')}
          actions={
            <>
              <a
                href={RD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {t('tax_page.vat_threshold_open_rd_link')}
              </a>
              {onGoToSettings && (
                <button
                  type="button"
                  onClick={onGoToSettings}
                  className="cursor-pointer rounded-lg border border-current px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-current/10"
                >
                  {t('tax_page.vat_threshold_mark_registered_btn')}
                </button>
              )}
            </>
          }
        >
          <div>
            {t('tax_page.vat_threshold_rolling12_prefix', {
              start: thaiMonth(status.windowStart, true, locale),
              end: thaiMonth(status.windowEnd, true, locale),
            })}{' '}
            <b>{baht(status.rolling12)} {t('tax_page.baht')}</b>{' '}
            {t('tax_page.vat_threshold_rolling12_suffix', { threshold: baht(status.threshold, 0) })}
          </div>
          {breach && (
            <div className="mt-1 text-xs">
              {t('tax_page.vat_threshold_breach_detail', { month: thaiMonth(breach.month, false, locale) })}
            </div>
          )}
        </Alert>
      )}

      {!status.registered && !status.exceeded && nearThreshold && (
        <Alert tone="warning" title={t('tax_page.vat_threshold_near_title', { pct: status.usedPct.toFixed(1) })}>
          {t('tax_page.vat_threshold_near_body', { amount: baht(status.remaining) })}
        </Alert>
      )}

      <Card>
        <CardHeader
          title={t('tax_page.vat_threshold_card_title')}
          subtitle={t('tax_page.vat_threshold_card_subtitle', {
            start: thaiMonth(status.windowStart, true, locale),
            end: thaiMonth(status.windowEnd, true, locale),
          })}
          actions={
            <>
              <Badge tone={status.exceeded ? 'danger' : 'success'}>
                {status.exceeded ? t('tax_page.vat_threshold_exceeded_badge') : t('tax_page.vat_not_exceeded_badge')}
              </Badge>
              <Badge tone={status.registered ? 'info' : 'warning'}>
                {status.registered ? t('tax_page.vat_threshold_registered_badge') : t('tax_page.vat_threshold_not_registered_badge')}
              </Badge>
            </>
          }
        />
        <CardBody>
          <div className="mb-0.5 flex items-baseline justify-between">
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {baht(status.rolling12)} {t('tax_page.baht')}
            </span>
            <span className="text-xs tabular-nums text-slate-500">
              {t('tax_page.vat_threshold_threshold_label', { amount: baht(status.threshold, 0) })}
            </span>
          </div>

          <ProgressBar pct={status.usedPct} tone={tone} />

          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('tax_page.vat_threshold_used_pct', { pct: status.usedPct.toFixed(1) })}</span>
            <span>
              {status.exceeded
                ? t('tax_page.vat_exceeded_by', { amount: baht(status.rolling12 - status.threshold) })
                : t('tax_page.vat_threshold_remaining', { amount: baht(status.remaining) })}
            </span>
          </div>

          <HelpNote>{t('tax_page.vat_threshold_help')}</HelpNote>
        </CardBody>
      </Card>
    </div>
  );
}
