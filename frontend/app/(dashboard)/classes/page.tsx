'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DoorOpen, Edit, MoreVertical, Plus, School, Trash2, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Field, SelectField } from '@/components/forms/field';
import { useClasses } from '@/hooks/use-lookups';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Grade, SchoolClass } from '@/types';
import { msg, t } from '@/lib/i18n';

const GRADE_STYLE: Record<Grade, { label: string; cls: string; emoji: string }> = {
  BABY: {
    get label() {
      return t('Baby');
    },
    cls: 'from-sunny/40 to-sunny/5',
    emoji: '🧸',
  },
  MIDDLE: {
    get label() {
      return t('Middle');
    },
    cls: 'from-coral/35 to-coral/5',
    emoji: '🎨',
  },
  TOP: {
    get label() {
      return t('Top');
    },
    cls: 'from-mint/35 to-mint/5',
    emoji: '🧩',
  },
  P1: {
    get label() {
      return t('Primary 1');
    },
    cls: 'from-royal/30 to-royal/5',
    emoji: '✏️',
  },
  P2: {
    get label() {
      return t('Primary 2');
    },
    cls: 'from-lavender/40 to-lavender/5',
    emoji: '📚',
  },
};

const schema = z.object({
  name: z.string().trim().min(1, msg('Required')).max(60),
  grade: z.enum(['BABY', 'MIDDLE', 'TOP', 'P1', 'P2']),
  section: z.string().trim().max(5).optional(),
  capacity: z.coerce.number().int().min(1).max(200),
  classTeacherName: z.string().trim().max(120).optional(),
  room: z.string().trim().max(40).optional(),
});
type Values = z.infer<typeof schema>;

export default function ClassesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const manage = can('classes.manage');
  const { data, isLoading } = useClasses();
  const [editing, setEditing] = useState<SchoolClass | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SchoolClass | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['classes'] });
  const total = data?.reduce((a, c) => a + c.studentCount, 0) ?? 0;
  const capacity = data?.reduce((a, c) => a + c.capacity, 0) ?? 0;

  return (
    <>
      <PageHeader
        title={t('Classes')}
        description={
          data
            ? t('{count} classes · {total} students · {free} free seats', {
                count: data.length,
                total,
                free: capacity - total,
              })
            : t('Nursery and lower primary classes')
        }
        icon={<School />}
        actions={
          manage && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden /> {t('New class')}
            </Button>
          )
        }
      />
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <Card>
          <EmptyState
            icon={School}
            title={t('No classes yet')}
            description={
              manage
                ? t('Create the first class to start registering students.')
                : t('A super admin needs to create classes.')
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => {
            const pct = Math.round((c.studentCount / c.capacity) * 100);
            const st = GRADE_STYLE[c.grade];
            return (
              <Card key={c.id} className="group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className={cn('relative bg-gradient-to-br p-5', st.cls)}>
                  <span className="absolute right-4 top-3 text-4xl" aria-hidden>
                    {st.emoji}
                  </span>
                  <Badge variant={c.level === 'NURSERY' ? 'amber' : 'blue'}>
                    {c.level === 'NURSERY' ? t('Nursery') : t('Primary')}
                  </Badge>
                  <h2 className="mt-2 font-heading text-2xl font-black">{c.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {c.section ? t('{grade} · Section {section}', { grade: st.label, section: c.section }) : st.label}
                  </p>
                </div>
                <div className="space-y-4 p-5">
                  <div className="space-y-1.5 text-sm">
                    <p className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" aria-hidden />{' '}
                      {c.classTeacherName ?? t('No class teacher')}
                    </p>
                    <p className="flex items-center gap-2">
                      <DoorOpen className="h-4 w-4 text-muted-foreground" aria-hidden />{' '}
                      {t('Room {room}', { room: c.room ?? '—' })}
                    </p>
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs font-semibold">
                      <span className="tabular">
                        {t('{studentCount}/{capacity} students', {
                          studentCount: c.studentCount,
                          capacity: c.capacity,
                        })}
                      </span>
                      <span
                        className={cn('tabular', c.availableSeats === 0 ? 'text-destructive' : 'text-muted-foreground')}
                      >
                        {c.availableSeats === 0
                          ? t('Full')
                          : t('{availableSeats} free', { availableSeats: c.availableSeats })}
                      </span>
                    </div>
                    <Progress
                      value={pct}
                      indicatorClassName={pct >= 100 ? 'bg-destructive' : pct >= 85 ? 'bg-sunny' : 'bg-mint'}
                    />
                    <p className="tabular mt-2 text-xs text-muted-foreground">
                      {t('{boys} boys · {girls} girls', { boys: c.boys ?? 0, girls: c.girls ?? 0 })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" className="flex-1" asChild>
                      <Link href={`/students?classId=${c.id}`}>
                        <Users aria-hidden /> {t('Students')}
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <Link href={`/attendance?classId=${c.id}`}>{t('Attendance')}</Link>
                    </Button>
                    {manage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t('Manage {name}', { name: c.name })}>
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(c)}>
                            <Edit /> {t('Edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem destructive onSelect={() => setDeleting(c)}>
                            <Trash2 /> {t('Delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <ClassDialog cls={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('Delete {name}?', { name: deleting?.name })}
        description={t('Only empty classes can be deleted. Past attendance and enrolment history is kept.')}
        confirmLabel={t('Delete class')}
        onConfirm={async () => {
          try {
            await api.delete(`/classes/${deleting?.id}`);
            toast.success(t('Class deleted'));
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}

function ClassDialog({ cls, onClose, onSaved }: { cls: SchoolClass | null; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: cls?.name ?? '',
      grade: cls?.grade ?? 'BABY',
      section: cls?.section ?? '',
      capacity: cls?.capacity ?? 25,
      classTeacherName: cls?.classTeacherName ?? '',
      room: cls?.room ?? '',
    },
  });
  const e = formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cls ? t('Edit {name}', { name: cls.name }) : t('New class')}</DialogTitle>
        </DialogHeader>
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={handleSubmit(async (v) => {
            const body = {
              ...v,
              section: v.section || null,
              classTeacherName: v.classTeacherName || null,
              room: v.room || null,
            };
            try {
              if (cls) await api.patch(`/classes/${cls.id}`, body);
              else await api.post('/classes', body);
              toast.success(cls ? t('Class updated') : t('Class created'));
              onSaved();
              onClose();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          })}
        >
          <Field label={t('Name')} htmlFor="c-name" required error={e.name} className="sm:col-span-2">
            <Input id="c-name" placeholder="e.g. P1 B" {...register('name')} />
          </Field>
          <SelectField
            control={control}
            name="grade"
            label={t('Grade')}
            required
            options={Object.entries(GRADE_STYLE).map(([value, s]) => ({
              value,
              label: s.label,
            }))}
          />
          <Field label={t('Section')} htmlFor="c-sec" hint={t('A, B… (optional)')}>
            <Input id="c-sec" maxLength={5} {...register('section')} />
          </Field>
          <Field label={t('Capacity')} htmlFor="c-cap" required error={e.capacity}>
            <Input id="c-cap" type="number" min={1} {...register('capacity')} />
          </Field>
          <Field label={t('Room')} htmlFor="c-room">
            <Input id="c-room" {...register('room')} />
          </Field>
          <Field label={t('Class teacher')} htmlFor="c-teacher" className="sm:col-span-2">
            <Input id="c-teacher" {...register('classTeacherName')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              {t('Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
