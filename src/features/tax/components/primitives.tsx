/**
 * ชิ้นส่วน UI เล็กๆ ที่ component อื่นในโฟลเดอร์นี้ใช้ร่วมกัน
 *
 * รองรับ dark mode ผ่าน `dark:` ของ Tailwind — ใช้ `cn()` ที่มีอยู่แล้วของโปรเจกต์ (clsx + tailwind-merge)
 * แทน `cx()` ที่โค้ดต้นฉบับ reimplement เอง
 *
 * โทนสี/รัศมีขอบ/ไอคอน อิงตาม convention ที่ใช้อยู่แล้วใน src/app/(admin)/tax/page.tsx (glass-card,
 * badge โปร่งแสง, ตัวเลขหัวข้อไล่สี, ไอคอน lucide-react แทน emoji) ไม่ใช่ของที่ port มาจากแอป Electron ตรงๆ
 */

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
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
    return <span className={cx('text-slate-400 dark:text-slate-500', className)}>—</span>;
  }
  return (
    <span className={cx('tabular-nums', className)}>
      {sign && <span className="mr-0.5 text-slate-500">฿</span>}
      {baht(v, decimals)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

/** สีของ blob เบลอตกแต่งมุมการ์ด (Card prop `glow`) — ใช้โทนเดียวกับ BADGE_TONE เพื่อให้จับคู่กับหัวข้อ/ไอคอนได้ */
const GLOW_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-slate-500/[0.06]',
  bucketA: 'bg-blue-500/[0.06]',
  bucketB: 'bg-teal-500/[0.06]',
  success: 'bg-emerald-500/[0.06]',
  danger: 'bg-red-500/[0.06]',
  warning: 'bg-amber-500/[0.06]',
  info: 'bg-indigo-500/[0.06]',
};

export function Card({
  children,
  className,
  bare = false,
  glow,
}: {
  children: ReactNode;
  className?: string;
  /** ไม่ใส่กรอบ/เงา/glass ของตัวเอง — ใช้เมื่อฝังเป็นส่วนหนึ่งของการ์ดใหญ่ที่ครอบไว้แล้ว (กันการ์ดซ้อนการ์ด) */
  bare?: boolean;
  /** blob เบลอตกแต่งมุมขวาบนของการ์ด (ดู "แหล่งข้อมูลรายได้ภาษี" ใน tax/page.tsx) — ไม่ระบุ = ไม่มี */
  glow?: BadgeTone;
}) {
  if (bare) {
    return <div className={className}>{children}</div>;
  }
  return (
    <section
      className={cx(
        'glass-card relative overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm',
        'transition-all duration-300 hover:shadow-md dark:border-slate-900/60',
        className,
      )}
    >
      {glow && (
        <div
          aria-hidden
          className={cx(
            'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl',
            GLOW_TONE[glow],
          )}
        />
      )}
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  iconTone = 'bucketA',
  bare = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** ไอคอนในกล่องสีเหลี่ยมมุมโค้งหน้าหัวข้อ (ดู "แหล่งข้อมูลรายได้ภาษี" ใน tax/page.tsx) — ไม่ระบุ = ไม่มี */
  icon?: ReactNode;
  iconTone?: BadgeTone;
  /** ไม่มี padding แนวนอน/เส้นขอบของตัวเอง — ใช้เมื่อฝังใน Card ที่ bare (การ์ดใหญ่ครอบไว้แล้วมีเส้นแบ่งของตัวเอง) */
  bare?: boolean;
}) {
  return (
    <div
      className={cx(
        'relative flex flex-wrap items-center gap-3',
        bare ? 'py-1' : 'border-b border-slate-100 px-5 py-4 dark:border-slate-900',
      )}
    >
      {icon && (
        <div className={cx('rounded-xl p-2 shadow-inner', ICON_BOX_TONE[iconTone])}>{icon}</div>
      )}
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        )}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({
  children,
  flush = false,
  bare = false,
  className,
}: {
  children: ReactNode;
  /** ไม่มี padding — ใช้เวลาใส่ตารางเต็มความกว้าง */
  flush?: boolean;
  /** ไม่มี padding แนวนอนของตัวเอง — ใช้เมื่อฝังใน Card ที่ bare (คงแค่ padding แนวตั้งไว้จัดระยะห่างภายใน) */
  bare?: boolean;
  className?: string;
}) {
  return <div className={cx(flush || bare ? '' : 'p-5', bare && 'px-0 py-2', className)}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs dark:border-slate-900 dark:bg-slate-950/40">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Switch
 * ------------------------------------------------------------------ */

/**
 * ปุ่ม toggle มาตรฐาน — ใช้ pattern `inline-flex items-center` + knob เลื่อนด้วย translate-x ค่าคงที่
 * (ไม่ใช่ absolute + คำนวณ px เอง) ตาม Tailwind UI Switch ทั่วไป กันบั๊กลูกกลมเลื่อนไม่สุดขอบ/ไม่ตรงกับ
 * สถานะสีพื้นหลัง เวลาที่ track ถูก class อื่นมาบีบ/ยืดความกว้างโดยไม่ได้ตั้งใจ
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** aria-label — จำเป็นเพราะปุ่มนี้ไม่มีข้อความในตัว */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700',
      )}
    >
      <span
        className={cx(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Badge
 * ------------------------------------------------------------------ */

export type BadgeTone = 'neutral' | 'bucketA' | 'bucketB' | 'success' | 'danger' | 'warning' | 'info';

/** โทนโปร่งแสง + กรอบบางสีเดียวกัน — ให้เหมือนแท็ก/ป้ายที่ใช้อยู่แล้วทั่วหน้า ภ.ง.ด./VAT */
const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-slate-500/[0.08] text-slate-600 border border-slate-500/10 dark:bg-slate-500/[0.15] dark:text-slate-300',
  bucketA: 'bg-blue-500/[0.08] text-blue-600 border border-blue-500/10 dark:bg-blue-500/[0.15] dark:text-blue-400',
  bucketB: 'bg-teal-500/[0.08] text-teal-600 border border-teal-500/10 dark:bg-teal-500/[0.15] dark:text-teal-400',
  success: 'bg-emerald-500/[0.08] text-emerald-600 border border-emerald-500/10 dark:bg-emerald-500/[0.15] dark:text-emerald-400',
  danger: 'bg-red-500/[0.08] text-red-600 border border-red-500/10 dark:bg-red-500/[0.15] dark:text-red-400',
  warning: 'bg-amber-500/[0.08] text-amber-600 border border-amber-500/10 dark:bg-amber-500/[0.15] dark:text-amber-400',
  info: 'bg-indigo-500/[0.08] text-indigo-600 border border-indigo-500/10 dark:bg-indigo-500/[0.15] dark:text-indigo-400',
};

/** กล่องไอคอนหน้าหัวข้อการ์ด (CardHeader prop `icon`) — ดู "แหล่งข้อมูลรายได้ภาษี" ใน tax/page.tsx */
const ICON_BOX_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400',
  bucketA: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
  bucketB: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400',
  danger: 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
  info: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400',
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
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold tracking-wide',
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
  bucketA: 'border-l-blue-500',
  bucketB: 'border-l-teal-500',
  info: 'border-l-indigo-500',
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
        'glass-card flex min-w-0 flex-col gap-0.5 rounded-2xl border border-l-[3px] border-slate-200/80 p-4 shadow-sm',
        'dark:border-slate-900/60',
        ACCENT[accent],
      )}
    >
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        className={cx(
          'break-all text-2xl font-black leading-tight tabular-nums',
          valueTone === 'pay' && 'text-red-600 dark:text-red-400',
          valueTone === 'refund' && 'text-emerald-600 dark:text-emerald-400',
          !valueTone && 'text-blue-600 dark:text-blue-400',
        )}
      >
        <span className="mr-0.5 text-sm font-bold text-slate-400">฿</span>
        {baht(value, decimals)}
      </div>
      {note && <div className="text-xs text-slate-500 dark:text-slate-400">{note}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Alert
 * ------------------------------------------------------------------ */

type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ALERT_STYLE: Record<AlertTone, { wrap: string; iconBox: string; title: string; body: string; Icon: typeof Info }> = {
  info: {
    wrap: 'border-indigo-500/20 bg-indigo-500/[0.06] dark:border-indigo-500/30 dark:bg-indigo-500/[0.08]',
    iconBox: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
    title: 'text-indigo-800 dark:text-indigo-300',
    body: 'text-indigo-950/70 dark:text-indigo-100/80',
    Icon: Info,
  },
  success: {
    wrap: 'border-emerald-500/20 bg-emerald-500/[0.06] dark:border-emerald-500/30 dark:bg-emerald-500/[0.08]',
    iconBox: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    title: 'text-emerald-800 dark:text-emerald-300',
    body: 'text-emerald-950/70 dark:text-emerald-100/80',
    Icon: CheckCircle2,
  },
  warning: {
    wrap: 'border-amber-500/20 bg-amber-500/[0.06] dark:border-amber-500/30 dark:bg-amber-500/[0.08]',
    iconBox: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    title: 'text-amber-800 dark:text-amber-300',
    body: 'text-amber-950/70 dark:text-amber-100/80',
    Icon: AlertTriangle,
  },
  danger: {
    wrap: 'border-red-500/20 bg-red-500/[0.06] dark:border-red-500/30 dark:bg-red-500/[0.08]',
    iconBox: 'bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400',
    title: 'text-red-800 dark:text-red-300',
    body: 'text-red-950/70 dark:text-red-100/80',
    Icon: ShieldAlert,
  },
};

export function Alert({
  tone = 'info',
  icon,
  title,
  children,
  actions,
}: {
  tone?: AlertTone;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const s = ALERT_STYLE[tone];
  const DefaultIcon = s.Icon;
  return (
    <div className={cx('mb-4 flex items-start gap-3 rounded-2xl border p-4 text-sm shadow-sm', s.wrap)}>
      <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-inner', s.iconBox)}>
        {icon ?? <DefaultIcon className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        {title && <div className={cx('font-bold', s.title)}>{title}</div>}
        <div className={s.body}>{children}</div>
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
    <div className="my-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
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
      <div className="mt-2 flex items-baseline gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="min-w-0 flex-1 font-bold text-slate-900 dark:text-slate-100">
          {label}
          {sub && <div className="text-xs font-normal text-slate-500">{sub}</div>}
        </div>
        <div
          className={cx(
            'whitespace-nowrap text-xl font-bold tabular-nums',
            tone === 'pay' && 'text-red-600 dark:text-red-400',
            tone === 'refund' && 'text-emerald-600 dark:text-emerald-400',
            !tone && 'text-slate-900 dark:text-slate-100',
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
          ? 'mt-0.5 border-t border-slate-300 font-semibold dark:border-slate-700'
          : 'border-b border-dashed border-slate-200 last:border-b-0 dark:border-slate-800',
      )}
    >
      <div
        className={cx(
          'min-w-0 flex-1',
          indent && 'pl-4',
          subtotal
            ? 'font-semibold text-slate-900 dark:text-slate-100'
            : 'text-slate-600 dark:text-slate-300',
        )}
      >
        {label}
        {sub && <div className="text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
      </div>
      <div
        className={cx(
          'whitespace-nowrap font-semibold tabular-nums',
          minus ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100',
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
  th: 'whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400',
  thNum:
    'whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400',
  td: 'border-b border-slate-200 px-4 py-2 align-middle dark:border-slate-800',
  tdNum:
    'whitespace-nowrap border-b border-slate-200 px-4 py-2 text-right align-middle tabular-nums dark:border-slate-800',
  tfootTd:
    'border-t-2 border-slate-300 bg-slate-50 px-4 py-2.5 font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-900/60',
  row: 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
};

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mb-3 flex justify-center text-slate-300 dark:text-slate-600">
        {icon ?? <Info className="h-8 w-8" />}
      </div>
      <div className="font-semibold text-slate-600 dark:text-slate-300">{title}</div>
      {description && (
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</div>
      )}
    </div>
  );
}

/** ข้อความอธิบายเล็กๆ มีเส้นนำหน้า */
export function HelpNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 border-l-2 border-slate-300 pl-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {children}
    </div>
  );
}

export { cx };
