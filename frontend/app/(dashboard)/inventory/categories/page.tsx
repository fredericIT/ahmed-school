'use client';
import Link from 'next/link';
import { Tags } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { SimpleCrud } from '@/components/tables/simple-crud';
import { InventoryNav } from '@/components/forms/inventory-dialogs';
import type { InventoryCategory } from '@/types';
import { t } from '@/lib/i18n';

export default function InventoryCategoriesPage() {
  return (
    <>
      <PageHeader
        title={t('Inventory categories')}
        icon={<Tags />}
        breadcrumbs={[{ label: t('Inventory'), href: '/inventory' }, { label: t('Categories') }]}
      />
      <InventoryNav />
      <SimpleCrud<InventoryCategory & Record<string, unknown>>
        endpoint="/inventory/categories"
        queryKey="inventory-categories"
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
          {
            name: 'perishable',
            label: t('Perishable'),
            type: 'switch',
            hint: t('Items get expiry warnings (food, medical)'),
          },
        ]}
        columns={[
          {
            key: 'name',
            header: t('Name'),
            fixed: true,
            cell: (c) => (
              <Link href={`/inventory?categoryId=${c.id}`} className="font-semibold hover:text-primary">
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
            key: 'perishable',
            header: t('Type'),
            cell: (c) =>
              c.perishable ? (
                <Badge variant="amber">{t('Perishable')}</Badge>
              ) : (
                <Badge variant="gray">{t('Durable')}</Badge>
              ),
          },
          {
            key: 'items',
            header: t('Items'),
            align: 'right',
            cell: (c) => <span className="tabular font-semibold">{c.itemCount}</span>,
          },
        ]}
      />
    </>
  );
}
