import { Badge, type BadgeProps } from '@/components/ui/badge';
import { enumLabel } from '@/lib/labels';

type Variant = NonNullable<BadgeProps['variant']>;

/** One place for status → colour, so every module uses the same visual language. */
const MAP: Record<string, Variant> = {
  // attendance
  PRESENT: 'green',
  ABSENT: 'red',
  LATE: 'amber',
  EXCUSED: 'blue',
  SICK: 'purple',
  // students
  ACTIVE: 'green',
  TRANSFERRED: 'blue',
  GRADUATED: 'purple',
  WITHDRAWN: 'gray',
  // activities
  PLANNED: 'blue',
  ONGOING: 'amber',
  COMPLETED: 'green',
  CANCELLED: 'gray',
  // library
  AVAILABLE: 'green',
  BORROWED: 'blue',
  RETURNED: 'gray',
  OVERDUE: 'red',
  LOST: 'coral',
  DAMAGED: 'amber',
  // stock
  IN: 'green',
  OUT: 'blue',
  ADJUSTMENT: 'purple',
  RETURN: 'default',
  LOW: 'amber',
  EXPIRED: 'red',
  EXPIRING: 'amber',
  OK: 'green',
  NEW: 'green',
  GOOD: 'blue',
  FAIR: 'amber',
  POOR: 'coral',
  // roles / generic
  SUPER_ADMIN: 'purple',
  ADMIN: 'blue',
  INACTIVE: 'gray',
};

const DOT: Partial<Record<Variant, string>> = {
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  blue: 'bg-sky-500',
  purple: 'bg-violet-500',
  gray: 'bg-slate-400',
  coral: 'bg-coral',
  default: 'bg-primary',
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const variant = MAP[status] ?? 'gray';
  return (
    <Badge variant={variant} className={className}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[variant] ?? 'bg-slate-400'}`} aria-hidden />
      {label ?? enumLabel(status)}
    </Badge>
  );
}

export const ATTENDANCE_COLORS: Record<string, string> = {
  PRESENT: '#10b981',
  LATE: '#f59e0b',
  ABSENT: '#ef4444',
  EXCUSED: '#0ea5e9',
  SICK: '#8b5cf6',
};
