'use client';
import { useId } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Apple,
  Award,
  Backpack,
  BarChart3,
  Bell,
  Bike,
  Bookmark,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  BookOpenText,
  Boxes,
  Calculator,
  CalendarCheck,
  Carrot,
  CircleCheck,
  Clock,
  ClipboardList,
  Drama,
  FileText,
  FlaskConical,
  Glasses,
  GraduationCap,
  Heart,
  KeyRound,
  Languages,
  Library,
  type LucideIcon,
  Medal,
  Milk,
  Music,
  Package,
  Palette,
  PartyPopper,
  PawPrint,
  Pencil,
  PencilLine,
  PieChart,
  Presentation,
  Puzzle,
  Ruler,
  School,
  Settings,
  Shapes,
  Shield,
  Smile,
  Sparkles,
  Star,
  Sun,
  ToyBrick,
  TrendingUp,
  Trophy,
  UserCog,
} from 'lucide-react';

/**
 * A background that matches each section: a light pattern of related drawings in the section's colour,
 * one large faint drawing in the top corner, and a soft glow. Cards stay solid on top, so text is unaffected.
 */
interface Theme {
  /** The large corner drawing, then the pattern drawings. */
  icons: LucideIcon[];
  color: string;
}

const ROYAL = '#4F6BED';
const CORAL = '#FF7A6B';
const LAVENDER = '#9B8CFF';
const MINT = '#2FB67C';
const SUNNY = '#E0A800';

const THEMES: Record<string, Theme> = {
  home: { icons: [PawPrint, Heart, Star, Sparkles, Smile, Sun], color: CORAL },
  students: {
    icons: [Backpack, Pencil, Smile, Shapes, Ruler, Heart],
    color: CORAL,
  },
  classes: {
    icons: [School, ToyBrick, Shapes, Bell, Puzzle, Pencil],
    color: LAVENDER,
  },
  teachers: {
    icons: [GraduationCap, Apple, Presentation, BookOpenText, Pencil, Star],
    color: ROYAL,
  },
  courses: {
    icons: [BookOpenCheck, Calculator, Languages, Palette, FlaskConical, Music],
    color: SUNNY,
  },
  attendance: {
    icons: [CalendarCheck, CircleCheck, Clock, Sun, Backpack, Bell],
    color: MINT,
  },
  marks: {
    icons: [Trophy, Star, Award, PencilLine, Medal, Sparkles],
    color: CORAL,
  },
  activities: {
    icons: [PartyPopper, Music, Palette, Drama, Bike, Sun],
    color: SUNNY,
  },
  inventory: {
    icons: [Package, Boxes, ClipboardList, Apple, Carrot, Milk],
    color: ROYAL,
  },
  library: {
    icons: [BookOpen, Library, BookMarked, Bookmark, Glasses, Star],
    color: CORAL,
  },
  reports: {
    icons: [BarChart3, PieChart, TrendingUp, FileText, ClipboardList, Star],
    color: MINT,
  },
  admin: {
    icons: [Settings, Shield, KeyRound, UserCog, ClipboardList, Star],
    color: LAVENDER,
  },
};

const SECTION_OF: Record<string, string> = {
  dashboard: 'home',
  profile: 'home',
  'my-classes': 'classes',
  students: 'students',
  classes: 'classes',
  teachers: 'teachers',
  courses: 'courses',
  attendance: 'attendance',
  marks: 'marks',
  activities: 'activities',
  inventory: 'inventory',
  library: 'library',
  reports: 'reports',
  users: 'admin',
  settings: 'admin',
  'audit-logs': 'admin',
};

// Drawings in one 260px tile: x, y, size, rotation. Offset rows avoid a stiff grid look.
const SPOTS: [number, number, number, number][] = [
  [18, 22, 30, -12],
  [138, 14, 24, 10],
  [80, 100, 34, 6],
  [200, 118, 26, -8],
  [26, 178, 24, 14],
  [148, 200, 30, -4],
];

export function sectionFor(pathname: string, focus: string | null): string {
  const first = pathname.split('/')[1] ?? '';
  // Dashboard overviews of one area wear that area's background.
  if (first === 'dashboard' && focus && THEMES[focus]) return focus;
  return SECTION_OF[first] ?? 'home';
}

export function SectionBackdrop() {
  const pathname = usePathname();
  const params = useSearchParams();
  const section = sectionFor(pathname, params.get('focus'));
  const theme = THEMES[section];
  const id = useId().replace(/:/g, '');
  const Big = theme.icons[0];
  const pattern = theme.icons.slice(1);

  return (
    <div
      className="no-print pointer-events-none absolute inset-0 -z-10 overflow-clip"
      aria-hidden
      data-section={section}
    >
      {/* Sticks to the screen, so the background stays still while the page scrolls. */}
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Soft glow in the section colour */}
        <div
          className="absolute -right-24 -top-40 h-[30rem] w-[44rem] rounded-full opacity-[0.16] blur-3xl dark:opacity-[0.12]"
          style={{ background: theme.color }}
        />
        {/* Pattern of related drawings */}
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.14] dark:opacity-[0.10]"
          style={{ color: theme.color }}
        >
          <defs>
            <pattern id={`bg-${id}`} width={260} height={260} patternUnits="userSpaceOnUse">
              {SPOTS.map(([x, y, size, rot], i) => {
                const Icon = pattern[i % pattern.length];
                return (
                  <g key={i} transform={`rotate(${rot} ${x + size / 2} ${y + size / 2})`}>
                    <Icon x={x} y={y} width={size} height={size} strokeWidth={1.8} />
                  </g>
                );
              })}
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#bg-${id})`} />
        </svg>
        {/* One large drawing in the corner, the section's symbol */}
        <Big
          className="absolute -right-10 top-24 h-80 w-80 -rotate-12 opacity-[0.10] dark:opacity-[0.07] lg:h-[26rem] lg:w-[26rem]"
          style={{ color: theme.color }}
          strokeWidth={1.2}
        />
      </div>
    </div>
  );
}
