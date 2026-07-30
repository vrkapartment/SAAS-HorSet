'use client';

/**
 * ฟีเจอร์ 3: ภ.พ.30 — ตารางรายเดือน
 *
 * สูตร: ภาษีขาย − ภาษีซื้อ − เครดิตยกมา
 *   ผลบวก → ต้องโอนจ่ายสรรพากร
 *   ผลลบ  → ยกไปเครดิตเดือนถัดไป / ขอคืน
 *
 * ทั้งหน้านี้ต้องซ่อนเมื่อยังไม่จด VAT — ครอบด้วย <VatGate> ที่ระดับ page/route
 * ถ้า props.rows ว่างเพราะยังไม่จด ตัว component จะแสดง empty state ที่บอกวิธีเปิดใช้
 */

import type { Pp30Row, VatStatus } from '../../../types/tax';
import type { Pp30YearTotals } from '../../../lib/tax';
import { RD_EFILING_URL, pp30DueDate } from '../../../lib/tax';
import { baht, thaiDate, thaiMonth } from '../../../lib/tax/format';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  HelpNote,
  Money,
  StatTile,
  tableClasses as tc,
} from './primitives';

export interface Pp30ReportProps {
  year: number;
  rows: Pp30Row[];
  totals: Pp30YearTotals;
  /** false = ยังไม่จด VAT */
  enabled: boolean;
  vat?: VatStatus;
  /** เปิดฟอร์มกรอกภาษีซื้อ/ยื่นของเดือนนั้น */
  onOpenFiling?: (row: Pp30Row) => void;
  /** ส่งออก CSV — ใช้ downloadCsv() จาก lib/tax/format */
  onExportCsv?: () => void;
  /** ดาวน์โหลด PDF แบบ ภ.พ.30 ของเดือนนั้น (generatePp30Pdf() ใน pdfHelper.ts) */
  onExportPdf?: (row: Pp30Row) => void;
  onGoToSettings?: () => void;
}

export function Pp30Report({
  year,
  rows,
  totals,
  enabled,
  vat,
  onOpenFiling,
  onExportCsv,
  onExportPdf,
  onGoToSettings,
}: Pp30ReportProps) {
  if (!enabled) {
    return (
      <Card>
        <CardHeader title="ภ.พ.30" subtitle="ภาษีขาย − ภาษีซื้อ รายเดือน" />
        <CardBody>
          <Alert
            tone={vat?.exceeded ? 'danger' : 'info'}
            title={
              vat?.exceeded
                ? 'รายได้ 40(8) เกิน 1.8 ล้านบาทต่อปี จำเป็นต้องจด VAT'
                : 'ยังไม่ได้จดทะเบียน VAT'
            }
            actions={
              onGoToSettings && (
                <button type="button" onClick={onGoToSettings} className={btnCls}>
                  ไปหน้าตั้งค่า →
                </button>
              )
            }
          >
            {vat?.exceeded ? (
              <div>
                รายได้ 40(8) ย้อนหลัง 12 เดือน = {baht(vat.rolling12)} บาท เกินเกณฑ์{' '}
                {baht(vat.threshold, 0)} บาท — ต้องยื่นคำขอจดทะเบียนภายใน 30 วัน
              </div>
            ) : (
              <div>
                {vat
                  ? `รายได้ 40(8) ย้อนหลัง 12 เดือน = ${baht(vat.rolling12)} บาท (เกณฑ์ ${baht(vat.threshold, 0)} บาท) — `
                  : ''}
                ยังไม่ต้องคิด VAT และยังไม่ต้องยื่น ภ.พ.30
              </div>
            )}
            <HelpNote>
              เมื่อจดทะเบียนแล้ว ให้เปิดสถานะ &quot;จดทะเบียน VAT แล้ว&quot; ในหน้าตั้งค่า
              ระบบจะเริ่มสร้างแบบ ภ.พ.30 รายเดือนให้ทันทีตั้งแต่เดือนที่การจดมีผล
            </HelpNote>
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="ภาษีขายรวมทั้งปี"
          value={totals.outputVat}
          accent="bucketB"
          note="VAT 7% ที่เก็บจากผู้เช่า"
        />
        <StatTile
          label="ภาษีซื้อรวมทั้งปี"
          value={totals.inputVat}
          accent="info"
          note="VAT ที่จ่ายให้ซัพพลายเออร์"
        />
        <StatTile
          label="ยอดที่ต้องนำส่งรวม"
          value={totals.payable}
          accent="pay"
          valueTone="pay"
          note={`${totals.monthsToPay} เดือนที่ต้องจ่าย`}
        />
        <StatTile
          label="เครดิตภาษีซื้อยกไป"
          value={totals.closingCredit}
          accent="ok"
          valueTone="refund"
          note={totals.closingCredit > 0 ? 'ยกไปเดือนถัดไป / ขอคืนได้' : 'ไม่มีเครดิตคงเหลือ'}
        />
      </div>

      <Card>
        <CardHeader
          title={`แบบ ภ.พ.30 รายเดือน — ปี ${year + 543}`}
          subtitle="สูตร: ภาษีขาย − ภาษีซื้อ − เครดิตยกมา"
          actions={
            rows.length > 0 &&
            onExportCsv && (
              <button type="button" onClick={onExportCsv} className={btnCls}>
                ⤓ CSV
              </button>
            )
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            icon="📑"
            title="ยังไม่มีแบบ ภ.พ.30 ในปีนี้"
            description="ระบบจะสร้างแบบรายเดือนให้ตั้งแต่เดือนที่การจด VAT มีผล และมีรายรับ/ค่าใช้จ่ายบันทึกไว้"
          />
        ) : (
          <div className={tc.wrap}>
            <table className={tc.table}>
              <thead>
                <tr>
                  <th className={tc.th}>เดือนภาษี</th>
                  <th className={tc.thNum}>ฐานค่าบริการ 40(8)</th>
                  <th className={tc.thNum}>ภาษีขาย</th>
                  <th className={tc.thNum}>ภาษีซื้อ</th>
                  <th className={tc.thNum}>เครดิตยกมา</th>
                  <th className={tc.thNum}>ผลลัพธ์</th>
                  <th className={tc.th}>สถานะ</th>
                  <th className={tc.th}>กำหนดยื่น</th>
                  <th className={`${tc.th} text-right`}>การยื่น</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const due = pp30DueDate(r.period);
                  return (
                    <tr key={r.period} className={tc.row}>
                      <td className={tc.td}>{thaiMonth(r.period, true)}</td>
                      <td className={tc.tdNum}><Money value={r.serviceBase} /></td>
                      <td className={tc.tdNum}><Money value={r.outputVat} /></td>
                      <td className={tc.tdNum}>
                        <span
                          title={
                            r.inputVatManual != null
                              ? `กรอกเอง (จากสมุดค่าใช้จ่าย ${baht(r.inputVatFromLedger)})`
                              : 'จากสมุดค่าใช้จ่าย'
                          }
                        >
                          <Money value={r.inputVat} />
                          {r.inputVatManual != null && (
                            <span className="ml-1 text-[10px] text-neutral-400">✎</span>
                          )}
                        </span>
                      </td>
                      <td className={tc.tdNum}><Money value={r.creditBrought} dash /></td>
                      <td className={tc.tdNum}>
                        {r.payable > 0 ? (
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            <Money value={r.payable} />
                          </span>
                        ) : r.carryForward > 0 ? (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            (<Money value={r.carryForward} />)
                          </span>
                        ) : (
                          <span className="text-neutral-400">0.00</span>
                        )}
                      </td>
                      <td className={tc.td}>
                        {r.payable > 0 ? (
                          <Badge tone="danger">ต้องโอนจ่ายสรรพากร</Badge>
                        ) : r.carryForward > 0 ? (
                          <Badge tone="success">ยกไปเครดิต/ขอคืน</Badge>
                        ) : (
                          <Badge>ไม่มียอด</Badge>
                        )}
                      </td>
                      <td className={`${tc.td} whitespace-nowrap text-xs text-neutral-500`}>
                        {thaiDate(due.paper)}
                        <span className="block text-[10px]">ออนไลน์ {thaiDate(due.online)}</span>
                      </td>
                      <td className={`${tc.td} text-right`}>
                        {r.filed ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <Badge tone="info">ยื่นแล้ว</Badge>
                            <span className="text-[10px] text-neutral-500">
                              {thaiDate(r.filedAt)}
                            </span>
                            <div className="flex gap-1">
                              {onOpenFiling && (
                                <button
                                  type="button"
                                  onClick={() => onOpenFiling(r)}
                                  className="text-[11px] font-semibold text-violet-600 underline dark:text-violet-400"
                                >
                                  แก้ไข
                                </button>
                              )}
                              {onExportPdf && (
                                <button
                                  type="button"
                                  onClick={() => onExportPdf(r)}
                                  className="text-[11px] font-semibold text-violet-600 underline dark:text-violet-400"
                                >
                                  PDF
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          onOpenFiling && (
                            <button
                              type="button"
                              onClick={() => onOpenFiling(r)}
                              className={btnPrimaryCls}
                            >
                              กรอกภาษีซื้อ / ยื่น
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className={tc.tfootTd}>รวมทั้งปี</td>
                  <td className={`${tc.tfootTd} text-right`}>{baht(totals.serviceBase)}</td>
                  <td className={`${tc.tfootTd} text-right`}>{baht(totals.outputVat)}</td>
                  <td className={`${tc.tfootTd} text-right`}>{baht(totals.inputVat)}</td>
                  <td className={tc.tfootTd} />
                  <td className={`${tc.tfootTd} text-right`}>{baht(totals.payable)}</td>
                  <td className={tc.tfootTd} colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <CardFooter>
          <span className="text-neutral-500 dark:text-neutral-400">
            ยื่นแบบ ภ.พ.30 ภายในวันที่ 15 ของเดือนถัดไป (ยื่นออนไลน์ได้ถึงวันที่ 23)
          </span>
          <a
            href={RD_EFILING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-semibold text-violet-600 underline dark:text-violet-400"
          >
            ยื่นแบบออนไลน์ →
          </a>
        </CardFooter>
      </Card>

      <HelpNote>
        ข้อสำคัญทางบัญชี: VAT 7% ถูกแยกออกจากฐานรายได้ตั้งแต่ตอนบันทึก จึงไม่มี VAT ปนอยู่ในรายได้
        40(5) หรือ 40(8) ที่ใช้คำนวณ ภ.ง.ด.94/90
      </HelpNote>
    </div>
  );
}

const btnCls =
  'rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';
const btnPrimaryCls =
  'rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700';
