'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookMarked, Edit, Hash, Languages, Layers, MoreHorizontal, Plus, Printer, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Breadcrumbs } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ErrorState } from '@/components/shared/empty-state';
import { BookCover } from '@/components/shared/book-cover';
import { validateImage } from '@/components/forms/image-upload';
import { Field } from '@/components/forms/field';
import { BookDialog, CONDITIONS, IssueDialog } from '@/components/forms/library-dialogs';
import { api, errorMessage } from '@/lib/api';
import { formatDate, fullName } from '@/lib/utils';
import type { BookCopy, BookDetail, CopyCondition } from '@/types';
import { plural, t } from '@/lib/i18n';
import { enumLabel } from '@/lib/labels';

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [count, setCount] = useState('1');
  const [issueCopy, setIssueCopy] = useState<BookCopy | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const {
    data: b,
    error,
    refetch,
  } = useQuery({
    queryKey: ['book', id],
    queryFn: () => api.get<BookDetail>(`/library/books/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['book', id] });
    void qc.invalidateQueries({ queryKey: ['books'] });
    void qc.invalidateQueries({ queryKey: ['loans'] });
  };
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (!b) return <Skeleton className="h-96 rounded-2xl" />;

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('Library'), href: '/library' }, { label: b.title }]} />
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 md:flex-row">
          <label className="group relative block w-40 shrink-0 cursor-pointer">
            <BookCover book={b} />
            <span className="absolute inset-0 grid place-items-center rounded-xl bg-slate-950/50 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
              {t('Change cover')}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const err = validateImage(f);
                if (err) return toast.error(err);
                const form = new FormData();
                form.append('file', f);
                await run(() => api.upload(`/library/books/${b.id}/cover`, form), t('Cover updated'));
              }}
            />
          </label>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary">{b.category.name}</p>
            <h1 className="font-heading text-3xl font-black">{b.title}</h1>
            <p className="text-muted-foreground">{b.author ?? t('Unknown author')}</p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Meta icon={Hash} k="ISBN" v={b.isbn} />
              <Meta icon={Languages} k={t('Language')} v={b.language} />
              <Meta icon={Users} k={t('Age level')} v={b.ageLevel} />
              <Meta icon={Layers} k={t('Shelf')} v={b.shelfLocation} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {[
                b.publisher,
                b.publishedYear,
                plural(b.timesBorrowed, 'Borrowed {count} time', 'Borrowed {count} times'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="no-print mt-5 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  void api.openPdf(`/library/books/${b.id}/labels`).catch((e) => toast.error(errorMessage(e)))
                }
              >
                <Printer aria-hidden /> {t('Print labels')}
              </Button>
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                <Plus aria-hidden /> {t('Add copies')}
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Edit aria-hidden /> {t('Edit')}
              </Button>
              <Button variant="ghost" className="text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden /> {t('Delete')}
              </Button>
            </div>
          </div>
          <div className="flex shrink-0 gap-3 md:flex-col">
            <div className="rounded-2xl bg-emerald-500/10 px-5 py-3 text-center">
              <p className="tabular font-heading text-3xl font-black text-emerald-700 dark:text-emerald-300">
                {b.availableCopies}
              </p>
              <p className="text-xs font-semibold text-muted-foreground">{t('available')}</p>
            </div>
            <div className="rounded-2xl bg-muted px-5 py-3 text-center">
              <p className="tabular font-heading text-3xl font-black">{b.totalCopies}</p>
              <p className="text-xs font-semibold text-muted-foreground">{t('copies')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('Copies')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {b.copies.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="tabular w-28 font-mono text-sm font-bold">{c.copyCode}</span>
                  <StatusBadge status={c.status} />
                  <span className="text-xs text-muted-foreground">
                    {t('Condition: {condition}', { condition: enumLabel(c.condition) })}
                  </span>
                  {c.currentLoan && (
                    <span className="text-xs text-muted-foreground">
                      →{' '}
                      {t('{borrower}, due {date}', {
                        borrower: c.currentLoan.student ? fullName(c.currentLoan.student) : c.currentLoan.borrowerName,
                        date: formatDate(c.currentLoan.dueDate),
                      })}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    {c.status === 'AVAILABLE' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setIssueCopy({
                            ...c,
                            book: {
                              id: b.id,
                              title: b.title,
                              author: b.author,
                              coverImage: b.coverImage,
                              ageLevel: b.ageLevel,
                            },
                          })
                        }
                      >
                        <BookMarked aria-hidden /> {t('Issue')}
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('Manage {copyCode}', { copyCode: c.copyCode })}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{t('Condition')}</DropdownMenuLabel>
                        {CONDITIONS.map((cond) => (
                          <DropdownMenuItem
                            key={cond.value}
                            onSelect={() =>
                              void run(
                                () =>
                                  api.patch(`/library/copies/${c.id}`, {
                                    condition: cond.value as CopyCondition,
                                  }),
                                t('Condition updated'),
                              )
                            }
                          >
                            {cond.label}
                          </DropdownMenuItem>
                        ))}
                        {c.status !== 'BORROWED' && (
                          <>
                            <DropdownMenuSeparator />
                            {c.status !== 'AVAILABLE' && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  void run(
                                    () =>
                                      api.patch(`/library/copies/${c.id}`, {
                                        status: 'AVAILABLE',
                                      }),
                                    t('Copy back in circulation'),
                                  )
                                }
                              >
                                {t('Mark available')}
                              </DropdownMenuItem>
                            )}
                            {c.status !== 'DAMAGED' && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  void run(
                                    () =>
                                      api.patch(`/library/copies/${c.id}`, {
                                        status: 'DAMAGED',
                                      }),
                                    t('Copy marked damaged'),
                                  )
                                }
                              >
                                {t('Mark damaged')}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onSelect={() =>
                                void api.openPdf(`/library/books/${b.id}/labels`, { copyIds: String(c.id) })
                              }
                            >
                              {t('Print label')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              destructive
                              onSelect={() => void run(() => api.delete(`/library/copies/${c.id}`), t('Copy removed'))}
                            >
                              {t('Remove copy')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
              {!b.copies.length && <li className="p-5 text-sm text-muted-foreground">{t('No copies yet.')}</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Recent loans')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {b.recentLoans.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    {l.student ? (
                      <Link href={`/students/${l.student.id}`} className="font-semibold hover:text-primary">
                        {fullName(l.student)}
                      </Link>
                    ) : (
                      <span className="font-semibold">
                        {t('{borrowerName} (staff)', { borrowerName: l.borrowerName })}
                      </span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {l.bookCopy.copyCode} · {formatDate(l.issuedAt)} →{' '}
                      {l.returnedAt ? formatDate(l.returnedAt) : t('due {date}', { date: formatDate(l.dueDate) })}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </li>
              ))}
              {!b.recentLoans.length && (
                <li className="p-5 text-sm text-muted-foreground">{t('Never borrowed yet.')}</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <BookDialog book={b} open={editOpen} onOpenChange={setEditOpen} onSaved={refresh} />
      <IssueDialog
        open={!!issueCopy}
        onOpenChange={(o) => !o && setIssueCopy(null)}
        presetCopy={issueCopy}
        onSaved={refresh}
      />
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('Add copies')}</DialogTitle>
          </DialogHeader>
          <Field label={t('How many?')} htmlFor="add-count">
            <Input
              id="add-count"
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={async () => {
                await run(
                  () =>
                    api.post(`/library/books/${b.id}/copies`, {
                      count: Number(count),
                    }),
                  plural(Number(count), '{count} copy added', '{count} copies added'),
                );
                setAddOpen(false);
              }}
            >
              {t('Add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('Delete "{title}"?', { title: b.title })}
        description={t('The book and its copies are archived. Books with copies on loan cannot be deleted.')}
        confirmLabel={t('Delete')}
        onConfirm={async () => {
          try {
            await api.delete(`/library/books/${b.id}`);
            toast.success(t('Book deleted'));
            void qc.invalidateQueries({ queryKey: ['books'] });
            router.replace('/library');
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

function Meta({ icon: Icon, k, v }: { icon: typeof Hash; k: string; v?: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">{k}</p>
        <p className="font-medium">{v || '—'}</p>
      </div>
    </div>
  );
}
