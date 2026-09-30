'use client';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

/**
 * Decorative looping classroom video (Mixkit free licence; no sound). It shows the still poster
 * for people who prefer reduced motion, and offers a pause button, since it moves for more than 5 seconds.
 */
export function BackgroundVideo({ className, controlClassName }: { className?: string; controlClassName?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (reduced || paused) v.pause();
    else v.play().catch(() => setPaused(true)); // autoplay refused: leave the poster
  }, [reduced, paused]);

  return (
    <>
      <video
        ref={ref}
        aria-hidden
        tabIndex={-1}
        muted
        loop
        playsInline
        preload="metadata"
        poster="/media/classroom-poster.jpg"
        className={cn('pointer-events-none absolute inset-0 h-full w-full object-cover', className)}
      >
        <source src="/media/classroom.webm" type="video/webm" />
        <source src="/media/classroom.mp4" type="video/mp4" />
      </video>
      {!reduced && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className={cn(
            'absolute bottom-3 right-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
            controlClassName,
          )}
          aria-label={paused ? t('Play background video') : t('Pause background video')}
        >
          {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
        </button>
      )}
    </>
  );
}
