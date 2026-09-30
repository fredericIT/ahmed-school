'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit,
  FileText,
  HeartPulse,
  History,
  IdCard,
  MoreVertical,
  PartyPopper,
  Phone,
  Plus,
  ShieldAlert,
  Star,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox, UserAvatar } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Breadcrumbs } from '@/components/shared/page-header';
import { ATTENDANCE_COLORS, StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/shared/empty-state';
import { ImageUpload } from '@/components/forms/image-upload';
import { Field } from '@/components/forms/field';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  cn,
  dateFormat,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  fullName,
  todayKigali,
  weekdayNames,
} from '@/lib/utils';
import { phoneSchema } from '@/lib/validation';
import type { AttendanceRecord, AttendanceStatus, Guardian, Loan, Student, StudentStatus } from '@/types';
import { msg, plural, t } from '@/lib/i18n';
import { enumLabel } from '@/lib/labels';

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState<null | 'soft' | 'hard'>(null);
  const {
    data: s,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['student', id],
    queryFn: () => api.get<Student>(`/students/${id}`),
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['student', id] });
    void qc.invalidateQueries({ queryKey: ['students'] });
  };

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (isLoading || !s) return <ProfileSkeleton />;

  const name = fullName(s);
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('Students'), href: '/students' }, { label: name }]} />

      <Card className="overflow-hidden">
        <div className="gradient-hero h-24 sm:h-28" aria-hidden />
        <CardContent className="-mt-14 flex flex-col gap-4 p-6 sm:flex-row sm:items-end">
          <ImageUpload
            value={s.photo}
            shape="circle"
            label={t('Add photo')}
            className="h-28 w-28 border-4 border-solid border-card bg-card"
            onUpload={async (file) => {
              const form = new FormData();
              form.append('file', file);
              try {
                await api.upload(`/students/${s.id}/photo`, form);
                toast.success(t('Photo updated'));
                invalidate();
              } catch (e) {
                toast.error(errorMessage(e));
                throw e;
              }
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{name}</h1>
              <StatusBadge status={s.status} />
              {s.allergies && (
                <Badge variant="red">
                  <AlertTriangle className="h-3 w-3" /> {t('Allergy')}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="tabular font-semibold text-foreground">{s.admissionNumber}</span> ·{' '}
              {s.currentClass?.name ?? t('No class')} ·{' '}
              {s.gender === 'MALE'
                ? plural(s.age, 'Boy, {count} year old', 'Boy, {count} years old')
                : plural(s.age, 'Girl, {count} year old', 'Girl, {count} years old')}
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void api.openPdf(`/students/${s.id}/id-card`).catch((e) => toast.error(errorMessage(e)))}
            >
              <IdCard aria-hidden /> {t('ID card')}
            </Button>
            <Button asChild>
              <Link href={`/students/${s.id}/edit`}>
                <Edit aria-hidden /> {t('Edit')}
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={t('More actions')}>
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    void api.openPdf(`/students/${s.id}/registration-form`).catch((e) => toast.error(errorMessage(e)))
                  }
                >
                  <FileText /> {t('Registration form (PDF)')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setStatusOpen(true)}>
                  <History /> {t('Change status')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setDeleteOpen('soft')}>
                  <Trash2 /> {t('Archive student')}
                </DropdownMenuItem>
                {can('records.hardDelete') && (
                  <DropdownMenuItem destructive onSelect={() => setDeleteOpen('hard')}>
                    <ShieldAlert /> {t('Delete permanently')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat
          label={t('Attendance rate')}
          value={formatPercent(s.stats.attendanceRate)}
          hint={plural(s.stats.daysRecorded, '{count} day recorded', '{count} days recorded')}
          tone="mint"
        />
        <MiniStat
          label={t('Absences')}
          value={String(s.stats.byStatus.ABSENT ?? 0)}
          hint={t('{sick} sick · {late} late', {
            sick: s.stats.byStatus.SICK ?? 0,
            late: s.stats.byStatus.LATE ?? 0,
          })}
          tone="coral"
        />
        <MiniStat label={t('Activities')} value={String(s.stats.activities)} hint={t('Participated')} tone="sunny" />
        <MiniStat label={t('Books on loan')} value={String(s.stats.activeLoans)} hint={t('Library')} tone="lavender" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <User aria-hidden /> {t('Overview')}
          </TabsTrigger>
          <TabsTrigger value="guardians">
            <Users aria-hidden /> {t('Guardians')}
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <CalendarDays aria-hidden /> {t('Attendance')}
          </TabsTrigger>
          <TabsTrigger value="activities">
            <PartyPopper aria-hidden /> {t('Activities')}
          </TabsTrigger>
          <TabsTrigger value="library">
            <BookOpen aria-hidden /> {t('Library')}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History aria-hidden /> {t('Class history')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('Personal details')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Info k={t('Date of birth')} v={formatDate(s.dateOfBirth)} />
                  <Info k={t('Nationality')} v={s.nationality} />
                  <Info k={t('Address')} v={s.address} />
                  <Info k={t('Previous school')} v={s.previousSchool} />
                  <Info k={t('Admission date')} v={formatDate(s.admissionDate)} />
                  <Info k={t('Class teacher')} v={s.currentClass?.classTeacherName} />
                  {s.statusReason && <Info k={t('Status note')} v={s.statusReason} />}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-coral" aria-hidden /> {t('Health')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Info k={t('Blood group')} v={s.bloodGroup ?? t('Unknown')} />
                  <Info k={t('Allergies')} v={s.allergies} highlight={!!s.allergies} />
                  <Info k={t('Medical notes')} v={s.medicalNotes} />
                  <Info k={t('Special needs')} v={s.specialNeeds} />
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="guardians">
          <GuardiansTab student={s} onChange={invalidate} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceTab studentId={s.id} />
        </TabsContent>
        <TabsContent value="activities">
          <ActivitiesTab studentId={s.id} />
        </TabsContent>
        <TabsContent value="library">
          <LoansTab studentId={s.id} />
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardContent className="p-6">
              {s.enrollments.length ? (
                <ol className="relative space-y-6 border-l-2 border-dashed border-primary/30 pl-6">
                  {s.enrollments.map((e) => (
                    <li key={e.id} className="relative">
                      <span
                        className="absolute -left-[33px] grid h-4 w-4 place-items-center rounded-full bg-primary ring-4 ring-primary/20"
                        aria-hidden
                      />
                      <p className="font-heading font-bold">
                        {e.class.name}{' '}
                        <span className="font-sans text-sm font-medium text-muted-foreground">
                          · {e.academicYear.name}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {e.note ?? t('Enrolled')} · {formatDate(e.enrolledAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState icon={History} title={t('No class history yet')} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} student={s} onDone={invalidate} />
      <ConfirmDialog
        open={deleteOpen !== null}
        onOpenChange={(o) => !o && setDeleteOpen(null)}
        title={deleteOpen === 'hard' ? t('Permanently delete {name}?', { name }) : t('Archive {name}?', { name })}
        description={
          deleteOpen === 'hard'
            ? t('This removes the student, attendance and enrolment history forever. This cannot be undone.')
            : t('The student will be hidden from lists and reports. A super admin can restore them.')
        }
        confirmLabel={deleteOpen === 'hard' ? t('Delete forever') : t('Archive')}
        onConfirm={async () => {
          try {
            await api.delete(`/students/${s.id}`, deleteOpen === 'hard' ? { hard: true } : undefined);
            toast.success(deleteOpen === 'hard' ? t('Student deleted') : t('Student archived'));
            void qc.invalidateQueries({ queryKey: ['students'] });
            router.replace('/students');
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'mint' | 'coral' | 'sunny' | 'lavender';
}) {
  const bar = {
    mint: 'bg-mint',
    coral: 'bg-coral',
    sunny: 'bg-sunny',
    lavender: 'bg-lavender',
  }[tone];
  return (
    <Card className="relative overflow-hidden p-5">
      <span className={cn('absolute inset-y-0 left-0 w-1.5', bar)} aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="tabular font-heading text-2xl font-extrabold">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function Info({ k, v, highlight }: { k: string; v?: string | null; highlight?: boolean }) {
  return (
    <div>
      <dt className="font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className={cn('mt-0.5 text-sm font-medium', highlight && 'text-red-600 dark:text-red-400')}>{v || '—'}</dd>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-52 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

const STATUS_OPTIONS: { value: StudentStatus; label: string }[] = [
  {
    value: 'ACTIVE',
    get label() {
      return t('Active');
    },
  },
  {
    value: 'TRANSFERRED',
    get label() {
      return t('Transferred to another school');
    },
  },
  {
    value: 'WITHDRAWN',
    get label() {
      return t('Withdrawn');
    },
  },
  {
    value: 'GRADUATED',
    get label() {
      return t('Graduated');
    },
  },
];

function StatusDialog({
  open,
  onOpenChange,
  student,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: Student;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<StudentStatus>(student.status);
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api.patch(`/students/${student.id}/status`, {
        status,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success(t('Status updated'));
      onDone();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Change status')}</DialogTitle>
          <DialogDescription>
            {t('Transferred, withdrawn and graduated students are kept for records but leave class rosters.')}
          </DialogDescription>
        </DialogHeader>
        <Field label={t('New status')} htmlFor="status">
          <Select value={status} onValueChange={(v) => setStatus(v as StudentStatus)}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('Reason')} htmlFor="reason" hint={t('E.g. new school name or reason for leaving.')}>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={() => m.mutate()} loading={m.isPending} disabled={status === student.status && !reason}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Guardians tab ───

const guardianForm = z.object({
  fullName: z.string().trim().min(2, msg('Required')),
  relationship: z.string().trim().min(2, msg('Required')),
  phone: phoneSchema,
  altPhone: z.union([phoneSchema, z.literal('')]).optional(),
  email: z.union([z.string().trim().email(msg('Invalid email')), z.literal('')]).optional(),
  occupation: z.string().optional(),
  nationalId: z.union([z.string().regex(/^\d{16}$/, msg('16 digits')), z.literal('')]).optional(),
  address: z.string().optional(),
  isEmergencyContact: z.boolean(),
  canPickUp: z.boolean(),
});
type GuardianValues = z.infer<typeof guardianForm>;

function GuardiansTab({ student, onChange }: { student: Student; onChange: () => void }) {
  const [editing, setEditing] = useState<Guardian | 'new' | null>(null);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden /> {t('Add guardian')}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {student.guardians.map((g) => (
          <Card key={g.id} className={cn(g.isPrimary && 'ring-2 ring-primary/40')}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <UserAvatar name={g.fullName} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-heading font-bold">{g.fullName}</p>
                  <p className="text-sm text-muted-foreground">
                    {t(g.relationship)}
                    {g.occupation && ` · ${g.occupation}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {g.isPrimary && (
                      <Badge>
                        <Star className="h-3 w-3" /> {t('Primary')}
                      </Badge>
                    )}
                    {g.isEmergencyContact && <Badge variant="coral">{t('Emergency contact')}</Badge>}
                    <Badge variant={g.canPickUp ? 'green' : 'red'}>
                      {g.canPickUp ? t('Authorized pick-up') : t('Not authorized to pick up')}
                    </Badge>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('Actions for {fullName}', { fullName: g.fullName })}
                    >
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(g)}>{t('Edit details')}</DropdownMenuItem>
                    {!g.isPrimary && (
                      <DropdownMenuItem
                        onSelect={() =>
                          void run(
                            () => api.patch(`/students/${student.id}/guardians/${g.id}`, { isPrimary: true }),
                            t('Primary guardian updated'),
                          )
                        }
                      >
                        {t('Make primary')}
                      </DropdownMenuItem>
                    )}
                    {student.guardians.length > 1 && (
                      <DropdownMenuItem
                        destructive
                        onSelect={() =>
                          void run(() => api.delete(`/students/${student.id}/guardians/${g.id}`), t('Guardian removed'))
                        }
                      >
                        {t('Remove from student')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <a href={`tel:${g.phone}`} className="tabular font-medium hover:text-primary">
                    {g.phone}
                  </a>
                </div>
                {g.altPhone && <p className="tabular text-muted-foreground">{g.altPhone}</p>}
                {g.email && <p className="truncate text-muted-foreground">{g.email}</p>}
                {g.nationalId && (
                  <p className="tabular text-muted-foreground">{t('ID {nationalId}', { nationalId: g.nationalId })}</p>
                )}
                {g.address && <p className="text-muted-foreground">{g.address}</p>}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
      <GuardianDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        open={editing !== null}
        guardian={editing === 'new' ? null : editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSave={async (v) => {
          const payload = {
            ...v,
            altPhone: v.altPhone || null,
            email: v.email || null,
            nationalId: v.nationalId || null,
          };
          if (editing === 'new')
            await run(
              () =>
                api.post(`/students/${student.id}/guardians`, {
                  ...payload,
                  isPrimary: false,
                }),
              t('Guardian added'),
            );
          else if (editing)
            await run(() => api.patch(`/students/guardians/${editing.id}`, payload), t('Guardian updated'));
          setEditing(null);
        }}
      />
    </div>
  );
}

function GuardianDialog({
  open,
  guardian,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  guardian: Guardian | null;
  onOpenChange: (o: boolean) => void;
  onSave: (v: GuardianValues) => Promise<void>;
}) {
  const { register, handleSubmit, formState, watch, setValue } = useForm<GuardianValues>({
    resolver: zodResolver(guardianForm),
    defaultValues: {
      fullName: guardian?.fullName ?? '',
      relationship: guardian?.relationship ?? '',
      phone: guardian?.phone ?? '',
      altPhone: guardian?.altPhone ?? '',
      email: guardian?.email ?? '',
      occupation: guardian?.occupation ?? '',
      nationalId: guardian?.nationalId ?? '',
      address: guardian?.address ?? '',
      isEmergencyContact: guardian?.isEmergencyContact ?? false,
      canPickUp: guardian?.canPickUp ?? true,
    },
  });
  const e = formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{guardian ? t('Edit guardian') : t('Add guardian')}</DialogTitle>
          {guardian && (
            <DialogDescription>{t('Changes apply to every child linked to this guardian.')}</DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit(onSave)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label={t('Full name')} htmlFor="gd-name" required error={e.fullName}>
            <Input id="gd-name" {...register('fullName')} />
          </Field>
          <Field label={t('Relationship')} htmlFor="gd-rel" required error={e.relationship}>
            <Input id="gd-rel" {...register('relationship')} />
          </Field>
          <Field label={t('Phone')} htmlFor="gd-phone" required error={e.phone}>
            <Input id="gd-phone" type="tel" {...register('phone')} />
          </Field>
          <Field label={t('Alternative phone')} htmlFor="gd-alt" error={e.altPhone}>
            <Input id="gd-alt" type="tel" {...register('altPhone')} />
          </Field>
          <Field label={t('Email')} htmlFor="gd-email" error={e.email}>
            <Input id="gd-email" type="email" {...register('email')} />
          </Field>
          <Field label={t('Occupation')} htmlFor="gd-occ">
            <Input id="gd-occ" {...register('occupation')} />
          </Field>
          <Field label={t('National ID')} htmlFor="gd-nid" error={e.nationalId}>
            <Input id="gd-nid" {...register('nationalId')} />
          </Field>
          <Field label={t('Address')} htmlFor="gd-addr">
            <Input id="gd-addr" {...register('address')} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={watch('isEmergencyContact')}
              onCheckedChange={(v) => setValue('isEmergencyContact', v === true)}
            />
            {t('Emergency contact')}
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={watch('canPickUp')} onCheckedChange={(v) => setValue('canPickUp', v === true)} />
            {t('Authorized to pick up')}
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

// ─── Attendance tab ───

function AttendanceTab({ studentId }: { studentId: number }) {
  const [month, setMonth] = useState(todayKigali().slice(0, 7));
  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      from: `${month}-01`,
      to: `${month}-${String(last).padStart(2, '0')}`,
      first: new Date(Date.UTC(y, m - 1, 1)).getUTCDay(),
      last,
    };
  }, [month]);
  const { data: all } = useQuery({
    queryKey: ['student-attendance', studentId],
    queryFn: () =>
      api.get<{
        summary: Record<AttendanceStatus, number> & {
          total: number;
          rate: number | null;
        };
        records: AttendanceRecord[];
      }>(`/attendance/students/${studentId}`),
  });
  const byDate = new Map((all?.records ?? []).map((r) => [r.date, r]));
  const shift = (d: number) => {
    const [y, m] = month.split('-').map(Number);
    const n = new Date(Date.UTC(y, m - 1 + d, 1));
    setMonth(n.toISOString().slice(0, 7));
  };
  const monthRecords = (all?.records ?? []).filter((r) => r.date.startsWith(month));
  const offset = (range.first + 6) % 7; // Monday-first grid

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            {dateFormat({
              month: 'long',
              year: 'numeric',
            }).format(new Date(`${month}-01T00:00:00Z`))}
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label={t('Previous month')}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label={t('Next month')}>
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold uppercase text-muted-foreground">
            {weekdayNames().map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: offset }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: range.last }).map((_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`;
              const rec = byDate.get(date);
              const color = rec ? ATTENDANCE_COLORS[rec.status] : undefined;
              return (
                <div
                  key={date}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-semibold',
                    !rec && 'text-muted-foreground',
                  )}
                  style={color ? { background: `${color}1f`, borderColor: `${color}66` } : undefined}
                  title={
                    rec
                      ? `${formatDate(date)}: ${enumLabel(rec.status)}${rec.remark ? ` (${rec.remark})` : ''}` // i18n-ignore: parts are translated
                      : formatDate(date)
                  }
                >
                  <span className="tabular">{i + 1}</span>
                  {rec && (
                    <span className="mt-0.5 hidden text-[9px] font-bold uppercase sm:block" style={{ color }}>
                      {rec.status.slice(0, 3)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            {Object.entries(ATTENDANCE_COLORS).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded" style={{ background: c }} aria-hidden /> {enumLabel(k)}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">{t('Overall attendance rate')}</p>
          <p className="tabular font-heading text-4xl font-black">{formatPercent(all?.summary.rate)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {(['PRESENT', 'LATE', 'ABSENT', 'SICK', 'EXCUSED'] as const).map((k) => (
              <div key={k} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5">
                <StatusBadge status={k} />
                <span className="tabular font-bold">{all?.summary[k] ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-heading font-bold">{t('This month')}</p>
          {monthRecords.filter((r) => r.status !== 'PRESENT').length ? (
            <ul className="space-y-2 text-sm">
              {monthRecords
                .filter((r) => r.status !== 'PRESENT')
                .map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span>{formatDate(r.date)}</span>
                    <span className="flex items-center gap-2">
                      {r.remark && <span className="text-xs text-muted-foreground">{r.remark}</span>}
                      <StatusBadge status={r.status} />
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('Perfect attendance this month 🎉')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function ActivitiesTab({ studentId }: { studentId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['student-activities', studentId],
    queryFn: () =>
      api.get<
        {
          id: number;
          title: string;
          category: string;
          date: string;
          status: string;
          location: string | null;
        }[]
      >(`/students/${studentId}/activities`),
  });
  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!data?.length)
    return (
      <Card>
        <EmptyState
          icon={PartyPopper}
          title={t('No activities yet')}
          description={t("Activities this child's class takes part in appear here.")}
        />
      </Card>
    );
  return (
    <Card className="divide-y">
      {data.map((a) => (
        <Link
          key={a.id}
          href={`/activities/${a.id}`}
          className="flex items-center justify-between gap-3 p-4 transition hover:bg-muted/40"
        >
          <div>
            <p className="font-semibold">{a.title}</p>
            <p className="text-xs text-muted-foreground">
              {enumLabel(a.category)} · {formatDate(a.date)}
              {a.location && ` · ${a.location}`}
            </p>
          </div>
          <StatusBadge status={a.status} />
        </Link>
      ))}
    </Card>
  );
}

function LoansTab({ studentId }: { studentId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['student-loans', studentId],
    queryFn: () => api.get<Loan[]>(`/students/${studentId}/loans`),
  });
  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!data?.length)
    return (
      <Card>
        <EmptyState icon={BookOpen} title={t('No books borrowed yet')} />
      </Card>
    );
  return (
    <Card className="divide-y">
      {data.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <Link href={`/library/books/${l.bookCopy.book.id}`} className="font-semibold hover:text-primary">
              {l.bookCopy.book.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {l.returnedAt
                ? t('{copyCode} · Issued {issued} · Due {due} · Returned {returned}', {
                    copyCode: l.bookCopy.copyCode,
                    issued: formatDateTime(l.issuedAt),
                    due: formatDate(l.dueDate),
                    returned: formatDate(l.returnedAt),
                  })
                : t('{copyCode} · Issued {issued} · Due {due}', {
                    copyCode: l.bookCopy.copyCode,
                    issued: formatDateTime(l.issuedAt),
                    due: formatDate(l.dueDate),
                  })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {Number(l.fine) > 0 && (
              <Badge variant={l.finePaid ? 'green' : 'amber'}>
                {l.finePaid
                  ? t('Fine {amount} · paid', { amount: formatMoney(l.fine) })
                  : t('Fine {amount}', { amount: formatMoney(l.fine) })}
              </Badge>
            )}
            <StatusBadge status={l.status} />
          </div>
        </div>
      ))}
    </Card>
  );
}
