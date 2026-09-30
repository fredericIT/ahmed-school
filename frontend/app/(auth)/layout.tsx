'use client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookOpen, Music, Palette, Sparkles, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { BackgroundVideo } from '@/components/shared/background-video';
import { Puppy } from '@/components/shared/puppy';
import { t } from '@/lib/i18n';

/** Full-screen classroom video with the school's welcome on the left and the form card on the right. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { data: school } = useQuery({
    queryKey: ['settings-public'],
    queryFn: () => api.get<{ name: string; logo: string | null; motto: string | null }>('/settings/public'),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const name = school?.name ?? 'Little Stars Nursery & Primary School'; // i18n-ignore: the school's name

  return (
    <div className="relative min-h-screen overflow-hidden bg-royal text-white">
      {/* Full-screen classroom video under a colour wash in the school palette. */}
      <BackgroundVideo className="object-[center_40%]" controlClassName="bottom-auto right-5 top-5" />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-br from-royal/75 via-royal/40 to-lavender/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
        <motion.div
          className="absolute left-[8%] top-[18%] hidden lg:block"
          animate={{ y: [0, -12, 0], rotate: [0, 10, 0] }}
          transition={{ duration: 6, repeat: Infinity }}
        >
          <Star className="h-12 w-12 fill-sunny text-sunny drop-shadow" />
        </motion.div>
        <motion.div
          className="absolute left-[44%] top-[14%] hidden lg:block"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 5, repeat: Infinity, delay: 0.5 }}
        >
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <Palette className="h-7 w-7 text-sunny" />
          </div>
        </motion.div>
        <motion.div
          className="absolute bottom-[16%] left-[40%] hidden lg:block"
          animate={{ y: [0, -14, 0] }}
          transition={{ duration: 7, repeat: Infinity, delay: 1 }}
        >
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-mint/85 shadow-lg">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
        </motion.div>
        <motion.div
          className="absolute left-[30%] top-[10%] hidden lg:block"
          animate={{ y: [0, 8, 0], rotate: [0, -8, 0] }}
          transition={{ duration: 5.5, repeat: Infinity }}
        >
          <div className="grid h-12 w-12 place-items-center rounded-full bg-coral shadow-lg">
            <Music className="h-6 w-6 text-white" />
          </div>
        </motion.div>
        {/* Building-block row */}
        <div className="absolute bottom-0 left-0 flex h-16 w-full items-end gap-2 px-6 opacity-80 lg:w-[55%] lg:px-10">
          {['bg-sunny', 'bg-coral', 'bg-mint', 'bg-lavender', 'bg-white/80', 'bg-sunny', 'bg-coral'].map((c, i) => (
            <div
              key={i}
              className={`${c} rounded-t-2xl`}
              style={{ height: `${24 + ((i * 23) % 36)}px`, width: '14%' }}
            />
          ))}
        </div>
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[1.1fr_minmax(0,440px)] lg:py-12">
        <div className="flex flex-col gap-6 lg:gap-10">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/20 backdrop-blur">
              {school?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={school.logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <Sparkles className="h-6 w-6 text-sunny" />
              )}
            </div>
            <p className="font-heading text-lg font-extrabold drop-shadow">{name}</p>
          </div>
          <div className="hidden max-w-lg lg:block">
            <h2 className="font-heading text-5xl font-black leading-tight drop-shadow-md">
              {t('Where little stars learn, play and shine.')}
            </h2>
            <p className="mt-4 text-lg text-white/90 drop-shadow">
              {school?.motto ??
                t('Students, attendance, marks, activities, inventory and the library, all in one friendly place.')}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[t('Baby · Middle · Top Class'), 'P1 · P2', t('Marks & report cards')].map((chip) => (
                <span key={chip} className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold backdrop-blur">
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* The form keeps the app's own colours so fields stay readable in light and dark themes. */}
        <div className="relative w-full pt-20 text-foreground lg:pt-0">
          {/* Star the puppy peeks over the card and waves hello. */}
          <div className="pointer-events-none absolute right-6 top-0 z-0 lg:-top-[7.5rem]" aria-hidden>
            <div className="absolute -left-24 top-6 hidden rounded-2xl rounded-br-sm bg-white px-3 py-1.5 text-sm font-bold text-royal shadow-lift sm:block">
              {t('Hello! 🐾')}
            </div>
            <Puppy wave hearts className="h-32 w-32 lg:h-40 lg:w-40" />
          </div>
          <div className="relative z-10">{children}</div>
        </div>
      </div>
    </div>
  );
}
