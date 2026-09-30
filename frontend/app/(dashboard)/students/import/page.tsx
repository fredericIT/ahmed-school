'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, FileUp, UploadCloud, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { plural, t } from '@/lib/i18n';

interface ImportResult {
  total: number;
  imported: number;
  dryRun: boolean;
  errors: { row: number; messages: string[] }[];
  created: { row: number; id: number; admissionNumber: string; name: string }[];
}

export default function ImportStudentsPage() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<null | 'check' | 'import'>(null);

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? 'check' : 'import');
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.upload<ImportResult>('/students/import', form, {
        dryRun,
      });
      setResult(r);
      if (!dryRun) {
        toast.success(plural(r.imported, '{count} student imported', '{count} students imported'));
        void qc.invalidateQueries({ queryKey: ['students'] });
      } else if (!r.errors.length) toast.success(t('All {total} rows are valid — ready to import', { total: r.total }));
      else toast.warning(plural(r.errors.length, '{count} row needs attention', '{count} rows need attention'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title={t('Import students')}
        description={t('Register many students at once from an Excel file.')}
        icon={<FileUp />}
        breadcrumbs={[{ label: t('Students'), href: '/students' }, { label: t('Import') }]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="p-6">
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) {
                  setFile(f);
                  setResult(null);
                }
              }}
              className={cn(
                'flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition hover:border-primary hover:bg-primary/5',
                file ? 'border-mint bg-mint/5' : 'border-primary/30',
              )}
            >
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                {file ? (
                  <FileSpreadsheet className="h-7 w-7" aria-hidden />
                ) : (
                  <UploadCloud className="h-7 w-7" aria-hidden />
                )}
              </div>
              <p className="font-heading text-lg font-bold">{file ? file.name : t('Drop your Excel file here')}</p>
              <p className="text-sm text-muted-foreground">
                {file
                  ? t('{size} KB · click to choose another', { size: Math.round(file.size / 1024) })
                  : t('or click to browse (.xlsx, max 5 MB)')}
              </p>
              <input
                ref={input}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setResult(null);
                }}
              />
            </button>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={!file} loading={busy === 'check'} onClick={() => void run(true)}>
                {t('Validate only')}
              </Button>
              <Button
                disabled={!file || result?.dryRun === false}
                loading={busy === 'import'}
                onClick={() => void run(false)}
              >
                <FileUp aria-hidden /> {t('Import valid rows')}
              </Button>
            </div>

            {result && (
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label={t('Rows')} value={result.total} />
                  <Stat
                    label={result.dryRun ? t('Valid') : t('Imported')}
                    value={result.dryRun ? result.total - result.errors.length : result.imported}
                    tone="mint"
                  />
                  <Stat
                    label={t('With errors')}
                    value={result.errors.length}
                    tone={result.errors.length ? 'coral' : undefined}
                  />
                </div>
                {result.errors.length > 0 && (
                  <div className="rounded-2xl border border-destructive/30">
                    <p className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm font-semibold text-destructive">
                      {t('Validation report')}
                    </p>
                    <ul className="max-h-80 divide-y overflow-auto">
                      {result.errors.map((e) => (
                        <li key={e.row} className="flex gap-3 px-4 py-2 text-sm">
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                          <span>
                            <span className="font-semibold">{t('Row {row}:', { row: e.row })}</span>{' '}
                            {e.messages.join('; ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.created.length > 0 && (
                  <div className="rounded-2xl border border-mint/40">
                    <p className="border-b bg-mint/10 px-4 py-2 text-sm font-semibold text-mint-700 dark:text-mint">
                      {t('Imported students')}
                    </p>
                    <ul className="max-h-80 divide-y overflow-auto">
                      {result.created.map((c) => (
                        <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-mint-700" aria-hidden />
                          <Link href={`/students/${c.id}`} className="font-semibold hover:text-primary">
                            {c.name}
                          </Link>
                          <span className="tabular text-muted-foreground">{c.admissionNumber}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('How it works')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-2 pl-4">
              <li>{t('Download the template — it lists the exact class names.')}</li>
              <li>{t('Fill one row per child with one guardian. Columns marked * are required.')}</li>
              <li>{t('Validate first to see a row-by-row report, then import.')}</li>
              <li>{t('Add photos, extra guardians and medical details later from each profile.')}</li>
            </ol>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => void api.download('/students/import/template').catch((e) => toast.error(errorMessage(e)))}
            >
              <Download aria-hidden /> {t('Download template')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'mint' | 'coral' }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tone === 'mint' && 'border-mint/40 bg-mint/10',
        tone === 'coral' && 'border-coral/40 bg-coral/10',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular font-heading text-2xl font-extrabold">{value}</p>
    </div>
  );
}
