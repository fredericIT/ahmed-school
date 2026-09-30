import { cn } from '@/lib/utils';
import type { Book } from '@/types';
import { t } from '@/lib/i18n';

const COVER_TONES = [
  'from-royal to-lavender',
  'from-coral to-sunny',
  'from-mint to-royal',
  'from-lavender to-coral',
  'from-sunny to-mint',
];

export function BookCover({
  book,
  className,
}: {
  book: Pick<Book, 'id' | 'title' | 'coverImage' | 'author'>;
  className?: string;
}) {
  if (book.coverImage)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={book.coverImage}
        alt={t('Cover of {title}', { title: book.title })}
        className={cn('aspect-[3/4] w-full rounded-xl object-cover shadow-sm', className)}
      />
    );
  return (
    <div
      className={cn(
        'relative flex aspect-[3/4] w-full flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br p-3 text-white shadow-sm',
        COVER_TONES[book.id % COVER_TONES.length],
        className,
      )}
      aria-hidden
    >
      <span className="absolute inset-y-0 left-2 w-1 rounded bg-white/25" />
      <p className="line-clamp-4 pl-3 font-heading text-sm font-extrabold leading-tight drop-shadow">{book.title}</p>
      <p className="line-clamp-1 pl-3 text-[10px] font-semibold opacity-90">{book.author}</p>
    </div>
  );
}
