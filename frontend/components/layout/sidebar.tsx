'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  ChevronsLeft,
  GraduationCap,
  Library,
  LayoutDashboard,
  NotebookPen,
  type LucideIcon,
  Package,
  PartyPopper,
  School,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
} from 'lucide-react';
import { Tip } from '@/components/ui/misc';
import { useAuth, type Permission } from '@/lib/auth';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

type Tone = 'royal' | 'coral' | 'lavender' | 'mint' | 'sunny' | 'slate';

/** Icon chips: a light tint on the dark menu, the full colour inside the white "selected" pill. */
const CHIP_ON_DARK: Record<Tone, string> = {
  royal: 'bg-[#8EA0FF]/20 text-[#C9D2FF]',
  coral: 'bg-coral/25 text-[#FFC9C2]',
  lavender: 'bg-lavender/25 text-[#E0DAFF]',
  mint: 'bg-mint/20 text-[#A6F0CF]',
  sunny: 'bg-sunny/20 text-[#FFE39A]',
  slate: 'bg-white/10 text-slate-200',
};
const CHIP_ACTIVE: Record<Tone, string> = {
  royal: 'bg-royal/10 text-royal',
  coral: 'bg-coral/15 text-coral-700',
  lavender: 'bg-lavender/15 text-lavender-700',
  mint: 'bg-mint/15 text-mint-700',
  sunny: 'bg-sunny/25 text-sunny-700',
  slate: 'bg-slate-500/10 text-slate-600',
};

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  permission?: Permission;
  badge?: 'lowStock' | 'overdue';
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    get title() {
      return t('Overview');
    },
    items: [
      {
        href: '/dashboard',
        get label() {
          return t('Dashboard');
        },
        icon: LayoutDashboard,
        tone: 'royal',
        permission: 'admin.area',
      },
      {
        href: '/my-classes',
        get label() {
          return t('My classes');
        },
        icon: School,
        tone: 'lavender',
        permission: 'myClasses.view',
      },
    ],
  },
  {
    get title() {
      return t('People & classes');
    },
    items: [
      {
        href: '/students',
        get label() {
          return t('Students');
        },
        icon: Users,
        tone: 'coral',
        permission: 'admin.area',
      },
      {
        href: '/classes',
        get label() {
          return t('Classes');
        },
        icon: School,
        tone: 'lavender',
        permission: 'admin.area',
      },
      {
        href: '/teachers',
        get label() {
          return t('Teachers');
        },
        icon: GraduationCap,
        tone: 'royal',
        permission: 'teachers.manage',
      },
      {
        href: '/courses',
        get label() {
          return t('Courses');
        },
        icon: Library,
        tone: 'sunny',
        permission: 'courses.manage',
      },
      {
        href: '/attendance',
        get label() {
          return t('Attendance');
        },
        icon: CalendarCheck,
        tone: 'mint',
      },
      {
        href: '/marks',
        get label() {
          return t('Marks');
        },
        icon: NotebookPen,
        tone: 'coral',
      },
    ],
  },
  {
    get title() {
      return t('School life');
    },
    items: [
      {
        href: '/activities',
        get label() {
          return t('Activities');
        },
        icon: PartyPopper,
        tone: 'sunny',
        permission: 'admin.area',
      },
    ],
  },
  {
    get title() {
      return t('Resources');
    },
    items: [
      {
        href: '/inventory',
        get label() {
          return t('Inventory');
        },
        icon: Package,
        tone: 'royal',
        badge: 'lowStock',
        permission: 'admin.area',
      },
      {
        href: '/library',
        get label() {
          return t('Library');
        },
        icon: BookOpen,
        tone: 'coral',
        badge: 'overdue',
        permission: 'admin.area',
      },
    ],
  },
  {
    get title() {
      return t('Insights');
    },
    items: [
      {
        href: '/reports',
        get label() {
          return t('Reports');
        },
        icon: BarChart3,
        tone: 'mint',
        permission: 'admin.area',
      },
    ],
  },
  {
    get title() {
      return t('Administration');
    },
    items: [
      {
        href: '/users',
        get label() {
          return t('Users');
        },
        icon: UserCog,
        tone: 'lavender',
        permission: 'users.manage',
      },
      {
        href: '/settings',
        get label() {
          return t('Settings');
        },
        icon: Settings,
        tone: 'slate',
        permission: 'settings.manage',
      },
      {
        href: '/audit-logs',
        get label() {
          return t('Audit logs');
        },
        icon: ShieldCheck,
        tone: 'royal',
        permission: 'audit.view',
      },
    ],
  },
];

interface Badges {
  lowStock: number;
  overdue: number;
}

function useBadges(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['nav-badges'],
    queryFn: async (): Promise<Badges> => {
      const d = await api.get<{
        kpis: { lowStockItems: number; overdueLoans: number };
      }>('/dashboard');
      return { lowStock: d.kpis.lowStockItems, overdue: d.kpis.overdueLoans };
    },
    staleTime: 120_000,
  });
}

export function SidebarContent({
  collapsed = false,
  onNavigate,
  onToggle,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggle?: () => void;
}) {
  const pathname = usePathname();
  const { can } = useAuth();
  const { data: badges } = useBadges(can('admin.area'));
  const { data: school } = useQuery({
    queryKey: ['settings-public'],
    queryFn: () => api.get<{ name: string; logo: string | null; motto: string | null }>('/settings/public'),
    staleTime: 10 * 60_000,
  });

  return (
    <div className="sidebar-surface flex h-full flex-col text-white">
      {/* Stars drifting slowly upward behind the menu (still for reduced motion) */}
      <div className="star-marquee" aria-hidden>
        <div className="star-layer star-layer-far" />
        <div className="star-layer star-layer-near" />
      </div>
      <div
        className={cn('flex h-16 items-center gap-3 border-b border-white/10 px-4', collapsed && 'justify-center px-2')}
      >
        <Link
          href={can('admin.area') ? '/dashboard' : '/my-classes'}
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:ring-white focus-visible:ring-offset-0"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/15 text-sunny shadow-sm ring-1 ring-white/25">
            {school?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <Sparkles className="h-5 w-5" aria-hidden />
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-heading text-sm font-extrabold leading-tight text-white">
                {school?.name ?? t('School')}
              </p>
              <p className="truncate font-heading text-[11.5px] font-bold text-white/60">{t('Management System')}</p>
            </div>
          )}
        </Link>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label={t('Main')}>
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => !i.permission || can(i.permission));
          if (!items.length) return null;
          return (
            <div key={g.title}>
              {!collapsed && (
                <p className="mb-1.5 px-3 font-heading text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-white/55">
                  {t(g.title)}
                </p>
              )}
              <ul className="space-y-1">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const count = item.badge ? badges?.[item.badge] : 0;
                  const link = (
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-2.5 py-2 font-heading text-[15px] font-bold tracking-[-0.005em] transition-colors focus-visible:ring-white focus-visible:ring-offset-0',
                        active
                          ? 'bg-white text-slate-900 shadow-lg shadow-black/15 dark:bg-white/15 dark:text-white dark:shadow-none'
                          : 'text-white/80 hover:bg-white/10 hover:text-white',
                        collapsed && 'justify-center px-2',
                      )}
                    >
                      {active && (
                        <span
                          className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-sunny"
                          aria-hidden
                        />
                      )}
                      <span
                        className={cn(
                          'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-105',
                          active
                            ? cn(CHIP_ACTIVE[item.tone], 'dark:bg-white/15 dark:text-white')
                            : CHIP_ON_DARK[item.tone],
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      {!collapsed && <span className="flex-1 truncate">{t(item.label)}</span>}
                      {!!count && (
                        <span
                          className={cn(
                            'tabular rounded-full bg-coral px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm',
                            collapsed && 'absolute right-1 top-1',
                          )}
                          aria-label={t('{count} alerts', { count })}
                        >
                          {count}
                        </span>
                      )}
                    </Link>
                  );
                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tip content={t(item.label)} side="right">
                          {link}
                        </Tip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {onToggle && (
        <div className="border-t border-white/10 p-3">
          <button
            onClick={onToggle}
            className={cn(
              'flex w-full items-center gap-2 rounded-xl px-3 py-2 font-heading text-[13px] font-bold text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-white focus-visible:ring-offset-0',
              collapsed && 'justify-center',
            )}
            aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          >
            <ChevronsLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} aria-hidden />
            {!collapsed && t('Collapse')}
          </button>
        </div>
      )}
    </div>
  );
}
