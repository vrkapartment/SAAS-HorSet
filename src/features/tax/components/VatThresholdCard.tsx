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
}

export function VatThresholdCard({
  status,
  breach = null,
  onGoToSettings,
  warnAtPct = 80,
  alwaysShow = false,
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
          title="รายได้ 40(8) เกิน 1.8 ล้านบาทต่อปี จำเป็นต้องจด VAT"
          actions={
            <>
              <a
                href={RD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> เปิดเว็บไซต์กรมสรรพากร (rd.go.th)
              </a>
              {onGoToSettings && (
                <button
                  type="button"
                  onClick={onGoToSettings}
                  className="cursor-pointer rounded-lg border border-current px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-current/10"
                >
                  บันทึกว่าจด VAT แล้ว →
                </button>
              )}
            </>
          }
        >
          <div>
            รายได้ค่าบริการ 40(8) ย้อนหลัง 12 เดือน (
            {thaiMonth(status.windowStart, true)} – {thaiMonth(status.windowEnd, true)}){' '}
            <b>{baht(status.rolling12)} บาท</b> เกินเกณฑ์ {baht(status.threshold, 0)} บาท
          </div>
          {breach && (
            <div className="mt-1 text-xs">
              เดือนแรกที่ทะลุเกณฑ์: {thaiMonth(breach.month)} — ตามกฎหมายต้องยื่นคำขอจดทะเบียน VAT
              ภายใน 30 วันนับแต่วันที่รายได้เกินเกณฑ์
            </div>
          )}
        </Alert>
      )}

      {!status.registered && !status.exceeded && nearThreshold && (
        <Alert tone="warning" title={`ใกล้ถึงเกณฑ์ VAT แล้ว (${status.usedPct.toFixed(1)}% ของ 1.8 ล้านบาท)`}>
          เหลืออีก {baht(status.remaining)} บาท ก่อนถึงเกณฑ์จดทะเบียน VAT — วางแผนล่วงหน้าได้เลย
        </Alert>
      )}

      <Card>
        <CardHeader
          title="เกณฑ์ VAT — รายได้ 40(8) ย้อนหลัง 12 เดือนเคลื่อนที่"
          subtitle={`หน้าต่างล่าสุด ${thaiMonth(status.windowStart, true)} – ${thaiMonth(status.windowEnd, true)}`}
          actions={
            <>
              <Badge tone={status.exceeded ? 'danger' : 'success'}>
                {status.exceeded ? 'เกินเกณฑ์' : 'ยังไม่เกินเกณฑ์'}
              </Badge>
              <Badge tone={status.registered ? 'info' : 'warning'}>
                {status.registered ? 'จด VAT แล้ว' : 'ยังไม่จด VAT'}
              </Badge>
            </>
          }
        />
        <CardBody>
          <div className="mb-0.5 flex items-baseline justify-between">
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {baht(status.rolling12)} บาท
            </span>
            <span className="text-xs tabular-nums text-slate-500">
              เกณฑ์ {baht(status.threshold, 0)} บาท
            </span>
          </div>

          <ProgressBar pct={status.usedPct} tone={tone} />

          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>ใช้ไป {status.usedPct.toFixed(1)}%</span>
            <span>
              {status.exceeded
                ? `เกินเกณฑ์ ${baht(status.rolling12 - status.threshold)} บาท`
                : `เหลือ ${baht(status.remaining)} บาท`}
            </span>
          </div>

          <HelpNote>
            นับเฉพาะรายได้ตะกร้า B (40(8)) ที่ถอด VAT ออกแล้ว — ค่าเช่าห้อง 40(5) ได้รับยกเว้น VAT
            จึงไม่ถูกนับรวมในเกณฑ์นี้ ไม่ว่าจะมีรายได้ค่าเช่าสูงเท่าไร
          </HelpNote>
        </CardBody>
      </Card>
    </div>
  );
}
