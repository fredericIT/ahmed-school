'use client';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { PartyPopper } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { ActivityForm, toActivityPayload } from '@/components/forms/activity-form';
import { api, errorMessage } from '@/lib/api';
import type { Activity } from '@/types';
import { t } from '@/lib/i18n';

export default function NewActivityPage() {
  const router = useRouter();
  const qc = useQueryClient();
  return (
    <>
      <PageHeader
        title={t('New activity')}
        icon={<PartyPopper />}
        breadcrumbs={[{ label: t('Activities'), href: '/activities' }, { label: t('New') }]}
      />
      <ActivityForm
        onCancel={() => router.back()}
        onSubmit={async (v, studentIds) => {
          try {
            const a = await api.post<Activity>('/activities', toActivityPayload(v, studentIds));
            toast.success(t('Activity created'));
            void qc.invalidateQueries({ queryKey: ['activities'] });
            router.push(`/activities/${a.id}`);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}
