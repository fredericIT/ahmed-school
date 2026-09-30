'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpCircle, FileUp, LayoutGrid, List, MoreHorizontal, Phone, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ExportMenu } from '@/components/shared/export-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { DataTable, Pagination, type Column } from '@/components/tables/data-table';
import { SearchInput } from '@/components/forms/search-input';
import { FilterSelect } from '@/components/forms/field';
import { useListParams } from '@/hooks/use-list-params';
import { useClasses } from '@/hooks/use-lookups';
import { api } from '@/lib/api';
import { ageFrom, cn, formatDate, fullName } from '@/lib/utils';
import type { StudentListItem } from '@/types';
import { plural, t } from '@/lib/i18n';

const FILTERS = ['classId', 'level', 'gender', 'status'] as const;

function StudentsList() {
  const router = useRouter();
  const list = useListParams(FILTERS, {
    sortBy: 'firstName',
    sortOrder: 'asc',
  });
  const [view, setView] = useState<'table' | 'cards'>('table');
  const { data: classes } = useClasses();
  const query = { ...list.query, status: list.filters.status ?? 'ACTIVE' };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['students', query],
    queryFn: ({ signal }) => api.list<StudentListItem>('/students', query, signal),
    placeholderData: (prev) => prev,
  });

  const columns: Column<StudentListItem>[] = [
    {
      key: 'name',
      header: t('Student'),
      sortKey: 'firstName',
      fixed: true,
      cell: (s) => (
        <div className="flex items-center gap-3">
          <UserAvatar src={s.photo} name={fullName(s)} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{fullName(s)}</p>
            <p className="text-xs text-muted-foreground">{s.admissionNumber}</p>
          </div>
        </div>
      ),
    },
    { key: 'class', header: t('Class'), cell: (s) => s.currentClass?.name ?? '—' },
    {
      key: 'gender',
      header: t('Gender'),
      cell: (s) => (s.gender === 'MALE' ? t('Boy') : t('Girl')),
    },
    {
      key: 'age',
      header: t('Age'),
      sortKey: 'dateOfBirth',
      cell: (s) => <span className="tabular">{t('{age} yrs', { age: ageFrom(s.dateOfBirth) })}</span>,
    },
    {
      key: 'guardian',
      header: t('Primary guardian'),
      cell: (s) =>
        s.primaryGuardian ? (
          <div className="min-w-0">
            <p className="truncate text-sm">{s.primaryGuardian.fullName}</p>
            <p className="tabular text-xs text-muted-foreground">{s.primaryGuardian.phone}</p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'admitted',
      header: t('Admitted'),
      sortKey: 'admissionDate',
      hidden: true,
      cell: (s) => formatDate(s.admissionDate),
    },
    {
      key: 'status',
      header: t('Status'),
      cell: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('Actions')}</span>,
      fixed: true,
      align: 'right',
      cell: (s) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('Actions for {name}', { name: fullName(s) })}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => router.push(`/students/${s.id}`)}>{t('View profile')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push(`/students/${s.id}/edit`)}>{t('Edit')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void api.openPdf(`/students/${s.id}/id-card`)}>
                {t('Print ID card')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const toolbar = (
    <>
      <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('Name, admission no., guardian…')} />
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
      <FilterSelect
        value={list.filters.level}
        onChange={(v) => list.setFilter('level', v)}
        placeholder={t('Level')}
        allLabel={t('All levels')}
        options={[
          { value: 'NURSERY', label: t('Nursery') },
          { value: 'PRIMARY', label: t('Primary') },
        ]}
        className="sm:w-36"
      />
      <FilterSelect
        value={list.filters.gender}
        onChange={(v) => list.setFilter('gender', v)}
        placeholder={t('Gender')}
        allLabel={t('All genders')}
        options={[
          { value: 'MALE', label: t('Boys') },
          { value: 'FEMALE', label: t('Girls') },
        ]}
        className="sm:w-36"
      />
      <FilterSelect
        value={list.filters.status}
        onChange={(v) => list.setFilter('status', v)}
        placeholder={t('Status')}
        allLabel={t('Active')}
        options={[
          { value: 'ALL', label: t('All statuses') },
          { value: 'TRANSFERRED', label: t('Transferred') },
          { value: 'GRADUATED', label: t('Graduated') },
          { value: 'WITHDRAWN', label: t('Withdrawn') },
        ]}
        className="sm:w-36"
      />
      <div className="ml-auto flex rounded-xl bg-muted p-1" role="group" aria-label={t('View')}>
        {(['table', 'cards'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={cn('rounded-lg p-1.5 text-muted-foreground', view === v && 'bg-card text-foreground shadow-sm')}
            aria-label={v === 'table' ? t('Table view') : t('Card view')}
          >
            {v === 'table' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        title={t('Students')}
        description={
          data
            ? query.status === 'ACTIVE'
              ? plural(data.meta.total, '{count} active student', '{count} active students')
              : plural(data.meta.total, '{count} student', '{count} students')
            : t('All registered children')
        }
        icon={<Users />}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/students/promote">
                <ArrowUpCircle aria-hidden /> {t('Promote')}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/students/import">
                <FileUp aria-hidden /> {t('Import')}
              </Link>
            </Button>
            <ExportMenu path="/students" query={query} />
            <Button asChild>
              <Link href="/students/new">
                <Plus aria-hidden /> {t('Register student')}
              </Link>
            </Button>
          </>
        }
      />

      {view === 'table' ? (
        <DataTable
          storageKey="students"
          columns={columns}
          data={data?.data}
          rowKey={(s) => s.id}
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          meta={data?.meta}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          sortBy={list.sortBy}
          sortOrder={list.sortOrder}
          onSortChange={list.setSort}
          onRowClick={(s) => router.push(`/students/${s.id}`)}
          toolbar={toolbar}
          empty={{
            icon: Users,
            title: list.search ? t('No matching students') : t('No students yet'),
            description: list.search
              ? t('Try a different name or clear the filters.')
              : t('Register your first student to get started.'),
            action: (
              <Button asChild size="sm">
                <Link href="/students/new">{t('Register student')}</Link>
              </Button>
            ),
          }}
        />
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-2 p-3">{toolbar}</Card>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : data?.data.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.data.map((s) => (
                <Link
                  key={s.id}
                  href={`/students/${s.id}`}
                  className="group rounded-2xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <div className="flex items-start justify-between">
                    <UserAvatar src={s.photo} name={fullName(s)} size="lg" />
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-3 truncate font-heading text-lg font-bold group-hover:text-primary">{fullName(s)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('{admissionNumber} · {className} · {age} yrs', {
                      admissionNumber: s.admissionNumber,
                      className: s.currentClass?.name ?? '—',
                      age: ageFrom(s.dateOfBirth),
                    })}
                  </p>
                  {s.primaryGuardian && (
                    <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" aria-hidden /> {s.primaryGuardian.fullName} ·{' '}
                      {s.primaryGuardian.phone}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={Users}
                title={t('No students found')}
                description={t('Try a different search or filter.')}
              />
            </Card>
          )}
          {data && (
            <Card>
              <Pagination meta={data.meta} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

export default function StudentsPage() {
  return (
    <Suspense>
      <StudentsList />
    </Suspense>
  );
}
