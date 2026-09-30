'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  ImagePlus,
  MapPin,
  MoreVertical,
  Trash2,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Breadcrumbs } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/shared/empty-state';
import { Field } from '@/components/forms/field';
import { validateImage } from '@/components/forms/image-upload';
import { categoryMeta } from '@/components/forms/activity-form';
import { useCurrency } from '@/hooks/use-lookups';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatMoney, fullName } from '@/lib/utils';
import type { Activity, ActivityStatus } from '@/types';
import { plural, t } from '@/lib/i18n';
import { enumLabel } from '@/lib/labels';

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const currency = useCurrency();
  const { can } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState<null | 'soft' | 'hard'>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const {
    data: a,
    error,
    refetch,
  } = useQuery({
    queryKey: ['activity', id],
    queryFn: () => api.get<Activity>(`/activities/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['activity', id] });
    void qc.invalidateQueries({ queryKey: ['activities'] });
  };

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (!a) return <Skeleton className="h-96 rounded-2xl" />;
  const meta = categoryMeta(a.category);

  const setStatus = async (status: ActivityStatus) => {
    try {
      await api.patch(`/activities/${a.id}/status`, { status });
      toast.success(t('Marked as {status}', { status: enumLabel(status) }));
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 10);
    for (const f of list) {
      const err = validateImage(f);
      if (err) return toast.error(`${f.name}: ${err}`); // i18n-ignore: err is translated
    }
    const form = new FormData();
    list.forEach((f) => form.append('files', f));
    setUploading(true);
    try {
      await api.upload(`/activities/${a.id}/photos`, form);
      toast.success(plural(list.length, '{count} photo added', '{count} photos added'));
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const variance = a.budget != null && a.actualCost != null ? Number(a.budget) - Number(a.actualCost) : null;

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('Activities'), href: '/activities' }, { label: a.title }]} />
      <Card className="overflow-hidden">
        <div className="gradient-hero relative p-6 text-white sm:p-8">
          <span className="absolute right-6 top-4 text-6xl opacity-90" aria-hidden>
            {meta.emoji}
          </span>
          <Badge variant="outline" className="bg-white/15 text-white ring-white/30">
            {meta.label}
          </Badge>
          <h1 className="mt-3 max-w-3xl font-heading text-3xl font-black sm:text-4xl">{a.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/90">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" aria-hidden /> {formatDate(a.date)}
            </span>
            {a.startTime && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" aria-hidden /> {a.startTime}
                {a.endTime && ` – ${a.endTime}`}
              </span>
            )}
            {a.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden /> {a.location}
              </span>
            )}
            {a.organizer && (
              <span className="flex items-center gap-1.5">
                <User className="h-4 w-4" aria-hidden /> {a.organizer}
              </span>
            )}
          </div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2 p-4">
          <StatusBadge status={a.status} />
          {a.term && <Badge variant="gray">{a.term.name}</Badge>}
          <div className="ml-auto flex flex-wrap gap-2">
            {a.status !== 'COMPLETED' && a.status !== 'CANCELLED' && (
              <Button variant="mint" onClick={() => setCompleteOpen(true)}>
                <CheckCircle2 aria-hidden /> {t('Mark completed')}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => void api.openPdf(`/activities/${a.id}/report`).catch((e) => toast.error(errorMessage(e)))}
            >
              <FileText aria-hidden /> {t('Report')}
            </Button>
            <Button asChild>
              <Link href={`/activities/${a.id}/edit`}>
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
                {a.status === 'PLANNED' && (
                  <DropdownMenuItem onSelect={() => void setStatus('ONGOING')}>{t('Mark as ongoing')}</DropdownMenuItem>
                )}
                {a.status !== 'CANCELLED' && (
                  <DropdownMenuItem onSelect={() => void setStatus('CANCELLED')}>
                    {t('Cancel activity')}
                  </DropdownMenuItem>
                )}
                {a.status === 'CANCELLED' && (
                  <DropdownMenuItem onSelect={() => void setStatus('PLANNED')}>
                    {t('Re-open as planned')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setDeleteOpen('soft')}>
                  <Trash2 /> {t('Delete')}
                </DropdownMenuItem>
                {can('records.hardDelete') && (
                  <DropdownMenuItem destructive onSelect={() => setDeleteOpen('hard')}>
                    <Trash2 /> {t('Delete permanently')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {(a.description || a.outcome) && (
            <Card>
              <CardContent className="space-y-5 p-6">
                {a.description && (
                  <div>
                    <p className="mb-1 font-heading font-bold">{t('About')}</p>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{a.description}</p>
                  </div>
                )}
                {a.outcome && (
                  <div className="rounded-xl bg-mint/10 p-4 ring-1 ring-mint/30">
                    <p className="mb-1 flex items-center gap-2 font-heading font-bold text-mint-700 dark:text-mint">
                      <CheckCircle2 className="h-4 w-4" aria-hidden /> {t('Outcome & notes')}
                    </p>
                    <p className="whitespace-pre-line text-sm">{a.outcome}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>{t('Photo gallery')}</CardTitle>
              <Button variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                {!uploading && <ImagePlus aria-hidden />} {t('Add photos')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = '';
                }}
              />
            </CardHeader>
            <CardContent>
              {a.photos.length === 0 ? (
                <EmptyState
                  icon={ImagePlus}
                  title={t('No photos yet')}
                  description={t('Upload up to 10 photos at a time (max 2 MB each).')}
                  className="py-8"
                />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {a.photos.map((p) => (
                    <figure key={p.id} className="group relative overflow-hidden rounded-xl border">
                      <button
                        type="button"
                        onClick={() => setLightbox(p.url)}
                        className="block w-full"
                        aria-label={p.caption ? t('Open photo: {caption}', { caption: p.caption }) : t('Open photo')}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={p.caption ?? a.title}
                          className="aspect-[4/3] w-full object-cover transition group-hover:scale-105"
                        />
                      </button>
                      {p.caption && (
                        <figcaption className="truncate p-2 text-xs text-muted-foreground">{p.caption}</figcaption>
                      )}
                      <ConfirmDialog
                        title={t('Delete this photo?')}
                        confirmLabel={t('Delete')}
                        onConfirm={async () => {
                          try {
                            await api.delete(`/activities/${a.id}/photos/${p.id}`);
                            refresh();
                          } catch (e) {
                            toast.error(errorMessage(e));
                          }
                        }}
                        trigger={
                          <button
                            className="absolute right-2 top-2 rounded-full bg-slate-950/60 p-1.5 text-white opacity-0 transition focus:opacity-100 group-hover:opacity-100"
                            aria-label={t('Delete photo')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        }
                      />
                    </figure>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" aria-hidden /> {t('Costs')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row k={t('Budget')} v={formatMoney(a.budget, currency)} />
              <Row k={t('Actual cost')} v={formatMoney(a.actualCost, currency)} />
              {variance !== null && (
                <Row
                  k={variance >= 0 ? t('Under budget') : t('Over budget')}
                  v={
                    <span className={variance >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {formatMoney(Math.abs(variance), currency)}
                    </span>
                  }
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" aria-hidden /> {t('Participants')}
                <Badge variant="default" className="ml-auto">
                  {plural(a.totalParticipants, '{count} child', '{count} children')}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {a.classes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {a.classes.map((c) => (
                    <Badge key={c.id} variant="blue">
                      {c.name}
                    </Badge>
                  ))}
                </div>
              )}
              {a.students.map((s) => (
                <Link
                  key={s.id}
                  href={`/students/${s.id}`}
                  className="flex items-center gap-2 rounded-lg p-1 hover:bg-accent"
                >
                  <UserAvatar src={s.photo} name={fullName(s)} size="xs" />
                  <span className="text-sm font-medium">{fullName(s)}</span>
                </Link>
              ))}
              {!a.classes.length && !a.students.length && (
                <p className="text-sm text-muted-foreground">{t('No participants assigned.')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CompleteDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        activity={a}
        currency={currency}
        onDone={refresh}
      />
      <ConfirmDialog
        open={deleteOpen !== null}
        onOpenChange={(o) => !o && setDeleteOpen(null)}
        title={deleteOpen === 'hard' ? t('Delete permanently?') : t('Delete this activity?')}
        description={
          deleteOpen === 'hard'
            ? t('The activity and its photos are removed forever.')
            : t('The activity will be hidden from lists and reports.')
        }
        confirmLabel={t('Delete')}
        onConfirm={async () => {
          try {
            await api.delete(`/activities/${a.id}`, deleteOpen === 'hard' ? { hard: true } : undefined);
            toast.success(t('Activity deleted'));
            void qc.invalidateQueries({ queryKey: ['activities'] });
            router.replace('/activities');
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl bg-slate-950 p-2" hideClose>
          <DialogTitle className="sr-only">{t('Photo')}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {lightbox && <img src={lightbox} alt="" className="max-h-[85vh] w-full rounded-xl object-contain" />}
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white"
            aria-label={t('Close')}
          >
            <X className="h-4 w-4" />
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular font-semibold">{v}</span>
    </div>
  );
}

function CompleteDialog({
  open,
  onOpenChange,
  activity,
  currency,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activity: Activity;
  currency: string;
  onDone: () => void;
}) {
  const [outcome, setOutcome] = useState(activity.outcome ?? '');
  const [cost, setCost] = useState(activity.actualCost?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Complete activity')}</DialogTitle>
        </DialogHeader>
        <Field
          label={t('Outcome & notes')}
          htmlFor="outcome"
          required
          hint={t('What happened, how many children took part, anything to follow up.')}
        >
          <Textarea id="outcome" rows={5} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        </Field>
        <Field label={t('Actual cost ({currency})', { currency })} htmlFor="cost">
          <Input id="cost" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            variant="mint"
            loading={busy}
            disabled={outcome.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post(`/activities/${activity.id}/complete`, {
                  outcome,
                  actualCost: cost === '' ? null : Number(cost),
                });
                toast.success(t('Activity completed 🎉'));
                onDone();
                onOpenChange(false);
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <CheckCircle2 aria-hidden /> {t('Complete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
