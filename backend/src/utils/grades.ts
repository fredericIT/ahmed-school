import type { ClassLevel, Grade } from '@prisma/client';
import { t } from '../i18n';

export const GRADE_ORDER: Grade[] = ['BABY', 'MIDDLE', 'TOP', 'P1', 'P2'];

export const GRADE_INFO: Record<Grade, { label: string; level: ClassLevel; age: number }> = {
  BABY: {
    get label() {
      return t('Baby Class');
    },
    level: 'NURSERY',
    age: 3,
  },
  MIDDLE: {
    get label() {
      return t('Middle Class');
    },
    level: 'NURSERY',
    age: 4,
  },
  TOP: {
    get label() {
      return t('Top Class');
    },
    level: 'NURSERY',
    age: 5,
  },
  P1: {
    get label() {
      return t('Primary 1');
    },
    level: 'PRIMARY',
    age: 6,
  },
  P2: {
    get label() {
      return t('Primary 2');
    },
    level: 'PRIMARY',
    age: 7,
  },
};

/** Next grade on promotion, or null when the child graduates. */
export function nextGrade(g: Grade): Grade | null {
  const i = GRADE_ORDER.indexOf(g);
  return i >= 0 && i < GRADE_ORDER.length - 1 ? GRADE_ORDER[i + 1] : null;
}

/** Suggests the grade matching a child's age (clamped to the school's range). */
export function suggestGrade(age: number): Grade {
  if (age <= 3) return 'BABY';
  if (age >= 7) return 'P2';
  return GRADE_ORDER.find((g) => GRADE_INFO[g].age === age) ?? 'BABY';
}
