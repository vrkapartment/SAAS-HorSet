'use client';

/**
 * ฟีเจอร์ 1: ภาพรวม VAT
 *
 * ประกอบด้วย
 *   - การ์ดสรุป (แยกตะกร้า A/B ชัดเจน + VAT ที่เก็บ + เงินรับจริง)
 *   - การ์ดเกณฑ์ VAT (VatThresholdCard)
 *   - ตารางรายเดือน 12 แถว
 *
 * ⚠️ ตัดการ์ด preview ภ.ง.ด.94/90 ออกจากเวอร์ชันต้นฉบับที่ export มาโดยตั้งใจ — การ์ดนั้นคำนวณด้วย
 *    lib/tax/pit.ts (engine ใหม่) ซึ่งเป็นคนละตัวกับ src/lib/thaiTax.ts ที่ใช้คำนวณตัวเลข ภ.ง.ด.90/94
 *    ที่ยื่นจริง (ดู PitBreakdown.tsx) — ถ้าโชว์คู่กันในแอปเดียวกันอาจเห็นตัวเลขคนละค่าใน 2 จุด
 *    หน้านี้จึงเหลือแค่เนื้อหา VAT ล้วน ไม่แตะการคำนวณภาษีเงินได้เลย
 *
 * คอลัมน์/การ์ดที่เกี่ยวกับ VAT จะหายไปเองเมื่อยังไม่จด VAT
 * (ยกเว้นคำเตือนว่าเกินเกณฑ์ ซึ่งต้องเห็นตอนยังไม่จด)
 */

import type { ExpenseSummary, IncomeSummary, ThresholdBreach, VatStatus } from '../../../types/tax';
import type { MonthlyRow } from '../../../lib/tax';
import { baht, thaiMonth } from '../../../lib/tax/format';
import {
  Badge,
  Card,
  CardFooter,
  CardHeader,
  EmptyState,
  Money,
  StatTile,
  tableClasses as tc,
} from './primitives';
import { VatThresholdCard } from './VatThresholdCard';

export interface TaxOverviewDashboardProps {
  year: number;
  vat: VatStatus;
  vatEnabled: boolean;
  /** ยอดรวมรายได้ทั้งปี (จาก summarizeIncome ช่วง 1 ม.ค. – 31 ธ.ค.) */
  yearIncome: IncomeSummary;
  /** ยอดรวมค่าใช้จ่ายทั้งปี (จาก summarizeExpenses ช่วงเดียวกัน) */
  yearExpense: ExpenseSummary;
  months: MonthlyRow[];
  hasData: boolean;
  breach?: ThresholdBreach | null;
  onGoToSettings?: () => void;
  onGoToPp30?: () => void;
}

export function TaxOverviewDashboard({
  year,
  vat,
  vatEnabled,
  yearIncome,
  yearExpense,
  months,
  hasData,
  breach = null,
  onGoToSettings,
  onGoToPp30,
}: TaxOverviewDashboardProps) {
  return (
    <div className="space-y-4">
      {/* ---------- การ์ดสรุป ---------- */}
      <div className={vatEnabled ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4' : 'grid gap-4 sm:grid-cols-3'}>
        <StatTile
          label="ตะกร้า A · 40(5) ค่าเช่าห้อง"
          value={yearIncome.incomeA}
          note="ยกเว้น VAT 100% ไม่จำกัดวงเงิน"
          accent="bucketA"
        />
        <StatTile
          label="ตะกร้า B · 40(8) ค่าบริการ"
          value={yearIncome.incomeB}
          note={vatEnabled ? 'ฐานภาษี (ถอด VAT แล้ว)' : 'ยอดนี้คือรายได้สุทธิทันที'}
          accent="bucketB"
        />
        {vatEnabled && (
          <StatTile
            label="VAT 7% ที่เก็บจากผู้เช่า"
            value={yearIncome.outputVat}
            note="ภาษีขาย — ไม่ถือเป็นรายได้"
            accent="info"
          />
        )}
        <StatTile
          label={vatEnabled ? 'เงินรับจริงทั้งปี' : 'รายได้รวมทั้งปี'}
          value={vatEnabled ? yearIncome.grossReceipts : yearIncome.total}
          note={
            vatEnabled
              ? `รายได้ ${baht(yearIncome.total)} + VAT ${baht(yearIncome.outputVat)}`
              : `40(5) + 40(8)`
          }
        />
      </div>

      {/* ---------- เกณฑ์ VAT ---------- */}
      <VatThresholdCard status={vat} breach={breach} onGoToSettings={onGoToSettings} />

      {/* ---------- ตารางรายเดือน ---------- */}
      <Card>
        <CardHeader title="สรุปรายเดือน" subtitle={`ปีภาษี ${year + 543}`} />
        {hasData ? (
          <div className={tc.wrap}>
            <table className={tc.table}>
              <thead>
                <tr>
                  <th className={tc.th}>เดือน</th>
                  <th className={tc.thNum}>40(5) ค่าเช่า</th>
                  <th className={tc.thNum}>40(8) ค่าบริการ</th>
                  {vatEnabled && <th className={tc.thNum}>ภาษีขาย</th>}
                  {vatEnabled && <th className={tc.thNum}>ภาษีซื้อ</th>}
                  {vatEnabled && <th className={tc.thNum}>ภ.พ.30</th>}
                  <th className={tc.thNum}>ค่าใช้จ่าย</th>
                  {vatEnabled && <th className={tc.thNum}>40(8) 12 ด. ย้อนหลัง</th>}
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.period} className={tc.row}>
                    <td className={tc.td}>{thaiMonth(m.period, true)}</td>
                    <td className={tc.tdNum}><Money value={m.income.incomeA} /></td>
                    <td className={tc.tdNum}><Money value={m.income.incomeB} /></td>
                    {vatEnabled && (
                      <td className={tc.tdNum}><Money value={m.income.outputVat} dash /></td>
                    )}
                    {vatEnabled && <td className={tc.tdNum}><Money value={m.inputVat} dash /></td>}
                    {vatEnabled && (
                      <td className={tc.tdNum}>
                        {!m.pp30 ? (
                          <span className="text-slate-400">—</span>
                        ) : m.pp30.payable > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Money value={m.pp30.payable} />
                            <Badge tone="danger">จ่าย</Badge>
                          </span>
                        ) : m.pp30.carryForward > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Money value={m.pp30.carryForward} />
                            <Badge tone="success">เครดิต</Badge>
                          </span>
                        ) : (
                          <span className="text-slate-400">0.00</span>
                        )}
                      </td>
                    )}
                    <td className={tc.tdNum}><Money value={m.expenseTotal} dash /></td>
                    {vatEnabled && (
                      <td
                        className={`${tc.tdNum} ${
                          m.overThreshold
                            ? 'font-semibold text-red-600 dark:text-red-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {baht(m.rolling12, 0)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={tc.tfootTd}>รวมทั้งปี</td>
                  <td className={`${tc.tfootTd} text-right`}>{baht(yearIncome.incomeA)}</td>
                  <td className={`${tc.tfootTd} text-right`}>{baht(yearIncome.incomeB)}</td>
                  {vatEnabled && (
                    <td className={`${tc.tfootTd} text-right`}>{baht(yearIncome.outputVat)}</td>
                  )}
                  {vatEnabled && (
                    <td className={`${tc.tfootTd} text-right`}>{baht(yearExpense.inputVat)}</td>
                  )}
                  {vatEnabled && <td className={tc.tfootTd} />}
                  <td className={`${tc.tfootTd} text-right`}>{baht(yearExpense.total)}</td>
                  {vatEnabled && <td className={tc.tfootTd} />}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState
            title="ยังไม่มีข้อมูลในปีนี้"
            description="เริ่มจากบันทึกรายรับและค่าใช้จ่าย — ระบบจะแยกตะกร้า A / B และแยก VAT ให้อัตโนมัติ"
          />
        )}
        {vatEnabled && onGoToPp30 && (
          <CardFooter>
            <button type="button" onClick={onGoToPp30} className={linkBtn}>
              ไปหน้า ภ.พ.30 →
            </button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

const linkBtn =
  'rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:shadow-md transition-all cursor-pointer';
