/**
 * Adapter: ข้อมูลจริงของ SAAS HorSet (bills / rooms / tenants / cancelled_contracts / expenses)
 *  → TaxDataset ที่ hook/component ของฟีเจอร์นี้ต้องการ
 *
 * เขียนหลังเห็น source จริงของ tax/page.tsx — โครงเลขในนี้ตั้งใจให้ตรงกับสูตรที่หน้านั้นใช้อยู่แล้ว
 * ทุกฟังก์ชั่นในไฟล์นี้ "ไม่ fetch เอง" รับ array ที่ดึงมาแล้วเข้ามาล้วนๆ — เรียก adapter นี้
 * หลัง fetch เสร็จ แล้วส่งผลลัพธ์ต่อให้ hooks (useTax.ts) แทนการคำนวณ inline แบบเดิม
 *
 * ⚠️ ข้อควรระวังที่ตั้งใจคงไว้ตรงตาม tax/page.tsx (อย่าลบทิ้งตอน refactor):
 *   - รายรับไม่ถูกกรองด้วยปีภาษีที่นี่ ต้องส่ง "ทุกปี" เข้ามาเสมอ เพราะเกณฑ์ VAT เป็น
 *     rolling 12 เดือนข้ามปี — ตัวเลือกปีไปกรองที่ชั้น summarizeIncome ทีหลัง
 *   - สัญญายกเลิกที่ cancellationDate อยู่ในอนาคต (ย้ายออกล่วงหน้า) ไม่นับเป็นรายรับ
 *   - `getContractServices408` มี fallback อ่าน forfeitedAmount เมื่อ 3 คอลัมน์ใหม่เป็น 0 หมด
 *     (ข้อมูลเก่าก่อนมีการแยกคอลัมน์ deducted_rent_405/utilities_408/services_408)
 */

import type {
  ExpenseModeConfig,
  ExpenseRow,
  IncomeRow,
  MinTaxRule,
  TaxSettings,
} from '../../types/tax';
import { r2 } from './money';
import { todayISO } from './period';

export interface HorSetBill {
  roomNumber: string;
  amount: number;
  status: 'unpaid' | 'pending' | 'paid';
  billingCycle: string; // 'YYYY-MM'
  electricUnits: number;
  waterUnits: number;
  otherServiceAmount: number;
  invoiceId?: string | null;
  /** คอลัมน์ใหม่จาก migration ภาษี — เก็บ VAT ที่คิดจากผู้เช่าจริงตอนออกบิล (0 เมื่อยังไม่จด VAT) */
  vatAmount?: number;
}

export interface HorSetRoom {
  roomNumber: string;
  baseRent: number;
}

export interface HorSetTenant {
  roomNumber: string;
  contractStart: string | null; // tenants.lease_start
}

export interface HorSetCancelledContract {
  roomNumber?: string;
  cancellationDate: string;
  deductedRent405: number;
  deductedUtilities408: number;
  deductedServices408: number;
  forfeitedAmount: number;
}

export interface HorSetExpense {
  /** null ได้ในข้อมูลเก่าก่อนมีคอลัมน์นี้ — ดีฟอลต์เป็นตะกร้า B ถ้าไม่ระบุ */
  category: '40_5' | '40_8' | null;
  amount: number;
  created_at: string;
  vat_amount?: number;
  claim_input_vat?: boolean;
}

export interface HorSetWorkspaceTaxSettings {
  taxpayerStatus: 'individual' | 'partnership';
  partnerCount: number;
  electricRate: number;
  waterRate: number;
  commonFee: number;
  /** จำนวนเดือนค่าเช่าล่วงหน้าที่เรียกเก็บตอนทำสัญญา (workspaces.advance_rent) */
  advanceRentMonths: number;

  vatRegistered: boolean;
  /** date 'YYYY-MM-DD' จากคอลัมน์ workspaces.vat_registered_from */
  vatRegisteredFrom: string | null;
  vatRate: number;
  vatThreshold: number;
  vatOpeningCredit: number;

  expenseAMode: 'lump' | 'actual';
  expenseALumpRate: number;
  expenseBMode: 'lump' | 'actual';
  expenseBLumpRate: number;
  /** false (ค่าเริ่มต้น) = หักค่าใช้จ่ายจริงข้ามตะกร้าได้ — ดู TaxSettings.capExpensePerBucket */
  capExpensePerBucket: boolean;

  minTaxEnabled: boolean;
  minTaxRate: number;
  minTaxThresholdPnd90: number;
  minTaxThresholdPnd94: number;
  minTaxExemptBelow: number;
}

export interface HorSetTaxSourceData {
  bills: HorSetBill[];
  rooms: HorSetRoom[];
  tenants: HorSetTenant[];
  cancelledContracts: HorSetCancelledContract[];
  expenses: HorSetExpense[];
  settings: HorSetWorkspaceTaxSettings;
}

function findRoom(rooms: HorSetRoom[], roomNumber: string): HorSetRoom | undefined {
  return rooms.find((r) => r.roomNumber === roomNumber);
}

/** ค่าใช้จ่ายจากบิล 1 ใบ → รายรับ 3 บรรทัด (เช่า 40(5) / ค่าน้ำไฟ 40(8) / อื่นๆ 40(8) ที่ไม่เข้าเกณฑ์หักเหมา) */
function billToIncomeRows(
  bill: HorSetBill,
  rooms: HorSetRoom[],
  settings: HorSetWorkspaceTaxSettings,
): IncomeRow[] {
  if (bill.status !== 'paid') return [];

  const elecAmount = bill.electricUnits * settings.electricRate;
  const waterAmount = bill.waterUnits * settings.waterRate;
  const utilitiesAmount = elecAmount + waterAmount + settings.commonFee;

  const matchedRoom = findRoom(rooms, bill.roomNumber);
  const baseRentVal = matchedRoom ? matchedRoom.baseRent : Math.max(0, bill.amount - utilitiesAmount);
  const rentAmount = Math.max(0, Math.min(baseRentVal, bill.amount));
  const otherAmount = Math.max(0, bill.amount - rentAmount - utilitiesAmount);

  const date = `${bill.billingCycle}-01`;
  // VAT ทั้งใบผูกไว้กับบรรทัด "utilities" บรรทัดเดียว — ผลรวมระดับตะกร้า B ไม่ต่างกัน
  // ไม่ว่าจะแบ่ง vat ไปไว้บรรทัดไหน เพราะ summarizeIncome รวม vat ของทั้งตะกร้า B เข้าด้วยกัน
  const vat = r2(bill.vatAmount ?? 0);

  const rows: IncomeRow[] = [
    {
      id: `${bill.invoiceId ?? bill.billingCycle}-rent`,
      date,
      bucket: 'A',
      base: r2(rentAmount),
      vat: 0,
      category: 'rent',
      room: bill.roomNumber,
      invoiceId: bill.invoiceId ?? undefined,
    },
  ];

  if (utilitiesAmount > 0) {
    rows.push({
      id: `${bill.invoiceId ?? bill.billingCycle}-utilities`,
      date,
      bucket: 'B',
      base: r2(utilitiesAmount),
      vat,
      category: 'utilities',
      room: bill.roomNumber,
      invoiceId: bill.invoiceId ?? undefined,
    });
  }

  if (otherAmount > 0) {
    rows.push({
      id: `${bill.invoiceId ?? bill.billingCycle}-other`,
      date,
      bucket: 'B',
      base: r2(otherAmount),
      vat: 0,
      category: 'other',
      room: bill.roomNumber,
      invoiceId: bill.invoiceId ?? undefined,
    });
  }

  return rows;
}

/** ค่าเช่าล่วงหน้าตอนทำสัญญา — รับรู้เป็นรายได้ 40(5) ทั้งก้อนในเดือนที่เริ่มสัญญา */
function tenantsToAdvanceRentRows(tenants: HorSetTenant[], rooms: HorSetRoom[], months: number): IncomeRow[] {
  if (!months) return [];
  return tenants
    .filter((t) => Boolean(t.contractStart))
    .map((t) => {
      const room = findRoom(rooms, t.roomNumber);
      const amount = (room?.baseRent ?? 0) * months;
      return {
        id: `advance-${t.roomNumber}-${t.contractStart}`,
        date: t.contractStart as string,
        bucket: 'A' as const,
        base: r2(amount),
        vat: 0,
        category: 'advance_rent',
        room: t.roomNumber,
      };
    })
    .filter((row) => row.base > 0);
}

/** เงินประกันที่ริบเมื่อยกเลิกสัญญา — รับรู้เป็นรายได้ในเดือนที่ยกเลิกจริง (ไม่นับล่วงหน้า) */
function cancelledContractsToIncomeRows(contracts: HorSetCancelledContract[]): IncomeRow[] {
  const today = todayISO();
  const rows: IncomeRow[] = [];

  for (const c of contracts) {
    if (!c.cancellationDate || c.cancellationDate > today) continue;

    if (c.deductedRent405 > 0) {
      rows.push({
        id: `cancel-${c.roomNumber}-${c.cancellationDate}-rent`,
        date: c.cancellationDate,
        bucket: 'A',
        base: r2(c.deductedRent405),
        vat: 0,
        category: 'deposit_forfeit_rent',
        room: c.roomNumber,
      });
    }

    if (c.deductedUtilities408 > 0) {
      rows.push({
        id: `cancel-${c.roomNumber}-${c.cancellationDate}-utilities`,
        date: c.cancellationDate,
        bucket: 'B',
        base: r2(c.deductedUtilities408),
        vat: 0,
        category: 'deposit_forfeit_utilities',
        room: c.roomNumber,
      });
    }

    // fallback สำหรับข้อมูลเก่าก่อนมีคอลัมน์ deducted_services_408 — ทั้ง 3 คอลัมน์เป็น 0 หมด
    // แปลว่ายังไม่เคยแยก ให้ใช้ forfeited_amount ทั้งก้อนแทน (ตรรกะเดียวกับ getContractServices408 ใน page.tsx)
    const services = c.deductedRent405 === 0 && c.deductedUtilities408 === 0 && c.deductedServices408 === 0
      ? c.forfeitedAmount
      : c.deductedServices408;

    if (services > 0) {
      rows.push({
        id: `cancel-${c.roomNumber}-${c.cancellationDate}-services`,
        date: c.cancellationDate,
        bucket: 'B',
        base: r2(services),
        vat: 0,
        category: 'deposit_forfeit_other',
        room: c.roomNumber,
      });
    }
  }

  return rows;
}

function expensesToExpenseRows(expenses: HorSetExpense[]): ExpenseRow[] {
  return expenses.map((e, i) => ({
    id: `expense-${i}-${e.created_at}`,
    date: e.created_at.slice(0, 10),
    bucket: e.category === '40_5' ? 'A' : 'B',
    base: r2(e.amount),
    vat: r2(e.vat_amount ?? 0),
    claimInputVat: e.claim_input_vat,
  }));
}

function expenseModeConfig(mode: 'lump' | 'actual', lumpRate: number, actualAmount: number): ExpenseModeConfig {
  return mode === 'lump' ? { mode, lumpRate } : { mode, lumpRate, actualAmount };
}

/** แปลง HorSetWorkspaceTaxSettings → TaxSettings ที่ lib/tax ใช้ */
export function toTaxSettings(
  settings: HorSetWorkspaceTaxSettings,
  actualExpenseA: number,
  actualExpenseB: number,
): TaxSettings {
  const minTaxRule: MinTaxRule = {
    enabled: settings.minTaxEnabled,
    rate: settings.minTaxRate,
    incomeThresholdPND90: settings.minTaxThresholdPnd90,
    incomeThresholdPND94: settings.minTaxThresholdPnd94,
    exemptBelow: settings.minTaxExemptBelow,
  };

  return {
    vatRegistered: settings.vatRegistered,
    vatRegisteredFrom: settings.vatRegisteredFrom ? settings.vatRegisteredFrom.slice(0, 7) : null,
    vatRate: settings.vatRate,
    vatThreshold: settings.vatThreshold,
    vatOpeningCredit: settings.vatOpeningCredit,
    taxpayerType: settings.taxpayerStatus,
    partnerCount: settings.partnerCount,
    expenseA: expenseModeConfig(settings.expenseAMode, settings.expenseALumpRate, actualExpenseA),
    expenseB: expenseModeConfig(settings.expenseBMode, settings.expenseBLumpRate, actualExpenseB),
    capExpensePerBucket: settings.capExpensePerBucket,
    minTaxRule,
  };
}

/**
 * ประกอบ IncomeRow[] ทั้งหมดจากข้อมูลจริง — ครอบ "ทุกปี" ที่ส่งเข้ามา
 * ห้ามกรองปีในนี้ ให้ชั้นที่เรียก summarizeIncome/vatStatus เป็นคนกรองช่วงวันที่เอง
 */
export function buildIncomeRows(data: HorSetTaxSourceData): IncomeRow[] {
  const billRows = data.bills.flatMap((b) => billToIncomeRows(b, data.rooms, data.settings));
  const advanceRows = tenantsToAdvanceRentRows(data.tenants, data.rooms, data.settings.advanceRentMonths);
  const cancelRows = cancelledContractsToIncomeRows(data.cancelledContracts);
  return [...billRows, ...advanceRows, ...cancelRows];
}

export function buildExpenseRows(data: HorSetTaxSourceData): ExpenseRow[] {
  return expensesToExpenseRows(data.expenses);
}
