'use client';
import { Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, MoreHorizontal, Plus, Power, Trash2, UserCog, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/misc';
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
import { RequirePermission } from '@/components/shared/require';
import { DataTable, type Column } from '@/components/tables/data-table';
import { SearchInput } from '@/components/forms/search-input';
import { Field, FilterSelect, SelectField } from '@/components/forms/field';
import { useListParams } from '@/hooks/use-list-params';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, fullName } from '@/lib/utils';
import { passwordSchema } from '@/lib/validation';
import type { User } from '@/types';
import { msg, t } from '@/lib/i18n';

const FILTERS = ['role', 'isActive'] as const;

const baseSchema = z.object({
  firstName: z.string().trim().min(1, msg('Required')),
  lastName: z.string().trim().min(1, msg('Required')),
  email: z.string().trim().email(msg('Invalid email')),
  phone: z.string().trim().optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN']),
  password: z.string().optional(),
});

function UsersInner() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const list = useListParams(FILTERS, { sortBy: 'createdAt' });
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', list.query],
    queryFn: () => api.list<User>('/users', list.query),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['users'] });

  const toggle = async (u: User) => {
    try {
      await api.patch(`/users/${u.id}/status`, { isActive: !u.isActive });
      toast.success(
        u.isActive
          ? t('{firstName} deactivated', { firstName: u.firstName })
          : t('{firstName} activated', { firstName: u.firstName }),
      );
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: t('User'),
      fixed: true,
      sortKey: 'firstName',
      cell: (u) => (
        <div className="flex items-center gap-3">
          <UserAvatar src={u.avatar} name={fullName(u)} size="sm" />
          <div>
            <p className="font-semibold">
              {fullName(u)}{' '}
              {u.id === me?.id && <span className="text-xs font-normal text-muted-foreground">{t('(you)')}</span>}
            </p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('Role'),
      sortKey: 'role',
      cell: (u) => <StatusBadge status={u.role} label={u.role === 'SUPER_ADMIN' ? t('Super admin') : t('Admin')} />,
    },
    { key: 'phone', header: t('Phone'), cell: (u) => u.phone ?? '—' },
    {
      key: 'status',
      header: t('Status'),
      cell: (u) => <StatusBadge status={u.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'lastLogin',
      header: t('Last sign-in'),
      sortKey: 'lastLoginAt',
      cell: (u) => (
        <span className="text-sm text-muted-foreground">
          {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t('Never')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('Actions')}</span>,
      fixed: true,
      align: 'right',
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('Actions for {name}', { name: fullName(u) })}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(u)}>
              <Edit /> {t('Edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setResetting(u)}>
              <KeyRound /> {t('Reset password')}
            </DropdownMenuItem>
            {u.id !== me?.id && (
              <>
                <DropdownMenuItem onSelect={() => void toggle(u)}>
                  <Power /> {u.isActive ? t('Deactivate') : t('Activate')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setDeleting(u)}>
                  <Trash2 /> {t('Delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Users')}
        description={t('Staff accounts that can sign in. There must always be at least one active super admin.')}
        icon={<UserCog />}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> {t('New user')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data?.data}
        rowKey={(u) => u.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        meta={data?.meta}
        onPageChange={list.setPage}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        onSortChange={list.setSort}
        toolbar={
          <>
            <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('Name or email…')} />
            <FilterSelect
              value={list.filters.role}
              onChange={(v) => list.setFilter('role', v)}
              placeholder={t('Role')}
              allLabel={t('All roles')}
              options={[
                { value: 'SUPER_ADMIN', label: t('Super admin') },
                { value: 'ADMIN', label: t('Admin') },
              ]}
              className="sm:w-40"
            />
            <FilterSelect
              value={list.filters.isActive}
              onChange={(v) => list.setFilter('isActive', v)}
              placeholder={t('Status')}
              allLabel={t('Any status')}
              options={[
                { value: 'true', label: t('Active') },
                { value: 'false', label: t('Inactive') },
              ]}
              className="sm:w-40"
            />
          </>
        }
      />
      {editing && (
        <UserDialog
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {resetting && <ResetDialog user={resetting} onClose={() => setResetting(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('Delete {name}?', { name: deleting ? fullName(deleting) : '' })}
        description={t('The account is disabled and hidden. Their past actions remain in the audit log.')}
        confirmLabel={t('Delete user')}
        onConfirm={async () => {
          try {
            await api.delete(`/users/${deleting?.id}`);
            toast.success(t('User deleted'));
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}

function UserDialog({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: User | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const schema = user ? baseSchema : baseSchema.extend({ password: passwordSchema });
  const { register, handleSubmit, control, formState } = useForm<z.infer<typeof baseSchema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      role: user?.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN',
      password: '',
    },
  });
  const e = formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? t('Edit {name}', { name: fullName(user) }) : t('New staff user')}</DialogTitle>
          {!user && (
            <DialogDescription>
              {t('Share the temporary password securely and ask them to change it after signing in.')}
            </DialogDescription>
          )}
        </DialogHeader>
        <form
          noValidate
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit(async (v) => {
            try {
              if (user) {
                const { password: _p, ...rest } = v;
                await api.patch(`/users/${user.id}`, {
                  ...rest,
                  phone: v.phone || null,
                });
              } else await api.post('/users', { ...v, phone: v.phone || null });
              toast.success(user ? t('User updated') : t('User created'));
              onSaved();
              onClose();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          })}
        >
          <Field label={t('First name')} htmlFor="u-first" required error={e.firstName}>
            <Input id="u-first" {...register('firstName')} />
          </Field>
          <Field label={t('Last name')} htmlFor="u-last" required error={e.lastName}>
            <Input id="u-last" {...register('lastName')} />
          </Field>
          <Field label={t('Email')} htmlFor="u-email" required error={e.email} className="sm:col-span-2">
            <Input id="u-email" type="email" autoComplete="off" {...register('email')} />
          </Field>
          <Field label={t('Phone')} htmlFor="u-phone">
            <Input id="u-phone" type="tel" {...register('phone')} />
          </Field>
          <SelectField
            control={control}
            name="role"
            label={t('Role')}
            disabled={isSelf}
            options={[
              { value: 'ADMIN', label: t('Admin') },
              { value: 'SUPER_ADMIN', label: t('Super admin') },
            ]}
          />
          {!user && (
            <Field
              label={t('Temporary password')}
              htmlFor="u-pass"
              required
              error={e.password}
              className="sm:col-span-2"
              hint={t('8+ characters with upper, lower case and a number')}
            >
              <Input id="u-pass" type="password" autoComplete="new-password" {...register('password')} />
            </Field>
          )}
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

function ResetDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Reset password')}</DialogTitle>
          <DialogDescription>
            {t('Set a new temporary password for {name}. All their sessions will be signed out.', {
              name: fullName(user),
            })}
          </DialogDescription>
        </DialogHeader>
        <Field label={t('New password')} htmlFor="rp" error={err}>
          <Input
            id="rp"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              const r = passwordSchema.safeParse(pw);
              if (!r.success) return setErr(r.error.issues[0].message);
              setBusy(true);
              try {
                await api.post(`/users/${user.id}/reset-password`, {
                  newPassword: pw,
                });
                toast.success(t('Password reset'));
                onClose();
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Reset password')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  return (
    <RequirePermission permission="users.manage">
      <Suspense>
        <UsersInner />
      </Suspense>
    </RequirePermission>
  );
}
