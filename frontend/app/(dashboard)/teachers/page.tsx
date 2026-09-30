'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  BookOpenCheck,
  Check,
  Copy,
  Edit,
  GraduationCap,
  KeyRound,
  Mail,
  MailCheck,
  MoreHorizontal,
  Plus,
  Power,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox, UserAvatar } from '@/components/ui/misc';
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
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { RequirePermission } from '@/components/shared/require';
import { DataTable, type Column } from '@/components/tables/data-table';
import { SearchInput } from '@/components/forms/search-input';
import { Field, FilterSelect, SelectField } from '@/components/forms/field';
import { useListParams } from '@/hooks/use-list-params';
import { useClasses } from '@/hooks/use-lookups';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDateTime, fullName } from '@/lib/utils';
import { passwordSchema } from '@/lib/validation';
import type { ActivationResult, Course, Teacher } from '@/types';
import { msg, plural, t, tRich } from '@/lib/i18n';

const FILTERS = ['isActive', 'activated', 'post', 'courseId', 'classId'] as const;
type Pair = { courseId: number; classId: number };

const gmail = z
  .string()
  .trim()
  .toLowerCase()
  .email(msg('Enter a valid email'))
  .refine((e) => e.endsWith(msg('@gmail.com')), msg('Use a Gmail address (…@gmail.com)'));

const teacherSchema = z.object({
  firstName: z.string().trim().min(1, msg('Required')),
  lastName: z.string().trim().min(1, msg('Required')),
  email: gmail,
  phone: z.string().trim().optional(),
  post: z.string(),
});
type TeacherValues = z.infer<typeof teacherSchema>;

function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get<Course[]>('/courses'),
    staleTime: 60_000,
  });
}
function usePosts() {
  return useQuery({
    queryKey: ['teacher-posts'],
    queryFn: () => api.get<{ code: string; label: string }[]>('/teachers/posts'),
    staleTime: Infinity,
  });
}

function TeachersInner() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useListParams(FILTERS, {
    sortBy: 'regNumber',
    sortOrder: 'asc',
  });
  const { data: courses } = useCourses();
  const { data: classes } = useClasses();
  const { data: posts } = usePosts();
  const [editing, setEditing] = useState<Teacher | 'new' | null>(null);
  const [assigning, setAssigning] = useState<Teacher | null>(null);
  const [passwordFor, setPasswordFor] = useState<Teacher | null>(null);
  const [deleting, setDeleting] = useState<Teacher | null>(null);
  const [created, setCreated] = useState<{
    teacher: Teacher;
    activation: ActivationResult;
  } | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['teachers', list.query],
    queryFn: () => api.list<Teacher>('/teachers', list.query),
    placeholderData: (p) => p,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['teachers'] });
    void qc.invalidateQueries({ queryKey: ['courses'] });
  };
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const columns: Column<Teacher>[] = [
    {
      key: 'name',
      header: t('Teacher'),
      fixed: true,
      sortKey: 'firstName',
      cell: (teacher) => (
        <div className="flex items-center gap-3">
          <UserAvatar src={teacher.avatar} name={fullName(teacher)} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{fullName(teacher)}</p>
            <p className="truncate text-xs text-muted-foreground">{teacher.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'reg',
      header: t('Reg. number'),
      sortKey: 'regNumber',
      cell: (teacher) => (
        <span className="rounded-md bg-muted px-2 py-1 font-mono text-sm font-bold tracking-wider">
          {teacher.regNumber}
        </span>
      ),
    },
    { key: 'post', header: t('Post'), cell: (teacher) => teacher.postLabel },
    {
      key: 'courses',
      header: t('Courses & classes'),
      cell: (teacher) =>
        teacher.assignments.length ? (
          <div className="flex max-w-md flex-wrap gap-1">
            {teacher.assignments.slice(0, 4).map((a) => (
              <Badge key={a.id} variant="blue" className="font-medium">
                {a.course.code} · {a.class.name}
              </Badge>
            ))}
            {teacher.assignments.length > 4 && <Badge variant="gray">+{teacher.assignments.length - 4}</Badge>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{t('No courses')}</span>
        ),
    },
    {
      key: 'status',
      header: t('Account'),
      cell: (teacher) =>
        teacher.status === 'PENDING' ? (
          <StatusBadge status="LOW" label={t('Awaiting activation')} />
        ) : (
          <StatusBadge status={teacher.status} />
        ),
    },
    {
      key: 'lastLogin',
      header: t('Last sign-in'),
      sortKey: 'lastLoginAt',
      hidden: true,
      cell: (teacher) => (
        <span className="text-sm text-muted-foreground">
          {teacher.lastLoginAt ? formatDateTime(teacher.lastLoginAt) : t('Never')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('Actions')}</span>,
      fixed: true,
      align: 'right',
      cell: (teacher) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('Actions for {name}', { name: fullName(teacher) })}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(teacher)}>
              <Edit /> {t('Edit details')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAssigning(teacher)}>
              <BookOpenCheck /> {t('Assign courses')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPasswordFor(teacher)}>
              <KeyRound /> {t('Set password')}
            </DropdownMenuItem>
            {teacher.status === 'PENDING' && (
              <DropdownMenuItem
                onSelect={() =>
                  void api
                    .post<ActivationResult>(`/teachers/${teacher.id}/resend-activation`)
                    .then((activation) => setCreated({ teacher: teacher, activation }))
                    .catch((e) => toast.error(errorMessage(e)))
                }
              >
                <Mail /> {t('Resend activation email')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() =>
                void run(
                  () =>
                    api.patch(`/teachers/${teacher.id}/status`, {
                      isActive: !teacher.isActive,
                    }),
                  teacher.isActive ? t('Teacher deactivated') : t('Teacher activated'),
                )
              }
            >
              <Power /> {teacher.isActive ? t('Deactivate') : t('Activate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setDeleting(teacher)}>
              <Trash2 /> {t('Delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Teachers')}
        description={t(
          'Add teachers, assign their courses and manage their accounts. Teachers sign in with the registration number emailed to them.',
        )}
        icon={<GraduationCap />}
        actions={
          <>
            {can('courses.manage') && (
              <Button variant="outline" asChild>
                <Link href="/courses">
                  <BookOpenCheck aria-hidden /> {t('Courses')}
                </Link>
              </Button>
            )}
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden /> {t('Add teacher')}
            </Button>
          </>
        }
      />
      <DataTable
        storageKey="teachers"
        columns={columns}
        data={data?.data}
        rowKey={(teacher) => teacher.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        meta={data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        onSortChange={list.setSort}
        onRowClick={setEditing}
        empty={{
          icon: GraduationCap,
          title: t('No teachers yet'),
          description: t('Add a teacher; they receive their registration number on Gmail.'),
          action: (
            <Button size="sm" onClick={() => setEditing('new')}>
              {t('Add teacher')}
            </Button>
          ),
        }}
        toolbar={
          <>
            <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('Name, email or reg. number…')} />
            <FilterSelect
              value={list.filters.courseId}
              onChange={(v) => list.setFilter('courseId', v)}
              placeholder={t('Course')}
              allLabel={t('All courses')}
              options={(courses ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
            />
            <FilterSelect
              value={list.filters.classId}
              onChange={(v) => list.setFilter('classId', v)}
              placeholder={t('Class')}
              allLabel={t('All classes')}
              options={(classes ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
              className="sm:w-36"
            />
            <FilterSelect
              value={list.filters.post}
              onChange={(v) => list.setFilter('post', v)}
              placeholder={t('Post')}
              allLabel={t('All posts')}
              options={(posts ?? []).map((p) => ({
                value: p.code,
                label: `${p.label} (${p.code})`,
              }))}
            />
            <FilterSelect
              value={list.filters.activated}
              onChange={(v) => list.setFilter('activated', v)}
              placeholder={t('Account')}
              allLabel={t('Any account')}
              options={[
                { value: 'true', label: t('Activated') },
                { value: 'false', label: t('Awaiting activation') },
              ]}
            />
          </>
        }
      />

      {editing && (
        <TeacherDialog
          teacher={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(res) => {
            refresh();
            setCreated(res);
          }}
          onSaved={refresh}
        />
      )}
      {assigning && (
        <Dialog open onOpenChange={(o) => !o && setAssigning(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t('Courses for {name}', { name: fullName(assigning) })}</DialogTitle>
              <DialogDescription>{t('Tick the classes where this teacher teaches each course.')}</DialogDescription>
            </DialogHeader>
            <AssignmentsEditor
              initial={assigning.assignments.map((a) => ({
                courseId: a.course.id,
                classId: a.class.id,
              }))}
              onSave={async (pairs) => {
                await run(
                  () =>
                    api.put(`/teachers/${assigning.id}/assignments`, {
                      assignments: pairs,
                    }),
                  t('Courses updated'),
                );
                setAssigning(null);
              }}
              onCancel={() => setAssigning(null)}
            />
          </DialogContent>
        </Dialog>
      )}
      {passwordFor && <PasswordDialog teacher={passwordFor} onClose={() => setPasswordFor(null)} onDone={refresh} />}
      {created && <CreatedDialog result={created} onClose={() => setCreated(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('Delete {name}?', { name: deleting ? fullName(deleting) : '' })}
        description={t(
          'The teacher can no longer sign in and their course assignments are removed. Their registration number is never reused.',
        )}
        confirmLabel={t('Delete teacher')}
        onConfirm={() => run(() => api.delete(`/teachers/${deleting?.id}`), t('Teacher deleted'))}
      />
    </>
  );
}

// ─── Course × class grid ───

function AssignmentsEditor({
  initial,
  onSave,
  onCancel,
  saveLabel = t('Save courses'),
  embedded,
  onChange,
}: {
  initial: Pair[];
  onSave?: (pairs: Pair[]) => Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
  embedded?: boolean;
  onChange?: (pairs: Pair[]) => void;
}) {
  const { data: courses } = useCourses();
  const { data: classes } = useClasses();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial.map((p) => `${p.courseId}:${p.classId}`)),
  );
  const [busy, setBusy] = useState(false);
  const pairs = () =>
    [...selected].map((k) => ({
      courseId: Number(k.split(':')[0]),
      classId: Number(k.split(':')[1]),
    }));
  useEffect(() => onChange?.(pairs()), [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  if (!courses?.length)
    return (
      <EmptyState
        icon={BookOpenCheck}
        title={t('No courses yet')}
        description={t('Create courses first, then assign them to teachers.')}
        action={
          <Button asChild size="sm">
            <Link href="/courses">{t('Manage courses')}</Link>
          </Button>
        }
      />
    );

  return (
    <div className="space-y-3">
      <div className="max-h-[45vh] overflow-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">
                {t('Course')}
              </th>
              {classes?.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="whitespace-nowrap px-2 py-2 text-center text-xs font-bold text-muted-foreground"
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {courses.map((course) => (
              <tr key={course.id} className="hover:bg-muted/40">
                <th scope="row" className="px-3 py-2 text-left font-semibold">
                  {course.name}{' '}
                  <span className="font-mono text-xs font-normal text-muted-foreground">{course.code}</span>
                </th>
                {classes?.map((c) => {
                  const k = `${course.id}:${c.id}`;
                  // Nursery-only courses don't fit primary classes and vice versa.
                  const fits = !course.level || course.level === c.level;
                  return (
                    <td key={c.id} className="px-2 py-2 text-center">
                      <Checkbox
                        checked={selected.has(k)}
                        onCheckedChange={() => toggle(k)}
                        disabled={!fits && !selected.has(k)}
                        aria-label={t('{name} in {name2}', { name: course.name, name2: c.name })}
                        className={cn(!fits && 'opacity-30')}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {plural(
          selected.size,
          '{count} course/class assignment selected. Greyed boxes are courses for the other level.',
          '{count} course/class assignments selected. Greyed boxes are courses for the other level.',
        )}
      </p>
      {!embedded && (
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave?.(pairs());
              } finally {
                setBusy(false);
              }
            }}
          >
            {saveLabel}
          </Button>
        </DialogFooter>
      )}
    </div>
  );
}

// ─── Add / edit ───

function TeacherDialog({
  teacher,
  onClose,
  onCreated,
  onSaved,
}: {
  teacher: Teacher | null;
  onClose: () => void;
  onCreated: (r: { teacher: Teacher; activation: ActivationResult }) => void;
  onSaved: () => void;
}) {
  const { data: posts } = usePosts();
  const [pairs, setPairs] = useState<Pair[]>([]);
  const { register, handleSubmit, control, formState } = useForm<TeacherValues>({
    resolver: zodResolver(teacherSchema),
    defaultValues: {
      firstName: teacher?.firstName ?? '',
      lastName: teacher?.lastName ?? '',
      email: teacher?.email ?? '',
      phone: teacher?.phone ?? '',
      post: teacher?.post ?? 'TR',
    },
  });
  const e = formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{teacher ? t('Edit {name}', { name: fullName(teacher) }) : t('Add a teacher')}</DialogTitle>
          <DialogDescription>
            {teacher ? (
              <>
                {tRich('Registration number {number} never changes.', {
                  number: <span className="font-mono font-bold text-foreground">{teacher.regNumber}</span>,
                })}
              </>
            ) : (
              t(
                'A registration number (e.g. 26TR001) is generated and emailed to the teacher’s Gmail with a link to set their password.',
              )
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-5"
          onSubmit={handleSubmit(async (v) => {
            try {
              if (teacher) {
                await api.patch(`/teachers/${teacher.id}`, {
                  firstName: v.firstName,
                  lastName: v.lastName,
                  email: v.email,
                  phone: v.phone || null,
                });
                toast.success(t('Teacher updated'));
                onSaved();
                onClose();
              } else {
                const res = await api.post<{
                  teacher: Teacher;
                  activation: ActivationResult;
                }>('/teachers', {
                  ...v,
                  phone: v.phone || null,
                  assignments: pairs,
                });
                onCreated(res);
                onClose();
              }
            } catch (err) {
              toast.error(errorMessage(err));
            }
          })}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('First name')} htmlFor="t-first" required error={e.firstName}>
              <Input id="t-first" {...register('firstName')} />
            </Field>
            <Field label={t('Last name')} htmlFor="t-last" required error={e.lastName}>
              <Input id="t-last" {...register('lastName')} />
            </Field>
            <Field
              label={t('Gmail address')}
              htmlFor="t-email"
              required
              error={e.email}
              hint={t('The registration number and activation link are sent here')}
            >
              <Input
                id="t-email"
                type="email"
                placeholder={t('name@gmail.com')}
                autoComplete="off"
                {...register('email')}
              />
            </Field>
            <Field label={t('Phone')} htmlFor="t-phone">
              <Input id="t-phone" type="tel" {...register('phone')} />
            </Field>
            {!teacher && (
              <SelectField
                control={control}
                name="post"
                label={t('Post')}
                options={(posts ?? []).map((p) => ({
                  value: p.code,
                  label: `${p.label} (${p.code})`,
                }))}
              />
            )}
          </div>
          {!teacher && (
            <div>
              <p className="mb-2 text-sm font-semibold">{t('Assign courses')}</p>
              <AssignmentsEditor initial={[]} embedded onChange={setPairs} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              {teacher ? (
                t('Save')
              ) : (
                <>
                  <Mail aria-hidden /> {t('Add & send email')}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreatedDialog({
  result,
  onClose,
}: {
  result: { teacher: Teacher; activation: ActivationResult };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { teacher, activation } = result;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mint/20 text-mint-700 dark:text-mint">
            <MailCheck className="h-7 w-7" aria-hidden />
          </div>
          <DialogTitle className="text-center">{t('{name} is ready', { name: fullName(teacher) })}</DialogTitle>
          <DialogDescription className="text-center">
            {activation.emailSent
              ? t('The registration number and activation link were emailed to {sentTo}.', {
                  sentTo: activation.sentTo,
                })
              : t(
                  'Email is not configured on the server yet, so nothing was delivered to {sentTo}. Share the details below with the teacher.',
                  { sentTo: activation.sentTo },
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl bg-muted p-4 text-center">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{t('Registration number')}</p>
          <p className="font-mono text-3xl font-black tracking-widest">{teacher.regNumber}</p>
        </div>
        {activation.link && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">{t('Activation link (valid 72 hours)')}</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={activation.link}
                className="font-mono text-xs"
                aria-label={t('Activation link')}
                onFocus={(e) => e.target.select()}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label={t('Copy link')}
                onClick={() => {
                  void navigator.clipboard.writeText(activation.link ?? '');
                  setCopied(true);
                }}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            {t('Done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const pwSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, msg('Confirm the password')),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    get message() {
      return t('Passwords do not match');
    },
    path: ['confirmPassword'],
  });

function PasswordDialog({ teacher, onClose, onDone }: { teacher: Teacher; onClose: () => void; onDone: () => void }) {
  const { register, handleSubmit, formState } = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Set password for {name}', { name: fullName(teacher) })}</DialogTitle>
          <DialogDescription>
            {t(
              'Teachers cannot change their own password. The teacher is signed out everywhere and gets an email saying the password changed. Tell them the new password in person.',
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (v) => {
            try {
              await api.post(`/teachers/${teacher.id}/password`, v);
              toast.success(t('Password updated'), {
                description: t('{name} signs in with {regNumber}', {
                  name: fullName(teacher),
                  regNumber: teacher.regNumber,
                }),
              });
              onDone();
              onClose();
            } catch (e) {
              toast.error(errorMessage(e));
            }
          })}
        >
          <Field
            label={t('New password')}
            htmlFor="tp-new"
            error={formState.errors.newPassword}
            hint={t('8+ characters with upper & lower case and a number')}
          >
            <Input id="tp-new" type="password" autoComplete="new-password" {...register('newPassword')} />
          </Field>
          <Field label={t('Confirm password')} htmlFor="tp-confirm" error={formState.errors.confirmPassword}>
            <Input id="tp-confirm" type="password" autoComplete="new-password" {...register('confirmPassword')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              <KeyRound aria-hidden /> {t('Set password')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TeachersPage() {
  return (
    <RequirePermission permission="teachers.manage">
      <Suspense>
        <TeachersInner />
      </Suspense>
    </RequirePermission>
  );
}
