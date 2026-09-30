'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { ActivityForm, toActivityPayload } from '@/components/forms/activity-form';
import { api, errorMessage } from '@/lib/api';
import type { Activity } from '@/types';
import { t } from '@/lib/i18n';

export default function EditActivityPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['activity', id],
    queryFn: () => api.get<Activity>(`/activities/${id}`),
  });
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  return (
    <>
      <PageHeader
        title={t('Edit: {title}', { title: data.title })}
        icon={<Edit />}
        breadcrumbs={[
          { label: t('Activities'), href: '/activities' },
          { label: data.title, href: `/activities/${id}` },
          { label: t('Edit') },
        ]}
      />
      <ActivityForm
        activity={data}
        onCancel={() => router.back()}
        onSubmit={async (v, studentIds) => {
          try {
            await api.patch(`/activities/${id}`, toActivityPayload(v, studentIds));
            toast.success(t('Activity updated'));
            void qc.invalidateQueries({ queryKey: ['activity', id] });
            void qc.invalidateQueries({ queryKey: ['activities'] });
            router.push(`/activities/${id}`);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}
