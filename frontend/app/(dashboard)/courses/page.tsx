'use client';
import { BookOpenCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { RequirePermission } from '@/components/shared/require';
import { SimpleCrud } from '@/components/tables/simple-crud';
import type { Course } from '@/types';
import { t } from '@/lib/i18n';

export default function CoursesPage() {
  return (
    <RequirePermission permission="courses.manage">
      <PageHeader
        title={t('Courses')}
        description={t('Subjects taught at school. Assign them to teachers per class on the Teachers page.')}
        icon={<BookOpenCheck />}
      />
      <SimpleCrud<Course & Record<string, unknown>>
        endpoint="/courses"
        queryKey="courses"
        texts={{
          empty: t('No courses yet'),
          add: t('New course'),
          edit: t('Edit course'),
          saved: t('Course saved'),
          deleted: t('Course deleted'),
        }}
        icon={BookOpenCheck}
        fields={[
          { name: 'name', label: t('Name'), required: true },
          {
            name: 'code',
            label: t('Code'),
            required: true,
            hint: t('Short unique code, e.g. MATH'),
          },
          { name: 'description', label: t('Description'), type: 'textarea' },
        ]}
        columns={[
          {
            key: 'name',
            header: t('Course'),
            fixed: true,
            cell: (c) => <span className="font-semibold">{c.name}</span>,
          },
          {
            key: 'code',
            header: t('Code'),
            cell: (c) => <span className="font-mono text-sm">{c.code}</span>,
          },
          {
            key: 'level',
            header: t('Level'),
            cell: (c) =>
              c.level ? (
                <Badge variant={c.level === 'NURSERY' ? 'amber' : 'blue'}>
                  {c.level === 'NURSERY' ? t('Nursery') : t('Primary')}
                </Badge>
              ) : (
                <Badge variant="gray">{t('All levels')}</Badge>
              ),
          },
          {
            key: 'teachers',
            header: t('Teachers'),
            align: 'right',
            cell: (c) => <span className="tabular">{c.teacherCount ?? 0}</span>,
          },
          {
            key: 'classes',
            header: t('Classes'),
            align: 'right',
            cell: (c) => <span className="tabular">{c.classCount ?? 0}</span>,
          },
        ]}
      />
    </RequirePermission>
  );
}
