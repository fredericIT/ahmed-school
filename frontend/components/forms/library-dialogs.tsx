'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen, Check, GraduationCap, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/misc';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Field, SelectField } from '@/components/forms/field';
import { useBookCategories, useCurrency, useSettings } from '@/hooks/use-lookups';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDate, fullName, todayKigali } from '@/lib/utils';
import type { Book, BookCopy, CopyCondition, Loan, StudentListItem } from '@/types';
import { msg, t } from '@/lib/i18n';

export function LibraryNav() {
  const pathname = usePathname();
  const tabs = [
    {
      href: '/library',
      label: t('Catalogue'),
      match: (p: string) => p === '/library' || p.startsWith('/library/books'),
    },
    {
      href: '/library/loans',
      label: t('Loans'),
      match: (p: string) => p.startsWith('/library/loans'),
    },
    {
      href: '/library/categories',
      label: t('Categories'),
      match: (p: string) => p.startsWith('/library/categories'),
    },
  ];
  return (
    <nav className="mb-4 inline-flex gap-1 rounded-xl bg-muted p-1" aria-label={t('Library sections')}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.match(pathname) ? 'page' : undefined}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground',
            tab.match(pathname) && 'bg-card text-foreground shadow-sm',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export const CONDITIONS: { value: CopyCondition; label: string }[] = [
  {
    value: 'NEW',
    get label() {
      return t('New');
    },
  },
  {
    value: 'GOOD',
    get label() {
      return t('Good');
    },
  },
  {
    value: 'FAIR',
    get label() {
      return t('Fair');
    },
  },
  {
    value: 'POOR',
    get label() {
      return t('Poor');
    },
  },
  {
    value: 'DAMAGED',
    get label() {
      return t('Damaged');
    },
  },
];

// ─── Book create / edit ───

const bookSchema = z.object({
  title: z.string().trim().min(1, msg('Title is required')).max(200),
  author: z.string().max(150).optional(),
  isbn: z.union([z.string().regex(/^[0-9Xx-]{10,17}$/, msg('Invalid ISBN')), z.literal('')]).optional(),
  publisher: z.string().max(150).optional(),
  publishedYear: z.union([z.coerce.number().int().min(1800).max(2100), z.literal('')]).optional(),
  language: z.string().max(40).optional(),
  ageLevel: z.string().max(30).optional(),
  categoryId: z.number({
    get required_error() {
      return t('Choose a category');
    },
    get invalid_type_error() {
      return t('Choose a category');
    },
  }),
  shelfLocation: z.string().max(50).optional(),
  copies: z.coerce.number().int().min(0).max(200),
});
type BookValues = z.infer<typeof bookSchema>;

export function BookDialog({
  book,
  open,
  onOpenChange,
  onSaved,
}: {
  book?: Book | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (b: Book) => void;
}) {
  const { data: categories } = useBookCategories();
  const { register, handleSubmit, control, reset, formState } = useForm<BookValues>({
    resolver: zodResolver(bookSchema),
  });
  useEffect(() => {
    if (open)
      reset({
        title: book?.title ?? '',
        author: book?.author ?? '',
        isbn: book?.isbn ?? '',
        publisher: book?.publisher ?? '',
        publishedYear: book?.publishedYear ?? '',
        language: book?.language ?? t('English'),
        ageLevel: book?.ageLevel ?? '',
        categoryId: book?.categoryId,
        shelfLocation: book?.shelfLocation ?? '',
        copies: 1,
      });
  }, [open, book, reset]);
  const e = formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{book ? t('Edit book') : t('Add a book')}</DialogTitle>
          {!book && (
            <DialogDescription>{t('Copies get codes like LIB-000123 that you can print as labels.')}</DialogDescription>
          )}
        </DialogHeader>
        <form
          noValidate
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit(async (v) => {
            const { copies, ...rest } = v;
            const body = {
              ...rest,
              author: v.author || null,
              isbn: v.isbn || null,
              publisher: v.publisher || null,
              publishedYear: v.publishedYear === '' || v.publishedYear === undefined ? null : Number(v.publishedYear),
              language: v.language || null,
              ageLevel: v.ageLevel || null,
              shelfLocation: v.shelfLocation || null,
            };
            try {
              const saved = book
                ? await api.patch<Book>(`/library/books/${book.id}`, body)
                : await api.post<Book>('/library/books', { ...body, copies });
              toast.success(book ? t('Book updated') : t('Book added'));
              onSaved(saved);
              onOpenChange(false);
            } catch (err) {
              toast.error(errorMessage(err));
            }
          })}
        >
          <Field label={t('Title')} htmlFor="b-title" required error={e.title} className="sm:col-span-2">
            <Input id="b-title" {...register('title')} />
          </Field>
          <Field label={t('Author')} htmlFor="b-author">
            <Input id="b-author" {...register('author')} />
          </Field>
          <SelectField
            control={control}
            name="categoryId"
            label={t('Category')}
            required
            numeric
            error={e.categoryId}
            options={(categories ?? []).map((c) => ({
              value: String(c.id),
              label: c.name,
            }))}
          />
          <Field label={t('ISBN')} htmlFor="b-isbn" error={e.isbn}>
            <Input id="b-isbn" {...register('isbn')} />
          </Field>
          <Field label={t('Publisher')} htmlFor="b-pub">
            <Input id="b-pub" {...register('publisher')} />
          </Field>
          <Field label={t('Year')} htmlFor="b-year" error={e.publishedYear as never}>
            <Input id="b-year" type="number" {...register('publishedYear')} />
          </Field>
          <Field label={t('Language')} htmlFor="b-lang">
            <Input id="b-lang" list="langs" {...register('language')} />
            <datalist id="langs">
              <option value="English" />
              <option value="Kinyarwanda" />
              <option value="French" />
              <option value="Swahili" />
            </datalist>
          </Field>
          <Field label={t('Age level')} htmlFor="b-age" hint={t('e.g. 3-5, 5-8, Teacher')}>
            <Input id="b-age" {...register('ageLevel')} />
          </Field>
          <Field label={t('Shelf')} htmlFor="b-shelf">
            <Input id="b-shelf" {...register('shelfLocation')} />
          </Field>
          {!book && (
            <Field label={t('Number of copies')} htmlFor="b-copies" error={e.copies}>
              <Input id="b-copies" type="number" min={0} max={200} {...register('copies')} />
            </Field>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              {t('Save book')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Issue ───

export function IssueDialog({
  open,
  onOpenChange,
  presetCopy,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  presetCopy?: BookCopy | null;
  onSaved: () => void;
}) {
  const { data: settings } = useSettings();
  const [mode, setMode] = useState<'student' | 'staff'>('student');
  const [studentQ, setStudentQ] = useState('');
  const [student, setStudent] = useState<StudentListItem | null>(null);
  const [staffName, setStaffName] = useState('');
  const [copyQ, setCopyQ] = useState('');
  const [copy, setCopy] = useState<BookCopy | null>(presetCopy ?? null);
  const [dueDate, setDueDate] = useState('');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('student');
    setStudent(null);
    setStudentQ('');
    setStaffName('');
    setCopy(presetCopy ?? null);
    setCopyQ('');
    setRemark('');
    const d = new Date(`${todayKigali()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (settings?.loanPeriodDays ?? 7));
    setDueDate(d.toISOString().slice(0, 10));
  }, [open, presetCopy, settings?.loanPeriodDays]);

  const { data: students } = useQuery({
    queryKey: ['issue-students', studentQ],
    queryFn: () => api.list<StudentListItem>('/students', { search: studentQ, pageSize: 6 }),
    enabled: open && studentQ.length >= 2 && !student,
  });
  const { data: studentLoans } = useQuery({
    queryKey: ['student-loans', student?.id],
    queryFn: () => api.get<Loan[]>(`/students/${student?.id}/loans`),
    enabled: !!student,
  });
  const { data: copies } = useQuery({
    queryKey: ['issue-copies', copyQ],
    queryFn: () =>
      api.get<BookCopy[]>('/library/copies', {
        search: copyQ,
        available: true,
      }),
    enabled: open && copyQ.length >= 2 && !copy,
  });
  const active = studentLoans?.filter((l) => l.status === 'BORROWED' || l.status === 'OVERDUE').length ?? 0;
  const atLimit = mode === 'student' && !!student && active >= (settings?.maxBooksPerStudent ?? 2);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/library/loans', {
        bookCopyId: copy?.id,
        studentId: mode === 'student' ? student?.id : undefined,
        borrowerName: mode === 'staff' ? staffName : undefined,
        dueDate,
        remark: remark || undefined,
      });
      toast.success(t('"{title}" issued', { title: copy?.book?.title }), {
        description: t('Due {date}', { date: formatDate(dueDate) }),
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('Issue a book')}</DialogTitle>
          <DialogDescription>
            {t('Loan period {days} days · max {max} books per student.', {
              days: settings?.loanPeriodDays ?? 7,
              max: settings?.maxBooksPerStudent ?? 2,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex rounded-xl bg-muted p-1" role="radiogroup" aria-label={t('Borrower type')}>
          {(
            [
              ['student', t('Student'), GraduationCap],
              ['staff', t('Staff member'), UserRound],
            ] as const
          ).map(([k, l, Icon]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={mode === k}
              onClick={() => setMode(k)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-semibold text-muted-foreground',
                mode === k && 'bg-card text-foreground shadow-sm',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden /> {l}
            </button>
          ))}
        </div>

        {mode === 'student' ? (
          <Field
            label={t('Student')}
            htmlFor="iss-student"
            required
            error={
              atLimit
                ? t('{name} already has {count} book(s) — the limit is {limit}', {
                    name: student?.firstName,
                    count: active,
                    limit: settings?.maxBooksPerStudent,
                  })
                : undefined
            }
          >
            {student ? (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-2">
                <UserAvatar src={student.photo} name={fullName(student)} size="sm" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{fullName(student)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('{name} · {active} book(s) on loan', { name: student.currentClass?.name, active })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStudent(null)}>
                  {t('Change')}
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="iss-student"
                  value={studentQ}
                  onChange={(e) => setStudentQ(e.target.value)}
                  placeholder={t('Search name or admission no…')}
                  autoFocus
                />
                {students && (
                  <ul className="max-h-48 divide-y overflow-auto rounded-xl border">
                    {students.data.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setStudent(s)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <UserAvatar src={s.photo} name={fullName(s)} size="xs" />
                          <span className="flex-1 font-medium">{fullName(s)}</span>
                          <span className="text-xs text-muted-foreground">{s.currentClass?.name}</span>
                        </button>
                      </li>
                    ))}
                    {!students.data.length && (
                      <li className="px-3 py-2 text-sm text-muted-foreground">{t('No students found')}</li>
                    )}
                  </ul>
                )}
              </>
            )}
          </Field>
        ) : (
          <Field label={t('Staff member name')} htmlFor="iss-staff" required>
            <Input
              id="iss-staff"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder={t('e.g. Mrs. Uwera')}
            />
          </Field>
        )}

        <Field label={t('Book copy')} htmlFor="iss-copy" required>
          {copy ? (
            <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-2">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-coral/15 text-coral-700">
                <BookOpen className="h-5 w-5" aria-hidden />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{copy.book?.title}</p>
                <p className="tabular text-xs text-muted-foreground">
                  {copy.copyCode} · {copy.condition.toLowerCase()}
                </p>
              </div>
              {!presetCopy && (
                <Button variant="ghost" size="sm" onClick={() => setCopy(null)}>
                  {t('Change')}
                </Button>
              )}
            </div>
          ) : (
            <>
              <Input
                id="iss-copy"
                value={copyQ}
                onChange={(e) => setCopyQ(e.target.value)}
                placeholder={t('Scan / type copy code or search title…')}
              />
              {copies && (
                <ul className="max-h-48 divide-y overflow-auto rounded-xl border">
                  {copies.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setCopy(c)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span className="font-medium">{c.book?.title}</span>
                        <span className="tabular text-xs text-muted-foreground">{c.copyCode}</span>
                      </button>
                    </li>
                  ))}
                  {!copies.length && (
                    <li className="px-3 py-2 text-sm text-muted-foreground">{t('No available copies match')}</li>
                  )}
                </ul>
              )}
            </>
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('Due date')} htmlFor="iss-due">
            <Input
              id="iss-due"
              type="date"
              min={todayKigali()}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field label={t('Remark')} htmlFor="iss-remark">
            <Input id="iss-remark" value={remark} onChange={(e) => setRemark(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => void submit()}
            loading={busy}
            disabled={!copy || (mode === 'student' ? !student || atLimit : staffName.trim().length < 2)}
          >
            <Check aria-hidden /> {t('Issue book')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Return / lost ───

export function ReturnDialog({
  loan,
  mode,
  onOpenChange,
  onSaved,
}: {
  loan: Loan | null;
  mode: 'return' | 'lost';
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const currency = useCurrency();
  const { data: settings } = useSettings();
  const [condition, setCondition] = useState<CopyCondition>('GOOD');
  const [fine, setFine] = useState('');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCondition('GOOD');
    setFine(mode === 'lost' ? String(settings?.lostBookFine ?? 0) : '');
    setRemark('');
  }, [loan, mode, settings?.lostBookFine]);
  if (!loan) return null;
  const overdueDays = loan.daysOverdue ?? 0;
  const overdueFine = overdueDays * (settings?.overdueFinePerDay ?? 0);

  return (
    <Dialog open={!!loan} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'return' ? t('Return book') : t('Mark book as lost')}</DialogTitle>
          <DialogDescription>
            “{loan.bookCopy.book.title}” ({loan.bookCopy.copyCode}) —{' '}
            {loan.student ? fullName(loan.student) : loan.borrowerName}
          </DialogDescription>
        </DialogHeader>
        {overdueDays > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-red-500/10 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300">
            <span>{t('{overdueDays} day(s) overdue', { overdueDays })}</span>
            {overdueFine > 0 && (
              <StatusBadge
                status="OVERDUE"
                label={t('{count} {currency} late fee', { count: overdueFine, currency })}
              />
            )}
          </div>
        )}
        {mode === 'return' ? (
          <>
            <Field label={t('Condition on return')}>
              <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={t('Condition')}>
                {CONDITIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={condition === c.value}
                    onClick={() => setCondition(c.value)}
                    className={cn(
                      'rounded-lg border py-2 text-xs font-bold',
                      condition === c.value
                        ? c.value === 'DAMAGED'
                          ? 'border-red-500 bg-red-500/10 text-red-700'
                          : 'border-primary bg-primary/10 text-primary'
                        : 'hover:bg-accent',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>
            {condition === 'DAMAGED' && (
              <p className="text-xs text-muted-foreground">{t('Damaged copies are taken out of circulation.')}</p>
            )}
            <Field
              label={t('Damage fine ({currency})', { currency })}
              htmlFor="r-fine"
              hint={t('Optional, added to any late fee')}
            >
              <Input id="r-fine" type="number" min={0} value={fine} onChange={(e) => setFine(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label={t('Replacement fine ({currency})', { currency })} htmlFor="l-fine">
            <Input id="l-fine" type="number" min={0} value={fine} onChange={(e) => setFine(e.target.value)} />
          </Field>
        )}
        <Field label={t('Remark')} htmlFor="r-remark">
          <Textarea id="r-remark" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            variant={mode === 'lost' ? 'destructive' : 'mint'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (mode === 'return') {
                  const r = await api.post<{ fine: number; daysLate: number }>(`/library/loans/${loan.id}/return`, {
                    condition,
                    damageFine: Number(fine || 0),
                    remark: remark || undefined,
                  });
                  toast.success(t('Book returned'), {
                    description:
                      r.fine > 0
                        ? t('Fine: {count} {currency}', { count: r.fine, currency })
                        : r.daysLate
                          ? t('{daysLate} day(s) late', { daysLate: r.daysLate })
                          : t('On time 👍'),
                  });
                } else {
                  await api.post(`/library/loans/${loan.id}/lost`, {
                    fine: Number(fine || 0),
                    remark: remark || undefined,
                  });
                  toast.success(t('Marked as lost'));
                }
                onSaved();
                onOpenChange(false);
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === 'return' ? t('Confirm return') : t('Mark lost')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
