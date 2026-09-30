'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTable, type Column } from '@/components/tables/data-table';
import { Field } from '@/components/forms/field';
import { api, errorMessage } from '@/lib/api';
import { t } from '@/lib/i18n';

export interface CrudField {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'email' | 'tel' | 'switch';
  required?: boolean;
  hint?: string;
}

type Row = { id: number } & Record<string, unknown>;

/**
 * Small list + create/edit/delete dialog for reference data (categories, suppliers…).
 * `paginated` switches between plain array and paginated list endpoints.
 */
/** Sentences for one kind of record, written in full so each language can agree in gender and number. */
export interface CrudTexts {
  /** "No courses yet" */
  empty: string;
  /** "New course" */
  add: string;
  /** "Edit course" */
  edit: string;
  /** "Course saved" */
  saved: string;
  /** "Course deleted" */
  deleted: string;
}

export function SimpleCrud<T extends Row>({
  endpoint,
  queryKey,
  fields,
  columns,
  texts,
  icon,
  paginated,
  invalidate = [],
}: {
  endpoint: string;
  queryKey: string;
  fields: CrudField[];
  columns: Column<T>[];
  texts: CrudTexts;
  icon: LucideIcon;
  paginated?: boolean;
  invalidate?: string[];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [queryKey],
    queryFn: async () =>
      paginated
        ? (
            await api.list<T>(endpoint, {
              pageSize: 500,
              sortBy: 'name',
              sortOrder: 'asc',
            })
          ).data
        : api.get<T[]>(endpoint),
  });
  const refresh = () => [queryKey, ...invalidate].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

  const openEditor = (row: T | 'new') => {
    setErrors({});
    setValues(
      Object.fromEntries(
        fields.map((f) => [
          f.name,
          row === 'new'
            ? f.type === 'switch'
              ? false
              : ''
            : ((row[f.name] as string | boolean | null) ?? (f.type === 'switch' ? false : '')),
        ]),
      ),
    );
    setEditing(row);
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.required && !String(values[f.name] ?? '').trim()) errs[f.name] = t('This field is required');
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = Object.fromEntries(
      fields.map((f) => [f.name, f.type === 'switch' ? !!values[f.name] : String(values[f.name] ?? '').trim() || null]),
    );
    setBusy(true);
    try {
      if (editing === 'new') await api.post(endpoint, body);
      else if (editing) await api.patch(`${endpoint}/${editing.id}`, body);
      toast.success(texts.saved);
      refresh();
      setEditing(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const allColumns: Column<T>[] = [
    ...columns,
    {
      key: 'actions',
      header: <span className="sr-only">{t('Actions')}</span>,
      fixed: true,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => openEditor(r)} aria-label={t('Edit')}>
            <Edit />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(r)} aria-label={t('Delete')}>
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={allColumns}
        data={data}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        empty={{ icon, title: texts.empty }}
        toolbar={
          <Button onClick={() => openEditor('new')} size="sm">
            <Plus aria-hidden /> {texts.add}
          </Button>
        }
      />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? texts.add : texts.edit}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {fields.map((f) =>
              f.type === 'switch' ? (
                <label key={f.name} className="flex items-center justify-between gap-4 rounded-xl border p-3">
                  <span>
                    <span className="block text-sm font-semibold">{f.label}</span>
                    {f.hint && <span className="text-xs text-muted-foreground">{f.hint}</span>}
                  </span>
                  <Switch
                    checked={!!values[f.name]}
                    onCheckedChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
                  />
                </label>
              ) : (
                <Field
                  key={f.name}
                  label={f.label}
                  htmlFor={`crud-${f.name}`}
                  required={f.required}
                  error={errors[f.name]}
                  hint={f.hint}
                >
                  {f.type === 'textarea' ? (
                    <Textarea
                      id={`crud-${f.name}`}
                      rows={3}
                      value={String(values[f.name] ?? '')}
                      onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={`crud-${f.name}`}
                      type={f.type ?? 'text'}
                      value={String(values[f.name] ?? '')}
                      onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
                      aria-invalid={!!errors[f.name]}
                    />
                  )}
                </Field>
              ),
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                {t('Cancel')}
              </Button>
              <Button type="submit" loading={busy}>
                {t('Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('Delete {name}?', { name: String(deleting?.name ?? '') })}
        confirmLabel={t('Delete')}
        onConfirm={async () => {
          try {
            await api.delete(`${endpoint}/${deleting?.id}`);
            toast.success(texts.deleted);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}
