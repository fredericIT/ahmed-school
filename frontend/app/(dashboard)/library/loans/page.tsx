'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookMarked, BookOpen, MoreHorizontal, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/misc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ExportMenu } from '@/components/shared/export-menu';
import { DataTable, type Column } from '@/components/tables/data-table';
import { SearchInput } from '@/components/forms/search-input';
import { FilterSelect } from '@/components/forms/field';
import { IssueDialog, LibraryNav, ReturnDialog } from '@/components/forms/library-dialogs';
import { useListParams } from '@/hooks/use-list-params';
import { useClasses, useCurrency } from '@/hooks/use-lookups';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDate, formatMoney, fullName } from '@/lib/utils';
import type { Loan } from '@/types';
import { t } from '@/lib/i18n';

const FILTERS = ['status', 'classId', 'from', 'to'] as const;
const STATUS_TABS = [
  {
    value: 'ACTIVE',
    get label() {
      return t('On loan');
    },
  },
  {
    value: 'OVERDUE',
    get label() {
      return t('Overdue');
    },
  },
  {
    value: 'RETURNED',
    get label() {
      return t('Returned');
    },
  },
  {
    value: 'LOST',
    get label() {
      return t('Lost');
    },
  },
  {
    value: 'ALL',
    get label() {
      return t('All');
    },
  },
];

function LoansInner() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const currency = useCurrency();
  const list = useListParams(FILTERS, {
    sortBy: 'issuedAt',
    sortOrder: 'desc',
  });
  const { data: classes } = useClasses();
  const status = list.filters.status ?? 'ACTIVE';
  const query = {
    ...list.query,
    status: status === 'ALL' ? undefined : status,
  };
  const [issueOpen, setIssueOpen] = useState(false);
  const [target, setTarget] = useState<{
    loan: Loan;
    mode: 'return' | 'lost';
  } | null>(null);
  useEffect(() => {
    if (sp.get('issue')) setIssueOpen(true);
  }, [sp]);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['loans', query],
    queryFn: () => api.list<Loan>('/library/loans', query),
    placeholderData: (p) => p,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['loans'] });
    void qc.invalidateQueries({ queryKey: ['books'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const columns: Column<Loan>[] = [
    {
      key: 'book',
      header: t('Book'),
      fixed: true,
      cell: (l) => (
        <Link href={`/library/books/${l.bookCopy.book.id}`} className="block">
          <span className="font-semibold hover:text-primary">{l.bookCopy.book.title}</span>
          <span className="tabular block font-mono text-xs text-muted-foreground">{l.bookCopy.copyCode}</span>
        </Link>
      ),
    },
    {
      key: 'borrower',
      header: t('Borrower'),
      cell: (l) =>
        l.student ? (
          <Link href={`/students/${l.student.id}`} className="flex items-center gap-2 hover:text-primary">
            <UserAvatar src={l.student.photo} name={fullName(l.student)} size="xs" />
            <span>
              <span className="block text-sm font-medium">{fullName(l.student)}</span>
              <span className="block text-xs text-muted-foreground">{l.student.currentClass?.name}</span>
            </span>
          </Link>
        ) : (
          <span className="text-sm">
            {l.borrowerName} <span className="text-xs text-muted-foreground">{t('(staff)')}</span>
          </span>
        ),
    },
    {
      key: 'issued',
      header: t('Issued'),
      sortKey: 'issuedAt',
      cell: (l) => formatDate(l.issuedAt),
    },
    {
      key: 'due',
      header: t('Due'),
      sortKey: 'dueDate',
      cell: (l) => (
        <span className={cn(l.daysOverdue ? 'font-semibold text-red-600' : '')}>
          {formatDate(l.dueDate)}
          {!!l.daysOverdue && (
            <span className="block text-xs">{t('{daysOverdue} day(s) late', { daysOverdue: l.daysOverdue })}</span>
          )}
        </span>
      ),
    },
    {
      key: 'returned',
      header: t('Returned'),
      sortKey: 'returnedAt',
      hidden: status === 'ACTIVE',
      cell: (l) => formatDate(l.returnedAt),
    },
    {
      key: 'status',
      header: t('Status'),
      cell: (l) => <StatusBadge status={l.status} />,
    },
    {
      key: 'fine',
      header: t('Fine'),
      align: 'right',
      cell: (l) =>
        Number(l.fine) > 0 ? (
          <span className={cn('tabular font-semibold', l.finePaid ? 'text-emerald-600' : 'text-amber-600')}>
            {formatMoney(l.fine, currency)}
            {l.finePaid ? ' ✓' : ''}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('Actions')}</span>,
      fixed: true,
      align: 'right',
      cell: (l) => (
        <div className="flex justify-end gap-1">
          {(l.status === 'BORROWED' || l.status === 'OVERDUE') && (
            <Button size="sm" variant="mint" onClick={() => setTarget({ loan: l, mode: 'return' })}>
              <RotateCcw aria-hidden /> {t('Return')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('More actions')}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(l.status === 'BORROWED' || l.status === 'OVERDUE') && (
                <DropdownMenuItem destructive onSelect={() => setTarget({ loan: l, mode: 'lost' })}>
                  {t('Mark as lost')}
                </DropdownMenuItem>
              )}
              {Number(l.fine) > 0 && (
                <DropdownMenuItem
                  onSelect={async () => {
                    try {
                      await api.patch(`/library/loans/${l.id}/fine`, {
                        finePaid: !l.finePaid,
                      });
                      toast.success(l.finePaid ? t('Fine marked unpaid') : t('Fine marked paid'));
                      refresh();
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  {l.finePaid ? t('Mark fine unpaid') : t('Mark fine paid')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href={`/library/books/${l.bookCopy.book.id}`}>{t('View book')}</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Library loans')}
        description={t('Issue, return and follow up on borrowed books.')}
        icon={<BookOpen />}
        breadcrumbs={[{ label: t('Library'), href: '/library' }, { label: t('Loans') }]}
        actions={
          <>
            <ExportMenu path="/library/loans" query={query} />
            <Button onClick={() => setIssueOpen(true)}>
              <BookMarked aria-hidden /> {t('Issue book')}
            </Button>
          </>
        }
      />
      <LibraryNav />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={t('Loan status')}>
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            role="tab"
            aria-selected={status === tab.value}
            variant={status === tab.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => list.setFilter('status', tab.value === 'ACTIVE' ? undefined : tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <DataTable
        storageKey={`loans-${status}`}
        columns={columns}
        data={data?.data}
        rowKey={(l) => l.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        meta={data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        onSortChange={list.setSort}
        empty={{
          icon: BookOpen,
          title: status === 'OVERDUE' ? t('No overdue books 🎉') : t('No loans here'),
        }}
        toolbar={
          <>
            <SearchInput
              value={list.search}
              onChange={list.setSearch}
              placeholder={t('Student, title or copy code…')}
            />
            <FilterSelect
              value={list.filters.classId}
              onChange={(v) => list.setFilter('classId', v)}
              placeholder={t('Class')}
              allLabel={t('All classes')}
              options={(classes ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
            />
            <Input
              type="date"
              value={list.filters.from ?? ''}
              onChange={(e) => list.setFilter('from', e.target.value || undefined)}
              className="w-40"
              aria-label={t('Issued from')}
            />
            <Input
              type="date"
              value={list.filters.to ?? ''}
              onChange={(e) => list.setFilter('to', e.target.value || undefined)}
              className="w-40"
              aria-label={t('Issued to')}
            />
          </>
        }
      />
      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} onSaved={refresh} />
      <ReturnDialog
        loan={target?.loan ?? null}
        mode={target?.mode ?? 'return'}
        onOpenChange={(o) => !o && setTarget(null)}
        onSaved={refresh}
      />
    </>
  );
}

export default function LoansPage() {
  return (
    <Suspense>
      <LoansInner />
    </Suspense>
  );
}
