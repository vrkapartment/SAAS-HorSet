/**
 * ชิ้นส่วน UI เล็กๆ ที่ component อื่นในโฟลเดอร์นี้ใช้ร่วมกัน
 *
 * รองรับ dark mode ผ่าน `dark:` ของ Tailwind — ใช้ `cn()` ที่มีอยู่แล้วของโปรเจกต์ (clsx + tailwind-merge)
 * แทน `cx()` ที่โค้ดต้นฉบับ reimplement เอง
 */

import type { ReactNode } from 'react';
import { cn as cx } from '@/lib/utils';
import { baht } from '../../../lib/tax/format';

/* ------------------------------------------------------------------ *
 * ตัวเลข
 * ------------------------------------------------------------------ */

export function Money({
  value,
  decimals = 2,
  sign = false,
  dash = false,
  className,
}: {
  value: number | null | undefined;
  decimals?: 0 | 2;
  /** แสดงสัญลักษณ์ ฿ */
  sign?: boolean;
  /** แสดง — เมื่อค่าเป็น 0 */
  dash?: boolean;
  className?: string;
}) {
  const v = value ?? 0;
  if (dash && !v) {
    return <span className={cx('text-neutral-400 dark:text-neutral-500', className)}>—</span>;
  }
  return (
    <span className={cx('tabular-nums', className)}>
      {sign && <span className="mr-0.5 text-neutral-500">฿</span>}
      {baht(v, decimals)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        'overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm',
        'dark:border-neutral-800 dark:bg-neutral-900',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
        )}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({
  children,
  flush = false,
  className,
}: {
  children: ReactNode;
  /** ไม่มี padding — ใช้เวลาใส่ตารางเต็มความกว้าง */
  flush?: boolean;
  className?: string;
}) {
  return <div className={cx(flush ? '' : 'p-5', className)}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3 text-xs dark:border-neutral-800 dark:bg-neutral-900/60">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Badge
 * ------------------------------------------------------------------ */

export type BadgeTone = 'neutral' | 'bucketA' | 'bucketB' | 'success' | 'danger' | 'warning' | 'info';

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  bucketA: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  bucketB: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold',
        BADGE_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/** badge ของตะกร้า A/B — ใช้ให้เหมือนกันทุกที่ ผู้ใช้จะจำสีได้ */
export function BucketBadge({ bucket }: { bucket: 'A' | 'B' }) {
  return (
    <Badge tone={bucket === 'A' ? 'bucketA' : 'bucketB'}>
      {bucket === 'A' ? 'A · 40(5)' : 'B · 40(8)'}
    </Badge>
  );
}

/* ------------------------------------------------------------------ *
 * StatTile
 * ------------------------------------------------------------------ */

const ACCENT: Record<string, string> = {
  bucketA: 'border-l-cyan-500',
  bucketB: 'border-l-violet-500',
  info: 'border-l-sky-500',
  pay: 'border-l-red-500',
  ok: 'border-l-emerald-500',
  none: 'border-l-transparent',
};

export function StatTile({
  label,
  value,
  note,
  accent = 'none',
  valueTone,
  decimals = 2,
}: {
  label: ReactNode;
  value: number;
  note?: ReactNode;
  accent?: keyof typeof ACCENT;
  valueTone?: 'pay' | 'refund';
  decimals?: 0 | 2;
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-col gap-0.5 rounded-xl border border-l-[3px] border-neutral-200 bg-white p-4 shadow-sm',
        'dark:border-neutral-800 dark:bg-neutral-900',
        ACCENT[accent],
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div
        className={cx(
          'break-all text-2xl font-semibold leading-tight tabular-nums',
          valueTone === 'pay' && 'text-red-600 dark:text-red-400',
          valueTone === 'refund' && 'text-emerald-600 dark:text-emerald-400',
          !valueTone && 'text-neutral-900 dark:text-neutral-100',
        )}
      >
        <span className="mr-0.5 text-sm font-medium text-neutral-400">฿</span>
        {baht(value, decimals)}
      </div>
      {note && <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{note}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Alert
 * ------------------------------------------------------------------ */

const ALERT_TONE: Record<string, string> = {
  info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200',
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  warning:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
  danger:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200',
};

export function Alert({
  tone = 'info',
  icon,
  title,
  children,
  actions,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const defaultIcon = { info: 'ℹ️', success: '✅', warning: '⚠️', danger: '🚨' }[tone];
  return (
    <div className={cx('mb-4 flex gap-3 rounded-lg border p-4 text-sm', ALERT_TONE[tone])}>
      <div className="shrink-0 text-lg leading-tight">{icon ?? defaultIcon}</div>
      <div className="min-w-0 flex-1">
        {title && <div className="font-bold">{title}</div>}
        {children}
        {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * ProgressBar
 * ------------------------------------------------------------------ */

export function ProgressBar({
  pct,
  tone = 'ok',
}: {
  /** 0–100+ (เกิน 100 จะถูกตัดที่ 100 แต่สีจะเปลี่ยน) */
  pct: number;
  tone?: 'ok' | 'warn' | 'over';
}) {
  const fill = { ok: 'bg-emerald-500', warn: 'bg-amber-500', over: 'bg-red-500' }[tone];
  return (
    <div className="my-1.5 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
      <div
        className={cx('h-full rounded-full transition-[width] duration-300', fill)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Breakdown (รายการคำนวณทีละบรรทัด)
 * ------------------------------------------------------------------ */

export function Breakdown({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

export function BreakdownRow({
  label,
  sub,
  value,
  indent = false,
  minus = false,
  subtotal = false,
  result = false,
  tone,
}: {
  label: ReactNode;
  sub?: ReactNode;
  value: ReactNode;
  indent?: boolean;
  minus?: boolean;
  subtotal?: boolean;
  /** แถวผลลัพธ์สุดท้าย — เน้นด้วยกรอบและตัวใหญ่ */
  result?: boolean;
  tone?: 'pay' | 'refund';
}) {
  if (result) {
    return (
      <div className="mt-2 flex items-baseline gap-3 rounded-lg border border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div className="min-w-0 flex-1 font-bold text-neutral-900 dark:text-neutral-100">
          {label}
          {sub && <div className="text-xs font-normal text-neutral-500">{sub}</div>}
        </div>
        <div
          className={cx(
            'whitespace-nowrap text-xl font-bold tabular-nums',
            tone === 'pay' && 'text-red-600 dark:text-red-400',
            tone === 'refund' && 'text-emerald-600 dark:text-emerald-400',
            !tone && 'text-neutral-900 dark:text-neutral-100',
          )}
        >
          {value}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx(
        'flex items-baseline gap-3 py-1.5 text-sm',
        subtotal
          ? 'mt-0.5 border-t border-neutral-300 font-semibold dark:border-neutral-700'
          : 'border-b border-dashed border-neutral-200 last:border-b-0 dark:border-neutral-800',
      )}
    >
      <div
        className={cx(
          'min-w-0 flex-1',
          indent && 'pl-4',
          subtotal
            ? 'font-semibold text-neutral-900 dark:text-neutral-100'
            : 'text-neutral-600 dark:text-neutral-300',
        )}
      >
        {label}
        {sub && <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{sub}</div>}
      </div>
      <div
        className={cx(
          'whitespace-nowrap font-semibold tabular-nums',
          minus ? 'text-red-600 dark:text-red-400' : 'text-neutral-900 dark:text-neutral-100',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * ตาราง
 * ------------------------------------------------------------------ */

export const tableClasses = {
  wrap: 'overflow-x-auto',
  table: 'w-full border-collapse text-sm',
  th: 'whitespace-nowrap border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400',
  thNum:
    'whitespace-nowrap border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400',
  td: 'border-b border-neutral-200 px-4 py-2 align-middle dark:border-neutral-800',
  tdNum:
    'whitespace-nowrap border-b border-neutral-200 px-4 py-2 text-right align-middle tabular-nums dark:border-neutral-800',
  tfootTd:
    'border-t-2 border-neutral-300 bg-neutral-50 px-4 py-2.5 font-semibold tabular-nums dark:border-neutral-700 dark:bg-neutral-900/60',
  row: 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40',
};

export function EmptyState({
  icon = '📭',
  title,
  description,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mb-2 text-3xl opacity-50">{icon}</div>
      <div className="font-semibold text-neutral-600 dark:text-neutral-300">{title}</div>
      {description && (
        <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</div>
      )}
    </div>
  );
}

/** ข้อความอธิบายเล็กๆ มีเส้นนำหน้า */
export function HelpNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 border-l-2 border-neutral-300 pl-3 text-[11px] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
      {children}
    </div>
  );
}

export { cx };
