'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCheck,
  Info,
  Languages,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  PartyPopper,
  Search,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger, UserAvatar } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/shared/status-badge';
import { ROLE_LABELS, useAuth } from '@/lib/auth';
import { LOCALES, t, useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { cn, formatDate, formatDateTime, fullName } from '@/lib/utils';
import type { Notification } from '@/types';
import { enumLabel } from '@/lib/labels';

interface SearchResults {
  students: {
    id: number;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    photo: string | null;
    status: string;
    currentClass: { name: string } | null;
  }[];
  books: {
    id: number;
    title: string;
    author: string | null;
    availableCopies: number;
  }[];
  items: {
    id: number;
    name: string;
    sku: string;
    quantity: number;
    unit: string;
  }[];
  activities: { id: number; title: string; date: string; category: string }[];
}

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  // Ctrl/Cmd + K focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchResults>('/search', { q: debounced }),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    router.push(href);
  };
  const total = data ? data.students.length + data.books.length + data.items.length + data.activities.length : 0;

  return (
    <Popover open={open && debounced.length >= 2} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative w-full max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={t('Search students, books, items…')}
            className="h-10 rounded-full border-transparent bg-muted pl-9 pr-14 shadow-none focus-visible:bg-card"
            aria-label={t('Search')}
            role="combobox"
            aria-expanded={open}
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground md:block">
            {t('Ctrl K')}
          </kbd>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-[min(92vw,28rem)] p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        {isFetching && !data && <p className="p-3 text-sm text-muted-foreground">{t('Searching…')}</p>}
        {data && total === 0 && (
          <p className="p-3 text-sm text-muted-foreground">{t('No matches for “{debounced}”.', { debounced })}</p>
        )}
        {data && total > 0 && (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {data.students.length > 0 && (
              <Section title={t('Students')}>
                {data.students.map((s) => (
                  <ResultRow key={s.id} onClick={() => go(`/students/${s.id}`)}>
                    <UserAvatar src={s.photo} name={fullName(s)} size="xs" />
                    <span className="flex-1 truncate font-medium">{fullName(s)}</span>
                    <span className="text-xs text-muted-foreground">{s.currentClass?.name ?? s.admissionNumber}</span>
                  </ResultRow>
                ))}
              </Section>
            )}
            {data.books.length > 0 && (
              <Section title={t('Library')}>
                {data.books.map((b) => (
                  <ResultRow key={b.id} onClick={() => go(`/library/books/${b.id}`)}>
                    <BookOpen className="h-4 w-4 text-coral" aria-hidden />
                    <span className="flex-1 truncate font-medium">{b.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('{availableCopies} available', { availableCopies: b.availableCopies })}
                    </span>
                  </ResultRow>
                ))}
              </Section>
            )}
            {data.items.length > 0 && (
              <Section title={t('Inventory')}>
                {data.items.map((i) => (
                  <ResultRow key={i.id} onClick={() => go(`/inventory/items/${i.id}`)}>
                    <Package className="h-4 w-4 text-royal" aria-hidden />
                    <span className="flex-1 truncate font-medium">{i.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {i.quantity} {enumLabel(i.unit)}
                    </span>
                  </ResultRow>
                ))}
              </Section>
            )}
            {data.activities.length > 0 && (
              <Section title={t('Activities')}>
                {data.activities.map((a) => (
                  <ResultRow key={a.id} onClick={() => go(`/activities/${a.id}`)}>
                    <PartyPopper className="h-4 w-4 text-sunny-700" aria-hidden />
                    <span className="flex-1 truncate font-medium">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(a.date)}</span>
                  </ResultRow>
                ))}
              </Section>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-1 pt-1 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ResultRow({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent"
    >
      {children}
    </button>
  );
}

const NOTIF_ICONS: Record<string, { icon: typeof Info; cls: string }> = {
  LOW_STOCK: {
    icon: Package,
    cls: 'bg-sunny/20 text-sunny-700 dark:text-sunny',
  },
  EXPIRY: {
    icon: AlertTriangle,
    cls: 'bg-coral/15 text-coral-700 dark:text-coral',
  },
  OVERDUE: { icon: CalendarClock, cls: 'bg-red-500/10 text-red-600' },
  INFO: { icon: Info, cls: 'bg-royal/10 text-royal' },
  SYSTEM: { icon: Info, cls: 'bg-lavender/15 text-lavender-700' },
};

function NotificationsBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: count } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.list<Notification>('/notifications', { pageSize: 15 }),
    enabled: open,
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: ['notifications-count'] });
  };
  const readOne = useMutation({
    mutationFn: (id: number) => api.patch(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const readAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: invalidate,
  });
  const unread = count?.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={unread ? t('Notifications, {count} unread', { count: unread }) : t('Notifications')}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="tabular absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white ring-2 ring-card">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,24rem)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-heading font-bold">{t('Notifications')}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => readAll.mutate()}
            disabled={!unread}
            loading={readAll.isPending}
          >
            <CheckCheck aria-hidden /> {t('Mark all read')}
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">{t('Loading…')}</p>}
          {data?.data.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 opacity-40" aria-hidden />
              {t("You're all caught up!")}
            </div>
          )}
          {data?.data.map((n) => {
            const meta = NOTIF_ICONS[n.type] ?? NOTIF_ICONS.INFO;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.isRead) readOne.mutate(n.id);
                  if (n.link) {
                    setOpen(false);
                    router.push(n.link);
                  }
                }}
                className={cn(
                  'flex w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-accent',
                  !n.isRead && 'bg-primary/5',
                )}
              >
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', meta.cls)}>
                  <meta.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{n.title}</span>
                    {!n.isRead && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={t('Unread')} />
                    )}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{n.message}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground/80">{formatDateTime(n.createdAt)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={t('Change theme')}>
          {mounted && theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTheme('light')}>
          <Sun aria-hidden /> {t('Light')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('dark')}>
          <Moon aria-hidden /> {t('Dark')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('system')}>
          <Monitor aria-hidden /> {t('System')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LanguageMenu() {
  const { locale, setLocale } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="hidden rounded-full sm:inline-flex" aria-label={t('Language')}>
          <Languages className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => setLocale(l.code)}
            className={cn(locale === l.code && 'font-bold text-primary')}
          >
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout, can } = useAuth();
  return (
    <header
      data-topbar
      className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6"
    >
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label={t('Open menu')}>
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex flex-1 items-center">{can('admin.area') && <GlobalSearch />}</div>
      <div className="flex items-center gap-1">
        <LanguageMenu />
        <ThemeToggle />
        <NotificationsBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-1 flex items-center gap-2 rounded-full p-0.5 pr-2 transition hover:bg-accent"
              aria-label={t('Account menu')}
            >
              <UserAvatar src={user?.avatar} name={user ? fullName(user) : '?'} size="sm" />
              <span className="hidden text-left md:block">
                <span className="block text-sm font-semibold leading-tight">{user ? fullName(user) : '…'}</span>
                <span className="block text-[11px] text-muted-foreground">{user && t(ROLE_LABELS[user.role])}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-semibold text-foreground">{user && fullName(user)}</p>
              <p className="truncate text-xs">{user?.email}</p>
              {user && <StatusBadge status={user.role} label={t(ROLE_LABELS[user.role])} className="mt-2" />}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserIcon aria-hidden /> {t('My profile')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void logout()}>
              <LogOut aria-hidden /> {t('Sign out')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
