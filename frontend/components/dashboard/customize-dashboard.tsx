'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  LayoutGrid,
  ListChecks,
  PackageSearch,
  PartyPopper,
  SlidersHorizontal,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/misc';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User } from '@/types';
import { msg, t } from '@/lib/i18n';

export interface WidgetDef {
  key: string;
  label: string;
  description: string;
  group: 'Shortcuts' | 'Key numbers' | 'Charts' | 'Lists';
  icon: LucideIcon;
}

/** Everything that can appear on the dashboard. Keys must match the backend allow-list. */
export const WIDGETS: WidgetDef[] = [
  {
    key: 'quickActions',
    get label() {
      return t('Quick actions');
    },
    get description() {
      return t('Buttons to register, take attendance, issue books…');
    },
    group: 'Shortcuts',
    icon: Zap,
  },
  {
    key: 'alerts',
    get label() {
      return t('Alert banners');
    },
    get description() {
      return t('Low stock, expiring items and overdue books');
    },
    group: 'Shortcuts',
    icon: AlertTriangle,
  },
  {
    key: 'kpi.students',
    get label() {
      return t('Total students');
    },
    get description() {
      return t('Active students by nursery / primary');
    },
    group: 'Key numbers',
    icon: Users,
  },
  {
    key: 'kpi.attendance',
    get label() {
      return t('Attendance today');
    },
    get description() {
      return t("Today's rate, present and absent");
    },
    group: 'Key numbers',
    icon: CalendarCheck,
  },
  {
    key: 'kpi.activities',
    get label() {
      return t('Upcoming activities');
    },
    get description() {
      return t('Planned or ongoing activities');
    },
    group: 'Key numbers',
    icon: PartyPopper,
  },
  {
    key: 'kpi.library',
    get label() {
      return t('Books on loan');
    },
    get description() {
      return t('Borrowed and overdue books');
    },
    group: 'Key numbers',
    icon: BookOpen,
  },
  {
    key: 'chart.attendanceTrend',
    get label() {
      return t('Attendance trend');
    },
    get description() {
      return t('Daily rate over the last 30 days');
    },
    group: 'Charts',
    icon: BarChart3,
  },
  {
    key: 'chart.gender',
    get label() {
      return t('Boys & girls');
    },
    get description() {
      return t('Gender split of active students');
    },
    group: 'Charts',
    icon: Users,
  },
  {
    key: 'chart.studentsPerClass',
    get label() {
      return t('Students per class');
    },
    get description() {
      return t('Enrolment against capacity');
    },
    group: 'Charts',
    icon: BarChart3,
  },
  {
    key: 'chart.stock',
    get label() {
      return t('Stock movement');
    },
    get description() {
      return t('Value of stock in and out per month');
    },
    group: 'Charts',
    icon: BarChart3,
  },
  {
    key: 'chart.loans',
    get label() {
      return t('Library loans');
    },
    get description() {
      return t('Books issued and returned per month');
    },
    group: 'Charts',
    icon: BarChart3,
  },
  {
    key: 'list.absentees',
    get label() {
      return t("Today's absentees");
    },
    get description() {
      return t('Children absent, sick or excused today');
    },
    group: 'Lists',
    icon: ClipboardList,
  },
  {
    key: 'list.upcoming',
    get label() {
      return t('Upcoming activities');
    },
    get description() {
      return t('Next five activities');
    },
    group: 'Lists',
    icon: PartyPopper,
  },
  {
    key: 'list.registrations',
    get label() {
      return t('Recent registrations');
    },
    get description() {
      return t('Latest students registered');
    },
    group: 'Lists',
    icon: UserPlus,
  },
  {
    key: 'list.lowStock',
    get label() {
      return t('Low-stock alerts');
    },
    get description() {
      return t('Items at or below reorder level');
    },
    group: 'Lists',
    icon: PackageSearch,
  },
  {
    key: 'list.overdue',
    get label() {
      return t('Overdue books');
    },
    get description() {
      return t('Loans past their due date');
    },
    group: 'Lists',
    icon: CalendarClock,
  },
];

const ALL_KEYS = WIDGETS.map((w) => w.key);
const GROUPS = [msg('Shortcuts'), msg('Key numbers'), msg('Charts'), msg('Lists')] as const;

/** Which dashboard widgets the signed-in user tracks. `null` in the account means "show everything". */
export function useDashboardWidgets() {
  const { user } = useAuth();
  const selected = user?.dashboardWidgets ?? null;
  return {
    selected,
    isCustomized: selected !== null,
    show: (key: string) => selected === null || selected.includes(key),
    visibleCount: selected === null ? ALL_KEYS.length : selected.length,
  };
}

export function CustomizeDashboardButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { isCustomized, visibleCount } = useDashboardWidgets();
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn('border-white/40 bg-white/15 text-white hover:bg-white/25 hover:text-white', className)}
      >
        <SlidersHorizontal aria-hidden /> {t('Customize')}
        {isCustomized && (
          <span className="tabular rounded-full bg-white/25 px-1.5 text-[11px]">
            {visibleCount}/{ALL_KEYS.length}
          </span>
        )}
      </Button>
      <CustomizeDashboardDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function CustomizeDashboardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { selected } = useDashboardWidgets();
  const [draft, setDraft] = useState<Set<string>>(new Set(ALL_KEYS));

  useEffect(() => {
    if (open) setDraft(new Set(selected ?? ALL_KEYS));
  }, [open, selected]);

  const save = useMutation({
    mutationFn: (keys: string[] | null) => api.put<User>('/auth/preferences', { dashboardWidgets: keys }),
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      toast.success(t('Dashboard updated'));
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const toggle = (key: string) =>
    setDraft((d) => {
      const n = new Set(d);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const setGroup = (group: string, on: boolean) =>
    setDraft((d) => {
      const n = new Set(d);
      WIDGETS.filter((w) => w.group === group).forEach((w) => (on ? n.add(w.key) : n.delete(w.key)));
      return n;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" aria-hidden /> {t('Customize your dashboard')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Choose only what you want to track. This is saved to your account, so each staff member has their own dashboard.',
            )}
          </DialogDescription>
        </DialogHeader>

        {/* The list scrolls so the save buttons stay visible on small screens. */}
        <div className="-mx-1 grid max-h-[58vh] grid-cols-1 gap-5 overflow-y-auto px-1 md:grid-cols-2">
          {GROUPS.map((g) => {
            const items = WIDGETS.filter((w) => w.group === g);
            const on = items.filter((w) => draft.has(w.key)).length;
            const headingId = `group-${g.replace(/\s+/g, '-')}`;
            return (
              <div key={g} role="group" aria-labelledby={headingId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p
                    id={headingId}
                    className="font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {t(g)}{' '}
                    <span className="tabular font-semibold normal-case tracking-normal">
                      ({on}/{items.length})
                    </span>
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline"
                    onClick={() => setGroup(g, on < items.length)}
                  >
                    {on < items.length ? t('Select all') : t('Clear')}
                  </button>
                </div>
                {items.map((w) => {
                  const checked = draft.has(w.key);
                  return (
                    <label
                      key={w.key}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition',
                        checked ? 'border-primary/40 bg-primary/5' : 'hover:bg-accent',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(w.key)}
                        aria-describedby={`w-${w.key}`}
                      />
                      <span
                        className={cn(
                          'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                          checked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <w.icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{w.label}</span>
                        <span id={`w-${w.key}`} className="block truncate text-xs text-muted-foreground">
                          {w.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(new Set(ALL_KEYS))}>
              <ListChecks aria-hidden /> {t('Select all')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDraft(new Set())}>
              {t('Clear all')}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save.mutate(null)} disabled={save.isPending}>
              {t('Reset to default')}
            </Button>
            <Button
              loading={save.isPending}
              // Keep the registry order so the saved list is stable.
              onClick={() => save.mutate(draft.size === ALL_KEYS.length ? null : ALL_KEYS.filter((k) => draft.has(k)))}
            >
              {t('Save ({size} selected)', { size: draft.size })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
