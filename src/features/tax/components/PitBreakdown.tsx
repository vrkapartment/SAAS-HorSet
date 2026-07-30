'use client';

/**
 * ฟีเจอร์ 4: ส่วนที่ "เพิ่มเข้าไป" ในหน้า ภ.ง.ด.94 / ภ.ง.ด.90 ที่มีอยู่แล้ว
 *
 * ตั้งใจ export เป็นชิ้นๆ ไม่ได้มัดรวมเป็นหน้าเดียว เพื่อให้เลือกหยิบเฉพาะที่ยังไม่มี:
 *   - PersonalAllowanceLockNotice  แสดงว่าค่าลดหย่อนส่วนตัวถูกล็อกที่เท่าไร และทำไม
 *   - ExpenseDeductionTable        ขั้นที่ 1 หักค่าใช้จ่ายรายตะกร้า (สลับเหมา/จริงได้ในที่)
 *   - DeductionBreakdown           ขั้นที่ 2 หักค่าลดหย่อน (เห็นทุกบรรทัด + เตือนเมื่อถูก cap)
 *   - ProgressiveBracketTable      ขั้นที่ 3 อัตราก้าวหน้าแบบเห็นทีละขั้น
 *   - MinTaxNotice                 ภาษีขั้นต่ำ 0.5% (ม.48(2))
 *   - PitBalanceSummary            ขั้นที่ 4 หักกลบเครดิต → จ่ายเพิ่ม/ขอคืน
 *   - PitComparisonTable           ตารางเทียบครึ่งปี vs สิ้นปี
 *
 * ⚠️ ทุก component ในไฟล์นี้เป็น presentational ล้วน — รับผลคำนวณเข้ามาแล้วแสดงผลเท่านั้น
 *    ไม่แตะ PDF mapping ของ ภ.ง.ด.90/94 และไม่ผูกกับ engine คำนวณตัวไหนเป็นการเฉพาะ
 *    ผู้เรียก (src/app/(admin)/tax/page.tsx) ต้องประกอบค่า IncomeTaxResult/PeriodComputation
 *    จาก src/lib/thaiTax.ts (engine ที่ใช้ยื่นจริง) เท่านั้น ห้ามใช้ lib/tax/pit.ts (computeIncomeTax)
 *    ป้อนค่าที่หน้านี้ เพื่อให้ตัวเลขบนจอตรงกับ PDF ที่ดาวน์โหลดเป๊ะ
 */

import type {
  DeductionItem,
  IncomeTaxResult,
  PeriodComputation,
  PitForm,
  TaxpayerType,
} from '../../../types/tax';
import { BUCKET_LABEL, PERSONAL_ALLOWANCE, PIT_FORM_INFO, TAXPAYER_LABEL } from '../../../lib/tax';
import { baht, pct } from '../../../lib/tax/format';
import {
  Alert,
  Badge,
  Breakdown,
  BreakdownRow,
  BucketBadge,
  Card,
  CardBody,
  CardHeader,
  HelpNote,
  Money,
  tableClasses as tc,
} from './primitives';

/* ================================================================== *
 * ค่าลดหย่อนส่วนตัวถูกล็อก
 * ================================================================== */

/**
 * แสดงว่าค่าลดหย่อนส่วนตัวของแบบนี้คือเท่าไร และย้ำว่าสลับกับอีกแบบไม่ได้
 * เป็นจุดที่ผิดกันบ่อยที่สุด — ภ.ง.ด.94 ได้ครึ่งเดียวของ ภ.ง.ด.90
 */
export function PersonalAllowanceLockNotice({
  form,
  taxpayerType,
  partnerCount,
  onChangeTaxpayerType,
}: {
  form: PitForm;
  taxpayerType: TaxpayerType;
  partnerCount?: number;
  onChangeTaxpayerType?: () => void;
}) {
  const info = PIT_FORM_INFO[form];
  const amount = PERSONAL_ALLOWANCE[form][taxpayerType];
  const other = form === 'PND94' ? 'ภ.ง.ด.90 (สิ้นปี)' : 'ภ.ง.ด.94 (ครึ่งปี)';
  const otherAmount =
    PERSONAL_ALLOWANCE[form === 'PND94' ? 'PND90' : 'PND94'][taxpayerType];

  return (
    <Card>
      <CardHeader
        title={`${info.title} — ${info.label}`}
        subtitle={`รอบ ${info.range} · ${info.due}`}
        actions={
          <>
            <Badge tone="info">
              {TAXPAYER_LABEL[taxpayerType]}
              {taxpayerType === 'partnership' && partnerCount ? ` (${partnerCount} คน)` : ''}
            </Badge>
            <Badge tone="bucketB">ค่าลดหย่อนส่วนตัว {baht(amount, 0)} บาท</Badge>
            {onChangeTaxpayerType && (
              <button type="button" onClick={onChangeTaxpayerType} className={btnCls}>
                เปลี่ยนสถานะ →
              </button>
            )}
          </>
        }
      />
      <CardBody className="py-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          ค่าลดหย่อนส่วนตัวของ {info.title} = <b>{baht(amount, 0)} บาท</b> (ของ {other} คือ{' '}
          {baht(otherAmount, 0)} บาท) — ระบบล็อกตามแบบ + สถานะผู้เสียภาษี สลับกันไม่ได้
        </p>
      </CardBody>
    </Card>
  );
}

/* ================================================================== *
 * ขั้นที่ 1 — หักค่าใช้จ่าย
 * ================================================================== */

export function ExpenseDeductionTable({
  result,
  outputVatInPeriod = 0,
  actualExpenseA,
  actualExpenseB,
  onChangeMode,
  onChangeRate,
}: {
  result: IncomeTaxResult;
  /** VAT ที่เก็บในรอบ — ใช้บอกผู้ใช้ว่าฐาน 40(8) ถอด VAT ออกแล้ว */
  outputVatInPeriod?: number;
  actualExpenseA?: number;
  actualExpenseB?: number;
  onChangeMode?: (bucket: 'A' | 'B', mode: 'lump' | 'actual') => void;
  onChangeRate?: (bucket: 'A' | 'B', ratePct: number) => void;
}) {
  const rows: Array<{
    bucket: 'A' | 'B';
    title: string;
    hint: string;
    detail: IncomeTaxResult['expense']['a'];
    actual?: number;
  }> = [
    {
      bucket: 'A',
      title: 'ค่าเช่าห้อง',
      hint: 'ยกเว้น VAT — ไม่มี VAT ปนในฐานนี้',
      detail: result.expense.a,
      actual: actualExpenseA,
    },
    {
      bucket: 'B',
      title: 'ค่าบริการ/ส่วนกลาง/ริบเงินประกัน ฯลฯ',
      hint:
        outputVatInPeriod > 0
          ? `ถอด VAT ${baht(outputVatInPeriod)} บาทออกแล้ว`
          : 'ยังไม่มี VAT ในรอบนี้',
      detail: result.expense.b,
      actual: actualExpenseB,
    },
  ];

  return (
    <Card>
      <CardHeader title="ขั้นที่ 1 — ตั้งต้นรายได้และหักค่าใช้จ่าย" />
      <div className={tc.wrap}>
        <table className={tc.table}>
          <thead>
            <tr>
              <th className={tc.th}>ประเภทเงินได้</th>
              <th className={tc.thNum}>รายได้ในรอบ</th>
              <th className={tc.th} style={{ width: 210 }}>รูปแบบการหัก</th>
              <th className={tc.thNum}>ค่าใช้จ่ายที่หัก</th>
              <th className={tc.thNum}>คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bucket} className={tc.row}>
                <td className={tc.td}>
                  <BucketBadge bucket={r.bucket} />
                  <div className="mt-0.5 text-sm">{r.title}</div>
                  <div className="text-[11px] text-slate-500">{r.hint}</div>
                </td>
                <td className={tc.tdNum}><Money value={r.detail.income} /></td>
                <td className={tc.td}>
                  <div className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-700">
                    {(['lump', 'actual'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={!onChangeMode}
                        onClick={() => onChangeMode?.(r.bucket, m)}
                        className={
                          r.detail.mode === m
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm'
                            : 'px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-default dark:text-slate-300 dark:hover:bg-slate-800'
                        }
                      >
                        {m === 'lump' ? 'หักเหมา' : 'หักจริง'}
                      </button>
                    ))}
                  </div>
                  {r.detail.mode === 'lump' ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">อัตรา</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        disabled={!onChangeRate}
                        value={Math.round((r.detail.rate ?? 0) * 100)}
                        onChange={(e) => onChangeRate?.(r.bucket, Number(e.target.value))}
                        className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
                      />
                      <span className="text-[11px] text-slate-500">%</span>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[11px] text-slate-500">
                      จากสมุดค่าใช้จ่าย {baht(r.actual ?? r.detail.requested)} บาท
                    </div>
                  )}
                </td>
                <td className={`${tc.tdNum} text-red-600 dark:text-red-400`}>
                  −<Money value={r.detail.deduction} />
                </td>
                <td
                  className={`${tc.tdNum} font-semibold ${
                    r.detail.afterExpense < 0 ? 'text-red-600 dark:text-red-400' : ''
                  }`}
                >
                  <Money value={r.detail.afterExpense} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={tc.tfootTd}>รวม</td>
              <td className={`${tc.tfootTd} text-right`}>{baht(result.income.gross)}</td>
              <td className={tc.tfootTd} />
              <td className={`${tc.tfootTd} text-right`}>−{baht(result.expense.total)}</td>
              <td className={`${tc.tfootTd} text-right`}>{baht(result.afterExpense)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {result.crossBucketDeduction.triggered && (
        <CardBody className="py-3">
          <Alert
            tone="warning"
            title="ค่าใช้จ่ายจริงที่ขอหักสูงกว่ารายได้ของตะกร้านั้น — เตรียมเอกสารให้ครบก่อนยื่น"
          >
            {rows
              .filter((r) => r.detail.exceedsIncome)
              .map((r) => (
                <p key={r.bucket} className="mt-1 first:mt-0">
                  ตะกร้า {BUCKET_LABEL[r.bucket]}: ขอหักค่าใช้จ่ายจริง {baht(r.detail.requested)} บาท
                  ทั้งที่รายได้ของตะกร้านี้มีแค่ {baht(r.detail.income)} บาท — กรมสรรพากรมักขอตรวจดูเอกสาร/
                  ใบกำกับภาษีเมื่อพบลักษณะนี้ในการยื่น ภ.ง.ด.90/94 ควรเตรียมหลักฐานค่าใช้จ่ายให้ครบตามยอดที่
                  ขอหักทั้งหมด {baht(r.detail.requested)} บาท (ไม่ใช่แค่ยอดรายได้ของตะกร้านี้) ไว้ก่อนยื่นจริง
                </p>
              ))}
            <HelpNote>
              {result.crossBucketDeduction.capExpensePerBucket
                ? 'ตอนนี้เปิดโหมด "จำกัดค่าใช้จ่ายจริงไม่เกินรายได้ต่อตะกร้า" ไว้ในหน้าตั้งค่า ระบบจึงหักให้ไม่เกินรายได้ของแต่ละตะกร้า ส่วนที่เกินจะไม่ถูกนำไปลดหย่อนภาษีแม้ยอดที่บันทึกจริงจะสูงกว่านี้'
                : 'ระบบหักให้เต็มจำนวนตามที่บันทึกจริง ส่วนที่เกินรายได้ของตะกร้านี้จะถูกนำไปหักลบกับเงินได้ของตะกร้าอื่นก่อนคำนวณภาษี (ตรงกับแนวทางยื่นจริง) — ปิดพฤติกรรมนี้ได้ที่หน้าตั้งค่า หากต้องการหักแบบระมัดระวังกว่า (จำกัดไม่ให้เกินรายได้ต่อตะกร้า)'}
            </HelpNote>
          </Alert>
        </CardBody>
      )}
      {(result.expense.a.capped || result.expense.b.capped) && (
        <CardBody className="py-3">
          <HelpNote>
            เปิดโหมดจำกัดค่าใช้จ่ายจริงต่อตะกร้าไว้ในหน้าตั้งค่า — ยอดที่หักได้จึงถูกจำกัดไม่ให้เกินรายได้ของตะกร้านั้น
          </HelpNote>
        </CardBody>
      )}
    </Card>
  );
}

/* ================================================================== *
 * ขั้นที่ 2 — ค่าลดหย่อน
 * ================================================================== */

export function DeductionBreakdown({
  result,
  deductions = [],
  onManageDeductions,
}: {
  result: IncomeTaxResult;
  deductions?: DeductionItem[];
  onManageDeductions?: () => void;
}) {
  const key = result.form === 'PND94' ? 'amountPND94' : 'amountPND90';
  const listed = deductions.filter((d) => (d[key] ?? 0) > 0);
  const info = PIT_FORM_INFO[result.form];

  return (
    <Card>
      <CardHeader
        title="ขั้นที่ 2 — หักค่าลดหย่อน"
        actions={
          onManageDeductions && (
            <button type="button" onClick={onManageDeductions} className={btnCls}>
              ⚙ จัดการค่าลดหย่อนอื่น
            </button>
          )
        }
      />
      <CardBody>
        <Breakdown>
          <BreakdownRow label="เงินได้หลังหักค่าใช้จ่าย" value={<Money value={result.afterExpense} />} />
          <BreakdownRow
            label={`ค่าลดหย่อนส่วนตัว (${TAXPAYER_LABEL[result.taxpayerType]})`}
            sub={`ล็อกโดย ${info.title} — ${baht(result.deductions.personalAllowance, 0)} บาท`}
            value={<>−<Money value={result.deductions.personalAllowance} /></>}
            minus
            indent
          />
          {listed.map((d) => (
            <BreakdownRow
              key={d.id}
              label={d.name || 'ค่าลดหย่อนอื่น'}
              sub={d.note}
              value={<>−<Money value={d[key]} /></>}
              minus
              indent
            />
          ))}
          {result.deductions.other === 0 && (
            <BreakdownRow label="ค่าลดหย่อนอื่น" sub="ยังไม่ได้บันทึก" value="—" indent />
          )}
          {result.deductions.capped && (
            <BreakdownRow
              label="ค่าลดหย่อนที่ใช้ได้จริง"
              sub={`จากที่ขอ ${baht(result.deductions.requested)} — ใช้ได้ไม่เกินเงินได้หลังหักค่าใช้จ่าย`}
              value={<>−<Money value={result.deductions.applied} /></>}
              minus
            />
          )}
          <BreakdownRow
            label={result.form === 'PND94' ? 'เงินได้สุทธิครึ่งปี' : 'เงินได้สุทธิทั้งปี'}
            value={<Money value={result.netIncome} />}
            subtotal
          />
        </Breakdown>
        {result.deductions.capped && (
          <HelpNote>
            ค่าลดหย่อนเกินเงินได้หลังหักค่าใช้จ่าย ระบบจึงตัดเงินได้สุทธิเป็น 0 ไม่ให้ติดลบ
            (เงินได้สุทธิติดลบไม่ได้ และไม่สามารถยกไปหักปีถัดไป)
          </HelpNote>
        )}
      </CardBody>
    </Card>
  );
}

/* ================================================================== *
 * ขั้นที่ 3 — อัตราก้าวหน้า + ภาษีขั้นต่ำ
 * ================================================================== */

export function ProgressiveBracketTable({ result }: { result: IncomeTaxResult }) {
  const steps = result.progressive.steps;

  return (
    <Card>
      <CardHeader
        title="ขั้นที่ 3 — คำนวณตามอัตราภาษีก้าวหน้า (ขั้นบันได)"
        subtitle={`เงินได้สุทธิ ${baht(result.netIncome)} บาท`}
      />
      {steps.length === 0 ? (
        <CardBody>
          <p className="text-sm text-slate-500">เงินได้สุทธิ 0 บาท — ไม่มีภาษีตามขั้นบันได</p>
        </CardBody>
      ) : (
        <div className={tc.wrap}>
          <table className={tc.table}>
            <thead>
              <tr>
                <th className={tc.th}>ขั้นเงินได้สุทธิ</th>
                <th className={tc.thNum}>อัตรา</th>
                <th className={tc.thNum}>เงินได้ในขั้นนี้</th>
                <th className={tc.thNum}>ภาษี</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((st) => (
                <tr key={st.from} className={tc.row}>
                  <td className={tc.td}>
                    {st.to === Infinity
                      ? `${baht(st.from, 0)} บาทขึ้นไป`
                      : `${baht(st.from, 0)} – ${baht(st.to, 0)} บาท`}
                  </td>
                  <td className={tc.tdNum}>{pct(st.rate)}</td>
                  <td className={tc.tdNum}><Money value={st.amount} /></td>
                  <td className={tc.tdNum}><Money value={st.tax} dash /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={tc.tfootTd} colSpan={3}>ภาษีตามขั้นบันได</td>
                <td className={`${tc.tfootTd} text-right`}>{baht(result.progressive.tax)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <CardBody className="py-3">
        <MinTaxNotice result={result} />
      </CardBody>
    </Card>
  );
}

/**
 * ภาษีขั้นต่ำ 0.5% ของเงินได้พึงประเมิน (มาตรา 48(2))
 *
 * เคสที่กฎนี้สำคัญ: หักค่าใช้จ่ายจริงเยอะจนเงินได้สุทธิเหลือ 0 แต่รายได้รวมสูง
 * ถ้าไม่มีกฎนี้ระบบจะบอกว่าภาษี = 0 ซึ่งต่ำกว่าความจริง
 */
export function MinTaxNotice({ result }: { result: IncomeTaxResult }) {
  const mt = result.minTax;
  if (!mt.enabled) return null;

  if (mt.applies) {
    return (
      <Alert tone="warning" title={`ใช้ภาษีขั้นต่ำ ${pct(mt.rate, 1)} ของเงินได้พึงประเมิน (มาตรา 48(2))`}>
        {pct(mt.rate, 1)} × {baht(result.income.gross)} = <b>{baht(mt.amount)} บาท</b> ซึ่งสูงกว่า
        ภาษีตามขั้นบันได ({baht(result.progressive.tax)} บาท) จึงใช้ยอดนี้
        <HelpNote>
          กฎนี้ปิดได้ในหน้าตั้งค่า — ควรยืนยันเกณฑ์ที่ใช้กับกรณีของท่านกับกรมสรรพากรก่อนยื่นจริง
        </HelpNote>
      </Alert>
    );
  }

  return (
    <HelpNote>
      {mt.exempted
        ? `ตรวจแล้ว: ภาษีขั้นต่ำ ${pct(mt.rate, 1)} คำนวณได้ต่ำกว่าเกณฑ์ยกเว้น จึงได้รับยกเว้น`
        : result.income.gross > mt.threshold
          ? `ตรวจแล้ว: ภาษีขั้นต่ำ ${pct(mt.rate, 1)} = ${baht(mt.amount)} บาท ต่ำกว่าภาษีขั้นบันได จึงใช้ขั้นบันได`
          : `ไม่เข้าเงื่อนไขภาษีขั้นต่ำ (เงินได้พึงประเมินไม่เกิน ${baht(mt.threshold, 0)} บาท)`}
    </HelpNote>
  );
}

/* ================================================================== *
 * ขั้นที่ 4 — หักกลบเครดิต
 * ================================================================== */

export function PitBalanceSummary({
  computation,
  onGoToPnd94,
}: {
  computation: PeriodComputation;
  onGoToPnd94?: () => void;
}) {
  const { tax, form, pnd94IsEstimate } = computation;

  return (
    <Card>
      <CardHeader
        title={
          form === 'PND94'
            ? 'ขั้นที่ 4 — ภาษีครึ่งปีที่ต้องชำระ'
            : 'ขั้นที่ 4 — หักกลบลบหนี้กับครึ่งปี'
        }
      />
      <CardBody>
        <Breakdown>
          <BreakdownRow
            label={form === 'PND94' ? 'ภาษีครึ่งปีที่คำนวณได้' : 'ยอดภาษีรวมทั้งปี'}
            value={<Money value={tax.taxBeforeCredits} />}
            subtotal
          />
          {tax.credits.withholdingTax > 0 && (
            <BreakdownRow
              label="หักภาษี ณ ที่จ่าย"
              value={<>−<Money value={tax.credits.withholdingTax} /></>}
              minus
              indent
            />
          )}
          {form === 'PND90' && (
            <BreakdownRow
              label={pnd94IsEstimate ? 'หักภาษี ภ.ง.ด.94 (ประมาณการ)' : 'หักภาษี ภ.ง.ด.94 ที่จ่ายแล้ว'}
              value={<>−<Money value={tax.credits.pnd94Paid} /></>}
              minus
              indent
            />
          )}
          {tax.status === 'refund' ? (
            <BreakdownRow label="ขอคืนภาษี" value={<Money value={tax.refundable} sign />} result tone="refund" />
          ) : tax.status === 'pay' ? (
            <BreakdownRow
              label={form === 'PND94' ? 'ภาษีที่ต้องชำระตอนครึ่งปี' : 'ภาษีที่ต้องจ่ายเพิ่ม'}
              value={<Money value={tax.payable} sign />}
              result
              tone="pay"
            />
          ) : (
            <BreakdownRow label="ไม่มีภาษีต้องชำระ" value="฿0.00" result />
          )}
        </Breakdown>

        {form === 'PND90' && pnd94IsEstimate && (computation.pnd94Result?.tax.payable ?? 0) > 0 && (
          <HelpNote>
            ยอดภาษีครึ่งปีที่ใช้หักกลบเป็น <b>ประมาณการ</b> เพราะยังไม่ได้บันทึกยอดที่จ่ายจริง
            {onGoToPnd94 && (
              <>
                {' — '}
                <button type="button" onClick={onGoToPnd94} className="font-semibold underline">
                  ไปบันทึกที่หน้า ภ.ง.ด.94
                </button>
              </>
            )}
          </HelpNote>
        )}
      </CardBody>
    </Card>
  );
}

/* ================================================================== *
 * ตารางเทียบครึ่งปี vs สิ้นปี
 * ================================================================== */

export function PitComparisonTable({ pnd90 }: { pnd90: PeriodComputation }) {
  const half = pnd90.pnd94Result?.tax;
  if (!half) return null;
  const full = pnd90.tax;

  const rows: Array<{ label: string; h1: number; fy: number; total?: boolean; minus?: boolean }> = [
    { label: 'รายได้ 40(5)', h1: half.income.a, fy: full.income.a },
    { label: 'รายได้ 40(8)', h1: half.income.b, fy: full.income.b },
    { label: 'หักค่าใช้จ่าย', h1: half.expense.total, fy: full.expense.total, minus: true },
    { label: 'หักค่าลดหย่อน', h1: half.deductions.applied, fy: full.deductions.applied, minus: true },
    { label: 'เงินได้สุทธิ', h1: half.netIncome, fy: full.netIncome, total: true },
    { label: 'ภาษีที่คำนวณได้', h1: half.taxBeforeCredits, fy: full.taxBeforeCredits, total: true },
  ];

  return (
    <Card>
      <CardHeader title="เทียบครึ่งปี vs สิ้นปี" />
      <div className={tc.wrap}>
        <table className={tc.table}>
          <thead>
            <tr>
              <th className={tc.th}>รายการ</th>
              <th className={tc.thNum}>ภ.ง.ด.94 (ครึ่งปี)</th>
              <th className={tc.thNum}>ภ.ง.ด.90 (ทั้งปี)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className={
                  r.total
                    ? 'bg-slate-50 font-semibold dark:bg-slate-800/40'
                    : tc.row
                }
              >
                <td className={tc.td}>{r.label}</td>
                <td className={tc.tdNum}>{r.minus ? '−' : ''}{baht(r.h1)}</td>
                <td className={tc.tdNum}>{r.minus ? '−' : ''}{baht(r.fy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const btnCls =
  'rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';
