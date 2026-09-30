'use client';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useAuth, type Permission } from '@/lib/auth';
import { t } from '@/lib/i18n';

/** Page-level guard for super-admin screens. The API enforces the same rule. */
export function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { user, isLoading, can } = useAuth();
  if (isLoading || !user) return <Skeleton className="h-64 rounded-2xl" />;
  if (!can(permission))
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title={t('Super admin only')}
          description={t("You don't have permission to view this page. Ask a super administrator if you need access.")}
          action={
            <Button asChild size="sm">
              <Link href="/dashboard">{t('Back to dashboard')}</Link>
            </Button>
          }
        />
      </Card>
    );
  return <>{children}</>;
}
