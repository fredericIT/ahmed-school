'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowUpCircle, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox, UserAvatar } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Field } from '@/components/forms/field';
import { useClasses, useYears } from '@/hooks/use-lookups';
import { api, errorMessage } from '@/lib/api';
import { fullName } from '@/lib/utils';
import type { Grade, SchoolClass } from '@/types';
import { plural, t } from '@/lib/i18n';

const NEXT: Record<Grade, Grade | null> = {
  BABY: 'MIDDLE',
  MIDDLE: 'TOP',
  TOP: 'P1',
  P1: 'P2',
  P2: null,
};

export default function PromotePage() {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const { data: years } = useYears();
  const [fromId, setFromId] = useState<string>();
  const [toId, setToId] = useState<string>();
  const [yearId, setYearId] = useState<string>();
  const [held, setHeld] = useState<Set<number>>(new Set());
  const from = classes?.find((c) => String(c.id) === fromId);
  const targetGrade = from ? NEXT[from.grade] : null;
  const targets = useMemo(() => (classes ?? []).filter((c) => c.grade === targetGrade), [classes, targetGrade]);

  useEffect(() => setToId(targets[0] ? String(targets[0].id) : undefined), [targets]);
  useEffect(() => {
    if (!yearId && years?.length)
      setYearId(
        String(
          (
            years.find((y) => !y.isCurrent && y.startDate > (years.find((x) => x.isCurrent)?.startDate ?? '')) ??
            years[0]
          ).id,
        ),
      );
  }, [years, yearId]);

  const { data: roster } = useQuery({
    queryKey: ['class', fromId],
    queryFn: () =>
      api.get<
        SchoolClass & {
          students: {
            id: number;
            firstName: string;
            lastName: string;
            photo: string | null;
            admissionNumber: string;
          }[];
        }
      >(`/classes/${fromId}`),
    enabled: !!fromId,
  });
  useEffect(() => setHeld(new Set()), [fromId]);
  const moving = (roster?.students.length ?? 0) - held.size;
  const to = classes?.find((c) => String(c.id) === toId);

  return (
    <>
      <PageHeader
        title={t('End-of-year promotion')}
        description={t('Move a whole class to the next grade. P2 pupils graduate.')}
        icon={<ArrowUpCircle />}
        breadcrumbs={[{ label: t('Students'), href: '/students' }, { label: t('Promote') }]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t('Promotion')}</CardTitle>
            <CardDescription>{t('Baby → Middle → Top → P1 → P2 → Graduated')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('From class')} htmlFor="from">
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger id="from">
                  <SelectValue placeholder={t('Choose a class')} />
                </SelectTrigger>
                <SelectContent>
                  {classes?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} ({c.studentCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {from && (
              <div className="flex items-center justify-center py-1 text-muted-foreground">
                <ArrowRight className="h-5 w-5 rotate-90" aria-hidden />
              </div>
            )}
            {from && targetGrade && (
              <Field label={t('To class')} htmlFor="to">
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger id="to">
                    <SelectValue placeholder={t('No class for the next grade')} />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {t('{name} ({availableSeats} seats free)', { name: c.name, availableSeats: c.availableSeats })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {from && !targetGrade && (
              <div className="flex items-center gap-3 rounded-xl bg-lavender/15 p-3 text-sm font-medium text-lavender-700 dark:text-lavender">
                <GraduationCap className="h-5 w-5" aria-hidden /> {t('Students will be marked as graduated.')}
              </div>
            )}
            <Field label={t('Academic year')} htmlFor="year" hint={t('The year the new enrolment belongs to.')}>
              <Select value={yearId} onValueChange={setYearId}>
                <SelectTrigger id="year">
                  <SelectValue placeholder={t('Choose year')} />
                </SelectTrigger>
                <SelectContent>
                  {years?.map((y) => (
                    <SelectItem key={y.id} value={String(y.id)}>
                      {y.isCurrent ? t('{name} (current)', { name: y.name }) : y.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <ConfirmDialog
              destructive={false}
              title={plural(moving, 'Promote {count} student?', 'Promote {count} students?')}
              description={
                to
                  ? plural(
                      moving,
                      '{count} student moves from {from} to {to}. {staying} will stay.',
                      '{count} students move from {from} to {to}. {staying} will stay.',
                      {
                        from: from?.name,
                        to: to.name,
                        staying: held.size,
                      },
                    )
                  : plural(
                      moving,
                      '{count} student from {from} will graduate.',
                      '{count} students from {from} will graduate.',
                      {
                        from: from?.name,
                      },
                    )
              }
              confirmLabel={t('Promote')}
              onConfirm={async () => {
                try {
                  const r = await api.post<{ promoted: number }>('/students/promote', {
                    fromClassId: Number(fromId),
                    toClassId: toId ? Number(toId) : null,
                    academicYearId: Number(yearId),
                    excludeStudentIds: [...held],
                  });
                  toast.success(plural(r.promoted, '{count} student promoted', '{count} students promoted'));
                  void qc.invalidateQueries({ queryKey: ['classes'] });
                  void qc.invalidateQueries({ queryKey: ['class', fromId] });
                  void qc.invalidateQueries({ queryKey: ['students'] });
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
              trigger={
                <Button className="w-full" disabled={!from || !yearId || moving <= 0 || (!!targetGrade && !toId)}>
                  <ArrowUpCircle aria-hidden />{' '}
                  {moving > 0
                    ? plural(moving, 'Promote {count} student', 'Promote {count} students')
                    : t('Promote students')}
                </Button>
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Students')}</CardTitle>
            <CardDescription>{t('Untick children who will repeat the year.')}</CardDescription>
          </CardHeader>
          <CardContent>
            {!roster ? (
              <EmptyState
                icon={ArrowUpCircle}
                title={t('Choose a class')}
                description={t('Its active students will be listed here.')}
              />
            ) : roster.students.length === 0 ? (
              <EmptyState title={t('No active students in this class')} />
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {roster.students.map((s) => {
                  const staying = held.has(s.id);
                  return (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition hover:bg-muted/40">
                        <Checkbox
                          checked={!staying}
                          onCheckedChange={(v) => {
                            const n = new Set(held);
                            if (v) n.delete(s.id);
                            else n.add(s.id);
                            setHeld(n);
                          }}
                        />
                        <UserAvatar src={s.photo} name={fullName(s)} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{fullName(s)}</span>
                          <span className="text-xs text-muted-foreground">{s.admissionNumber}</span>
                        </span>
                        {staying && <Badge variant="amber">{t('Repeats')}</Badge>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
