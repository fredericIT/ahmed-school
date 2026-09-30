import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { BackgroundVideo } from '@/components/shared/background-video';
import { Puppy } from '@/components/shared/puppy';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label={t('Breadcrumb')} className={cn('no-print', className)}>
      <ol className="flex flex-wrap items-center gap-1 text-xs font-medium text-muted-foreground">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 opacity-60" aria-hidden />}
            {c.href ? (
              <Link href={c.href} className="rounded hover:text-foreground">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground/80">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-3', className)}>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-6">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {/* Ink-to-brand blend: premium, and still dark enough to read comfortably. */}
            <h1 className="truncate bg-gradient-to-r from-foreground from-40% to-primary bg-clip-text pb-1 text-3xl font-extrabold leading-tight tracking-[-0.02em] text-transparent sm:text-4xl">
              {title}
            </h1>
            {description && <p className="mt-0.5 text-[15px] text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Colourful gradient banner used at the top of the dashboard and profile pages; `video` plays the classroom clip behind it. */
export function HeroBanner({
  children,
  className,
  video,
  mascot,
}: {
  children: React.ReactNode;
  className?: string;
  video?: boolean;
  /** The waving puppy mascot, sitting on the right of the banner (from medium screens up). */
  mascot?: boolean;
}) {
  return (
    <div
      className={cn('gradient-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-lift sm:p-8', className)}
    >
      {video && (
        <>
          <BackgroundVideo className="object-[center_35%]" />
          {/* Brand colour wash: strong on the left where the text sits, lighter on the right to show the children. */}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-royal/95 via-royal/75 to-lavender/30"
            aria-hidden
          />
        </>
      )}
      {!video && (
        <>
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-16 right-24 h-32 w-32 rounded-full bg-sunny/30"
            aria-hidden
          />
        </>
      )}
      {mascot && (
        <Puppy
          wave
          hearts
          className="pointer-events-none absolute -bottom-2 right-16 hidden h-48 w-44 drop-shadow-lg md:block lg:right-24"
        />
      )}
      <div className={cn('relative', mascot && 'md:pr-52')}>{children}</div>
    </div>
  );
}
