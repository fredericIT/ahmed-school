'use client';
import Link from 'next/link';
import { Tags } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { SimpleCrud } from '@/components/tables/simple-crud';
import { LibraryNav } from '@/components/forms/library-dialogs';
import type { BookCategory } from '@/types';
import { t } from '@/lib/i18n';

export default function BookCategoriesPage() {
  return (
    <>
      <PageHeader
        title={t('Book categories')}
        icon={<Tags />}
        breadcrumbs={[{ label: t('Library'), href: '/library' }, { label: t('Categories') }]}
      />
      <LibraryNav />
      <SimpleCrud<BookCategory & Record<string, unknown>>
        endpoint="/library/categories"
        queryKey="book-categories"
        texts={{
          empty: t('No categories yet'),
          add: t('New category'),
          edit: t('Edit category'),
          saved: t('Category saved'),
          deleted: t('Category deleted'),
        }}
        icon={Tags}
        fields={[
          { name: 'name', label: t('Name'), required: true },
          { name: 'description', label: t('Description'), type: 'textarea' },
        ]}
        columns={[
          {
            key: 'name',
            header: t('Name'),
            fixed: true,
            cell: (c) => (
              <Link href={`/library?categoryId=${c.id}`} className="font-semibold hover:text-primary">
                {c.name}
              </Link>
            ),
          },
          {
            key: 'description',
            header: t('Description'),
            cell: (c) => <span className="text-muted-foreground">{c.description ?? '—'}</span>,
          },
          {
            key: 'books',
            header: t('Books'),
            align: 'right',
            cell: (c) => <span className="tabular font-semibold">{c.bookCount}</span>,
          },
        ]}
      />
    </>
  );
}
