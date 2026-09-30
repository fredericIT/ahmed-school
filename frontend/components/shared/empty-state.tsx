import { AlertTriangle, Inbox, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Puppy } from '@/components/shared/puppy';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      {/* The puppy naps while there is nothing to show; the icon says what kind of thing is missing. */}
      <div className="relative">
        <div className="absolute inset-x-2 bottom-1 h-6 rounded-full bg-sunny/25 blur-md" aria-hidden />
        <Puppy mood="sleepy" className="relative h-28 w-28" />
        <div className="absolute -right-3 bottom-2 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-royal-50 to-lavender-50 text-primary shadow-sm ring-1 ring-primary/10 dark:from-royal/25 dark:to-lavender/25">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
      <div>
        <p className="font-heading text-lg font-bold">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title={t('Something went wrong')}
      description={message ? t(message) : t('We could not load this data. Please try again.')}
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('Try again')}
          </Button>
        )
      }
    />
  );
}
