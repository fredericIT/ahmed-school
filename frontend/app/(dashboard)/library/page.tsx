'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookMarked, BookOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { ExportMenu } from '@/components/shared/export-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/tables/data-table';
import { SearchInput } from '@/components/forms/search-input';
import { FilterSelect } from '@/components/forms/field';
import { BookDialog, IssueDialog, LibraryNav } from '@/components/forms/library-dialogs';
import { useListParams } from '@/hooks/use-list-params';
import { useBookCategories } from '@/hooks/use-lookups';
import { BookCover } from '@/components/shared/book-cover';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Book } from '@/types';
import { t } from '@/lib/i18n';

const FILTERS = ['categoryId', 'language', 'available'] as const;
function CatalogueInner() {
  const router = useRouter();
  const qc = useQueryClient();
  const list = useListParams(FILTERS, {
    sortBy: 'title',
    sortOrder: 'asc',
    pageSize: 24,
  });
  const { data: categories } = useBookCategories();
  const [bookOpen, setBookOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['books', list.query],
    queryFn: () => api.list<Book>('/library/books', list.query),
    placeholderData: (p) => p,
  });

  return (
    <>
      <PageHeader
        title={t('Library')}
        description={t('Picture books, stories, readers and teacher guides.')}
        icon={<BookOpen />}
        actions={
          <>
            <ExportMenu path="/library/books" query={list.query} />
            <Button variant="secondary" onClick={() => setIssueOpen(true)}>
              <BookMarked aria-hidden /> {t('Issue book')}
            </Button>
            <Button onClick={() => setBookOpen(true)}>
              <Plus aria-hidden /> {t('Add book')}
            </Button>
          </>
        }
      />
      <LibraryNav />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          placeholder={t('Title, author, ISBN or copy code…')}
        />
        <FilterSelect
          value={list.filters.categoryId}
          onChange={(v) => list.setFilter('categoryId', v)}
          placeholder={t('Category')}
          allLabel={t('All categories')}
          options={(categories ?? []).map((c) => ({
            value: String(c.id),
            label: c.name,
          }))}
        />
        <FilterSelect
          value={list.filters.language}
          onChange={(v) => list.setFilter('language', v)}
          placeholder={t('Language')}
          allLabel={t('All languages')}
          options={[t('English'), t('Kinyarwanda'), t('French')].map((l) => ({
            value: l,
            label: l,
          }))}
          className="sm:w-40"
        />
        <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium">
          <Checkbox
            checked={list.filters.available === 'true'}
            onCheckedChange={(v) => list.setFilter('available', v ? 'true' : undefined)}
          />
          {t('Available now')}
        </label>
      </Card>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/5] rounded-2xl" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={t('No books found')}
            description={t('Add books to the catalogue or clear the filters.')}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {data.data.map((b) => (
              <Link
                key={b.id}
                href={`/library/books/${b.id}`}
                className="group rounded-2xl border bg-card p-3 shadow-soft transition hover:-translate-y-1 hover:shadow-lift"
              >
                <BookCover book={b} className="transition group-hover:scale-[1.02]" />
                <p className="mt-3 line-clamp-2 text-sm font-bold leading-snug group-hover:text-primary">{b.title}</p>
                <p className="truncate text-xs text-muted-foreground">{b.author ?? t('Unknown author')}</p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="truncate text-muted-foreground">{b.category.name}</span>
                  <span
                    className={cn(
                      'tabular shrink-0 rounded-full px-2 py-0.5 font-bold',
                      b.availableCopies > 0
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-500/10 text-red-700 dark:text-red-300',
                    )}
                  >
                    {b.availableCopies}/{b.totalCopies}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <Card>
            <Pagination meta={data.meta} onPageChange={list.setPage} />
          </Card>
        </div>
      )}
      <BookDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        onSaved={(b) => {
          void qc.invalidateQueries({ queryKey: ['books'] });
          router.push(`/library/books/${b.id}`);
        }}
      />
      <IssueDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['books'] });
          void qc.invalidateQueries({ queryKey: ['loans'] });
        }}
      />
    </>
  );
}

export default function LibraryPage() {
  return (
    <Suspense>
      <CatalogueInner />
    </Suspense>
  );
}
