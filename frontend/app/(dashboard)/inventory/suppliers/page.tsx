'use client';
import { Truck } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { SimpleCrud } from '@/components/tables/simple-crud';
import { InventoryNav } from '@/components/forms/inventory-dialogs';
import type { Supplier } from '@/types';
import { t } from '@/lib/i18n';

export default function SuppliersPage() {
  return (
    <>
      <PageHeader
        title={t('Suppliers')}
        icon={<Truck />}
        breadcrumbs={[{ label: t('Inventory'), href: '/inventory' }, { label: t('Suppliers') }]}
      />
      <InventoryNav />
      <SimpleCrud<Supplier & Record<string, unknown>>
        endpoint="/inventory/suppliers"
        queryKey="suppliers-crud"
        invalidate={['suppliers-all']}
        paginated
        texts={{
          empty: t('No suppliers yet'),
          add: t('New supplier'),
          edit: t('Edit supplier'),
          saved: t('Supplier saved'),
          deleted: t('Supplier deleted'),
        }}
        icon={Truck}
        fields={[
          { name: 'name', label: t('Company name'), required: true },
          { name: 'contactPerson', label: t('Contact person') },
          { name: 'phone', label: t('Phone'), type: 'tel' },
          { name: 'email', label: t('Email'), type: 'email' },
          { name: 'address', label: t('Address') },
        ]}
        columns={[
          {
            key: 'name',
            header: t('Supplier'),
            fixed: true,
            cell: (s) => <span className="font-semibold">{s.name}</span>,
          },
          {
            key: 'contact',
            header: t('Contact'),
            cell: (s) => s.contactPerson ?? '—',
          },
          {
            key: 'phone',
            header: t('Phone'),
            cell: (s) =>
              s.phone ? (
                <a href={`tel:${s.phone}`} className="tabular hover:text-primary">
                  {s.phone}
                </a>
              ) : (
                '—'
              ),
          },
          {
            key: 'email',
            header: t('Email'),
            cell: (s) =>
              s.email ? (
                <a href={`mailto:${s.email}`} className="hover:text-primary">
                  {s.email}
                </a>
              ) : (
                '—'
              ),
          },
          {
            key: 'address',
            header: t('Address'),
            hidden: true,
            cell: (s) => s.address ?? '—',
          },
          {
            key: 'items',
            header: t('Items'),
            align: 'right',
            cell: (s) => <span className="tabular">{s.itemCount ?? 0}</span>,
          },
        ]}
      />
    </>
  );
}
