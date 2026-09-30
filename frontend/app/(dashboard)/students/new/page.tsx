'use client';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { StudentWizard, toPayload } from '@/components/forms/student-form';
import { api, errorMessage } from '@/lib/api';
import type { Student } from '@/types';
import { t } from '@/lib/i18n';

export default function NewStudentPage() {
  const router = useRouter();
  const qc = useQueryClient();
  return (
    <>
      <PageHeader
        title={t('Register a student')}
        description={t('Five quick steps: child, guardians, medical, class and review.')}
        icon={<UserPlus />}
        breadcrumbs={[{ label: t('Students'), href: '/students' }, { label: t('Register') }]}
      />
      <StudentWizard
        onSubmit={async (values, photo) => {
          try {
            const student = await api.post<Student>('/students', toPayload(values));
            if (photo) {
              const form = new FormData();
              form.append('file', photo);
              await api
                .upload(`/students/${student.id}/photo`, form)
                .catch((e) =>
                  toast.error(t('Student saved, but the photo failed: {error}', { error: errorMessage(e) })),
                );
            }
            await Promise.all([
              qc.invalidateQueries({ queryKey: ['students'] }),
              qc.invalidateQueries({ queryKey: ['classes'] }),
              qc.invalidateQueries({ queryKey: ['dashboard'] }),
            ]);
            toast.success(t('{firstName} registered', { firstName: student.firstName }), {
              description: t('Admission number {admissionNumber}', { admissionNumber: student.admissionNumber }),
            });
            router.push(`/students/${student.id}`);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}
