'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardCheck, DoorOpen, NotebookPen, School, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { HeroBanner } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/empty-state';
import { api, errorMessage } from '@/lib/api';
import { formatDate, fullName } from '@/lib/utils';
import type { Teacher } from '@/types';
import { plural, t } from '@/lib/i18n';

interface MyClasses {
  teacher: Teacher;
  today: string;
  classes: {
    id: number;
    name: string;
    level: string;
    room: string | null;
    classTeacherName: string | null;
    courses: { id: number; name: string; code: string }[];
    students: {
      id: number;
      admissionNumber: string;
      firstName: string;
      lastName: string;
      photo: string | null;
      allergies: string | null;
    }[];
    attendanceTakenToday: boolean;
  }[];
}

/** Home page for teachers: their courses, classes and pupils. */
export default function MyClassesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-classes'],
    queryFn: () => api.get<MyClasses>('/teachers/me'),
  });
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-96 rounded-2xl" />;
  const teacher = data.teacher;
  const pending = data.classes.filter((c) => !c.attendanceTakenToday).length;

  return (
    <div className="space-y-6">
      <HeroBanner video mascot>
        <p className="text-sm font-semibold text-white/80">{formatDate(data.today)}</p>
        <h1 className="mt-1 font-heading text-3xl font-black sm:text-4xl">
          {t('Hello, {firstName}! 👋', { firstName: teacher.firstName })}
        </h1>
        <p className="mt-1 text-white/85">
          {teacher.postLabel} · <span className="font-mono font-bold">{teacher.regNumber}</span> ·{' '}
          {plural(data.classes.length, '{count} class', '{count} classes')}
          {pending > 0 &&
            ` · ${plural(pending, 'attendance still to take for {count} class', 'attendance still to take for {count} classes')}`}
        </p>
      </HeroBanner>

      {data.classes.length === 0 ? (
        <Card>
          <EmptyState
            icon={School}
            title={t('No classes assigned yet')}
            description={t('The school administration will assign your courses and classes.')}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.classes.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="font-heading text-xl">{c.name}</CardTitle>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" aria-hidden />{' '}
                      {plural(c.students.length, '{count} pupil', '{count} pupils')}
                    </span>
                    {c.room && (
                      <span className="flex items-center gap-1">
                        <DoorOpen className="h-3.5 w-3.5" aria-hidden /> {t('Room {room}', { room: c.room })}
                      </span>
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.courses.map((co) => (
                      <Link
                        key={co.id}
                        href={`/marks?pair=${c.id}-${co.id}`}
                        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={t('Marks for {name}', { name: co.name })}
                      >
                        <Badge variant="blue" className="hover:bg-sky-100 dark:hover:bg-sky-500/25">
                          <NotebookPen className="h-3 w-3" aria-hidden /> {co.name}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {c.attendanceTakenToday ? (
                    <Badge variant="green">
                      <CheckCircle2 className="h-3 w-3" /> {t('Attendance taken')}
                    </Badge>
                  ) : (
                    <Badge variant="amber">{t('Attendance pending')}</Badge>
                  )}
                  <Button size="sm" asChild variant={c.attendanceTakenToday ? 'outline' : 'default'}>
                    <Link href={`/attendance?classId=${c.id}`}>
                      <ClipboardCheck aria-hidden /> {c.attendanceTakenToday ? t('Review') : t('Take attendance')}
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="grid max-h-80 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {c.students.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 rounded-lg p-1.5">
                      <UserAvatar src={s.photo} name={fullName(s)} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{fullName(s)}</span>
                      {s.allergies && (
                        <span title={t('Allergy: {allergies}', { allergies: s.allergies })} className="text-red-600">
                          <AlertTriangle
                            className="h-3.5 w-3.5"
                            aria-label={t('Allergy: {allergies}', { allergies: s.allergies })}
                          />
                        </span>
                      )}
                    </li>
                  ))}
                  {!c.students.length && <li className="text-sm text-muted-foreground">{t('No active pupils.')}</li>}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
