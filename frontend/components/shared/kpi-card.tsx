'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/lib/i18n';

const TONES = {
  royal: {
    icon: 'bg-royal text-white',
    ring: 'from-royal/15',
    text: 'text-royal-700 dark:text-royal-100',
  },
  sunny: {
    icon: 'bg-sunny text-slate-900',
    ring: 'from-sunny/25',
    text: 'text-sunny-700 dark:text-sunny',
  },
  coral: {
    icon: 'bg-coral text-white',
    ring: 'from-coral/20',
    text: 'text-coral-700 dark:text-coral',
  },
  mint: {
    icon: 'bg-mint text-slate-900',
    ring: 'from-mint/20',
    text: 'text-mint-700 dark:text-mint',
  },
  lavender: {
    icon: 'bg-lavender text-white',
    ring: 'from-lavender/25',
    text: 'text-lavender-700 dark:text-lavender',
  },
} as const;
export type Tone = keyof typeof TONES;

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'royal',
  href,
  loading,
  index = 0,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  href?: string;
  loading?: boolean;
  index?: number;
}) {
  const palette = TONES[tone];
  const body = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className={cn(
        'group relative h-full overflow-hidden rounded-2xl border bg-card p-5 shadow-soft transition-all',
        href && 'hover:-translate-y-0.5 hover:shadow-lift',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br to-transparent',
          palette.ring,
        )}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[14px] font-bold tracking-[0.005em] text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-20" />
          ) : (
            <p className="tabular mt-1 font-heading text-[2rem] font-extrabold leading-tight tracking-[-0.02em]">
              {value}
            </p>
          )}
          {hint && !loading && <p className={cn('mt-1 text-xs font-semibold', palette.text)}>{hint}</p>}
        </div>
        <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-sm', palette.icon)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </motion.div>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
